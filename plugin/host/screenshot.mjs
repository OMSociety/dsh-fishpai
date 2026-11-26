/**
 * 审稿截图：用本机 Chromium 内核浏览器按 375px 手机宽度截取成稿的普通与深色两种视图。
 *
 * 浏览器发现顺序：FISHPAI_BROWSER → Chrome → Edge → Chromium（Windows / macOS / Linux 各自的安装位置）。
 * 找不到浏览器或启动失败时返回 `performed:false` 与原因，调用方改用文字版面摘要继续审稿。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { toWechatDark, DARK_CONSTANTS } from '../core/dark-preview.mjs'

export const MOBILE_WIDTH = 375

function windowsCandidates(env) {
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)
  const out = []
  for (const root of roots) out.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  for (const root of roots) out.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  for (const root of roots) out.push(path.join(root, 'Chromium', 'Application', 'chrome.exe'))
  return out
}

function macCandidates(home) {
  const apps = [
    ['Google Chrome.app', 'Google Chrome'],
    ['Microsoft Edge.app', 'Microsoft Edge'],
    ['Chromium.app', 'Chromium'],
  ]
  const out = []
  for (const [app, bin] of apps) {
    out.push(path.join('/Applications', app, 'Contents', 'MacOS', bin))
    out.push(path.join(home, 'Applications', app, 'Contents', 'MacOS', bin))
  }
  return out
}

const LINUX_COMMANDS = ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser']

function linuxCandidates(env) {
  const dirs = String(env.PATH || '/usr/bin:/usr/local/bin').split(':').filter(Boolean)
  const out = []
  for (const name of LINUX_COMMANDS) for (const dir of dirs) out.push(path.join(dir, name))
  out.push('/snap/bin/chromium')
  return out
}

/** 按平台列出浏览器候选路径（含环境变量指定的路径），供发现与报错复用。 */
export function browserCandidates({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const list = []
  if (env.FISHPAI_BROWSER) list.push(env.FISHPAI_BROWSER)
  if (platform === 'win32') list.push(...windowsCandidates(env))
  else if (platform === 'darwin') list.push(...macCandidates(home))
  else list.push(...linuxCandidates(env))
  return list
}

/** 返回第一个存在的浏览器可执行文件路径；都不存在时返回 null。 */
export function findBrowser(options = {}) {
  const exists = options.exists || ((file) => {
    try {
      return fs.statSync(file).isFile()
    } catch {
      return false
    }
  })
  for (const file of browserCandidates(options)) if (exists(file)) return file
  return null
}

export function noBrowserReason(platform = process.platform) {
  const hint = platform === 'win32'
    ? '安装 Chrome 或 Edge'
    : platform === 'darwin'
      ? '安装 Chrome、Edge 或 Chromium 到「应用程序」'
      : '安装 google-chrome 或 chromium 并确保在 PATH 中'
  return `本机未找到 Chromium 内核浏览器（${hint}，或用环境变量 FISHPAI_BROWSER 指向浏览器可执行文件）`
}

function pageHtml(body, background) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${MOBILE_WIDTH}"><style>html,body{margin:0;padding:0;background:${background};}body{padding:16px;box-sizing:border-box;}img{max-width:100%;}</style></head><body>${body}</body></html>`
}

/** 页内采集的版面摘要：页高、超出手机宽度的元素、未加载成功的图片。 */
function collectLayout(width) {
  const overflow = []
  for (const el of document.body.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.right > width + 1 && overflow.length < 10) overflow.push(`${el.tagName.toLowerCase()}（右缘 ${Math.round(rect.right)}px）`)
  }
  const brokenImages = [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => (img.getAttribute('src') || '').slice(0, 80))
  return {
    height: Math.round(document.documentElement.scrollHeight),
    overflow,
    brokenImages,
    images: document.images.length,
    svgs: document.querySelectorAll('svg').length,
  }
}

export function describeLayout(layout) {
  const lines = [`页高约 ${layout.height}px（手机宽 ${MOBILE_WIDTH}px），图片 ${layout.images} 张，SVG ${layout.svgs} 个。`]
  lines.push(layout.overflow.length ? `超出手机宽度：${layout.overflow.join('、')}` : '无元素超出手机宽度。')
  lines.push(layout.brokenImages.length ? `未加载成功的图片：${layout.brokenImages.join('、')}` : '图片均已加载。')
  return lines.join('\n')
}

function isRoot() {
  try {
    return typeof process.getuid === 'function' && process.getuid() === 0
  } catch {
    return false
  }
}

/**
 * 截取成稿的普通与深色视图。
 * @returns {Promise<{performed:boolean, reason?:string, browser?:string, shots:{mode:string,path:string}[], layout?:object}>}
 */
export async function captureArticle({ html, outDir, baseName, browser = findBrowser(), loadChromium }) {
  if (!browser) return { performed: false, reason: noBrowserReason(), shots: [] }
  let chromium
  try {
    chromium = loadChromium ? await loadChromium() : (await import('playwright-core')).chromium
  } catch (error) {
    return { performed: false, reason: `截图组件不可用（${error.message}）`, shots: [] }
  }
  let instance = null
  try {
    instance = await chromium.launch({
      executablePath: browser,
      headless: true,
      args: process.platform === 'linux' && isRoot() ? ['--no-sandbox'] : [],
    })
    const page = await instance.newPage({ viewport: { width: MOBILE_WIDTH, height: 812 }, deviceScaleFactor: 2 })
    fs.mkdirSync(outDir, { recursive: true })
    const shots = []
    let layout = null
    for (const mode of ['light', 'dark']) {
      const body = mode === 'dark' ? toWechatDark(html) : html
      await page.setContent(pageHtml(body, mode === 'dark' ? DARK_CONSTANTS.DEFAULT_DARK_BGCOLOR : '#ffffff'), { waitUntil: 'load', timeout: 20000 })
      if (!layout) layout = await page.evaluate(collectLayout, MOBILE_WIDTH)
      const file = path.join(outDir, `${baseName}-${mode}.png`)
      await page.screenshot({ path: file, fullPage: true })
      shots.push({ mode, path: file })
    }
    return { performed: true, browser, shots, layout }
  } catch (error) {
    return { performed: false, reason: `浏览器截图失败（${error.message}）`, browser, shots: [] }
  } finally {
    await instance?.close().catch(() => {})
  }
}

/** 浏览器不可用时的文字版面摘要：基于 HTML 字符串统计，不做布局计算。 */
export function staticLayoutDigest(html) {
  const source = String(html || '')
  const images = (source.match(/<img\b/gi) || []).length
  const svgs = (source.match(/<svg\b/gi) || []).length
  const wide = [...source.matchAll(/(?:^|[;"\s])(?:min-)?width\s*:\s*(\d{3,})px/gi)].map((m) => Number(m[1])).filter((n) => n > MOBILE_WIDTH)
  return [
    `图片 ${images} 张，SVG ${svgs} 个。`,
    wide.length ? `固定宽度超过 ${MOBILE_WIDTH}px 的声明 ${wide.length} 处（最大 ${Math.max(...wide)}px），手机上可能横向溢出。` : `无超过 ${MOBILE_WIDTH}px 的固定宽度声明。`,
  ].join('\n')
}
