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
  const depth = /^h[1-6]$/.test(level) ? Number(level.slice(1)) : Math.min(6, Math.max(1, Number(level) || 1))
  const tag = `h${depth}`
  const fontSize = Math.max(spec.body_size, spec.title_size - (depth - 1) * 3)
  const margin = depth === 1 ? '0 0 22px' : '30px 0 14px'
  const border = depth === 1 ? `padding-bottom:16px;border-bottom:1px solid ${spec.card_bg};` : ''
  return `<${tag} style="margin:${margin};color:${spec.title_color};font-size:${fontSize}px;line-height:1.4;text-align:${spec.title_align};font-weight:700;letter-spacing:0.02em;${border}">${safeInline(text)}</${tag}>`
}

export function paragraph({ html = '', text }, spec = DEFAULT_SPEC) {
  const content = text === undefined ? safeInline(html) : escapeHtml(text)
  return `<p style="margin:0 0 14px;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};text-align:${spec.body_align};">${content}</p>`
}

export function card({ html = '', title = '' }, spec = DEFAULT_SPEC) {
  const headingHtml = title ? `<p style="margin:0 0 8px;color:${spec.accent};font-size:${spec.body_size}px;font-weight:700;">${escapeHtml(title)}</p>` : ''
  return section(`margin:0 0 16px;padding:${spec.card_padding}px;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-sizing:border-box;`, headingHtml + safeInline(html))
}

export function twoColumns({ left = '', right = '' }, spec = DEFAULT_SPEC) {
  const cell = `width:50%;vertical-align:top;box-sizing:border-box;border:0;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};`
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px;table-layout:fixed;" role="presentation"><tbody><tr><td style="${cell}padding-right:8px;">${safeInline(left)}</td><td style="${cell}padding-left:8px;">${safeInline(right)}</td></tr></tbody></table>`
}

export function quote({ html = '', text }, spec = DEFAULT_SPEC) {
  const content = text === undefined ? safeInline(html) : escapeHtml(text)
  return section(`margin:0 0 16px;padding:12px 14px;border-left:1px solid ${spec.accent};background-color:${spec.card_bg};color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};`, content)
}

export function divider(_props = {}, spec = DEFAULT_SPEC) {
  return `<hr style="margin:24px 0;border:0;border-top:1px solid ${spec.accent};" />`
}

export function svgGradientBanner({ text = '' }, spec = DEFAULT_SPEC) {
  const label = escapeHtml(text)
  // 微信会剥离 SVG 的 id 属性；标题横幅用纯色 rect 直接呈现 accent。
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

export function wcBulletList({ items = [] }, spec = DEFAULT_SPEC) {
  const rows = items.map((item) => {
    const text = typeof item === 'string' ? item : item.text || ''
    return `<p style="margin:0 0 10px;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};"><span style="color:${spec.accent};margin-right:8px;">•</span>${safeInline(text)}</p>`
  }).join('')
  return section('margin:0 0 20px;', rows)
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
    return section('display:flex;align-items:flex-start;margin:0 0 12px;', `<span style="flex:0 0 24px;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background-color:${spec.accent};color:#ffffff;font-size:13px;font-weight:700;margin-right:10px;">${index + 1}</span><span style="flex:1;color:${spec.body_color};font-size:${spec.body_size}px;line-height:${spec.line_height};">${safeInline(text)}</span>`)
  }).join(''))
}

export function wcInfoCard({ title = '', html = '' }, spec = DEFAULT_SPEC) {
  const heading = title ? `<p style="margin:0;padding:12px 20px;background-color:${spec.accent};color:#ffffff;font-size:20px;line-height:1.5;font-weight:700;letter-spacing:1px;">${escapeHtml(title)}</p>` : ''
  return section(`width:90%;margin:24px auto;background-color:${spec.card_bg};border-radius:${spec.card_radius}px;box-shadow:0 3px 3px rgba(0,0,0,0.08);overflow:hidden;`, `${heading}<section style="padding:18px 20px 6px;">${html}</section>`)
}

export function wcChapterHeader({ index = '', title = '', subtitle = '' }, spec = DEFAULT_SPEC) {
  const number = index ? `<span style="display:inline-block;vertical-align:middle;padding:3px 12px;background-color:${spec.accent};color:#ffffff;font-size:28px;line-height:1.25;font-weight:800;letter-spacing:1px;">${escapeHtml(index)}</span>` : ''
  const headingText = `<span style="display:inline-block;vertical-align:middle;padding:7px 12px;background-color:${spec.accent2};color:#ffffff;font-size:${Math.max(20, Math.min(spec.title_size, 24))}px;line-height:1.45;font-weight:700;letter-spacing:2px;">${escapeHtml(title)}</span>`
  const sub = subtitle ? `<p style="margin:9px 0 0;color:${spec.muted_color};font-size:13px;line-height:1.6;letter-spacing:1px;text-align:center;white-space:pre-line;">${escapeHtml(subtitle)}</p>` : ''
  return section(`margin:34px 0 22px;text-align:center;`, `<p style="margin:0;font-size:0;line-height:0;">${number}${headingText}</p>${sub}`)
}

