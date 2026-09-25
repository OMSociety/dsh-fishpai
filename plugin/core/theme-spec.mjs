/**
 * 模型自定义主题（**主题规格**）：校验 + 合并。
 *
 * 为什么是数据而不是代码：内置主题本身就是"19 个样式槽位 → 一段 CSS 声明"的数据
 * （`plugin/vendor/themes.js`），`makeStyler()` 只做 `{{PRIMARY}}` / `{{PRIMARY_BG}}` 占位符替换。
 * 所以"让模型写主题"= 让模型写**同构的数据**，不需要求值任何模型给的代码。
 *
 * 两条硬约束，都在这里把关：
 *   1. **必须在某个内置主题上做增量覆盖**。渲染器对缺失槽位的处理是"不加 style 属性"
 *      （`markdown.mjs`：`styles[key] ? ` style="…"` : ''`），所以"从零写一套"等于大部分元素没有样式。
 *      合并后 19 个槽位必然齐备。
 *   2. **属性白名单**。只放行内置主题实际用过的那批属性——那 11 套是真人实测能在公众号里活的；
 *      名单之外的属性一律拒绝，免得模型写出一条微信会丢的声明，或者干脆是注入。
 *
 * 这一层是纯函数：不碰文件系统、不去求值。
 */

/**
 * 主题的样式槽位（与内置主题一一对应）。
 * 加槽位要同时改 `plugin/vendor/themes.js` 与 `markdown.mjs` 的渲染规则，不是这里的自由项。
 */
export const THEME_SLOTS = [
  'wrapper',
  'h1',
  'h2',
  'h3',
  'p',
  'blockquote',
  'code_inline',
  'code_block',
  'ul',
  'ol',
  'li',
  'img',
  'a',
  'table',
  'th',
  'td',
  'hr',
  'strong',
  'em',
]

/**
 * 允许出现在自定义主题里的 CSS 属性。
 *
 * **这份名单是统计出来的，不是挑出来的**：把 11 套内置主题的 19 个槽位全部拆开，
 * 出现过的属性就是下面这 30 个（含 `-webkit-` 两个渐变文字用的）。要加属性请先给出
 * "它在真实公众号里活下来"的证据，并同时补 `test/theme-spec.test.mjs` 的用例。
 */
export const SPEC_PROPS = new Set([
  'margin',
  'color',
  'font-size',
  'padding',
  'background',
  'font-weight',
  'line-height',
  'border-radius',
  'border',
  'padding-left',
  'font-style',
  'text-align',
  'border-left',
  'font-family',
  'border-bottom',
  'letter-spacing',
  'overflow-x',
  'max-width',
  'display',
  'text-decoration',
  'width',
  'border-collapse',
  'height',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
  'padding-bottom',
  'box-shadow',
  'text-indent',
  'border-image',
  'border-top',
])

/**
 * 主题色占位符：自定义主题照样能用它，于是面板的色板对它也有效。
 *
 * 两个形态是刻意的：`.test()` 用在**带 `g` 的正则**上会被 `lastIndex` 影响（上一轮匹配到哪，
 * 下一轮就从哪开始），所以判定用不带 `g` 的那个，替换用带 `g` 的那个。
 */
const PLACEHOLDER_RE = /\{\{PRIMARY(?:_BG)?\}\}/
const PLACEHOLDER_G = /\{\{PRIMARY(?:_BG)?\}\}/g

/**
 * 明确不许出现的东西：注入面（`}` / `<` / **双引号**）、外链请求（`url(`）、脚本（`expression` / `javascript:`）、样式表指令。
 *
 * 双引号是必须禁的那一个：属性**一律由双引号包裹**（`markdown.mjs` 各槽位拼的就是 `style="…"`，
 * `render.mjs` 的 wrapper 也是），值里出现 `"` 就闭合了属性、把后面的字节变成任意属性。
 * 单引号放行：它在双引号包裹的属性里只是普通字符，闭合不了任何东西，而
 * `font-family: 'Georgia', serif` 是合法且常见的写法，禁它只是白白挡住常见写法。
 * （管线后段只有单向的 `"` → `'` 降级，没有反向把 `'` 变回 `"` 的路径，放行不会又被武装回来。）
 *
 * 判定前先把**合法占位符**摘掉：`{{PRIMARY}}` 自己就带花括号，不摘的话所有想用主题色的主题
 * 都会被自己的注入检查拦下（占位符是这套机制的一部分，不是注入面）。
 */
