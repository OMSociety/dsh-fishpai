import React, { useEffect, useState, useSyncExternalStore } from 'react'
import type { SnippetPreview } from './api'
import type { FishpaiStore } from './store'

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="fp-banner" data-kind="warn">
      <div className="fp-banner-copy">{items.map((item) => <div key={item}>{item}</div>)}</div>
    </div>
  )
}

function sourcePayload(source: string) {
  const value = source.trim()
  if (/^https?:\/\/\S+$/i.test(value)) return { url: value }
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return { html: value }
  return { markdown: value }
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
          placeholder="文章 HTML、Markdown 或公众号文章链接"
          disabled={busy}
        />
        <input
          className="fp-input"
          value={anchors}
          onChange={(event) => setAnchors(event.target.value)}
          placeholder="页尾起始文字（可选，逗号分隔）"
          disabled={busy}
        />
        <button
          type="button"
          className="fp-btn fp-btn-primary"
          disabled={busy || !name.trim() || !source.trim()}
          onClick={() => void preview()}
        >
          提取
        </button>
      </div>
      {(error || state.libraryError) && <div className="fp-library-error">{error || state.libraryError}</div>}
      {pending && (
        <section className="fp-library-pending" aria-label="待确认片段">
          <div className="fp-item-title">保存「{pending.snippet.name}」？</div>
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
            <button type="button" className="fp-btn fp-btn-primary" disabled={busy} onClick={() => void commit()}>保存</button>
            <button type="button" className="fp-btn" disabled={busy} onClick={() => setPending(null)}>取消</button>
          </div>
        </section>
      )}
      {state.libraryLoading && <div className="fp-library-status">正在读取片段库…</div>}
      {!state.libraryLoading && !state.snippets.length && <div className="fp-library-status">暂无片段。页头页尾用于复制与导出时自动拼接固定开头和结尾。</div>}
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
