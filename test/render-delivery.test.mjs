import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { registerTools } from '../plugin/host/tools.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import { readState } from '../plugin/host/store.mjs'

async function setup(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-delivery-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const tools = new Map()
  const deps = { resolveCwd: () => cwd, log() {} }
  registerTools({ tools: { register(tool) { tools.set(tool.name, tool); return () => {} } } }, deps)
  const exec = { agent: { session: { id: 'delivery' } } }
  const opened = await tools.get('fishpai_open').execute({ path: 'article.md', markdown: '样稿', professional_spec: { body_size: 19, body_color: '#123456' } }, exec)
  assert.equal(opened.isError, false, opened.text)
  const handler = createApiHandler({ ...deps })
  const route = async (options) => {
    const body = { sessionId: 'delivery', docKey: opened.doc_key, mode: 'publish', ...options }
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
      method: 'POST', url: '/fishpai/api/render', headers: { host: 'example.test', origin: 'http://example.test', 'content-type': 'application/json' },
    })
    let result
    await handler(req, { writeHead() {}, end(text) { result = JSON.parse(text) } }, { principal: { kind: 'owner' } })
    return result
  }
  return { cwd, key: opened.doc_key, route, render: (args) => tools.get('fishpai_render').execute(args, exec), read: (name) => fs.readFileSync(path.join(cwd, name), 'utf8') }
}

test('默认及显式导出分别保留同名输入、其他 HTML 和前一次导出', async (t) => {
  const { cwd, render, read } = await setup(t)
  fs.writeFileSync(path.join(cwd, 'article.html'), '来源内容')
  fs.writeFileSync(path.join(cwd, 'article-2.html'), '其他内容')
  for (const [args, name] of [[{}, 'article-3.html'], [{ out_path: 'article.html', markdown: '第二份' }, 'article-4.html']]) {
    const result = await render(args)
    assert.equal(result.isError, false, result.text)
    assert.ok(result.text.includes(`：${name}\n`), result.text)
  }
  assert.equal(read('article.html'), '来源内容')
  assert.equal(read('article-2.html'), '其他内容')
  assert.match(read('article-3.html'), /样稿/)
  assert.match(read('article-4.html'), /第二份/)
})

for (const target of ['professional', 'quick']) {
  test(`${target}：按最终图片校验，缺图不落盘、不开下载，保留引用模式可用`, async (t) => {
    const { cwd, render, route, read } = await setup(t)
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    fs.writeFileSync(path.join(cwd, 'pic.png'), Buffer.from(png, 'base64'))
    const base = { target, out_path: 'out.html', markdown: '![图](pic.png)\n\n`![示意](example.png)`' }
    const missing = { ...base, markdown: base.markdown + '\n\n![待补](missing.png)' }
    const failed = await render(missing)
    assert.equal(failed.isError, true)
    assert.match(failed.text, /missing.png（文件不存在）/)
    assert.equal(fs.existsSync(path.join(cwd, 'out.html')), false)
    const blocked = await route({ ...missing, selfContained: true })
    assert.equal(blocked.ok, false)
    assert.match(blocked.error, /missing.png/)
    assert.equal(blocked.html, undefined)
    const preview = await route({ ...missing, mode: 'preview' })
    assert.equal(preview.ok, true)
    const complete = await render(base)
    assert.equal(complete.isError, false, complete.text)
    assert.match(complete.text, /已内嵌 1 项，保留引用 0 项/)
    assert.ok(read('out.html').includes(png))
    const kept = await render({ ...missing, embed_images: false })
    assert.equal(kept.isError, false, kept.text)
    assert.match(kept.text, /已内嵌 0 项，保留引用 2 项（关闭内嵌）/)
    assert.match(read('out-2.html'), /src="missing.png"/)
  })
}

test('单次专业规格仅覆盖指定字段，工具、面板预览、面板文件导出一致', async (t) => {
  const { cwd, key, render, route, read } = await setup(t)
  const args = { target: 'professional', professional_spec: { body_size: 22 } }
  const result = await render(args)
  assert.equal(result.isError, false, result.text)
  for (const html of [read('article.html'), (await route({ ...args, mode: 'preview' })).html, (await route({ ...args, selfContained: true })).html]) {
    assert.match(html, /font-size:22px/)
    assert.match(html, /#123456/)
  }
  assert.equal(readState(cwd, key).professionalSpec.body_size, 19)
})
