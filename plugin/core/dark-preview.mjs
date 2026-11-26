/**
 * 微信公众平台深色模式转换算法的字符串级移植。
 *
 * 规则来源：`wechatjs/mp-darkmode` v1.2.2（MIT，微信官方组织维护），commit
 * `65fb6e4deac3e1a5d3287ce4b8b9c53c547d9020` 的 `src/modules/constant.js`、
 * `src/modules/color.js` 与 `src/modules/sdk.js`。上游是 DOM 级实现（读
 * `getComputedStyle`、注入 `<style>`、加 class），公众号正文走编辑器粘贴路径，
 * 正文样式全部内联，这里按同一套阈值做字符串级内联样式变换。
 *
 * 处理范围照 `doc/cn/principle.md`：背景色、字体色、边框色、字体阴影色；渐变先
 * 混合成纯色再转换；`<svg>` 整块原样保留；带背景图的节点保留原背景与其上方文本；
 * 背景色与字体色的处理结果向下透传给子节点。算法遵循「尽可能保留原文信息，只在看不清
 * 或太亮时调整」。
 *
 * 本模块服务预览视图，效果按公开转换算法近似还原，真机表现以读者设备为准。
 */

/** 算法阈值，逐字取自上游 `src/modules/constant.js`。 */
export const DARK_CONSTANTS = Object.freeze({
  DEFAULT_LIGHT_TEXTCOLOR: '#191919',
  DEFAULT_LIGHT_BGCOLOR: '#fff',
  DEFAULT_DARK_TEXTCOLOR: '#a3a3a3',
  DEFAULT_DARK_BGCOLOR: '#191919',
  WHITE_LIKE_COLOR_BRIGHTNESS: 250,
  MAX_LIMIT_BGCOLOR_BRIGHTNESS: 190,
  MIN_LIMIT_OFFSET_BRIGHTNESS: 65,
  HIGH_BGCOLOR_BRIGHTNESS: 100,
  HIGH_BLACKWHITE_HSL_BRIGHTNESS: 40,
  LOW_BLACKWHITE_HSL_BRIGHTNESS: 22,
  IGNORE_ALPHA: 0.05,
})

/** 上游 `CSS_PROP_SERIES` 的平铺分类。SVG 的 fill/stroke 保持原值，与上游一致。 */
const BG_COLOR_PROPS = new Set(['background-color', 'background-image', 'background'])
const TEXT_SHADOW_PROPS = new Set(['text-shadow'])
const TEXT_COLOR_PROPS = new Set(['-webkit-text-stroke', '-webkit-text-stroke-color', 'text-decoration', 'text-decoration-color', 'text-emphasis-color', 'color', '-webkit-text-fill-color'])
const BORDER_COLOR_PROPS = new Set([
  'border-image', '-webkit-border-image', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-block-color', 'border-block-start-color', 'border-block-end-color',
  'border-inline-color', 'border-inline-start-color', 'border-inline-end-color',
  'outline', 'outline-color', 'box-shadow', 'column-rule', 'column-rule-color',
])
const COLOR_PROPS = new Set([...BG_COLOR_PROPS, ...TEXT_SHADOW_PROPS, ...TEXT_COLOR_PROPS, ...BORDER_COLOR_PROPS])

/** 常见 CSS 命名色，覆盖主题、脚注与 hljs 主题会出现的写法。 */
const NAMED_COLORS = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  ivory: [255, 255, 240],
  snow: [255, 250, 250],
  whitesmoke: [245, 245, 245],
  gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105],
  slategray: [112, 128, 144],
  slategrey: [112, 128, 144],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
  maroon: [128, 0, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  gold: [255, 215, 0],
  crimson: [220, 20, 60],
  tomato: [255, 99, 71],
  salmon: [250, 128, 114],
  coral: [255, 127, 80],
  khaki: [240, 230, 140],
  beige: [245, 245, 220],
  linen: [250, 240, 230],
  tan: [210, 180, 140],
  wheat: [245, 222, 179],
  azure: [240, 255, 255],
  mintcream: [245, 255, 250],
  honeydew: [240, 255, 240],
  aliceblue: [240, 248, 255],
  ghostwhite: [248, 248, 255],
  lavender: [230, 230, 250],
  plum: [221, 160, 221],
  violet: [238, 130, 238],
  orchid: [218, 112, 214],
  indigo: [75, 0, 130],
}

