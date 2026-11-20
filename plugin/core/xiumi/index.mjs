import { read } from '../runtime.mjs'
import { normalizeSpec, DEFAULT_SPEC } from './spec.mjs'
import { _WECHAT_ALIAS, WECHAT_COMPONENTS, escapeHtml } from './components.mjs'
import { INTERACTIVE_COMPONENTS, INTERACTIVE_DIRECTIVES } from './interactive.mjs'

// 交互组件（SVG SMIL 动画层 + 内联内容层）与静态组件合并成同一张渲染表。
const ALL_COMPONENTS = Object.freeze({ ...WECHAT_COMPONENTS, ...INTERACTIVE_COMPONENTS })
const ALL_ALIAS = Object.freeze({
  ..._WECHAT_ALIAS,
  ...Object.fromEntries(Object.keys(INTERACTIVE_COMPONENTS).map((key) => [key, key])),
  // 「::: 指令名」→「wc_* 组件」的别名（expand → wc_expand 等）。
  ...Object.fromEntries(Object.entries(INTERACTIVE_DIRECTIVES).map(([directive, type]) => [directive, `wc_${type}`])),
})

let parser
function markdownIt() {
  if (!parser) parser = read('markdownit')({ html: false, breaks: true, linkify: true, typographer: true })
  return parser
}

function inline(markdown, spec) {
  return markdownIt().renderInline(String(markdown ?? ''))
    .replace(/<strong>([\s\S]*?)<\/strong>/g, (fragment, content) => {
      const text = String(content).replace(/<[^>]+>/g, '')
      const keepTogether = [...text].length <= 8 ? 'white-space:nowrap;' : ''
      return `<strong style="color:${spec.title_color};font-weight:700;${keepTogether}">${content}</strong>`
    })
    .replace(/<em>/g, '<em style="font-style:italic;">')
    .replace(/<code>/g, `<code style="padding:2px 4px;background-color:${spec.card_bg};border-radius:4px;font-size:0.9em;">`)
    .replace(/<a href="([^"]+)">/g, `<a href="$1" style="color:${spec.accent};text-decoration:underline;">`)
    .replace(/<img\s/g, `<img style="display:block;max-width:100%;height:auto;margin:18px auto;border-radius:${spec.card_radius}px;" `)
}

const DIRECTIVES = new Set([
  'card', 'two_columns', 'quote', 'gradient_banner', 'wave_divider', 'number_steps', 'info_card', 'chapter_header', 'highlight', 'credits', 'raw', 'full_bleed',
  // 交互组件（SMIL）：专业模式专属。
  ...Object.keys(INTERACTIVE_DIRECTIVES),
])
function sourceParts(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const parts = []
  let buffer = []
  const flush = () => {
    if (buffer.length) parts.push({ markdown: buffer.join('\n') })
    buffer = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^:::\s*([a-z_]+)\s*$/i)
    if (!match) {
      buffer.push(lines[index])
      continue
    }
    const directive = match[1].toLowerCase()
    if (!DIRECTIVES.has(directive)) throw new Error(`未知指令（秀米）：${directive}`)
    flush()
    const body = []
    let closed = false
    for (index += 1; index < lines.length; index += 1) {
      if (/^:::\s*$/.test(lines[index])) {
        closed = true
        break
      }
      body.push(lines[index])
    }
    if (!closed) throw new Error(`秀米指令 ${directive} 未闭合：缺少结束行 :::`)
    parts.push({ directive, body: body.join('\n') })
  }
  flush()
  return parts
}

function markdownComponents(markdown, spec) {
  const tokens = markdownIt().parse(String(markdown ?? ''), {})
  const components = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type === 'heading_open') {
      const content = tokens[index + 1]?.content || ''
      components.push({ type: 'heading', level: Number(token.tag.slice(1)), text: inline(content, spec) })
      index += 2
    } else if (token.type === 'paragraph_open') {
      const content = tokens[index + 1]?.content || ''
      if (!token.hidden && content.trim()) components.push({ type: 'paragraph', html: inline(content, spec) })
      index += 2
    } else if (token.type === 'blockquote_open') {
      const depth = token.level
      const parts = []
      while (++index < tokens.length) {
        if (tokens[index].type === 'blockquote_close' && tokens[index].level === depth - 1) break
        if (tokens[index].type === 'inline') parts.push(inline(tokens[index].content, spec))
      }
      components.push({ type: 'quote', html: parts.join('<br />') })
    } else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const ordered = token.type === 'ordered_list_open'
      const close = ordered ? 'ordered_list_close' : 'bullet_list_close'
      const items = []
      while (++index < tokens.length && tokens[index].type !== close) {
        if (tokens[index].type === 'inline') items.push(inline(tokens[index].content, spec))
      }
      if (ordered) components.push({ type: 'number_steps', items })
      else components.push({ type: 'bullet_list', items })
    } else if (token.type === 'fence' || token.type === 'code_block') {
      components.push({ type: 'card', html: `<pre style="margin:0;white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(token.content)}</code></pre>` })
    } else if (token.type === 'hr') components.push({ type: 'divider' })
  }
  return components
}

