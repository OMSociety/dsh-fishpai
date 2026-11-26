import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { checkDelivery, describeDelivery } from '../plugin/core/wechat-lint.mjs'
import { browserCandidates, findBrowser, captureArticle, staticLayoutDigest, describeLayout } from '../plugin/host/screenshot.mjs'

test('交付质检：结构问题阻断，对比度只提示', () => {
  const blocked = checkDelivery('<section><div class="raw"><span>文字</span></div></section>')
  assert.equal(blocked.ok, false)
  assert.ok(blocked.blockers.some((item) => item.rule === 'forbidden-tag'))
  assert.match(describeDelivery(blocked), /^交付质检未通过/)

  const pale = checkDelivery('<section style="background-color:#ffffff;"><p style="color:#cccccc;"><span>浅色正文</span></p></section>')
  assert.equal(pale.ok, true)
  assert.ok(pale.notices.contrast > 0)
  assert.match(describeDelivery(pale), /交付质检通过；提示：.*对比度/)
})

test('浏览器发现：环境变量优先，三平台各有候选', () => {
  const env = { FISHPAI_BROWSER: '/opt/custom/chrome', PROGRAMFILES: 'C:\\Program Files', PATH: '/usr/bin' }
  const win = browserCandidates({ env, platform: 'win32', home: 'C:\\Users\\u' })
  assert.equal(win[0], '/opt/custom/chrome')
  assert.ok(win.some((file) => file.endsWith('chrome.exe')))
  assert.ok(win.some((file) => file.endsWith('msedge.exe')))
  const mac = browserCandidates({ env: {}, platform: 'darwin', home: '/Users/u' })
  assert.ok(mac.some((file) => file.includes('Microsoft Edge.app')))
  assert.ok(mac.some((file) => file.startsWith(path.join('/Users/u', 'Applications'))))
  const linux = browserCandidates({ env: { PATH: '/usr/bin:/snap/bin' }, platform: 'linux' })
  assert.ok(linux.includes(path.join('/usr/bin', 'chromium')))
  assert.ok(linux.includes(path.join('/usr/bin', 'microsoft-edge')))
  const found = findBrowser({ env: { PATH: '/usr/bin' }, platform: 'linux', exists: (file) => file === path.join('/usr/bin', 'chromium') })
  assert.equal(found, path.join('/usr/bin', 'chromium'))
  assert.equal(findBrowser({ env: {}, platform: 'linux', exists: () => false }), null)
})

test('截图：无浏览器与组件不可用时返回原因，不抛错', async () => {
  const none = await captureArticle({ html: '<p>x</p>', outDir: '.', baseName: 'x', browser: null })
  assert.equal(none.performed, false)
  assert.match(none.reason, /FISHPAI_BROWSER/)
  const broken = await captureArticle({ html: '<p>x</p>', outDir: '.', baseName: 'x', browser: '/fake', loadChromium: async () => { throw new Error('缺少模块') } })
  assert.equal(broken.performed, false)
  assert.match(broken.reason, /缺少模块/)
  const failed = await captureArticle({
    html: '<p>x</p>', outDir: '.', baseName: 'x', browser: '/fake',
    loadChromium: async () => ({ launch: async () => { throw new Error('启动失败') } }),
  })
  assert.equal(failed.performed, false)
  assert.match(failed.reason, /启动失败/)
})

test('版面摘要：文字版统计宽度与图形，截图版列出溢出与坏图', () => {
  const digest = staticLayoutDigest('<section style="width:600px;max-width:677px;"><img src="a.png"><svg></svg></section>')
  assert.match(digest, /图片 1 张，SVG 1 个/)
  assert.match(digest, /固定宽度超过 375px 的声明 1 处（最大 600px）/)
  const text = describeLayout({ height: 900, overflow: ['table（右缘 420px）'], brokenImages: ['b.png'], images: 2, svgs: 0 })
  assert.match(text, /超出手机宽度：table/)
  assert.match(text, /未加载成功的图片：b\.png/)
})
