import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FishpaiStore } from './store'
import { isPublishBusy } from './store'

const PHASE_LABEL = {
  idle: '',
  saving: '正在保存文档…',
  rendering: '正在渲染发布 HTML…',
  sending: '正在发送到草稿箱…',
  ok: '草稿已保存',
  error: '发送未完成',
} as const

function formatAuthTime(savedAt: number): string {
  const date = new Date(savedAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 复制/导出入口旁的草稿箱组合按钮。任务本身由 store 持有，关掉弹层也不会中断。 */
export function PublishControls({ store, narrow }: { store: FishpaiStore; narrow: boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const publish = state.publish
  const busy = isPublishBusy(publish.phase)
  const auth = state.auth[publish.target]
  const platformName = publish.target === 'wechat' ? '微信' : '秀米'
  const authText = auth.loading
    ? '正在检查登录态…'
    : !auth.status
      ? auth.error
        ? '登录态未知'
        : '正在检查登录态…'
      : auth.status.loggedIn
        ? `已登录${typeof auth.status.savedAt === 'number' ? `（保存于 ${formatAuthTime(auth.status.savedAt)}）` : ''}`
        : '未登录'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) void store.actions.refreshAuthStatus(publish.target)
  }, [open, publish.target, store])

  const toggle = () => {
    if (!open) {
      if (!busy && !publish.title) store.actions.setPublishDraft({ title: state.title })
      void store.actions.refreshSnippets()
    }
    setOpen(!open)
  }

  const submit = async () => {
    const ok = await store.actions.publishToDraft({
      target: publish.target,
      title: publish.title,
      author: publish.author,
      snippetId: publish.snippetId,
    })
    if (ok) setOpen(false)
  }

  return (
    <div className="fp-publish" data-narrow={narrow ? 'true' : 'false'} ref={rootRef}>
      <div className="fp-publish-split">
        <button type="button" className="fp-btn fp-publish-main" onClick={toggle} aria-expanded={open}>
          {busy ? PHASE_LABEL[publish.phase] : '发送到草稿箱'}
        </button>
        <button
          type="button"
          className="fp-btn fp-publish-caret"
          onClick={toggle}
          aria-label="选择草稿箱平台"
          title="选择微信或秀米"
          aria-expanded={open}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="fp-publish-popover" data-menu-material role="dialog" aria-label="发送到草稿箱">
          <div className="fp-publish-targets" role="group" aria-label="草稿箱平台">
            <button
              type="button"
              className="fp-btn"
              data-on={publish.target === 'wechat' ? 'true' : undefined}
              disabled={busy}
              onClick={() => store.actions.setPublishDraft({ target: 'wechat' })}
            >
              微信草稿箱
            </button>
            <button
              type="button"
              className="fp-btn"
              data-on={publish.target === 'xiumi' ? 'true' : undefined}
              disabled={busy}
              onClick={() => store.actions.setPublishDraft({ target: 'xiumi' })}
            >
              秀米草稿箱
            </button>
          </div>
          <div className="fp-publish-auth">
            <span role="status">{platformName}：{authText}</span>
            <button
              type="button"
              className="fp-btn"
              title={auth.status?.loggedIn ? '清除后重新发布即可重新登录' : '打开浏览器登录目标平台，登录成功后继续保存草稿'}
              disabled={busy || auth.loading || auth.clearing}
              onClick={() => (auth.status?.loggedIn ? void store.actions.clearAuth(publish.target) : void submit())}
            >
              {auth.clearing ? '正在清除…' : auth.status?.loggedIn ? '清除登录态' : '登录'}
            </button>
          </div>
          {auth.error ? <div className="fp-publish-error">{auth.error}</div> : null}
          {publish.phase === 'error' && /登录|过期/.test(publish.error || '') ? (
            <div className="fp-publish-note">若登录态已失效，请清除后重新发布。</div>
          ) : null}
          <label className="fp-field">
            <span>标题</span>
            <input
              className="fp-input"
              value={publish.title}
              disabled={busy}
              onChange={(event) => store.actions.setPublishDraft({ title: event.target.value })}
              placeholder="公众号草稿标题"
              autoFocus
            />
          </label>
          <label className="fp-field">
            <span>作者（可选）</span>
            <input
              className="fp-input"
              value={publish.author}
              disabled={busy}
              onChange={(event) => store.actions.setPublishDraft({ author: event.target.value })}
              placeholder="作者名"
            />
          </label>
          {state.snippets.length > 0 ? (
            <label className="fp-field">
              <span>页头页尾</span>
              <select
                className="fp-input"
                value={publish.snippetId}
                disabled={busy}
                onChange={(event) => store.actions.setPublishDraft({ snippetId: event.target.value })}
              >
                <option value="">不叠加片段</option>
                {state.snippets.map((snippet) => (
                  <option value={snippet.id} key={snippet.id}>
                    {snippet.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="fp-publish-note">
            只保存草稿，不会公开发布。{state.snippets.length > 0 ? '片段只进入本次发布 HTML，不改正文。' : ''}
          </div>
          {busy && (
            <div className="fp-publish-progress" role="status">
              {publish.message || PHASE_LABEL[publish.phase]}
              {publish.phase === 'sending' && publish.progress > 0 ? ` ${publish.progress}%` : ''}
            </div>
          )}
          {publish.phase === 'error' && publish.error && <div className="fp-publish-error">{publish.error}</div>}
          {publish.phase === 'ok' && publish.result?.url && (
            <a className="fp-publish-result" href={String(publish.result.url)} target="_blank" rel="noreferrer">
              打开草稿箱结果
            </a>
          )}
          <button
            type="button"
            className="fp-btn fp-btn-primary fp-publish-submit"
            disabled={busy || !publish.title.trim()}
            onClick={() => void submit()}
          >
            {busy ? '任务进行中' : publish.target === 'wechat' ? '发送到微信草稿箱' : '发送到秀米草稿箱'}
          </button>
        </div>
      )}
    </div>
  )
}
