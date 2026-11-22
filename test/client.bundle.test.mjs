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
      createElement: options.createElement || (() => null),
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
  assert.deepEqual(hostPackages, [], `bundle 仅加载 react 系与声明过的模块：${hostPackages.join(', ')}`)
})

test('客户端 bundle 导出 name / inject / apply', () => {
  const { exports } = loadBundle()
  assert.equal(exports.name, 'dsh-fishpai')
  assert.deepEqual([...exports.inject], ['slots', 'sessions'])
  assert.equal(typeof exports.apply, 'function')
})

/**
 * `dsh.client.inject` 使用包名声明客户端模块的加载/预取顺序；
 * bundle 导出的 `inject` 使用服务名声明运行依赖。
 * 槽位属主包先加载，本包通过 `ctx.slots` 注册；本测试核对字段与包名形态。
 */
test('dsh.client 使用包名声明槽位属主边', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const decl = (pkg.dsh && pkg.dsh.client) || {}
  assert.equal(decl.platform, 'web')

  for (const dep of decl.inject || []) {
    assert.match(
      dep,
      /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/,
      `dsh.client.inject 里的 "${dep}" 不是包名——写服务名（slots / sessions）或写错包名都会被静默忽略`,
    )
  }

  // 注册进哪个 slot，就 inject 那个 slot 的属主包：属主的 bundle 没到位时 `slots.inject`
  // 会白等，丢的是包到包的到达顺序边（属主包名用 `check-mounts.mjs --explain <key>` 查）。
  const entry = fs.readFileSync(path.join(ROOT, 'client', 'index.tsx'), 'utf8')
  const owners = { 'sidebar.right.pane.tab': '@deepseek-ai/dsh-client-ui-sidebar-right' }
  for (const [slot, owner] of Object.entries(owners)) {
    if (!entry.includes(`'${slot}'`)) continue
    assert.ok(
      (decl.inject || []).includes(owner),
      `注册了 "${slot}" 却没把属主包 "${owner}" 写进 dsh.client.inject`,
    )
  }

  const source = fs.readFileSync(BUNDLE, 'utf8')
  const required = new Set([...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
  for (const dep of decl.external || []) {
    assert.ok(required.has(dep), `dsh.client.external 里的 "${dep}" 没被 bundle require`)
  }
})

test('图标：主题几何内联，鱼形标与 icon.svg 同源', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // client/theme-icons.tsx 承载主题几何，bundle 的宿主图标依赖为零。
  // rc2 practices.md:35 禁止客户端 bundle 加载 Harness Client 包。
  assert.ok(
    !source.includes('require("@deepseek-ai/dsh-client-ui-primitives")'),
    'bundle 的宿主图标依赖为零',
  )
  // 包根 icon.svg 是鱼形几何的唯一来源，插件磁贴、侧边栏与面板共用该路径。
  const iconSvg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
  const iconPath = /<path\s+d="(M[^"]+)"/.exec(iconSvg)?.[1]
  assert.ok(iconPath, 'icon.svg 应包含鱼形路径')
  assert.ok(
    source.includes(iconPath),
    `鱼形标与包根 icon.svg 使用同一几何：${iconPath}`,
  )
  assert.ok(source.includes('currentColor'), '图标颜色走 currentColor')
  // listbox 直接承载 SVG 图标。
  assert.ok(source.includes('fp-picker-btn') && source.includes('fp-menu-row'), '主题选择器与弹出列表')
  assert.ok(source.includes('"aria-selected"'), '主题列表要有 listbox/option 语义')
  assert.ok(!source.includes('optgroup'), '主题选项采用可承载图标的自绘 listbox')
})

/**
 * esbuild metafile 核对 bundle 输入清单。
 * external 仅匹配列出的包，其它依赖会被内联；所有输入必须位于 client/，
 * 使依赖边界在构建期可验证。
 */
