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

/**
 * `dsh.client.inject` 是「包依赖边」：声明"这一行的 factory 到位前，先等着这些**包**的
 * factory 到位"（DSH 的 `WebBootEntry` 原话：names package rows whose factories must arrive
 * before this row materializes）。**服务依赖由 bundle 导出的 `inject` 决定**。
 *
 * 写 `slots` / `sessions` 这类服务名是无效声明——运行时对不上任何包行，会被静默忽略。
 * 这条守卫让"看起来对齐了源码、其实写错了字段"的改动当场变红。
 */
test('dsh.client 声明只写包依赖边，不写服务名', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const decl = (pkg.dsh && pkg.dsh.client) || {}
  assert.equal(decl.platform, 'web')

  const source = fs.readFileSync(BUNDLE, 'utf8')
  const required = new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
  for (const dep of decl.inject || []) {
    const bare = dep.endsWith('/client') ? dep.slice(0, -7) : dep
    assert.ok(
      required.has(dep) || required.has(bare),
      `dsh.client.inject 里的 "${dep}" 不是 bundle 依赖的包——要声明服务依赖请写进 client/index.tsx 的 inject`,
    )
  }
  for (const dep of decl.external || []) {
    assert.ok(required.has(dep), `dsh.client.external 里的 "${dep}" 没被 bundle require`)
  }
})

test('图标：主题图标用 DSH 内建的图标集（基线模块），鱼形标是自绘的，取不到也不影响加载', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // `@deepseek-ai/dsh-client-ui-primitives` 与 react 同级：是 shell 的基线模块
  // （右侧栏自己画图标用的就是它），所以不需要在 dsh.client.inject 里声明包依赖边。
  assert.ok(
    source.includes('require("@deepseek-ai/dsh-client-ui-primitives")'),
    '应当 require DSH 的图标模块（与自己手画一整套相比，这样才对得上内置图标的画法）',
  )
  // 自绘的鱼形标：16px 网格、currentColor（深浅色共用一套，不做两套图）
  assert.ok(source.includes('M2.1 8C3.2 5.6'), '鱼形标的路径要在产物里')
  assert.ok(source.includes('currentColor'), '图标颜色走 currentColor')
  // 每套主题的图标名必须都是内置图标的导出名
  const names = [...source.matchAll(/'?(Icon[A-Za-z0-9]+Outline?\d+)'?/g)].map((m) => m[1])
  assert.ok(names.length >= 11, `主题图标名没进产物？只找到 ${names.length} 个`)
  // 自绘 listbox：原生 <option> 里放不进 SVG，这是 emoji 换成图标的前提
  assert.ok(source.includes('fp-picker-btn') && source.includes('fp-menu-row'), '主题选择器与弹出列表')
  assert.ok(source.includes('"aria-selected"'), '主题列表要有 listbox/option 语义')
  assert.ok(!source.includes('optgroup'), '不再用原生 optgroup（它放不进图标）')
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

test('面板必须有「字体」控件：主题自带的字体栈会被这个预设覆盖，少了它就换不成衬线', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 宿主一直在 /themes 里回 fonts，但面板曾经既没存也没用——
  // 于是"把正文换成衬线"在界面上根本做不到（一套衬线主题会永远显示成黑体）。
  assert.ok(source.includes('fonts: ["sans", "serif", "mono"]'), '字体预设没进初值（store 里也没存）')
  assert.ok(source.includes('serif: "衬线"'), '字体预设要有中文名（黑体 / 衬线 / 等宽）')
  assert.ok(source.includes('font: e.target.value'), '字体选择要接到 setMeta')
})

test('风险提示可关掉，但换主题后要重新出现（不能"关一次就再也不提醒"）', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('fp-banner-x'), '风险提示缺关闭按钮')
  assert.ok(source.includes('setRiskDismissed(currentTheme.key)'), '关闭按钮要记住"关掉的是哪一套"')
  // 换主题时重置：否则切走再切回来提示就永远不出现了
  assert.ok(source.includes('setRiskDismissed(null)'), '换主题时要重置"已关掉"的状态')
})

test('快捷键速查表：宽度随面板收缩（定宽会在窄栏里溢出、标签被裁掉）', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('max-width:calc(100% - 12px)'), '速查表宽度要有上限，窄面板里才不会被裁')
  assert.ok(!source.includes('z-index:3;width:266px'), '别再写死宽度（实测窄栏下标签全被切掉）')
  // 定位上下文交给整行（.fp-pane-head），百分比宽度才有"面板宽度"可依
  assert.ok(source.includes('position:relative') && source.includes('fp-pane-head'), '速查表挂在编辑器头上那一行')
})

