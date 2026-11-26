/**
 * 工具懒展开：三条进场通道、失败重试与拆卸。宿主为结构型桩。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { armLazyTools, skillNameOf, LAZY_SKILL_NAME } from '../plugin/host/lazy-tools.mjs'

function makeHost(sessions = []) {
  const handlers = new Map()
  const ctx = {
    on(event, handler) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return () => {
        const i = (handlers.get(event) ?? []).indexOf(handler)
        if (i >= 0) handlers.get(event).splice(i, 1)
      }
    },
    get: (name) => (name === 'sessions' ? { list: () => sessions } : undefined),
    logger: { warn: () => {} },
  }
  const fire = (event, ...args) => {
    for (const h of [...(handlers.get(event) ?? [])]) h(...args)
  }
  const count = () => [...handlers.values()].reduce((n, l) => n + l.length, 0)
  return { ctx, fire, count }
}

function suite() {
  const state = { registered: 0, disposed: 0, failNext: false }
  const register = () => {
    if (state.failNext) {
      state.failNext = false
      throw new Error('boom')
    }
    state.registered++
    return () => state.disposed++
  }
  return { state, register }
}

const invoke = { name: 'skill', arguments: { name: LAZY_SKILL_NAME } }

test('skillNameOf 解析对象与 JSON 串', () => {
  assert.equal(skillNameOf({ name: 'fishpai' }), 'fishpai')
  assert.equal(skillNameOf('{"name":"fishpai"}'), 'fishpai')
  assert.equal(skillNameOf('not json'), undefined)
  assert.equal(skillNameOf({}), undefined)
})

test('tools/result：成功 invoke fishpai 后展开一次，失败或其它技能不展开', () => {
  const host = makeHost()
  const s = suite()
  armLazyTools(host.ctx, s.register)
  assert.equal(s.state.registered, 0)
  host.fire('tools/result', invoke, { isError: true })
  host.fire('tools/result', { name: 'skill', arguments: { name: 'ppt-maker' } }, { isError: false })
  host.fire('tools/result', { name: 'fishpai_open', arguments: {} }, { isError: false })
  assert.equal(s.state.registered, 0)
  host.fire('tools/result', invoke, { isError: false })
  host.fire('tools/result', invoke, { isError: false })
  assert.equal(s.state.registered, 1)
})

test('session/event：skill-invocation 用户消息与 call/result 成对都能展开', () => {
  const a = makeHost()
  const sa = suite()
  armLazyTools(a.ctx, sa.register)
  a.fire('session/event', {}, { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'fishpai' } } })
  assert.equal(sa.state.registered, 1)

  const b = makeHost()
  const sb = suite()
  armLazyTools(b.ctx, sb.register)
  const session = { events: [] }
  b.fire('session/event', session, { type: 'tool/call', data: { name: 'skill', arguments: '{"name":"fishpai"}', callId: 'c1' } })
  assert.equal(sb.state.registered, 0)
  b.fire('session/event', session, { type: 'tool/result', data: { message: { callId: 'c1', isError: false } } })
  assert.equal(sb.state.registered, 1)
})

test('session/event：失败的 skill 调用不展开', () => {
  const host = makeHost()
  const s = suite()
  armLazyTools(host.ctx, s.register)
  const session = { events: [] }
  host.fire('session/event', session, { type: 'tool/call', data: { name: 'skill', arguments: { name: 'fishpai' }, callId: 'c1' } })
  host.fire('session/event', session, { type: 'tool/result', data: { message: { callId: 'c1', isError: true } } })
  assert.equal(s.state.registered, 0)
})

test('启动扫描与 session/created：历史里已 invoke 过技能的会话直接展开', () => {
  const history = [
    { type: 'tool/call', data: { name: 'skill', arguments: { name: 'fishpai' }, callId: 'c9' } },
    { type: 'tool/result', data: { message: { role: 'tool', toolCallId: 'c9', isError: false, source: { kind: 'tool', callId: 'c9' } } } },
  ]
  const a = makeHost([{ snapshotEvents: () => history }])
  const sa = suite()
  armLazyTools(a.ctx, sa.register)
  assert.equal(sa.state.registered, 1)

  const b = makeHost([])
  const sb = suite()
  armLazyTools(b.ctx, sb.register)
  assert.equal(sb.state.registered, 0)
  b.fire('session/created', { events: history })
  assert.equal(sb.state.registered, 1)
})

test('注册失败后在下个 turn/start 重试', () => {
  const host = makeHost()
  const s = suite()
  s.state.failNext = true
  armLazyTools(host.ctx, s.register)
  host.fire('tools/result', invoke, { isError: false })
  assert.equal(s.state.registered, 0)
  host.fire('session/event', {}, { type: 'turn/start' })
  assert.equal(s.state.registered, 1)
})

test('disposer 拆监听器并注销已展开的工具组', () => {
  const host = makeHost()
  const s = suite()
  const dispose = armLazyTools(host.ctx, s.register)
  assert.ok(host.count() > 0)
  host.fire('tools/result', invoke, { isError: false })
  dispose()
  dispose()
  assert.equal(host.count(), 0)
  assert.equal(s.state.disposed, 1)
  host.fire('tools/result', invoke, { isError: false })
  assert.equal(s.state.registered, 1)
})