test('产物输入全部来自本仓库 client/ 源码', async () => {
  const result = await bundleClient({ metafile: true })
  const inputs = Object.keys(result.metafile.inputs)
  assert.ok(inputs.length > 0, 'metafile 应包含输入清单')
  const outside = inputs.filter((input) => {
    const normalized = input.replace(/\\/g, '/')
    return !normalized.startsWith('client/') || normalized.includes('..')
  })
  assert.deepEqual(
    outside,
    [],
    `以下输入越出 client/ 源码边界：${outside.join(', ')}`,
  )
  const foreign = inputs.filter((input) => input.replace(/\\/g, '/').includes('node_modules'))
  assert.deepEqual(foreign, [], `node_modules 输入清单应为空：${foreign.join(', ')}`)
})

test('面板当前文案进入产物', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('"导出 HTML"'), '导出按钮文案应为「导出 HTML」')
  assert.ok(source.includes('适合公众号'), '主题分组标签')
  assert.ok(source.includes('微信可能掉样式'), '风险分组标签')
  assert.ok(source.includes('background-clip: text'), '主题风险提示要说明机制')
  assert.ok(source.includes('Mac 代码框'), 'Mac 代码框文案进入产物')
  assert.ok(source.includes('添加外链后即可预览效果') && source.includes('添加代码块后即可预览效果'), '开关说明指向可预览的内容')
})

test('专业默认与组件抽屉：渲染目标贯通，八种容器模板都进产物', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  for (const copy of ['专业', '快速', '⊕ 组件', '组件是专业管线专属，已为你切到专业模式']) {
    assert.ok(source.includes(copy), `模式切换或组件提示文案缺失：${copy}`)
  }
  for (const name of ['expand', 'swap', 'swiper', 'spotlight', 'danmaku', 'progress', 'timeline', 'compare']) {
    assert.ok(source.includes(`:::${name}`), `组件模板缺失：${name}`)
  }
  assert.ok(source.includes('target: "professional"'), '默认渲染目标应为专业')
  assert.ok(source.includes('target: state.meta.target'), '复制与导出渲染要读文档的渲染目标')
  assert.ok(source.includes('state.meta.target,'), '预览 renderPreview 要显式收到渲染目标')
})

test('专业模式收起快速控件，面板与编辑器跟随 DSH 主背景', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'client', 'panel.tsx'), 'utf8')
  const styles = fs.readFileSync(path.join(ROOT, 'client', 'styles.ts'), 'utf8')
  assert.match(
    panel,
    /\{state\.meta\.target === 'quick' \? \(\s*<div className="fp-row fp-quick-settings">/,
    '主题、色板、字体、字号、脚注与 Mac 代码框必须只在快速模式渲染',
  )
  assert.ok(panel.includes('const [drawerOpen, setDrawerOpen] = React.useState(false)'), '辅助抽屉默认收起')
  assert.ok(panel.includes('{props.open ? ('), '抽屉 body 只在展开时挂载')
  for (const selector of ['.fp-root{', '.fp-editor{', '.fp-preview-wrap{']) {
    const start = styles.indexOf(selector)
    assert.ok(start >= 0, `缺少表面选择器：${selector}`)
    const block = styles.slice(start, styles.indexOf('}', start))
    assert.match(block, /background:var\(--dsw-alias-bg-base\)/, `${selector} 使用 DSH 主背景`)
  }
  assert.ok(styles.includes('overflow-x:auto;scrollbar-width:none'), '辅助页签支持窄栏横向滚动')
  assert.ok(panel.includes('aria-label="文档辅助"'), '辅助页签提供分组语义')
  assert.ok(styles.includes('.fp-btn:focus{outline:none}') && styles.includes('.fp-btn:focus-visible{'), '按钮焦点使用独立轮廓')
  assert.ok(styles.includes('.fp-drawer-bar{'), '辅助页签与状态合并为一行')
  assert.ok(panel.includes('<div className="fp-status">{props.status}</div>'), '状态信息嵌入底部辅助栏')
  for (const token of [
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-button-primary-fill',
    '--dsw-alias-label-primary-foreground',
  ]) {
    assert.ok(!styles.includes(token), `不能引用 Theme provider 未提供的令牌：${token}`)
  }
  const bundle = fs.readFileSync(BUNDLE, 'utf8')
  for (const hook of ['fp-quick-settings', 'fp-icon-btn', 'data-open']) {
    assert.ok(bundle.includes(hook), `面板结构进入产物：${hook}`)
  }
})

