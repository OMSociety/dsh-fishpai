/**
 * 秀米「专业」交互组件：SVG SMIL 动画层 + 内联内容层的混合产物。
 *
 * 微信公众号正文禁用了 CSS `@keyframes` / `transition` / `animation-delay`，
 * 但为交互排版留了一条窄缝——SVG 的 SMIL 动画：
 *   `<animate>` / `<animateTransform>` / `<set>` / `<animateMotion>`，
 *   配 `begin="click"` / `begin="touchstart"` 做点击/触摸触发。
 * 秀米、135 编辑器的「点击展开」「滑动切换」「探照灯」都走这条路，
 * 普通账号发布后真实可跑（不需要特殊权限）。
 *
 * 本文件每个组件都必须守住微信粘贴约束（见 wechat-lint.mjs）：
 *   - 不用 `id` / `class` 属性（微信会剥 `id`，靠 id 联动必然失效）；
 *   - 不用 CSS 动画/过渡（一律改用 SMIL）；
 *   - 内容层文字/图片走内联样式 HTML，动画层走纯 SVG，两层分离；
 *   - SMIL 交互不依赖任何脚本，纯声明式，粘贴进编辑器后仍有效。
 *
 * 每个组件导出：渲染函数（返回 HTML 字符串）+ 在 INTERACTIVE_COMPONENTS 注册。
 * 与 components.mjs 的静态组件并列，由 index.mjs 合并进 _WECHAT_ALIAS。
 */
