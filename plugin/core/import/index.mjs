import * as cheerio from 'cheerio'
import { DEFAULT_SPEC } from '../xiumi/spec.mjs'

const BLOCKED_TAGS = 'script,style,iframe,object,embed,link,meta,base,form'
const URL_ATTRIBUTES = new Set(['href', 'src', 'data-src', 'xlink:href', 'action', 'formaction', 'poster'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const SEMANTIC_TAGS = new Set([...HEADINGS, 'p', 'ul', 'ol', 'img', 'svg', 'table', 'pre', 'blockquote', 'hr'])
const INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'a', 'code', 'br'])
const SPEC_KEYS = Object.keys(DEFAULT_SPEC)

function tagName(node) {
  return String(node?.name || node?.tagName || '').toLowerCase()
}

function parseDeclarations(style) {
  const declarations = []
  for (const part of String(style || '').split(';')) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    const name = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).trim()
    if (name && value) declarations.push({ name, value })
  }
  return declarations
}

function declarationsObject(style) {
  return Object.fromEntries(parseDeclarations(style).map(({ name, value }) => [name, value]))
}

function executableUrl(value) {
  const compact = String(value || '').replace(/[\u0000-\u0020\u007f]+/g, '').toLowerCase()
  return compact.startsWith('javascript:') || compact.startsWith('data:text/html')
}

function sanitize($, root) {
  $(root).find(BLOCKED_TAGS).remove()
  $(root).find('*').addBack().each((_, element) => {
    const attrs = element.attribs || {}
    for (const name of Object.keys(attrs)) {
      const lower = name.toLowerCase()
      if (lower.startsWith('on') || lower === 'srcdoc' || lower === 'class' || lower === 'id') {
        $(element).removeAttr(name)
      } else if (URL_ATTRIBUTES.has(lower)) {
        if (executableUrl(attrs[name])) $(element).removeAttr(name)
        else $(element).attr(name, publicAssetUrl(attrs[name]))
      }
    }
  })
  $(root).contents().each(function removeComments(_, node) {
    if (node.type === 'comment') $(node).remove()
    else if (node.children?.length) $(node).contents().each(removeComments)
  })
}

const SENSITIVE_QUERY = /^(tempkey|exportkey|pass_ticket|ticket|token|poc_token|access_token|signature|sig|code|sessionid|session_id|sid|key|auth|target_url|redirect_url|return_url)$/i

export function publicAssetUrl(value) {
  const raw = String(value || '')
  const hash = raw.indexOf('#')
  const withoutHash = hash < 0 ? raw : raw.slice(0, hash)
  const query = withoutHash.indexOf('?')
  if (query < 0) return withoutHash
  const base = withoutHash.slice(0, query)
  const kept = withoutHash.slice(query + 1).split('&').filter((part) => {
    const rawKey = part.split('=', 1)[0]
    try { return !SENSITIVE_QUERY.test(decodeURIComponent(rawKey)) } catch { return !SENSITIVE_QUERY.test(rawKey) }
  })
  return base + (kept.length ? `?${kept.join('&')}` : '')
}

function absoluteUrl(value, baseUrl) {
  const url = String(value || '').trim()
  if (!url) return ''
  try {
    return publicAssetUrl(baseUrl ? new URL(url, baseUrl) : new URL(url))
  } catch {
    return publicAssetUrl(url)
  }
}

