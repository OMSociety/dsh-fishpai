/**
 * 渲染主流程：Markdown → 可直接粘贴进微信公众号编辑器的内联样式 HTML。
 *
 * 这是 `mopai/render.js`（迁移前，与墨排线上站点逐条对齐过）的 ESM 移植。
 * **默认参数下，输出与迁移前的实现逐字节相同**，由 `test/golden/**` 守着
 * （golden 由 `test/oracle/render.cjs` 生成，那是移植前的冻结实现）。
 *
 * 相对移植前新增的能力，都**由调用方显式启用**，默认路径一个字节都不变
 * （`test/golden/**` 守的就是"都不生效"这条默认路径）：
 *   - `annotate: true`        在每个顶层块前插一个不可见的 `<fp-block data-b="ID">` 锚点（只给预览用）
 *   - `imageResolver`         把图片 src 换成 data URI（宿主实现读文件；只给复制/导出用）
 *   - `wrapText: true`        把文字包进 `<span>`（微信结构校验的兼容层；只给复制/导出用）
 *   - `wechatBackground: true` 把 `background` 简写拆成微信肯保留的长写（同上）
 */
import { resolveTheme, themes, FONT_MAP, hljsMap, read } from './runtime.mjs'
import { createMd, makeStyler, collectBlocks } from './markdown.mjs'
import { classifyTheme } from './theme-info.mjs'

// ── 1. 微信脚注：正文外链转上标 + 文末「参考资料」────────────────
// 站点做法：把 <a> 换成 <span>，沿用该 <a> 已经拿到的主题链接样式（含 border-bottom），
// 再补一个 cursor: default 的 <sup>；文末追加纯文本「参考资料」（微信不支持正文外链）。
const A_TAG_RE = /<a\s([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g

/**
 * HTML 实体解码（数字 / 十六进制 / 命名三种写法）。
 *
 * 为什么需要：拼进 HTML 的 URL 在**解析时**才被浏览器解码，而"这是不是一个可执行协议"
 * 必须按解码后的样子判——`jav&#97;script:`、`java&Tab;script:` 解码后就是 `javascript:`。
 * 数字那趟只跑一次（`&amp;#97;` 单趟解码成 `&#97;`，与浏览器一致，不接力解码）。
 */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  sol: '/',
  Tab: '\t',
  NewLine: '\n',
  nbsp: '\u00a0',
}

function decodeEntities(text) {
  return String(text)
    .replace(/&#[xX]([0-9a-fA-F]+);?/g, (full, hex) => codePointText(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (full, dec) => codePointText(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : full))
}

function codePointText(code) {
  return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd'
}

/**
 * 归一化一个 URL：实体解码 → 抹掉空白与控制字符 → 转小写。
 *
 * 顺序不能反：抹空白放在解码之后，`&#9;` 这种"解码出来才是空白"的写法才会被吃掉。
 * 空白与控制字符一律删掉（而不是 trim）：浏览器解析 URL 时也会丢掉它们。
 */
const IGNORABLE_CHARS_RE = /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]+/g

function squashUrl(text) {
  return decodeEntities(text).replace(IGNORABLE_CHARS_RE, '').toLowerCase()
}

/** 可执行协议：写进 `href`/`src` 就等于在打开产物的那一刻执行。 */
const EXECUTABLE_SCHEME_RE = /^(?:javascript|vbscript):/

/**
 * 请求里的字号是否合法。
 *
 * 为什么渲染层自己也要判：`fontSize` 是**原样插值进 `style="…"`** 的请求字段
 * （`font-size: ${size};`），一个引号就能闭合属性、把后面的字节变成任意属性；而 `render()`
 * 是公开导出（本仓 CLI、宿主工具都直接调它），不能指望每个调用方都记得先校验。
 * 形态只认 `NNpx`；区间 12–24px：面板给的是 14–18px，这个范围足够宽到不误伤手写值，
 * 又挡住 `9999px` 这类把版面撑烂的写法。不合法一律**回落 16px**（与缺省同一条路）。
 */
const FONT_SIZE_RE = /^\d{1,2}(?:\.\d+)?px$/
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 24

export function isFontSize(value) {
  if (typeof value !== 'string' || !FONT_SIZE_RE.test(value)) return false
  const n = Number.parseFloat(value)
  return n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX
}

/**
 * 哪些 `<a>` 会被转成脚注（同一条规则必须被"渲染"与"数给面板看"两处共用）。
 *
 * 为什么要单独数一遍：面板的「脚注」开关以前靠**猜**正文里有没有外链（正则只认带 `//` 的写法），
 * 于是 `github.com/foo/bar` 这种能被 linkify 变成链接、也会生成「参考资料」的写法，
 * 开关却是灰的——用户点了没反应，也关不掉。现在由渲染结果说话。
 *
 * 判定前先归一化（实体解码 + 抹空白 + 转小写），再按**白名单**判：只有 http / https / mailto
 * 算外链。`JavaScript:`、`java\tscript:`、`jav&#97;script:` 这类写法都能骗过朴素的前缀比较，
 * 而它们进了「参考资料」就是一条能被点开的可执行链接（导出成 .html 双击即中招）；
 * 白名单把 `data:` / `file:` 这些同样不属于"正文外链"的协议一并挡在外面。
 *
 * `#` 是页内锚点：原判据就不把它当外链（它也不该生成「参考资料」），这里保持原语义。
 *
 * **取舍**：白名单是"只认这几种协议"，不是"排除危险协议"，所以相对链接（`./other.md`）、
 * 根路径（`/abs/path.md`）与 `ftp:` / `tel:` 也不再进「参考资料」——它们会**原样留在产物里**
 * 当普通 `<a>`（`linksToFootnotes` 跳过、`isFootnoteHref` 也把它们排除在计数外）。
 * 这是有意的：粘进公众号的相对链接本来点不开，硬转成文末文本反而把可点的绝对链接和它们混在一起；
 * 要改这条得先想清楚"微信里点不开的链接该长什么样"，不要顺手放宽。
 */
export function isFootnoteHref(href) {
  const norm = squashUrl(href)
  if (!norm || norm.startsWith('#')) return false
  return /^(?:https?|mailto):\S/.test(norm)
}

/** 正文里会被转成脚注的链接（顺序与编号一致）。 */
export function footnoteLinks(html) {
  const links = []
  String(html).replace(A_TAG_RE, (full, pre, href, post, inner) => {
    if (isFootnoteHref(href)) links.push({ text: inner.replace(/<[^>]+>/g, ''), href })
    return full
  })
  return links
}

export function linksToFootnotes(html) {
  const links = []
  const supStyle = 'color: inherit; font-size: 80%; vertical-align: super; cursor: default;'
  const out = html.replace(A_TAG_RE, (full, pre, href, post, inner) => {
    if (!isFootnoteHref(href)) return full
    const text = inner.replace(/<[^>]+>/g, '')
    const idx = links.length + 1
    links.push({ idx, text, href })
    // 原 <a> 上的 style 即主题链接样式，站点直接沿用它
    const sm = full.match(/\sstyle="([^"]*)"/)
    const spanStyle = sm ? sm[1] : ''
    return `<span style="${spanStyle}">${inner}<sup style="${supStyle}">[${idx}]</sup></span>`
  })
  if (!links.length) return out
  return (
    out +
    `\n<section style="margin-top: 28px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; line-height: 1.8; color: #999;">\n` +
    `<p style="margin: 0 0 8px; font-weight: 600; color: #666;">参考资料</p>\n` +
    links
      .map(
        (l) =>
          `<p style="margin: 0 0 4px; word-break: break-all;">${l.text && l.text !== l.href ? `[${l.idx}] ${l.text}: ${l.href}` : `[${l.idx}] ${l.href}`}</p>`,
      )
      .join('\n') +
    `\n</section>`
  )
}