test('专业模式默认预览，文稿与预览标题保持作者视角', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'client', 'panel.tsx'), 'utf8')
  assert.ok(panel.includes("React.useState<ViewMode>('preview')"), '专业模式的初始视图是预览')
  assert.match(
    panel,
    /setMode\(state\.meta\.target === 'professional' \? 'preview' : 'side'\)/,
    '切换渲染管线时采用各自的默认视图，之后仍可由用户切换',
  )
  assert.match(
    panel,
    /<span>\{props\.target === 'professional' \? '文稿' : 'Markdown 文稿'\}<\/span>/,
    '专业模式称「文稿」，快速模式称「Markdown 文稿」',
  )
  assert.ok(!panel.includes('Markdown 源码'), '编辑区标题采用「Markdown 文稿」')
  const preview = panel.slice(panel.indexOf('function Preview'), panel.indexOf('// ── 抽屉'))
  assert.ok(preview.includes('<span>公众号预览</span>'), '预览标题保留渠道名称')
  assert.ok(!preview.includes('themeName'), '预览标题仅保留渠道名称')
  const bundle = fs.readFileSync(BUNDLE, 'utf8')
  for (const copy of ['Markdown 文稿', '只看文稿', '公众号预览']) {
    assert.ok(bundle.includes(copy), `文稿与预览文案要进入产物：${copy}`)
  }
})

test('客户端只保留复制链路，不包含草稿发布与登录态管理', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  for (const copy of ['复制到剪贴板', '复制后可粘贴到目标编辑器', '已复制到剪贴板：可粘贴到目标编辑器']) {
    assert.ok(source.includes(copy), `复制文案缺失：${copy}`)
  }
  assert.ok(source.includes('renderCopyHtml'), '复制与导出统一走 renderCopyHtml')
  assert.ok(source.includes('mode: "publish"'), '复制仍使用 /render 的 publish 形态')
  for (const absent of [
    '/publish',
    '/auth',
    'publishToDraft',
    'publishStatus',
    'authStatus',
    'clearAuth',
    'PublishControls',
    'fp-publish',
    '发送到草稿箱',
    '正在检查登录态',
    '清除登录态',
    '微信登录',
    '秀米登录',
  ]) {
    assert.ok(!source.includes(absent), `客户端产物不应包含：${absent}`)
  }
})

