import test from 'node:test'
import assert from 'node:assert/strict'
import { importArticle } from '../plugin/core/import/index.mjs'
import { DEFAULT_SPEC } from '../plugin/core/xiumi/spec.mjs'
import { renderXiumiPublish } from '../plugin/core/xiumi/index.mjs'
import { lintWechatHtml } from '../plugin/core/wechat-lint.mjs'

test('优先提取 #js_content，标题读取 #activity-name', async () => {
  const result = await importArticle({ html: '<html><head><title>备用标题</title></head><body><h1 id="activity-name">合成标题</h1><article><p>其他正文</p></article><div id="js_content"><p>目标正文</p></div></body></html>' })
  assert.equal(result.title, '合成标题')
  assert.equal(result.markdown, '目标正文')
  assert.equal(result.sourceHtml.includes('其他正文'), false)
})

test('通用文档依次选择 article，并递归穿透无语义 wrapper', async () => {
  const result = await importArticle({ html: '<article><div><section><h2>第一节</h2><div><p>段落甲</p></div></section><section><p>段落乙</p></section></div></article>' })
  assert.deepEqual(result.blocks.map((block) => block.tag), ['h2', 'p', 'p'])
  assert.deepEqual(result.blocks.map((block) => block.sourceIndex), [0, 1, 2])
  assert.equal(result.stats.native, 3)
  assert.match(result.markdown, /## 第一节\n\n段落甲\n\n段落乙/)
})

test('复杂 SVG 与 table 保持原子 raw，不递归拆碎', async () => {
  const result = await importArticle({ html: '<main><div><svg viewBox="0 0 10 10"><g><path d="M0 0L10 10"/></g></svg><table><tbody><tr><td>甲</td><td>乙</td></tr></tbody></table></div></main>' })
  assert.equal(result.stats.total, 2)
  assert.equal(result.stats.raw, 2)
  assert.match(result.blocks[0].html, /^<svg/)
  assert.match(result.blocks[1].html, /^<table/)
  assert.match(result.markdown, /:::raw\n<svg/)
})

test('简单标题、段落、列表与图片提升为原生 Markdown', async () => {
  const result = await importArticle({ html: '<main><h2>标题</h2><p>普通 <strong>重点</strong> 文本</p><ul><li>甲</li><li>乙</li></ul><p><img src="https://example.invalid/a.png" alt="示意图"></p></main>' })
  assert.match(result.markdown, /## 标题/)
  assert.match(result.markdown, /普通 \*\*重点\*\* 文本/)
  assert.match(result.markdown, /- 甲\n- 乙/)
  assert.equal(result.blocks.filter((block) => block.kind === 'native').length, 3)
  assert.equal(result.blocks.at(-1).tag, 'p')
})

test('带重要样式的段落保留 raw，不伪造等价 Markdown', async () => {
  const result = await importArticle({ html: '<main><p style="color:#123456;letter-spacing:2px">特殊段落</p><p>普通段落</p></main>' })
  assert.equal(result.blocks[0].kind, 'raw')
  assert.match(result.blocks[0].html, /letter-spacing:2px/)
  assert.equal(result.blocks[1].kind, 'native')
})

test('mp 自定义节点与带布局样式的容器保持 raw', async () => {
  const result = await importArticle({ html: '<main><mp-custom-card><p>卡片内容</p></mp-custom-card><section style="display:flex"><p>左</p><p>右</p></section></main>' })
  assert.equal(result.stats.total, 2)
  assert.equal(result.stats.raw, 2)
  assert.match(result.blocks[0].html, /^<mp-custom-card/)
  assert.match(result.blocks[1].html, /display:flex/)
})

test('按内联样式推导规格，其余键回退 DEFAULT_SPEC', async () => {
  const result = await importArticle({ html: '<main id="js_content" style="background-color:#fafafa;max-width:640px;padding:30px 24px"><h1 style="color:#112233;font-size:28px;text-align:center">标题</h1><p style="color:#334455;font-size:17px;line-height:1.7;text-align:justify;letter-spacing:1px">甲</p><p style="color:#334455;font-size:17px;line-height:1.7;text-align:justify;letter-spacing:1px">乙</p><a href="https://example.invalid" style="color:#aa2244">链接</a></main>' })
  assert.equal(result.xiumiSpec.title_color, '#112233')
  assert.equal(result.xiumiSpec.title_size, 28)
  assert.equal(result.xiumiSpec.title_align, 'center')
  assert.equal(result.xiumiSpec.body_color, '#334455')
  assert.equal(result.xiumiSpec.body_size, 17)
  assert.equal(result.xiumiSpec.body_align, 'justify')
  assert.equal(result.xiumiSpec.body_spacing, 1)
  assert.equal(result.xiumiSpec.line_height, 1.7)
  assert.equal(result.xiumiSpec.page_bg, '#fafafa')
  assert.equal(result.xiumiSpec.page_width, 640)
  assert.equal(result.xiumiSpec.page_padding_x, 24)
  assert.equal(result.xiumiSpec.page_padding_y, 30)
  assert.equal(result.xiumiSpec.accent, '#aa2244')
  assert.equal(result.xiumiSpec.card_bg, DEFAULT_SPEC.card_bg)
  assert.ok(result.specEvidence.body_color.confidence >= 0.65)
  assert.match(result.specEvidence.body_color.evidence[0], /2\/2/)
  assert.equal(result.specEvidence.card_bg.confidence, 0)
})

test('无样式证据时完整规格回退，每个规格键均有证据记录', async () => {
  const result = await importArticle({ html: '<main><h1>标题</h1><p>正文</p></main>' })
  assert.deepEqual(result.xiumiSpec, { ...DEFAULT_SPEC })
  assert.deepEqual(Object.keys(result.specEvidence), Object.keys(DEFAULT_SPEC))
  assert.equal(Object.keys(result.specEvidence).length, Object.keys(DEFAULT_SPEC).length)
  assert.ok(Object.values(result.specEvidence).every((entry) => entry.confidence === 0))
})

test('清理主动内容、事件、srcdoc、可执行 URL 与粘贴禁用属性', async () => {
  const result = await importArticle({ html: '<main><p id="x" class="y" onclick="alert(1)" style="color:#111111">文本<script>alert(1)</script><style>p{color:red}</style><iframe srcdoc="x"></iframe><a href="javascript:alert(1)">链接</a><img src="data:text/html;base64,PHNjcmlwdD4="></p><form><input></form></main>' })
  assert.doesNotMatch(result.sourceHtml, /<script|<style|<iframe|<form|onclick|srcdoc|javascript:|data:text\/html|\sid=|\sclass=/i)
  assert.doesNotThrow(() => renderXiumiPublish(result.markdown, { spec: result.xiumiSpec }))
})

test('data-src 经 baseUrl 解析并重写，SVG image 同样处理', async () => {
  const calls = []
  const result = await importArticle({
    html: '<main><img data-src="../images/a.png" src="placeholder.png" alt="甲"><svg><image xlink:href="./b.svg"/></svg></main>',
    baseUrl: 'https://example.invalid/posts/1/',
    resolveAsset: async (url, kind) => { calls.push([url, kind]); return `assets/${url.endsWith('a.png') ? 'a.png' : 'b.svg'}` },
  })
  assert.deepEqual(calls, [['https://example.invalid/posts/images/a.png', 'image'], ['https://example.invalid/posts/1/b.svg', 'image']])
  assert.match(result.sourceHtml, /src="assets\/a.png"/)
  assert.match(result.blocks[1].html, /href="assets\/b.svg"/)
  assert.equal(result.assets.every((asset) => asset.status === 'resolved'), true)
})

test('素材解析失败保留原绝对 URL 并记录 warning，data:image 不调用解析器', async () => {
  let calls = 0
  const result = await importArticle({
    html: '<main><img data-src="/bad.png"><img src="data:image/png;base64,AAAA"></main>',
    baseUrl: 'https://example.invalid/post/',
    resolveAsset: async () => { calls += 1; throw new Error('合成网络失败') },
  })
  assert.equal(calls, 1)
  assert.match(result.sourceHtml, /src="https:\/\/example.invalid\/bad.png"/)
  assert.match(result.sourceHtml, /src="data:image\/png;base64,AAAA"/)
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /合成网络失败/)
  assert.equal(result.assets[0].status, 'failed')
})

test('raw 负水平 margin 自动补 max-width:none !important', async () => {
  const result = await importArticle({ html: '<main><section style="margin:0 -20px;padding:0;max-width:100%"><p>全幅内容</p></section></main>' })
  assert.match(result.blocks[0].html, /margin:0 -20px/)
  assert.match(result.blocks[0].html, /max-width:none !important/)
  const rendered = renderXiumiPublish(result.markdown, { spec: result.xiumiSpec })
  const lint = lintWechatHtml(rendered.html)
  assert.equal(lint.errors.some((error) => error.rule === 'full-bleed-width'), false)
})

test('markdown 可交给 renderXiumiPublish，lint 无主动内容类错误', async () => {
  const result = await importArticle({ html: '<main><h2>合成标题</h2><p>正文 <strong>重点</strong></p><svg viewBox="0 0 10 10"><path d="M0 0L1 1"/></svg><table><tbody><tr><td>单元格</td></tr></tbody></table></main>' })
  const rendered = renderXiumiPublish(result.markdown, { spec: result.xiumiSpec })
  assert.ok(rendered.html.length > 0)
  const activeRules = new Set(['forbidden-tag', 'forbidden-attribute', 'position', 'css-variable', 'grid', 'css-animation'])
  assert.deepEqual(lintWechatHtml(rendered.html).errors.filter((error) => activeRules.has(error.rule)), [])
})
