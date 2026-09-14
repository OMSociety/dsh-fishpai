/**
 * 鱼排面板：Markdown 源码 + 公众号实时预览 + 批注抽屉。
 *
 * 面板不自己发请求，全部通过 `store`（状态机）转一手——这样"预览跟手、保存防抖、
 * 冲突不丢字"这些时序只有一处实现。
 */
import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { buildSrcdoc, type FishpaiStore } from './store'
import type { Block, DocMeta, Note, Placeholder } from './api'

type ViewMode = 'edit' | 'preview' | 'side'
type Tab = 'notes' | 'todo' | 'blocks' | 'history'

const READING_CHARS_PER_MIN = 400

function countWords(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff]/g) || []).length
  const latin = (text.match(/[A-Za-z0-9]+/g) || []).length
  return cjk + latin
}

function readingMinutes(text: string): number {
  return Math.max(1, Math.round(countWords(text) / READING_CHARS_PER_MIN))
}

function fmtTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 剪贴板 ─────────────────────────────────────────────────────

async function copyRich(html: string, plain: string): Promise<void> {
  const ClipboardItemCtor: any = (globalThis as any).ClipboardItem
  if (navigator.clipboard && ClipboardItemCtor) {
    await navigator.clipboard.write([
      new ClipboardItemCtor({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ])
    return
  }
  // 回退：把 HTML 塞进隐藏的可编辑容器，选中后走 execCommand
  const holder = document.createElement('div')
  holder.contentEditable = 'true'
  holder.style.position = 'fixed'
  holder.style.left = '-9999px'
  holder.innerHTML = html
  document.body.appendChild(holder)
  try {
    const range = document.createRange()
    range.selectNodeContents(holder)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('copy')
    selection?.removeAllRanges()
  } finally {
    holder.remove()
  }
}

function download(name: string, html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// ── 小组件 ─────────────────────────────────────────────────────

function Btn(props: {
  on?: boolean
  primary?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`fp-btn${props.primary ? ' fp-btn-primary' : ''}`}
      data-on={props.on ? 'true' : undefined}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

// ── 主面板 ─────────────────────────────────────────────────────

export function Panel(props: { store: FishpaiStore; sessionId: string; visible?: boolean }) {
  const { store, sessionId } = props
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [mode, setMode] = React.useState<ViewMode>('side')
  const [tab, setTab] = React.useState<Tab>('notes')
  const [noteDraft, setNoteDraft] = React.useState('')
  const [narrow, setNarrow] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null)
  const lastVisible = React.useRef<string | null>(null)

  React.useEffect(() => {
    void store.actions.init()
  }, [store])

  // 宽度自适应：窄栏不允许并排
  React.useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 560))
    ro.observe(el)
    setNarrow(el.clientWidth < 560)
    return () => ro.disconnect()
  }, [])

  // 预览 iframe 的滚动上报：换内容后把位置还原回去。
  // 只认我们自己那个 iframe（它是 sandbox 出来的不透明源，origin 为 null），
  // 免得文档里嵌的别的 iframe 发消息影响滚动。
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      if (data && data.fishpai === 'visible') lastVisible.current = data.id || null
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const restoreScroll = React.useCallback(() => {
    const id = lastVisible.current
    if (!id) return
    iframeRef.current?.contentWindow?.postMessage({ fishpai: 'reveal', id }, '*')
  }, [])

  const layout: 'stack' | 'side' = mode === 'side' && !narrow ? 'side' : 'stack'
  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'edit' || layout === 'side'

  const openNotes = state.notes.filter((n) => !n.resolved)

  // ── 工具栏动作 ─────────────────────────────────────────────
  const onCopy = async () => {
    if (state.placeholders.length) {
      const okToCopy = window.confirm(`还有 ${state.placeholders.length} 处「待补」占位没处理，仍要复制吗？`)
      if (!okToCopy) return
    }
    try {
      const html = await store.actions.publishHtml()
      await copyRich(html, state.markdown)
      store.actions.toast('已复制到剪贴板：粘进公众号编辑器即可')
    } catch (error) {
      store.actions.toast(`复制失败：${(error as Error).message}`, 'error')
    }
  }

  const onExport = async () => {
    try {
      const html = await store.actions.publishHtml()
      const base = (state.title || 'article').replace(/[\\/:*?"<>|]/g, '')
      download(`${base}.html`, html)
      store.actions.toast(`已导出 ${base}.html`)
    } catch (error) {
      store.actions.toast(`导出失败：${(error as Error).message}`, 'error')
    }
  }

  const onAddNote = async () => {
    const text = noteDraft.trim()
    if (!text) return
    await store.actions.addNote(text)
    setNoteDraft('')
  }

  if (state.status === 'loading') {
    return (
      <div className="fp-root" ref={rootRef}>
        <div className="fp-empty">正在打开鱼排…</div>
      </div>
    )
  }

  if (state.status === 'empty') {
    return (
      <div className="fp-root" ref={rootRef}>
        <div className="fp-empty">
          当前会话还没有鱼排文档。
          <br />
          让模型调用 <code>fishpai_open</code>（可以直接给一篇 Markdown），这里就会出现编辑与预览。
        </div>
      </div>
    )
  }

  return (
    <div className="fp-root" ref={rootRef}>
      <div className="fp-toolbar">
        <div className="fp-row">
          <div className="fp-seg">
            <Btn on={mode === 'edit'} onClick={() => setMode('edit')} title="只看源码">
              编辑
            </Btn>
            <Btn on={mode === 'preview'} onClick={() => setMode('preview')} title="只看公众号效果">
              预览
            </Btn>
            <Btn on={mode === 'side'} disabled={narrow} onClick={() => setMode('side')} title={narrow ? '栏位太窄，拉宽后可用并排' : '左右并排'}>
              并排
            </Btn>
          </div>
          <Btn on={state.meta.mobile} onClick={() => store.actions.setMeta({ mobile: !state.meta.mobile })} title="按手机宽度预览（375px）">
            手机
          </Btn>
          <span className="fp-spacer" />
          <Btn title="重新载入文档" onClick={() => void store.actions.reload()}>
            刷新
          </Btn>
          <Btn title="导出「复制到公众号」形态的 HTML 文件" onClick={() => void onExport()}>
            导出
          </Btn>
          <Btn primary title="复制后直接粘进公众号编辑器（⌘⇧C）" onClick={() => void onCopy()}>
            复制到公众号
          </Btn>
        </div>

        <div className="fp-row">
          <select
            className="fp-select"
            value={state.meta.theme}
            title="主题"
            onChange={(e) => void store.actions.setMeta({ theme: e.target.value })}
          >
            {state.themes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.emoji} {t.name}
              </option>
            ))}
          </select>

          <div className="fp-swatches" title="主题色">
            {state.presets.map((p) => (
              <button
                key={p.color}
                type="button"
                className="fp-swatch"
                style={{ background: p.color }}
                data-on={state.meta.color === p.color ? 'true' : undefined}
                title={`${p.name} ${p.color}`}
                onClick={() => void store.actions.setMeta({ color: state.meta.color === p.color ? null : p.color })}
              />
            ))}
            <input
              className="fp-color"
              type="color"
              title="自定义主题色"
              value={state.meta.color || '#4f6ef7'}
              onChange={(e) => void store.actions.setMeta({ color: e.target.value })}
            />
          </div>

          <select
            className="fp-select"
            value={state.meta.fontSize}
            title="正文字号"
            onChange={(e) => void store.actions.setMeta({ fontSize: e.target.value })}
          >
            {state.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <Btn
            on={state.meta.footnotes}
            title="正文外链转文末「参考资料」（微信正文不支持外链）"
            onClick={() => void store.actions.setMeta({ footnotes: !state.meta.footnotes })}
          >
            脚注
          </Btn>
          <Btn
            on={state.meta.macCodeBlock}
            title="代码块用 mac 标题栏形态"
            onClick={() => void store.actions.setMeta({ macCodeBlock: !state.meta.macCodeBlock })}
          >
            代码框
          </Btn>
          <Btn
            title="给光标所在段落留一条批注，模型下次读文档就能看到"
            onClick={() => {
              setTab('notes')
              setNoteDraft('')
            }}
          >
            ＋批注
          </Btn>
        </div>
      </div>

      {state.error ? (
        <div className="fp-banner" data-kind="error">
          <span>{state.error}</span>
          <span className="fp-spacer" />
          <Btn onClick={() => void store.actions.reload()}>重试</Btn>
        </div>
      ) : null}

      {state.external ? (
        <div className="fp-banner">
          <span>
            {state.external.reason === 'switch'
              ? '模型打开了另一篇文档，你这里有没保存的改动。'
              : `AI 更新了文档（rev ${state.external.revision}），你这里有没保存的改动。`}
          </span>
          <span className="fp-spacer" />
          <Btn onClick={() => void store.actions.acceptExternal()}>
            {state.external.reason === 'switch' ? '切到新文档' : '看 AI 的版本'}
          </Btn>
          <Btn onClick={() => void store.actions.flush()}>保留我的</Btn>
        </div>
      ) : null}

      {state.conflict ? (
        <div className="fp-banner">
          <span>文档已被改动（服务端 rev {state.conflict.revision}），你的编辑还在编辑器里。</span>
          <span className="fp-spacer" />
          <Btn onClick={() => void store.actions.resolveConflict('theirs')}>采用 AI 的（先把我的存进历史）</Btn>
          <Btn primary onClick={() => void store.actions.resolveConflict('mine')}>
            用我的覆盖
          </Btn>
        </div>
      ) : null}

      <div className="fp-main" data-layout={layout}>
        {showEditor ? (
          <Editor
            pane
            editorRef={editorRef}
            value={state.markdown}
            onChange={(text) => store.actions.setMarkdown(text)}
            onCaret={(line) => store.actions.setCaret(line)}
            onSave={() => void store.actions.flush()}
            onCopy={() => void onCopy()}
            currentBlock={state.blocks.find((b) => b.startLine <= state.caretLine && state.caretLine <= b.endLine) || null}
          />
        ) : null}
        {showPreview ? (
          <Preview
            pane
            iframeRef={iframeRef}
            html={state.previewHtml}
            mobile={state.meta.mobile}
            previewing={state.previewing}
            themeName={state.themeName}
            onLoad={restoreScroll}
          />
        ) : null}
      </div>

      <Drawer
        tab={tab}
        setTab={setTab}
        notes={state.notes}
        placeholders={state.placeholders}
        blocks={state.blocks}
        history={state.history}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        onAddNote={() => void onAddNote()}
        onResolve={(id) => void store.actions.updateNote(id, { resolved: true })}
        onRemove={(id) => void store.actions.removeNote(id)}
        onJump={(line) => {          const el = editorRef.current
          if (!el) return
          const lines = state.markdown.split('\n')
          const offset = lines.slice(0, line - 1).reduce((acc, l) => acc + l.length + 1, 0)
          el.focus()
          el.setSelectionRange(offset, offset)
          store.actions.setCaret(line)
          const ratio = offset / Math.max(1, state.markdown.length)
          el.scrollTop = ratio * el.scrollHeight
        }}
        onRestore={(id, label) => void store.actions.restore(id, label)}
      />

      <div className="fp-status">
        <span>{countWords(state.markdown)} 字</span>
        <span>约 {readingMinutes(state.markdown)} 分钟</span>
        <span>rev {state.revision}</span>
        <span>{state.saving ? '保存中…' : state.dirty ? '未保存' : '已保存'}</span>
        <span className="fp-spacer" />
        {state.placeholders.length ? <span className="fp-warn">待补 {state.placeholders.length}</span> : null}
        {openNotes.length ? <span>批注 {openNotes.length}</span> : null}
        <span className="fp-muted">{state.themeName}</span>
      </div>

      {state.toast ? <div className="fp-toast">{state.toast.text}</div> : null}
    </div>
  )
}

