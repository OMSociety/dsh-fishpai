/**
 * markdown-it 管线：与墨排站点逐条对齐的渲染规则 + 顶层块切分。
 *
 * 这一层是"上游行为"的承载体：任何一行改动都必须先问"站点是不是也这样"。
 * 站点做法是「先渲染裸 HTML，再用 DOM 扫描给每个标签 setAttribute('style', 原有 + 主题样式)」，
 * 我们是在 markdown-it 的渲染器规则里直接产出等价结果。
 *
 * 已知的 8 个坑（别"修好"它们）：
 *   1. 标题 token 类型统一是 heading_open，真实标签在 token.tag；站点把 h4–h6 归到 h3 样式
 *   2. 紧凑列表内的段落 token 带 hidden=true，必须跳过，否则多出未闭合 <p>
 *   3. 代码块嵌套是"bug 变特性"：markdown-it 默认 fence 规则会把 highlight 回调的返回值再包一层
 *      <pre><code class="language-x">，而回调本身返回 mac 结构 → 真实 DOM 是
 *      pre > code > div.mac-code-block > (header + pre > code)
 *   4. <code> 内的 <div> 会被 HTML 解析器丢弃，所以 mac 结构外层容器 div 是裸的、class 丢了
 *   5. 站点默认 fontFamily='sans'、fontSize=16，且**总会覆盖**主题自带的 font-family / font-size
 *   6. wrapper 样式里的双引号会被换成单引号，避免破坏 style 属性
 *   7. themes.js 用顶层 const 声明，不挂 window，Node 里必须 vm 顶层求值（见 runtime.mjs）
 *   8. hljs token 颜色别手写 CSS 优先级——hljs-map.json 是从真实浏览器导出的计算样式
 */
import { read } from './runtime.mjs'

/** 主题内联样式的占位符替换（{{PRIMARY}} / {{PRIMARY_BG}}）。 */
export function makeStyler(theme, customColor) {
  const primary = customColor || '#4f6ef7'
  const primaryBg = primary + '12'
  const resolve = (s) =>
    (s || '')
      .replace(/\{\{PRIMARY\}\}/g, primary)
      .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg)
      .trim()
  const st = theme.styles
  const map = {}
  for (const k of Object.keys(st)) map[k] = resolve(st[k])
  return map
}

/**
 * 建一个与站点配置一致的 markdown-it 实例，并覆写渲染规则产出内联样式。
 * @param {Record<string,string>} styles 主题样式表（makeStyler 的产物）
 * @param {{macCodeBlock?: boolean, wrapText?: boolean}} [opts] macCodeBlock 默认 true；wrapText 默认 false
 */
