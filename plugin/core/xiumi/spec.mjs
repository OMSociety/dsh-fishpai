export const DEFAULT_SPEC = Object.freeze({
  title_color: '#1f2329',
  title_size: 24,
  title_align: 'left',
  body_color: '#3f4650',
  body_size: 16,
  body_align: 'left',
  body_spacing: 0.5,
  line_height: 1.8,
  muted_color: '#6b7280',
  page_bg: '#ffffff',
  page_width: 677,
  page_padding_x: 20,
  page_padding_y: 24,
  card_bg: '#f5f6f8',
  card_radius: 8,
  card_padding: 14,
  accent: '#3f63d7',
  accent2: '#5b7cdb',
})

const COLOR_KEYS = new Set(['title_color', 'body_color', 'muted_color', 'page_bg', 'card_bg', 'accent', 'accent2'])
const NUMBER_LIMITS = {
  title_size: [10, 80], body_size: [10, 40], body_spacing: [0, 20], line_height: [1, 4],
  page_width: [280, 1200], page_padding_x: [0, 120], page_padding_y: [0, 120],
  card_radius: [0, 80], card_padding: [0, 100],
}

export function normalizeSpec(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('xiumi_spec 必须是对象')
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULT_SPEC, key)) throw new Error(`未知秀米规格键：${key}`)
  }
  const spec = { ...DEFAULT_SPEC }
  for (const [key, value] of Object.entries(input)) {
    if (COLOR_KEYS.has(key)) {
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(value)) throw new Error(`${key} 必须是 #RGB 或 #RRGGBB 颜色`)
      spec[key] = value.toLowerCase()
    } else if (NUMBER_LIMITS[key]) {
      const number = typeof value === 'number' ? value : Number(value)
      const [min, max] = NUMBER_LIMITS[key]
      if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${key} 必须在 ${min}–${max} 之间`)
      spec[key] = number
    } else if (key === 'title_align') {
      if (!['left', 'center', 'right'].includes(value)) throw new Error('title_align 只支持 left/center/right')
      spec[key] = value
    } else if (key === 'body_align') {
      if (!['left', 'center', 'right', 'justify'].includes(value)) throw new Error('body_align 只支持 left/center/right/justify')
      spec[key] = value
    }
  }
  return spec
}