async function rewriteAssets($, root, baseUrl, resolveAsset, assets, warnings) {
  if (resolveAsset !== undefined && typeof resolveAsset !== 'function') throw new Error('resolveAsset 必须是异步函数')
  const cache = new Map()
  const nodes = $(root).find('img,image').toArray()
  for (const element of nodes) {
    const svg = tagName(element) === 'image'
    const attributes = svg ? ['href', 'xlink:href'] : ['src']
    const originalAttribute = svg ? ($(element).attr('href') ? 'href' : 'xlink:href') : ($(element).attr('data-src') ? 'data-src' : 'src')
    const original = String($(element).attr(originalAttribute) || '').trim()
    if (!original) continue
    if (/^data:image\//i.test(original)) continue
    const url = absoluteUrl(original, baseUrl)
    let resolved = url
    let status = 'original'
    if (resolveAsset) {
      const key = `image\0${url}`
      if (!cache.has(key)) {
        cache.set(key, (async () => {
          try {
            const local = await resolveAsset(url, 'image')
            if (typeof local !== 'string' || !local.trim() || /^data:/i.test(local)) throw new Error('resolveAsset 必须返回非空本地相对路径')
            return { url: local.trim(), status: 'resolved' }
          } catch (error) {
            warnings.push(`素材解析失败，保留原 URL：${url}（${error?.message || String(error)}）`)
            return { url, status: 'failed' }
          }
        })())
      }
      const result = await cache.get(key)
      resolved = result.url
      status = result.status
    }
    for (const attribute of attributes) $(element).removeAttr(attribute)
    if (!svg) $(element).removeAttr('data-src')
    $(element).attr(svg ? 'href' : 'src', resolved)
    assets.push({ kind: 'image', source: publicAssetUrl(original), url: resolved, status })
  }
}

function negativeHorizontalMargin(style) {
  const declarations = declarationsObject(style)
  const negative = (value) => /^-(?:\d|\.\d)/.test(String(value || '').trim())
  if (negative(declarations['margin-left']) || negative(declarations['margin-right'])) return true
  const values = String(declarations.margin || '').split(/\s+/).filter(Boolean)
  if (!values.length) return false
  const right = values[1] || values[0]
  const left = values[3] || right
  return negative(left) || negative(right)
}

function prepareRaw($, node) {
  const clone = $(node).clone()
  clone.find('*').addBack().each((_, element) => {
    const style = $(element).attr('style')
    if (style && negativeHorizontalMargin(style)) {
      const retained = parseDeclarations(style).filter(({ name }) => name !== 'max-width').map(({ name, value }) => `${name}:${value}`).join(';')
      $(element).attr('style', `${retained}${retained ? ';' : ''}max-width:none !important;`)
    }
  })
  return $.html(clone)
}

function escapeText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/([`*_[\]<>])/g, '\\$1').replace(/\r?\n/g, ' ')
}

function inlineMarkdown($, node) {
  if (node.type === 'text') return escapeText(node.data || '')
  if (node.type !== 'tag') return ''
  const tag = tagName(node)
  if (!INLINE_TAGS.has(tag) || $(node).attr('style')) return null
  if (tag === 'br') return '  \n'
  const content = $(node).contents().toArray().map((child) => inlineMarkdown($, child))
  if (content.some((part) => part === null)) return null
  const joined = content.join('')
  if (tag === 'strong' || tag === 'b') return `**${joined}**`
  if (tag === 'em' || tag === 'i') return `*${joined}*`
  if (tag === 'code') return `\`${joined.replace(/`/g, '\\`')}\``
  if (tag === 'a') {
    const href = $(node).attr('href')
    if (!href || executableUrl(href)) return null
    return `[${joined}](${String(href).replace(/[()\s]/g, (char) => encodeURIComponent(char))})`
  }
  return joined
}

function simpleInline($, node) {
  if (!$(node).attr('style') && !$(node).find('[style]').length) {
    const content = $(node).contents().toArray().map((child) => inlineMarkdown($, child))
    if (!content.some((part) => part === null)) return content.join('').trim()
  }
  return null
}