export function createMd(styles, opts = {}) {
  const macCodeBlock = opts.macCodeBlock !== false
  const markdownit = read('markdownit')
  const md = markdownit({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
      const hljs = read('hljs')
      let body = ''
      if (lang && hljs && hljs.getLanguage(lang)) {
        try {
          body = hljs.highlight(str, { language: lang }).value
        } catch {
          body = md.utils.escapeHtml(str)
        }
      } else {
        body = md.utils.escapeHtml(str)
      }
      return `<pre><code>${body}</code></pre>`
    },
  })

  // 标题：token 类型统一是 heading_open，真实标签在 token.tag 上
  md.renderer.rules.heading_open = (t, i, o, e, slf) => {
    const h = t[i].tag // h1..h6
    const key = ['h1', 'h2', 'h3'].includes(h) ? h : 'h3' // 站点把 h4-h6 归到 h3
    const a = slf.renderAttrs(t[i])
    return `<${h}${styles[key] ? ` style="${styles[key]}"` : ''}${a}>`
  }
  md.renderer.rules.paragraph_open = (t, i, o, e, slf) => {
    if (t[i].hidden) return '' // 紧凑列表内的段落，站点走的也是默认行为：不输出
    const a = slf.renderAttrs(t[i])
    return `<p${styles.p ? ` style="${styles.p}"` : ''}${a}>`
  }
  md.renderer.rules.paragraph_close = (t, i) => (t[i].hidden ? '' : '</p>\n')
  md.renderer.rules.blockquote_open = () => `<blockquote${styles.blockquote ? ` style="${styles.blockquote}"` : ''}>`
  md.renderer.rules.bullet_list_open = () => `<ul${styles.ul ? ` style="${styles.ul}"` : ''}>`
  md.renderer.rules.ordered_list_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i])
    return `<ol${styles.ol ? ` style="${styles.ol}"` : ''}${a}>`
  }
  md.renderer.rules.list_item_open = () => `<li${styles.li ? ` style="${styles.li}"` : ''}>`
  md.renderer.rules.hr = (t, i, o, e, slf) => `<hr${styles.hr ? ` style="${styles.hr}"` : ''}${slf.renderAttrs(t[i])}>`

  // 链接
  md.renderer.rules.link_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i])
    return `<a${styles.a ? ` style="${styles.a}"` : ''}${a}>`
  }

  // 行内 code
  md.renderer.rules.code_inline = (t, i) =>
    `<code${styles.code_inline ? ` style="${styles.code_inline}"` : ''}>${md.utils.escapeHtml(t[i].content)}</code>`

  // 代码块
  md.renderer.rules.fence = (t, i) => {
    const tok = t[i]
    const info = (tok.info || '').trim()
    if (info.toLowerCase() === 'mermaid') {
      return `<div class="mermaid-placeholder">${md.utils.escapeHtml(tok.content)}</div>`
    }
    const s = styles.code_block || ''
    let body
    const hljs = read('hljs')
    if (info && hljs && hljs.getLanguage(info)) {
      try {
        body = hljs.highlight(tok.content, { language: info }).value
      } catch {
        body = md.utils.escapeHtml(tok.content)
      }
    } else {
      body = md.utils.escapeHtml(tok.content)
    }
    // mac 形态：站点默认开启。markdown-it 的默认 fence 规则会把 highlight 回调的返回值
    // 再包一层 <pre><code class="language-xxx">，而 highlight 回调本身返回 mac 结构，
    // 于是真实 DOM 是 pre > code > div.mac-code-block > (header + pre > code)。
    // 外层 pre/code 随后被主题样式覆盖，内层 pre 被 publish-utils 压平。
    if (macCodeBlock) {
      const langLabel = info || 'code'
      const bg = (s.match(/background:\s*([^;]+)/) || [])[1] || '#282c34'
      const fg = (s.match(/(?:^|;\s*)color:\s*([^;]+)/) || [])[1] || '#abb2bf'
      return (
        `<pre${s ? ` style="${s}"` : ''}><code${info ? ` class="language-${info}"` : ''} style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">` +
        `<div class="mac-code-block" style="border-radius: 10px; overflow: hidden; margin: 14px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">` +
        `<div class="mac-code-header" style="background: ${bg.trim()}; padding: 10px 16px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">` +
        `<span class="mac-dot red" style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; display: inline-block;"></span>` +
        `<span class="mac-dot yellow" style="width: 12px; height: 12px; border-radius: 50%; background: #febc2e; display: inline-block;"></span>` +
        `<span class="mac-dot green" style="width: 12px; height: 12px; border-radius: 50%; background: #28c840; display: inline-block;"></span>` +
        `<span class="mac-code-lang" style="margin-left: auto; font-size: 12px; color: ${fg.trim()}; opacity: 0.5; font-family: -apple-system, sans-serif;">${langLabel}</span>` +
        `</div>` +
        `<pre style="background: ${bg.trim()}; color: ${fg.trim()}; padding: 16px; margin: 0; font-size: 13px; line-height: 1.7; overflow-x: auto; font-family: &quot;SFMono-Regular&quot;, Consolas, monospace;">` +
        `<code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${body}</code></pre>` +
        `</div></code></pre>`
      )
    }
    return `<pre${s ? ` style="${s}"` : ''}><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${body}</code></pre>\n`
  }
  md.renderer.rules.code_block = (t, i) => {
    const s = styles.code_block ? ` style="${styles.code_block}"` : ''
    return `<pre${s}><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${md.utils.escapeHtml(t[i].content)}</code></pre>\n`
  }

  // 图片：站点只给 img 打主题样式
  md.renderer.rules.image = (t, i, o, e, slf) => {
    const tok = t[i]
    tok.attrSet('style', styles.img || '')
    const src = tok.attrGet('src') || ''
    const alt = slf.renderInlineAsText(tok.children, o, e)
    const title = tok.attrGet('title')
    const t2 = title ? ` title="${md.utils.escapeHtml(title)}"` : ''
    return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}"${t2} style="${styles.img || ''}">`
  }

  // 表格
  md.renderer.rules.table_open = () => `<table${styles.table ? ` style="${styles.table}"` : ''}>\n`
  md.renderer.rules.thead_open = () => '<thead>\n'
  md.renderer.rules.tbody_open = () => '<tbody>\n'
  md.renderer.rules.tr_open = () => '<tr>'
  md.renderer.rules.th_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i])
    return `<th${styles.th ? ` style="${styles.th}"` : ''}${a}>`
  }
  md.renderer.rules.td_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i])
    return `<td${styles.td ? ` style="${styles.td}"` : ''}${a}>`
  }

  // 加粗 / 斜体
  md.renderer.rules.strong_open = () => `<strong${styles.strong ? ` style="${styles.strong}"` : ''}>`
  md.renderer.rules.em_open = () => `<em${styles.em ? ` style="${styles.em}"` : ''}>`

  // ── 信息卡片 ::: info/warning/tip/danger ──
  const colorMap = {
    info: { bg: '#eef6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
    warning: { bg: '#fff8e6', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
    tip: { bg: '#ecfdf5', border: '#10b981', icon: '💡', color: '#065f46' },
    danger: { bg: '#fef2f2', border: '#ef4444', icon: '🚫', color: '#991b1b' },
  }
  md.core.ruler.after('block', 'info_card', (state) => {
    const tokens = state.tokens
    let i = 0
    while (i < tokens.length) {
      if (tokens[i].type === 'paragraph_open') {
        const nx = tokens[i + 1]
        if (nx && nx.type === 'inline' && nx.content) {
          const m = nx.content.match(/^:::(info|warning|tip|danger)\s*(.*?)(?:\n|$)([\s\S]*?):::$/)
          if (m) {
            const c = colorMap[m[1]] || colorMap.info
            const title = m[2].trim()
            const body = m[3].trim()
            const tk = new state.Token('html_block', '', 0)
            // 仅供块切分使用的元数据：不改渲染输出，只让块模型认出"这是一个卡片"
            tk.map = tokens[i].map
            tk.meta = { fishpai: `card:${m[1]}` }
            tk.content = `<div style="border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;">
  <div style="font-weight: 600; color: ${c.color}; margin-bottom: 6px; font-size: 15px;">${title || c.icon + ' ' + m[1].toUpperCase()}</div>
  <div style="color: ${c.color}; opacity: 0.85; font-size: 14px; line-height: 1.7;">${md.renderInline(body)}</div>
</div>`
            tokens.splice(i, 3, tk)
            continue
          }
        }
      }
      i++
    }
  })

  /**
   * 微信平台兼容（可选，`wrapText`）：把文字包进 `<span>`。
   *
   * 为什么需要：微信编辑器的结构校验用 `Range.getClientRects()` 量"文字行数"，
   * 而**行内元素（`<span>`/`<a>`/`<strong>`）会把同一行拆成多个矩形**——「内容高度 ÷ 矩形数」
   * 因此被算小，含行内元素的段落会被误判成"行高小于字体大小、多行文字重叠"
   * （实测：`line-height: 1.8` 的两行段落含一个链接 → 6 个矩形 → 判定叠字）。
   *
   * 把文字包进 `<span>` 后，块级元素不再有**直接文字子节点**，那条校验就不再命中
   * （官方校验器实测 `isValid: true`）。视觉上零影响——span 不带任何样式；
   * 而且这正是微信自己插入内容后的结构（`<span leaf="">`）。
   *
   * **但首尾空白要留在 span 外面**（实测踩过）：微信的编辑器会把"以空白开头"的行内元素
   * 当成新的行/块——列表项 `**批注** ｜ 光标…` 粘过去会变成两行（"批注"一行、`｜` 开头一行），
   * 而面板预览里是正常的一行。空白放在 span 外一样挡得住结构校验（那条规则只看**非空白**的直接文字子节点），
   * 顺带也不再有 `<span></span>` 这种空壳。
   *
   * 默认关闭：默认路径必须与 `test/golden/**` 逐字节一致（那是本项目的地基）。
   * 复制到公众号/导出这条路径才开（见 plugin/host/routes.mjs 与 tools.mjs）。
   */
  if (opts.wrapText) {
    const escapeHtml = md.utils.escapeHtml
    md.renderer.rules.text = (tokens, idx) => {
      const raw = String(tokens[idx].content)
      const lead = /^\s*/.exec(raw)[0]
      const tail = /\s*$/.exec(raw)[0]
      const core = raw.slice(lead.length, raw.length - tail.length)
      if (!core) return escapeHtml(raw) // 纯空白：原样输出，不包空壳 span
      return `${escapeHtml(lead)}<span>${escapeHtml(core)}</span>${escapeHtml(tail)}`
    }
  }

  return md
}

/** 只要 token 流、不要样式的解析器（块切分与 diff 用）。 */
export function createParser() {
  return createMd({}, { macCodeBlock: true })
}

/** 从 opening token 推出块类型。 */
function kindOf(token) {
  const fp = token.meta && token.meta.fishpai
  if (typeof fp === 'string' && fp.startsWith('card:')) return { kind: 'card', variant: fp.slice(5) }
  switch (token.type) {
    case 'heading_open':
      return { kind: 'heading', level: Number(token.tag.slice(1)) || 1 }
    case 'paragraph_open':
      return { kind: 'paragraph' }
    case 'blockquote_open':
      return { kind: 'blockquote' }
    case 'bullet_list_open':
      return { kind: 'list', ordered: false }
    case 'ordered_list_open':
      return { kind: 'list', ordered: true }
    case 'table_open':
      return { kind: 'table' }
    case 'fence':
      return { kind: 'code', lang: (token.info || '').trim() || null }
    case 'code_block':
      return { kind: 'code', lang: null }
    case 'hr':
      return { kind: 'hr' }
    case 'html_block':
      return { kind: 'html' }
    default:
      return { kind: token.type }
  }
}

/**
 * 顶层块切分：把 token 流按 level 0 的开合配对切成块，并给出源码行范围。
 *
 * 块身份（id）是**内容寻址**的：同一段文字在文档里重复出现时，第 2 个起带 `#n` 后缀。
 * 所以人改了某块的内容，它的 id 就会变——这正是批注需要"重锚"而不是硬绑 id 的原因。
 *
 * @param {string} markdown 源码
 * @returns {Array<object>} 块记录：index/id/kind/level/headingPath/hash/startLine/endLine/text/tokenIndex
 */
export function collectBlocks(markdown, tokens) {
  const lines = markdown.split('\n')
  const blocks = []
  const headingStack = []
  const hashCount = new Map()
  let i = 0

  while (i < tokens.length) {
    const t = tokens[i]
    if (t.level !== 0) {
      i++
      continue
    }
    const tokenIndex = i
    let end = t.map ? t.map[1] : null
    let j = i
    if (t.nesting === 1) {
      let depth = 0
      while (j < tokens.length) {
        const u = tokens[j]
        if (u.level === 0) {
          if (u.nesting === 1) depth++
          else if (u.nesting === -1) {
            depth--
            if (depth === 0) break
          }
        }
        if (u.map && (end === null || u.map[1] > end)) end = u.map[1]
        j++
      }
    } else {
      j = i
    }

    const start = t.map ? t.map[0] : null
    const info = kindOf(t)
    const text = start === null || end === null ? '' : lines.slice(start, end).join('\n')

    if (info.kind === 'heading') {
      headingStack.length = Math.max(0, info.level - 1)
      headingStack[info.level - 1] = text.replace(/^#+\s*/, '').trim()
    }
    const headingPath = headingStack.filter(Boolean).slice()

    const hash = shortHash(info.kind + '\u0000' + normalizeText(text))
    const seen = (hashCount.get(hash) || 0) + 1
    hashCount.set(hash, seen)

    blocks.push({
      index: blocks.length,
      id: seen === 1 ? hash : `${hash}#${seen}`,
      kind: info.kind,
      variant: info.variant || null,
      ordered: info.ordered ?? null,
      lang: info.lang || null,
      level: info.level || null,
      headingPath,
      hash,
      startLine: start === null ? 0 : start + 1, // 1-based，便于人读
      endLine: end === null ? 0 : end,
      text,
      tokenIndex,
      endTokenIndex: j,
    })
    i = j + 1
  }

  return blocks
}

/** 解析源码并切块（block/diff/notes 的公共入口）。 */
export function splitBlocks(markdown) {
  const md = createParser()
  const tokens = md.parse(markdown, {})
  return collectBlocks(markdown, tokens)
}

/** 归一化：行尾空白、连续空白压平（只用于 hash，不改变原文）。 */
export function normalizeText(text) {
  return String(text).replace(/[ \t]+$/gm, '').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim()
}

/** 短哈希（FNV-1a 32bit → base36），够短够稳，且不引入依赖。 */
export function shortHash(input) {
  let h = 0x811c9dc5
  const s = String(input)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}

/** 字符二元组 Dice 相似度：对中文短句比编辑距离更稳，且不需要分词。 */
export function similarity(a, b) {
  const x = normalizeText(a)
  const y = normalizeText(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  const grams = (s) => {
    const out = new Map()
    if (s.length === 1) {
      out.set(s, 1)
      return out
    }
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      out.set(g, (out.get(g) || 0) + 1)
    }
    return out
  }
  const ga = grams(x)
  const gb = grams(y)
  let overlap = 0
  let totalA = 0
  let totalB = 0
  for (const n of ga.values()) totalA += n
  for (const n of gb.values()) totalB += n
  for (const [g, n] of ga) if (gb.has(g)) overlap += Math.min(n, gb.get(g))
  return (2 * overlap) / (totalA + totalB)
}

/**
 * 引用片段的"包含度"：`quote` 的最长连续子串在 `text` 里占了 quote 的多大比例。
 *
 * 为什么不用 Dice：批注的 quote 通常是整段里的一小句，Dice 会被长段落的长度稀释，
 * 于是"人只改了几个字"也会被判成失锚。包含度只问"这句话还在不在这一段里"。
 */
export function containment(quote, text) {
  const a = normalizeText(quote)
  const b = normalizeText(text)
  if (!a || !b) return 0
  if (b.includes(a)) return 1
  // 超长文本截断，避免 O(n·m) 爆掉；批注引用本来也不该很长
  const x = a.slice(0, 400)
  const y = b.slice(0, 4000)
  let best = 0
  // dp 只保留上一行
  let prev = new Uint16Array(y.length + 1)
  let cur = new Uint16Array(y.length + 1)
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : 0
      if (cur[j] > best) best = cur[j]
    }
    const tmp = prev
    prev = cur
    cur = tmp
    cur.fill(0)
  }
  return best / x.length
}
