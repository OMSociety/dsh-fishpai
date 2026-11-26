/**
 * 主题能力标注：从主题定义本身推导"这个主题能做什么"。
 *
 * 工具栏的主题色控件只对部分主题有效：主题色靠替换主题样式里的
 * `{{PRIMARY}}` / `{{PRIMARY_BG}}` 生效，实测只有 `default`（默认公众号）用了它。
 * 判断由主题定义推导，不在 UI 里维护主题名单；主题数据变化时相关单测会提醒复核。
 *
 * 纯函数、零依赖，可单独单测。
 */

/** 主题色占位符：`{{PRIMARY}}` 与它的浅色变体都算用了主题色。 */
const ACCENT_RE = /\{\{PRIMARY(?:_BG)?\}\}/

function stylesText(theme) {
  const styles = theme && typeof theme === 'object' ? theme.styles : null
  if (!styles || typeof styles !== 'object') return ''
  return Object.values(styles)
    .filter((v) => typeof v === 'string')
    .join(';')
}

/**
 * 标注一个主题。
 *
 * @param {object} theme `themes[key]` 的定义（`{ name, emoji, desc, styles }`）
 * @returns {{usesAccent: boolean}}
 */
export function classifyTheme(theme) {
  return { usesAccent: ACCENT_RE.test(stylesText(theme)) }
}