const FORBIDDEN_RE = /[{}<>"]|url\s*\(|expression\s*\(|@import|javascript:/i

function stripPlaceholders(text) {
  return String(text).replace(PLACEHOLDER_G, 'P')
}

const MAX_NAME = 24
const MAX_DECLS = 24
const MAX_VALUE = 200

/**
 * 规格只认这三个键。
 *
 * `emoji` / `icon` 之类**故意不收**：图标由鱼排统一提供。
 * 合法图标名的名单只存在于浏览器那半（`@deepseek-ai/dsh-client-ui-primitives` 的 `Icon*` 导出），
 * 而校验器在宿主这半——让模型选名字就得在宿主再抄一份名单并跟着 DSH 升级维护，
 * 抄漏一个的后果是**图标静默消失且不报错**。统一图标只需客户端一行降级逻辑。
 * 多写的键一律报错（而不是默默忽略）：写了没作用，比不让写更容易骗人。
 */
const SPEC_KEYS = ['name', 'base', 'styles']

function fail(message) {
  throw new Error(message)
}

function cleanName(raw, fallback) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return fallback
  if (name.length > MAX_NAME) fail(`主题名太长（最多 ${MAX_NAME} 个字）：${name.slice(0, MAX_NAME)}…`)
  return name
}

/** 把一段 CSS 声明拆成 `[prop, value]`，逐条过白名单；返回规范化后的声明串。 */
function parseDeclarations(slot, css, notes) {
  const text = String(css ?? '')
  if (/[\r\n]/.test(text)) fail(`槽位 ${slot} 的样式不能换行（写成一行，用 ; 分隔）`)
  if (FORBIDDEN_RE.test(stripPlaceholders(text))) {
    fail(`槽位 ${slot} 里出现了不允许的内容（{}、<>、双引号、url()、expression、@import 都不能用；单引号可以；{{PRIMARY}} 这类占位符是允许的）`)
  }
  const out = []
  for (const raw of text.split(';')) {
    const decl = raw.trim()
    if (!decl) continue
    const m = /^([-a-zA-Z]+)\s*:\s*(\S[\s\S]*)$/.exec(decl)
    if (!m) fail(`槽位 ${slot} 里有看不懂的声明：「${decl}」（要写成 "属性: 值"）`)
    const prop = m[1].toLowerCase()
    let value = m[2].trim()
    if (!SPEC_PROPS.has(prop)) {
      fail(`槽位 ${slot} 用了不支持的属性「${prop}」。允许的属性见技能 fishpai 的自定义主题一节（内置主题用过的那批）`)
    }
    if (value.length > MAX_VALUE) fail(`槽位 ${slot} 的属性「${prop}」值太长（最多 ${MAX_VALUE} 字符）`)
    // `!important` 在微信里留不住，留着只会让模型误以为"这样就能强制生效"
    if (/!\s*important/i.test(value)) {
      value = value.replace(/\s*!\s*important/gi, '')
      notes.push(`槽位 ${slot} 的「${prop}」去掉了 !important（微信不保留它，留着会误判）`)
    }
    if (!value) fail(`槽位 ${slot} 的属性「${prop}」没有值`)
    out.push(`${prop}: ${value}`)
    if (out.length > MAX_DECLS) fail(`槽位 ${slot} 的声明太多（最多 ${MAX_DECLS} 条）`)
  }
  return out.join('; ') + (out.length ? ';' : '')
}

/** wrapper 上必须有这两条：面板的「字体」「字号」是靠替换它们生效的（漏了就变成死控件）。 */
const WRAPPER_REQUIRED = ['font-family', 'font-size']

function inheritDecl(baseWrapper, prop) {
  const re = new RegExp(`(?:^|;)\\s*(${prop}\\s*:[^;]+)`, 'i')
  const m = re.exec(String(baseWrapper || ''))
  return m ? m[1].trim() : null
}

/**
 * 校验一份主题规格。
 *
 * @param {object} spec `{ name?, base?, styles? }`
 * @param {Record<string, object>} baseThemes 内置主题表（`runtime.themes()`）
 * @returns {{name: string, base: string, styles: Record<string,string>, notes: string[]}}
 * @throws {Error} 文案是给模型看的：说清哪个槽位、哪个属性、为什么
 */
