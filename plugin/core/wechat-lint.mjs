const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'base', 'embed'])
const TEXT_CONTAINERS = new Set(['section', 'p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'])
const BLOCKED_TAGS = new Set(['style', 'link', 'div'])
const PASTE_BASIS = '粘贴路径推论；同类约束的既有实测来自微信草稿 API 路径，不能当作粘贴路径实测'
const PASTE_MEASURED = '微信临时预览粘贴路径实测'

function issue(rule, message, index, extra = {}) {
  return { rule, severity: 'error', message, index, evidence: PASTE_BASIS, ...extra }
}

function attributes(source) {
  const result = {}
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g
  for (const match of source.matchAll(pattern)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  return result
}

function declarations(style) {
  const result = {}
  for (const part of String(style || '').split(';')) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    result[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim()
  }
  return result
}

function hasNegativeHorizontalMargin(style) {
  let left = ''
  let right = ''
  for (const part of String(style || '').split(';')) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    const name = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).trim()
    if (name === 'margin') {
      const shorthand = value.split(/\s+/).filter(Boolean)
      if (!shorthand.length) continue
      right = shorthand[1] || shorthand[0]
      left = shorthand[3] || right
    } else if (name === 'margin-left') left = value
    else if (name === 'margin-right') right = value
  }
  const negative = (value) => /^-(?:\d|\.\d)/.test(value)
  return negative(left) && negative(right)
}

function luminance([r, g, b]) {
  const values = [r, g, b].map((value) => {
    const srgb = value / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function parseColor(value) {
  const text = String(value || '').trim().toLowerCase()
  let match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)
  if (match) {
    let hex = match[1]
    if (hex.length === 3) hex = [...hex].map((char) => char + char).join('')
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
  }
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(text)
  if (match) {
    const rgb = match.slice(1, 4).map(Number)
    return rgb.every((value) => value <= 255) ? rgb : null
  }
  if (text === 'white') return [255, 255, 255]
  if (text === 'black') return [0, 0, 0]
  return null
}

export function lintWechatHtml(html) {
  const source = String(html || '')
  const errors = []
  const stack = []
  const tagPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w-]*)([^>]*)>/g
  let cursor = 0
  let match

  // @keyframes 是样式表级动画，正文不支持；动画应改用 SVG SMIL。
  if (/@keyframes\b/i.test(source)) {
    errors.push(issue('css-animation', '正文含 @keyframes（公众号禁用 CSS 动画，动效改用 SVG SMIL）', source.search(/@keyframes\b/i)))
  }
  // SMIL 在 height/width 上用 indefinite 循环会被限制；transform/opacity 的循环是放行的。
  const smilLoop = /<animate(?:Transform)?\b[^>]*attributeName\s*=\s*["'](?:height|width)["'][^>]*repeatCount\s*=\s*["']indefinite["']/gi
  for (const m of source.matchAll(smilLoop)) {
    errors.push(issue('smil-loop', 'SMIL 在 height/width 上用 repeatCount="indefinite" 会被限制，改用具体次数或 transform/opacity 循环', m.index))
  }

  function checkText(text, index) {
    if (!text.trim() || !stack.length) return
    const frame = stack.at(-1)
    if (TEXT_CONTAINERS.has(frame.tag)) {
      errors.push(issue('text-wrapping', `<${frame.tag}> 内有未包裹的直接文本节点；粘贴路径要求文本放在 span 等行内元素中`, index, { tag: frame.tag }))
    }
    if (!frame.contrastChecked) {
      frame.contrastChecked = true
      if (frame.foreground && frame.background) {
        const ratio = contrastRatio(frame.foreground, frame.background)
        if (ratio < 4.5) {
          errors.push(issue('contrast', `正文颜色对比度 ${ratio.toFixed(2)}:1，低于 WCAG 4.5:1`, index, { tag: frame.tag, ratio: Number(ratio.toFixed(2)), minimum: 4.5 }))
        }
      }
    }
  }

  while ((match = tagPattern.exec(source))) {
    checkText(source.slice(cursor, match.index), cursor)
    cursor = tagPattern.lastIndex
    if (match[0].startsWith('<!--')) continue
    const closing = /^<\//.test(match[0])
    const tag = match[1].toLowerCase()
    if (closing) {
      const found = stack.map((frame) => frame.tag).lastIndexOf(tag)
      if (found >= 0) stack.length = found
      continue
    }
    const index = match.index
    if (BLOCKED_TAGS.has(tag)) errors.push(issue('forbidden-tag', `微信粘贴约束不使用 <${tag}>；样式必须全部内联`, index, { tag }))
    const attrs = attributes(match[2] || '')
    for (const name of ['class', 'id']) {
      if (Object.hasOwn(attrs, name)) errors.push(issue('forbidden-attribute', `<${tag}> 不得使用 ${name} 属性`, index, { tag, attribute: name }))
    }
    const style = attrs.style || ''
    const rules = declarations(style)
    if (/position\s*:/i.test(style)) errors.push(issue('position', `<${tag}> 的 style 含 position`, index, { tag }))
    if (/(?:^|;)\s*--[\w-]+\s*:|var\s*\(/i.test(style)) errors.push(issue('css-variable', `<${tag}> 的 style 含 CSS 变量`, index, { tag }))
    if (/display\s*:\s*(?:inline-)?grid\b|grid-(?:template|area|column|row|gap)\s*:/i.test(style)) errors.push(issue('grid', `<${tag}> 的 style 含 grid 布局`, index, { tag }))
    // CSS 动画/过渡在公众号正文被禁用；动效应改用 SVG SMIL（见 xiumi/interactive.mjs）。
    if (/(?:^|;)\s*(?:animation|transition)(?:-[\w-]+)?\s*:/i.test(style)) errors.push(issue('css-animation', `<${tag}> 的 style 含 CSS animation/transition（公众号禁用，动效改用 SVG SMIL）`, index, { tag }))
    if (hasNegativeHorizontalMargin(style) && !/^none\s*!important$/i.test(String(rules['max-width'] || '').trim())) {
      errors.push(issue('full-bleed-width', `<${tag}> 的左右负外边距需要 max-width:none !important；全幅内容优先使用 :::full_bleed`, index, { tag, evidence: PASTE_MEASURED }))
    }
    if ((tag === 'td' || tag === 'th') && !rules.border && ['top', 'right', 'bottom', 'left'].some((side) => rules[`border-${side}`])) {
      errors.push(issue('table-cell-border-reset', `<${tag}> 先用 border:0 清除默认边框，再声明需要保留的边线`, index, { tag, evidence: PASTE_MEASURED }))
    }

    const parent = stack.at(-1)
    const foreground = parseColor(rules.color) || parent?.foreground || null
    const background = parseColor(rules['background-color']) || parseColor(rules.background) || parent?.background || [255, 255, 255]
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(match[0])) stack.push({ tag, foreground, background, contrastChecked: false })
  }
  checkText(source.slice(cursor), cursor)
  return {
    ok: errors.length === 0,
    errors,
    summary: errors.length ? `${errors.length} 项粘贴约束未通过` : '微信粘贴约束检查通过',
    evidence: { ruleObservations: '微信草稿 API 路径', pastePath: '逐条 evidence 标注；未标注规则仍需以实际粘贴结果复核', measuredRules: ['full-bleed-width', 'table-cell-border-reset'] },
  }
}