// ── 2. 清理：去掉公众号不认的属性 ──────────────────────────────
// 注意：不做全局空白折叠 —— 站点是 DOM 序列化，段落/标题开始的换行会保留成文本节点，
// 折叠它反而会改变预览观感（列表项还会多出缩进）。

/**
 * 会活动的内容：**解析时无害、打开/插入之后才生效**的那些。
 *
 * 产物经「导出 HTML」落盘，`file://` 双击就是以用户权限跑的一个页面；同一条路径也回退给
 * 浏览器剪贴板（`panel.tsx` 的 `copyRich`）。所以这里剥的不是"微信公众号不认的属性"，
 * 而是正文里混进来的可执行内容：
 *   - 成对标签整段剥（`<script>` 连脚本体一起）；
 *   - 没闭合的 `<script>`／`<style>` 剥到文档末尾：它们的内容模型是**原始文本**，
 *     浏览器会把后面的字节全当它们的文本（不是"多包一层元素"），留着等于把正文交给它；
 *   - 没闭合的 `<iframe>`／`<object>` **只删标签本身**：它们是普通元素，后面的内容浏览器
 *     照常当标记解析，剥到末尾会把用户后面的正文一起吞掉；
 *   - `<link>` / `<meta>` / `<base>` / `<embed>` 是空元素，只删标签（外链样式表、跳转、改基准地址）；
 *   - `on*` 事件属性与 `srcdoc`：`<img src=x onerror=…>` 这类就是靠它们生效的；
 *   - `href`/`src` 上的可执行协议：按**解码后**的形态判（`jav&#97;script:` 也算），
 *     值不合法就整个属性去掉——留着半截 `alert(1)` 当 URL 没有意义。
 * 单引号/不带引号的属性值、以及引号没闭合的写法都要认：`html: true` 会把正文里的裸 HTML 原样带进来。
 * 前四条按整段文本处理（它们的前提就是字面出现 `<script>` 这类标签），
 * 属性那两条只在标签内部做，理由见 `cleanTagAttributes`。
 */
const DANGEROUS_PAIR_RE = /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const RAW_TEXT_OPEN_RE = /<(?:script|style)\b[^>]*>[\s\S]*$/gi
const RAW_TEXT_CLOSE_RE = /<\/(?:script|style)\s*>/gi
const CONTAINER_TAG_RE = /<\/?(?:iframe|object)\b[^>]*>/gi
const VOID_TAG_RE = /<\/?(?:link|meta|base|embed)\b[^>]*>/gi
// 属性不做"整段正则替换"，而是把标签范围**按属性切一遍**（见 `scanAttributes`）。
// 正则认不出"属性值的边界"：`style="color: red" onmouseover="…"` 里第一个 `"` 之后的东西
// 会被当成新属性（既可能误删正常内容，也可能被引号值后紧接属性名 `src="x"onerror=…` 绕过）。
const URL_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'srcset',
  'poster',
  'formaction',
  'action',
  'data',
  'background',
  'dynsrc',
  'lowsrc',
])

/**
 * 这个属性是不是危险属性（事件处理器、srcdoc，或值是执行协议的 URL 属性）。
 *
 * 判定前把属性名**开头的非 ASCII 字母**剥掉：`\onerror=`、`\0onerror=` 这类写法里的 `\`/NUL
 * 不终止属性名（浏览器把它们算进名字里），按原样比 `on` 前缀会漏掉；对合法属性名（一律以
 * 字母开头）这一步是恒等变换，`data-onerror` / `x-onerror` 也不会被误伤。
 */
