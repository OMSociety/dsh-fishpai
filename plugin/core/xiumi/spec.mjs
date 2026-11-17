export const DEFAULT_SPEC = Object.freeze({
  title_color: '#d33',
  title_size: 22,
  title_align: 'center',
  body_color: '#333',
  body_size: 15,
  line_height: 1.8,
  card_bg: '#f7f7f7',
  card_radius: 12,
  card_padding: 16,
  accent: '#667eea',
  accent2: '#764ba2',
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