const COLOR_TOKEN_SOURCE = '#[0-9a-fA-F]{3,8}\\b|\\brgba?\\([^()]*\\)|\\b[a-zA-Z]+\\b'
const COLOR_TOKEN = new RegExp(COLOR_TOKEN_SOURCE, 'g')

const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)))

/** 解析一个 CSS 色值；可识别时返回 {r,g,b,a}，其余返回 null，调用方保留原值。 */
export function parseColorToken(value) {
  if (value && typeof value === 'object' && 'r' in value) {
    return { r: clamp255(value.r), g: clamp255(value.g), b: clamp255(value.b), a: typeof value.a === 'number' ? value.a : 1 }
  }
  const text = String(value || '').trim().toLowerCase()
  if (!text) return null

  let match = /^#([0-9a-f]{3,8})$/.exec(text)
  if (match) {
    let hex = match[1]
    if (hex.length === 3 || hex.length === 4) hex = [...hex].slice(0, 3).map((char) => char + char).join('')
    else if (hex.length === 6 || hex.length === 8) hex = hex.slice(0, 6)
    else return null
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    return { r, g, b, a: 1 }
  }

  match = /^rgba?\(([^)]*)\)$/.exec(text)
  if (match) {
    const parts = match[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const channel = (part) => (part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part))
    const rgb = parts.slice(0, 3).map(channel)
    if (rgb.some((value) => !Number.isFinite(value))) return null
    let alpha = 1
    if (parts.length > 3) alpha = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    return { r: clamp255(rgb[0]), g: clamp255(rgb[1]), b: clamp255(rgb[2]), a: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 }
  }

  const named = NAMED_COLORS[text]
  if (named) return { r: named[0], g: named[1], b: named[2], a: named.length > 3 ? named[3] : 1 }
  return null
}

