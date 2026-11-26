import { themes } from './runtime.mjs'
import { toWechatDark, DARK_CONSTANTS } from './dark-preview.mjs'

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

const THEME_TEXT_SLOTS = {
  h1: ['h1'], h2: ['h2'], h3: ['h3'], h4: ['h3'], h5: ['h3'], h6: ['h3'],
  p: ['p'], li: ['li'], strong: ['strong'], em: ['em'], pre: ['code_block'], code: ['code_inline', 'code_block'],
  blockquote: ['blockquote'], a: ['a'], th: ['th'], td: ['td'],
}
let builtinTextColors = null

/* 只对内置主题对应槽位的实际文字颜色关闭对比度误报；自定义颜色仍按 4.5:1 检查。 */
function isBuiltinTextColor(tag, color) {
  if (!color || !THEME_TEXT_SLOTS[tag]) return false
  if (!builtinTextColors) {
    builtinTextColors = new Map()
    for (const theme of Object.values(themes())) {
      for (const [name, slots] of Object.entries(THEME_TEXT_SLOTS)) {
        for (const slot of slots) {
          const value = declarations(theme.styles[slot]).color
          if (!value) continue
          const normalized = value.replace(/\{\{PRIMARY\}\}/g, '#4a69f2').replace(/\s+/g, '').toLowerCase()
          if (!builtinTextColors.has(name)) builtinTextColors.set(name, new Set())
          builtinTextColors.get(name).add(normalized)
        }
      }
    }
  }
  return builtinTextColors.get(tag)?.has(String(color).replace(/\s+/g, '').toLowerCase()) || false
}

const TABLE_BORDER_PROPS = ['border', 'border-top', 'border-right', 'border-bottom', 'border-left']
const normalizedThemeValue = (value) => String(value || '').replace(/\{\{PRIMARY\}\}/g, '#4a69f2').replace(/\s+/g, '').toLowerCase()