function attributeIsDangerous(name, value) {
  const lower = name.toLowerCase().replace(/^[^a-z]+/, '')
  if (lower.startsWith('on') || lower === 'srcdoc') return true
  if (!URL_ATTRS.has(lower)) return false
  const raw = String(value ?? '').replace(/^["']|["']$/g, '')
  if (lower === 'srcset') {
    return raw.split(',').some((candidate) => EXECUTABLE_SCHEME_RE.test(squashUrl(candidate.trim().split(/\s+/)[0] || '')))
  }
  return EXECUTABLE_SCHEME_RE.test(squashUrl(raw))
}

/**
 * 把 `<` 到范围末尾之间的字节按属性切一遍（返回每个属性的字节范围与值）。
 *
 * 为什么要自己走一遍而不是拿正则扫：属性的边界只能靠"引号里的 `=`/空白不算分隔"来判断，
 * 而正则分不清 `style="color: red" onmouseover="…"` 里那个 `onmouseover` 是属性还是**前一个
 * 属性值里的文字**（把它当属性就会误删正常内容）；也认不出引号值后紧接属性名的写法
 * （`src="x"onerror=…`，HTML 分词器允许），那样会漏掉真正的处理器。
 *
 * @returns {Array<{start:number,end:number,name:string,value:string,unterminated:boolean}>}
 *          `start`/`end` 是属性名到值末尾的字节范围；`unterminated` 表示它的引号值一直没闭合。
 */
function scanAttributes(region) {
  const attrs = []
  let i = 1
  // 跳过标签名（`!`/`/` 开头的那些也当名字处理，反正只用来定位属主的边界）
  while (i < region.length && !/[\s/]/.test(region[i])) i++
  while (i < region.length) {
    while (i < region.length && /[\s/]/.test(region[i])) i++
    if (i >= region.length) break
    const start = i
    while (i < region.length && !/[\s=/]/.test(region[i])) i++
    const name = region.slice(start, i)
    if (!name) {
      i++
      continue
    }
    let j = i
    while (j < region.length && /\s/.test(region[j])) j++
    if (region[j] !== '=') {
      attrs.push({ start, end: i, name, value: '', unterminated: false })
      continue
    }
    j++
    while (j < region.length && /\s/.test(region[j])) j++
    const valueStart = j
    let unterminated = false
    if (region[j] === '"' || region[j] === "'") {
      const quote = region[j]
      j++
      while (j < region.length && region[j] !== quote) j++
      if (j < region.length) j++
      else unterminated = true
    } else {
      while (j < region.length && !/[\s>]/.test(region[j])) j++
    }
    attrs.push({ start, end: j, name, value: region.slice(valueStart, j), unterminated })
    i = j
  }
  return attrs
}

/**
 * 清洗一个标签范围，回清洗后的文本（`''` = 这个标签整段丢掉）。
 *
 * 值**引号没闭合**时整个标签都丢掉，而不是只剪掉属性：HTML 分词器对这种写法的处理是
 * "这个属性值一路吃到标签结束/EOF"，标签名后面的字节全是属性值——剪掉值会留下一个孤零零的
 * 标签名，跟下一个标签粘成一个（`<div` + `<p …>` 会并成一个 div），还会把正常内容卷进属性里。
 * 整段丢掉才是"这个标签从没正常成立过"的等价形态；范围本身收在下一个 `<` 或第一个 `>` 内，
 * 所以丢掉的字节不会越出这个畸形标签。
 */
function cleanTagRegion(region) {
  const attrs = scanAttributes(region)
  let out = ''
  let cursor = 0
  let dropped = false
  for (const attr of attrs) {
    if (!attributeIsDangerous(attr.name, attr.value)) continue
    let from = attr.start
    // 连同属性名前的空白一起删（`<img src=x onerror=…>` 洗出来仍是 `<img src=x>`）
    while (from > cursor && /\s/.test(region[from - 1])) from--
    out += region.slice(cursor, from)
    cursor = attr.end
    if (attr.unterminated) dropped = true
  }
  if (dropped) return ''
  return out + region.slice(cursor)
}

/**
 * 这一段是不是真的从标签开头（`<` 后面是标签名或 `/`）。
 *
 * 注释与处理指令（`<!…` / `<?…`）**不算**：里面的东西浏览器一律不求值，
 * 在注释文本里删"属性"只会把注释本身改坏（比如把 `--` 和后面的字节连起来）。
 */
const TAG_START_RE = /^<[a-zA-Z/]/

/**
 * 属性清洗只在**标签内部**做。
 *
 * 不能拿属性扫描直接扫整段 HTML：正文里原样写出的 ` onclick="…"` 是**文字**不是属性
 * （`html: true` 放行的裸 HTML 里就会出现），扫进去会把用户的正文字吃掉。
 * 所以先切出标签范围，只对"确实以标签开头"的范围动手——散文里的 `<`（`价格 < 100`）连同
 * 后面的文字原样留下，不参与属性清洗。
 */
function cleanTagAttributes(html) {
  let out = ''
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += html.slice(i)
      break
    }
    out += html.slice(i, lt)
    const end = tagBodyEnd(html, lt)
    const region = html.slice(lt, end)
    out += TAG_START_RE.test(region) ? cleanTagRegion(region) : region
    i = end
  }
  return out
}

