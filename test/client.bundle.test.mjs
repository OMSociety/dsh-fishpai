/**
 * 客户端 bundle 的形态守卫。
 *
 * 这几条一旦破掉，插件在浏览器里会**整块不加载**，而宿主侧测试全绿也发现不了：
 *   1. 产物必须是 `window.__ModuleLoader__.load({ id, factory })`（DSH 客户端模块系统的唯一形态）
 *   2. factory 只允许 require 平台种子表里的裸模块（react / react-dom / cordis / dsh-client-store /
 *      dsh-client-ui-slots / dsh-client-ui-primitives / dsh-client-ui-dockkit）——
 *      多一个没被 external 掉的依赖就会在运行时 MODULE_NOT_FOUND
 *   3. 必须导出 name / inject / apply（Cordis 靠这三个挂载插件）
 *   4. 在没有右侧栏服务时 apply 也不能抛，并且注册的东西可收回
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { bundleClient } from '../scripts/build-client.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = path.join(ROOT, 'lib', 'client.js')

/**
 * factory 允许 require 的 specifier —— 逐字对齐 rc2 的**平台种子表**（`dsh-client-modules`
 * 里 materialize 的那 9 项）。写成 `/^@deepseek-ai\//` 那样的通配等于没守：宿主有 280 多个包名，
 * 放行全部之后，将来 import 一个没被 external 掉的包，测试照样绿、运行时才炸
 * （`client-modules: require("…") missed the module table … a build-time externals drift`）。
 */
const PLATFORM_SEEDS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/** 允许出现在产物里的 specifier：种子表，外加种子表内包的子路径。 */
function allowedExternal(spec) {
  if (PLATFORM_SEEDS.has(spec)) return true
  return [...PLATFORM_SEEDS].some((seed) => spec.startsWith(`${seed}/`))
}

/**
 * 在独立的 vm realm 里加载 bundle —— 与浏览器一样，它是"另一份全局环境"。
 *
 * `inject` **必须异步触发回调**：cordis 的 `ctx.inject(deps, cb)` 是
 * `this.plugin({apply: cb})`，而 Fiber._reload 里先 `await Promise.resolve()` 才跑 apply。
 * 桩里若同步触发，会掩盖"双通道同时注册"这类真实竞态（漏一次，测试就测不出来）。
 */
function loadBundle(options = {}) {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  let registration = null
  const appended = []
  const timers = []
  const effects = []
  const seatHandles = []
  const registeredTabs = []
  const registeredSlots = []
  const opened = []
  const fetchCalls = []

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
  const sessions = { list: { getSnapshot: () => ({ current: 's1' }) } }
  const serviceTable = {
    slots,
    sessions,
    sidebarRightTabs,
    sidebarRight,
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

  /** 按真实时序（微任务）触发注入回调：cordis 的 inject 回调不是同步跑的。 */
  const fireInject = (run) => {
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
      // cordis 的 `fiber.dispose()` 是异步的（`(): Promise<void>`）：这里也必须异步，
      // 否则插件清理链里那句 `await seatHandle.dispose()` 在测试里等于没写——
      // 同步 dispose 的 await 永远是空操作，谁都测不出漏 await。
      const handle = {
        disposed: false,
        async dispose() {
          await new Promise((resolve) => setTimeout(resolve, 0))
          handle.disposed = true
        },
      }
      seatHandles.push(handle)
      return handle
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
    seatHandles,
    registeredTabs,
    registeredSlots,
    opened,
    fetchCalls,
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
      allowedExternal(spec),
      `bundle 里有未被 external 的依赖：${spec}（会打进产物或在运行时解析失败）`,
    )
  }
  assert.ok(specifiers.has('react'), '应当 require react，而不是把 React 打进来')
  // rc2 官方禁止客户端 bundle 加载 Harness Client 包（practices.md:35）；图标几何已复制进本包
  const hostPackages = [...specifiers].filter((s) => s.startsWith('@deepseek-ai/'))
  assert.deepEqual(hostPackages, [], `不该再 require Harness Client 包：${hostPackages.join(', ')}`)
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

test('图标：主题几何内联在本包里（不再 require 宿主图标集），鱼形标与 icon.svg 同源', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 主题几何已复制进 `client/theme-icons.tsx`：bundle 里不该再有宿主图标包
  // （rc2 `practices.md:35` 明文禁止；宿主改名会静默少图标，且无类型检查兜底）。
  assert.ok(
    !source.includes('require("@deepseek-ai/dsh-client-ui-primitives")'),
    '不该再 require 宿主图标集——几何已复制进 client/theme-icons.tsx',
  )
  // 自绘的鱼形标：与包根 icon.svg **逐字相同的几何**——全仓库只有这一份画法，
  // 插件列表的磁贴、侧边栏、面板里那几处都从它来（见 AGENTS.md 不变量 11）。
  const iconSvg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
  const iconPath = /<path\s+d="(M[^"]+)"/.exec(iconSvg)?.[1]
  assert.ok(iconPath, 'icon.svg 里应当有那条鱼的路径')
  assert.ok(
    source.includes(iconPath),
    `产物里的鱼形标要与包根 icon.svg 同源，别另画一套（icon.svg 现在是 ${iconPath}）`,
  )
  assert.ok(source.includes('currentColor'), '图标颜色走 currentColor')
  // 自绘 listbox：原生 <option> 里放不进 SVG，这是 emoji 换成图标的前提
  assert.ok(source.includes('fp-picker-btn') && source.includes('fp-menu-row'), '主题选择器与弹出列表')
  assert.ok(source.includes('"aria-selected"'), '主题列表要有 listbox/option 语义')
  assert.ok(!source.includes('optgroup'), '不再用原生 optgroup（它放不进图标）')
})

