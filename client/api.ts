/**
 * 客户端与宿主的接口层：全部走 `/fishpai/api/*`（同源 fetch）。
 *
 * 这里不做任何业务判断，只负责"把 JSON 送过去、把 JSON 拿回来"，
 * 并且把 409 冲突当成**正常返回值**而不是异常——冲突是要给用户看的界面状态。
 */

export interface DocMeta {
  theme: string
  color: string | null
  font: string
  fontSize: string
  footnotes: boolean
  macCodeBlock: boolean
  mobile: boolean
}

export interface Block {
  index: number
  id: string
  kind: string
  variant: string | null
  lang: string | null
  level: number | null
  headingPath: string[]
  startLine: number
  endLine: number
  hash: string
  /** 首行摘要，只给界面看（正文由 markdown 字段承载）。 */
  preview: string
}

export interface Note {
  id: string
  blockId: string | null
  blockIndex: number | null
  headingPath?: string[]
  quote: string
  text: string
  author: string
  at: number
  resolved: boolean
  orphan: boolean
}

export interface Placeholder {
  line: number
  text: string
  raw: string
  blockId: string | null
  blockIndex: number | null
}

export interface HistoryEntry {
  /** 历史条目的稳定标识（同一 revision 可以有多条，比如冲突时保下来的草稿）。 */
  id: string
  rev: number
  at: number
  by: string
  chars: number
  label: string | null
}

export interface DocPayload {
  doc: {
    key: string
    path: string
    title: string
    markdown: string
    revision: number
    updatedAt: number
    updatedBy: string | null
    baseline: { rev: number; at: number; by: string } | null
  }
  meta: DocMeta
  blocks: Block[]
  notes: Note[]
  placeholders: Placeholder[]
  images: Array<{ src: string; status: string; size: number | null; embed: boolean }>
  history: HistoryEntry[]
}

export interface StatePayload {
  cwd: string
  active: { key: string; path: string; title: string; revision: number } | null
  openRequest: { key: string; at: number } | null
  docs: Array<{ key: string; path: string; title: string; revision: number; updatedAt: number }>
}

export interface ThemeInfo {
  key: string
  name: string
  emoji: string
  desc: string
  /** 该主题是否使用主题色（只有用到的主题才显示取色控件）。 */
  usesAccent: boolean
  /** 用渐变文字（background-clip: text + 透明字色）：微信编辑器可能重写掉。 */
  gradientText: boolean
  /** wrapper 是深色底：粘进公众号会是一整块深色。 */
  darkWrapper: boolean
  /** 综合判断：是否适合直接粘进公众号（= !gradientText && !darkWrapper）。 */
  wechatSafe: boolean
}

export interface ThemesPayload {
  themes: ThemeInfo[]
  presets: Array<{ name: string; color: string }>
  fonts: string[]
  sizes: string[]
}

export class ConflictError extends Error {
  constructor(
    readonly revision: number,
    readonly markdown: string,
  ) {
    super(`revision 冲突：服务端是 ${revision}`)
  }
}

const PREFIX = '/fishpai/api'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...(init?.headers || {}) } : init?.headers,
  })
  let payload: any = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  if (res.status === 409 && payload && payload.conflict) {
    throw new ConflictError(Number(payload.revision) || 0, String(payload.markdown ?? ''))
  }
  if (!res.ok || !payload || payload.ok === false) {
    throw new Error((payload && payload.error) || `请求失败（HTTP ${res.status}）`)
  }
  return payload as T
}

const q = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

export const api = {
  state: (sessionId: string) => call<{ ok: true } & StatePayload>(`/state?${q({ sessionId })}`),

  themes: () => call<{ ok: true } & ThemesPayload>(`/themes`),

  doc: (sessionId: string, docKey: string) => call<{ ok: true } & DocPayload>(`/doc?${q({ sessionId, docKey })}`),

  save: (sessionId: string, docKey: string, markdown: string, baseRevision: number, meta?: Partial<DocMeta>) =>
    call<{ ok: true; revision: number; updatedAt: number }>(`/doc`, {
      method: 'PUT',
      body: JSON.stringify({ sessionId, docKey, markdown, baseRevision, meta }),
    }),

  meta: (sessionId: string, docKey: string, meta: Partial<DocMeta>) =>
    call<{ ok: true }>(`/meta`, { method: 'POST', body: JSON.stringify({ sessionId, docKey, meta }) }),

  renderPreview: (sessionId: string, docKey: string, markdown: string, meta: Partial<DocMeta>) =>
    call<{ ok: true; html: string; themeName: string; blocks: Block[] }>(`/render`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, docKey, markdown, meta, mode: 'preview' }),
    }),

  renderPublish: (sessionId: string, docKey: string, markdown: string, meta: Partial<DocMeta>) =>
    call<{ ok: true; html: string; themeName: string }>(`/render`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, docKey, markdown, meta, mode: 'publish' }),
    }),

  notes: (sessionId: string, docKey: string, payload: Record<string, unknown>) =>
    call<{ ok: true; notes: Note[] }>(`/notes`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, docKey, ...payload }),
    }),

  history: (sessionId: string, docKey: string, payload: Record<string, unknown>) =>
    call<{ ok: true; revision?: number; history?: HistoryEntry[]; entry?: HistoryEntry }>(`/history`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, docKey, ...payload }),
    }),

  tabOpened: (sessionId: string, docKey: string) =>
    call<{ ok: true }>(`/tab-opened`, { method: 'POST', body: JSON.stringify({ sessionId, docKey }) }),

  assetUrl: (sessionId: string, docKey: string, src: string) => `${PREFIX}/asset?${q({ sessionId, docKey, src })}`,
}