/**
 * 切出一个标签的**标签体**范围（返回结束位置，不含该位置）。
 *
 * 引号感知是必需的：属性值里可以有 `>`（`alt="a>b"`），按"第一个 `>`"切会把标签切断，
 * 断点之后的属性就落到标签外、不再被清洗——而浏览器照样把它们当属性。
 *
 * 窗口边界：正常情况到**第一个不在引号里的 `>`**；引号一直没闭合时收到**下一个 `<`**
 * 为止——那时浏览器也停在"属性值还没结束"的状态，窗口外的字节变不成属性；不在那里收住，
 * 一个畸形引号就会把用户后面的正文整卷进来。`<` 只在引号**开着**时才收窗口：引号已经闭合的
 * `<` 在浏览器那边是畸形标签里的一个字节（会被算进属性名），继续扫到那个 `>` 才能把后面的
 * 属性一起看见、一起清掉。
 *
 * 所以这条保证的是"**窗口内**看得见的危险属性一律清掉"；窗口外的字节靠浏览器不把它们解析成
 * 属性兜底（`html: true` 放行裸 HTML 之后的既有语义）。两个已知边界：
 *   ① 引号没闭合但**没有**危险属性的标签（`<div class='a>` 这种）原样留下——它不可执行；
 *   ② 属性值里含 `>` 时截断点之后的字节不清洗，如 `<img alt=a>b onerror=…>`：那个 `>`
 *      本来就结束了标签，浏览器同样不会把后面的 `onerror` 当成属性。
 */
function tagBodyEnd(html, lt) {
  let quote = ''
  let firstGt = -1
  for (let j = lt + 1; j < html.length; j++) {
    const ch = html[j]
    if (ch === '<') {
      if (quote) return firstGt >= 0 ? firstGt : j
      continue
    }
    if (ch === '>') {
      if (!quote) return j
      if (firstGt < 0) firstGt = j
      continue
    }
    if (ch === '"' || ch === "'") {
      if (!quote) quote = ch
      else if (quote === ch) quote = ''
    }
  }
  return firstGt >= 0 ? firstGt : html.length
}

function stripActiveContent(html) {
  return cleanTagAttributes(
    String(html)
      .replace(DANGEROUS_PAIR_RE, '')
      .replace(RAW_TEXT_OPEN_RE, '')
      .replace(RAW_TEXT_CLOSE_RE, '')
      .replace(CONTAINER_TAG_RE, '')
      .replace(VOID_TAG_RE, ''),
  )
}

export function cleanForWechat(html) {
  return stripActiveContent(html)
    .replace(/\sclass="mermaid-placeholder"/g, '')
    .replace(/\starget="[^"]*"/g, '')
    .replace(/<div >/g, '<div>')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

// ── 3. 「复制到公众号」那层清洗（对应站点 js/publish-utils.js）──
// 站点点「复制到公众号」时不是照搬预览 HTML，而是走 simplifyHtmlForPlatform：
//   1) 内联样式按白名单过滤（border-radius / box-shadow / letter-spacing 等会被剥掉）
//   2) 去掉 class / data-* 属性
//   3) 代码块扁平化，并把 highlight.js 的 token 颜色内联成 style
//   4) 图片补 max-width:100%; height:auto
const STYLE_ALLOWLIST = new Set([
  'background',
  'background-color',
  'border',
  'border-left',
  'border-right',
  'border-top',
  'border-bottom',
  'border-collapse',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'vertical-align',
  'width',
])

const DEFAULT_PRE_STYLE =
  'margin: 14px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; ' +
  'line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;'

export function filterInlineStyles(styleText) {
  return String(styleText || '')
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((rule) => STYLE_ALLOWLIST.has((rule.split(':')[0] || '').trim().toLowerCase()))
    .join('; ')
}

export function appendInlineStyle(styleText, extra) {
  const cur = String(styleText || '')
  const sep = cur && !cur.trim().endsWith(';') ? '; ' : ''
  return `${cur}${sep}${extra}`
}

function styleFrom(m) {
  if (!m) return null
  let s = ''
  if (m.color) s += `color: ${m.color};`
  if (m.fontWeight && m.fontWeight !== '400' && m.fontWeight !== 'normal') s += ` font-weight: ${m.fontWeight};`
  if (m.fontStyle && m.fontStyle !== 'normal') s += ` font-style: ${m.fontStyle};`
  return s.trim() || null
}

/** 给 highlight.js 的 <span class="hljs-xxx"> 内联颜色
 *  （hljs-map.json 是从真实浏览器导出的计算样式，已处理 CSS 优先级） */
export function hljsStyleFor(cls) {
  const map = hljsMap()
  if (!cls) return null
  // 1) 优先按完整 class 串查（覆盖 "hljs-title function_" 这类复合写法）
  if (map[cls]) return styleFrom(map[cls])
  // 2) 再按 class 出现顺序逐段查，取第一个有规则的
  for (const n of cls.split(/\s+/).filter(Boolean)) {
    if (map[n]) return styleFrom(map[n])
  }
  return null
}

/**
 * 同一份色表的 CSS 形式：预览 iframe（沙箱 srcdoc）里没有 highlight.js 的样式表，
 * 代码块就只剩 class、没有颜色——面板预览看起来是「黑的」，而复制/导出的成品是彩色的。
 * 宿主把它随预览响应下发给客户端注入，**只给预览用**：发布产物走 inlineCodeStyles 内联，
 * 不吃这份 CSS（golden 不受影响）。
 */
export function hljsPreviewCss() {
  const map = hljsMap()
  const lines = []
  for (const key of Object.keys(map)) {
    // 复合选择器（".hljs-meta .hljs-string"）与无前缀的段（"function_"）在预览里用不上，
    // 只发 `hljs-xxx` 这一类；hljsStyleFor 的兜底逻辑保证复合写法仍能命中单段规则
    if (!/^hljs-[A-Za-z0-9-]*$/.test(key)) continue
    const s = styleFrom(map[key])
    if (s) lines.push(`.${key}{${s}}`)
  }
  return lines.join('\n')
}

/** mac 标题栏圆点/语言标签：站点也会被 inlineCodeTokenStyles 命中，补上计算样式 */
export function macSpanStyle(cls) {
  if (/\bmac-dot\b/.test(cls)) {
    let bg = null
    let m = cls.match(/\bmac-dot\s+red\b/)
    if (m) {
      bg = 'rgb(255, 95, 87)'
    }
    m = cls.match(/\bmac-dot\s+yellow\b/)
    if (m) {
      bg = 'rgb(254, 188, 46)'
    }
    m = cls.match(/\bmac-dot\s+green\b/)
    if (m) {
      bg = 'rgb(40, 200, 64)'
    }
    const color = 'rgb(171, 178, 191)'
    let s = `color: ${color};`
    if (bg) s += ` background-color: ${bg};`
    return s
  }
  if (/\bmac-code-lang\b/.test(cls)) return 'color: rgb(171, 178, 191);'
  return null
}

function appendStyle(existing, extra) {
  if (!extra) return existing || ''
  const cur = existing || ''
  if (!cur) return extra
  const sep = cur.trim().endsWith(';') ? ' ' : '; '
  return cur + sep + extra
}

/** 代码块扁平化（站点 simplifyMacCodeBlocks）：
 * 站点 DOM 里 mac 结构嵌在 pre>code 内，所以 block.querySelector('pre') 命中内层 pre，
 * 压平只是给内层 pre 重打一套固定样式，外层 pre>code 原样保留。 */
export function simplifyCodeBlocks(html) {
  return html.replace(/<div class="mac-code-block"([^>]*)>([\s\S]*?)<\/div>\s*<\/code><\/pre>/g, (full, macAttrs, inner) => {
    const innerFixed = inner.replace(/<pre[^>]*>/, `<pre style="${DEFAULT_PRE_STYLE}">`)
    return `<div class="mac-code-block"${macAttrs}>${innerFixed}</div></code></pre>`
  })
}

/**
 * 代码 span 样式内联（站点 inlineCodeTokenStyles）。
 *
 * 真实行为（已实测）：站点对 `pre code span` 里的**每一个** span 都写内联样式，
 * 不只是 hljs token —— mac 标题栏的圆点 span 同样在内。所以这里对
 * `<pre>…</pre>` 区间内的所有 span 统一处理。
 */
export function inlineCodeStyles(html) {
  // 直接在 `<pre>` 区间内部处理 span，不做"先遮罩后还原"：
  // 遮罩用的占位符（`\x01N\x01`）万一在正文里原样出现（模型生成的稿子什么都有可能），
  // 还原那一步会把它当成占位符、把正文替换成某个代码块或空串，静默吃掉正文。
  return html.replace(/<pre[\s\S]*?<\/pre>/g, (m) =>
    m.replace(/<span([^>]*)>/g, (full, attrs) => {
      const cm = attrs.match(/\bclass="([^"]*)"/)
      const cls = cm ? cm[1] : ''
      const sm = attrs.match(/\bstyle="([^"]*)"/)
      const existing = sm ? sm[1] : ''
      const extra = macSpanStyle(cls) || hljsStyleFor(cls)
      if (!extra) return full
      const merged = appendStyle(existing, extra)
      const rest = sm ? attrs.replace(/\sstyle="[^"]*"/, '') : attrs
      return `<span${rest} style="${merged}">`
    })
  )
}

