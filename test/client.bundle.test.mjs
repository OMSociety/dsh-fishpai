/**
 * 客户端 bundle 的形态守卫。
 *
 * 这几条一旦破掉，插件在浏览器里会**整块不加载**，而宿主侧测试全绿也发现不了：
 *   1. 产物必须是 `window.__ModuleLoader__.load({ id, factory })`（DSH 客户端模块系统的唯一形态）
 *   2. factory 只允许 require 模块表提供的裸模块（react / react-dom / @deepseek-ai/*）——
 *      多一个没被 external 掉的依赖就会在运行时 MODULE_NOT_FOUND
 *   3. 必须导出 name / inject / apply（Cordis 靠这三个挂载插件）
 *   4. 在没有右侧栏 / better-sidebar 服务时 apply 也不能抛，并且注册的东西可收回
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = path.join(ROOT, 'lib', 'client.js')

const ALLOWED_EXTERNALS = [/^react$/, /^react\//, /^react-dom$/, /^react-dom\//, /^@deepseek-ai\//]

/**
 * 在独立的 vm realm 里加载 bundle —— 与浏览器一样，它是"另一份全局环境"。
 *
 * `inject` **必须异步触发回调**：cordis 的 `ctx.inject(deps, cb)` 是
 * `this.plugin({apply: cb})`，而 Fiber._reload 里先 `await Promise.resolve()` 才跑 apply。
 * 桩里同步触发会掩盖"双通道同时注册"这类真实竞态（曾经就漏过一次）。
 */
function loadBundle(options = {}) {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  let registration = null
  const appended = []
  const timers = []
  const effects = []
  const registeredTabs = []
  const registeredSlots = []
  const opened = []
  const fetchCalls = []
  const closedTabs = []
  const pendingInject = []

  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {}, remove() {}, set textContent(_v) {}, textContent: '' }),
    head: { appendChild: (el) => appended.push(el) },
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  }

  const slots = {
    inject: (_seat, cb) => {
      const dispose = cb()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register: (descriptor, component) => {
      registeredSlots.push({ descriptor, component })
      return () => {}
    },
  }
  const sidebarRightTabs = {
    register: (definition) => {
      registeredTabs.push(definition)
      return () => {}
    },
  }
  const sidebarRight = {
    openTab: (kind) => opened.push(kind),
  }
  const betterSidebar = {
    registerTab: (descriptor) => {
      tabsFallback.push(descriptor)
      return () => closedTabs.push(descriptor.id)
    },
    openTab: (target) => opened.push(target && target.type),
  }
  const tabsFallback = []
  const sessions = { list: { getSnapshot: () => ({ current: 's1' }) } }
  const serviceTable = {
    slots,
    sessions,
    sidebarRightTabs,
    sidebarRight,
    betterSidebar,
    ...(options.services || {}),
  }

  const fakeFetch = async (url, init) => {
    fetchCalls.push({ url, init })
    const body = options.fetchImpl ? options.fetchImpl(url, init) : { ok: true }
    return { ok: true, status: 200, json: async () => body }
  }

  const sandbox = {
    console,
    document: documentStub,
    navigator: {},
    fetch: fakeFetch,
    window: {
      __ModuleLoader__: {
        load: (reg) => {
          registration = reg
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    setInterval: (fn) => {
      timers.push(fn)
      return { id: timers.length }
    },
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })

  const stub = (spec) => {
    if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: Symbol('f') }
    return {
      createElement: () => null,
      useSyncExternalStore: (_sub, get) => get(),
      useMemo: (fn) => fn(),
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useState: (v) => [v, () => {}],
      useCallback: (fn) => fn,
    }
  }

  assert.ok(registration, 'bundle 必须通过 window.__ModuleLoader__.load 注册')
  const exports = registration.factory(stub)

  /** 按真实时序（微任务）触发注入回调；`reverse` 用来验证"回退先到"也能被官方拆掉。 */
  const fireInject = (run) => {
    if (options.fireOrder === 'reverse') {
      pendingInject.push(run)
      if (pendingInject.length === 1) {
        setTimeout(() => {
          for (const task of pendingInject.reverse()) task()
          pendingInject.length = 0
        }, 0)
      }
      return
    }
    queueMicrotask(run)
  }

  const ctx = {
    slots,
    effect: (fn) => {
      effects.push(fn())
    },
    inject: (deps, callback) => {
      const available = deps.every((d) => serviceTable[d] !== undefined)
      if (available) {
        fireInject(() => {
          const inner = callback({
            get: (key) => serviceTable[key],
            ...serviceTable,
          })
          if (typeof inner === 'function') effects.push(inner)
        })
      }
      return { dispose() {} }
    },
    get: (key) => serviceTable[key],
    sessions,
  }

  return {
    registration,
    exports,
    ctx,
    appended,
    timers,
    effects,
    registeredTabs,
    registeredSlots,
    opened,
    fetchCalls,
    fallbackTabs: tabsFallback,
    closedTabs,
    apply: () => exports.apply(ctx),
  }
}

test('客户端 bundle 以 __ModuleLoader__.load 注册，且 id 与包名一致', () => {
  const { registration } = loadBundle()
  assert.equal(registration.id, 'dsh-fishpai')
  assert.equal(typeof registration.factory, 'function')
})

test('客户端 bundle 只依赖模块表里有的裸模块', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  const specifiers = new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
  for (const spec of specifiers) {
    assert.ok(
      ALLOWED_EXTERNALS.some((re) => re.test(spec)),
      `bundle 里有未被 external 的依赖：${spec}（会打进产物或在运行时解析失败）`,
    )
  }
  assert.ok(specifiers.has('react'), '应当 require react，而不是把 React 打进来')
})

