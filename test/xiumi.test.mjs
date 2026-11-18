import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SPEC } from '../plugin/core/xiumi/spec.mjs'
import { HTML_COMPONENTS, SVG_COMPONENTS, WECHAT_COMPONENTS } from '../plugin/core/xiumi/components.mjs'
import { buildPage, componentsFromMarkdown, renderXiumi } from '../plugin/core/xiumi/index.mjs'
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

test('秀米：规格十一键与静态组件、交互组件注册表', () => {
  assert.deepEqual(Object.keys(DEFAULT_SPEC).sort(), ['title_color','title_size','title_align','body_color','body_size','line_height','card_bg','card_radius','card_padding','accent','accent2'].sort())
  assert.deepEqual(Object.keys(HTML_COMPONENTS), ['heading','paragraph','card','two_columns','quote','divider'])
  assert.deepEqual(Object.keys(SVG_COMPONENTS), ['svg_gradient_banner','svg_wave_divider','svg_number_icons'])
  assert.deepEqual(Object.keys(WECHAT_COMPONENTS), ['wc_heading','wc_paragraph','wc_card','wc_bullet_list','wc_gradient_banner','wc_wave_divider','wc_number_steps','wc_quote','wc_two_columns'])
})
test('秀米：Markdown 与指令经 wc 别名组成页面', () => {
  const components = componentsFromMarkdown('# 标题\n\n正文\n\n:::card\n卡片\n:::\n\n:::gradient_banner\n渐变\n:::')
  assert.deepEqual(components.map((x) => x.type), ['heading','paragraph','card','gradient_banner'])
  const html = buildPage(components)
  assert.match(html, /^<section style="max-width:677px;margin:0 auto;padding:24px 20px 32px;box-sizing:border-box;background-color:#ffffff;/)
  assert.match(html, /linear-gradient\(135deg, #3f63d7 0%, #5b7cdb 100%\)/)
  assert.match(SVG_COMPONENTS.svg_wave_divider({}, DEFAULT_SPEC), /^<svg/)
})
test('秀米：自定义规格与未知组件边界', () => {
  assert.match(buildPage([{ type: 'paragraph', text: '正文' }], { spec: { body_color: '#111111' } }), /color:#111111/)
  assert.throws(() => buildPage([{ type: '未知', text: 'x' }]), /未知组件/)
  assert.throws(() => componentsFromMarkdown(':::wat\nx\n:::'), /未知指令/)
  assert.throws(() => componentsFromMarkdown(':::card\nx'), /未闭合/)
})
test('fishpai_render target=xiumi 走独立目标，微信默认路径不变', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-xiumi-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const tools = []
  registerTools({ tools: { register: (tool) => { tools.push(tool); return () => {} } } }, { resolveCwd: () => cwd, log: () => {} })
  const exec = { agent: { session: { id: 'x' } } }
  const opened = await tools.find((x) => x.name === 'fishpai_open').execute({ markdown: md }, exec)
  assert.equal(opened.isError, false, opened.text)
  const out = await tools.find((x) => x.name === 'fishpai_render').execute({ markdown: md, target: 'xiumi', publish: false }, exec)
  assert.equal(out.isError, false, out.text)
  assert.match(out.text, /已导出秀米 HTML/)
  assert.equal(renderCore(md).themeKey, 'default')
})

test('POST /render target=xiumi 使用同一组件管线并回带面板状态', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-xiumi-route-'))
  const opened = store.createDoc({ cwd, title: '秀米路由' })
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const handler = createApiHandler({ resolveCwd: () => cwd, log: () => {} })
  const server = createServer((req, res) => { if (req.url.startsWith('/fishpai/api/')) return handler(req, res); res.statusCode = 404; res.end() })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const markdown = '# 标题\n\n正文\n\n<!-- 鱼排: 补一句 -->'
  const response = await fetch(`${origin}/fishpai/api/render`, { method: 'POST', headers: { host: `127.0.0.1:${server.address().port}`, origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'x', docKey: opened.key, markdown, target: 'xiumi' }) })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.ok, true)
  assert.equal(body.target, 'xiumi')
  assert.equal(body.themeKey, 'xiumi')
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