test('复制回退路径使用清洗后的 HTML', () => {
  // 回退分支把 HTML 插进挂主文档的容器：那里 `innerHTML = html` 会让正文里的
  // `<img onerror>` / `<script>` 当场生效（同源，能调 /fishpai/api/*）。
  // 源码与产物共同约束回退分支的清洗链路。
  const panel = fs.readFileSync(path.join(ROOT, 'client', 'panel.tsx'), 'utf8')
  const sanitizeSrc = fs.readFileSync(path.join(ROOT, 'client', 'sanitize.ts'), 'utf8')
  const bundle = fs.readFileSync(BUNDLE, 'utf8')

  for (const [where, text] of [
    ['client/panel.tsx', panel],
    ['lib/client.js', bundle],
  ]) {
    assert.ok(text.includes('replaceChildren(sanitizeHtmlFragment('), `${where}: 回退分支要走 sanitizeHtmlFragment`)
    assert.ok(!text.includes('holder.innerHTML'), `${where}: 回退分支仅插入清洗后的 HTML`)
  }

  // 同时核对 sanitize.ts 的实现特征与产物，覆盖清洗标签和 data URI 白名单。
  const dropTags = [...(/const DROP_TAGS = new Set\(\[([\s\S]*?)\]\)/.exec(sanitizeSrc)?.[1] || '').matchAll(/'([A-Z]+)'/g)].map((m) => m[1])
  assert.ok(dropTags.length >= 8, '从 sanitize.ts 读取 DROP_TAGS 清单')
  const missingTags = dropTags.filter((tag) => !bundle.includes(`"${tag}"`))
  assert.deepEqual(missingTags, [], `lib/client.js 里缺 DROP_TAGS 的这些项：${missingTags.join(', ')}（产物是旧的，重新 npm run build）`)

  const rasterRe = /const RASTER_DATA_URI_RE = (\/.+\/[a-z]*)/.exec(sanitizeSrc)?.[1]
  assert.ok(rasterRe, '从 sanitize.ts 读取栅格 data URI 正则')
  assert.ok(bundle.includes(rasterRe), 'lib/client.js 里的栅格 data URI 分支与源码不一致（产物是旧的）')
  assert.ok(bundle.includes('复制已中止'), '解析失败的那句提示要进产物')
})

test('字体控件保存并应用 sans / serif / mono 预设', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // /themes 返回字体预设；面板保存并应用该预设，覆盖主题字体栈。
  assert.ok(source.includes('fonts: ["sans", "serif", "mono"]'), '字体预设进入初始状态')
  assert.ok(source.includes('serif: "衬线"'), '字体预设要有中文名（黑体 / 衬线 / 等宽）')
  assert.ok(source.includes('store.actions.setMeta({ font })'), '字体选择要接到 setMeta')
})

test('字体下拉标明微信粘贴与 HTML 导出的适用范围', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  // 分组小字与主题、字体组合的 tooltip 共同承载适用场景。
  assert.ok(source.includes('仅用于导出 HTML'), '导出场景要有分组小字')
  assert.ok(source.includes('fp-font-opt-${font}'), '衬线/等宽使用 listbox 选项结构')
  // esbuild 输出统一用双引号
  assert.ok(source.includes('state.meta.font === "sans"'), '字体 tooltip 同时参考主题与字体')
})

test('主题下拉「我的」分组提供命名主题删除入口', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('fp-menu-x'), '分组标题右边要有删除按钮的样式钩子')
  assert.ok(source.includes('onDeleteCustom'), 'ThemePicker 要把删除回调接出来')
  assert.ok(source.includes('clearCustomTheme'), 'store 要有删除动作')
})

test('风险提示按主题记录关闭状态，切换主题后重新评估', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('fp-banner-x'), '风险提示提供关闭按钮')
  assert.ok(source.includes('setRiskDismissed(currentTheme.key)'), '关闭状态记录当前主题 key')
  assert.ok(source.includes('setRiskDismissed(null)'), '切换主题时重置关闭状态')
})

test('快捷键速查表：宽度随面板收缩（定宽会在窄栏里溢出、标签被裁掉）', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('max-width:calc(100% - 12px)'), '速查表通过 max-width 适应窄面板')
  assert.ok(!source.includes('z-index:3;width:266px'), '宽度由面板上下文与 max-width 共同约束')
  // 定位上下文交给整行（.fp-pane-head），百分比宽度才有"面板宽度"可依
  assert.ok(source.includes('position:relative') && source.includes('fp-pane-head'), '速查表挂在编辑器头上那一行')
})

test('面板提示与批注定位文案进入产物', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('可以改用旁边的「导出 HTML」拿文件'), '复制失败要指向另一个按钮')
  assert.ok(source.includes('可以改用「复制到剪贴板」'), '导出失败要指向另一个按钮')
  assert.ok(source.includes('文字还在输入框里'), '批注失败要说明文字没丢')
  assert.ok(source.includes('正文还是空的'), '没有落点时要说清楚为什么没加上')
  assert.ok(source.includes('"定位"'), '批注卡片要有「定位」按钮')
  assert.ok(source.includes('引用片段已被改写'), '高亮不了时要说明原因')
  assert.ok(source.includes('data-kind'), '提示条要按 kind 区分类别（成功/失败一眼可分）')
})