/**
 * 「复制到公众号」那层处理（对应 publish-utils.prepareHtml）。
 *
 * 关键：站点「复制到公众号」按钮走的是 copyToClipboard → copyPublishHtmlToClipboard(false)，
 * 即 simple=false —— **不做样式白名单过滤**，也不压平 mac 代码块；
 * 只做一件事：把代码块内 span 的颜色用 getComputedStyle 内联进去。
 * 微信编辑器自己会丢弃不认识的内联属性。
 */
export function prepareForPublish(html, opts = {}) {
  if (opts.simple) return simplifyForPublish(html)
  return inlineCodeStyles(html)
}

/** 严格简化（站点 simple=true，用于「一键发布到 14 平台」路径）：
 *  样式白名单过滤 + 去 class + 代码块扁平化 + 图片补样式。 */
export function simplifyForPublish(html) {
  html = inlineCodeStyles(html)
  html = simplifyCodeBlocks(html)

  // 逐标签过滤 style + 去掉 class / data-*
  html = html.replace(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (full, tag, body, selfClose) => {
    if (!body || !body.trim()) return full
    let rest = body.replace(/\sclass="[^"]*"/g, '').replace(/\sdata-[a-z-]+="[^"]*"/g, '')
    const sm = rest.match(/\sstyle="([^"]*)"/)
    if (sm) {
      const kept = filterInlineStyles(sm[1])
      rest = rest.replace(/\sstyle="[^"]*"/, kept ? ` style="${kept}"` : '')
    }
    return `<${tag}${rest}${selfClose || ''}>`
  })

  // 图片补微信兼容样式
  html = html.replace(/<img([^>]*?)>/g, (full, body) => {
    const sm = body.match(/\sstyle="([^"]*)"/)
    const merged = appendInlineStyle(sm ? sm[1] : '', 'max-width: 100%; height: auto;')
    const cleaned = sm ? body.replace(/\sstyle="[^"]*"/, '') : body
    return `<img${cleaned} style="${merged}">`
  })

  return html
}

// ── 4. 微信列表项兼容（以行内元素开头的条目前面补一个不换行空格）──

