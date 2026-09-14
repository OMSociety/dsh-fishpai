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

/** 在独立的 vm realm 里加载 bundle —— 与浏览器一样，它是"另一份全局环境"。 */
function loadBundle() {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  let registration = null
  const appended = []
  const timers = []

  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {}, remove() {}, set textContent(_v) {}, textContent: '' }),
    head: { appendChild: (el) => appended.push(el) },
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible',
  }

  const sandbox = {
    console,
    document: documentStub,
    navigator: {},
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
  return { registration, exports: registration.factory(stub), appended, timers }
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

test('apply() 在没有右侧栏服务时也安全，并且注册的东西能收回', () => {
  const { exports, appended, timers } = loadBundle()

  const effects = []
  const ctx = {
    slots: {},
    // Cordis 的 effect 是"立刻执行、返回收回函数"
    effect: (fn) => {
      effects.push(fn())
    },
    inject: () => ({ dispose() {} }),
    get: () => undefined,
    sessions: { list: { getSnapshot: () => ({ current: null }) } },
  }

  exports.apply(ctx)

  assert.ok(appended.length >= 1, '样式应被注入一次')
  assert.equal(effects.length, 2, '应有「样式」与「轮询/生命周期」两个 effect')
  assert.equal(timers.length, 1, '应挂一个 3s 轮询')
  for (const dispose of effects) {
    if (typeof dispose === 'function') dispose()
  }
})