export function wcHighlight({ html = '' }, spec = DEFAULT_SPEC) {
  // 反白里的 strong 也继承白色，不能被正文的标题色覆盖。
  const content = String(html).replaceAll(`color:${spec.title_color}`, 'color:#ffffff')
  return section(`margin:18px 0;text-align:${spec.body_align};`, `<span style="display:inline-block;max-width:100%;box-sizing:border-box;padding:6px 12px;background-color:${spec.accent};color:#ffffff;font-size:${spec.body_size}px;line-height:1.5;font-weight:700;letter-spacing:${spec.body_spacing}px;">${content}</span>`)
}

export function wcCredits({ items = [] }, spec = DEFAULT_SPEC) {
  const rows = items.map((item) => {
    const label = escapeHtml(item.label || '')
    const value = escapeHtml(item.value || '')
    return `<p style="margin:0;color:${spec.muted_color};font-size:13px;line-height:1.9;letter-spacing:0.5px;text-align:center;"><strong style="color:${spec.title_color};font-weight:700;">${label}</strong>${label && value ? '　' : ''}${value}</p>`
  }).join('')
  return section(`margin:34px 0 0;padding-top:18px;border-top:1px solid ${spec.card_bg};`, rows)
}

export function wcQuote(props, spec) {
  return quote(props, spec)
}

export function wcTwoColumns(props, spec) {
  return twoColumns(props, spec)
}

export function wcRaw({ html = '' }) {
  const source = String(html ?? '')
  if (/<\s*\/?\s*(?:script|style|iframe|object|embed|link|meta|base|form)\b/i.test(source)) throw new Error('raw 不允许脚本、样式表、表单或嵌入文档标签')
  if (/\s+on[a-z-]+\s*=|\s+srcdoc\s*=/i.test(source)) throw new Error('raw 不允许事件处理器或 srcdoc')
  if (/(?:href|src|xlink:href|action|formaction|poster)\s*=\s*(?:"|'|)?\s*(?:javascript:|data:text\/html)/i.test(source)) throw new Error('raw 不允许可执行 URL')
  return source
}

export function wcFullBleed({ html = '' }, spec = DEFAULT_SPEC) {
  const gutter = Number(spec.page_padding_x) || 0
  // 微信会给正文容器补 max-width:100%；显式 none 才能让负外边距真正扩展到页面边缘。
  return section(`max-width:none;margin:0 -${gutter}px;`, wcRaw({ html }))
}

export const HTML_COMPONENTS = Object.freeze({ heading, paragraph, card, two_columns: twoColumns, quote, divider })
export const SVG_COMPONENTS = Object.freeze({ svg_gradient_banner: svgGradientBanner, svg_wave_divider: svgWaveDivider, svg_number_icons: svgNumberIcons })
export const WECHAT_COMPONENTS = Object.freeze({ wc_heading: wcHeading, wc_paragraph: wcParagraph, wc_card: wcCard, wc_bullet_list: wcBulletList, wc_gradient_banner: wcGradientBanner, wc_wave_divider: wcWaveDivider, wc_number_steps: wcNumberSteps, wc_info_card: wcInfoCard, wc_chapter_header: wcChapterHeader, wc_highlight: wcHighlight, wc_credits: wcCredits, wc_quote: wcQuote, wc_two_columns: wcTwoColumns, wc_raw: wcRaw, wc_full_bleed: wcFullBleed })
export const _WECHAT_ALIAS = Object.freeze({ heading: 'wc_heading', paragraph: 'wc_paragraph', card: 'wc_card', bullet_list: 'wc_bullet_list', two_columns: 'wc_two_columns', quote: 'wc_quote', divider: 'wc_wave_divider', gradient_banner: 'wc_gradient_banner', wave_divider: 'wc_wave_divider', number_steps: 'wc_number_steps', info_card: 'wc_info_card', chapter_header: 'wc_chapter_header', highlight: 'wc_highlight', credits: 'wc_credits', raw: 'wc_raw', full_bleed: 'wc_full_bleed', svg_gradient_banner: 'wc_gradient_banner', svg_wave_divider: 'wc_wave_divider', svg_number_icons: 'wc_number_steps', ...Object.fromEntries(Object.keys(WECHAT_COMPONENTS).map((key) => [key, key])) })