// ── 编辑器 ─────────────────────────────────────────────────────

function Editor(props: {
  pane?: boolean
  editorRef: React.RefObject<HTMLTextAreaElement>
  value: string
  onChange: (text: string) => void
  onCaret: (line: number) => void
  onSave: () => void
  onCopy: () => void
  currentBlock: Block | null
}) {
  const { editorRef, value } = props
  const caretOf = (el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart || 0).split('\n').length

  return (
    <div className="fp-pane">
      <div className="fp-pane-head">
        <span>Markdown 源码</span>
        <span className="fp-spacer" />
        <span className="fp-muted">
          {props.currentBlock ? `${props.currentBlock.kind} · 第 ${props.currentBlock.startLine} 行` : '未在块内'}
        </span>
      </div>
      <textarea
        ref={editorRef}
        className="fp-editor"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          props.onChange(e.target.value)
          props.onCaret(caretOf(e.target))
        }}
        onClick={(e) => props.onCaret(caretOf(e.currentTarget))}
        onKeyUp={(e) => props.onCaret(caretOf(e.currentTarget))}
        onKeyDown={(e) => {
          const meta = e.metaKey || e.ctrlKey
          if (meta && e.key.toLowerCase() === 's') {
            e.preventDefault()
            props.onSave()
            return
          }
          if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            props.onCopy()
            return
          }
          if (e.key === 'Tab') {
            e.preventDefault()
            const el = e.currentTarget
            const start = el.selectionStart
            const end = el.selectionEnd
            const next = `${value.slice(0, start)}  ${value.slice(end)}`
            props.onChange(next)
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start + 2
            })
          }
        }}
      />
    </div>
  )
}

