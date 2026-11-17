import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { inferWritingStyle, htmlToText } from '../plugin/core/learn.mjs'
import { LearnService, fetchPublicPage } from '../plugin/host/learn.mjs'
import { memoryStores } from './memory-stores.mjs'
import { createApiHandler, API_PREFIX } from '../plugin/host/routes.mjs'

function serviceFixture() {
  const stores = memoryStores()
  const service = new LearnService(async () => stores, { now: () => 1700000000000 })
  return { stores, service }
}

test('learn：从可观察文本特征反推风格，并保留证据统计', () => {
  const result = inferWritingStyle({ markdown: '# 问题\n\n你为什么需要它？\n\n## 方法\n\n- 先确认事实\n- 再采取行动\n\n因此，我们从具体例子开始。' })
  assert.match(result.tone, /对话感/)
  assert.match(result.structure, /标题分层/)
  assert.match(result.audience, /读者/)
  assert.ok(result.purpose && result.do && result.dont)
  assert.equal(result.evidence.headings, 2)
  assert.equal(result.evidence.lists, 2)
  assert.equal(htmlToText('<p>A&nbsp;&amp;B</p><script>bad()</script>'), 'A &B')
  assert.throws(() => inferWritingStyle({ markdown: '```\n代码\n```' }), /非空/)
})

test('learn：preview 不入库，confirm 后才写 writing 表', async () => {
  const { stores, service } = serviceFixture()
  const preview = await service.preview({ markdown: '# 标题\n\n因此，我们先解释背景，再说明方法。', styleId: 'calm-guide', sourceName: '示例定稿' })
  assert.equal(preview.style.styleId, 'calm-guide')
  assert.equal(preview.duplicate, false)
  assert.deepEqual(stores.writing.table('styles').keys(), [])
  await assert.rejects(service.commit({ pendingId: preview.pendingId }), /明确确认/)
  const committed = await service.commit({ pendingId: preview.pendingId, confirm: true, style: { tone: '平实，直接' } })
  assert.equal(committed.style.tone, '平实，直接')
  assert.deepEqual(Object.keys(committed.style).sort(), ['audience', 'createdAt', 'do', 'dont', 'purpose', 'sourceName', 'sourceRef', 'structure', 'styleId', 'tone'].sort())
  assert.equal((await service.list()).length, 1)
  await assert.rejects(service.commit({ pendingId: preview.pendingId, confirm: true }), /不存在或已过期/)
  assert.deepEqual(await service.delete({ styleId: 'calm-guide' }), { removed: true })
})

test('learn：重复 styleId 在 preview 明示，工作目录定稿可追溯', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'fishpai-learn-'))
  const { service } = serviceFixture()
  await fs.writeFile(path.join(cwd, 'final.md'), '# 定稿\n\n这是正文，因为事实需要先核清。')
  const first = await service.preview({ path: 'final.md', cwd, styleId: 'same' })
  await service.commit({ pendingId: first.pendingId, confirm: true })
  const second = await service.preview({ path: 'final.md', cwd, styleId: 'same' })
  assert.equal(second.duplicate, true)
  assert.equal(second.style.sourceRef, 'final.md')
  await assert.rejects(service.preview({ path: '../outside.md', cwd }), /工作目录|越界/)
  await fs.rm(cwd, { recursive: true, force: true })
})

test('learn：网页只走 HTTPS，DNS 命中私有地址即拒绝', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return new Response('<p>ok</p>') }
  await assert.rejects(fetchPublicPage('http://example.com', { fetchImpl, lookup: async () => [{ address: '93.184.216.34' }] }), /HTTPS/)
  await assert.rejects(fetchPublicPage('https://example.com', { fetchImpl, lookup: async () => [{ address: '127.0.0.1' }] }), /私有网络/)
  await assert.rejects(fetchPublicPage('https://127.0.0.1', { fetchImpl, lookup: async () => [{ address: '127.0.0.1' }] }), /本机/)
  assert.equal(called, false)
  const page = await fetchPublicPage('https://example.com/a', { fetchImpl, lookup: async () => [{ address: '93.184.216.34' }] })
  assert.equal(page.text, '<p>ok</p>')
  assert.equal(called, true)
})

test('POST /learn：preview/commit/list/delete 共用同一份 pending', async () => {
  const { service } = serviceFixture()
  const handler = createApiHandler({ resolveCwd: () => null, learn: service })
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}${API_PREFIX}/learn`
  const post = async (body) => {
    const response = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  try {
    const preview = await post({ action: 'preview', markdown: '# 标题\n\n你为什么需要这个？\n\n因此，先看事实。', styleId: 'route-style' })
    assert.equal(preview.status, 200)
    const committed = await post({ action: 'commit', pendingId: preview.body.pendingId, confirm: true })
    assert.equal(committed.body.style.styleId, 'route-style')
    assert.equal((await post({ action: 'list' })).body.styles.length, 1)
    assert.equal((await post({ action: 'delete', styleId: 'route-style' })).body.removed, true)
    assert.equal((await post({ action: 'preview', path: 'secret.md' })).status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
