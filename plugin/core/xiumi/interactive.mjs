/**
 * 秀米「专业」交互组件：SVG SMIL 动画层 + 内联内容层的混合产物。
 *
 * 微信公众号正文禁用了 CSS `@keyframes` / `transition` / `animation-delay`，
 * 但为交互排版留了一条窄缝——SVG 的 SMIL 动画：
 *   `<animate>` / `<animateTransform>` / `<set>` / `<animateMotion>`，
 *   配 `begin="click"` / `begin="touchstart"` 做点击/触摸触发。
 * 组件遵循微信粘贴约束（见 wechat-lint.mjs）：
 *   - SVG 使用内联表现属性与纯 SMIL；
 *   - 内容层文字/图片走内联样式 HTML，动画层走纯 SVG，两层分离；
 *   - 声明式交互由 `begin` 触发，不依赖脚本或外部样式。
 * 微信草稿与移动端行为需在目标账号上实测。
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

function svgTextLabel(value, fallback, max = 20) {
  const full = String(value || '').trim().replace(/\s+/g, ' ') || fallback
  const chars = [...full]
  return { full, visible: chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : full }
}

/** 内容层：把多行 markdown-ish 文本包成内联段落（不支持嵌套指令，由 index 预渲染）。 */
function contentBlock(html, spec) {
  return `<section style="color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(html)}</section>`
}

/** 容器已有底部留白时，去掉最后一个块级元素的重复段后距。 */
function trimTrailingBlockSpacing(html) {
  const source = String(html ?? '')
  const matches = [...source.matchAll(/<(p|h[1-6]|section|blockquote|ul|ol|table|li)\b[^>]*>/gi)]
  if (matches.length === 0) return source
  const last = matches[matches.length - 1]
  const opening = last[0].replace(/\bmargin:\s*([^;"']+?)\s*(?=["';])/g, (declaration, value) => {
    const parts = value.trim().split(/\s+/)
    // 支持 3 值短写（top side-bottom）与 4 值短写（top right bottom left），保留原有写法。
    if (parts.length === 3) {
      const bottom = Math.max(0, parseFloat(parts[2]) - 14)
      return `margin:${parts[0]} ${parts[1]} ${bottom}px`
    }
    if (parts.length === 4) {
      const bottom = Math.max(0, parseFloat(parts[2]) - 14)
      return `margin:${parts[0]} ${parts[1]} ${bottom}px ${parts[3]}`
    }
    return declaration
  })
  return `${source.slice(0, last.index)}${opening}${source.slice(last.index + last[0].length)}`
}

/* 零高正文先于触发 SVG；外层按 SVG 高度裁切，点击后由 height 动画撑开文档流。
 * 正文使用普通内联 HTML，动画不依赖 id、脚本或跨元素引用。
 */
function expandable({ coverText, fallback, body, coverHeight }, spec) {
  const label = svgTextLabel(coverText, fallback)
  const expandedBody = trimTrailingBlockSpacing(body)
  const text = String(expandedBody).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  // 以 320px 视口估算：页面两侧留白 40px，正文容器两侧 padding 32px。
  // 微信窄屏的真实换行比桌面预览更密集，宁可为宽屏多留一行，也不能裁掉最后一行。
  const charsPerLine = Math.max(12, Math.floor(248 / (spec.body_size + spec.body_spacing)))
  const lines = Math.max(1, Math.ceil([...text].length / charsPerLine))
  const blocks = (String(body).match(/<(?:p|h[1-6]|section|table)\b/g) || []).length
  // 最后一个块已去掉重复段后距，容器上下留白共 30px。
  const contentHeight = Math.min(1200, Math.max(86, Math.ceil(lines * spec.body_size * spec.line_height + Math.max(0, blocks - 1) * 14 + 30)))
  // 小数行高与边框在移动端会产生亚像素取整，额外保留 1px 防止裁到底边。
  const totalHeight = coverHeight + contentHeight + 1
  return section('margin:0 0 20px;overflow:hidden;line-height:0;',
    `<section style="height:0;min-height:0;overflow:visible;display:flow-root;">`
    + `<section style="margin-top:${coverHeight}px;padding:16px 16px 14px;box-sizing:border-box;background-color:${spec.card_bg};border-top:1px solid ${spec.page_bg};border-radius:${spec.card_radius}px;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(expandedBody)}</section>`
    + `</section>`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${coverHeight}" style="display:block;cursor:pointer;" role="button" aria-label="${escapeHtml(label.full)}">`
    + `<rect x="0" y="0" width="100%" height="${coverHeight}" rx="${spec.card_radius}" fill="${spec.card_bg}"/>`
    + `<text x="16" y="${Math.round(coverHeight / 2 + 5)}" fill="${spec.title_color}" font-size="15" font-weight="600">${escapeHtml(label.visible)}</text>`
    + `<text x="96%" y="${Math.round(coverHeight / 2 + 8)}" text-anchor="end" fill="${spec.accent}" font-size="24" font-weight="400">＋</text>`
    + `<animate attributeName="height" from="${coverHeight}" to="${totalHeight}" dur="0.4s" begin="click" fill="freeze"/>`
    + `</svg>`
  )
}

export function wcExpand({ coverText = '', body = '' }, spec = DEFAULT_SPEC) {
  return expandable({ coverText, fallback: '点击展开', body, coverHeight: 56 }, spec)
}

export function wcSwap({ coverText = '', body = '' }, spec = DEFAULT_SPEC) {
  return expandable({ coverText, fallback: '点击查看更多', body, coverHeight: 88 }, spec)
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
      : `<rect x="${i * width}" y="0" width="${width}" height="${height}" fill="${spec.card_bg}"/><text x="${i * width + width / 2}" y="${height / 2}" text-anchor="middle" fill="${spec.body_color}" font-size="18" font-weight="500">待补图片 ${i + 1}</text>`
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
    + section(`margin-top:8px;padding:2px 0 2px 14px;border-left:2px solid ${spec.accent};box-sizing:border-box;`, contentBlock(body, spec))
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
    return `<text x="${width}" y="${y}" fill="${i % 2 ? spec.accent2 : spec.accent}" font-size="${spec.body_size}" font-weight="500">${escapeHtml(text)}`
      + `<animateTransform attributeName="transform" type="translate" from="0 0" to="-${width + 200} 0" dur="${dur}s" begin="0s" repeatCount="indefinite"/>`
      + `</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" style="display:block;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;margin:0 0 16px;" role="img" aria-label="文字弹幕">${rows}</svg>`
}

/* ── 6. 进度条（progress）────────────────────────────────────────
 * 纯静态装饰（无交互）：一条填充到指定百分比的条。
 * 进度条使用内联 HTML 呈现轨道、标签与数值。
 */
export function wcProgress({ percent = 50, label = '' }, spec = DEFAULT_SPEC) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0))
  return section('margin:0 0 18px;',
    `<section style="display:flex;justify-content:space-between;margin:0 0 6px;color:${spec.body_color};font-size:13px;line-height:1.5;"><span>${escapeHtml(label || '当前进度')}</span><span style="color:${spec.accent};font-weight:600;">${value}%</span></section>`
    + `<section style="background-color:${spec.card_bg};border-radius:3px;height:6px;overflow:hidden;box-sizing:border-box;"><section style="width:${value}%;height:6px;background-color:${spec.accent};border-radius:3px;"></section></section>`
  )
}

