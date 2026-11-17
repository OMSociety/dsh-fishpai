import test from 'node:test'
import assert from 'node:assert/strict'
import { INTERACTIVE_COMPONENTS, INTERACTIVE_DIRECTIVES } from '../plugin/core/xiumi/interactive.mjs'
import { renderXiumi, renderXiumiPublish, componentsFromMarkdown } from '../plugin/core/xiumi/index.mjs'
import { lintWechatHtml } from '../plugin/core/wechat-lint.mjs'

test('交互组件：8 个 wc_* 组件与指令映射齐备', () => {
  assert.deepEqual(
    Object.keys(INTERACTIVE_COMPONENTS).sort(),
    ['wc_expand', 'wc_swap', 'wc_swiper', 'wc_spotlight', 'wc_danmaku', 'wc_progress', 'wc_timeline', 'wc_compare'].sort(),
  )
  assert.deepEqual(
    Object.keys(INTERACTIVE_DIRECTIVES).sort(),
    ['expand', 'swap', 'swiper', 'spotlight', 'danmaku', 'progress', 'timeline', 'compare'].sort(),
  )
})

test('交互组件：::: 指令解析成各自 props', () => {
  const expand = componentsFromMarkdown(':::expand\n封面\n---\n展开内容\n:::')
  assert.equal(expand[0].type, 'expand')
  const progress = componentsFromMarkdown(':::progress\n70\n:::')
  assert.deepEqual(progress[0], { type: 'progress', percent: 70, label: '' })
  const timeline = componentsFromMarkdown(':::timeline\n2024 · 甲\n2025 · 乙\n:::')
  assert.equal(timeline[0].type, 'timeline')
  assert.equal(timeline[0].items.length, 2)
  const danmaku = componentsFromMarkdown(':::danmaku\n弹幕一\n弹幕二\n:::')
  assert.deepEqual(danmaku[0], { type: 'danmaku', lines: ['弹幕一', '弹幕二'] })
  const swiper = componentsFromMarkdown(':::swiper\nhttps://a.com/1.png\nhttps://a.com/2.png\n:::')
  assert.deepEqual(swiper[0].images, ['https://a.com/1.png', 'https://a.com/2.png'])
})

test('交互组件：SMIL 用 begin="click" 触发，无 id/class/CSS 动画', () => {
  const out = renderXiumi(':::expand\n点\n---\n内容\n:::\n\n:::danmaku\n弹幕\n:::')
  assert.match(out.html, /begin="click"/)
  assert.match(out.html, /animateTransform/)
  assert.ok(!/\sid=/.test(out.html), '不得含 id 属性')
  assert.ok(!/\sclass=/.test(out.html), '不得含 class 属性')
  assert.ok(!/@keyframes/.test(out.html), '不得含 @keyframes')
  assert.ok(!/style="[^"]*\banimation:/.test(out.html), '不得含 CSS animation')
  assert.ok(!/style="[^"]*\btransition:/.test(out.html), '不得含 CSS transition')
})

test('交互组件：渐变横幅不再依赖 id 渐变引用', () => {
  const out = renderXiumi(':::gradient_banner\n标题\n:::')
  assert.ok(!/url\(#/.test(out.html), '不得含 url(#…) 渐变引用（微信剥 id 会失效）')
  assert.ok(!/<defs>/.test(out.html), '不得含 <defs>')
})

test('交互组件：预览不包 span，发布形态包裹文本节点', () => {
  const md = '# 标题\n\n正文文字\n\n:::expand\n点\n---\n内容\n:::'
  const preview = renderXiumi(md)
  const publish = renderXiumiPublish(md)
  assert.ok(!/<h1[^>]*><span>/.test(preview.html), '预览保持原始产物')
  assert.match(publish.html, /<h1[^>]*><span>标题<\/span>/, '发布形态包裹标题文本')
  // SVG 的 <text> 不得被包进 span。
  assert.ok(!/<text[^>]*><span>/.test(publish.html), 'SVG <text> 不包 span')
})

test('交互组件：发布形态 lint 无 text-wrapping 错误', () => {
  const md = '# 标题\n\n正文\n\n:::expand\n点\n---\n内容\n:::\n\n:::timeline\n2024 · 甲\n:::\n\n:::progress\n60\n:::'
  const lint = lintWechatHtml(renderXiumiPublish(md).html)
  const wrapping = lint.errors.filter((e) => e.rule === 'text-wrapping')
  assert.equal(wrapping.length, 0, `不应有 text-wrapping：${JSON.stringify(wrapping)}`)
})

test('lint：禁用 CSS 动画/过渡与 @keyframes', () => {
  assert.ok(lintWechatHtml('<p style="color:#111;animation:fade 1s;">x</p>').errors.some((e) => e.rule === 'css-animation'))
  assert.ok(lintWechatHtml('<p style="color:#111;transition:all .3s;">x</p>').errors.some((e) => e.rule === 'css-animation'))
  assert.ok(lintWechatHtml('<style>@keyframes fade{from{opacity:0}}</style>').errors.some((e) => e.rule === 'css-animation'))
})

test('lint：SMIL 在 height/width 上的 indefinite 循环被告警', () => {
  const bad = '<svg><rect><animate attributeName="height" from="0" to="10" repeatCount="indefinite"/></rect></svg>'
  assert.ok(lintWechatHtml(bad).errors.some((e) => e.rule === 'smil-loop'))
  const good = '<svg><rect><animateTransform attributeName="transform" type="translate" from="0 0" to="10 0" repeatCount="indefinite"/></rect></svg>'
  assert.ok(!lintWechatHtml(good).errors.some((e) => e.rule === 'smil-loop'))
})

test('交互组件：进度条百分比收敛到 0–100', () => {
  assert.match(renderXiumi(':::progress\n70\n:::').html, /width:70%/)
  assert.match(renderXiumi(':::progress\n250\n:::').html, /width:100%/)
  assert.match(renderXiumi(':::progress\n-5\n:::').html, /width:0%/)
})

test('交互组件：对比卡与时间线用内联/table，不用 grid', () => {
  const out = renderXiumi(':::compare\n左\n---\n右\n:::\n\n:::timeline\n2024 · 甲\n:::')
  assert.ok(!/display\s*:\s*(?:inline-)?grid/.test(out.html), '不得用 grid 布局')
  assert.match(out.html, /<table/, '对比卡用 table 布局')
})
