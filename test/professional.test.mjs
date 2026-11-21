import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SPEC } from '../plugin/core/professional/spec.mjs'
import { HTML_COMPONENTS, SVG_COMPONENTS, WECHAT_COMPONENTS } from '../plugin/core/professional/components.mjs'
import { buildPage, componentsFromMarkdown, renderProfessional } from '../plugin/core/professional/index.mjs'
import { registerTools } from '../plugin/host/tools.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { render as renderCore } from '../plugin/core/render.mjs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import * as store from '../plugin/host/store.mjs'

const md = '# 标题\n\n正文 **加粗**。\n\n- 甲\n- 乙'

test('专业：规格十八键与静态组件、交互组件注册表', () => {
  assert.deepEqual(Object.keys(DEFAULT_SPEC).sort(), ['title_color','title_size','title_align','body_color','body_size','body_align','body_spacing','line_height','muted_color','page_bg','page_width','page_padding_x','page_padding_y','card_bg','card_radius','card_padding','accent','accent2'].sort())
  assert.deepEqual(Object.keys(HTML_COMPONENTS), ['heading','paragraph','card','two_columns','table','quote','divider'])
  assert.deepEqual(Object.keys(SVG_COMPONENTS), ['svg_gradient_banner','svg_wave_divider','svg_number_icons'])
  assert.deepEqual(Object.keys(WECHAT_COMPONENTS), ['wc_heading','wc_paragraph','wc_card','wc_bullet_list','wc_gradient_banner','wc_wave_divider','wc_number_steps','wc_info_card','wc_chapter_header','wc_highlight','wc_credits','wc_quote','wc_two_columns','wc_table','wc_raw','wc_full_bleed'])
})
test('专业：Markdown 与指令经 wc 别名组成页面', () => {
  const components = componentsFromMarkdown('# 标题\n\n正文\n\n:::card\n卡片\n:::\n\n:::gradient_banner\n渐变\n:::')
  assert.deepEqual(components.map((x) => x.type), ['heading','paragraph','card','gradient_banner'])
  const html = buildPage(components)
  assert.match(html, /^<section style="max-width:677px;margin:0 auto;padding:24px 20px;box-sizing:border-box;background-color:#ffffff;/)
  assert.match(html, /linear-gradient\(135deg, #3f63d7 0%, #5b7cdb 100%\)/)
  assert.match(SVG_COMPONENTS.svg_wave_divider({}, DEFAULT_SPEC), /^<svg/)
})
test('专业：自定义规格与未知组件边界', () => {
  assert.match(buildPage([{ type: 'paragraph', text: '正文' }], { spec: { body_color: '#111111' } }), /color:#111111/)
  assert.throws(() => buildPage([{ type: '未知', text: 'x' }]), /未知组件/)
  assert.throws(() => componentsFromMarkdown(':::wat\nx\n:::'), /未知指令/)
  assert.throws(() => componentsFromMarkdown(':::chapter_header\n#1\n:::'), /需要编号与主标题/)
  assert.throws(() => componentsFromMarkdown(':::info_card\n:::'), /需要正文/)
  assert.throws(() => componentsFromMarkdown(':::highlight\n:::'), /需要一行重点内容/)
  assert.throws(() => componentsFromMarkdown(':::credits\n:::'), /至少需要一行/)
  assert.throws(() => componentsFromMarkdown(':::card\nx'), /未闭合/)
})
test('专业：自由画布与语义组件共享同一份规格', () => {
  const source = [
    ':::chapter_header', '#1', '内容结构', '从信息到阅读', ':::',
    ':::info_card', '@核心信息', '正文保持 **Markdown** 表达。', ':::',
    ':::highlight', '**重点日期**', ':::',
    '正文居中。', ':::credits', '文案｜鱼排', '排版｜鱼排', ':::',
  ].join('\n\n')
  const html = renderProfessional(source, { spec: { page_bg: '#f2f2f2', page_padding_x: 0, page_padding_y: 0, body_align: 'center', body_spacing: 2, accent: '#96d23a', accent2: '#111111', card_bg: '#ffffff' } }).html
  assert.match(html, /max-width:677px;margin:0 auto;padding:0px 0px/)
  assert.match(html, /background-color:#f2f2f2/)
  assert.match(html, /letter-spacing:2px/)
  assert.match(html, /#1<\/span>/)
  assert.match(html, /内容结构/)
  assert.match(html, /width:90%/)
  assert.match(html, /<strong[^>]*>Markdown<\/strong>/)
  assert.match(html, /<strong style="color:#ffffff;font-weight:700;white-space:nowrap;">重点日期<\/strong>/)
  assert.match(html, /margin:18px 0;text-align:center/, '重点行上方与下方都保留独立间距')
  assert.match(html, /text-align:center/)
  assert.match(html, /文案<\/strong>/)
})
test('专业：短强调词不拆行，长强调句子允许正常换行', () => {
  const html = renderProfessional('**信息卡**与**展开组件**\n\n**这是一段需要允许正常换行的长强调句子**').html
  assert.match(html, /<strong style="color:[^;]+;font-weight:700;white-space:nowrap;">信息卡<\/strong>/)
  assert.match(html, /<strong style="color:[^;]+;font-weight:700;white-space:nowrap;">展开组件<\/strong>/)
  assert.match(html, /<strong style="color:[^;]+;font-weight:700;">这是一段需要允许正常换行的长强调句子<\/strong>/)
})

test('专业：全幅容器按页面留白扩展，并复用 raw 安全边界', () => {
  const html = renderProfessional(':::full_bleed\n<section style="margin:0 0 30px;"><span>整幅主视觉</span></section>\n:::', { spec: { page_padding_x: 24 } }).html
  assert.match(html, /max-width:none !important;margin:0 -24px;/)
  assert.match(html, /margin:0 0 30px;/)
  assert.throws(() => renderProfessional(':::full_bleed\n:::'), /需要 HTML\/SVG 内容/)
  assert.throws(() => renderProfessional(':::full_bleed\n<script>alert(1)</script>\n:::'), /raw 不允许/)
})

test('专业：raw 保留 HTML/SVG 并拒绝主动内容', () => {
  const source = '<section data-p="1">原文<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">叠字</div></foreignObject></svg></section>'
  const html = renderProfessional(`:::raw\n${source}\n:::`).html
  assert.match(html, /data-p="1">原文<svg><foreignObject>/)
  assert.throws(() => renderProfessional(':::raw\n<script>alert(1)</script>\n:::'), /raw 不允许/)
  assert.throws(() => renderProfessional(':::raw\n<section onclick="alert(1)">x</section>\n:::'), /raw 不允许/)
  assert.throws(() => renderProfessional(':::raw\n<a href="javascript:alert(1)">x</a>\n:::'), /raw 不允许/)
})
test('fishpai_render target=professional 走独立目标，微信默认路径不变', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-professional-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const tools = []
  registerTools({ tools: { register: (tool) => { tools.push(tool); return () => {} } } }, { resolveCwd: () => cwd, log: () => {} })
  const exec = { agent: { session: { id: 'x' } } }
  const opened = await tools.find((x) => x.name === 'fishpai_open').execute({ markdown: md }, exec)
  assert.equal(opened.isError, false, opened.text)
  const out = await tools.find((x) => x.name === 'fishpai_render').execute({ markdown: md, target: 'professional', publish: false }, exec)
  assert.equal(out.isError, false, out.text)
  assert.match(out.text, /已导出专业 HTML/)
  assert.equal(renderCore(md).themeKey, 'default')
})

test('POST /render target=professional 使用同一组件管线并回带面板状态', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-professional-route-'))
  const opened = store.createDoc({ cwd, title: '专业路由' })
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const handler = createApiHandler({ resolveCwd: () => cwd, log: () => {} })
  const server = createServer((req, res) => { if (req.url.startsWith('/fishpai/api/')) return handler(req, res); res.statusCode = 404; res.end() })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const markdown = '# 标题\n\n正文\n\n<!-- 鱼排: 补一句 -->'
  const response = await fetch(`${origin}/fishpai/api/render`, { method: 'POST', headers: { host: `127.0.0.1:${server.address().port}`, origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'x', docKey: opened.key, markdown, target: 'professional' }) })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.ok, true)
  assert.equal(body.target, 'professional')
  assert.equal(body.themeKey, 'professional')
  assert.match(body.html, /标题/)
  for (const field of ['blocks', 'notes', 'placeholders', 'images']) {
    assert.ok(Array.isArray(body[field]), `专业预览应回带数组字段 ${field}`)
  }
  assert.equal(body.placeholders.length, 1)
  assert.match(body.placeholders[0].text, /补一句/)
  assert.equal(body.linkCount, 0)
  assert.equal(body.hasCode, false)
  assert.equal(body.hljsCss, '')
})