function directiveComponent(part, spec) {
  if (part.directive === 'info_card') {
    if (!part.body.trim()) throw new Error('info_card 需要正文')
    const lines = part.body.trim().split('\n')
    const first = (lines.shift() || '').trim()
    const title = first.startsWith('@') ? first.slice(1).trim() : ''
    const body = title ? lines.join('\n').trim() : [first, ...lines].join('\n').trim()
    return { type: 'info_card', title, html: renderComponents(markdownComponents(body, spec), spec) }
  }
  if (part.directive === 'chapter_header') {
    const [index = '', title = '', ...rest] = part.body.trim().split('\n').map((line) => line.trim()).filter(Boolean)
    if (!title.trim()) throw new Error('chapter_header 需要编号与主标题（每行一项）')
    return { type: 'chapter_header', index: index.trim(), title: title.trim(), subtitle: rest.join('\n').trim() }
  }
  if (part.directive === 'highlight') {
    if (!part.body.trim()) throw new Error('highlight 需要一行重点内容')
    return { type: 'highlight', html: inline(part.body.trim(), spec) }
  }
  if (part.directive === 'credits') {
    if (!part.body.trim()) throw new Error('credits 至少需要一行「角色｜姓名」')
    const items = part.body.trim().split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const index = line.search(/[｜|]/)
      return index < 0 ? { label: '', value: line } : { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }
    })
    return { type: 'credits', items }
  }
  if (part.directive === 'raw') return { type: 'raw', html: part.body }
  if (part.directive === 'full_bleed') {
    if (!part.body.trim()) throw new Error('full_bleed 需要 HTML/SVG 内容')
    return { type: 'full_bleed', html: part.body }
  }
  if (part.directive === 'wave_divider') return { type: 'wave_divider' }
  if (part.directive === 'gradient_banner') return { type: 'gradient_banner', text: part.body.trim() }
  if (part.directive === 'number_steps') {
    const items = part.body.split('\n').map((line) => line.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, '').trim()).filter(Boolean)
    return { type: 'number_steps', items: items.map((item) => inline(item, spec)) }
  }
  if (part.directive === 'two_columns') {
    const [left = '', right = ''] = part.body.split(/^---\s*$/m)
    return { type: 'two_columns', left: renderComponents(markdownComponents(left, spec), spec), right: renderComponents(markdownComponents(right, spec), spec) }
  }
  // ── 交互组件（SMIL）：body 解析成各自的 props ──
  if (part.directive === 'expand' || part.directive === 'swap') {
    const [cover = '', body = ''] = part.body.split(/^---\s*$/m)
    // coverText 是封面原始纯文本（SVG <text> 只能放纯文本，不能放渲染后的块级 HTML）。
    return {
      type: part.directive,
      coverText: cover.trim().replace(/\s+/g, ' '),
      cover: renderComponents(markdownComponents(cover, spec), spec),
      body: renderComponents(markdownComponents(body, spec), spec),
    }
  }
  if (part.directive === 'swiper') {
    const images = part.body.split('\n').map((line) => line.trim()).filter(Boolean)
    return { type: 'swiper', images }
  }
  if (part.directive === 'spotlight') {
    return { type: 'spotlight', body: renderComponents(markdownComponents(part.body, spec), spec) }
  }
  if (part.directive === 'danmaku') {
    const lines = part.body.split('\n').map((line) => line.replace(/^\s*[-*+]\s+/, '').trim()).filter(Boolean)
    return { type: 'danmaku', lines }
  }
  if (part.directive === 'progress') {
    const raw = part.body.trim()
    const match = raw.match(/^(\d{1,3})\s*(.*)$/)
    return { type: 'progress', percent: match ? Number(match[1]) : Number(raw) || 50, label: match ? match[2].trim() : '' }
  }
  if (part.directive === 'timeline') {
    const items = part.body.split('\n').map((line) => line.replace(/^\s*[-*+]\s+/, '').trim()).filter(Boolean)
    return { type: 'timeline', items: items.map((item) => inline(item, spec)) }
  }
  if (part.directive === 'compare') {
    const [left = '', right = ''] = part.body.split(/^---\s*$/m)
    return { type: 'compare', left: renderComponents(markdownComponents(left, spec), spec), right: renderComponents(markdownComponents(right, spec), spec) }
  }
  return { type: part.directive, html: renderComponents(markdownComponents(part.body, spec), spec) }
}

