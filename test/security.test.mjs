/**
 * 安全用例：注入面（正文裸 HTML、主题样式值、主题色、链接协议）与"产物落到磁盘/主文档"那两条路。
 *
 * 这些断言都指向**外部不变量**，不是实现细节：
 *   - 产物可能被 `file://` 双击打开，也可能被插进 WebUI 主文档（同源、能调 `/fishpai/api/*`）；
 *   - 主题样式值会被拼进 `style="…"`，一个引号就能闭合属性；
 *   - 只有"外链"才该进「参考资料」，判据必须认得出 `JavaScript:` 的各种变形。
 * 渲染字节级一致（不变量 1）由 golden 守，这里只钉"危险形态必须消失、正常内容必须活着"。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

import { cleanForWechat, footnoteLinks, isFootnoteHref, render } from '../plugin/core/render.mjs'
import { buildCustomTheme, validateThemeSpec } from '../plugin/core/theme-spec.mjs'
import { themes } from '../plugin/core/runtime.mjs'
import * as store from '../plugin/host/store.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = themes()
const tmpWorkspace = () => store.canonicalCwd(fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-sec-')))
const ARTICLE = '# 标题\n\n正文一段。\n'

// ── 1. 正文里的裸 HTML：publish 产物必须剥掉可执行内容 ──────────

const RAW_HTML_PAYLOADS = [
  '<img src=x onerror="alert(1)">',
  '<script>alert(2)</script>',
  '<style>body{display:none}</style>',
  '<iframe src="https://example.com"></iframe>',
  '<link rel="stylesheet" href="https://example.com/x.css">',
  '<meta http-equiv="refresh" content="0;url=https://example.com">',
  '<a href="javascript:alert(3)">点我</a>',
  '<a href="jav&#97;script:alert(4)">点我</a>',
  "<a href='vbscript:msgbox(1)'>点我</a>",
  '<a href=javascript:alert(5)>点我</a>',
  // 引号值后**紧接**属性名（HTML 分词器允许，没有空白）：按 `\s+on…` 找属性会整个漏掉
  '<img src="x"onerror="alert(1)">',
  '<div class="a"onmouseover="alert(1)">x</div>',
  // 引号没闭合：成对引号分支配不上，而 HTML 分词器在 EOF 仍会把这个标签连同处理器发出来。
  // 用块级标签 + 多行裸 HTML 块写才能真的走到清洗这一层（单行的 `<img …`、`<a …` 没有闭合 `>`，
  // markdown-it 不认它是标签、会转义成文字，那样测的是转义而不是清洗）
  "<div onmouseover='alert(6)//",
  "<div>\n<a href='javascript:alert(7)//>点我</a>\n</div>",
  '<iframe srcdoc="<b>内嵌文档</b>"></iframe>',
]

/** 产物里是不是还留着**真属性**形态的 `on*`（无空白邻接的写法也算）。 */
const LIVE_HANDLER_RE = /<[^>]*(?<![\w-])on[a-z]+\s*=/i

test('publish 产物不含事件属性、脚本、危险标签与可执行协议', () => {
  for (const payload of RAW_HTML_PAYLOADS) {
    const md = `${ARTICLE}\n${payload}\n`
    const { html } = render(md, { theme: 'default' })
    assert.doesNotMatch(html, LIVE_HANDLER_RE, `事件属性没剥干净：${payload}`)
    assert.doesNotMatch(html, /<script|<iframe|<object|<embed|<style|<link|<meta/i, `危险标签没剥干净：${payload}`)
    assert.doesNotMatch(html, /srcdoc/i, `srcdoc 没剥干净：${payload}`)
    assert.doesNotMatch(html, /javascript:|vbscript:/i, `可执行协议没剥干净：${payload}`)
    assert.match(html, /正文一段。/, '正常正文不能被清洗误伤')
  }
})