test('面板文案：失败提示、批注定位、提示条分类必须真的进产物', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('可以改用旁边的「导出 HTML」拿文件'), '复制失败要指向另一个按钮')
  assert.ok(source.includes('可以改用「复制到公众号」'), '导出失败要指向另一个按钮')
  assert.ok(source.includes('文字还在输入框里'), '批注失败要说明文字没丢')
  assert.ok(source.includes('正文还是空的'), '没有落点时要说清楚为什么没加上')
  assert.ok(source.includes('"定位"'), '批注卡片要有「定位」按钮')
  assert.ok(source.includes('引用片段已被改写'), '高亮不了时要说明原因')
  assert.ok(source.includes('data-kind'), '提示条要按 kind 区分类别（成功/失败一眼可分）')
})

test('空面板：载入中/失败/还没有文档三种状态共用一张卡片，且都有真能点的动作', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  for (const copy of ['鱼排编辑器', '正在打开文档…', '新建空白文档', '最近打开', '面板没能载入']) {
    assert.ok(source.includes(copy), `空面板文案缺失：${copy}`)
  }
  assert.ok(source.includes('重试'), '载入失败要有重试')
  assert.ok(source.includes('fp-blank-card') && source.includes('fp-docrow'), '空面板卡片的样式类应在产物里')
  assert.ok(source.includes('fp-sweep'), '载入中的进度条动画')
})

test('快捷键提示分系统：两套文案都在产物里，而键盘处理始终 meta || ctrl', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('"⌘"') && source.includes('"Ctrl"'), '修饰键提示应有 Mac / 非 Mac 两支')
  assert.ok(source.includes('⌘⇧C') && source.includes('Ctrl+Shift+C'), '复制快捷键提示同样分两支')
  assert.ok(source.includes('userAgentData') || source.includes('platform'), '平台判断要看 navigator')
  // 提示只是文案：真正处理键盘的地方必须同时接受 meta 与 ctrl
  assert.ok(source.includes('metaKey ||') && source.includes('ctrlKey'), '键盘处理要同时接受 meta 与 ctrl')
})

test('编辑器快捷键：动作表、速查表、原生撤销三样都要进产物', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 速查表内容来自 SHORTCUTS（与键盘匹配同源），所以文案必须在产物里
  for (const copy of ['加粗', '斜体', '行内代码', '删除线', '一级标题', '正文（去掉标题）', '无序列表', '有序列表', '引用', '快捷键']) {
    assert.ok(source.includes(copy), `快捷键速查表缺条目：${copy}`)
  }
  // 键盘落点：编辑动作走 execCommand('insertText')，赋值 value 会让 Ctrl+Z 失灵
  assert.ok(source.includes('"insertText"'), '编辑动作要用原生 insertText 保住撤销栈')
  assert.ok(source.includes('execCommand'), '执行入口')
  // 回车续列表与 Tab 缩进（不是组合键，但属于"手感"的一部分）
  assert.ok(source.includes('continueList') || source.includes('indentSelection'), '回车续列表 / Tab 缩进要进产物')
  assert.ok(source.includes('fp-keys') && source.includes('fp-kbd'), '速查表的样式类')
})

test('粘贴图片：剪贴板/拖拽取图 → POST /upload → 插入 ![](assets/…)，且只认图片', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('clipboardData'), '粘贴要读剪贴板')
  assert.ok(source.includes('dataTransfer'), '拖进来的图片也要接')
  assert.ok(source.includes('/upload'), '图片要交给宿主存下来')
  assert.match(source, /!\[\]\(\$\{/, '正文里插的是 Markdown 图片语法')
  assert.match(source, /image\\?\//, '只挑图片，普通文本粘贴照旧交给浏览器')
  assert.ok(source.includes('超过') && source.includes('上限'), '超限要给一句人话，而不是等 413')
  // 预览 iframe 是沙箱 srcdoc：本地图必须由面板取回来变成 data URI，相对路径在里面拿不到
  assert.ok(source.includes('readAsDataURL'), '用 FileReader 转 data URI（blob: 在不透明源里取不到）')
  assert.ok(source.includes('"/asset?"') || source.includes('/asset?'), '图片要从 /asset 取回')
  assert.ok(source.includes('imageMap'), '预览要带上内联进来的图')
})

test('两个开关的可用性由宿主渲染结果决定，不在客户端猜正文', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('linkCount'), '「脚注」开关要看 linkCount')
  assert.ok(source.includes('hasCode'), '「Mac 代码框」开关要看 hasCode')
  assert.ok(!source.includes('hasExternalLinks'), '不再在面板里用正则猜外链')
  assert.ok(!source.includes('hasCodeBlocks'), '不再在面板里用正则猜代码块')
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