test('客户端 bundle 导出 name / inject / apply', () => {
  const { exports } = loadBundle()
  assert.equal(exports.name, 'dsh-fishpai')
  assert.deepEqual([...exports.inject], ['slots', 'sessions'])
  assert.equal(typeof exports.apply, 'function')
})

test('面板文案：改名与新增说明必须真的进产物（防"改了源码没重新构建"）', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('"导出 HTML"'), '导出按钮文案应为「导出 HTML」')
  assert.ok(source.includes('适合公众号'), '主题分组标签')
  assert.ok(source.includes('微信可能掉样式'), '风险分组标签')
  assert.ok(source.includes('background-clip: text'), '主题风险提示要说明机制')
  assert.ok(source.includes('Mac 代码框'), '代码块开关改名后应出现在产物里')
  assert.ok(source.includes('没有外链') || source.includes('没有代码块'), '无效开关的说明文案')
})

test('apply() 在右侧栏与 better-sidebar 都不存在时也安全，注册的东西可收回', async () => {
  const harness = loadBundle({ services: { sidebarRightTabs: undefined, sidebarRight: undefined, betterSidebar: undefined } })
  harness.apply()
  await flush()

  assert.ok(harness.appended.length >= 1, '样式应被注入一次')
  assert.equal(harness.registeredTabs.length, 0, '没有官方席位就不该注册 tab 类型')
  assert.equal(harness.registeredSlots.length, 0)
  assert.equal(harness.fallbackTabs.length, 0)
  assert.equal(harness.effects.length, 2, '样式 + 轮询两个 effect')
  assert.equal(harness.timers.length, 1, '应挂一个轮询')
  for (const dispose of harness.effects) if (typeof dispose === 'function') dispose()
})