test('on* 清洗：引号值后紧接属性名（无空白邻接）也不能漏', () => {
  assert.equal(cleanForWechat('<img src="x"onerror="alert(1)">'), '<img src="x">')
  assert.equal(cleanForWechat('<a href="https://e.com"onclick="x()">t</a>'), '<a href="https://e.com">t</a>')
  assert.equal(cleanForWechat('<img src=x onerror="alert(1)">'), '<img src=x>')

  // 经 render 也够得着：裸 HTML 块里带 class 的标签、以及围栏后的语言串
  const block = '<div class="a"onmouseover="alert(1)">\n正文\n</div>\n'
  const withBlock = render(block, { theme: 'default' })
  assert.doesNotMatch(withBlock.html, LIVE_HANDLER_RE)
  assert.match(withBlock.html, /正文/)

  const fence = '```js"onmouseover="alert(1)//\nx\n```\n'
  const withFence = render(fence, { theme: 'default' })
  const [fenceCodeTag] = withFence.html.match(/<code[^>]*>/) || []
  assert.equal((fenceCodeTag.match(/ style="/g) || []).length, 1, '语言串不许造出第二个 style 属性')
  assert.match(fenceCodeTag, /class="language-js&quot;onmouseover=&quot;/, '语言串里的引号要转义（不转义就会多出一个 onmouseover 属性）')
})

test('空元素（embed / link / meta / base）只删标签本身，不吃后面的正文', () => {
  for (const void_ of ['<embed src="a.mp4">', '<link rel="stylesheet" href="a.css">', '<meta charset="utf-8">', '<base href="https://example.com/">']) {
    assert.equal(cleanForWechat(`<p>甲</p>\n${void_}\n<p>乙</p>`), '<p>甲</p>\n\n<p>乙</p>', `${void_} 不该连累后面的元素`)
  }
  // 没闭合的 iframe / object 是**普通元素**，后面的内容浏览器照常当标记解析，也不吃
  assert.equal(cleanForWechat('<p>甲</p>\n<iframe src="a">\n<p>乙</p>'), '<p>甲</p>\n\n<p>乙</p>')
  assert.equal(cleanForWechat('<p>甲</p>\n<object data="a.swf">\n<p>乙</p>'), '<p>甲</p>\n\n<p>乙</p>')
  // 只有原始文本元素（script / style）才剥到末尾——浏览器会把后面的字节全当它们的文本
  assert.equal(cleanForWechat('<p>甲</p>\n<script>alert(1)\n<p>乙</p>'), '<p>甲</p>')
})

test('清洗只动危险形态：正常图片、锚点、外链、内联样式一个字节不动', () => {
  const md = [
    '正常一段。',
    '',
    '![图](https://example.com/a.png)',
    '',
    '[锚点](#小节) 与 [外链](https://example.com)。',
    '',
    '<span style="color: #333;">保留的内联样式</span>',
    '',
  ].join('\n')
  const { html } = render(md, { theme: 'default' })
  assert.match(html, /src="https:\/\/example\.com\/a\.png"/)
  assert.match(html, /href="#%E5%B0%8F%E8%8A%82"/, '页内锚点要留着')
  assert.match(html, /style="color: #333;"/, '正常内联样式要留着')

  // 内嵌图片走的是 data URI，清洗跑在它之前，不该被当危险协议删掉
  const embedded = render('![图](https://example.com/demo.png)', {
    theme: 'default',
    imageResolver: (src) => (src === 'https://example.com/demo.png' ? 'data:image/png;base64,AAAA' : null),
  }).html
  assert.match(embedded, /src="data:image\/png;base64,AAAA"/, '自己内嵌的栅格图不能被清洗删掉')
})

test('cleanForWechat：没有闭合标签的 `<script>` 一直剥到末尾（浏览器就是这么容错的）', () => {
  const out = cleanForWechat('<p>正文</p>\n<script>alert(1)\n<p>后面的内容</p>')
  assert.doesNotMatch(out, /script|alert/i)
  assert.match(out, /正文/)
})

test('cleanForWechat：良构标签里的"像属性"的文字不被吃掉（清的是属性，不是属性值里的文字）', () => {
  // 裸 HTML 放行的正文：` onclick="…"` 这里是**文字**，删掉它等于吞掉用户的正文字
  const text = '<div>讲 HTML 的文章会写 onclick="alert(1)" 这种字面例子。</div>'
  assert.equal(cleanForWechat(text), text, '标签里的文字一个字节都不许动')

  // 属性值里带 `>` 的标签也要整段认出来，不能在那里把标签切断
  const withGt = '<img alt="a>b" onerror="alert(1)">'
  assert.equal(cleanForWechat(withGt), '<img alt="a>b">')

  // 引号闭合之后又出现 `<`（浏览器把它算进属性名，标签继续到那个 `>`）：继续扫，属性照样清
  assert.equal(cleanForWechat('<img alt="a>b" <p onerror="alert(1)">'), '<img alt="a>b" <p>')
  // 属性名开头的 `\` / NUL 不终止属性名（浏览器把它们算进名字里），判定前要剥掉再比 on 前缀
  assert.equal(cleanForWechat('<img src="x"\\onerror="alert(1)">'), '<img src="x">')
  assert.equal(cleanForWechat('<img src="x"\u0000onerror="alert(1)">'), '<img src="x">')
  assert.equal(cleanForWechat('<img src="x"\u00f6onmouseover="alert(1)">'), '<img src="x">')
  // 而 `data-onerror` / `x-onerror` 是合法自定义属性名，不许误伤
  assert.equal(cleanForWechat('<img src="x"data-onerror="1">'), '<img src="x"data-onerror="1">')
  assert.equal(cleanForWechat('<img src="x"x-onerror="1">'), '<img src="x"x-onerror="1">')

  // 属性值**里面**写的 `onmouseover=` 不是属性：值是双引号包着的，HTML 分词器不会在那里断句，
  // 一个字节都不该动（按正则扫整段就会把它当属性删掉、顺手破坏 style 的引号配对）
  const inValue = `<p style="color: red' onmouseover='alert(1);">正文</p>`
  assert.equal(cleanForWechat(inValue), inValue)

  // 注释里的东西浏览器一律不求值，也不动（在注释文本里删"属性"只会把注释本身改坏）
  const comment = '<!-- 注释里写 onerror="x" 是文字 -->'
  assert.equal(cleanForWechat(comment), comment)
})

test('窗口外的畸形尾巴：浏览器也不把它们当属性（清不到的地方不是活的）', () => {
  // 无引号值里的 `>` 直接结束标签 → 后面的 onerror 在浏览器那边是**正文文字**，不是属性
  assert.equal(cleanForWechat('<img alt=a>b onerror="alert(1)">'), '<img alt=a>b onerror="alert(1)">')
  // 引号在 `onerror=` 处闭合、之后又开：属性名变成 `alert(1)`，`onerror` 同样不成立
  const reopened = '<img alt="a> onerror="alert(1)">'
  assert.equal(cleanForWechat(reopened), reopened)
})

test('畸形标签：引号没闭合的那个标签整段丢掉，不牵连后面的元素与文字', () => {
  // `onmouseover='…` 的引号没闭合：HTML 分词器把标签名之后的一切都当它的属性值，
  // 所以那段"正文里写 onclick=…"从来就不是正文（浏览器一个字都不会显示它），
  // 整段丢掉是"这个标签从没正常成立过"的等价形态（只剪属性值会留下 `<div` 跟下一个标签粘起来）。
  assert.equal(cleanForWechat('<div onmouseover=\'alert(1)//\n正文里写 onclick="keep-me" 是文字\n</div>'), '</div>')
  assert.equal(
    cleanForWechat('<div onmouseover=\'alert(1)//\n<p style="margin: 0;">正文</p>'),
    '<p style="margin: 0;">正文</p>',
    '后面的元素必须原样留下',
  )
  // 散文里的 `<` 不是标签开头，不参与属性清洗
  assert.equal(cleanForWechat('<div>价格 < 100，写 onclick="keep-me" 是文字</div>'), '<div>价格 < 100，写 onclick="keep-me" 是文字</div>')
})

// ── 2. 脚注判定：同一份口径喂"数给面板看"与"真的转换" ──────────

test('isFootnoteHref：危险协议的写法变形一律不算外链', () => {
  const bad = [
    'JavaScript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'jav&#97;script:alert(1)',
    'jav&#x61;script:alert(1)',
    'java&Tab;script:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    '',
  ]
  for (const href of bad) {
    assert.equal(isFootnoteHref(href), false, `${JSON.stringify(href)} 不该进「参考资料」`)
  }
  for (const href of ['https://example.com', 'HTTPS://Example.com/a', 'http://a.b?x=1&amp;y=2', 'mailto:a@b.c']) {
    assert.equal(isFootnoteHref(href), true, `${href} 是正常外链`)
  }
  assert.equal(isFootnoteHref('#小节'), false, '页内锚点不是外链（golden 里那一条就是它）')
})

test('脚注：面板的 linkCount 与产物里的「参考资料」同源（口径不许分叉）', () => {
  const md = [
    '[正常外链](https://example.com)',
    '',
    '[锚点](#小节)',
    '',
    '<a href="JavaScript:alert(1)">危险链接</a>',
    '',
  ].join('\n')
  const out = render(md, { theme: 'default' })
  assert.equal(out.linkCount, 1, '只有 http 外链算一个')
  // linkCount 数的是**转换前**的正文（关掉开关时正文里的 <a> 还在），这条对得上才说明两处同源
  const noFootnotes = render(md, { theme: 'default', footnotes: false })
  assert.equal(out.linkCount, footnoteLinks(noFootnotes.html).length)
  assert.match(out.html, /参考资料/)
  assert.match(out.html, /example\.com/)
  assert.doesNotMatch(out.html, /alert\(1\)|JavaScript:/i, '危险链接既不许进参考资料，也不许带着协议留在正文')
  // 危险链接也不该出现在关掉脚注的那份产物里（清洗与脚注开关无关）
  assert.doesNotMatch(noFootnotes.html, /alert\(1\)|JavaScript:/i)
})

// ── 3. 自定义主题：值里的**双引号**能闭合 style 属性 ────────────
// （单引号放行：属性一律由双引号包裹，单引号闭合不了任何东西，而它是合法常见的 CSS 写法）

test('自定义主题：样式值里的双引号一律拒绝，单引号字体栈放行', () => {
  const rejected = [
    ['双引号闭合属性', 'color: red" onmouseover="alert(1)'],
    ['font-family 里带双引号', 'font-family: "Georgia", serif;'],
  ]
  for (const [label, css] of rejected) {
    assert.throws(() => validateThemeSpec({ base: 'default', styles: { p: css } }, BASE), /不允许的内容/, label)
  }
  // 落到渲染上确认：被拒的规格根本进不了产物
  assert.throws(() => buildCustomTheme({ base: 'default', styles: { p: 'color: red" onmouseover="alert(1)' } }, BASE), /不允许的内容/)

  // 单引号：能过校验，并且真的落进 `style="…"` 而没有把它撑开
  const { theme } = buildCustomTheme({ base: 'default', styles: { p: "font-family: 'Georgia', serif;" } }, BASE)
  assert.equal(theme.styles.p, "font-family: 'Georgia', serif;")
  const html = render('正文一段。\n', { theme }).html
  assert.match(html, /<p style="font-family: 'Georgia', serif;">/, '单引号字体栈要原样落进 style 属性')

  // 就算值是"用单引号拼一个假的 onmouseover"，它也撑不开双引号包裹的 style 属性：
  // 那段 `onmouseover=` 是 style **值里面**的文字（属性按引号断句），所以整段原样留下，
  // 标签仍然只有 style 一个属性——不许多撑出一个，也不许因为误判去破坏 style 的引号配对
  const sloppy = buildCustomTheme({ base: 'default', styles: { p: "color: red' onmouseover='alert(1)" } }, BASE)
  const sloppyHtml = render('正文一段。\n', { theme: sloppy.theme }).html
  const [openTag] = sloppyHtml.match(/<p[^>]*>/) || []
  assert.match(openTag, /^<p style="[^"]*">$/, '单引号不许多撑出一个属性')
  assert.match(openTag, /onmouseover='alert\(1\);/, '脏值原样待在 style 的值里')
})

// ── 4. 主题色：原样拼进 style 属性的那个字段 ───────────────────

test('updateMeta / saveDoc：非十六进制形态的 color 一律不写进状态（面板外的手写请求）', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })

  store.updateMeta({ cwd, docPath: opened.path, meta: { color: '#10b981' } })
  assert.equal(store.readState(cwd, opened.key).color, '#10b981', '合法色要能存下来')

  const bad = ['red" onmouseover="alert(1)', '#12345x', 'red', 'url(x)', 12, {}, ['#fff']]
  for (const color of bad) {
    store.updateMeta({ cwd, docPath: opened.path, meta: { color } })
    assert.equal(store.readState(cwd, opened.key).color, '#10b981', `${JSON.stringify(color)} 不该被写进状态`)
    store.saveDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, baseRevision: 1, by: 'human', meta: { color } })
    assert.equal(store.readState(cwd, opened.key).color, '#10b981', `saveDoc 这条路也要拦：${JSON.stringify(color)}`)
  }

  // null 是"清掉主题色"的合法写法（面板上再点一次同一个色块就是它）
  store.updateMeta({ cwd, docPath: opened.path, meta: { color: null } })
  assert.equal(store.readState(cwd, opened.key).color, null)
})