test('空面板的载入、失败与空文档状态提供对应操作', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  for (const copy of ['鱼排编辑器', '鱼排插件启动中…', '新建空白文档', '最近打开', '面板没能载入']) {
    assert.ok(source.includes(copy), `空面板文案缺失：${copy}`)
  }
  assert.ok(source.includes('重试'), '载入失败提供重试操作')
  assert.ok(source.includes('fp-blank-card') && source.includes('fp-docrow'), '空面板卡片的样式类应在产物里')
  assert.ok(source.includes('fp-sweep'), '载入中的进度条动画')
})

test('工具行按编辑控制与交付动作分组，空间不足时整组换行', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  const panel = fs.readFileSync(path.join(ROOT, 'client', 'panel.tsx'), 'utf8')
  for (const snippet of [
    'className="fp-btn fp-icon-btn"',
    'title="重新载入文档"',
    'aria-label="重新载入文档"',
    'disabled={!active || state.refreshing}',
    'onClick={() => void store.actions.reloadSafely()}',
    '<RefreshGlyph />',
    '<Btn primary title="导出 HTML" onClick={() => void onExport()}>',
    'const html = await store.actions.exportHtml()',
  ]) {
    assert.ok(panel.includes(snippet), `工具行交互缺失：${snippet}`)
  }
  for (const absent of ['<details className="fp-more">', 'fp-more-menu', 'title="更多操作"']) {
    assert.ok(!panel.includes(absent), `面板不应包含更多菜单：${absent}`)
    assert.ok(!source.includes(absent), `产物不应包含更多菜单：${absent}`)
  }
  const modeGroupAt = panel.indexOf('className="fp-mode-controls"')
  const refreshAt = panel.indexOf('title="重新载入文档"')
  const actionGroupAt = panel.indexOf('className="fp-actions"')
  const noteAt = panel.indexOf('给光标所在段落写一条批注')
  const exportAt = panel.indexOf('<Btn primary title="导出 HTML"')
  const copyAt = panel.lastIndexOf('复制到剪贴板')
  const modesAt = panel.indexOf('aria-label="渲染模式"')
  assert.ok(modeGroupAt >= 0 && modeGroupAt < modesAt && modesAt < refreshAt, '专业 → 刷新属于同一控制组')
  assert.ok(!panel.includes('state.meta.mobile') && !panel.includes('data-mobile'), '预览不提供宽度开关')
  assert.ok(source.includes('.fp-preview{width:375px;max-width:100%;height:100%;border:0;background:#fff}'), '预览固定手机宽度且不带外框')
  assert.ok(!source.includes('.fp-preview[data-mobile'), '样式表不保留宽页距预览分支')
  assert.ok(refreshAt < actionGroupAt && actionGroupAt < noteAt && noteAt < exportAt && exportAt < copyAt, '批注 → 导出 → 复制属于同一交付动作组')
  assert.ok(source.includes('.fp-mode-controls,.fp-actions{') && source.includes('flex-wrap:nowrap'), '两组内部均禁止逐项换行')
  assert.ok(source.includes('.fp-row .fp-btn-primary{min-height:26px}'), '导出与复制共用按钮高度')
  assert.ok(source.includes('.fp-icon-btn{') && source.includes('width:26px;min-height:26px;padding:0'), '刷新保持方形纯图标按钮')
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
  // 编辑动作通过 execCommand('insertText') 维持原生撤销栈。
  assert.ok(source.includes('"insertText"'), '编辑动作通过 insertText 维持撤销栈')
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
  assert.match(source, /image\\?\//, '图片走上传，普通文本交给浏览器')
  assert.ok(source.includes('超过') && source.includes('上限'), '超限提示包含上限说明')
  // 预览 iframe 是沙箱 srcdoc：本地图必须由面板取回来变成 data URI，相对路径在里面拿不到
  assert.ok(source.includes('readAsDataURL'), '用 FileReader 转 data URI（blob: 在不透明源里取不到）')
  assert.ok(source.includes('"/asset?"') || source.includes('/asset?'), '图片要从 /asset 取回')
  assert.ok(source.includes('imageMap'), '预览要带上内联进来的图')
})