function hasBuiltinTableBorder(tag, rules) {
  return Object.values(themes()).some((theme) => {
    const expected = declarations(theme.styles[tag])
    return TABLE_BORDER_PROPS.every((name) => normalizedThemeValue(rules[name]) === normalizedThemeValue(expected[name]))
  })
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

function hasStyleShape(style, names) {
  const rules = declarations(style)
  const actual = Object.keys(rules)
  return names.every((name) => Object.hasOwn(rules, name)) && actual.every((name) => names.includes(name))
}

function fishpaiStructure(tag, attrs, stack, source, index) {
  const parent = stack.at(-1)
  const root = tag === 'div' && index === 0 && stack.length === 0 && !attrs.class && !attrs.id
    && ['font-family', 'color', 'line-height', 'padding', 'font-size'].every((name) => Object.hasOwn(declarations(attrs.style), name))
  if (root) return { allowTag: true, kind: 'fast-root' }

  if (tag === 'code' && parent?.tag === 'pre' && /^language-[\w+-]+$/i.test(attrs.class || '')
    && ['font-family', 'font-size', 'color'].every((name) => declarations(attrs.style)[name] === 'inherit')) {
    return { allowClass: true }
  }
  if (tag === 'div' && attrs.class === 'mac-code-block' && parent?.tag === 'code' && stack.at(-2)?.tag === 'pre'
    && hasStyleShape(attrs.style, ['border-radius', 'overflow', 'margin', 'box-shadow'])) {
    return { allowTag: true, allowClass: true, kind: 'mac-code' }
  }
  if (tag === 'div' && attrs.class === 'mac-code-header' && parent?.className === 'mac-code-block'
    && ['background', 'background-color', 'padding', 'display', 'align-items', 'gap', 'border-bottom'].some((name) => Object.hasOwn(declarations(attrs.style), name))) {
    return { allowTag: true, allowClass: true, kind: 'mac-code' }
  }
  if (tag === 'span' && parent?.className === 'mac-code-header'
    && (/^mac-dot (?:red|yellow|green)$/.test(attrs.class || '') || attrs.class === 'mac-code-lang')) {
    return { allowClass: true, kind: 'mac-code' }
  }
  if (tag === 'span' && /^hljs-[\w-]+(?: [\w-]+)*$/.test(attrs.class || '') && stack.some((frame) => frame.className === 'mac-code-block')) {
    return { allowClass: true, kind: 'mac-code' }
  }
  if (tag === 'section' && stack.some((frame) => frame.kind === 'fast-root')
    && attrs.style === 'margin-top: 28px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; line-height: 1.8; color: #999;') {
    return { kind: 'references' }
  }
  if (tag === 'span' && stack.some((frame) => frame.kind === 'fast-root')
    && /^<span\b[^>]*><span>[^<]*<\/span><sup style="color: inherit; font-size: 80%; vertical-align: super; cursor: default;">\[\d+\]<\/sup><\/span>/.test(source.slice(index))) {
    return { kind: 'footnote' }
  }
  if (tag === 'div' && stack.some((frame) => frame.kind === 'fast-root')) {
    if (hasStyleShape(attrs.style, ['border-left', 'background-color', 'padding', 'margin', 'border-radius'])
      || hasStyleShape(attrs.style, ['font-weight', 'color', 'margin-bottom', 'font-size'])
      || hasStyleShape(attrs.style, ['color', 'opacity', 'font-size', 'line-height'])) {
      return { allowTag: true }
    }
  }
  return {}
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
    if (TEXT_CONTAINERS.has(frame.tag) && !frame.textWrapExempt) {
      errors.push(issue('text-wrapping', `<${frame.tag}> 内有未包裹的直接文本节点；粘贴路径要求文本放在 span 等行内元素中`, index, { tag: frame.tag }))
    }
    if (!frame.contrastChecked) {
      frame.contrastChecked = true
      if (frame.foreground && frame.background && !frame.contrastExempt) {
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
    const parent = stack.at(-1)
    const attrs = attributes(match[2] || '')
    const fixed = fishpaiStructure(tag, attrs, stack, source, index)
    if (BLOCKED_TAGS.has(tag) && !fixed.allowTag) errors.push(issue('forbidden-tag', `微信粘贴约束不使用 <${tag}>；样式必须全部内联`, index, { tag }))
    for (const name of ['class', 'id']) {
      if (Object.hasOwn(attrs, name) && !(name === 'class' && fixed.allowClass)) errors.push(issue('forbidden-attribute', `<${tag}> 不得使用 ${name} 属性`, index, { tag, attribute: name }))
    }
    const style = attrs.style || ''
    const rules = declarations(style)
    if (/position\s*:/i.test(style)) errors.push(issue('position', `<${tag}> 的 style 含 position`, index, { tag }))
    if (/(?:^|;)\s*--[\w-]+\s*:|var\s*\(/i.test(style)) errors.push(issue('css-variable', `<${tag}> 的 style 含 CSS 变量`, index, { tag }))
    if (/display\s*:\s*(?:inline-)?grid\b|grid-(?:template|area|column|row|gap)\s*:/i.test(style)) errors.push(issue('grid', `<${tag}> 的 style 含 grid 布局`, index, { tag }))
    // CSS 动画/过渡在公众号正文被禁用；动效应改用 SVG SMIL（见 professional/interactive.mjs）。
    if (/(?:^|;)\s*(?:animation|transition)(?:-[\w-]+)?\s*:/i.test(style)) errors.push(issue('css-animation', `<${tag}> 的 style 含 CSS animation/transition（公众号禁用，动效改用 SVG SMIL）`, index, { tag }))
    if (hasNegativeHorizontalMargin(style) && !/^none\s*!important$/i.test(String(rules['max-width'] || '').trim())) {
      errors.push(issue('full-bleed-width', `<${tag}> 的左右负外边距需要 max-width:none !important；全幅内容优先使用 :::full_bleed`, index, { tag, evidence: PASTE_MEASURED }))
    }
    const inFastRoot = stack.some((frame) => frame.kind === 'fast-root') || fixed.kind === 'fast-root'
    if ((tag === 'td' || tag === 'th') && !rules.border && ['top', 'right', 'bottom', 'left'].some((side) => rules[`border-${side}`])
      && !(inFastRoot && hasBuiltinTableBorder(tag, rules))) {
      errors.push(issue('table-cell-border-reset', `<${tag}> 先用 border:0 清除默认边框，再声明需要保留的边线`, index, { tag, evidence: PASTE_MEASURED }))
    }

    const declaredForeground = parseColor(rules.color)
    const foreground = declaredForeground || parent?.foreground || null
    const background = parseColor(rules['background-color']) || parseColor(rules.background) || parent?.background || [255, 255, 255]
    const thematicText = inFastRoot && isBuiltinTextColor(tag, rules.color)
    const fixedParent = ['mac-code', 'references', 'footnote'].includes(parent?.kind)
    const sameForeground = !rules.color || (declaredForeground && parent?.foreground
      && declaredForeground.every((value, channel) => value === parent.foreground[channel]))
    // 普通文本的颜色豁免不能跨过新的颜色声明，否则自定义主题的内联粗体/链接会被外层标题掩盖。
    const inheritedContrastExempt = parent?.contrastExempt && (fixedParent || sameForeground)
    const contrastExempt = inheritedContrastExempt || thematicText || ['mac-code', 'references', 'footnote'].includes(fixed.kind)
    const textWrapExempt = parent?.textWrapExempt || fixed.kind === 'references'
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(match[0])) {
      stack.push({ tag, foreground, background, contrastChecked: false, className: attrs.class || '', kind: fixed.kind, contrastExempt, textWrapExempt })
    }
  }
  checkText(source.slice(cursor), cursor)
  return {
    dark: lintDarkMode(source),
    ok: errors.length === 0,
    errors,
    summary: errors.length ? `${errors.length} 项粘贴约束未通过` : '微信粘贴约束检查通过',
    evidence: { ruleObservations: '微信草稿 API 路径', pastePath: '逐条 evidence 标注；未标注规则仍需以实际粘贴结果复核', measuredRules: ['full-bleed-width', 'table-cell-border-reset'] },
  }
}

/** 只提示、不阻断交付的规则：阅读体验类判断，最终以人在目标设备上的观感为准。 */
const ADVISORY_RULES = new Set(['contrast'])
const DELIVERY_LIST_LIMIT = 5

function excerpt(html, index) {
  return String(html).slice(Math.max(0, index), index + 80).replace(/\s+/g, ' ')
}

/**
 * 交付质检：复制与导出前对发布形态 HTML 运行粘贴约束检查。
 * 结构类问题进 `blockers` 并阻断交付；对比度与深色可读性进 `notices`，随结果提示。
 */
export function checkDelivery(html) {
  const source = String(html || '')
  const result = lintWechatHtml(source)
  const blockers = result.errors.filter((item) => !ADVISORY_RULES.has(item.rule))
  const advisories = result.errors.filter((item) => ADVISORY_RULES.has(item.rule))
  return {
    ok: blockers.length === 0,
    blockers: blockers.map((item) => ({ rule: item.rule, message: item.message, excerpt: excerpt(source, item.index) })),
    notices: {
      contrast: advisories.length,
      dark: result.dark.warnings.length,
    },
  }
}

/** 交付质检结论的文字版：阻断时列出前几条结构问题，通过时给出提示计数。 */
export function describeDelivery(check) {
  if (!check.ok) {
    const head = check.blockers.slice(0, DELIVERY_LIST_LIMIT).map((item, i) => `${i + 1}. [${item.rule}] ${item.message}：${item.excerpt}`)
    const more = check.blockers.length > DELIVERY_LIST_LIMIT ? [`另有 ${check.blockers.length - DELIVERY_LIST_LIMIT} 处同类问题`] : []
    return [`交付质检未通过：${check.blockers.length} 处粘贴约束问题，修正后再复制或导出。`, ...head, ...more].join('\n')
  }
  const notes = []
  if (check.notices.contrast) notes.push(`正文对比度低于 4.5:1 ${check.notices.contrast} 处`)
  if (check.notices.dark) notes.push(`深色模式下可能不易阅读 ${check.notices.dark} 处`)
  return notes.length ? `交付质检通过；提示：${notes.join('，')}（用 fishpai_lint 查看明细）。` : '交付质检通过。'
}

const DARK_BASIS = '按微信公众平台 Dark Mode 转换算法推演，真机效果以读者设备为准'
const DARK_LIMIT_PER_RULE = 20

function darkIssue(rule, message, index, extra = {}) {
  return { rule, severity: 'warning', message, index, evidence: DARK_BASIS, ...extra }
}

/**
 * 深色可读性诊断：读者开深色模式后可能读不清的位置。
 * 属阅读体验诊断，结果放在 `dark` 段；`ok` 只反映粘贴约束。
 */
export function lintDarkMode(html) {
  const source = String(html || '')
  const darkSource = toWechatDark(source)
  const warnings = []
  const counts = {}
  const push = (item) => {
    counts[item.rule] = (counts[item.rule] || 0) + 1
    if (counts[item.rule] <= DARK_LIMIT_PER_RULE) warnings.push(item)
  }

  // 1. 深色变体里的文字对比度
  const tagPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)([^>]*)>/g
  const stack = []
  let svgDepth = 0
  let cursor = 0
  let match
  const darkBg = parseColor(DARK_CONSTANTS.DEFAULT_DARK_BGCOLOR)
  const darkText = parseColor(DARK_CONSTANTS.DEFAULT_DARK_TEXTCOLOR)
  const checkDarkText = (text, index) => {
    if (!text.replace(/&nbsp;|\s/g, '') || svgDepth > 0) return
    const frame = stack.at(-1)
    if (!frame || frame.checked) return
    frame.checked = true
    const ratio = contrastRatio(frame.foreground || darkText, frame.background || darkBg)
    if (ratio < 4.5) push(darkIssue('dark-low-contrast', `深色模式下 <${frame.tag}> 文字对比度约 ${ratio.toFixed(2)}:1，低于 4.5:1`, index, { tag: frame.tag, ratio: Number(ratio.toFixed(2)), minimum: 4.5 }))
  }
  while ((match = tagPattern.exec(darkSource))) {
    checkDarkText(darkSource.slice(cursor, match.index), cursor)
    cursor = tagPattern.lastIndex
    if (match[0].startsWith('<!--')) continue
    const tag = match[1].toLowerCase()
    if (/^<\//.test(match[0])) {
      if (tag === 'svg') svgDepth = Math.max(0, svgDepth - 1)
      const found = stack.map((frame) => frame.tag).lastIndexOf(tag)
      if (found >= 0) stack.length = found
      continue
    }
    if (tag === 'svg' && !/\/\s*>$/.test(match[0])) svgDepth += 1
    const rules = declarations(attributes(match[2] || '').style)
    const parent = stack.at(-1)
    const background = parseColor(rules['background-color']) || parseColor(rules.background) || parent?.background || null
    const foreground = parseColor(rules.color) || parent?.foreground || null
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(match[0])) stack.push({ tag, background, foreground, checked: false })
  }
  checkDarkText(darkSource.slice(cursor), cursor)

  // 2. 原稿结构层面的风险
  for (const m of source.matchAll(/<([A-Za-z][\w-]*)\b[^>]*style\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const style = m[2] ?? m[3] ?? ''
    const tag = m[1].toLowerCase()
    if (/(?:-webkit-)?background-clip\s*:\s*text/i.test(style)) {
      push(darkIssue('dark-gradient-text', `<${tag}> 用渐变/背景裁切做文字，深色下渐变会被压成纯色，文字对比度可能偏低`, m.index, { tag }))
    } else if (/background(?:-image)?\s*:[^;]*gradient\(/i.test(style)) {
      push(darkIssue('dark-gradient-background', `<${tag}> 的渐变背景在深色下会被压成单一纯色`, m.index, { tag }))
    }
  }
  for (const m of source.matchAll(/<text\b[^>]*\bfill\s*=\s*["']([^"']+)["']/gi)) {
    const fill = parseColor(m[1])
    if (fill && contrastRatio(fill, darkBg) < 3) {
      push(darkIssue('dark-svg-text', `SVG 文字 fill=${m[1]} 保持原色，深色底上对比度偏低`, m.index, { fill: m[1] }))
    }
  }
  const hasBackground = /background(?:-color)?\s*:/i.test(source)
  if (!hasBackground && /\bcolor\s*:\s*(?:#|rgb)/i.test(source)) {
    push(darkIssue('dark-missing-background', '正文全部依赖默认背景，深色下落到 #191919，深色文字与之对比度偏低', 0))
  }

  return {
    warnings,
    summary: warnings.length ? `${warnings.length} 处深色模式下可能不易阅读` : '深色模式可读性检查通过',
    evidence: DARK_BASIS,
  }
}
