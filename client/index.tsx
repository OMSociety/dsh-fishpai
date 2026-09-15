/**
 * 客户端入口：把鱼排面板挂到 **官方右侧栏**（`sidebarRightTabs` + `sidebar.right.pane.tab`），
 * 并在只有 `dsh-better-sidebar` 的环境里回退成它的 tab。
 *
 * 为什么两条通道都要：官方右侧栏只在 DSH 0.1.5 线提供 `sidebarRightTabs`；
 * 老版本/被裁剪的构建上它就是不存在。双通道的写法照本机同样跑在 DSH 上的
 * `dsh-github-workbench`（官方席位 + better-sidebar 回退）——那是在这台机器上验证过的先例。
 *
 * 轮询（3s）承担"宿主 → 浏览器"的唯一推送：
 *   - `openRequest` 出现 → 自动打开/展开面板（模型调用 fishpai_open 后用户立刻看到）
 *   - `active.revision` 变了 → 通知面板（干净就静默重载，有改动只提示）
 */
import * as React from 'react'
import { Panel } from './panel'
import { createFishpaiStore, type FishpaiStore } from './store'
import { ensureStyles } from './styles'
import { FishGlyph } from './icons'
import { api } from './api'

export const name = 'dsh-fishpai'

/**
 * 客户端硬依赖：槽位系统（注册面板）与会话服务（拿当前会话）。
 * 两者都是核心提供的，永远在；右侧栏与 better-sidebar 仍走延迟注入——缺任一都不拖垮插件。
 */
export const inject = ['slots', 'sessions']

const TAB_ID = 'dsh-fishpai'
const TAB_KIND = 'fishpai'
const FALLBACK_TAB_ID = `${TAB_ID}:editor`
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

function currentSessionId(ctx: any): string | null {
  try {
    const sessions = service(ctx, 'sessions')
    const snapshot = sessions?.list?.getSnapshot?.()
    return snapshot?.current || null
  } catch {
    return null
  }
}

export function apply(ctx: any): void {
  const stores = new Map<string, FishpaiStore>()
  const disposeStyles = ensureStyles()
  ctx.effect(() => () => disposeStyles(), 'fishpai: 面板样式')

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
    const sessionId = props?.sessionId || currentSessionId(ctx)
    const store = React.useMemo(() => (sessionId ? storeFor(sessionId) : null), [sessionId])
    if (!sessionId || !store) {
      return React.createElement('div', { className: 'fp-root' }, '鱼排：拿不到当前会话，请在一个会话里打开。')
    }
    return React.createElement(Panel, { store, sessionId, visible: props?.visible })
  }

  /**
   * 标签页（tab chip）里的标题。鱼形标画在这里——官方右侧栏的 chip 内容就是本组件，
   * 不注册它 chip 就只有一行字（没有图标位可填）。
   */
  function Title() {
    return React.createElement(
      'span',
      { className: 'fp-title-label' },
      React.createElement(FishGlyph, { size: 14, className: 'fp-title-glyph' }),
      '鱼排编辑器',
    )
  }

  // ── 打开面板（两条通道共用）─────────────────────────────────
  // 官方就位就用官方，否则用回退。两条通道都可能先到，所以这里只保存"各自的打开方式"，
  // 由 openPanel() 现取——避免谁先注册谁说话。
  let openOfficial: (() => void) | null = null
  let openFallback: (() => void) | null = null
  const openPanel = () => {
    const open = openOfficial || openFallback
    if (!open) throw new Error('右侧栏通道尚未就绪')
    open()
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

  // ── 通道一：官方右侧栏 ──────────────────────────────────────
  // 注意：`ctx.inject(deps, cb)` 的回调**不是同步执行**的（cordis 在 Fiber._reload 里先
  // `await Promise.resolve()` 再跑 apply），所以任何"回头再看 nativeDisposer 是否为空"的
  // 判断都必然落空。正确做法是两条通道都挂，官方一到就把回退席位拆掉。
  let officialReady = false
  let disposeFallbackTab: (() => void) | null = null
  let seatHandle: any = null
  try {
    seatHandle = ctx.inject(['sidebarRightTabs', 'sidebarRight'], (injected: any) => {
      const tabs = pick(injected, 'sidebarRightTabs')
      const sidebarRight = pick(injected, 'sidebarRight')
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
              order: 45,
              title: () => '鱼排编辑器',
              description: () => '公众号排版：Markdown + 实时预览 + 与模型来回改稿',
              // 不给 icon 的话，新标签页的引导列表画一个默认的立方体占位（就是"看着像缺图标"的那个）
              icon: FishGlyph,
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

      officialReady = true
      // 官方席位到位就把回退席位拆掉——否则用户会看到两个「鱼排」
      if (disposeFallbackTab) {
        try {
          disposeFallbackTab()
        } catch {
          /* 拆不掉也不影响官方席位 */
        }
        disposeFallbackTab = null
        openFallback = null
      }

      const dispose = () => {
        for (const off of disposers.reverse()) {
          try {
            off()
          } catch {
            /* 卸载失败不影响其它通道 */
          }
        }
        officialReady = false
        openOfficial = null
      }
      return dispose
    })
  } catch (error) {
    console.warn('[dsh-fishpai] 官方右侧栏席位注入失败：', error)
  }

  // ── 通道二：better-sidebar 回退 ─────────────────────────────
  // 无条件挂上：官方席位是异步到位的，无法在此之前判断它到底会不会来。
  // 回退席位只服务"官方席位不存在"的环境；官方一到，上面的回调会把它拆掉。
  let fallbackHandle: any = null
  try {
    fallbackHandle = ctx.inject(['betterSidebar'], (injected: any) => {
      if (officialReady) return // 官方席位已就位，不重复注册
      const bs = pick(injected, 'betterSidebar')
      if (!bs || typeof bs.registerTab !== 'function') return
      const off = bs.registerTab({
        id: FALLBACK_TAB_ID,
        title: () => '鱼排编辑器',
        // better-sidebar 的 TabDescriptor 支持 icon（它把它转交给原生右侧栏的引导页）
        icon: (size: number) => React.createElement(FishGlyph, { size: size || 16 }),
        order: 40,
        single: true,
        component: (props: any) => React.createElement(PanelHost, props),
      })
      openFallback = () => bs.openTab({ type: FALLBACK_TAB_ID })
      disposeFallbackTab = () => {
        try {
          off()
        } catch {
          /* 忽略 */
        }
      }
      return off
    })
  } catch (error) {
    console.warn('[dsh-fishpai] better-sidebar 回退注入失败：', error)
  }

  // ── 轮询：唯一的"宿主 → 页面"推送 ───────────────────────────
  ctx.effect(() => {
    let stopped = false
    let warned = false
    let lastRevision = -1
    let lastKey: string | null = null
    let lastTheme = ''
    let lastSession = ''
    const tick = async () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      const sessionId = currentSessionId(ctx)
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
        const firstPoll = lastKey === null && lastRevision === -1
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
      fallbackHandle?.dispose?.()
      disposeFallbackTab?.()
      for (const store of stores.values()) store.dispose()
      stores.clear()
    }
  }, 'fishpai: 轮询与生命周期')
}
