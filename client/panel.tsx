/**
 * 鱼排面板：Markdown 源码 + 公众号实时预览 + 批注抽屉。
 *
 * 面板不自己发请求，全部通过 `store`（状态机）转一手——这样"预览跟手、保存防抖、
 * 冲突不丢字"这些时序只有一处实现。
 */
import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { buildSrcdoc, type FishpaiStore } from './store'
import { COPY_HINT, MOD_KEY } from './keys'
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

/** 块的类型标签：编辑器头与「块」页签共用，不把 markdown-it 的英文 token 名丢给用户看。 */
const KIND_LABEL: Record<string, string> = {
  heading: '标题',
  paragraph: '正文',
  list: '列表',
  blockquote: '引用',
  table: '表格',
  code: '代码块',
  card: '信息卡片',
  hr: '分隔线',
  html: '原始 HTML',
}

function kindLabel(kind: string | null | undefined, fallback = '块'): string {
  if (!kind) return fallback
  return KIND_LABEL[kind] || kind
}

/**
 * 两个"开关到底有没有用"的判断（只用来把无效控件置灰并说明原因）。
 *
 * 都是启发式：只在 markdown 里扫一眼，判错也只是提示不准，不影响功能。
 * 外链要排掉图片语法（`![alt](url)` 不会转脚注），自动链接（裸 URL）也算。
 */
