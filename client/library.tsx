import React, { useEffect, useState, useSyncExternalStore } from 'react'
import type { LearnPreview, LearnStyle, SnippetPreview } from './api'
import type { FishpaiStore } from './store'

const styleText = (value: string | string[]) => (Array.isArray(value) ? value.join('；') : value) || '—'

function sourcePayload(source: string) {
  const value = source.trim()
  if (/^https?:\/\/\S+$/i.test(value)) return { url: value }
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return { html: value }
  return { markdown: value }
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="fp-banner" data-kind="warn">
      <div className="fp-banner-copy">{items.map((item) => <div key={item}>{item}</div>)}</div>
    </div>
  )
}

function StyleDetails({ style }: { style: LearnStyle }) {
  return (
    <dl className="fp-style-grid">
      <div><dt>语气</dt><dd>{styleText(style.tone)}</dd></div>
      <div><dt>结构</dt><dd>{styleText(style.structure)}</dd></div>
      <div><dt>读者</dt><dd>{styleText(style.audience)}</dd></div>
      <div><dt>目的</dt><dd>{styleText(style.purpose)}</dd></div>
      <div><dt>应该</dt><dd>{styleText(style.do)}</dd></div>
      <div><dt>避免</dt><dd>{styleText(style.dont)}</dd></div>
    </dl>
  )
}

export function LearnLibrary({ store }: { store: FishpaiStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [sourceName, setSourceName] = useState('')
  const [source, setSource] = useState('')
  const [pending, setPending] = useState<LearnPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => void store.actions.refreshLearnStyles(), [store])

  const preview = async () => {
    setBusy(true)
    setError('')
    try {
      const next = await store.actions.previewLearn({ sourceName: sourceName.trim() || undefined, ...sourcePayload(source) })
      setPending(next)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await store.actions.commitLearn(pending.pendingId)
      setPending(null)
      setSource('')
      setSourceName('')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (style: LearnStyle) => {
    if (!window.confirm(`删除风格「${style.sourceName || style.styleId}」？`)) return
    setError('')
    try {
      await store.actions.deleteLearn(style.styleId)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <div className="fp-library">
      <div className="fp-compose">
        <input
          className="fp-input"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
          placeholder="风格名称（可选）"
          disabled={busy}
        />
        <textarea
          className="fp-input fp-library-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="粘贴范文 Markdown / HTML，或输入一个 URL"
          disabled={busy}
        />
        <button type="button" className="fp-btn fp-btn-primary" disabled={busy || !source.trim()} onClick={() => void preview()}>
          暂存并预览
        </button>
      </div>
      {(error || state.libraryError) && <div className="fp-library-error">{error || state.libraryError}</div>}
      {pending && (
        <section className="fp-library-pending" aria-label="待确认风格">
          <div className="fp-item-title">确认入库：{pending.style.sourceName || sourceName || '未命名风格'}</div>
          <StyleDetails style={pending.style} />
          <Warnings items={pending.warnings || []} />
          <div className="fp-item-actions">
            <button type="button" className="fp-btn fp-btn-primary" disabled={busy} onClick={() => void commit()}>确认入库</button>
            <button type="button" className="fp-btn" disabled={busy} onClick={() => setPending(null)}>取消</button>
          </div>
        </section>
      )}
      {state.libraryLoading && <div className="fp-library-status">正在读取风格库…</div>}
      {!state.libraryLoading && !state.learnStyles.length && <div className="fp-library-status">风格库还是空的。</div>}
      <div className="fp-library-list">
        {state.learnStyles.map((style) => (
          <article className="fp-item" key={style.styleId}>
            <div className="fp-item-title">{style.sourceName || style.styleId}</div>
            <div className="fp-item-meta">{styleText(style.tone)} · {styleText(style.purpose)}</div>
            <details>
              <summary>查看风格</summary>
              <StyleDetails style={style} />
            </details>
            <div className="fp-item-actions">
              <button type="button" className="fp-btn danger" onClick={() => void remove(style)}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function SnippetLibrary({ store }: { store: FishpaiStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [name, setName] = useState('')
  const [source, setSource] = useState('')
  const [anchors, setAnchors] = useState('')
  const [pending, setPending] = useState<SnippetPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => void store.actions.refreshSnippets(), [store])

  const preview = async () => {
    setBusy(true)
    setError('')
    try {
      const footerAnchors = anchors.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)
      const next = await store.actions.previewSnippet({
        name: name.trim(),
        ...sourcePayload(source),
        ...(footerAnchors.length ? { footerAnchors } : {}),
      })
      setPending(next)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await store.actions.commitSnippet(pending.pendingId)
      setPending(null)
      setSource('')
      setName('')
      setAnchors('')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (snippetId: string, snippetName: string) => {
    if (!window.confirm(`删除片段「${snippetName}」？`)) return
    setError('')
    try {
      await store.actions.deleteSnippet(snippetId)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <div className="fp-library">
      <div className="fp-compose">
        <input
          className="fp-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="片段名称"
          disabled={busy}
        />
        <textarea
          className="fp-input fp-library-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="粘贴含页头页尾的 Markdown / HTML，或输入一个 URL"
          disabled={busy}
        />
        <input
          className="fp-input"
          value={anchors}
          onChange={(event) => setAnchors(event.target.value)}
          placeholder="页尾锚点（可选，多个用逗号分隔）"
          disabled={busy}
        />
        <button
          type="button"
          className="fp-btn fp-btn-primary"
          disabled={busy || !name.trim() || !source.trim()}
          onClick={() => void preview()}
        >
          暂存并预览
        </button>
      </div>
      {(error || state.libraryError) && <div className="fp-library-error">{error || state.libraryError}</div>}
      {pending && (
        <section className="fp-library-pending" aria-label="待确认片段">
          <div className="fp-item-title">确认入库：{pending.snippet.name}</div>
          <div className="fp-item-meta">
            页头 {pending.snippet.headerHtml ? '已识别' : '无'} · 页尾 {pending.snippet.footerHtml || pending.snippet.footerImg ? '已识别' : '无'}
          </div>
          <details>
            <summary>查看提取的 HTML</summary>
            <pre className="fp-snippet-html">{pending.snippet.headerHtml || '（无页头）'}</pre>
            <pre className="fp-snippet-html">{pending.snippet.footerHtml || '（无页尾 HTML）'}</pre>
          </details>
          <Warnings items={pending.warnings || []} />
          <div className="fp-item-actions">
            <button type="button" className="fp-btn fp-btn-primary" disabled={busy} onClick={() => void commit()}>确认入库</button>
            <button type="button" className="fp-btn" disabled={busy} onClick={() => setPending(null)}>取消</button>
          </div>
        </section>
      )}
      {state.libraryLoading && <div className="fp-library-status">正在读取片段库…</div>}
      {!state.libraryLoading && !state.snippets.length && <div className="fp-library-status">片段库还是空的。</div>}
      <div className="fp-library-list">
        {state.snippets.map((snippet) => (
          <article className="fp-item" key={snippet.id}>
            <div className="fp-item-title">{snippet.name}</div>
            <div className="fp-item-meta">
              页头 {snippet.headerHtml ? '有' : '无'} · 页尾 {snippet.footerHtml || snippet.footerImg ? '有' : '无'}
            </div>
            <div className="fp-item-actions">
              <button type="button" className="fp-btn danger" onClick={() => void remove(snippet.id, snippet.name)}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
