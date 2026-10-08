/**
 * 客户端入口：把鱼排面板挂到 **官方右侧栏**（`sidebarRightTabs` + `sidebar.right.pane.tab`）。
 *
 * 轮询（3s）承担"宿主 → 浏览器"的唯一推送：
 *   - `openRequest` 出现 → 自动打开/展开面板（模型调用 fishpai_open 后用户立刻看到）
 *   - `active.revision` 变了 → 通知面板（干净就静默重载，有改动只提示）
 */
import * as React from 'react'
import { Panel } from './panel'
import { createFishpaiStore, type FishpaiStore } from './store'
import { ensureStyles } from './styles'
import { FishMark } from './icons'
import { api } from './api'

export const name = 'dsh-fishpai'

/**
 * 客户端硬依赖：槽位系统（注册面板）与会话服务（拿当前会话）。
 * 两者都是核心提供的，永远在；右侧栏本身走延迟注入——它缺席时不拖垮插件。
 */
export const inject = ['slots', 'sessions']

const TAB_ID = 'dsh-fishpai'
const TAB_KIND = 'fishpai'
const POLL_MS = 3000

function pick(injected: any, key: string): any {
  if (!injected) return undefined
  try {
    if (typeof injected.get === 'function') {
      const value = injected.get(key)
      if (value !== undefined) return value
    }
  } catch {
    /* 未声明该服务时 get 会抛，退回属性访问 */
  }
  return injected[key]
}

/** 服务只能通过 ctx.get 读（直接 ctx.xxx 访问未声明的服务会抛）。 */
function service(ctx: any, key: string): any {
  try {
    return typeof ctx.get === 'function' ? ctx.get(key) : undefined
  } catch {
    return undefined
  }
}

/**
 * 「界面上当前选中的会话」，两代宿主各有一条读法，全都拿不到时退到"只有一个会话"：
 *   - 0.1.5 线：选中态挂在会话列表快照上（`list.getSnapshot().current`）；
 *   - 0.1.7 起客户端 Session 多实例共存，列表快照不再携带选中态（`current` 随
 *     SessionListState 收窄而移除），屏幕上那个会话由右侧栏座位的挂载态公开
 *     （`ISidebarRight.mounted`），所以走注入回调捕获的读取函数。
 * 返回 null 就让轮询这一轮空转，下一轮再试——绝不瞎猜会话（猜错会把别的会话的
 * 打开请求算到当前头上）。
 */
function currentSessionId(ctx: any, readMounted?: () => string | null): string | null {
  try {
    const sessions = service(ctx, 'sessions')
    const snapshot = sessions?.list?.getSnapshot?.()
    if (snapshot?.current) return snapshot.current
    const mounted = readMounted?.() || null
    if (mounted) return mounted
    if (Array.isArray(snapshot?.ids) && snapshot.ids.length === 1) return snapshot.ids[0]
    return null
  } catch {
    return null
  }
}

