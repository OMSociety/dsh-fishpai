/**
 * 面板状态机：把"文档 + 保存 + 预览 + 批注 + 冲突"收在一个可订阅对象里，
 * React 侧只用 `useSyncExternalStore` 读快照 + 调动作，不自己管请求时序。
 *
 * 三条时序纪律：
 *   1. **预览跟手**：打字 300ms 后用**本地文本**重新渲染（不等人保存），所见即所排。
 *   2. **保存防抖 800ms**，且一定带 `baseRevision`；409 不丢内容，转成界面上的冲突条。
 *   3. **AI 改过就提示**：轮询发现 revision 变了，干净时静默重载，有未保存改动时只挂提示，绝不吞掉人的输入。
 */
import {
  api,
  ConflictError,
  type Block,
  type DocMeta,
  type HistoryEntry,
  type ImageInfo,
  type Note,
  type Placeholder,
  type ThemeInfo,
} from './api'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

/**
 * 单张粘贴图片的大小上限。宿主那边（`plugin/host/store.mjs` 的 `MAX_ASSET_BYTES`）才是权威，
 * 这里只是先拦一道，好给一句人话提示，而不是等一个 413。
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export interface FishpaiState {
  status: 'loading' | 'ready' | 'empty' | 'error'
  error: string | null
  sessionId: string
  docKey: string | null
  path: string
  title: string
  markdown: string
  savedMarkdown: string
  revision: number
  meta: DocMeta
  blocks: Block[]
  notes: Note[]
  placeholders: Placeholder[]
  images: ImageInfo[]
  /**
   * 预览要用的本地图片：`src` → data URI。
   *
   * 为什么在面板这一侧转：预览 iframe 是 `srcdoc` + 沙箱（不透明源），
   * 里面写 `assets/x.png` 这种相对路径只会解析到 DSH 自己的地址、拿到 404，
   * 而从那个源去请求 `/fishpai/api/asset` 又会被同源守卫挡掉（`Origin: null`）。
   * 由面板（同源）取回来、以 data URI 塞进预览，是唯一不放松安全边界又能看见图的办法。
   */
  imageMap: Record<string, string>
  history: HistoryEntry[]
  /** 这个工作目录里已经打开过的鱼排文档（空面板上的「最近打开」用它）。 */
  docs: Array<{ key: string; path: string; title: string; revision: number; updatedAt: number }>
  themes: ThemeInfo[]
  presets: Array<{ name: string; color: string }>
  sizes: string[]
  previewHtml: string
  themeName: string
  previewing: boolean
  saving: boolean
  dirty: boolean
  conflict: { revision: number; markdown: string } | null
  external: { revision: number; reason: 'revision' | 'switch'; key?: string } | null
  caretLine: number
  toast: Toast | null
}

const DEFAULT_META: DocMeta = {
  theme: 'default',
  color: null,
  font: 'sans',
  fontSize: '16px',
  footnotes: true,
  macCodeBlock: true,
  mobile: false,
}

function initialState(sessionId: string): FishpaiState {
  return {
    status: 'loading',
    error: null,
    sessionId,
    docKey: null,
    path: '',
    title: '',
    markdown: '',
    savedMarkdown: '',
    revision: 0,
    meta: { ...DEFAULT_META },
    blocks: [],
    notes: [],
    placeholders: [],
    images: [],
    imageMap: {},
    history: [],
    docs: [],
    themes: [],
    presets: [],
    sizes: ['14px', '15px', '16px', '17px', '18px'],
    previewHtml: '',
    themeName: '',
    previewing: false,
    saving: false,
    dirty: false,
    conflict: null,
    external: null,
    caretLine: 1,
    toast: null,
  }
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/** 属性值里的实体还原：Markdown 里的 `a&b.png` 在 HTML 里是 `a&amp;b.png`，两边要对得上。 */
function decodeAttr(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] || m)
}

/** 把预览 HTML 里本地图片的 `src` 换成面板取回来的 data URI（没取到的保持原样）。 */
function inlineImages(html: string, imageMap: Record<string, string>): string {
  if (!html || !Object.keys(imageMap).length) return html
  return html.replace(/(<img\b[^>]*?\bsrc=")([^"]*)(")/g, (full, pre, src, post) => {
    const hit = imageMap[src] || imageMap[decodeAttr(src)]
    return hit ? `${pre}${hit}${post}` : full
  })
}

