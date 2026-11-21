import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as store from '../plugin/host/store.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import { registerTools } from '../plugin/host/tools.mjs'
import { normalizeSpec } from '../plugin/core/professional/spec.mjs'
import { inlineHtmlImages, listLocalImages } from '../plugin/host/assets.mjs'
import { memoryStores } from './memory-stores.mjs'

const ARTICLE = '# 画布测试\n\n正文颜色应跟随文档设置。\n'

function tmpWorkspace() {
  return store.canonicalCwd(fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-professional-spec-')))
}

function fakeHost(cwd, stores = memoryStores()) {
  const tools = []
  const ctx = {
    tools: { register: (tool) => (tools.push(tool), () => {}) },
    sessions: { get: (id) => (id === 's1' ? { header: { cwd } } : null) },
    logger: { info: () => {} },
  }
  registerTools(ctx, {
    resolveCwd: (id) => (id === 's1' ? cwd : null),
    log: () => {},
    getStores: async () => stores,
  })
  return { tools, exec: { agent: { session: { id: 's1' } } } }
}

function callRoute(handler, { method, url, body }) {
  const req = {
    method,
    url,
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    on(event, callback) {
      if (event === 'data' && body !== undefined) callback(Buffer.from(JSON.stringify(body), 'utf8'))
      if (event === 'end') callback()
      return this
    },
  }
  return new Promise((resolve) => {
    const res = {
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
      },
      end(chunk) {
        const text = chunk ? String(chunk) : ''
        let json = null
        try { json = JSON.parse(text) } catch { /* 非 JSON 响应用于其它测试 */ }
        resolve({ status: this.status, json, text })
      },
    }
    handler(req, res)
  })
}

function stateFile(cwd, key) {
  return path.join(cwd, '.fishpai', 'state', `${key}.json`)
}

test('professionalSpec 默认值为空对象，缺失或损坏的状态读取时回退为空对象', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  assert.deepEqual(opened.state.professionalSpec, {})

  const file = stateFile(cwd, opened.key)
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete raw.professionalSpec
  fs.writeFileSync(file, JSON.stringify(raw), 'utf8')
  assert.deepEqual(store.readState(cwd, opened.key).professionalSpec, {})

  for (const professionalSpec of [null, [], 'bad', { unknown: true }, { body_color: 'red' }]) {
    fs.writeFileSync(file, JSON.stringify({ ...raw, professionalSpec }), 'utf8')
    assert.deepEqual(store.readState(cwd, opened.key).professionalSpec, {})
  }
})

test('updateMeta 保存 normalizeSpec 的完整结果，非法规格清楚报错且不覆盖原状态', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const input = { body_color: '#A1B2C3', body_size: '19', line_height: 2 }
  const updated = store.updateMeta({ cwd, docPath: opened.path, meta: { professionalSpec: input } })
  assert.deepEqual(updated.professionalSpec, normalizeSpec(input))
  assert.deepEqual(store.readState(cwd, opened.key).professionalSpec, normalizeSpec(input))
  assert.equal(updated.professionalSpec.body_color, '#a1b2c3')
  assert.equal(updated.professionalSpec.body_size, 19)

  for (const professionalSpec of [{ unknown: true }, { body_size: 999 }, []]) {
    assert.throws(() => store.updateMeta({ cwd, docPath: opened.path, meta: { professionalSpec } }), /professional_spec|规格|必须/)
    assert.deepEqual(store.readState(cwd, opened.key).professionalSpec, normalizeSpec(input))
  }
})

