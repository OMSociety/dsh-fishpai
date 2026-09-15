/**
 * 主题能力标注：从主题定义本身推导"这个主题能做什么、粘进微信靠不靠谱"。
 *
 * 为什么要有这一层：工具栏里有些控件只对部分主题有效——
 *   - **主题色**靠替换主题样式里的 `{{PRIMARY}}` / `{{PRIMARY_BG}}` 生效，
 *     实测只有 `default`（默认公众号）用了它，其余主题点了也不会变。
 *   - **渐变文字**（`background-clip: text` + 透明字色）依赖微信可能重写的属性，
 *     作为公众号正文有风险。
 *
 * 所以这里把判断**写进代码**、由主题定义推导，而不是在 UI 里维护一份主题名单：
 * 上游哪天改了主题，标注自动跟着变（相关单测会红，提醒复核）。
 *
 * 纯函数、零依赖，可单独单测。
 */

/** 主题色占位符：`{{PRIMARY}}` 与它的浅色变体都算用了主题色。 */
const ACCENT_RE = /\{\{PRIMARY(?:_BG)?\}\}/

/** 渐变文字：把背景裁剪到文字上，字色本身就是透明的。 */
const TEXT_CLIP_RE = /(?:-webkit-)?background-clip:\s*text/i

/** 深色底判定阈值（sRGB 相对亮度）。 */
const DARK_LUMINANCE = 0.4

function stylesText(theme) {
  const styles = theme && typeof theme === 'object' ? theme.styles : null
  if (!styles || typeof styles !== 'object') return ''
  return Object.values(styles)
    .filter((v) => typeof v === 'string')
    .join(';')
}

function parseColor(value) {
  const raw = String(value || '').trim()
  let m = /^#([0-9a-f]{3})$/i.exec(raw)
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16))
    return { r, g, b }
  }
  m = /^#([0-9a-f]{6})$/i.exec(raw)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  // rgb()/rgba()：只取前三个通道；解析不了就返回 null（失效方向选"不标记"）
  m = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/i.exec(raw)
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  return null
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** 从 wrapper 样式里取背景色；`background:` 与 `background-color:` 都认。 */
export function wrapperBackground(theme) {
  const styles = theme && typeof theme === 'object' ? theme.styles : null
  const wrapper = styles && typeof styles.wrapper === 'string' ? styles.wrapper : ''
  const m = /(?:^|;)\s*background(?:-color)?:\s*([^;]+)/i.exec(wrapper)
  return m ? parseColor(m[1]) : null
}

/**
 * 标注一个主题。
 *
 * @param {object} theme `themes[key]` 的定义（`{ name, emoji, desc, styles }`）
 * @returns {{usesAccent: boolean, gradientText: boolean, darkWrapper: boolean, wechatSafe: boolean}}
 */
export function classifyTheme(theme) {
  const text = stylesText(theme)
  const usesAccent = ACCENT_RE.test(text)
  const gradientText = TEXT_CLIP_RE.test(text)
  const bg = wrapperBackground(theme)
  const darkWrapper = bg ? luminance(bg) < DARK_LUMINANCE : false
  return { usesAccent, gradientText, darkWrapper, wechatSafe: !gradientText && !darkWrapper }
}