/**
 * 给"以行内元素开头"的列表项补一个 `&nbsp;`。
 *
 * 为什么（两轮对照样张 + 真实公众号实测）：`1. **块级 diff**：AI 读到的不是全文…` 粘进公众号会变成
 * "块级 diff"一行、`：AI 读到的…`一行——微信把条目**开头**那一段单独起了行（像术语表）。
 * 实测出来的边界：
 *   - 条目以**文字**开头（纯文字、普通 span 包着的文字、或前面先有一个 `&nbsp;`）→ 正常
 *   - 加粗出现在**中段** → 正常；**段落**里的加粗开头 → 正常
 *   - "把整条 li 包进一个 span" 试过（`37748d4`）→ **照样拆**，已撤（`32ac970`）
 *
 * 所以只补一个 `&nbsp;` 就够了，两个好处：
 *   - 结构校验那边安全：它的判据是"直接文字子节点的 `textContent.trim()` 非空"，
 *     而 `'\u00a0'.trim() === ''`——li 不会因此变成"直接文字 + 子元素"的候选；
 *   - 视觉上约 1/4 字的缩进，看不出来。
 *
 * **只补"以行内元素开头"的条目**：块级标签（`<p>`/`<ul>`/`<blockquote>`…）开头的条目一律不动。
 * 松散列表（条目之间有空行）的条目首个子元素正是 `<p>`，补进去的文字节点会落在 `<p>` **外面**、
 * 变成 `<li>` 的直接文字子节点，结构上多余。松散列表在公众号里本来就正常
 * （条目第一行上方不会多出空白行、加粗开头也不会被拆行），所以这一层不必管它。
 */
const BLOCK_TAGS = /^(?:p|ul|ol|blockquote|table|pre|h[1-6]|hr|div|dl|dt|dd|figure|section|article)\b/i

export function padListItems(html) {
  if (!html || !html.includes('<li')) return html
  // 只补"紧跟 li 开标签就是**行内**元素"的条目；已经是文字开头、或以块级元素开头的都不用动。
  // 用**真的 U+00A0 字符**而不是 `&nbsp;` 实体：真 DOM 和"直接文字子节点"的判定都把它当空白，
  // 而实体在源码级扫描（我们自己的结构测试）里会被当成普通文字。
  return html.replace(/(<li\b[^>]*>)(\s*)(?=<([a-zA-Z][^\s/>]*))/g, (full, open, ws, tag) =>
    BLOCK_TAGS.test(tag) ? full : `${open}\u00a0${ws}`,
  )
}

// ── 5. 微信底色兼容（background 简写 → 长写）───────────────────
/**
 * 微信编辑器的安全过滤是**按属性名**过的：`background-color` 在名单里，`background` 简写不在。
 * 于是主题里 `background: #f0f8f0` 这种写法粘进公众号后整条声明被丢掉——
 * 实测表现：竹林主题的引用块框、表头底色、行内代码底色全没了（面板预览里明明有）。
 *
 * 所以复制/导出时把简写拆成微信肯保留的长写。这是**纯规范化**：一条声明里只有一个值时，
 * `background: <颜色>` 与 `background-color: <颜色>`、`background: <渐变>` 与
 * `background-image: <渐变>` 的渲染结果完全一样（`background-clip: text` 那类主题也不受影响）。
 */
export function splitBackgrounds(styleText) {
  if (!styleText || !/\bbackground\s*:/.test(styleText)) return styleText
  return styleText.replace(/(^|;)(\s*)background\s*:\s*([^;]+)/g, (decl, lead, space, value) => {
    const v = value.trim()
    if (!v) return decl
    const prop = /gradient\(|url\(|image\(/i.test(v) ? 'background-image' : 'background-color'
    return `${lead}${space}${prop}: ${v}`
  })
}

/** 同上，作用在整段 HTML 的每个 `style="…"` 上（只给复制/导出那条路用）。 */
export function splitBackgroundsInHtml(html) {
  if (!html || !/\bbackground\s*:/.test(html)) return html
  return html.replace(/\sstyle="([^"]*)"/g, (full, styleText) => ` style="${splitBackgrounds(styleText)}"`)
}

// ── 5b. 微信字号兼容（把选定的字号推进到文字所在的块级元素上）─────
/**
 * 字号默认只挂在最外层 wrapper 上，预览里一切正常。但微信编辑器粘进去时会剥掉
 * 最外层 wrapper 的样式——于是正文全退回微信自己的 16px，「字号」控件看着像没用。
 * 表现与「底色简写被丢」是同一类：**外层**的样式靠不住，**元素自己**的样式粘得过去。
 *
 * 把字号补到正文文字所在的 p / li / blockquote 上即可（引用框、表头底色实测都留得住）。
 * 纯叠加：① 没选字号时不加任何字节；② 已经自带字号的元素一律不动——h1–h3 有自己的
 * 字号、表格自己写了 14px（上游里表格字号本来就不跟着正文字号走，跟着改才是 bug）。
 */
const INHERITS_SIZE_TAGS = /^(?:p|li|blockquote)$/

export function promoteFontSize(html, size) {
  if (!html || !size) return html
  const promote = (text) =>
    text.replace(/<([a-zA-Z][\w-]*)([^>]*?)style="([^"]*)"/g, (full, tag, mid, style) => {
      if (!INHERITS_SIZE_TAGS.test(tag)) return full
      if (/(^|;)\s*font-size\s*:/.test(style)) return full
      return `<${tag}${mid}style="font-size: ${size}; ${style}"`
    })
  // 文末「参考资料」那一节**自己**带着 font-size（13px 小字）：它的 `<section>` 粘进微信
  // 后照样在，字号不会因 wrapper 被剥而丢失，所以里面的 p 不需要推进——推进去反而把这节
  // 撑成正文字号。把所有 `<section>` 整段摘出来、只推进其余部分，再按原位缝回去。
  // 遮的是所有 `<section>`：正文里手写的原始 HTML section 也会被一起遮住（极少见），
  // 不推进对它来说是**安全**的退化（不会错加字节）。
  // 摘出来时不用占位符（同 inlineCodeStyles 的理由）：正文里若出现同样的控制字符，
  // 占位符会被当成它，把正文替换成别处的内容或空串。
  let out = ''
  let last = 0
  const re = /<section\b[^>]*>[\s\S]*?<\/section>/g
  for (const m of html.matchAll(re)) {
    if (m.index > last) out += promote(html.slice(last, m.index))
    out += m[0]
    last = m.index + m[0].length
  }
  if (last < html.length) out += promote(html.slice(last))
  return out
}