test('fishpai_open 声明并持久化 professional_spec，文档 meta 回带同一规格；非法输入不建文档', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const open = tools.find((tool) => tool.name === 'fishpai_open')
  assert.equal(open.parameters.properties.professional_spec.type, 'object')

  const input = { body_color: '#ABCDEF', body_size: '18' }
  const result = await open.execute({ path: 'a.md', markdown: ARTICLE, professional_spec: input }, exec)
  assert.equal(result.isError, false, result.text)
  assert.match(result.text, /画布参数已校验并保存/)
  const key = result.doc_key
  assert.deepEqual(store.readState(cwd, key).professionalSpec, normalizeSpec(input))

  const handler = createApiHandler({ resolveCwd: () => cwd })
  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=s1&docKey=${key}` })
  assert.equal(doc.status, 200)
  assert.deepEqual(doc.json.meta.professionalSpec, normalizeSpec(input))

  const reopened = await open.execute({ path: 'a.md', professional_spec: { body_size: 20 } }, exec)
  assert.equal(reopened.isError, false, reopened.text)
  assert.deepEqual(store.readState(cwd, key).professionalSpec, normalizeSpec({ body_size: 20 }))

  const bad = await open.execute({ path: 'bad.md', markdown: ARTICLE, professional_spec: { unknown: true } }, exec)
  assert.equal(bad.isError, true)
  assert.match(bad.text, /未知专业规格键/)
  assert.equal(fs.existsSync(path.join(cwd, 'bad.md')), false)
})

test('POST /meta 与 POST /render 共用文档规格，显式 body.professional_spec 优先且预览发布一致', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const saved = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/meta',
    body: { sessionId: 's1', docKey: opened.key, meta: { professionalSpec: { body_color: '#112233', body_size: 19 } } },
  })
  assert.equal(saved.status, 200)

  for (const mode of ['preview', 'publish']) {
    const fromDocument = await callRoute(handler, {
      method: 'POST',
      url: '/fishpai/api/render',
      body: { sessionId: 's1', docKey: opened.key, target: 'professional', mode },
    })
    assert.equal(fromDocument.status, 200, fromDocument.text)
    assert.match(fromDocument.json.html, /#112233/)
    assert.match(fromDocument.json.html, /font-size:19px/)

    const explicit = await callRoute(handler, {
      method: 'POST',
      url: '/fishpai/api/render',
      body: {
        sessionId: 's1', docKey: opened.key, target: 'professional', mode,
        professional_spec: { body_color: '#445566', body_size: 21 },
      },
    })
    assert.equal(explicit.status, 200, explicit.text)
    assert.match(explicit.json.html, /#445566/)
    assert.match(explicit.json.html, /font-size:21px/)
    assert.doesNotMatch(explicit.json.html, /#112233/)
  }

  const rejected = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/meta',
    body: { sessionId: 's1', docKey: opened.key, meta: { professionalSpec: { unknown: true } } },
  })
  assert.equal(rejected.status, 400)
  assert.match(rejected.json.error, /未知专业规格键/)
})

test('fishpai_render 默认采用文档规格，显式 professional_spec 只覆盖当次且不隐式保存', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const open = tools.find((tool) => tool.name === 'fishpai_open')
  const render = tools.find((tool) => tool.name === 'fishpai_render')
  const opened = await open.execute({ path: 'a.md', markdown: ARTICLE, professional_spec: { body_color: '#112233' } }, exec)
  const key = opened.doc_key

  const fromDocument = await render.execute({ out_path: 'document.html' }, exec)
  assert.equal(fromDocument.isError, false, fromDocument.text)
  assert.match(fs.readFileSync(path.join(cwd, 'document.html'), 'utf8'), /#112233/)

  const once = await render.execute({ out_path: 'once.html', professional_spec: { body_color: '#445566' } }, exec)
  assert.equal(once.isError, false, once.text)
  assert.match(fs.readFileSync(path.join(cwd, 'once.html'), 'utf8'), /#445566/)
  assert.equal(store.readState(cwd, key).professionalSpec.body_color, '#112233')

  const after = await render.execute({ out_path: 'after.html' }, exec)
  assert.equal(after.isError, false, after.text)
  assert.match(fs.readFileSync(path.join(cwd, 'after.html'), 'utf8'), /#112233/)
})

test('专业画布的 raw HTML/SVG 素材在预览中列示，在发布与导出时内嵌', async () => {
  const cwd = tmpWorkspace()
  fs.mkdirSync(path.join(cwd, 'assets'))
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  fs.writeFileSync(path.join(cwd, 'assets', 'pixel.png'), pixel)
  const markdown = '# 素材测试\n\n:::raw\n<section><img src="assets/pixel.png"><svg viewBox="0 0 10 10"><image href="assets/pixel.png" width="10" height="10"/></svg></section>\n:::\n'
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown, by: 'ai' })
  const images = listLocalImages({ markdown, cwd, docPath: opened.path })
  assert.deepEqual(images.map((image) => image.src), ['assets/pixel.png'])
  assert.equal(images[0].embed, true)

  const handler = createApiHandler({ resolveCwd: () => cwd })
  const preview = await callRoute(handler, {
    method: 'POST', url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, target: 'professional', mode: 'preview' },
  })
  assert.equal(preview.status, 200, preview.text)
  assert.match(preview.json.html, /<img src="assets\/pixel.png">/)
  assert.equal(preview.json.images.length, 1)

  const publish = await callRoute(handler, {
    method: 'POST', url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, target: 'professional', mode: 'publish' },
  })
  assert.equal(publish.status, 200, publish.text)
  assert.equal((publish.json.html.match(/data:image\/png;base64,/g) || []).length, 2)
  assert.doesNotMatch(publish.json.html, /(?:src|href)="assets\/pixel.png"/)

  const { tools, exec } = fakeHost(cwd)
  const render = tools.find((tool) => tool.name === 'fishpai_render')
  const result = await render.execute({ doc_key: opened.key, out_path: 'raw-assets.html' }, exec)
  assert.equal(result.isError, false, result.text)
  const exported = fs.readFileSync(path.join(cwd, 'raw-assets.html'), 'utf8')
  assert.equal((exported.match(/data:image\/png;base64,/g) || []).length, 2)

  const untouched = inlineHtmlImages('<img src="missing.png"><image href="https://example.com/a.png">', { cwd, docPath: opened.path })
  assert.equal(untouched, '<img src="missing.png"><image href="https://example.com/a.png">')
})
