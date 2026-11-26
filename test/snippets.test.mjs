import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { extractSnippets, sanitizeFragment, composeMarkdown } from '../plugin/core/snippets.mjs'
import { SnippetService } from '../plugin/host/snippets.mjs'
import { createApiHandler, API_PREFIX } from '../plugin/host/routes.mjs'
import { memoryStores } from './memory-stores.mjs'

test('snippets：首个 mmbiz 图与可配置页尾锚点', () => {
  const html = '<section><p>正文</p><img data-src="https://mmbiz.qpic.cn/a.png"><section><p>关注公众号</p><img src="https://mmbiz.qpic.cn/f.png"></section></section>'
  const result = extractSnippets(html, { footerAnchors: ['关注公众号'] })
  assert.match(result.headerHtml, /a\.png/)
  assert.match(result.footerHtml, /关注公众号/)
  assert.equal(result.footerImg, 'https://mmbiz.qpic.cn/f.png')
  assert.throws(() => extractSnippets(html), /用户显式配置/)
})

test('snippets：清掉脚本、事件与危险协议', () => {
  const clean = sanitizeFragment('<section onclick="x()"><script>alert(1)</script><a href="javascript:x()">关注</a></section>')
  assert.equal(clean.includes('<script'), false)
  assert.equal(clean.includes('onclick'), false)
  assert.equal(clean.includes('javascript:'), false)
  assert.match(clean, /关注/)
})

test('snippets：pending 确认后入库，compose 在渲染前装配', async () => {
  const stores = memoryStores()
  const service = new SnippetService(async () => stores)
  const pending = await service.preview({ name: '研究尾注', footerHtml: '<section><p>作者：研究者</p></section>' })
  assert.equal(await stores.snippets.table('snippets').get('研究尾注'), undefined)
  await assert.rejects(() => service.commit({ pendingId: pending.pendingId, confirm: false }), /confirm/)
  const committed = await service.commit({ pendingId: pending.pendingId, confirm: true })
  assert.equal(committed.id, '研究尾注')
  assert.equal((await service.list())[0].id, '研究尾注')
  assert.equal((await service.list())[0].headerHtml, null)
  const markdown = await service.compose('# 标题\n\n正文', '研究尾注')
  assert.match(markdown, /作者：研究者/)
  assert.equal(await service.delete('研究尾注'), true)
})

test('同名候选同时确认仅接受首项，force 候选也绑定预览基线', async () => {
  const stores = memoryStores()
  const service = new SnippetService(async () => stores)
  const preview = (text, force = false) => service.preview({ name: '尾注', footerHtml: `<p>${text}</p>`, force })
  const commit = ({ pendingId }) => service.commit({ pendingId, confirm: true })
  const [first, second] = await Promise.all([preview('甲'), preview('乙')])
  const results = await Promise.allSettled([commit(first), commit(second)])
  assert.equal(results[0].status, 'fulfilled')
  assert.match(results[1].reason.message, /预览后已变更/)
  assert.equal((await service.get('尾注')).footerHtml, '<p>甲</p>')
  const [third, fourth] = await Promise.all([preview('丙', true), preview('丁', true)])
  await commit(fourth)
  await assert.rejects(commit(third), /预览后已变更/)
  assert.equal((await service.get('尾注')).footerHtml, '<p>丁</p>')
})

test('snippets：URL 预览沿用公开网页抓取边界', async () => {
  const stores = memoryStores()
  const service = new SnippetService(async () => stores, {
    fetchPage: async () => ({
      text: '<html><head><title>样文</title></head><body><img src="https://mmbiz.qpic.cn/a.png"><section>星标我们</section></body></html>',
      contentType: 'text/html; charset=utf-8',
      finalUrl: 'https://example.com/final',
    }),
  })
  const pending = await service.preview({ name: '网页片段', url: 'https://example.com/a', footerAnchors: ['星标我们'] })
  assert.equal(pending.sourceName, '样文')
  assert.equal(pending.sourceRef, 'https://example.com/final')
  assert.match(pending.snippet.footerHtml, /星标我们/)
})

test('POST /snippets：preview/commit/list 共用 pending，并等待异步 KvTable', async () => {
  const stores = memoryStores()
  const table = stores.snippets.table('snippets')
  const asyncStores = {
    ...stores,
    snippets: {
      table: (name) => {
        assert.equal(name, 'snippets')
        return {
          get: async (key) => table.get(key),
          keys: async () => table.keys(),
          put: async (key, value) => table.put(key, value),
          delete: async (key) => table.delete(key),
        }
      },
    },
  }
  const snippets = new SnippetService(async () => asyncStores)
  const handler = createApiHandler({ resolveCwd: () => process.cwd(), getStores: async () => asyncStores, snippets })
  const server = createServer((req, res) => { if (req.url.startsWith(API_PREFIX)) return handler(req, res, { principal: { kind: 'owner' } }); res.statusCode = 404; res.end() })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const call = async (body) => {
    const response = await fetch(`${origin}${API_PREFIX}/snippets`, { method: 'POST', headers: { host: `127.0.0.1:${server.address().port}`, origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's', ...body }) })
    return response.json()
  }
  try {
    const preview = await call({ action: 'preview', name: '尾部', footerHtml: '<section>完</section>' })
    assert.equal(preview.ok, true)
    assert.ok(preview.pendingId)
    const committed = await call({ action: 'commit', pendingId: preview.pendingId, confirm: true })
    assert.equal(committed.snippet.id, '尾部')
    assert.equal(committed.snippet.name, '尾部')
    const listed = (await call({ action: 'list' })).snippets
    assert.deepEqual(listed.map((entry) => entry.id), ['尾部'])
    assert.equal(listed[0].footerHtml, '<section>完</section>')
  } finally { server.close(); await once(server, 'close') }
})

test('SnippetService：list 等待异步 keys 并按 name 排序返回完整条目，delete 删主键', async () => {
  const record = (name) => ({ id: name, name, headerHtml: `<section>${name}</section>`, footerHtml: '<p>完</p>', footerImg: '', createdAt: '2026-01-01T00:00:00.000Z' })
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