function listMarkdown($, node) {
  if ($(node).attr('style') || $(node).find('[style]').length) return null
  const items = $(node).children('li').toArray()
  if (!items.length || $(node).children().length !== items.length) return null
  const ordered = tagName(node) === 'ol'
  return items.map((item, index) => {
    if ($(item).children().not('strong,b,em,i,a,code,br').length) return null
    const content = simpleInline($, item)
    if (content === null || !content) return null
    return `${ordered ? `${index + 1}.` : '-'} ${content}`
  }).every((line) => line !== null) ? items.map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${simpleInline($, item)}`).join('\n') : null
}

function promote($, node) {
  const tag = tagName(node)
  if (HEADINGS.has(tag)) {
    const content = simpleInline($, node)
    if (content) return { markdown: `${'#'.repeat(Number(tag.slice(1)))} ${content}`, component: 'heading', confidence: 0.98, reason: '简单标题可无损转为 Markdown' }
  }
  if (tag === 'p') {
    const content = simpleInline($, node)
    if (content) return { markdown: content, component: 'paragraph', confidence: 0.98, reason: '简单段落可无损转为 Markdown' }
  }
  if (tag === 'ul' || tag === 'ol') {
    const content = listMarkdown($, node)
    if (content) return { markdown: content, component: tag === 'ol' ? 'number_steps' : 'bullet_list', confidence: 0.96, reason: '简单列表可无损转为 Markdown' }
  }
  if (tag === 'img' && !$(node).attr('style')) {
    const src = $(node).attr('src')
    if (src) {
      const alt = escapeText($(node).attr('alt') || '').replace(/]/g, '\\]')
      return { markdown: `![${alt}](${String(src).replace(/[()\s]/g, (char) => encodeURIComponent(char))})`, component: 'image', confidence: 0.98, reason: '独立图片可无损转为 Markdown' }
    }
  }
  return null
}

function semanticChildren($, node) {
  return $(node).contents().toArray().filter((child) => child.type === 'tag' || (child.type === 'text' && String(child.data || '').trim()))
}

function collectBlocks($, node, blocks) {
  if (node.type === 'text') {
    const text = String(node.data || '').trim()
    if (text) blocks.push({ html: `<p>${escapeText(text)}</p>`, markdown: escapeText(text), tag: 'p', component: 'paragraph', kind: 'native', confidence: 0.8, reason: '正文直接文本转为段落' })
    return
  }
  const tag = tagName(node)
  const complexContainer = ['div', 'section', 'article', 'main', 'body'].includes(tag) && ($(node).attr('style') || $(node).find('svg,table').length && !semanticChildren($, node).some((child) => ['svg', 'table'].includes(tagName(child))))
  if (!SEMANTIC_TAGS.has(tag) && !complexContainer && tag !== 'mp-common-profile' && !tag.startsWith('mp-')) {
    for (const child of semanticChildren($, node)) collectBlocks($, child, blocks)
    return
  }
  const promoted = promote($, node)
  const sourceIndex = blocks.length
  if (promoted) {
    blocks.push({ ...promoted, tag, kind: 'native', sourceIndex })
  } else {
    blocks.push({ html: prepareRaw($, node), tag, kind: 'raw', component: 'raw', confidence: 1, reason: SEMANTIC_TAGS.has(tag) ? '保留原始结构与内联样式' : '复杂容器作为原子块保留', sourceIndex })
  }
}

function normalizeColor(value) {
  const text = String(value || '').trim().toLowerCase()
  let match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(text)
  if (match) return `#${match[1]}`
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,|\s*\))/.exec(text)
  if (match && match.slice(1, 4).every((part) => Number(part) <= 255)) return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
  if (text === 'white') return '#ffffff'
  if (text === 'black') return '#000000'
  return null
}

function pixelNumber(value) {
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(String(value || '').trim())
  return match ? Number(match[1]) : null
}

function lineHeight(value, fontSize) {
  const text = String(value || '').trim()
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text)
  const pixels = pixelNumber(text)
  return pixels !== null && fontSize > 0 ? pixels / fontSize : null
}

function dominant(entries, property, convert = (value) => value) {
  const values = entries.map((entry) => convert(entry.style[property], entry)).filter((value) => value !== null && value !== undefined && value !== '')
  if (!values.length) return null
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return { value, count, total: values.length }
}

function paddingParts(value) {
  const parts = String(value || '').split(/\s+/).filter(Boolean).map(pixelNumber)
  if (!parts.length || parts.some((part) => part === null)) return null
  return { y: parts[0], x: parts[1] ?? parts[0] }
}

