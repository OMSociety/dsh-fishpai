/**
 * README 预览入口：直接运行正式 Panel、createFishpaiStore 与面板 CSS。
 * 仅 /fishpai/api 传输由本地 fixture 应答；默认深色界面与普通预览，#theme=light 切换浅色界面，#preview=dark 切换深色预览。
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Panel } from '../../client/panel'
import { createFishpaiStore } from '../../client/store'
import { CSS, STYLE_TAG_ID } from '../../client/styles'
import { FishMark } from '../../client/icons'
import type { DocMeta, DocPayload, StatePayload, ThemesPayload } from '../../client/api'
import fixture from '../../docs/preview/fixture.json'

interface PreviewFixture {
  key: string
  sessionId: string
  markdown: string
  meta: DocMeta
  themes: ThemesPayload
  state: StatePayload
  doc: DocPayload
  render: {
    mode: 'preview'
    html: string
    themeKey: string
    themeName: string
    hljsCss: string
    darkHtml: string
    linkCount: number
    hasCode: boolean
    blocks: DocPayload['blocks']
    notes: DocPayload['notes']
    placeholders: DocPayload['placeholders']
    images: DocPayload['images']
  }
}

const data = fixture as PreviewFixture

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(raw, window.location.href)
  const prefix = '/fishpai/api'
  const prefixAt = url.pathname.lastIndexOf(prefix)
  const route = prefixAt >= 0 ? url.pathname.slice(prefixAt + prefix.length) : url.pathname
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()

  if (method === 'GET' && route === '/themes') return json({ ok: true, ...data.themes })
  if (method === 'GET' && route === '/state') return json({ ok: true, ...data.state })
  if (method === 'GET' && route === '/doc') {
    if (url.searchParams.get('docKey') !== data.key) return json({ ok: false, error: '演示文档不存在' }, 404)
    return json({ ok: true, ...data.doc })
  }
  if (method === 'POST' && route === '/render') {
    const body = JSON.parse(String(init?.body || '{}')) as { docKey?: string; target?: string; mode?: string; dark?: boolean }
    if (body.docKey !== data.key) return json({ ok: false, error: '演示文档不存在' }, 404)
    if (body.mode !== 'preview' || body.target !== 'professional') {
      return json({ ok: false, error: '演示传输层只提供公众号专业预览' }, 400)
    }
    const { darkHtml, ...render } = data.render
    return json({ ok: true, ...render, ...(body.dark === true ? { html: darkHtml, dark: true } : { dark: false }) })
  }
  return json({ ok: false, error: `演示预览为只读模式：${method} ${route}` }, 405)
}

const style = document.createElement('style')
style.id = STYLE_TAG_ID
style.textContent = CSS
document.head.appendChild(style)

const previewParams = new URLSearchParams(window.location.hash.slice(1))
const previewTheme = previewParams.get('theme') === 'light' ? 'light' : 'dark'
document.body.dataset.dshTheme = previewTheme

function HostGlyph({ children }: { children: React.ReactNode }) {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

function HostTabStrip() {
  return (
    <div className="dsh-preview-tabStrip">
      <div className="dsh-preview-stripTabs">
        <div className="dsh-preview-tab dsh-preview-tabActive">
          <div className="dsh-preview-tabTitle">
            <span className="fp-title-label"><FishMark size={14} className="fp-title-glyph" />鱼排编辑器</span>
          </div>
          <button type="button" className="dsh-preview-tabClose" tabIndex={-1} aria-label="关闭标签页"><HostGlyph><path d="m4 4 8 8M12 4l-8 8" /></HostGlyph></button>
        </div>
      </div>
      <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="新建标签页"><HostGlyph><path d="M8 3v10M3 8h10" /></HostGlyph></button>
      <div className="dsh-preview-stripFill" />
      <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="拆分面板"><HostGlyph><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M8 3v10" /></HostGlyph></button>
      <div className="dsh-preview-stripChrome">
        <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="展开面板"><HostGlyph><path d="M6 3H3v3M10 3h3v3M3 10v3h3M13 10v3h-3" /></HostGlyph></button>
        <button type="button" className="dsh-preview-iconButton" tabIndex={-1} aria-label="更多"><HostGlyph><path d="M4 8h.01M8 8h.01M12 8h.01" strokeWidth="2.4" /></HostGlyph></button>
      </div>
    </div>
  )
}

const hostTheme = document.createElement('style')
hostTheme.textContent = `
  :root {
    --dsw-radius-sm: 8px;
    --dsw-radius-lg: 16px;
    --dsw-menu-backdrop-filter: blur(40px) saturate(150%);
  }
  body, body * {
    --dsw-elevation-stroke: 0 0 0 .5px var(--dsw-elevation-stroke-color);
    --dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05);
  }
  body[data-dsh-theme='light'] {
    color-scheme: light;
    --dsw-alias-bg-base: #ffffff;
    --dsw-alias-bg-layer-1: #ffffff;
    --dsw-alias-bg-layer-2: #f4f5f7;
    --dsw-alias-bg-overlay: #ffffff;
    --dsw-specific-menu: rgba(255,255,255,.70);
    --dsw-alias-label-primary: rgb(15,17,21);
    --dsw-alias-label-secondary: rgb(97,102,107);
    --dsw-alias-brand-primary: #3f63d7;
    --dsw-alias-border-l1: rgba(0,0,0,.08);
    --dsw-alias-border-l2: rgba(0,0,0,.12);
    --dsw-alias-border-l3: rgba(0,0,0,.12);
    --dsw-alias-state-warn-primary: #b45309;
    --dsw-alias-state-error-primary: #dc2626;
    --dsw-alias-markdown-tag: #eef0f3;
    --dsw-shadow-lv2: 0 5px 18px rgba(15,23,42,.16);
    --dsw-shadow-lv3: 0 8px 24px rgba(15,23,42,.18);
  }
  body[data-dsh-theme='dark'] {
    color-scheme: dark;
    --dsw-alias-bg-base: rgb(21,21,23);
    --dsw-alias-bg-layer-1: rgb(35,35,36);
    --dsw-alias-bg-layer-2: rgb(44,44,46);
    --dsw-alias-bg-overlay: rgb(97,102,107);
    --dsw-specific-menu: rgba(48,49,54,.64);
    --dsw-alias-label-primary: rgb(249,250,251);
    --dsw-alias-label-secondary: rgb(190,194,199);
    --dsw-alias-brand-primary: #8aa4f7;
    --dsw-alias-border-l1: rgba(255,255,255,.08);
    --dsw-alias-border-l2: rgba(255,255,255,.14);
    --dsw-alias-border-l3: rgba(255,255,255,.16);
    --dsw-alias-state-warn-primary: #fbbf24;
    --dsw-alias-state-error-primary: #f87171;
    --dsw-alias-markdown-tag: rgb(44,44,46);
    --dsw-shadow-lv2: 0 5px 18px rgba(0,0,0,.36);
    --dsw-shadow-lv3: 0 8px 24px rgba(0,0,0,.42);
  }
  body[data-dsh-theme='dark'] [data-menu-material] {
    --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);
  }
  html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  body {
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  button, input, textarea { font-family: inherit; }
  .dsh-preview-shell { display: flex; flex-direction: column; width: 100%; height: 100%; }
  .dsh-preview-panel { flex: 1; min-height: 0; }
  .dsh-preview-tabStrip {
    display: flex; flex: none; align-items: center; gap: 4px;
    height: 38px; padding: 10px 6px 0 10px; box-sizing: border-box;
    background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);
    font-size: 13px; line-height: 1.45; user-select: none;
  }
  .dsh-preview-stripTabs { display: flex; align-items: center; gap: 4px; flex: 0 1 auto; min-width: 0; }
  .dsh-preview-tab {
    position: relative; display: flex; align-items: center; gap: 6px; box-sizing: border-box;
    height: 28px; min-width: 80px; max-width: 170px; padding: 0 10px;
    border-radius: var(--dsw-radius-sm) var(--dsw-radius-sm) 0 0;
  }
  .dsh-preview-tabActive { background: var(--dsw-alias-markdown-tag); color: var(--dsw-alias-label-primary); }
  .dsh-preview-tabTitle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; }
  .dsh-preview-tabClose {
    display: flex; align-items: center; justify-content: center; flex: none;
    width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: inherit; cursor: default;
  }
  .dsh-preview-tabClose svg { width: 12px; height: 12px; }
  .dsh-preview-stripFill { flex: 1; min-width: 8px; }
  .dsh-preview-stripChrome { display: flex; align-items: center; gap: 4px; }
  .dsh-preview-iconButton {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: var(--dsw-alias-label-secondary); cursor: default;
  }
`
document.head.appendChild(hostTheme)

const store = createFishpaiStore(data.sessionId)
store.actions.setPreviewDark(previewParams.get('preview') === 'dark')
const root = createRoot(document.getElementById('root')!)
root.render(
  <div className="dsh-preview-shell">
    <HostTabStrip />
    <div className="dsh-preview-panel"><Panel store={store} sessionId={data.sessionId} /></div>
  </div>,
)

async function settlePreview(): Promise<void> {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const state = store.getSnapshot()
    if (state.status === 'ready' && state.docKey === data.key && state.previewHtml && !state.previewing) break
    if (state.status === 'error') throw new Error(state.error || '演示面板载入失败')
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  const state = store.getSnapshot()
  if (!(state.status === 'ready' && state.docKey === data.key && state.previewHtml && !state.previewing)) {
    throw new Error('等待演示面板渲染超时')
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await Promise.all(
    Array.from(document.images).map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })),
  )
  document.documentElement.dataset.previewReady = 'true'
}

void settlePreview()
