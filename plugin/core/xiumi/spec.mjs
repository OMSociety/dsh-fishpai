export const DEFAULT_SPEC = Object.freeze({
  title_color: '#1f2329',
  title_size: 24,
  title_align: 'left',
  body_color: '#3f4650',
  body_size: 16,
  line_height: 1.8,
  card_bg: '#f5f6f8',
  card_radius: 8,
  card_padding: 14,
  accent: '#3f63d7',
  accent2: '#5b7cdb',
})

const COLOR_KEYS = new Set(['title_color', 'body_color', 'card_bg', 'accent', 'accent2'])
const NUMBER_KEYS = new Set(['title_size', 'body_size', 'line_height', 'card_radius', 'card_padding'])

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
    } else if (NUMBER_KEYS.has(key)) {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(number) || number <= 0 || number > 200) throw new Error(`${key} 必须是 0–200 之间的正数`)
      spec[key] = number
    } else if (key === 'title_align') {
      if (!['left', 'center', 'right'].includes(value)) throw new Error('title_align 只支持 left/center/right')
      spec[key] = value
    }
  }
  return spec
}