export function apply(ctx: any): void {
  const stores = new Map<string, FishpaiStore>()
  const disposeStyles = ensureStyles()
  ctx.effect(() => () => disposeStyles(), 'fishpai: 面板样式')

  // 右侧栏座位的挂载会话读取函数，由通道一的注入回调捕获（0.1.7 线读"当前会话"就靠它）。
  let getMountedSession: (() => string | null) | null = null
  const readMounted = (): string | null => {
    try {
      return getMountedSession ? getMountedSession() : null
    } catch {
      return null
    }
  }

  const storeFor = (sessionId: string): FishpaiStore => {
    let store = stores.get(sessionId)
    if (!store) {
      store = createFishpaiStore(sessionId)
      stores.set(sessionId, store)
    }
    return store
  }

  /** 面板组件：per-session 取同一个 store，保证开关面板不丢编辑状态。 */
  function PanelHost(props: any) {
    // 优先用槽位给的 sessionId。拿不到时退回"界面上当前选中的会话"：这不只是兜底——
    // 右侧栏本身就是 per-session 的（rightbar.session 按当前会话挂载），
    // 所以"当前会话"与"这个面板所属会话"在实际产品里是同一个。
    const sessionId = props?.sessionId || currentSessionId(ctx, readMounted)
    const store = React.useMemo(() => (sessionId ? storeFor(sessionId) : null), [sessionId])
    if (!sessionId || !store) {
      return React.createElement('div', { className: 'fp-root' }, '鱼排：拿不到当前会话，请在一个会话里打开。')
    }
    return React.createElement(Panel, { store, sessionId })
  }

  /**
   * 标签页（tab chip）里的标题。鱼形标画在这里——官方右侧栏的 chip 内容就是本组件，
   * 不注册它 chip 就只有一行字（没有图标位可填）。
   */
  function Title() {
    return React.createElement(
      'span',
      { className: 'fp-title-label' },
      React.createElement(FishMark, { size: 14, className: 'fp-title-glyph' }),
      '鱼排编辑器',
    )
  }

  // ── 打开面板（官方右侧栏）──────────────────────────────────
  // 席位是异步到位的，所以这里只保存"官方打开方式"，由 openPanel() 现取。
  let openOfficial: (() => void) | null = null
  const openPanel = () => {
    if (!openOfficial) throw new Error('官方右侧栏尚未就绪')
    openOfficial()
  }

  const openIfRequested = (sessionId: string, docKey: string) => {
    try {
      openPanel?.()
    } catch (error) {
      console.warn('[dsh-fishpai] 打开面板失败，下一次轮询会重试：', error)
      return false
    }
    storeFor(sessionId)
    void api.tabOpened(sessionId, docKey).catch(() => {})
    return true
  }

  // ── 官方右侧栏席位 ─────────────────────────────────────────
  // 注意：`ctx.inject(deps, cb)` 的回调**不是同步执行**的（cordis 在 Fiber._reload 里先
  // `await Promise.resolve()` 再跑 apply），所以"注册完同步回头检查"这类判断必然落空。
  let seatHandle: any = null
  try {
    seatHandle = ctx.inject(['sidebarRightTabs', 'sidebarRight'], (injected: any) => {
      const tabs = pick(injected, 'sidebarRightTabs')
      const sidebarRight = pick(injected, 'sidebarRight')

      // 0.1.7 线读"当前会话"：右侧栏座位挂载的会话就是屏幕上那个（ISidebarRight.mounted）。
      // 旧版没有这个公开字段，读不到就返回 null、走别的读法。
      // 装在 tab 注册守卫之前：挂载读法与注册无关，裁剪构建（有 mounted、没有席位注册）也要能读。
      getMountedSession = () => {
        try {
          return sidebarRight?.mounted?.getSnapshot?.() || null
        } catch {
          return null
        }
      }
      if (!tabs || typeof tabs.register !== 'function') return

      const disposers: Array<() => void> = []
      disposers.push(
        tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => '鱼排编辑器',
          guide: [
            {
              // 0.1.7 起 guide 条目契约要求稳定 id（注册时的唯一性检查与渲染 key 都按它走）；
              // 旧版注册处不读这个字段，多了无害。
              id: 'editor',
              order: 45,
              title: () => '鱼排编辑器',
              description: () => '公众号排版：Markdown + 实时预览 + 与模型来回改稿',
              // 不给 icon 的话，新标签页的引导列表画一个默认的立方体占位（就是"看着像缺图标"的那个）
              icon: FishMark,
            },
          ],
        }),
      )

      const slots = ctx.slots
      if (slots && typeof slots.inject === 'function') {
        disposers.push(
          slots.inject('sidebar.right.pane.tab', () =>
            slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, PanelHost),
          ),
        )
        disposers.push(
          slots.inject('sidebar.right.pane.tab.title', () =>
            slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, Title),
          ),
        )
      }

      if (sidebarRight && typeof sidebarRight.openTab === 'function') {
        openOfficial = () => sidebarRight.openTab(TAB_KIND)
      }

      const dispose = () => {
        for (const off of disposers.reverse()) {
          try {
            off()
          } catch {
            /* 卸载失败不影响其它席位 */
          }
        }
        openOfficial = null
        getMountedSession = null
      }
      return dispose
    })
  } catch (error) {
    console.warn('[dsh-fishpai] 官方右侧栏席位注入失败：', error)
  }

  // ── 轮询：唯一的"宿主 → 页面"推送 ───────────────────────────
  ctx.effect(() => {
    let stopped = false
    let warned = false
    let lastRevision = -1
    let lastKey: string | null = null
    let lastTheme = ''
    let lastSession = ''
    /** 已经轮询过的会话：第一次 tick 不触发 onActiveDoc（面板自己会 init），之后不再抑制。 */
    const seenSessions = new Set<string>()
    const tick = async () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      const sessionId = currentSessionId(ctx, readMounted)
      if (!sessionId) return
      try {
        const st = await api.state(sessionId)
        warned = false
        if (sessionId !== lastSession) {
          lastSession = sessionId
          lastKey = null
          lastRevision = -1
          lastTheme = ''
        }
        if (st.openRequest && st.openRequest.key) {
          openIfRequested(sessionId, st.openRequest.key)
        }
        const activeKey = st.active ? st.active.key : null
        const revision = st.active ? st.active.revision : -1
        // 主题也要看：模型换主题（`fishpai_theme`）**不会**动 revision，只看 revision 就发现不了
        const themeKey = st.active ? st.active.theme : ''
        // 第一次轮询不触发 onActiveDoc：面板自己的 init() 已经载入了当前文档。
        // 这必须是**一次性**标志，不能从 lastKey/lastRevision 派生——
        // 「没有活动文档」时它们恒为 null/-1，于是每 tick 都被判成首次，
        // onActiveDoc 永远不被调用；用户先打开空面板、再让模型 fishpai_open 时，
        // 面板就一直卡在空态（onActiveDoc 里那条 `!state.docKey → loadDoc` 的兜底根本到不了）。
        const firstPoll = !seenSessions.has(sessionId)
        seenSessions.add(sessionId)
        const switched = activeKey !== lastKey || revision !== lastRevision || themeKey !== lastTheme
        lastKey = activeKey
        lastRevision = revision
        lastTheme = themeKey
        // 不仅看 revision：模型可能换了一篇文档（fishpai_open 另一篇），此时 key 会变
        const store = stores.get(sessionId)
        if (store && switched && !firstPoll && activeKey) void store.actions.onActiveDoc(activeKey, revision, themeKey)
      } catch (error) {
        // 宿主刚起来时路由可能还没注册：每个"未就绪期"只报一次，别每 3 秒刷屏
        if (!warned) {
          warned = true
          console.warn('[dsh-fishpai] 轮询失败（宿主路由可能尚未就绪）：', error)
        }
      }
    }
    const timer = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      stopped = true
      clearInterval(timer)
      seatHandle?.dispose?.()
      for (const store of stores.values()) store.dispose()
      stores.clear()
    }
  }, 'fishpai: 轮询与生命周期')
}