/**
 * 预览 iframe 的 srcdoc：内联主题样式已在 html 里，这里只补容器样式、滚动上报脚本，
 * 以及本地图片的 data URI（见 `imageMap` 的说明）。
 */
export function buildSrcdoc(html: string, imageMap: Record<string, string> = {}): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:#fff}
  fp-block{display:block;height:0;overflow:hidden}
  img{max-width:100%;height:auto}
</style></head><body>${inlineImages(html, imageMap)}
<script>
(function(){
  var top=null;
  function report(){
    var marks=document.querySelectorAll('fp-block');
    var best=null;
    for(var i=0;i<marks.length;i++){
      var r=marks[i].getBoundingClientRect();
      if(r.top<=8){best=marks[i].getAttribute('data-b')}
      else if(best===null){best=marks[i].getAttribute('data-b');break}
    }
    if(report.last!==best){report.last=best;parent.postMessage({fishpai:'visible',id:best},'*')}
  }
  addEventListener('scroll',report,{passive:true});
  addEventListener('message',function(e){
    var d=e.data;
    if(!d||d.fishpai!=='reveal')return;
    var el=document.querySelector('fp-block[data-b="'+d.id+'"]');
    if(el&&el.nextElementSibling)el.nextElementSibling.scrollIntoView({block:'start'});
    else if(el)el.scrollIntoView({block:'start'});
  });
  report();
})();
</script></body></html>`
}

/** Blob → data URI。预览 iframe 是不透明源，`blob:` URL 拿不过去，只能走 data URI。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const Reader: any = (globalThis as any).FileReader
    if (!Reader) return reject(new Error('这个浏览器不支持本地图片预览'))
    const reader = new Reader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

/** File → base64（不含 `data:` 前缀）。分块转换：一次 spread 整张大图会爆调用栈。 */
async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(binary)
}

/**
 * 建一个面板状态机。
 * @param sessionId 当前会话（面板与文档都按会话隔离）
 * @param onDocLoaded 文档就绪时的回调（把 docKey 上报给外层，供轮询/打开使用）
 */
export function createFishpaiStore(sessionId: string, onDocLoaded?: (docKey: string) => void) {
  let state = initialState(sessionId)
  const listeners = new Set<() => void>()
  let toastSeq = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let previewTimer: ReturnType<typeof setTimeout> | null = null

  const emit = () => {
    for (const fn of listeners) fn()
  }
  const patch = (next: Partial<FishpaiState>) => {
    state = { ...state, ...next }
    emit()
  }
  const toast = (text: string, kind: 'info' | 'error' = 'info') => {
    toastSeq += 1
    const id = toastSeq
    patch({ toast: { id, text, kind } })
    // 提示自己会消失，不需要用户去关
    setTimeout(() => {
      if (state.toast && state.toast.id === id) patch({ toast: null })
    }, kind === 'error' ? 5000 : 2600)
  }

  // ── 预览里的本地图片 ───────────────────────────────────────
  // 按文档缓存（同一篇文档里同一张图只取一次，之后每次重渲染都直接复用）；
  // 取不到的记成空串，避免每次预览都白跑一趟请求。
  const imageCache = new Map<string, Map<string, string>>()

  async function ensureImages(images: ImageInfo[], docKey: string) {
    const bucket = imageCache.get(docKey) || new Map<string, string>()
    imageCache.set(docKey, bucket)
    const wanted = images.filter((img) => img.embed && !bucket.has(img.src))
    if (!wanted.length) return
    await Promise.all(
      wanted.map(async (img) => {
        try {
          const res = await fetch(api.assetUrl(state.sessionId, docKey, img.src))
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          bucket.set(img.src, await blobToDataUrl(await res.blob()))
        } catch {
          // 取不回来就让预览保持原样：正文一个字没动，复制/导出那条路仍会把它内嵌进去
          bucket.set(img.src, '')
        }
      }),
    )
    if (state.docKey !== docKey) return // 期间换文档了：这份图不属于当前预览
    patch({ imageMap: Object.fromEntries(bucket) })
  }

  // ── 预览 ───────────────────────────────────────────────────
  // 预览是面板唯一的「当前正文」视图来源：块清单、批注锚点、行内占位、图片提示都跟着它走，
  // 所以打字时这些信息不会停在"打开文档的那一刻"。
  //
  // 批注是唯一会被两条路同时写的东西（预览回带的 vs 加/删批注的），所以它单独带一个 epoch：
  // 预览出发时记下号，回来时号变了就只更新正文相关的东西，不覆盖刚改完的批注。
  let previewToken = 0
  let notesEpoch = 0

  async function refreshPreview(markdown: string, meta: DocMeta) {
    if (!state.docKey) return
    const docKey = state.docKey
    const token = ++previewToken
    const epoch = notesEpoch
    patch({ previewing: true })
    try {
      const res = await api.renderPreview(state.sessionId, state.docKey, markdown, meta)
      if (token !== previewToken) return // 有更新的渲染在路上，丢掉这次
      patch({
        previewHtml: res.html,
        blocks: res.blocks,
        placeholders: res.placeholders,
        images: res.images,
        ...(epoch === notesEpoch ? { notes: res.notes } : {}),
        themeName: res.themeName,
        previewing: false,
      })
      void ensureImages(res.images, docKey)
    } catch (error) {
      if (token !== previewToken) return
      patch({ previewing: false, error: `预览渲染失败：${(error as Error).message}` })
    }
  }

  const schedulePreview = () => {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(() => refreshPreview(state.markdown, state.meta), 300)
  }

  // ── 保存 ───────────────────────────────────────────────────
  // 串行化：并发保存会拿着同一个 baseRevision 撞出 409，在界面上表现为"莫名冲突"。
  let saveInFlight = false

  async function saveNow() {
    if (!state.docKey || !state.dirty) return
    // 冲突未决之前不再重试：否则用户每打一个字都会再撞一次 409
    if (state.conflict) return
    if (saveInFlight) return // 在飞的那次结束后会因 dirty 自动再排一次
    const snapshotMarkdown = state.markdown
    saveInFlight = true
    patch({ saving: true })
    try {
      const res = await api.save(state.sessionId, state.docKey, snapshotMarkdown, state.revision, state.meta)
      patch({
        saving: false,
        revision: res.revision,
        savedMarkdown: snapshotMarkdown,
        dirty: state.markdown !== snapshotMarkdown,
        conflict: null,
        external: null,
        // 每次写入都会留一份快照，宿主顺手把它回带过来——「历史」抽屉不用再手动刷新
        ...(res.history ? { history: res.history } : {}),
      })
    } catch (error) {
      if (error instanceof ConflictError) {
        patch({ saving: false, conflict: { revision: error.revision, markdown: error.markdown } })
        return
      }
      patch({ saving: false, error: `保存失败：${(error as Error).message}` })
    } finally {
      saveInFlight = false
    }
    if (state.dirty && !state.conflict) scheduleSave()
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void saveNow(), 800)
  }

  // ── 载入 ───────────────────────────────────────────────────
  async function loadDoc(docKey: string, opts: { keepLocal?: boolean } = {}) {
    if (!docKey) return
    const res = await api.doc(state.sessionId, docKey)
    const keep = opts.keepLocal && state.dirty && state.docKey === docKey
    notesEpoch += 1
    patch({
      status: 'ready',
      error: null,
      docKey,
      path: res.doc.path,
      title: res.doc.title,
      markdown: keep ? state.markdown : res.doc.markdown,
      savedMarkdown: res.doc.markdown,
      dirty: keep ? true : false,
      revision: res.doc.revision,
      meta: res.meta,
      blocks: res.blocks,
      notes: res.notes,
      placeholders: res.placeholders,
      images: res.images,
      imageMap: Object.fromEntries(imageCache.get(docKey) || []),
      history: res.history,
      conflict: null,
      external: null,
    })
    onDocLoaded?.(docKey)
    void ensureImages(res.images, docKey)
    void refreshPreview(keep ? state.markdown : res.doc.markdown, res.meta)
  }

  async function init() {
    try {
      patch({ status: 'loading', error: null })
      const themes = await api.themes().catch(() => null)
      if (themes) patch({ themes: themes.themes, presets: themes.presets, sizes: themes.sizes })
      const st = await api.state(state.sessionId)
      // 空面板上要列「最近打开」，所以这一份清单即使不打开文档也要留着
      patch({ docs: Array.isArray(st.docs) ? st.docs : [] })
      if (!st.active) {
        patch({ status: 'empty' })
        return
      }
      await loadDoc(st.active.key)
    } catch (error) {
      patch({ status: 'error', error: (error as Error).message })
    }
  }

  // ── 对外动作 ───────────────────────────────────────────────
  const actions = {
    init,

    /**
     * 面板上自己起一篇（空文档 + 一行标题），不必等模型 `fishpai_open`。
     * 宿主那边会把它落到 `.fishpai/docs/` 下，和模型建的是同一类普通 .md。
     */
    async createDoc() {
      try {
        const res = await api.createDoc(state.sessionId)
        await loadDoc(res.docKey)
        toast('新建了一篇空白文档，可以直接在编辑器里写')
      } catch (error) {
        toast(`新建文档失败：${(error as Error).message}`, 'error')
      }
    },

    /** 从「最近打开」切一篇：只改这个会话的当前文档，不动模型留下的打开请求。 */
    async openDocByKey(key: string) {
      if (!key || key === state.docKey) return
      try {
        await api.activate(state.sessionId, key)
        await loadDoc(key)
      } catch (error) {
        toast(`打开失败：${(error as Error).message}`, 'error')
      }
    },

    setMarkdown(text: string) {
      patch({ markdown: text, dirty: text !== state.savedMarkdown })
      schedulePreview()
      scheduleSave()
    },

    setCaret(line: number) {
      if (line !== state.caretLine) patch({ caretLine: line })
    },

    /**
     * 把一张粘贴/拖进来的图片存到宿主（文档同级的 `assets/`），回它的相对路径。
     *
     * 这里**只存**、不插正文：插哪里由编辑器按当下的光标决定（上传期间人可能挪了光标），
     * 而且这样"存失败"与"改正文"是两件事——图没存进来，正文一个字都不会被碰。
     */
    async uploadImage(file: File): Promise<{ src: string; bytes: number }> {
      if (!state.docKey) throw new Error('还没有打开文档：先让模型 fishpai_open 一篇，或新建一篇')
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`${(file.size / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限，先压缩一下再粘`)
      }
      const data = await fileToBase64(file)
      return api.upload(state.sessionId, state.docKey, { name: (file as any).name, mime: file.type, data })
    },

    /** 光标所在块（加批注、跳预览都用它）。 */
    currentBlock(): Block | null {
      const line = state.caretLine
      return state.blocks.find((b) => b.startLine <= line && line <= b.endLine) || state.blocks[0] || null
    },

    async setMeta(next: Partial<DocMeta>) {
      const meta = { ...state.meta, ...next }
      patch({ meta })
      if (state.docKey) {
        try {
          await api.meta(state.sessionId, state.docKey, next)
        } catch (error) {
          toast(`设置未保存：${(error as Error).message}`, 'error')
        }
      }
      void refreshPreview(state.markdown, meta)
    },

    /**
     * 加一条批注。**返回是否真的加上了**——调用方据此决定要不要清空输入框：
     * 没加上还把用户刚写的字抹掉，是这类面板最容易咬人的地方。
     *
     * 先落盘再取块：批注靠块 id / 块序号锚定，而宿主是按**磁盘上的正文**解析锚点的。
     * 所以这里等保存完、再用同一次预览的块边界取块，锚点才和宿主看到的是同一份。
     */
    async addNote(text: string): Promise<boolean> {
      if (!state.docKey) {
        toast('还没有打开文档：先让模型 fishpai_open 一篇，再留批注', 'error')
        return false
      }
      await saveNow()
      await refreshPreview(state.markdown, state.meta)
      const block = actions.currentBlock()
      if (!block) {
        toast('正文还是空的：先在编辑器里写一段，再把批注挂上去', 'error')
        return false
      }
      try {
        // 引用片段由宿主按当前正文补全，不会与正文不一致；blockIndex 是块 id 失效时的兜底
        const res = await api.notes(state.sessionId, state.docKey, {
          action: 'add',
          note: { blockId: block.id, blockIndex: block.index, text, author: 'human' },
        })
        notesEpoch += 1
        patch({ notes: res.notes })
        toast('批注已加；模型下次 fishpai_read 就能看到')
        return true
      } catch (error) {
        toast(`批注失败：${(error as Error).message}　文字还在输入框里，可以直接重试`, 'error')
        return false
      }
    },

    async updateNote(id: string, next: Partial<Note>) {
      if (!state.docKey) return
      try {
        const res = await api.notes(state.sessionId, state.docKey, { action: 'update', id, patch: next })
        notesEpoch += 1
        patch({ notes: res.notes })
      } catch (error) {
        toast(`批注更新失败：${(error as Error).message}`, 'error')
      }
    },

    async removeNote(id: string) {
      if (!state.docKey) return
      try {
        const res = await api.notes(state.sessionId, state.docKey, { action: 'remove', id })
        notesEpoch += 1
        patch({ notes: res.notes })
      } catch (error) {
        toast(`删除失败：${(error as Error).message}`, 'error')
      }
    },

    async restore(id: string, label: string) {
      if (!state.docKey) return
      try {
        await api.history(state.sessionId, state.docKey, { action: 'restore', id })
        await loadDoc(state.docKey)
        toast(`已回滚到 ${label}`)
      } catch (error) {
        if (error instanceof ConflictError) {
          patch({ conflict: { revision: error.revision, markdown: error.markdown } })
          return
        }
        toast(`回滚失败：${(error as Error).message}`, 'error')
      }
    },

    /**
     * 冲突处理。
     * - `mine`    ：用我的覆盖（服务端那份留在历史里）
     * - `theirs`  ：采用 AI 的版本——**先把我的草稿存进历史**，绝不静默丢字
     */
    async resolveConflict(choice: 'mine' | 'theirs') {
      if (!state.conflict || !state.docKey) return
      const conflict = state.conflict
      const draft = state.markdown
      if (choice === 'theirs') {
        try {
          await api.history(state.sessionId, state.docKey, { action: 'stash', markdown: draft, label: '冲突时我的版本' })
        } catch (error) {
          toast(`先把你的稿子存进历史失败：${(error as Error).message}`, 'error')
          return // 存不下来就不覆盖，宁可停在冲突态
        }
        patch({ markdown: conflict.markdown, savedMarkdown: conflict.markdown, revision: conflict.revision, conflict: null, dirty: false })
        schedulePreview()
        await actions.reload()
        toast('已采用 AI 的版本；你的稿子已存进「历史」，点那一版可回滚取回')
        return
      }
      patch({ revision: conflict.revision, conflict: null })
      await saveNow()
      toast('已用你的版本覆盖，AI 的版本留在历史里')
    },

    /** 导出/复制用：拿「复制到公众号」形态的 HTML（本地图片已内嵌 base64）。 */
    async publishHtml(): Promise<string> {
      if (!state.docKey) throw new Error('还没有打开文档')
      await saveNow()
      const res = await api.renderPublish(state.sessionId, state.docKey, state.markdown, state.meta)
      return res.html
    },

    /** 轮询发现宿主的当前文档变了（AI 写入 / 换了一篇 / 别的窗口写的）。 */
    async onActiveDoc(key: string, revision: number) {
      if (!key) return
      if (state.docKey && key !== state.docKey) {
        // 模型换文档了：有未保存改动就只提示，别把用户正在写的字换掉
        if (state.dirty) {
          patch({ external: { revision, reason: 'switch', key } })
          return
        }
        await loadDoc(key)
        toast('模型打开了另一篇文档')
        return
      }
      if (!state.docKey) {
        await loadDoc(key)
        return
      }
      if (revision <= state.revision) return
      if (state.dirty) {
        patch({ external: { revision, reason: 'revision' } })
        return
      }
      await loadDoc(key)
      toast(`AI 更新了文档（rev ${revision}）`)
    },

    async reload() {
      if (state.docKey) await loadDoc(state.docKey)
    },

    /**
     * 「刷新」按钮走这条路：先落盘再重载。
     * 直接 reload 会把用户还没保存的输入丢掉——这是那个按钮最容易咬人的地方。
     */
    async reloadSafely() {
      if (!state.docKey) return
      if (state.conflict) {
        toast('先处理上方的冲突再刷新', 'error')
        return
      }
      if (state.dirty) {
        await saveNow()
        if (state.dirty) {
          toast('保存没成功，已取消刷新以免丢字', 'error')
          return
        }
      }
      await loadDoc(state.docKey)
      toast('已重新载入')
    },

    /** 采用外部版本（放弃自己的未保存改动）——换文档时切到新文档。 */
    async acceptExternal() {
      const target = state.external?.key || state.docKey
      if (!target) return
      await loadDoc(target)
    },

    toast,
    flush() {
      if (saveTimer) clearTimeout(saveTimer)
      return saveNow()
    },
  }

  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    actions,
    dispose() {
      if (saveTimer) clearTimeout(saveTimer)
      if (previewTimer) clearTimeout(previewTimer)
      listeners.clear()
    },
  }
}

export type FishpaiStore = ReturnType<typeof createFishpaiStore>
