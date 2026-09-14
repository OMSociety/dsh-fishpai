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
    const sessionId = props?.sessionId || currentSessionId(ctx)
    const store = React.useMemo(() => (sessionId ? storeFor(sessionId) : null), [sessionId])
    if (!sessionId || !store) {
      return React.createElement('div', { className: 'fp-root' }, '鱼排：拿不到当前会话，请在一个会话里打开。')
    }
    return React.createElement(Panel, { store, sessionId, visible: props?.visible })
  }

  function Title() {
    return React.createElement('span', { className: 'fp-title-label' }, '鱼排')
  }

  // ── 打开面板（两条通道共用）─────────────────────────────────
  let openPanel: (() => void) | null = null

  const openIfRequested = (sessionId: string, docKey: string) => {
    try {
      openPanel?.()
    } catch {
      /* 面板服务尚未就绪：下一次轮询再试 */
      return false
    }
    storeFor(sessionId)
    void api.tabOpened(sessionId, docKey).catch(() => {})
    return true
  }

  // ── 通道一：官方右侧栏 ──────────────────────────────────────
  let nativeDisposer: (() => void) | null = null
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
          title: () => '鱼排',
          guide: [
            {
              order: 45,
              title: () => '鱼排排版台',
              description: () => '公众号排版：Markdown + 实时预览 + 与模型来回改稿',
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
        openPanel = () => sidebarRight.openTab(TAB_KIND)
      }

      nativeDisposer = () => {
        for (const dispose of disposers.reverse()) {
          try {
            dispose()
          } catch {
            /* 卸载失败不影响其它通道 */
          }
        }
        nativeDisposer = null
      }
      return nativeDisposer
    })
  } catch (error) {
    console.warn('[dsh-fishpai] 官方右侧栏席位注入失败：', error)
  }

  // ── 通道二：better-sidebar 回退（仅在官方席位缺席时）─────────
  let fallbackDisposer: (() => void) | null = null
  if (!nativeDisposer) {
    try {
      const handle = ctx.inject(['betterSidebar'], (injected: any) => {
        const bs = pick(injected, 'betterSidebar')
        if (!bs || typeof bs.registerTab !== 'function') return
        if (nativeDisposer) return // 官方席位已就位，不重复注册
        const off = bs.registerTab({
          id: FALLBACK_TAB_ID,
          title: () => '鱼排',
          order: 40,
          single: true,
          component: (props: any) => React.createElement(PanelHost, props),
        })
        openPanel = () => bs.openTab({ type: FALLBACK_TAB_ID })
        fallbackDisposer = () => {
          try {
            off()
          } catch {
            /* 忽略 */
          }
        }
        return off
      })
      if (handle && typeof handle.dispose === 'function') {
        const inner = fallbackDisposer
        fallbackDisposer = () => {
          inner?.()
          handle.dispose()
        }
      }
    } catch (error) {
      console.warn('[dsh-fishpai] better-sidebar 回退注入失败：', error)
    }
  }

  // ── 轮询：唯一的"宿主 → 页面"推送 ───────────────────────────
  ctx.effect(() => {
    let stopped = false
    let lastRevision = -1
    let lastSession = ''
    const tick = async () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      const sessionId = currentSessionId(ctx)
      if (!sessionId) return
      try {
        const st = await api.state(sessionId)
        if (sessionId !== lastSession) {
          lastSession = sessionId
          lastRevision = -1
        }
        if (st.openRequest && st.openRequest.key) {
          openIfRequested(sessionId, st.openRequest.key)
        }
        const revision = st.active ? st.active.revision : -1
        if (revision !== lastRevision) {
          const previous = lastRevision
          lastRevision = revision
          const store = stores.get(sessionId)
          if (store && previous !== -1 && revision > previous) void store.actions.onExternalRevision(revision)
        }
      } catch {
        /* 宿主还没起来/路由未注册：下一轮再试 */
      }
    }
    const timer = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      stopped = true
      clearInterval(timer)
      seatHandle?.dispose?.()
      fallbackDisposer?.()
      for (const store of stores.values()) store.dispose()
      stores.clear()
    }
  }, 'fishpai: 轮询与生命周期')
}