/** 序列化：全不透明时出十六进制，与正文既有写法保持一致。 */
export function formatColor({ r, g, b, a = 1 }) {
  if (a >= 1) return `#${[r, g, b].map((value) => clamp255(value).toString(16).padStart(2, '0')).join('')}`
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Math.round(a * 1000) / 1000})`
}

/** 感知亮度（W3C AERT 口径），上游 `getColorPerceivedBrightness`。 */
export function perceivedBrightness({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = ((max + min) / 2) * 100
  if (max === min) return { h: 0, s: 0, l }
  const delta = max - min
  const s = l > 50 ? (delta / (2 - max - min)) * 100 : (delta / (max + min)) * 100
  let h
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToRgb({ h, s, l }) {
  const hn = ((h % 360) + 360) % 360
  const sn = Math.max(0, Math.min(100, s)) / 100
  const ln = Math.max(0, Math.min(100, l)) / 100
  if (sn === 0) {
    const value = clamp255(ln * 255)
    return { r: value, g: value, b: value }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const channel = (t) => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  const h1 = hn / 360
  return { r: clamp255(channel(h1 + 1 / 3) * 255), g: clamp255(channel(h1) * 255), b: clamp255(channel(h1 - 1 / 3) * 255) }
}

/** 缩放到指定感知亮度，含上游 `adjustBrightnessTo` 的通道触顶/触零补偿。 */
export function adjustBrightnessTo(target, color) {
  const brightness = perceivedBrightness(color)
  // 感知亮度为 0 的纯黑按纯白处理；正常流程中纯黑在此之前已由 HSL 分支提亮。
  if (!(brightness > 0)) return { r: 255, g: 255, b: 255, a: color.a ?? 1 }
  const ratio = target / brightness
  let r = Math.min(255, color.r * ratio)
  let g = Math.min(255, color.g * ratio)
  let b = Math.min(255, color.b * ratio)
  if (g === 0 || r === 255 || b === 255) {
    g = (target * 1000 - r * 299 - b * 114) / 587
  } else if (r === 0) {
    r = (target * 1000 - g * 587 - b * 114) / 299
  } else if (b === 0 || g === 255) {
    b = (target * 1000 - r * 299 - g * 587) / 114
  }
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: color.a ?? 1 }
}

/** 依次混合颜色，上游 `mixColors` 默认的 `mix` 模式（按后一色不透明度加权）。 */
export function mixColors(values) {
  const valid = (Array.isArray(values) ? values : [values]).map(parseColorToken).filter(Boolean)
  if (!valid.length) return null
  let current = valid[0]
  for (const next of valid.slice(1)) {
    const weight = next.a ?? 1
    current = {
      r: Math.round(current.r * (1 - weight) + next.r * weight),
      g: Math.round(current.g * (1 - weight) + next.g * weight),
      b: Math.round(current.b * (1 - weight) + next.b * weight),
      a: Math.max(current.a ?? 1, weight),
    }
  }
  return current
}

const DEFAULT_DARK_BG = parseColorToken(DARK_CONSTANTS.DEFAULT_DARK_BGCOLOR)
const DEFAULT_DARK_TEXT = parseColorToken(DARK_CONSTANTS.DEFAULT_DARK_TEXTCOLOR)
const DEFAULT_LIGHT_TEXT = parseColorToken(DARK_CONSTANTS.DEFAULT_LIGHT_TEXTCOLOR)
const DEFAULT_LIGHT_BG = parseColorToken(DARK_CONSTANTS.DEFAULT_LIGHT_BGCOLOR)

const DARK_BG_BRIGHTNESS = perceivedBrightness(DEFAULT_DARK_BG)
const DARK_TEXT_BRIGHTNESS = perceivedBrightness(DEFAULT_DARK_TEXT)
const DARK_BG_HSL_LIGHTNESS = rgbToHsl(DEFAULT_DARK_BG).l
const MAX_LIMIT_OFFSET_BRIGHTNESS = DARK_TEXT_BRIGHTNESS - DARK_BG_BRIGHTNESS

/** 背景明度调整，上游 `_adjustBackgroundBrightness`。 */
export function adjustBackground(color) {
  const hsl = rgbToHsl(color)
  const brightness = perceivedBrightness(color)
  let next = color
  if ((hsl.s === 0 && hsl.l > DARK_CONSTANTS.HIGH_BLACKWHITE_HSL_BRIGHTNESS)
    || brightness > DARK_CONSTANTS.WHITE_LIKE_COLOR_BRIGHTNESS) {
    // 黑白灰偏亮、或接近纯白：按深色底明度取反，白色落到 #191919 一带
    next = hslToRgb({ h: 0, s: 0, l: Math.min(100, 100 + DARK_BG_HSL_LIGHTNESS - hsl.l) })
  } else if (brightness > DARK_CONSTANTS.MAX_LIMIT_BGCOLOR_BRIGHTNESS) {
    next = adjustBrightnessTo(DARK_CONSTANTS.MAX_LIMIT_BGCOLOR_BRIGHTNESS, color)
  } else if (hsl.l < DARK_CONSTANTS.LOW_BLACKWHITE_HSL_BRIGHTNESS) {
    // 过暗的背景提亮到 22% 明度，与深色底拉开层次
    next = hslToRgb({ ...hsl, l: DARK_CONSTANTS.LOW_BLACKWHITE_HSL_BRIGHTNESS })
  }
  return { ...next, a: color.a ?? 1 }
}

/** 文本明度调整，上游 `_adjustTextBrightness`。`background` 需是已经算好的深色底。 */
export function adjustText(text, background) {
  const bg = background || DEFAULT_DARK_BG
  const bgAlpha = bg.a ?? 1
  const bgBrightness = perceivedBrightness(bg) * bgAlpha + DARK_BG_BRIGHTNESS * (1 - bgAlpha)
  const textBrightness = perceivedBrightness(text)
  const offset = Math.abs(bgBrightness - textBrightness)

  // 接近白色的高亮字体保持高亮
  if (textBrightness >= DARK_CONSTANTS.WHITE_LIKE_COLOR_BRIGHTNESS) return text

  if (offset > MAX_LIMIT_OFFSET_BRIGHTNESS && bgBrightness <= DARK_BG_BRIGHTNESS + 2) {
    return adjustBrightnessTo(MAX_LIMIT_OFFSET_BRIGHTNESS + bgBrightness, text)
  }

  // 亮度差达到 65，保持原色
  if (offset >= DARK_CONSTANTS.MIN_LIMIT_OFFSET_BRIGHTNESS) return text

  const hsl = rgbToHsl(text)
  if (bgBrightness >= DARK_CONSTANTS.HIGH_BGCOLOR_BRIGHTNESS) {
    // 亮背景：优先改 HSL 明度把感知亮度压下来
    if (hsl.l > 90 - DARK_CONSTANTS.HIGH_BLACKWHITE_HSL_BRIGHTNESS) {
      return adjustText(hslToRgb({ ...hsl, l: 90 - hsl.l }), bg)
    }
    const target = Math.min(MAX_LIMIT_OFFSET_BRIGHTNESS, bgBrightness - DARK_CONSTANTS.MIN_LIMIT_OFFSET_BRIGHTNESS)
    return adjustBrightnessTo(target, text)
  }

  // 暗背景：提亮字体
  if (hsl.l <= DARK_CONSTANTS.HIGH_BLACKWHITE_HSL_BRIGHTNESS) {
    return adjustText(hslToRgb({ ...hsl, l: 90 - hsl.l }), bg)
  }
  const target = Math.min(MAX_LIMIT_OFFSET_BRIGHTNESS, bgBrightness + DARK_CONSTANTS.MIN_LIMIT_OFFSET_BRIGHTNESS)
  return adjustBrightnessTo(target, text)
}

/** 把渐变里的多个色混成一个纯色，上游 `gradientMixColor`。 */
export function gradientMix(value) {
  const tokens = [...String(value).matchAll(COLOR_TOKEN)]
    .map((match) => match[0])
    .filter((token) => parseColorToken(token))
  if (!tokens.length) return null
  return mixColors(tokens)
}

/**
 * 给定专业规格，返回关键文字/背景对在深色模式下的预测值。
 * 供深色可读性诊断对照，返回颜色对。
 */
export function darkPaletteFor(spec = {}) {
  const asBackground = (value, fallback) => {
    const color = parseColorToken(value) || parseColorToken(fallback)
    return color ? adjustBackground(color) : DEFAULT_DARK_BG
  }
  const pageBg = asBackground(spec.page_bg, DARK_CONSTANTS.DEFAULT_LIGHT_BGCOLOR)
  const cardBg = asBackground(spec.card_bg || spec.page_bg, DARK_CONSTANTS.DEFAULT_LIGHT_BGCOLOR)
  const pair = (name, value, background) => {
    const color = parseColorToken(value) || DEFAULT_LIGHT_TEXT
    return { name, background: formatColor(background), color: formatColor(adjustText(color, background)) }
  }
  return {
    page: { background: formatColor(pageBg) },
    title: pair('title', spec.title_color, pageBg),
    body: pair('body', spec.body_color, pageBg),
    muted: pair('muted', spec.muted_color, pageBg),
    card: pair('card', spec.body_color, cardBg),
  }
}

/**
 * 按顶层分号切分 style，括号内部的分号归属当前值（`url(data:...;base64,)` 与 `rgb()` 都可能含分号）。
 * 返回每个声明的原文区间，供原位替换，保证这些值逐字保留。
 */
function styleSegments(style) {
  const source = String(style || '')
  const segments = []
  let start = 0
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ';' && depth === 0) {
      segments.push([start, index])
      start = index + 1
    }
  }
  segments.push([start, source.length])

  const result = []
  for (const [from, to] of segments) {
    const text = source.slice(from, to)
    const colon = text.indexOf(':')
    if (colon < 1) continue
    // 值在原文里的起点：冒号之后一位
    const valueStart = from + colon + 1
    result.push({ name: text.slice(0, colon).trim().toLowerCase(), value: source.slice(valueStart, to).trim(), valueStart, end: to })
  }
  return result
}

function readAttributes(source) {
  const result = {}
  for (const match of String(source || '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return result
}

/** 逐个替换值里的颜色 token；`pick` 返回 null 表示该 token 保持原样。 */
function replaceColorTokens(value, pick) {
  let changed = false
  const replaced = String(value).replace(COLOR_TOKEN, (token) => {
    const color = parseColorToken(token)
    if (!color) return token
    const next = pick(color, token)
    if (!next || next === token) return token
    changed = true
    return next
  })
  return { value: replaced, changed }
}

/**
 * 把一段带内联样式的 HTML 变换成微信深色模式下的样子。
 *
 * 变换范围限于既有声明里的颜色值，其余属性、声明顺序与标签结构逐字保留。
 * `<svg>` 整块原样输出，与上游及 `doc/cn/principle.md` 的处理范围一致。
 */
export function toWechatDark(html) {
  const source = String(html || '')
  const parts = []
  const stack = []
  let cursor = 0
  let svgDepth = 0
  const tagPattern = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let match

  while ((match = tagPattern.exec(source))) {
    parts.push(source.slice(cursor, match.index))
    cursor = tagPattern.lastIndex
    const raw = match[0]
    if (raw.startsWith('<!--')) {
      parts.push(raw)
      continue
    }

    const tag = (match[1] || '').toLowerCase()
    const closing = /^<\//.test(raw)

    if (closing) {
      if (tag === 'svg') svgDepth = Math.max(0, svgDepth - 1)
      const found = stack.map((frame) => frame.tag).lastIndexOf(tag)
      if (found >= 0) stack.length = found
      parts.push(raw)
      continue
    }

    // SVG 内部原样输出，与上游处理范围一致。
    if (svgDepth > 0 || tag === 'svg') {
      if (tag === 'svg' && !/\/\s*>$/.test(raw)) svgDepth += 1
      parts.push(raw)
      continue
    }

    const selfClosing = /\/\s*>$/.test(raw)
    const attrs = readAttributes(match[2] || '')
    const parent = stack.at(-1)
    const style = attrs.style || ''
    const segments = styleSegments(style)

    const hasInlineColor = segments.some((segment) => segment.name === 'color' || segment.name === '-webkit-text-fill-color')
    const hasInlineBackground = segments.some((segment) => BG_COLOR_PROPS.has(segment.name))
    const hasBackgroundImage = segments.some((segment) => /^(?:background|background-image|-webkit-border-image|border-image)$/.test(segment.name) && /url\([^)]*\)/i.test(segment.value))

    const inheritedBg = parent?.bg || DEFAULT_DARK_BG
    const inheritedColor = parent?.color || null
    const inheritedOriginalColor = parent?.originalColor || null
    const inheritedBgImage = parent?.bgImage || false

    // 同一元素内先算背景再算文字：文字必须压在算出来的背景上。
    let workingBg = inheritedBg
    let workingBgTouched = false
    let darkColor = inheritedColor
    let originalColor = inheritedOriginalColor
    const edits = []

    for (const segment of segments) {
      if (!COLOR_PROPS.has(segment.name)) continue

      if (BG_COLOR_PROPS.has(segment.name)) {
        // 带背景图的节点保留原背景图与其上方文本（上游 BGIMAGEATTR 分支）
        if (/url\([^)]*\)/i.test(segment.value)) continue
        // 渐变先混成纯色，深色下按纯色呈现
        const mix = /gradient/i.test(segment.value) ? gradientMix(segment.value) : null
        const result = replaceColorTokens(segment.value, (color) => {
          if ((color.a ?? 1) < DARK_CONSTANTS.IGNORE_ALPHA) return null
          const next = adjustBackground(mix || color)
          workingBg = next
          workingBgTouched = true
          return formatColor(next)
        })
        if (result.changed) edits.push({ segment, value: result.value })
        continue
      }

      if (TEXT_COLOR_PROPS.has(segment.name)) {
        // 背景图上方的文本保留浅色模式原色（上游 BGIMAGEATTR 分支）
        if (hasBackgroundImage || inheritedBgImage) continue
        const baseBg = workingBgTouched ? workingBg : inheritedBg
        const result = replaceColorTokens(segment.value, (color) => {
          if ((color.a ?? 1) < DARK_CONSTANTS.IGNORE_ALPHA) return null
          const next = adjustText(color, baseBg)
          darkColor = next
          originalColor = color
          return formatColor(next)
        })
        if (result.changed) edits.push({ segment, value: result.value })
        continue
      }

      // 字体阴影按背景的算法处理；边框、阴影、轮廓按文字色处理，保证压在背景上读得出。
      const isShadow = TEXT_SHADOW_PROPS.has(segment.name)
      const result = replaceColorTokens(segment.value, (color) => {
        if ((color.a ?? 1) < DARK_CONSTANTS.IGNORE_ALPHA) return null
        const next = isShadow ? adjustBackground(color) : adjustText(color, workingBgTouched ? workingBg : inheritedBg)
        return formatColor(next)
      })
      if (result.changed) edits.push({ segment, value: result.value })
    }

    const darkBg = workingBgTouched ? workingBg : inheritedBg

    // 有背景而无文字色的节点补一个按自家背景计算的文字色，保证可读。
    let appendedColor = null
    if (hasInlineBackground && !hasInlineColor && !hasBackgroundImage) {
      const base = inheritedOriginalColor || DEFAULT_LIGHT_TEXT
      appendedColor = adjustText(base, darkBg)
      darkColor = appendedColor
    }

    let nextRaw = raw
    if (edits.length || appendedColor) {
      let rewritten = style
      // 从后往前替换，前面声明的偏移量保持有效。
      for (const edit of [...edits].sort((a, b) => b.segment.valueStart - a.segment.valueStart)) {
        rewritten = rewritten.slice(0, edit.segment.valueStart) + ` ${edit.value}` + rewritten.slice(edit.segment.end)
      }
      if (appendedColor) {
        const trimmed = rewritten.replace(/[\s;]+$/, '')
        rewritten = `${trimmed}${trimmed ? ';' : ''}color: ${formatColor(appendedColor)}`
      }
      nextRaw = raw.replace(/(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i, (whole, lead, quoted) => {
        const quote = quoted.trim().startsWith("'") ? "'" : '"'
        return `${lead}${quote}${rewritten}${quote}`
      })
    }
    parts.push(nextRaw)

    if (!selfClosing) {
      stack.push({
        tag,
        bg: darkBg,
        color: darkColor,
        originalColor,
        bgImage: inheritedBgImage || hasBackgroundImage,
      })
    }
  }

  parts.push(source.slice(cursor))
  return parts.join('')
}

/**
 * 把一段样式表（预览用的 highlight.js 主题、脚注样式等）映射到深色。
 * 代码块颜色位于 srcdoc 的 `<style>`，由本函数单独映射。
 * 变换范围限于颜色声明，选择器、字体、间距原样保留。
 */
export function darkenCss(css) {
  const source = String(css || '')
  return source.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector, body) => {
    if (/^\s*@/.test(selector)) return whole
    const segments = styleSegments(body)
    const declaredBg = segments.find((segment) => segment.name === 'background-color' || segment.name === 'background')
    const baseBg = declaredBg && !/url\(/i.test(declaredBg.value)
      ? (gradientMix(declaredBg.value) || parseColorToken(declaredBg.value))
      : null
    const darkBg = baseBg ? adjustBackground(baseBg) : DEFAULT_DARK_BG
    const edits = []
    for (const segment of segments) {
      if (!COLOR_PROPS.has(segment.name)) continue
      if (segment === declaredBg && /url\(/i.test(segment.value)) continue
      const result = replaceColorTokens(segment.value, (color) => {
        if ((color.a ?? 1) < DARK_CONSTANTS.IGNORE_ALPHA) return null
        const next = BG_COLOR_PROPS.has(segment.name) ? adjustBackground(color) : adjustText(color, darkBg)
        return formatColor(next)
      })
      if (result.changed) edits.push({ segment, value: result.value })
    }
    if (!edits.length) return whole
    let rewritten = body
    for (const edit of edits.sort((a, b) => b.segment.valueStart - a.segment.valueStart)) {
      rewritten = rewritten.slice(0, edit.segment.valueStart) + ` ${edit.value}` + rewritten.slice(edit.segment.end)
    }
    return `${selector}{${rewritten}}`
  })
}