function hasExternalLinks(markdown: string): boolean {
  if (/(?<!!)\[[^\]\n]*\]\(\s*(?:https?:)?\/\//.test(markdown)) return true
  return /(^|[\s(])https?:\/\/\S+/.test(markdown)
}

function hasCodeBlocks(markdown: string): boolean {
  return /^ {0,3}(?:```|~~~)/m.test(markdown)
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
  const noteInputRef = React.useRef<HTMLTextAreaElement | null>(null)

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

  // ── 「定位」────────────────────────────────────────────────
  // 预览模式下面板里根本没有编辑器（`editorRef.current === null`），旧写法会让「定位」
  // 静默失败——点了没反应正是最让人困惑的控件。现在：先记住落点、把视图切到含编辑器的那一档，
  // 等编辑器真的挂上（mode 变化后的那一次渲染）再落选择。
  const [pendingJump, setPendingJump] = React.useState<{ start: number; end: number; line: number } | null>(null)

  const applyJump = React.useCallback(
    (target: { start: number; end: number; line: number }) => {
      const el = editorRef.current
      if (!el) return false
      el.focus()
      el.setSelectionRange(target.start, target.end)
      store.actions.setCaret(target.line)
      el.scrollTop = (target.start / Math.max(1, state.markdown.length)) * el.scrollHeight
      return true
    },
    [store, state.markdown.length],
  )

  const jumpTo = React.useCallback(
    (target: { start: number; end: number; line: number }) => {
      if (applyJump(target)) return
      setPendingJump(target)
      setMode((current) => (current === 'preview' ? (narrow ? 'edit' : 'side') : current))
    },
    [applyJump, narrow],
  )

  React.useEffect(() => {
    if (!pendingJump) return
    if (applyJump(pendingJump)) setPendingJump(null)
  }, [pendingJump, mode, applyJump])

  /** 行号 → 文本偏移（textarea 的选择范围按字符偏移算）。 */
  const lineOffset = (line: number): number => {
    const lines = state.markdown.split('\n')
    return lines.slice(0, Math.max(0, line - 1)).reduce((acc, l) => acc + l.length + 1, 0)
  }

  const jumpToLine = (line: number) => {
    const offset = lineOffset(line)
    jumpTo({ start: offset, end: offset, line })
  }

  /**
   * 批注的「定位」：能高亮出引用片段就高亮（长段落里一眼看到说的是哪句）；
   * 人把那句改写过了就退回它原来所在的块，并说明为什么没高亮；两条都不成立才报"找不到了"。
   */
  const jumpToNote = (note: Note) => {
    const markdown = state.markdown
    const quote = note.quote || ''
    const start = quote ? markdown.indexOf(quote) : -1
    if (start >= 0) {
      jumpTo({ start, end: start + quote.length, line: markdown.slice(0, start).split('\n').length })
      return
    }
    const block =
      note.blockIndex === null || note.blockIndex === undefined
        ? null
        : state.blocks.find((b) => b.index === note.blockIndex) || state.blocks[note.blockIndex] || null
    if (block) {
      jumpToLine(block.startLine)
      store.actions.toast('引用片段已被改写，已定位到它原来所在的块')
      return
    }
    store.actions.toast('这条批注引用的文字已经不在正文里了', 'error')
  }

  const layout: 'stack' | 'side' = mode === 'side' && !narrow ? 'side' : 'stack'
  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'edit' || layout === 'side'

  const openNotes = state.notes.filter((n) => !n.resolved)
  const currentTheme = state.themes.find((t) => t.key === state.meta.theme) || null
  // 只用来把"点了没反应"的开关置灰并说明原因
  const docHasLinks = hasExternalLinks(state.markdown)
  const docHasCode = hasCodeBlocks(state.markdown)
  // 内嵌不了的图（文件不在/越界/超上限）粘进公众号大概率不显示，要在编辑器里手动传
  const manualImages = state.images.filter((i) => !i.embed)

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
      // 复制失败时给出下一步：另一条路就在旁边，用户不必自己猜
      store.actions.toast(`复制失败：${(error as Error).message}　可以改用旁边的「导出 HTML」拿文件`, 'error')
    }
  }

  const onExport = async () => {
    try {
      const html = await store.actions.publishHtml()
      const base = (state.title || 'article').replace(/[\\/:*?"<>|]/g, '')
      download(`${base}.html`, html)
      store.actions.toast(`已导出 ${base}.html`)
    } catch (error) {
      store.actions.toast(`导出失败：${(error as Error).message}　可以改用「复制到公众号」`, 'error')
    }
  }

  const onAddNote = async () => {
    const text = noteDraft.trim()
    if (!text) return
    const added = await store.actions.addNote(text)
    // 只有真的加上了才清空：失败或没有落点时，把用户刚写的字留在输入框里
    if (added) setNoteDraft('')
  }

  // ── 没有文档时的三种"空白页" ────────────────────────────────
  // 一块空白面板最忌讳只有一行小字飘在中间：既看不出这是什么，也看不到下一步能做什么。
  // 所以三种状态共用一张卡片：品牌行（这是什么）+ 一句话（现在什么情况）+ 真能点的动作。
  if (state.status === 'loading') {
    return (
      <div className="fp-root" ref={rootRef}>
        <div className="fp-blank">
          <div className="fp-blank-card">
            <div className="fp-blank-mark">
              <span className="fp-blank-glyph">鱼</span>
              <span>鱼排编辑器</span>
            </div>
            <div className="fp-blank-line fp-muted">正在打开文档…</div>
            <div className="fp-loading-bar" />
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error' && !state.docKey) {
    return (
      <div className="fp-root" ref={rootRef}>
        <div className="fp-blank">
          <div className="fp-blank-card">
            <div className="fp-blank-mark">
              <span className="fp-blank-glyph">鱼</span>
              <span>鱼排编辑器</span>
            </div>
            <div className="fp-blank-line">面板没能载入：{state.error}</div>
            <div className="fp-blank-actions">
              <Btn primary onClick={() => void store.actions.init()}>
                重试
              </Btn>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'empty' || !state.docKey) {
    return (
      <div className="fp-root" ref={rootRef}>
        <div className="fp-blank">
          <div className="fp-blank-card">
            <div className="fp-blank-mark">
              <span className="fp-blank-glyph">鱼</span>
              <span>鱼排编辑器</span>
            </div>
            <div className="fp-blank-line fp-muted">
              这个会话还没有鱼排文档。可以让模型调用 <code>fishpai_open</code> 打开一篇 Markdown，
              也可以自己先起一篇：
            </div>
            <div className="fp-blank-actions">
              <Btn primary onClick={() => void store.actions.createDoc()}>
                新建空白文档
              </Btn>
            </div>
            {state.docs.length ? (
              <div className="fp-doclist">
                <div className="fp-doclist-head">最近打开</div>
                {state.docs.slice(0, 6).map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className="fp-docrow"
                    title={d.path}
                    onClick={() => void store.actions.openDocByKey(d.key)}
                  >
                    <span className="fp-docrow-title">{d.title || '未命名'}</span>
                    <span className="fp-spacer" />
                    <span className="fp-muted">{fmtTime(d.updatedAt)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
          <Btn
            on={state.meta.mobile}
            disabled={mode === 'edit'}
            onClick={() => store.actions.setMeta({ mobile: !state.meta.mobile })}
            title={
              mode === 'edit'
                ? '现在是「编辑」视图，看不到预览；切到「预览」或「并排」才看得出手机宽度的效果'
                : '按手机宽度预览（375px）'
            }
          >
            手机
          </Btn>
          <span className="fp-spacer" />
          <Btn title="重新载入文档（有未保存的改动会先保存，不会丢字）" onClick={() => void store.actions.reloadSafely()}>
            刷新
          </Btn>
          <Btn primary title="下载「复制到公众号」形态的自包含 HTML 文件（本地图片已内嵌 base64）" onClick={() => void onExport()}>
            导出 HTML
          </Btn>
          <Btn primary title={`复制后直接粘进公众号编辑器（${COPY_HINT}）`} onClick={() => void onCopy()}>
            复制到公众号
          </Btn>
        </div>

        <div className="fp-row">
          <select
            className="fp-select"
            value={state.meta.theme}
            title="主题：默认公众号是给微信做的；其它风格更适合导出 HTML"
            onChange={(e) => void store.actions.setMeta({ theme: e.target.value })}
          >
            <optgroup label="适合公众号">
              {state.themes
                .filter((t) => t.wechatSafe)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.emoji} {t.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="其它风格（微信可能掉样式）">
              {state.themes
                .filter((t) => !t.wechatSafe)
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.emoji} {t.name}
                  </option>
                ))}
            </optgroup>
          </select>

          {/* 主题色只对用 {{PRIMARY}} 的主题有效（当前只有「默认公众号」）。用不上就不显示，别放个点了没反应的控件。 */}
          {currentTheme?.usesAccent ? (
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
          ) : null}

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
            disabled={!docHasLinks}
            title={
              docHasLinks
                ? '正文外链转文末「参考资料」（微信正文不支持外链）'
                : '正文里没有外链，这个开关现在不影响效果；它的作用是：把正文外链转成文末「参考资料」（微信正文不支持外链）'
            }
            onClick={() => void store.actions.setMeta({ footnotes: !state.meta.footnotes })}
          >
            脚注
          </Btn>
          <Btn
            on={state.meta.macCodeBlock}
            disabled={!docHasCode}
            title={
              docHasCode
                ? '代码块用 mac 标题栏形态（红黄绿圆点 + 语言标签）'
                : '正文里没有代码块，这个开关现在不影响效果；它的作用是：给代码块加 mac 标题栏形态'
            }
            onClick={() => void store.actions.setMeta({ macCodeBlock: !state.meta.macCodeBlock })}
          >
            Mac 代码框
          </Btn>
          <Btn
            title="在下方「批注」里写一句给模型的话（会挂在光标所在段落上）"
            onClick={() => {
              setTab('notes')
              // 不清空已有草稿，直接聚焦输入框——点了就能打字
              requestAnimationFrame(() => noteInputRef.current?.focus())
            }}
          >
            ＋批注
          </Btn>
        </div>
      </div>

      {currentTheme && !currentTheme.wechatSafe ? (
        <div className="fp-banner" data-kind="warn">
          <span>
            {currentTheme.gradientText
              ? `「${currentTheme.name}」用渐变文字（background-clip: text + 透明字色），微信编辑器可能丢掉渐变导致标题异常。`
              : `「${currentTheme.name}」是深色底，粘进公众号会是一整块深色。`}
            建议用「导出」拿 HTML，或换回「默认公众号」。
          </span>
        </div>
      ) : null}

      {state.error ? (
        <div className="fp-banner" data-kind="error">
          <span>{state.error}</span>
          <span className="fp-spacer" />
          <Btn onClick={() => void store.actions.reloadSafely()}>重试</Btn>
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
        noteInputRef={noteInputRef}
        onAddNote={() => void onAddNote()}
        onResolve={(id) => void store.actions.updateNote(id, { resolved: true })}
        onRemove={(id) => void store.actions.removeNote(id)}
        onJump={jumpToLine}
        onJumpNote={jumpToNote}
        onRestore={(id, label) => void store.actions.restore(id, label)}
      />

      <div className="fp-status">
        <span>{countWords(state.markdown)} 字</span>
        <span>约 {readingMinutes(state.markdown)} 分钟</span>
        <span>rev {state.revision}</span>
        <span>{state.saving ? '保存中…' : state.dirty ? '未保存' : '已保存'}</span>
        <span className="fp-spacer" />
        {state.images.length ? (
          <span
            className={manualImages.length ? 'fp-warn' : undefined}
            title={
              manualImages.length
                ? `这些图不会被内嵌，粘进公众号后要在编辑器里手动上传：\n${manualImages.map((i) => i.src).join('\n')}`
                : '本地图会内嵌成 base64，复制到公众号时跟着一起过去，不用手动重传'
            }
          >
            图片 {state.images.length}
            {manualImages.length ? `（${manualImages.length} 需手动上传）` : ''}
          </span>
        ) : null}
        {state.placeholders.length ? <span className="fp-warn">待补 {state.placeholders.length}</span> : null}
        {openNotes.length ? <span>批注 {openNotes.length}</span> : null}
        <span className="fp-muted" title={currentTheme ? currentTheme.desc : undefined}>
          {state.themeName}
          {currentTheme ? ` · ${currentTheme.wechatSafe ? '适合微信' : '导出 HTML 更稳'}` : ''}
        </span>
      </div>

      {state.toast ? (
        <div className="fp-toast" data-kind={state.toast.kind}>
          {state.toast.text}
        </div>
      ) : null}
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
          {props.currentBlock ? `${kindLabel(props.currentBlock.kind)} · 第 ${props.currentBlock.startLine} 行` : '未在块内'}
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
  noteInputRef: React.RefObject<HTMLTextAreaElement>
  onAddNote: () => void
  onResolve: (id: string) => void
  onRemove: (id: string) => void
  onJump: (line: number) => void
  onJumpNote: (note: Note) => void
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
                ref={props.noteInputRef}
                placeholder="给光标所在段落留一条批注…（模型下次读文档时会看到）"
                value={props.noteDraft}
                onChange={(e) => props.setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') props.onAddNote()
                }}
              />
              <div className="fp-row">
                <span className="fp-muted">{MOD_KEY} + Enter 添加</span>
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
                  <Btn onClick={() => props.onJumpNote(n)} title="跳到引用它的那段并选中">
                    定位
                  </Btn>
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
              {/* 块 id 是给模型用的哈希，人只需要知道"第几块、什么类型"；id 放 title 里供核对 */}
              <div className="fp-item-head" title={`block_id: ${b.id}`}>
                <span>第 {b.index + 1} 块</span>
                <span>{kindLabel(b.kind)}</span>
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