test('POST /render：body.meta 里的 color 也要过形态校验（它不是写状态那条路）', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: '## 标题\n\n正文。\n', by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const out = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'publish', meta: { color: 'red" data-injected="1' } },
  })
  assert.equal(out.status, 200)
  // 用清洗层**不认识**的属性名当探针：脏色若被放行，它就会以独立属性的形态出现在产物里
  assert.doesNotMatch(out.json.html, /data-injected/i, '注入的 color 不许落进产物')
  assert.doesNotMatch(out.json.html, /onmouseover/i)
  assert.match(out.json.html, /正文。/)
})

// ── 4b. 字号：第二个原样插值进 style 的请求字段 ────────────────

const DIRTY_SIZE = '16px" data-injected="1'
const DIRTY_SIZE_HANDLER = '16px" onmouseover="alert(1)//'

test('字号入口一：store 拒绝非 `NNpx`/越界的 fontSize（它原样拼进 style）', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.updateMeta({ cwd, docPath: opened.path, meta: { fontSize: '17px' } })
  assert.equal(store.readState(cwd, opened.key).fontSize, '17px', '合法字号要能存下来')

  for (const bad of [DIRTY_SIZE_HANDLER, '16', '16px;x', '9px', '40px', 16, {}, null]) {
    store.updateMeta({ cwd, docPath: opened.path, meta: { fontSize: bad } })
    assert.equal(store.readState(cwd, opened.key).fontSize, '17px', `${JSON.stringify(bad)} 不该被写进状态`)
    store.saveDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, baseRevision: 1, by: 'human', meta: { fontSize: bad } })
    assert.equal(store.readState(cwd, opened.key).fontSize, '17px', `saveDoc 这条路也要拦：${JSON.stringify(bad)}`)
  }
})

