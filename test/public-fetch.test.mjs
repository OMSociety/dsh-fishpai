import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchPublicPage } from '../plugin/host/public-fetch.mjs'

const lookup = async () => [{ address: '93.184.216.34' }]
const url = 'https://example.invalid/article'

test('普通网页重定向与正文共用一次总时限', async () => {
  const signals = []
  const page = await fetchPublicPage(url, { lookup, fetchImpl: async (_, { signal }) => {
    signals.push(signal)
    return signals.length === 1 ? Response.redirect(`${url}/final`) : new Response('普通正文')
  } })
  assert.equal(page.text, '普通正文')
  assert.equal(page.finalUrl, `${url}/final`)
  assert.equal(signals.length, 2)
  assert.equal(signals[0], signals[1])
})

test('普通慢响应在读取正文期间报告总时限并取消请求', async () => {
  let aborted = false
  await assert.rejects(fetchPublicPage(url, { lookup, timeoutMs: 20, fetchImpl: async (_, { signal }) => {
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('第一段'))
      signal.addEventListener('abort', () => { aborted = true; stream.close() }, { once: true })
    } }))
  } }), /网页抓取超时：总时限 20 毫秒/)
  assert.equal(aborted, true)
})

test('查询在总时限后完成时不发起网页请求', async () => {
  let finishLookup
  let requests = 0
  const slowLookup = () => new Promise((resolve) => { finishLookup = resolve })
  await assert.rejects(fetchPublicPage(url, { lookup: slowLookup, timeoutMs: 20, fetchImpl: () => { requests++; return new Response('正文') } }), /总时限/)
  finishLookup(await lookup())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(requests, 0)
})
