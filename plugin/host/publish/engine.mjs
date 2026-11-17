import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export class LoginRequiredError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LoginRequiredError'
  }
}

export function defaultDataDir() {
  return path.join(os.homedir(), '.dsh', 'fishpai')
}

function findExecutable(root) {
  const names = process.platform === 'win32' ? new Set(['chrome.exe', 'headless_shell.exe']) : new Set(['chrome', 'headless_shell'])
  function walk(directory, depth) {
    if (depth < 0 || !fs.existsSync(directory)) return null
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const abs = path.join(directory, entry.name)
      if (entry.isFile() && names.has(entry.name)) return abs
      if (entry.isDirectory()) {
        const found = walk(abs, depth - 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(root, 5)
}

export function playwrightCliPath() {
  // playwright-core 的 exports 只公开 package.json；CLI 入口由包内 bin 字段固定为 cli.js。
  return path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js')
}

function installWithCli(browserDir) {
  const cli = playwrightCliPath()
  fs.mkdirSync(browserDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserDir },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Chromium 下载失败（${signal || `exit ${code}`}）`))
    })
  })
}

/** 发布浏览器只使用本机 Chrome、Windows Edge 或插件数据区里的 Chromium。 */
export class BrowserEngine {
  constructor({ dataDir = defaultDataDir(), playwright = null, install = null, platform = process.platform, executable = findExecutable } = {}) {
    this.browserDir = path.join(dataDir, 'browsers')
    this.playwright = playwright
    this.install = install
    this.platform = platform
    this.executable = executable
  }

  async chromium() {
    if (!this.playwright) this.playwright = (await import('playwright-core')).chromium
    return this.playwright
  }

  async launch({ headless = false, onDownload = () => {} } = {}) {
    const chromium = await this.chromium()
    const attempts = [{ channel: 'chrome', headless }]
    if (this.platform === 'win32') attempts.push({ channel: 'msedge', headless })
    const failures = []
    for (const options of attempts) {
      try {
        return await chromium.launch(options)
      } catch (error) {
        failures.push(`${options.channel}: ${error.message}`)
      }
    }
    let executablePath = this.executable(this.browserDir)
    if (!executablePath) {
      onDownload(`未找到可用的本机 Chrome${this.platform === 'win32' ? ' / Edge' : ''}，现下载 Chromium（约 170 MB）到用户插件数据区：${this.browserDir}`)
      await (this.install ? this.install(this.browserDir) : installWithCli(this.browserDir))
      executablePath = this.executable(this.browserDir)
    }
    if (!executablePath) throw new Error(`Chromium 已执行安装，但未在 ${this.browserDir} 找到浏览器可执行文件`)
    try {
      return await chromium.launch({ headless, executablePath })
    } catch (error) {
      throw new Error(`发布浏览器启动失败：${error.message}；本机通道：${failures.join(' | ')}`)
    }
  }
}
