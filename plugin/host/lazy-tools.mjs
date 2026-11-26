/**
 * 工具组懒展开：常驻只占技能目录里的一行 name + description；模型成功 invoke
 * `fishpai` 技能后，才经 ctx.tools.register 注册全部 fishpai_* 工具，此后新组装的
 * 轮次与会话的工具表都包含它们。只用宿主公开的事件与服务。
 *
 * 三个进场通道（任一命中即展开，幂等）：
 *  1. `tools/result` 事件：本轮刚成功 invoke 了 fishpai 技能；
 *  2. `session/event` 流：逐事件折叠，识别 skill-invocation 用户消息与
 *     skill 的 tool/call → tool/result 成对（断线重放）；
 *  3. `session/created` 与启动时全量扫描：恢复的会话若历史里已 invoke 过技能，
 *     直接带工具进场。
 *
 * 注册失败会记日志并在下个 turn/start 或技能消息到达时重试。
 * 返回的 disposer 拆掉全部监听器，并注销已注册的工具组。
 */

/** 触发展开的技能名（与 skills/fishpai/SKILL.md frontmatter 一致）。 */
export const LAZY_SKILL_NAME = 'fishpai'

function record(value) {
  return typeof value === 'object' && value !== null ? value : undefined
}

function isCallId(value) {
  return typeof value === 'string' && value.length > 0
}

/** 解析对象或 JSON 串形态的工具参数，取 name。 */
export function skillNameOf(args) {
  if (typeof args === 'string') {
    try {
      return skillNameOf(JSON.parse(args))
    } catch {
      return undefined
    }
  }
  const obj = record(args)
  return obj && typeof obj.name === 'string' ? obj.name : undefined
}

function isSkillInvocationMessage(data) {
  const source = record(record(data)?.source)
  return source?.kind === 'skill-invocation' && source?.name === LAZY_SKILL_NAME
}

/** 接受 role=tool 消息、单 tool-result 块消息与扁平 tool-result 三种形态。 */
function toolResultOf(data) {
  const message = record(record(data)?.message)
  if (message === undefined) return undefined
  const source = record(message.source)
  if (source?.kind === 'tool') {
    if (message.role === 'tool' && 'toolCallId' in message) {
      if (isCallId(source.callId) && message.toolCallId === source.callId && typeof message.isError === 'boolean') {
        return { callId: source.callId, isError: message.isError }
      }
      return undefined
    }
    const blocks = message.content
    const block = Array.isArray(blocks) && blocks.length === 1 ? record(blocks[0]) : undefined
    if (isCallId(source.callId) && block?.type === 'tool-result' && block.toolCallId === source.callId && typeof block.isError === 'boolean') {
      return { callId: source.callId, isError: block.isError }
    }
    return undefined
  }
  if (isCallId(message.callId) && typeof message.isError === 'boolean') {
    return { callId: message.callId, isError: message.isError }
  }
  return undefined
}

/** 单个会话的只追加历史折叠：只留未结算的 skill 调用。 */
class SkillInvocationState {
  constructor() {
    this.successful = false
    this.pending = new Set()
  }

  consume(event) {
    if (this.successful) return
    const ev = record(event)
    if (ev?.type === 'user/message' && isSkillInvocationMessage(ev.data)) {
      this.successful = true
    } else if (ev?.type === 'tool/call') {
      const data = record(ev.data)
      if (data?.name === 'skill' && skillNameOf(data.arguments) === LAZY_SKILL_NAME && isCallId(data.callId)) {
        this.pending.add(data.callId)
      }
    } else if (ev?.type === 'tool/result') {
      const result = toolResultOf(ev.data)
      if (result !== undefined && this.pending.delete(result.callId)) {
        this.successful = !result.isError
      }
    }
    if (this.successful) this.pending.clear()
  }
}

/**
 * 挂起懒展开。
 * @param {object} ctx Cordis 上下文（用到 on / get / inject / logger）
 * @param {() => () => void} registerSuite 注册全部 fishpai_* 工具，返回合并注销函数
 * @returns {() => void} disposer
 */
export function armLazyTools(ctx, registerSuite) {
  let disposed = false
  let revealPending = false
  let sessionStates = new WeakMap()
  let suiteDisposer
  const disposers = []
  const warn = (msg) => {
    try {
      ctx.logger?.warn?.(msg)
    } catch {
      /* 没有 logger 也不影响功能 */
    }
  }

  const ensureSuite = () => {
    if (disposed || suiteDisposer !== undefined) return
    try {
      suiteDisposer = registerSuite()
      revealPending = false
      sessionStates = new WeakMap()
    } catch (error) {
      suiteDisposer = undefined
      revealPending = true
      warn(`[fishpai] 工具注册失败：${error?.message || error}（下个轮次重试）`)
    }
  }

  const stateFor = (session) => {
    const known = sessionStates.get(session)
    if (known !== undefined) return known
    try {
      const state = new SkillInvocationState()
      const history = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events
      if (history === undefined) return undefined
      for (const event of history) {
        state.consume(event)
        if (state.successful) break
      }
      sessionStates.set(session, state)
      return state
    } catch {
      return undefined
    }
  }

  const scanSession = (session) => {
    if (disposed || suiteDisposer !== undefined || session == null) return
    if (revealPending || stateFor(session)?.successful) ensureSuite()
  }

  const listen = (event, handler) => {
    const off = ctx.on(event, handler)
    if (typeof off === 'function') disposers.push(off)
  }

  if (typeof ctx.on === 'function') {
    listen('tools/result', (exec, result) => {
      if (record(result)?.isError !== false) return
      const e = record(exec)
      if (e?.name === 'skill' && skillNameOf(e.arguments) === LAZY_SKILL_NAME) ensureSuite()
    })
    listen('session/event', (session, event) => {
      if (disposed || suiteDisposer !== undefined) return
      const ev = record(event)
      if ((revealPending && ev?.type === 'turn/start') || (ev?.type === 'user/message' && isSkillInvocationMessage(ev.data))) {
        ensureSuite()
        return
      }
      if (session == null || event == null) return
      const state = stateFor(session)
      state?.consume(event)
      if (state?.successful) ensureSuite()
    })
    listen('session/created', (session) => scanSession(session))
  }

  const scanExisting = (context) => {
    if (disposed || suiteDisposer !== undefined) return
    if (revealPending) {
      ensureSuite()
      return
    }
    try {
      const sessions = typeof context.get === 'function' ? context.get('sessions') : context.sessions
      if (sessions != null && typeof sessions.list === 'function') {
        for (const session of sessions.list()) {
          scanSession(session)
          if (revealPending || suiteDisposer !== undefined) break
        }
      }
    } catch {
      /* 会话服务形态不符时由事件通道接手 */
    }
  }
  scanExisting(ctx)

  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* 拆卸不抛 */
      }
    }
    const off = suiteDisposer
    suiteDisposer = undefined
    off?.()
    sessionStates = new WeakMap()
  }
}
