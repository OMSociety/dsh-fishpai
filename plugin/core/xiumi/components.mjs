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

export function heading({ text = '', level = 1 }, spec = DEFAULT_SPEC) {
  const tag = /^h[1-6]$/.test(level) ? level : `h${Math.min(6, Math.max(1, Number(level) || 1))}`
  return `<${tag} style="margin:0 0 16px;color:${spec.title_color};font-size:${spec.title_size}px;line-height:1.35;text-align:${spec.title_align};font-weight:700;">${safeInline(text)}</${tag}>`
}

export function paragraph({ html = '', text }, spec = DEFAULT_SPEC) {
  const content = text === undefined ? safeInline(html) : escapeHtml(text)
  return `<p style="margin:0 0 14px;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${content}</p>`
}

export function card({ html = '', title = '' }, spec = DEFAULT_SPEC) {
  const headingHtml = title ? `<p style="margin:0 0 8px;color:${spec.accent};font-size:${spec.body_size}px;font-weight:700;">${escapeHtml(title)}</p>` : ''
  return section(`margin:0 0 16px;padding:${spec.card_padding}px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-sizing:border-box;`, headingHtml + safeInline(html))
}

export function twoColumns({ left = '', right = '' }, spec = DEFAULT_SPEC) {
  const cell = `width:50%;vertical-align:top;box-sizing:border-box;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};`
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;table-layout:fixed;" role="presentation"><tbody><tr><td style="${cell}padding-right:8px;">${safeInline(left)}</td><td style="${cell}padding-left:8px;">${safeInline(right)}</td></tr></tbody></table>`
}

export function quote({ html = '', text }, spec = DEFAULT_SPEC) {
  const content = text === undefined ? safeInline(html) : escapeHtml(text)
  return section(`margin:0 0 16px;padding:12px 16px;border-left:4px solid ${spec.accent};background-color:${spec.card_bg};color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};`, content)
}

export function divider(_props = {}, spec = DEFAULT_SPEC) {
  return `<hr style="margin:24px 0;border:0;border-top:1px solid ${spec.accent};" />`
}

export function svgGradientBanner({ text = '' }, spec = DEFAULT_SPEC) {
  const label = escapeHtml(text)
  // 微信会剥离 SVG 的 id 属性，url(#…) 渐变引用随之失效；
  // 这里用纯色 rect（accent）兜底，不依赖 <defs>/<linearGradient> 的 id 引用。
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 120" role="img" aria-label="${label}"><rect width="600" height="120" rx="${spec.card_radius}" fill="${spec.accent}"/><text x="300" y="68" text-anchor="middle" fill="#ffffff" font-size="${spec.title_size}" font-weight="700">${label}</text></svg>`
}

export function svgWaveDivider(_props = {}, spec = DEFAULT_SPEC) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 48" aria-hidden="true"><path d="M0 24 C100 0 200 48 300 24 S500 0 600 24" fill="none" stroke="${spec.accent}" stroke-width="3"/><path d="M0 34 C100 10 200 58 300 34 S500 10 600 34" fill="none" stroke="${spec.accent2}" stroke-width="2"/></svg>`
}

export function svgNumberIcons({ items = [] }, spec = DEFAULT_SPEC) {
  return items.map((item, index) => {
    const text = typeof item === 'string' ? item : item.text || ''
    return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="第 ${index + 1} 步"><circle cx="18" cy="18" r="17" fill="${spec.accent}"/><text x="18" y="24" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="700">${index + 1}</text></svg><span style="font-size:${spec.body_size}px;color:${spec.body_color};">${escapeHtml(text)}</span>`
  }).join('')
}

export function wcHeading(props, spec) {
  return heading(props, spec)
}

export function wcParagraph(props, spec) {
  return paragraph(props, spec)
}

export function wcCard(props, spec) {
  return card(props, spec)
}

export function wcGradientBanner({ text = '' }, spec = DEFAULT_SPEC) {
  return section(`margin:0 0 16px;padding:24px 16px;background:linear-gradient(135deg, ${spec.accent} 0%, ${spec.accent2} 100%);border-radius:${spec.card_radius}px;color:#ffffff;text-align:center;font-size:${spec.title_size}px;font-weight:700;line-height:1.35;`, escapeHtml(text))
}

export function wcWaveDivider(_props = {}, spec = DEFAULT_SPEC) {
  return section(`margin:20px 0;border-top:2px solid ${spec.accent};font-size:0;line-height:0;`, '')
}

export function wcNumberSteps({ items = [] }, spec = DEFAULT_SPEC) {
  return section('margin:0 0 16px;', items.map((item, index) => {
    const text = typeof item === 'string' ? item : item.text || ''
    return section('display:flex;align-items:flex-start;margin:0 0 12px;', `<span style="flex:0 0 28px;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;background-color:${spec.accent};color:#ffffff;font-size:14px;font-weight:700;margin-right:10px;">${index + 1}</span><span style="flex:1;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(text)}</span>`)
  }).join(''))
}

export function wcQuote(props, spec) {
  return quote(props, spec)
}

export function wcTwoColumns(props, spec) {
  return twoColumns(props, spec)
}

export const HTML_COMPONENTS = Object.freeze({ heading, paragraph, card, two_columns: twoColumns, quote, divider })
export const SVG_COMPONENTS = Object.freeze({ svg_gradient_banner: svgGradientBanner, svg_wave_divider: svgWaveDivider, svg_number_icons: svgNumberIcons })
export const WECHAT_COMPONENTS = Object.freeze({ wc_heading: wcHeading, wc_paragraph: wcParagraph, wc_card: wcCard, wc_gradient_banner: wcGradientBanner, wc_wave_divider: wcWaveDivider, wc_number_steps: wcNumberSteps, wc_quote: wcQuote, wc_two_columns: wcTwoColumns })
export const _WECHAT_ALIAS = Object.freeze({ heading: 'wc_heading', paragraph: 'wc_paragraph', card: 'wc_card', two_columns: 'wc_two_columns', quote: 'wc_quote', divider: 'wc_wave_divider', gradient_banner: 'wc_gradient_banner', wave_divider: 'wc_wave_divider', number_steps: 'wc_number_steps', svg_gradient_banner: 'wc_gradient_banner', svg_wave_divider: 'wc_wave_divider', svg_number_icons: 'wc_number_steps', ...Object.fromEntries(Object.keys(WECHAT_COMPONENTS).map((key) => [key, key])) })