/**
 * 进 bundle 的**只有本仓库 `client/` 下的源码**——这条守的是 esbuild 的静默内联。
 *
 * `external` 只挡得住命中的包：一个不在 external 列表里的第三方包会被 esbuild 直接
 * **内联**进产物，require 表一条不加、体积只多几百字节，上面所有守卫照样全绿
 * （实测：造一个非 external 的假包 import 进 `icons.tsx`，构建成功、两个测试文件全绿）。
 * 所以这里用 esbuild 自己的 metafile 核对输入清单：出现任何 `node_modules` 或仓库外路径
 * 都当场变红，而不是等运行时报 MODULE_NOT_FOUND 或静默多出一份代码。
 */
test('产物只由本仓库 client/ 的源码打包而成（挡住 esbuild 的静默内联）', async () => {
  const result = await bundleClient({ metafile: true })
  const inputs = Object.keys(result.metafile.inputs)
  assert.ok(inputs.length > 0, '测试自身写错了：metafile 里没有输入')
  const outside = inputs.filter((input) => {
    const normalized = input.replace(/\\/g, '/')
    return !normalized.startsWith('client/') || normalized.includes('..')
  })
  assert.deepEqual(
    outside,
    [],
    `这些输入不在本仓库 client/ 下——external 没拦住，代码被静默内联进产物了：${outside.join(', ')}`,
  )
  const foreign = inputs.filter((input) => input.replace(/\\/g, '/').includes('node_modules'))
  assert.deepEqual(foreign, [], `产物里混进了 node_modules 的代码：${foreign.join(', ')}`)
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

test('复制回退路径必须走清洗（源码与产物各查一遍，防"改了源码没重建产物"）', () => {
  // 回退分支把 HTML 插进挂主文档的容器：那里 `innerHTML = html` 会让正文里的
  // `<img onerror>` / `<script>` 当场生效（同源，能调 /fishpai/api/*）。
  // 源码与产物都要查：只查产物的话"源码回退但忘了 npm run build"会漏过去。
  const panel = fs.readFileSync(path.join(ROOT, 'client', 'panel.tsx'), 'utf8')
  const sanitizeSrc = fs.readFileSync(path.join(ROOT, 'client', 'sanitize.ts'), 'utf8')
  const bundle = fs.readFileSync(BUNDLE, 'utf8')

  for (const [where, text] of [
    ['client/panel.tsx', panel],
    ['lib/client.js', bundle],
  ]) {
    assert.ok(text.includes('replaceChildren(sanitizeHtmlFragment('), `${where}: 回退分支要走 sanitizeHtmlFragment`)
    assert.ok(!text.includes('holder.innerHTML'), `${where}: 不许再把未清洗的 HTML 直接插进主文档`)
  }

  // 上面那两条只钉"接线"，钉不住清洗**实现**的漂移（清了哪些标签、放行哪种 data URI）。
  // 所以把 sanitize.ts 的实现特征从源码里取出来，逐个到产物里核对。
  const dropTags = [...(/const DROP_TAGS = new Set\(\[([\s\S]*?)\]\)/.exec(sanitizeSrc)?.[1] || '').matchAll(/'([A-Z]+)'/g)].map((m) => m[1])
  assert.ok(dropTags.length >= 8, '测试自身写错了：没能从 sanitize.ts 里取到 DROP_TAGS 清单')
  const missingTags = dropTags.filter((tag) => !bundle.includes(`"${tag}"`))
  assert.deepEqual(missingTags, [], `lib/client.js 里缺 DROP_TAGS 的这些项：${missingTags.join(', ')}（产物是旧的，重新 npm run build）`)

  const rasterRe = /const RASTER_DATA_URI_RE = (\/.+\/[a-z]*)/.exec(sanitizeSrc)?.[1]
  assert.ok(rasterRe, '测试自身写错了：没能从 sanitize.ts 里取到栅格 data URI 那条正则')
  assert.ok(bundle.includes(rasterRe), 'lib/client.js 里的栅格 data URI 分支与源码不一致（产物是旧的）')
  assert.ok(bundle.includes('复制已中止'), '解析失败的那句提示要进产物')
})

test('面板必须有「字体」控件：主题自带的字体栈会被这个预设覆盖，少了它就换不成衬线', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 宿主一直在 /themes 里回 fonts，但面板曾经既没存也没用——
  // 于是"把正文换成衬线"在界面上根本做不到（一套衬线主题会永远显示成黑体）。
  assert.ok(source.includes('fonts: ["sans", "serif", "mono"]'), '字体预设没进初值（store 里也没存）')
  assert.ok(source.includes('serif: "衬线"'), '字体预设要有中文名（黑体 / 衬线 / 等宽）')
  assert.ok(source.includes('store.actions.setMeta({ font })'), '字体选择要接到 setMeta')
})

test('字体下拉要标出「衬线/等宽」在公众号里不生效：编辑器只认黑体，不标用户会以为渲染坏了', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 照主题下拉那样分组 + 橙色小字，而不是在选项名字后面加括号
  assert.ok(source.includes('仅用于导出 HTML'), '要有一句"仅用于导出 HTML"的分组小字')
  assert.ok(source.includes('fp-font-opt-${font}'), '衬线/等宽要是 listbox 里的可选项（和主题下拉同一套结构）')
  // esbuild 输出统一用双引号
  assert.ok(source.includes('state.meta.font === "sans"'), '底部状态行判断"适合微信"时要把字体一起算进去')
})

