/**
 * 客户端接口层（client/api.ts）的直接测试。
 *
 * 为什么单独测：这个文件是面板与宿主之间唯一的信封——状态码怎么翻成异常、错误文案取哪个字段、
 * 什么时候带 `content-type`，全在这里决定。store 的时序测试把 `./api` 整个换成了桩，
 * 于是这一层过去没有任何直接覆盖：409 变 `ConflictError` 的映射改坏了也没人发现。
 *
 * 做法：esbuild 现场把 api.ts 打成一个 ESM 模块（它零 import，打包很轻），
 * 用全局 fetch 桩喂各种响应，直接断言抛出的异常与请求头。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_SRC = path.join(ROOT, 'client', 'api.ts')

const result = await build({
  entryPoints: [API_SRC],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2020',
  charset: 'utf8',
})
const { api, ConflictError } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text, 'utf8').toString('base64')}`
)

/** 换一个 fetch 桩：记下调用，按给定响应回。 */
const withFetch = (responder) => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return responder(url, init)
  }
  return calls
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

test('api：成功响应原样返回，请求走 /fishpai/api 前缀', async () => {
  const calls = withFetch(() => jsonResponse(200, { ok: true, cwd: '/tmp/x', active: null }))
  const out = await api.state('s1')
  assert.equal(out.cwd, '/tmp/x')
  assert.match(calls[0].url, /^\/fishpai\/api\/state\?sessionId=s1$/)
})

test('api：409 + conflict 翻成 ConflictError，且带上服务端的 revision 与 markdown', async () => {
  withFetch(() => jsonResponse(409, { ok: false, conflict: true, revision: 7, markdown: '服务端的字' }))
  await assert.rejects(
    () => api.save('s1', 'k1', '我改的', 3),
    (error) => {
      assert.ok(error instanceof ConflictError, `应当是 ConflictError，实际 ${error.constructor.name}`)
      assert.equal(error.revision, 7)
      assert.equal(error.markdown, '服务端的字')
      assert.match(error.message, /revision 冲突：服务端是 7/)
      return true
    },
  )
})

test('api：409 但没有 conflict 标记时按普通错误处理，不当成冲突', async () => {
  withFetch(() => jsonResponse(409, { ok: false, error: '这不是冲突' }))
  await assert.rejects(
    () => api.save('s1', 'k1', 'x', 1),
    (error) => {
      assert.ok(!(error instanceof ConflictError), '没有 conflict 字段就不该走冲突分支')
      assert.equal(error.message, '这不是冲突')
      return true
    },
  )
})

test('api：错误文案优先用响应体的 error 字段，没有才回落到状态码', async () => {
  withFetch(() => jsonResponse(400, { ok: false, error: '正文文件读不出来（可能被删除或改名）：a.md' }))
  await assert.rejects(() => api.doc('s1', 'k1'), /正文文件读不出来/)

  withFetch(() => jsonResponse(500, null))
  await assert.rejects(() => api.doc('s1', 'k1'), /请求失败（HTTP 500）/)

  // 响应体不是 JSON 时也不能把解析异常漏出去
  withFetch(() => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error('not json')
    },
  }))
  await assert.rejects(() => api.doc('s1', 'k1'), /请求失败（HTTP 502）/)
})

test('api：ok:false 但 HTTP 200 也算失败（信封以 ok 为准）', async () => {
  withFetch(() => jsonResponse(200, { ok: false, error: '会话不存在' }))
  await assert.rejects(() => api.state('s1'), /会话不存在/)
})

test('api：只有带 body 的请求才设 content-type，GET 不设', async () => {
  const calls = withFetch(() => jsonResponse(200, { ok: true, active: null }))
  await api.state('s1')
  assert.equal(calls[0].init?.headers, undefined, 'GET 不该带 content-type')

  calls.length = 0
  await api.save('s1', 'k1', '字', 1)
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    sessionId: 's1',
    docKey: 'k1',
    markdown: '字',
    baseRevision: 1,
  })
})

test('api：查询参数逐个 encodeURIComponent（docKey 带斜杠也不破 URL）', async () => {
  const calls = withFetch(() => jsonResponse(200, { ok: true, doc: {}, meta: {}, blocks: [], notes: [], placeholders: [], images: [], history: [] }))
  await api.doc('s1', 'assets/a b.md')
  assert.match(calls[0].url, /docKey=assets%2Fa%20b\.md/)
})

test('api：assetUrl 走同一个前缀并把参数编码', () => {
  const url = api.assetUrl('s1', 'k1', 'assets/图 1.png')
  assert.match(url, /^\/fishpai\/api\/asset\?/)
  assert.match(url, /src=assets%2F%E5%9B%BE%201\.png/)
})