/* ── 7. 时间线（timeline）────────────────────────────────────────
 * 竖向一串节点：左圆点 + 竖线 + 右内容。纯内联 HTML 装饰。
 */
export function wcTimeline({ items = [] }, spec = DEFAULT_SPEC) {
  const rows = items.map((item) => {
    const text = typeof item === 'string' ? item : item.text || ''
    return section('display:flex;align-items:flex-start;margin:0 0 14px;',
      `<span style="flex:0 0 8px;width:8px;height:8px;margin-top:9px;border-radius:50%;background-color:${spec.accent};"></span>`
      + `<span style="flex:1;margin-left:10px;padding-left:12px;border-left:1px solid ${spec.card_bg};color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(text)}</span>`
    )
  }).join('')
  return section('margin:0 0 16px;', rows)
}

/* ── 8. 对比卡（compare）─────────────────────────────────────────
 * 左右两栏对照（用 table 布局，微信对 flex 支持不稳）。
 */
export function wcCompare({ left = '', right = '', leftTitle = '', rightTitle = '' }, spec = DEFAULT_SPEC) {
  const head = (text) => `<p style="margin:0 0 8px;color:${spec.title_color};font-size:${spec.body_size}px;font-weight:700;">${escapeHtml(text)}</p>`
  const cell = `width:50%;vertical-align:top;box-sizing:border-box;padding:${spec.card_padding}px;font-size:${spec.body_size}px;line-height:${spec.line_height};overflow-wrap:break-word;`
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 18px;table-layout:fixed;" role="presentation"><tbody><tr>`
    + `<td style="${cell}border-right:1px solid ${spec.card_bg};color:${spec.body_color};">${leftTitle ? head(leftTitle) : ''}${contentBlock(left, spec)}</td>`
    + `<td style="${cell}color:${spec.body_color};">${rightTitle ? head(rightTitle) : ''}${contentBlock(right, spec)}</td>`
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