function inferSpec($, root) {
  const bodyNodes = $(root).find('p,li').toArray().map((node) => ({ node, style: declarationsObject($(node).attr('style')) }))
  const titleNodes = $(root).find('h1').toArray().map((node) => ({ node, style: declarationsObject($(node).attr('style')) }))
  const rootStyle = declarationsObject($(root).attr('style'))
  const rootEntries = [{ style: rootStyle }]
  const links = $(root).find('a').toArray().map((node) => ({ style: declarationsObject($(node).attr('style')) }))
  const muted = $(root).find('small').toArray().map((node) => ({ style: declarationsObject($(node).attr('style')) }))
  const cards = $(root).find('blockquote,pre').toArray().map((node) => ({ style: declarationsObject($(node).attr('style')) }))
  const candidates = {
    title_color: dominant(titleNodes, 'color', normalizeColor),
    title_size: dominant(titleNodes, 'font-size', pixelNumber),
    title_align: dominant(titleNodes, 'text-align', (value) => ['left', 'center', 'right'].includes(value) ? value : null),
    body_color: dominant(bodyNodes, 'color', normalizeColor),
    body_size: dominant(bodyNodes, 'font-size', pixelNumber),
    body_align: dominant(bodyNodes, 'text-align', (value) => ['left', 'center', 'right', 'justify'].includes(value) ? value : null),
    body_spacing: dominant(bodyNodes, 'letter-spacing', pixelNumber),
    line_height: dominant(bodyNodes, 'line-height', (value, entry) => lineHeight(value, pixelNumber(entry.style['font-size']) || DEFAULT_SPEC.body_size)),
    muted_color: dominant(muted, 'color', normalizeColor),
    page_bg: dominant(rootEntries, 'background-color', normalizeColor),
    page_width: dominant(rootEntries, 'max-width', pixelNumber) || dominant(rootEntries, 'width', pixelNumber),
    page_padding_x: rootStyle.padding ? paddingParts(rootStyle.padding)?.x : pixelNumber(rootStyle['padding-left']),
    page_padding_y: rootStyle.padding ? paddingParts(rootStyle.padding)?.y : pixelNumber(rootStyle['padding-top']),
    card_bg: dominant(cards, 'background-color', normalizeColor),
    card_radius: dominant(cards, 'border-radius', pixelNumber),
    card_padding: dominant(cards, 'padding', (value) => paddingParts(value)?.y),
    accent: dominant(links, 'color', normalizeColor),
    accent2: null,
  }
  const xiumiSpec = { ...DEFAULT_SPEC }
  const specEvidence = {}
  for (const key of SPEC_KEYS) {
    let candidate = candidates[key]
    if (candidate !== null && typeof candidate === 'object' && Object.hasOwn(candidate, 'value')) {
      // page_width 的 max-width 优先于 width，两个来源都保留可读证据。
      candidate = candidate
    } else if (candidate !== null && candidate !== undefined) {
      candidate = { value: candidate, count: 1, total: 1 }
    }
    const value = candidate?.value
    const valid = value !== undefined && value !== null && value !== '' && (typeof value !== 'number' || Number.isFinite(value))
    if (valid) {
      const ratio = candidate.count / candidate.total
      const confidence = Math.min(0.95, 0.65 + ratio * 0.25 + Math.min(candidate.count - 1, 2) * 0.025)
      const inRange = typeof value !== 'number' || !({ title_size: [10, 80], body_size: [10, 40], body_spacing: [0, 20], line_height: [1, 4], page_width: [280, 1200], page_padding_x: [0, 120], page_padding_y: [0, 120], card_radius: [0, 80], card_padding: [0, 100] }[key] || []).length || (value >= ({ title_size: [10, 80], body_size: [10, 40], body_spacing: [0, 20], line_height: [1, 4], page_width: [280, 1200], page_padding_x: [0, 120], page_padding_y: [0, 120], card_radius: [0, 80], card_padding: [0, 100] }[key][0]) && value <= ({ title_size: [10, 80], body_size: [10, 40], body_spacing: [0, 20], line_height: [1, 4], page_width: [280, 1200], page_padding_x: [0, 120], page_padding_y: [0, 120], card_radius: [0, 80], card_padding: [0, 100] }[key][1]))
      if (inRange) {
        xiumiSpec[key] = value
        specEvidence[key] = { value, confidence: Number(confidence.toFixed(2)), evidence: [`内联样式匹配 ${candidate.count}/${candidate.total} 次`] }
        continue
      }
    }
    specEvidence[key] = { value: DEFAULT_SPEC[key], confidence: 0, evidence: ['未检测到足够的一致内联样式证据，使用默认值'] }
  }
  return { xiumiSpec, specEvidence }
}

/**
 * 把外部 HTML 转为秀米 Markdown；输入解析、素材解析与输出均不访问文件系统或网络。
 */
export async function importArticle({ html, baseUrl = '', resolveAsset } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('html 必须是非空字符串')
  const $ = cheerio.load(html, { decodeEntities: false })
  const selected = $('#js_content').first()
  const root = selected.length ? selected : $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body').first()
  const title = $('#activity-name').first().text().trim() || $('title').first().text().trim() || $(root).find('h1').first().text().trim()
  sanitize($, root)
  const warnings = []
  const assets = []
  await rewriteAssets($, root, baseUrl, resolveAsset, assets, warnings)
  const blocks = []
  for (const child of semanticChildren($, root)) collectBlocks($, child, blocks)
  const normalizedBlocks = blocks.map((block, index) => {
    const id = `import-${String(index + 1).padStart(3, '0')}`
    return { ...block, id, sourceIndex: index, markdown: block.kind === 'raw' ? `:::raw\n${block.html}\n:::` : block.markdown }
  })
  const { xiumiSpec, specEvidence } = inferSpec($, root)
  const markdown = normalizedBlocks.map((block) => block.markdown).join('\n\n')
  return {
    title,
    markdown,
    xiumiSpec,
    specEvidence,
    blocks: normalizedBlocks,
    assets,
    warnings,
    stats: { total: normalizedBlocks.length, native: normalizedBlocks.filter((block) => block.kind === 'native').length, raw: normalizedBlocks.filter((block) => block.kind === 'raw').length },
    sourceHtml: $(root).html() || '',
  }
}