// ── 预览 ───────────────────────────────────────────────────────

function Preview(props: {
  pane?: boolean
  iframeRef: React.RefObject<HTMLIFrameElement>
  html: string
  mobile: boolean
  previewing: boolean
  themeName: string
  onLoad: () => void
}) {
  return (
    <div className="fp-pane">
      <div className="fp-pane-head">
        <span>公众号预览</span>
        <span className="fp-spacer" />
        {props.previewing ? <span>渲染中…</span> : null}
        <span className="fp-muted">{props.themeName}</span>
      </div>
      <div className="fp-preview-wrap">
        {props.html ? (
          <iframe
            ref={props.iframeRef}
            className="fp-preview"
            title="公众号预览"
            sandbox="allow-scripts"
            data-mobile={props.mobile ? 'true' : 'false'}
            srcDoc={buildSrcdoc(props.html)}
            onLoad={props.onLoad}
          />
        ) : (
          <div className="fp-preview-empty">还没有内容</div>
        )}
      </div>
    </div>
  )
}

// ── 抽屉 ───────────────────────────────────────────────────────

function Drawer(props: {
  tab: Tab
  setTab: (t: Tab) => void
  notes: Note[]
  placeholders: Placeholder[]
  blocks: Block[]
  history: Array<{ id: string; rev: number; at: number; by: string; chars: number; label: string | null }>
  noteDraft: string
  setNoteDraft: (v: string) => void
  onAddNote: () => void
  onResolve: (id: string) => void
  onRemove: (id: string) => void
  onJump: (line: number) => void
  onRestore: (id: string, label: string) => void
}) {
  const open = props.notes.filter((n) => !n.resolved)
  return (
    <div className="fp-drawer">
      <div className="fp-drawer-tabs">
        <Btn on={props.tab === 'notes'} onClick={() => props.setTab('notes')}>
          批注 {open.length || ''}
        </Btn>
        <Btn on={props.tab === 'todo'} onClick={() => props.setTab('todo')}>
          待补 {props.placeholders.length || ''}
        </Btn>
        <Btn on={props.tab === 'blocks'} onClick={() => props.setTab('blocks')}>
          块 {props.blocks.length}
        </Btn>
        <Btn on={props.tab === 'history'} onClick={() => props.setTab('history')}>
          历史
        </Btn>
      </div>
      <div className="fp-drawer-body">
        {props.tab === 'notes' ? (
          <>
            <div className="fp-compose">
              <textarea
                placeholder="给光标所在段落留一条批注…（模型下次读文档时会看到）"
                value={props.noteDraft}
                onChange={(e) => props.setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') props.onAddNote()
                }}
              />
              <div className="fp-row">
                <span className="fp-muted">⌘/Ctrl + Enter 添加</span>
                <span className="fp-spacer" />
                <Btn primary disabled={!props.noteDraft.trim()} onClick={props.onAddNote}>
                  添加批注
                </Btn>
              </div>
            </div>
            {props.notes.length === 0 ? <div className="fp-empty">还没有批注。</div> : null}
            {props.notes.map((n) => (
              <div className="fp-item" key={n.id} data-orphan={n.orphan ? 'true' : undefined}>
                <div className="fp-item-head">
                  <span>
                    {n.orphan
                      ? '锚点已失效'
                      : n.blockIndex === null || n.blockIndex === undefined
                        ? '第 ? 块'
                        : `第 ${n.blockIndex + 1} 块`}
                  </span>
                  <span>{fmtTime(n.at)}</span>
                  <span className="fp-spacer" />
                  {n.orphan ? null : <Btn onClick={() => props.onResolve(n.id)}>{n.resolved ? '已解决' : '标记解决'}</Btn>}
                  <Btn onClick={() => props.onRemove(n.id)}>删除</Btn>
                </div>
                <div className="fp-item-text">{n.text}</div>
                {n.quote ? <div className="fp-quote">{n.quote.slice(0, 120)}</div> : null}
              </div>
            ))}
          </>
        ) : null}

        {props.tab === 'todo' ? (
          props.placeholders.length === 0 ? (
            <div className="fp-empty">没有待补占位。在正文里写 <code>&lt;!-- 鱼排: 这里补一句 --&gt;</code> 即可。</div>
          ) : (
            props.placeholders.map((p) => (
              <div className="fp-item" key={`${p.line}-${p.text}`}>
                <div className="fp-item-head">
                  <span>第 {p.line} 行</span>
                  <span className="fp-spacer" />
                  <Btn onClick={() => props.onJump(p.line)}>定位</Btn>
                </div>
                <div className="fp-item-text">{p.text}</div>
              </div>
            ))
          )
        ) : null}

        {props.tab === 'blocks' ? (
          props.blocks.map((b) => (
            <div className="fp-item" key={b.id}>
              <div className="fp-item-head">
                <span>{b.id}</span>
                <span>{b.kind}</span>
                <span>第 {b.startLine} 行</span>
                <span className="fp-spacer" />
                <Btn onClick={() => props.onJump(b.startLine)}>定位</Btn>
              </div>
              {b.preview ? <div className="fp-item-text">{b.preview}</div> : null}
            </div>
          ))
        ) : null}

        {props.tab === 'history' ? (
          props.history.length === 0 ? (
            <div className="fp-empty">还没有历史版本。</div>
          ) : (
            props.history.map((h) => (
              <div className="fp-item" key={h.id}>
                <div className="fp-item-head">
                  <span>rev {h.rev}</span>
                  <span>{h.by === 'ai' ? '模型' : h.by === 'human' ? '你' : h.by}</span>
                  <span>{fmtTime(h.at)}</span>
                  {h.label ? <span>{h.label}</span> : null}
                  <span className="fp-spacer" />
                  <Btn onClick={() => props.onRestore(h.id, `rev ${h.rev}${h.label ? `（${h.label}）` : ''}`)}>回滚到这一版</Btn>
                </div>
              </div>
            ))
          )
        ) : null}
      </div>
    </div>
  )
}