// ── 6. 预览锚点（annotate）─────────────────────────────────────

/** 每个顶层块前插一个不可见锚点元素；只给预览的滚动同步与块高亮用，绝不进复制/导出结果。 */
function renderWithAnchors(md, markdown, env) {
  const tokens = md.parse(markdown, env)
  if (!tokens.length) return { html: '', blocks: [] }
  const blocks = collectBlocks(markdown, tokens)
  const Marker = tokens[0].constructor
  const out = []
  let cursor = 0
  for (const block of blocks) {
    while (cursor < block.tokenIndex) out.push(tokens[cursor++])
    const marker = new Marker('html_block', '', 0)
    marker.content = `<fp-block data-b="${block.id}"></fp-block>`
    out.push(marker)
  }
  while (cursor < tokens.length) out.push(tokens[cursor++])
  return { html: md.renderer.render(out, md.options, env), blocks }
}

// ── 7. 图片内嵌（复制/导出用）──────────────────────────────────
/** 用宿主给的解析器把 <img src> 换成 data URI；解析器返回 null 表示保持原样。 */
function rewriteImages(html, resolver) {
  return html.replace(/<img\b([^>]*?)\bsrc="([^"]*)"([^>]*)>/g, (full, pre, src, post) => {
    let dataUri = null
    try {
      dataUri = resolver(src)
    } catch {
      dataUri = null
    }
    if (!dataUri) return full
    return `<img${pre}src="${dataUri}"${post}>`
  })
}

/**
 * 主渲染。
 *
 * @param {string} markdownText
 * @param {object} [opts]
 * @param {string} [opts.theme]        主题 key 或中文名，默认 default
 * @param {string} [opts.color]        主题色覆盖，如 '#0071e3'
 * @param {string} [opts.font]         字体预设 sans/serif/mono（null 表示不覆盖），默认 sans
 * @param {string} [opts.fontSize]     覆盖 wrapper 字号，如 '17px'，默认 16px（非法值一律回落 16px）
 * @param {boolean}[opts.footnotes]    正文外链转脚注，默认 true
 * @param {boolean}[opts.publish]      true=按「复制到公众号」的清洗规则输出（默认），false=预览原样
 * @param {boolean}[opts.macCodeBlock] 代码块是否用 mac 标题栏形态，默认 true
 * @param {boolean}[opts.simple]       站点「一键发布 14 平台」那条白名单路径
 * @param {string|object} [opts.theme] 主题 key 或中文名；也可以直接给一个**主题对象**
 *        （模型自定义主题，见 `theme-spec.mjs`）——那条路只走数据，不求值任何模型给的代码
 * @param {boolean}[opts.annotate]     预览锚点（隐含 publish=false），默认 false
 * @param {boolean}[opts.wrapText]     把文字包进 `<span>`（微信结构校验的兼容层），默认 false
 * @param {boolean}[opts.wechatBackground] 把 `background` 简写拆成微信肯保留的长写，默认 false
 * @param {(src:string)=>string|null} [opts.imageResolver] 图片内嵌解析器
 * @returns {{html: string, themeKey: string, themeName: string, blocks?: Array<object>}}
 */
