/**
 * 构建 README 正式面板预览：生成 fixture、打包自包含 HTML，并用本机 Chrome 截图。
 */
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createPreviewFixture } from './preview/fixture.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_DIR = path.join(ROOT, 'docs', 'preview')
const FIXTURE = path.join(PREVIEW_DIR, 'fixture.json')
const ENTRY = path.join(ROOT, 'scripts', 'preview', 'main.tsx')
const OUT = path.join(PREVIEW_DIR, 'panel.html')
const SCREENSHOT = path.join(ROOT, 'docs', 'panel-preview.png')
const VIEWPORT = { width: 560, height: 1000 }
const DEVICE_SCALE_FACTOR = 2

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === 'win32' && path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform === 'linux' && '/usr/bin/google-chrome',
  ].filter(Boolean)
  const executable = candidates.find((candidate) => fs.existsSync(candidate))
  if (!executable) throw new Error('找不到本机 Google Chrome；可通过 CHROME_PATH 指定 chrome.exe')
  return executable
}

async function captureScreenshot() {
  const executablePath = chromeExecutable()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-dev-shm-usage'],
  })
  const pageErrors = []
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      colorScheme: 'dark',
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const url = `${pathToFileURL(OUT).href}#theme=dark`
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => document.documentElement.dataset.previewReady === 'true', null, { timeout: 15000 })
    await page.frameLocator('.fp-preview').locator('body > section').first().waitFor({ timeout: 5000 })
    const expander = page.frameLocator('.fp-preview').locator('svg[role="button"]').first()
    await expander.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(100)
    const before = await expander.boundingBox()
    if (!before) throw new Error('展开组件在预览中不可见')
    await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2)
    await page.waitForTimeout(500)
    const after = await expander.boundingBox()
    if (!after || after.height <= before.height) {
      throw new Error(`展开组件点击后高度未增长：${before?.height} → ${after?.height}`)
    }
    console.log(`[build-preview] 展开交互 ${before.height} → ${after.height}`)
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.documentElement.dataset.previewReady === 'true', null, { timeout: 15000 })
    await page.frameLocator('.fp-preview').locator('body > section').first().waitFor({ timeout: 5000 })
    await page.screenshot({ path: SCREENSHOT, fullPage: false })
    if (pageErrors.length) throw new Error(`预览页面脚本错误：${pageErrors.join('；')}`)
  } catch (error) {
    const details = pageErrors.length ? `；页面错误：${pageErrors.join('；')}` : ''
    throw new Error(`Chrome 预览截图失败${details}`, { cause: error })
  } finally {
    await browser.close()
  }

  const png = fs.readFileSync(SCREENSHOT)
  if (png.length < 24 || png.toString('ascii', 1, 4) !== 'PNG') throw new Error('截图产物不是有效 PNG')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  console.log(`[build-preview] Chrome ${browser.version()} → docs/panel-preview.png（${width}×${height}）`)
}

fs.mkdirSync(PREVIEW_DIR, { recursive: true })
const fixture = createPreviewFixture()
fs.writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
console.log(`[build-preview] renderXiumi → docs/preview/fixture.json（${fixture.render.componentCount} 个专业组件）`)

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  charset: 'utf8',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
})
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>鱼排 FishPai · 正式面板预览</title>
</head>
<body>
  <div id="root"></div>
  <script>${script}</script>
</body>
</html>
`
fs.writeFileSync(OUT, html, 'utf8')
console.log(`[build-preview] 正式 Panel + store + CSS → docs/preview/panel.html（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`)

await captureScreenshot()