export function componentsFromMarkdown(markdown, specInput = {}) {
  const spec = normalizeSpec(specInput)
  return sourceParts(markdown).flatMap((part) => part.directive ? [directiveComponent(part, spec)] : markdownComponents(part.markdown, spec))
}

function renderComponents(components, spec) {
  return components.map((component) => {
    if (!component || typeof component !== 'object') throw new Error('秀米组件必须是对象')
    const alias = ALL_ALIAS[component.type]
    if (!alias) throw new Error(`未知组件（秀米）：${String(component.type)}`)
    return ALL_COMPONENTS[alias](component, spec)
  }).join('')
}

export function buildPage(components, options = {}) {
  const spec = normalizeSpec(options.spec || options)
  if (!Array.isArray(components)) throw new Error('秀米 components 必须是数组')
  return `<section style="max-width:${spec.page_width}px;margin:0 auto;padding:${spec.page_padding_y}px ${spec.page_padding_x}px;box-sizing:border-box;background-color:${spec.page_bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:${spec.body_spacing}px;">${renderComponents(components, spec)}</section>`
}

/**
 * 微信粘贴路径的文本包裹兼容层（对齐快速管线 render() 的 wrapText 语义）。
 *
 * 粘贴清洗要求 HTML 文本容器（p / h1-h6 / section / li / blockquote / td / th）里的
 * 文字必须放在 span 等行内元素中，裸文本节点会被降级。秀米管线的组件直接产出
 * 裸文本，这里在出口统一包裹；`<svg>…</svg>` 整块跳过——SVG 的 <text> 不能包 span。
 */
const TEXT_WRAP_TAGS = new Set(['section', 'p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'])
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
function wrapTextNodes(html) {
  // 先把 SVG 整块摘出来占位，处理完再换回去，避免碰到动画层。
  const svgs = []
  const placeholder = (i) => `SVG${i}`
  const withoutSvg = String(html).replace(/<svg\b[\s\S]*?<\/svg>/gi, (block) => {
    svgs.push(block)
    return placeholder(svgs.length - 1)
  })
  const stack = []
  const wrapped = (withoutSvg.match(/<[^>]+>|[^<]+/g) || []).map((token) => {
    if (token[0] !== '<') {
      return TEXT_WRAP_TAGS.has(stack.at(-1)) && token.trim() ? `<span>${token}</span>` : token
    }
    const closing = token.match(/^<\/\s*([a-z0-9]+)/i)
    if (closing) {
      const index = stack.lastIndexOf(closing[1].toLowerCase())
      if (index >= 0) stack.length = index
      return token
    }
    const opening = token.match(/^<\s*([a-z0-9]+)/i)
    if (opening && !/\/\s*>$/.test(token) && !VOID_TAGS.has(opening[1].toLowerCase())) stack.push(opening[1].toLowerCase())
    return token
  }).join('')
  return wrapped.replace(/SVG(\d+)/g, (full, i) => svgs[Number(i)])
}

/** 秀米产物的复制 / 导出形态：内容层文本已包裹，可直接过粘贴 lint。 */
export function renderXiumiPublish(markdown, options = {}) {
  const out = renderXiumi(markdown, options)
  return { ...out, html: wrapTextNodes(out.html) }
}

export function renderXiumi(markdown, options = {}) {
  const spec = normalizeSpec(options.spec || options.xiumi_spec || {})
  const components = componentsFromMarkdown(markdown, spec)
  return { html: buildPage(components, { spec }), themeKey: 'xiumi', themeName: '秀米', componentCount: components.length }
}

export { DEFAULT_SPEC, normalizeSpec }
export * from './components.mjs'
export * from './interactive.mjs'