/** 让 vm 里那些 `void tick()` 的异步链跑完（setInterval 回调返回 undefined，await 它没用）。 */
async function flush(times = 4) {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

test('官方席位：注册 tab 类型与两个槽位，openRequest 到达时自动打开面板', async () => {
  const harness = loadBundle({
    fetchImpl: (url) => {
      if (String(url).startsWith('/fishpai/api/state')) {
        return { ok: true, cwd: 'C:/ws', active: { key: 'k1', path: 'a.md', title: 't', revision: 3 }, openRequest: { key: 'k1', at: 1 }, docs: [] }
      }
      return { ok: true }
    },
  })
  harness.apply()
  await flush()

  // 注册契约
  assert.equal(harness.registeredTabs.length, 1)
  const tab = harness.registeredTabs[0]
  assert.equal(tab.id, 'dsh-fishpai')
  assert.equal(tab.kind, 'fishpai')
  assert.equal(tab.priority, 'extension')
  assert.equal(tab.title(), '鱼排编辑器')
  assert.equal(tab.guide.length, 1)
  assert.match(tab.guide[0].title(), /鱼排/)

  const keys = harness.registeredSlots.map((s) => `${s.descriptor.name}#${s.descriptor.key}`)
  assert.deepEqual(keys, ['sidebar.right.pane.tab#dsh-fishpai', 'sidebar.right.pane.tab.title#dsh-fishpai'])
  for (const slot of harness.registeredSlots) assert.equal(typeof slot.component, 'function')

  // effect 挂载时会立刻轮询一次：openRequest 应当被消费，并且面板被打开。
  // 主动再驱动一次轮询，免得测试依赖"微任务与 fetch 的先后"这种偶然顺序。
  await flush()
  harness.timers[0]()
  await flush()
  assert.ok(harness.opened.length >= 1, '收到 openRequest 应自动打开面板')
  assert.ok(
    harness.opened.every((k) => k === 'fishpai'),
    `打开的面板类型应始终是 fishpai（而不是回退 tab），实际：${JSON.stringify(harness.opened)}`,
  )
  const tabOpened = harness.fetchCalls.find((c) => String(c.url).includes('/tab-opened'))
  assert.ok(tabOpened, '应回调 /tab-opened 清掉打开请求')
  assert.match(String(tabOpened.init.body), /"docKey":"k1"/)
})

test('回退通道：只有 better-sidebar 时注册它的 tab', async () => {
  const harness = loadBundle({ services: { sidebarRightTabs: undefined, sidebarRight: undefined } })
  harness.apply()
  await flush()

  assert.equal(harness.fallbackTabs.length, 1)
  assert.equal(harness.fallbackTabs[0].id, 'dsh-fishpai:editor')
  assert.equal(harness.fallbackTabs[0].single, true)
  assert.equal(typeof harness.fallbackTabs[0].component, 'function')
})

test('官方席位在场时不再注册 better-sidebar 的 tab（回调是异步的，不能靠"回头再看"判断）', async () => {
  const harness = loadBundle()
  harness.apply()
  await flush()

  assert.equal(harness.registeredTabs.length, 1, '官方席位应就位')
  assert.equal(harness.fallbackTabs.length, 0, '不应重复注册 better-sidebar tab')
})

test('回退席位先到、官方后到：官方到位后必须把回退拆掉，最终只剩一个鱼排', async () => {
  const harness = loadBundle({
    fireOrder: 'reverse',
    fetchImpl: (url) => {
      if (String(url).startsWith('/fishpai/api/state')) {
        return { ok: true, cwd: 'C:/ws', active: { key: 'k1', path: 'a.md', title: 't', revision: 1 }, openRequest: { key: 'k1', at: 1 }, docs: [] }
      }
      return { ok: true }
    },
  })
  harness.apply()
  await flush()

  assert.equal(harness.fallbackTabs.length, 1, '回退席位应先在 better-sidebar 里注册过')
  assert.equal(harness.registeredTabs.length, 1, '官方席位随后也应注册')
  assert.deepEqual(harness.closedTabs, ['dsh-fishpai:editor'], '官方到位后必须撤销回退席位')

  await flush()
  harness.timers[0]()
  await flush()
  assert.ok(harness.opened.length >= 1, '轮询应能打开面板')
  assert.ok(harness.opened.every((k) => k === 'fishpai'), `应走官方通道，实际：${JSON.stringify(harness.opened)}`)
})