test('两个开关直接读取宿主渲染结果', () => {
  const source = fs.readFileSync(BUNDLE, 'utf8')
  assert.ok(source.includes('linkCount'), '「脚注」开关读取 linkCount')
  assert.ok(source.includes('hasCode'), '「Mac 代码框」开关读取 hasCode')
  assert.ok(!source.includes('hasExternalLinks'), '外链可用性只读取 linkCount')
  assert.ok(!source.includes('hasCodeBlocks'), '代码块可用性只读取 hasCode')
})

test('apply() 在右侧栏服务不存在时也安全，注册的东西可收回', async () => {
  const harness = loadBundle({ services: { sidebarRightTabs: undefined, sidebarRight: undefined } })
  harness.apply()
  await flush()

  assert.ok(harness.appended.length >= 1, '样式应被注入一次')
  assert.equal(harness.registeredTabs.length, 0, '官方席位决定 tab 注册数量')
  assert.equal(harness.registeredSlots.length, 0)
  assert.equal(harness.effects.length, 2, '样式 + 轮询两个 effect')
  assert.equal(harness.timers.length, 1, '应挂一个轮询')
  // 清理链要 await 到底：cordis 的 `fiber.dispose()` 返回 Promise，
  // await 确保槽位注销完成，重新挂载使用当前席位。
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

test('启动时工作目录尚未就绪：首次成功轮询自动恢复面板初始化', async () => {
  let stateCalls = 0
  const harness = loadBundle({
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    fetchImpl: (url) => {
      const target = String(url)
      if (target.startsWith('/fishpai/api/state')) {
        stateCalls += 1
        if (stateCalls <= 2) throw new Error('无法解析会话工作目录：s1')
        return {
          ok: true,
          docs: [{ key: 'k1', path: 'k1.md', title: '启动恢复' }],
          active: { key: 'k1', path: 'k1.md', title: '启动恢复', revision: 1 },
        }
      }
      if (target.startsWith('/fishpai/api/themes')) return { ok: true, themes: [], presets: [], sizes: [], fonts: [] }
      if (target.startsWith('/fishpai/api/doc')) {
        return {
          ok: true,
          doc: { key: 'k1', path: 'k1.md', title: '启动恢复', markdown: '恢复后的正文', revision: 1 },
          meta: { target: 'professional' },
          blocks: [], notes: [], placeholders: [], images: [], history: [],
        }
      }
      if (target.startsWith('/fishpai/api/render')) return { ok: true, html: '<p>恢复后的正文</p>', linkCount: 0, hasCode: false }
      return { ok: true }
    },
  })
  harness.apply()
  await flush()
  const host = harness.registeredSlots.find((s) => s.descriptor.name === 'sidebar.right.pane.tab')
  assert.ok(host, '面板槽位已注册')
  const panel = host.component({ sessionId: 's1' })
  const store = panel.props.store
  await store.actions.init({ startup: true })
  assert.equal(store.getSnapshot().status, 'loading')
  assert.equal(store.getSnapshot().error, null, '启动未就绪只保持加载提示，不落错误页')

  harness.timers[0]()
  await flush(8)

  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().docKey, 'k1')
  assert.equal(store.getSnapshot().markdown, '恢复后的正文')
  assert.equal(store.getSnapshot().error, null)
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