export function validateThemeSpec(spec, baseThemes) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    fail('theme_spec 必须是一个对象：{ name, base, styles }')
  }
  const extra = Object.keys(spec).filter((k) => !SPEC_KEYS.includes(k))
  if (extra.length) {
    fail(`主题规格只认 ${SPEC_KEYS.join(' / ')}，多了：${extra.join(' / ')}（图标与 emoji 由鱼排统一给，不用你选）`)
  }
  const notes = []
  const base = String(spec.base ?? 'default')
  const baseTheme = baseThemes && baseThemes[base]
  if (!baseTheme) {
    fail(`base 必须是已有的主题 key，没有「${base}」。可选：${Object.keys(baseThemes || {}).join(' / ')}`)
  }
  const name = cleanName(spec.name, `${baseTheme.name}·自定义`)

  const rawStyles = spec.styles
  if (rawStyles === undefined || rawStyles === null) {
    fail('styles 不能为空：至少要写一个想改的槽位（例如 {"p": "line-height: 2;"}）')
  }
  if (typeof rawStyles !== 'object' || Array.isArray(rawStyles)) fail('styles 必须是对象：{ 槽位: "CSS 声明" }')
  const keys = Object.keys(rawStyles)
  if (!keys.length) fail('styles 里一个槽位都没有：至少要写一个想改的槽位')

  const styles = {}
  for (const slot of keys) {
    if (!THEME_SLOTS.includes(slot)) {
      fail(`不认识的槽位「${slot}」。可用槽位：${THEME_SLOTS.join(' / ')}`)
    }
    const css = rawStyles[slot]
    if (typeof css !== 'string') fail(`槽位 ${slot} 必须是字符串（形如 "font-size: 18px; color: #333;"）`)
    const normalized = parseDeclarations(slot, css, notes)
    if (!normalized) fail(`槽位 ${slot} 是空的：要么写内容，要么别写这个键`)
    styles[slot] = normalized
  }

  // wrapper 是唯一的硬性缺口：模型很容易只写 line-height / color，漏掉字体字号，
  // 结果面板上「字体」「字号」两个控件点了没反应——那正是最不该出现的"死控件"。
  if (styles.wrapper) {
    const missing = WRAPPER_REQUIRED.filter((prop) => !inheritDecl(styles.wrapper, prop))
    if (missing.length) {
      const parts = []
      for (const prop of missing) {
        const inherited = inheritDecl(baseTheme.styles && baseTheme.styles.wrapper, prop)
        if (!inherited) fail(`槽位 wrapper 缺少 ${prop}，且 base 主题里也没有，无法补全`)
        parts.push(inherited)
      }
      styles.wrapper = `${styles.wrapper} ${parts.join('; ')};`.replace(/\s+/g, ' ')
      notes.push(
        `wrapper 自动补上了 ${missing.join(' / ')}（从 base 继承）——漏了它们，面板的「字体」「字号」会变成点了没反应的死控件`,
      )
    }
  }

  if (!PLACEHOLDER_RE.test(Object.values(styles).join(';'))) {
    notes.push('没有用到 {{PRIMARY}}：面板的「主题色」色板对这个主题不会有效果（这没有错，只是提醒）')
  }
  return { name, base, styles, notes }
}

/**
 * 把校验过的规格合并到 base 主题上，得到一份完整主题（19 个槽位齐备）。
 *
 * @param {object} baseTheme `baseThemes[spec.base]`
 * @param {{name: string, styles: Record<string,string>}} spec `validateThemeSpec()` 的产物
 * @returns {object} 可以直接交给 `render({theme})` 的主题对象
 */
export function mergeTheme(baseTheme, spec) {
  return {
    key: 'custom',
    name: spec.name,
    emoji: '✳️',
    desc: `自定义主题（基于「${baseTheme.name}」）`,
    custom: true,
    styles: { ...(baseTheme.styles || {}), ...spec.styles },
  }
}

/** 一步到位：校验 + 合并。给工具与路由用。 */
export function buildCustomTheme(spec, baseThemes) {
  const checked = validateThemeSpec(spec, baseThemes)
  return { theme: mergeTheme(baseThemes[checked.base], checked), spec: checked }
}

/** 给模型看的一行说明（工具返回里带上，省得它去猜自己写了什么）。 */
export function describeThemeSpec(spec) {
  const slots = Object.keys(spec.styles)
  return `自定义主题「${spec.name}」（base=${spec.base}）改了 ${slots.length} 个槽位：${slots.join('、')}`
}