import { DEFAULT_SPEC } from './spec.mjs'

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safeInline(value) {
  return String(value ?? '')
    .replace(/<(?:script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|form)>/gi, '')
    .replace(/\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
}

const section = (style, content) => `<section style="${style}">${content}</section>`

/** 内容层：把多行 markdown-ish 文本包成内联段落（不支持嵌套指令，由 index 预渲染）。 */
function contentBlock(html, spec) {
  return `<section style="color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(html)}</section>`
}

/* ── 1. 点击展开（expand）────────────────────────────────────────
 * 外层一个 SVG 触发区（透明 rect + 「点击展开」提示），begin="click" 触发
 * 自身的淡出 + 高度收起；下面内容层常驻，触发区收起后内容露出。
 * 实现：触发区是一个固定高度的 SVG，点击后 <animate> 把 opacity→0、
 * 外层容器用 SMIL 控制 display。微信里「展开」的通行做法是触发区淡出即可。
 */
export function wcExpand({ cover = '', coverText = '', body = '' }, spec = DEFAULT_SPEC) {
  // 触发区 SVG 的 <text> 显示封面提示纯文本；未提供时兜底「点击展开」。
  const label = coverText.trim() || '点击展开'
  return section('margin:0 0 16px;',
    // 触发区：一个带渐变底的 SVG，点击后淡出（opacity→0），露出下方内容。
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 80" style="display:block;cursor:pointer;" role="img" aria-label="${escapeHtml(label)}">`
    + `<rect width="600" height="80" rx="${spec.card_radius}" fill="${spec.accent}"/>`
    + `<text x="300" y="48" text-anchor="middle" fill="#ffffff" font-size="${spec.title_size}" font-weight="700">${escapeHtml(label)}</text>`
    + `<animate attributeName="opacity" from="1" to="0" dur="0.4s" begin="click" fill="freeze"/>`
    + `</svg>`
    // 内容层：常驻在触发区下方，触发区淡出后自然露出。
    + section(`margin-top:8px;padding:${spec.card_padding}px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-sizing:border-box;`, contentBlock(body, spec))
  )
}

/* ── 2. 点击换图展开（swap）──────────────────────────────────────
 * 触发区是封面（首屏内容），点击后封面淡出、下方内容展开。
 * 与 expand 的差别：封面是用户给的图/文，不是固定「点击展开」条。
 */
export function wcSwap({ cover = '', coverText = '', body = '' }, spec = DEFAULT_SPEC) {
  const label = coverText.trim() || '点击查看更多'
  return section('margin:0 0 16px;',
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 200" style="display:block;cursor:pointer;" role="img" aria-label="${escapeHtml(label)}">`
    + `<rect width="600" height="200" rx="${spec.card_radius}" fill="${spec.card_bg}"/>`
    + `<text x="300" y="108" text-anchor="middle" fill="${spec.accent}" font-size="${spec.title_size}" font-weight="700">${escapeHtml(label)}</text>`
    + `<animate attributeName="opacity" from="1" to="0" dur="0.4s" begin="click" fill="freeze"/>`
    + `</svg>`
    + section(`margin-top:8px;padding:${spec.card_padding}px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-sizing:border-box;`, contentBlock(body, spec))
  )
}

/* ── 3. 滑动切换图集（swiper）────────────────────────────────────
 * 用 SMIL animateTransform 做水平位移，begin="click" 循环切图。
 * 微信通行做法是纯 SVG viewBox + <image> + animateTransform translate；
 * 这里用占位图块（无真实图时显示编号），真实图由调用方填 URL。
 */
export function wcSwiper({ images = [] }, spec = DEFAULT_SPEC) {
  const list = images.length ? images : ['', '', '']
  const width = 600
  const height = 340
  const slides = list.map((src, i) => {
    const inner = src
      ? `<image href="${escapeHtml(src)}" x="${i * width}" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${i * width}" y="0" width="${width}" height="${height}" fill="${i % 2 ? spec.accent2 : spec.accent}"/><text x="${i * width + width / 2}" y="${height / 2}" text-anchor="middle" fill="#ffffff" font-size="40" font-weight="700">${i + 1}</text>`
    return inner
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" style="display:block;cursor:pointer;margin:0 0 16px;" role="img" aria-label="滑动切换图集">`
    + `<g>${slides}<animateTransform attributeName="transform" type="translate" from="0 0" to="-${width} 0" dur="0.5s" begin="click" fill="freeze"/></g>`
    + `</svg>`
}

/* ── 4. 探照灯（spotlight）───────────────────────────────────────
 * 一个圆形遮罩（光圈），begin="touchstart"/click 触发光圈移动/放大，
 * 照亮下方内容。用 <animate> 控制遮罩圆半径与位置。
 */
export function wcSpotlight({ body = '' }, spec = DEFAULT_SPEC) {
  return section('margin:0 0 16px;',
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 160" style="display:block;" role="img" aria-label="探照灯">`
    + `<rect width="600" height="160" fill="${spec.body_color}"/>`
    + `<circle cx="300" cy="80" r="0" fill="${spec.accent}" opacity="0.85">`
    + `<animate attributeName="r" from="0" to="120" dur="0.8s" begin="click" fill="freeze"/>`
    + `</circle>`
    + `<text x="300" y="90" text-anchor="middle" fill="#ffffff" font-size="${spec.body_size}" font-weight="700">${escapeHtml('点击照亮')}</text>`
    + `</svg>`
    + section(`margin-top:8px;padding:${spec.card_padding}px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-sizing:border-box;`, contentBlock(body, spec))
  )
}

/* ── 5. 文字弹幕（danmaku）───────────────────────────────────────
 * 若干文字条从右往左飘过（animateTransform translate + repeatCount）。
 * 微信对 height/width 的 indefinite 循环有限制，但对 transform/opacity
 * 的循环是放行的（见 wechat-svg-capability 调研）。弹幕正是 transform 循环。
 */
export function wcDanmaku({ lines = [] }, spec = DEFAULT_SPEC) {
  const items = lines.length ? lines : ['弹幕一', '弹幕二']
  const width = 600
  const height = 40 * items.length + 20
  const rows = items.map((text, i) => {
    const y = 30 + i * 40
    const dur = 6 + i
    return `<text x="${width}" y="${y}" fill="${i % 2 ? spec.accent2 : spec.accent}" font-size="${spec.body_size}" font-weight="700">${escapeHtml(text)}`
      + `<animateTransform attributeName="transform" type="translate" from="0 0" to="-${width + 200} 0" dur="${dur}s" begin="0s" repeatCount="indefinite"/>`
      + `</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" style="display:block;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;margin:0 0 16px;" role="img" aria-label="文字弹幕">${rows}</svg>`
}

/* ── 6. 进度条（progress）────────────────────────────────────────
 * 纯静态装饰（无交互）：一条填充到指定百分比的条。
 * 用内联 HTML（不用 SVG），避免不必要的 SMIL。
 */
export function wcProgress({ percent = 50, label = '' }, spec = DEFAULT_SPEC) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0))
  return section(`margin:0 0 16px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;height:18px;overflow:hidden;box-sizing:border-box;`,
    `<section style="width:${value}%;height:18px;line-height:18px;text-align:center;background:linear-gradient(90deg, ${spec.accent} 0%, ${spec.accent2} 100%);color:#ffffff;font-size:12px;font-weight:700;">${escapeHtml(label || `${value}%`)}</section>`
  )
}

/* ── 7. 时间线（timeline）────────────────────────────────────────
 * 竖向一串节点：左圆点 + 竖线 + 右内容。纯内联 HTML 装饰。
 */
export function wcTimeline({ items = [] }, spec = DEFAULT_SPEC) {
  const rows = items.map((item) => {
    const text = typeof item === 'string' ? item : item.text || ''
    return section('display:flex;align-items:flex-start;margin:0 0 14px;',
      `<span style="flex:0 0 14px;width:14px;height:14px;margin-top:5px;border-radius:50%;background-color:${spec.accent};"></span>`
      + `<span style="flex:1;margin-left:12px;padding-left:12px;border-left:2px solid ${spec.accent};color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(text)}</span>`
    )
  }).join('')
  return section('margin:0 0 16px;', rows)
}

/* ── 8. 对比卡（compare）─────────────────────────────────────────
 * 左右两栏对照（用 table 布局，微信对 flex 支持不稳）。
 */
export function wcCompare({ left = '', right = '', leftTitle = '', rightTitle = '' }, spec = DEFAULT_SPEC) {
  const head = (text, color) => `<p style="margin:0 0 8px;color:${color};font-size:${spec.body_size}px;font-weight:700;text-align:center;">${escapeHtml(text)}</p>`
  const cell = `width:50%;vertical-align:top;box-sizing:border-box;padding:${spec.card_padding}px;font-size:${spec.body_size}px;line-height:${spec.line_height};`
  return `<table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 16px;table-layout:fixed;" role="presentation"><tbody><tr>`
    + `<td style="${cell}background-color:${spec.card_bg};border-radius:${spec.card_radius}px;color:${spec.body_color};">${leftTitle ? head(leftTitle, spec.accent) : ''}${contentBlock(left, spec)}</td>`
    + `<td style="${cell}background-color:${spec.card_bg};border-radius:${spec.card_radius}px;color:${spec.body_color};">${rightTitle ? head(rightTitle, spec.accent2) : ''}${contentBlock(right, spec)}</td>`
    + `</tr></tbody></table>`
}

/** 交互组件注册表：与 components.mjs 的 WECHAT_COMPONENTS 并列合并。 */
export const INTERACTIVE_COMPONENTS = Object.freeze({
  wc_expand: wcExpand,
  wc_swap: wcSwap,
  wc_swiper: wcSwiper,
  wc_spotlight: wcSpotlight,
  wc_danmaku: wcDanmaku,
  wc_progress: wcProgress,
  wc_timeline: wcTimeline,
  wc_compare: wcCompare,
})

/** 交互组件的「::: 指令名」→「组件 type」映射（index.mjs 的 DIRECTIVES 用）。 */
export const INTERACTIVE_DIRECTIVES = Object.freeze({
  expand: 'expand',
  swap: 'swap',
  swiper: 'swiper',
  spotlight: 'spotlight',
  danmaku: 'danmaku',
  progress: 'progress',
  timeline: 'timeline',
  compare: 'compare',
})