export function render(markdownText, opts = {}) {
  const THEMES = themes()
  // 主题既可以是 key/中文名（内置），也可以直接给一个对象（模型自定义主题）。
  // 走对象这条路时不查内置表，所以自定义主题不会影响内置主题的任何字节（golden 不受影响）。
  const custom = opts.theme && typeof opts.theme === 'object' ? opts.theme : null
  const key = custom ? String(custom.key || 'custom') : resolveTheme(opts.theme)
  if (!custom && !key) throw new Error(`未知主题: ${opts.theme}（可用 GET /fishpai/api/themes 查看，或在面板里选）`)
  const theme = custom || THEMES[key]
  const styles = makeStyler(theme, opts.color)
  const md = createMd(styles, { macCodeBlock: opts.macCodeBlock, wrapText: opts.wrapText })

  const env = {}
  let body
  let blocks
  if (opts.annotate) {
    const rendered = renderWithAnchors(md, markdownText, env)
    body = rendered.html
    blocks = rendered.blocks
  } else {
    body = md.render(markdownText, env)
  }

  // 面板要靠"渲染结果"而不是猜正文来决定两个开关能不能点：
  //   脚注开关 —— 正文里到底有没有会被转成脚注的链接（`github.com/x` 这种没写协议的也算）
  //   Mac 代码框开关 —— 正文里到底有没有代码块（缩进式代码块也算，只认 ``` 会漏）
  // 数链接**与开关无关**：若关掉「脚注」就把 linkCount 记成 0，面板会据此把开关置灰，
  // 于是关一次就再也打不开（自锁），提示还写着"正文里没有外链"而正文其实有。
  // 开关只决定要不要真的转成脚注，不决定"正文里有没有链接"。
  const linkCount = footnoteLinks(body).length
  const hasCode = /<pre\b/.test(body)
  if (opts.footnotes !== false) body = linksToFootnotes(body)
  body = cleanForWechat(body)
  if (typeof opts.imageResolver === 'function') body = rewriteImages(body, opts.imageResolver)

  let wrapperStyle = styles.wrapper || ''
  // 站点行为：字体预设与字号总会覆盖主题自带的 font-family / font-size。
  // `opts.font` **不能注入**：它只当 `FONT_MAP` 的 key 查表，查不到就一个字节都不替换
  // （写进来的永远是表里的常量）。`opts.fontSize` 不一样——它是**原样插值**进 style 的，
  // 所以必须过形态校验；`render()` 是公开导出（本仓 CLI 也在用），不能指望调用方先校验。
  const font = opts.font === null ? null : opts.font || 'sans'
  if (font && FONT_MAP[font]) {
    wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${FONT_MAP[font]};`)
  }
  const requestedSize = isFontSize(opts.fontSize) ? opts.fontSize : null
  const size = requestedSize || '16px'
  wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${size};`)
  // 站点会先把双引号换成单引号，避免破坏 style 属性。
  // 只中和 wrapper 是**复刻站点行为**，前提是样式值的四条入口都收得住：
  //   1) `store.mjs` 的 `applyMeta`：`color` / `fontSize` 过形态校验（`saveDoc` 与 `updateMeta` 共用）；
  //   2) `routes.mjs` 的 `/render`：`body.meta` 能盖过状态，同样两个字段在校验后才下传；
  //   3) `theme-spec.mjs` 的 `FORBIDDEN_RE`：自定义主题的样式值不许带双引号；
  //   4) 本文件的 `isFontSize`：`render()` 是公开导出（CLI 也直接调），自己再兜一道。
  // 所以这里不必也不该扩大范围——内置 `nyt` 主题合法地带着双引号 font-family，
  // 任何"统一转义"都会改掉 golden 字节（不变量 1）。
  wrapperStyle = wrapperStyle.replace(/"/g, "'")

  if (opts.publish !== false && !opts.annotate) {
    body = prepareForPublish(body, { simple: !!opts.simple })
    // 微信会剥掉最外层 wrapper 的样式，字号只挂在 wrapper 上等于没设
    // （粘进去正文退回 16px，预览里却好好的）。推进到文字所在的块级元素上。
    if (opts.promoteFontSize && requestedSize) body = promoteFontSize(body, size)
  }
  // wrapText 的第二半：列表项前面补一个不换行空格（微信会把条目开头的行内片段单独起一行）
  if (opts.wrapText) body = padListItems(body)
  // 微信底色兼容：放在最后（代码块 span 的内联色、图片补的样式都已就位），正文与 wrapper 一起规范化
  if (opts.wechatBackground) {
    body = splitBackgroundsInHtml(body)
    wrapperStyle = splitBackgrounds(wrapperStyle)
  }

  const html = `<div style="${wrapperStyle}">${body}</div>`
  // linkCount / hasCode 只回给面板判断"开关该不该亮"，不参与 golden（html 一个字节都没动）
  const out = { html, themeKey: key, themeName: theme.name, linkCount, hasCode }
  if (blocks) out.blocks = blocks
  return out
}

/**
 * 文档状态里存着的主题 key 可能已经不存在了（上游主题被移除、或状态是手改的）。
 * 这种时候退回默认主题——**不要让一篇好好的文档因为一个主题名字打不开**。
 * （`render()` 自己仍然对未知主题抛错：那是"调用方写错了"，必须当场说出来。）
 */
export function safeThemeKey(name) {
  return resolveTheme(name) || 'default'
}

/**
 * 主题清单（面板、`GET /themes` 与技能共用）。
 * 除名称之外还带上 `classifyTheme()` 算出来的能力标注：面板据此决定
 * 「主题色该不该显示」「要不要提醒这个主题粘进微信有风险」。
 */
export function themeCatalog() {
  const THEMES = themes()
  return Object.entries(THEMES).map(([key, t]) => ({
    key,
    name: t.name,
    emoji: t.emoji || '',
    desc: t.desc || '',
    ...classifyTheme(t),
  }))
}

// ── 8. CLI（本地排查用；插件本身走 tools/routes）────────────────
function main(argv) {
  const args = argv.slice(2)
  if (args.includes('--list')) {
    console.log('可用主题（key / 名称）:')
    for (const t of themeCatalog()) console.log(`  ${t.key.padEnd(11)} ${t.emoji} ${t.name}  — ${t.desc}`)
    return 0
  }
  let input = null
  let theme = 'default'
  let out = null
  let color = null
  let fontSize = null
  let publish = true
  let macCodeBlock = true
  let footnotes = true
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-t' || a === '--theme') theme = args[++i]
    else if (a === '-o' || a === '--out') out = args[++i]
    else if (a === '-c' || a === '--color') color = args[++i]
    else if (a === '-s' || a === '--size') fontSize = args[++i]
    else if (a === '--no-footnotes') footnotes = false
    else if (a === '--no-mac') macCodeBlock = false
    else if (a === '--preview') publish = false
    else if (a === '-' || !a.startsWith('-')) input = a
  }
  if (!input) {
    console.error('用法: node plugin/core/render.mjs <input.md> [-t 主题] [-o out.html] [-c 色值] [-s 字号] [--list] [--preview] [--no-mac] [--no-footnotes]')
    return 2
  }
  // 动态 import 免得 CLI 之外的调用方也被 node:fs 牵连
  return import('node:fs').then((fs) => {
    const text = input === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(input, 'utf8')
    const { html, themeName } = render(text, { theme, color, fontSize, publish, macCodeBlock, footnotes })
    if (out) {
      fs.writeFileSync(out, html, 'utf8')
      console.error(`[ok] 主题「${themeName}」 -> ${out}  (${html.length} 字符)`)
    } else {
      process.stdout.write(html)
    }
    return 0
  })
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main(process.argv).then((code) => process.exit(code))
}

export { read }
