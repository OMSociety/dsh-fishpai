import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { SnippetService } from '../plugin/host/snippets.mjs'
import { importArticleDocument } from '../plugin/host/importer.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import * as store from '../plugin/host/store.mjs'

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-host-review-'))
}

async function callRoute(handler, method, requestPath, body, sessionId = 'session-1') {
  const headers = {
    host: '127.0.0.1:53136',
    origin: 'http://127.0.0.1:53136',
    'content-type': 'application/json',
    'x-fishpai-session': sessionId,
  }
  let payload = ''
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = requestPath
  req.headers = headers
  const res = {
    statusCode: 200,
    writeHead(code) { this.statusCode = code },
    setHeader() {},
    end(chunk) { payload = String(chunk || '') },
  }
  await handler(req, res)
  return { status: res.statusCode, body: JSON.parse(payload) }
}

function record(name) {
  return { id: name, name, headerHtml: `<section>${name}</section>`, footerHtml: '<p>完</p>', footerImg: '', createdAt: '2026-01-01T00:00:00.000Z' }
}

test('SNIP-01：list 等待真实异步 keys，并按 name 主键返回完整条目', async () => {
  const rows = new Map([['zeta', record('zeta')], ['alpha', record('alpha')]])
  const table = {
    get: (key) => rows.get(key),
    keys: async () => rows.keys(),
    put: async (key, value) => { rows.set(key, value) },
    delete: async (key) => rows.delete(key),
  }
  const service = new SnippetService(async () => ({ snippets: { table: () => table } }))
  assert.deepEqual((await service.list()).map((entry) => entry.id), ['alpha', 'zeta'])
  assert.deepEqual((await service.list())[0], record('alpha'))
  assert.equal(await service.delete('alpha'), true)
  assert.equal(rows.has('alpha'), false)
})

test('HOST-01：同 out_path 并发导入只成功一篇，失败方返回 409 且磁盘保留胜稿', async () => {
  const cwd = workspace()
  const options = { cwd, sessionId: 'session-1' }
  const first = importArticleDocument({ html: '<h1>第一篇</h1><p>甲</p>', out_path: 'race.md' }, options)
  const second = importArticleDocument({ html: '<h1>第二篇</h1><p>乙</p>', out_path: 'race.md' }, options)
  const results = await Promise.allSettled([first, second])
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  assert.equal(fulfilled.length, 1, '同一路径只能有一个导入成功')
  assert.equal(rejected.length, 1, '另一个导入必须明确失败')
  assert.equal(rejected[0].reason.statusCode, 409)
  assert.equal(rejected[0].reason.code, 'CONFLICT')
  assert.match(rejected[0].reason.message, /race\.md.*已存在|已存在.*race\.md/)
  const markdown = fs.readFileSync(path.join(cwd, 'race.md'), 'utf8')
  const winnerHeading = results.findIndex((result) => result.status === 'fulfilled') === 0 ? '# 第一篇' : '# 第二篇'
  assert.equal(markdown.includes(winnerHeading), true)
  assert.equal(['# 第一篇', '# 第二篇'].filter((heading) => markdown.includes(heading)).length, 1)
})

async function stateWithOutsideReference(property) {
  const cwd = workspace()
  const { key, state } = store.openDoc({ cwd, docPath: 'private.md', markdown: '# 私有正文\n' })
  const outside = path.join(path.dirname(cwd), `${path.basename(cwd)}-outside.md`)
  fs.writeFileSync(outside, 'OUTSIDE-SECRET')
  const statePath = path.join(cwd, '.fishpai', 'state', `${key}.json`)
  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  if (property === 'history') persisted.history[0].file = path.relative(cwd, outside)
  else persisted.baseline.file = path.relative(cwd, outside)
  fs.writeFileSync(statePath, JSON.stringify(persisted))
  return { cwd, key, state }
}

test('HOST-02：history.file 越界是损坏状态，不能读取工作目录外内容', async () => {
  const { cwd, key } = await stateWithOutsideReference('history')
  const persisted = store.readState(cwd, key)
  assert.throws(() => store.readHistoryEntry(cwd, key, persisted.history[0].id), /状态损坏|越界/)
})

test('HOST-02：baseline.file 越界是损坏状态，不能读取工作目录外内容', async () => {
  const { cwd, key } = await stateWithOutsideReference('baseline')
  const persisted = store.readState(cwd, key)
  assert.throws(() => store.baselineContent(cwd, persisted), /状态损坏|越界/)
})

test('HOST-03：非法 base64 与伪造 PNG 经 POST /upload 返回 400 且不落盘', async () => {
  const cwd = workspace()
  const { key } = store.openDoc({ cwd, docPath: 'upload.md', markdown: '# 上传\n' })
  const handler = createApiHandler({ requestRejection: () => undefined, resolveCwd: () => cwd, getStores: async () => { throw new Error('unused') } })
  for (const data of ['***not-base64***', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')]) {
    const response = await callRoute(handler, 'POST', '/fishpai/api/upload', { docKey: key, sessionId: 'session-1', mime: 'image/png', data, name: 'fake.png' })
    assert.equal(response.status, 400)
    assert.equal(response.body.ok, false)
    assert.match(response.body.error, /base64|图片.*格式|图片.*内容|不是.*图片/)
  }
  const assets = path.join(cwd, 'assets')
  assert.deepEqual(fs.existsSync(assets) ? fs.readdirSync(assets) : [], [])
})

test('HOST-03：声明格式的真实 magic bytes 合法上传不回归', async () => {
  const cwd = workspace()
  store.openDoc({ cwd, docPath: 'magic.md', markdown: '# 图片\n' })
  const samples = [
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])],
    ['image/gif', Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'binary')],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBP')])],
    ['image/bmp', Buffer.from([0x42, 0x4d, 0x1e, 0, 0, 0])],
  ]
  for (const [mime, bytes] of samples) {
    const saved = store.saveAsset({ cwd, docPath: 'magic.md', mime, data: bytes.toString('base64'), name: `sample.${mime.split('/')[1]}` })
    assert.equal(saved.bytes, bytes.length)
    assert.deepEqual(fs.readFileSync(saved.path), bytes)
  }
})

test('HOST-04：storageDomain 打开失败时 themes/state 降级而不是整体 500', async () => {
  const cwd = workspace()
  const { key } = store.openDoc({ cwd, docPath: 'degraded.md', markdown: '# 降级\n' })
  store.setActive(cwd, 'session-1', key)
  const statePath = path.join(cwd, '.fishpai', 'state', `${key}.json`)
  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  persisted.theme = 'custom:missing'
  fs.writeFileSync(statePath, JSON.stringify(persisted))
  const failure = new Error('storageDomain unavailable')
  const handler = createApiHandler({ requestRejection: () => undefined, resolveCwd: () => cwd, getStores: async () => { throw failure } })
  const themes = await callRoute(handler, 'GET', '/fishpai/api/themes')
  assert.equal(themes.status, 200)
  assert.equal(themes.body.ok, true)
  assert.ok(themes.body.themes.length > 0)
  assert.equal(themes.body.storage.available, false)
  assert.match(themes.body.storage.error, /用户级存储不可用/)
  const current = await callRoute(handler, 'GET', '/fishpai/api/state?sessionId=session-1')
  assert.equal(current.status, 200)
  assert.equal(current.body.ok, true)
  assert.equal(current.body.active.theme, 'default')
  assert.equal(current.body.storage.available, false)
  assert.equal(store.readState(cwd, key).theme, 'custom:missing')
})