test('字号入口二：POST /render 的 body.meta.fontSize 也要过形态校验', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: '## 标题\n\n正文。\n', by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const out = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'publish', meta: { fontSize: DIRTY_SIZE } },
  })
  assert.equal(out.status, 200)
  // 探针属性名清洗层不认识：放行的话它会以独立属性出现（渲染层兜底会把值换成 16px，所以这里同时钉住）
  assert.doesNotMatch(out.json.html, /data-injected/i, '注入的 fontSize 不许落进产物')
  assert.doesNotMatch(out.json.html, LIVE_HANDLER_RE)
  assert.match(out.json.html, /font-size: 16px;/, '不合法就回落默认字号')
  assert.match(out.json.html, /正文。/)
})

test('字号渲染层兜底：render() 自己判 opts.fontSize（公开导出，CLI 也在用）', () => {
  // 关键：`promoteFontSize` 把字号推到正文块上，注入点落在清洗**之后**，所以入口没拦住就晚了
  const dirty = render('正文一段。\n', { theme: 'default', fontSize: DIRTY_SIZE_HANDLER, promoteFontSize: true })
  assert.doesNotMatch(dirty.html, LIVE_HANDLER_RE)
  assert.match(dirty.html, /font-size: 16px;/)

  // 合法值照旧生效，并推进到正文块级元素上（原行为不变）
  const ok = render('正文一段。\n', { theme: 'default', fontSize: '17px', promoteFontSize: true })
  assert.match(ok.html, /<p style="font-size: 17px; /)
})

// ── 4c. 用户可控文本的插值：围栏语言串与卡片标题 ────────────────

test('围栏语言串：注入的引号被转义，标签不会多出第二个 style 属性', () => {
  const md = '```js" style="position:fixed;inset:0;background:#fff;z-index:2147483647\nlet a = 1\n```\n'
  const { html } = render(md, { theme: 'default' })
  const [codeTag] = html.match(/<code[^>]*>/) || []
  assert.equal((codeTag.match(/ style="/g) || []).length, 1, '语言串不许造出第二个 style 属性')
  assert.match(codeTag, /class="language-js&quot;/, '注入的引号要转义成实体')
  assert.doesNotMatch(html, / style="[^"]*z-index: *2147483647/, '注入的样式不许落进任何 style 属性')
})

test('卡片标题：标签被转义成文字，不许当元素插进正文', () => {
  const md = ':::tip <b style="position:fixed;inset:0;background:#000">x</b>\n内容\n:::\n'
  const { html } = render(md, { theme: 'default' })
  assert.doesNotMatch(html, /<b[\s>]/, '标题里的标签不许变成元素')
  assert.match(html, /&lt;b style=&quot;position:fixed/, '它应该以转义文本的形态出现在标题里')
  assert.match(html, /内容/)
})

// ── 4d. 相对链接：白名单化的取舍 ───────────────────────────────

test('相对链接不进「参考资料」，但原样留在产物里（白名单的取舍）', () => {
  for (const href of ['./other.md', '/abs/path.md', '../up.md', 'ftp://x/y', 'tel:123']) {
    assert.equal(isFootnoteHref(href), false, `${href} 不算外链`)
  }
  const out = render('[相对](./other.md) 与 [外链](https://example.com)\n', { theme: 'default' })
  assert.equal(out.linkCount, 1, '只数真的会变成脚注的那条')
  assert.match(out.html, /href="\.\/other\.md"/, '相对链接原样留在产物里当普通链接')
  assert.match(out.html, /参考资料/)
})

// ── 5. 客户端复制回退路径的清洗（`client/sanitize.ts`）──────────

const compiled = await transform(fs.readFileSync(path.join(ROOT, 'client', 'sanitize.ts'), 'utf8'), {
  loader: 'ts',
  format: 'esm',
  target: 'es2020',
  charset: 'utf8',
})
const sanitize = await import(`data:text/javascript;base64,${Buffer.from(compiled.code, 'utf8').toString('base64')}`)

/** 一棵 document-like 桩树：只实现 sanitize.ts 真正用到的那几个成员。 */
function node(tagName, attrs = {}, children = []) {
  const el = {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    childNodes: children,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value: String(value) })),
    parent: null,
  }
  el.removeAttribute = (name) => {
    const i = el.attributes.findIndex((a) => a.name === name)
    if (i >= 0) el.attributes.splice(i, 1)
  }
  el.remove = () => {
    const p = el.parent
    if (!p) return
    const i = p.childNodes.indexOf(el)
    if (i >= 0) p.childNodes.splice(i, 1)
  }
  for (const child of el.childNodes) child.parent = el
  return el
}

const text = (value) => ({ nodeType: 3, text: String(value) })

function serialize(n) {
  if (n.nodeType === 3) return n.text
  const attrs = n.attributes.map((a) => ` ${a.name}="${a.value}"`).join('')
  const tag = n.tagName.toLowerCase()
  return `<${tag}${attrs}>${n.childNodes.map(serialize).join('')}</${tag}>`
}

/** 桩树里所有元素上的属性名（用来按**名字**判有没有处理器，而不是按字面正则猜）。 */
function attrNames(n, out = []) {
  if (n.nodeType === 1) for (const a of n.attributes) out.push(a.name)
  for (const c of n.childNodes || []) attrNames(c, out)
  return out
}

test('复制回退：插入前剥掉脚本、事件属性与危险协议的 URL 属性', () => {
  const root = node('div', {}, [
    node('img', { src: 'x', onerror: 'alert(1)' }),
    node('script', {}, [text('alert(2)')]),
    node('p', { onclick: 'steal()', style: 'color: red;', title: '保留我' }, [text('正文')]),
    node('a', { href: 'javascript:alert(3)' }, [text('危险')]),
    node('a', { href: 'java\tscript:alert(4)' }, [text('危险2')]),
    node('a', { href: 'https://example.com' }, [text('正常')]),
    node('img', { src: 'data:image/png;base64,AAAA' }),
    node('img', { src: 'data:text/html;base64,PHNjcmlwdD4=' }),
    node('iframe', { srcdoc: '<b>x</b>' }),
    node('div', { srcdoc: '<b>随便挂在哪都不留</b>' }),
    node('span', { 'xlink:href': 'JaVaScRiPt:alert(5)' }),
    node('style', {}, [text('body{display:none}')]),
    // 模板内容挂在 `.content` 上、不在 childNodes 里：只遍历 childNodes 时它既清不到也剥不掉
    node('template', {}, [node('img', { src: 'x', onerror: 'alert(6)' })]),
    // SMIL：插入之后还能改父元素属性（`<animate attributeName="href">`）
    node('animate', { attributeName: 'href', values: 'javascript:alert(7)' }),
    node('set', { attributeName: 'onmouseover', to: 'alert(8)' }),
    // 属性名开头的 `\` / NUL 不终止属性名（解析器把它们算进名字里），判定前要剥掉再比 on 前缀
    node('img', { src: 'x', '\\onerror': 'alert(9)' }),
    node('img', { src: 'x', '\u0000onerror': 'alert(10)' }),
    // 合法自定义属性名不许被误伤
    node('img', { src: 'x', 'data-onerror': '1' }),
  ])
  sanitize.sanitizeTree(root)
  const html = serialize(root)

  // 按**属性名**判（不按字面正则判）：`data-onerror="1"` 是合法自定义属性名，正文里出现
  // `onerror=` 这几个字符并不等于有处理器——这也正是清洗层自己要做属性边界归一化的理由。
  const badNames = attrNames(root).filter((n) => {
    const lower = n.toLowerCase().replace(/^[^a-z]+/, '')
    return lower.startsWith('on') || lower === 'srcdoc'
  })
  assert.deepEqual(badNames, [], `事件属性 / srcdoc 要全剥掉，还剩：${badNames.join(', ')}`)
  assert.doesNotMatch(html, /<script|<iframe|<style|<template|<animate|<set/i, '危险标签要整段剥掉')
  assert.doesNotMatch(html, /srcdoc/i)
  assert.doesNotMatch(html, /javascript:/i)
  assert.doesNotMatch(html, /data:text\/html/i, '非栅格 data URI 也要剥掉')
  assert.match(html, /href="https:\/\/example\.com"/, '正常外链要留着')
  assert.match(html, /src="data:image\/png;base64,AAAA"/, '自己内嵌的栅格图要留着')
  assert.match(html, /style="color: red;"/, '正常内联样式要留着')
  assert.match(html, /正文/)
  assert.match(html, /title="保留我"/, '无关属性不许动')
  assert.match(html, /data-onerror="1"/, '合法自定义属性名（data-*）不许被误伤')
})

test('复制回退：<template> 内容既清不到也不该留下（模板内外的事件属性都要没了）', () => {
  // 模板内容挂在 `.content` 上、不在 childNodes 里：走 childNodes 的遍历到不了它，
  // 所以靠 DROP_TAGS 把 `<template>` 整段剥掉——内外各放一个 onerror，两个都不许剩
  const root = node('div', {}, [
    node('img', { src: 'x', onerror: 'alert("外面")' }),
    node('template', {}, [node('div', {}, [node('img', { src: 'y', onerror: 'alert("里面")' })])]),
  ])
  sanitize.sanitizeTree(root)
  const html = serialize(root)
  assert.doesNotMatch(html, /<template/i, 'template 标签本身要没了')
  assert.doesNotMatch(html, /on[a-z]+=/i, '模板内外的 on* 都不许剩')
  assert.doesNotMatch(html, /alert\(/, '两个处理器的函数体都不该留在产物里')
  assert.match(html, /<img src="x">/, '模板外的元素还在（只是没了处理器）')
})

test('复制回退：解析不出 body 时抛错（回退路径是 Firefox 等环境唯一的复制通道）', () => {
  // `sanitizeHtmlFragment` 唯一碰的全局是 document（浏览器里天然存在）
  const saved = globalThis.document
  globalThis.document = {
    createDocumentFragment: () => ({ children: [], appendChild(n) { this.children.push(n) } }),
  }
  try {
    const frame = { body: node('div', {}, [node('img', { src: 'x', onerror: 'alert(1)' })]) }
    const fragment = sanitize.sanitizeHtmlFragment('<img src=x onerror=alert(1)>', { parseFromString: () => frame })
    assert.equal(fragment.children.length, 1, '清洗后的子节点要搬进 fragment')
    assert.doesNotMatch(serialize(fragment.children[0]), /onerror/i)

    assert.throws(
      () => sanitize.sanitizeHtmlFragment('<b>x</b>', { parseFromString: () => ({ body: null }) }),
      /没能解析/,
      '解析失败要说清楚，不能静默把原样的 HTML 插进主文档',
    )
  } finally {
    globalThis.document = saved
  }
})

// ── 6. 路由调用的最小桩（与 host.test.mjs 同一口径）─────────────

function callRoute(handler, { method, url, body }) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url,
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      ...(payload.length ? { 'content-type': 'application/json' } : {}),
    },
    on(event, cb) {
      if (event === 'data') for (const p of payload) cb(p)
      if (event === 'end') cb()
      return this
    },
  }
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code
        this.headers = h || {}
      },
      end(chunk) {
        const raw = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk ? String(chunk) : '', 'utf8')
        const text = raw.toString('utf8')
        let json = null
        try {
          json = JSON.parse(text)
        } catch {
          json = null
        }
        resolve({ status: this.statusCode, headers: this.headers, json, raw })
      },
    }
    handler(req, res)
  })
}
