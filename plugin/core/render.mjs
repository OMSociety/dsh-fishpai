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
 * 哪些 `<a>` 会被转成脚注（同一条规则必须被"渲染"与"数给面板看"两处共用）。
 *
 * 为什么要单独数一遍：面板的「脚注」开关以前靠**猜**正文里有没有外链（正则只认带 `//` 的写法），
 * 于是 `github.com/foo/bar` 这种能被 linkify 变成链接、也会生成「参考资料」的写法，
 * 开关却是灰的——用户点了没反应，也关不掉。现在由渲染结果说话。
 */
function isFootnoteHref(href) {
  return !!href && !href.startsWith('#') && !href.startsWith('javascript:')
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

export function linksToFootnotes(md, html, styles = {}) {
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
export function cleanForWechat(html) {
  return html
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
  const blocks = []
  const out = html.replace(/<pre[\s\S]*?<\/pre>/g, (m) => {
    blocks.push(m)
    return `\x01${blocks.length - 1}\x01`
  })

  return out.replace(/\x01(\d+)\x01/g, (_, n) => {
    const block = blocks[Number(n)]
    return block.replace(/<span([^>]*)>/g, (full, attrs) => {
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
  })
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

// ── 4. 微信底色兼容（background 简写 → 长写）───────────────────
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

// ── 5. 预览锚点（annotate）─────────────────────────────────────

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

// ── 6. 图片内嵌（复制/导出用）──────────────────────────────────
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
 * @param {string} [opts.fontSize]     覆盖 wrapper 字号，如 '17px'，默认 16px
 * @param {boolean}[opts.footnotes]    正文外链转脚注，默认 true
 * @param {boolean}[opts.publish]      true=按「复制到公众号」的清洗规则输出（默认），false=预览原样
 * @param {boolean}[opts.macCodeBlock] 代码块是否用 mac 标题栏形态，默认 true
 * @param {boolean}[opts.simple]       站点「一键发布 14 平台」那条白名单路径
 * @param {boolean}[opts.annotate]     预览锚点（隐含 publish=false），默认 false
 * @param {boolean}[opts.wrapText]     把文字包进 `<span>`（微信结构校验的兼容层），默认 false
 * @param {boolean}[opts.wechatBackground] 把 `background` 简写拆成微信肯保留的长写，默认 false
 * @param {(src:string)=>string|null} [opts.imageResolver] 图片内嵌解析器
 * @returns {{html: string, themeKey: string, themeName: string, blocks?: Array<object>}}
 */
export function render(markdownText, opts = {}) {
  const key = resolveTheme(opts.theme)
  if (!key) throw new Error(`未知主题: ${opts.theme}（可用 GET /fishpai/api/themes 查看，或在面板里选）`)
  const THEMES = themes()
  const theme = THEMES[key]
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
  const linkCount = opts.footnotes === false ? 0 : footnoteLinks(body).length
  const hasCode = /<pre\b/.test(body)
  if (opts.footnotes !== false) body = linksToFootnotes(md, body, styles)
  body = cleanForWechat(body)
  if (typeof opts.imageResolver === 'function') body = rewriteImages(body, opts.imageResolver)

  let wrapperStyle = styles.wrapper || ''
  // 站点行为：字体预设与字号总会覆盖主题自带的 font-family / font-size
  const font = opts.font === null ? null : opts.font || 'sans'
  if (font && FONT_MAP[font]) {
    wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${FONT_MAP[font]};`)
  }
  const size = opts.fontSize || '16px'
  wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${size};`)
  // 站点会先把双引号换成单引号，避免破坏 style 属性
  wrapperStyle = wrapperStyle.replace(/"/g, "'")

  if (opts.publish !== false && !opts.annotate) {
    body = prepareForPublish(body, { simple: !!opts.simple })
  }
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

// ── 7. CLI（本地排查用；插件本身走 tools/routes）────────────────
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