test('主题下拉「我的」那一组要有删除按钮：自定义主题只有一套，删了得能退回默认', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('fp-menu-x'), '分组标题右边要有删除按钮的样式钩子')
  assert.ok(source.includes('onDeleteCustom'), 'ThemePicker 要把删除回调接出来')
  assert.ok(source.includes('clearCustomTheme'), 'store 要有删除动作')
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

test('apply() 在右侧栏服务不存在时也安全，注册的东西可收回', async () => {
  const harness = loadBundle({ services: { sidebarRightTabs: undefined, sidebarRight: undefined } })
  harness.apply()
  await flush()

  assert.ok(harness.appended.length >= 1, '样式应被注入一次')
  assert.equal(harness.registeredTabs.length, 0, '没有官方席位就不该注册 tab 类型')
  assert.equal(harness.registeredSlots.length, 0)
  assert.equal(harness.effects.length, 2, '样式 + 轮询两个 effect')
  assert.equal(harness.timers.length, 1, '应挂一个轮询')
  // 清理链要 await 到底：cordis 的 `fiber.dispose()` 返回 Promise，
  // 漏 await 的话面板槽位注销还排在微任务里，紧接着的重新挂载就会撞上旧席位。
  // 这里必须**await**清理函数，否则测不出漏 await（同步返回的 Promise 永远"已完成"）。
  for (const dispose of harness.effects) if (typeof dispose === 'function') await dispose()
  assert.equal(harness.seatHandles.length, 1, '注入过一次席位')
  assert.equal(harness.seatHandles[0].disposed, true, '清理时必须等席位 dispose 完成，不能只发起不等待')
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

test('0.1.7 形态的服务面（列表快照不带 current）：轮询从右侧栏挂载态拿当前会话', async () => {
  const harness = loadBundle({
    services: {
      // ids 给两个会话：只有一个会话时"唯一会话兜底"也会答对 s9，分不出是不是挂载读法的功劳
      sessions: { list: { getSnapshot: () => ({ ids: ['s9', 'sOther'], byId: { s9: { id: 's9' }, sOther: { id: 'sOther' } } }) } },
      sidebarRight: { mounted: { getSnapshot: () => 's9' }, openTab: () => {} },
    },
    fetchImpl: () => ({ ok: true }),
  })
  harness.apply()
  await flush()
  harness.timers[0]()
  await flush()

  const polled = harness.fetchCalls.find((c) => String(c.url).startsWith('/fishpai/api/state'))
  assert.ok(polled, '0.1.7 上轮询必须照常发起（否则 fishpai_open 后面板不会自动弹）')
  assert.match(String(polled.url), /sessionId=s9/, '应轮到右侧栏座位挂载的那个会话')
})

test('0.1.7 形态 + 没有挂载座位：单会话退到唯一的那个，多会话宁可空转也不猜', async () => {
  const single = loadBundle({
    services: {
      sessions: { list: { getSnapshot: () => ({ ids: ['only'], byId: {} }) } },
      sidebarRight: { openTab: () => {} },
    },
    fetchImpl: () => ({ ok: true }),
  })
  single.apply()
  await flush()
  single.timers[0]()
  await flush()
  assert.ok(single.fetchCalls.some((c) => /sessionId=only/.test(String(c.url))), '只有一个会话时没有别的候选')

  const multi = loadBundle({
    services: {
      sessions: { list: { getSnapshot: () => ({ ids: ['a', 'b'], byId: {} }) } },
      sidebarRight: { openTab: () => {} },
    },
    fetchImpl: () => ({ ok: true }),
  })
  multi.apply()
  await flush()
  multi.timers[0]()
  await flush()
  assert.equal(
    multi.fetchCalls.filter((c) => String(c.url).startsWith('/fishpai/api/state')).length,
    0,
    '猜错会话会把别的会话的打开请求算到当前头上：多会话时读不出当前会话就该空转',
  )
})
