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
  /** 正文里会被转成脚注的链接数（来自渲染结果，决定「脚注」开关能不能点）。 */
  linkCount: number | null
  /** 正文里有没有代码块（同样来自渲染结果，决定「Mac 代码框」开关能不能点）。 */
  hasCode: boolean | null
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
  /**
   * 字体预设（`sans` / `serif` / `mono`）。宿主一直在 `/themes` 里回它，但面板以前既没存也没用——
   * 于是"把正文换成衬线"在界面上根本做不到，而主题自带的字体栈又会被这个预设覆盖（站点既有行为）。
   */
  fonts: string[]
  sizes: string[]
  previewHtml: string
  /**
   * 预览 iframe 的 highlight.js 配色（宿主从同一份 hljs-map.json 生成）。
   * 沙箱 srcdoc 里没有 hljs 样式表，代码块 token 只有 class、没有颜色——
   * 不注入的话预览是黑的，而复制/导出的成品是彩色的。
   */
  hljsCss: string
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
    linkCount: 0,
    hasCode: false,
    imageMap: {},
    history: [],
    docs: [],
    themes: [],
    presets: [],
    fonts: ['sans', 'serif', 'mono'],
    sizes: ['14px', '15px', '16px', '17px', '18px'],
    previewHtml: '',
    hljsCss: '',
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
 * `hljsCss` 是宿主从同一份 hljs-map.json 生成的配色：沙箱 srcdoc 里没有 highlight.js
 * 样式表，不注入的话代码块只有 class、没有颜色（预览黑的，成品却是彩色的）。
 */
export function buildSrcdoc(html: string, imageMap: Record<string, string> = {}, hljsCss = ''): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:#fff}
  fp-block{display:block;height:0;overflow:hidden}
  img{max-width:100%;height:auto}
${hljsCss}
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
  // 提示条自己会消失，但它的定时器也必须能被 dispose 收走——否则面板卸载后
  // 这个闭包还攥着 state 不放，在已卸载的 store 上 patch 一次。
  const toastTimers = new Set<ReturnType<typeof setTimeout>>()

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
    const timer = setTimeout(() => {
      toastTimers.delete(timer)
      if (state.toast && state.toast.id === id) patch({ toast: null })
    }, kind === 'error' ? 5000 : 2600)
    toastTimers.add(timer)
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
  let loadToken = 0
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
        hljsCss: res.hljsCss || '',
        blocks: res.blocks,
        placeholders: res.placeholders,
        images: res.images,
        linkCount: res.linkCount,
        hasCode: res.hasCode,
        ...(epoch === notesEpoch ? { notes: res.notes } : {}),
        themeName: res.themeName,
        previewing: false,
        // 成功即清掉上一次的失败红条——否则一次瞬时失败会一直挂到点「重试」或重载文档为止
        error: null,
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
    // 「外部更新」提示在场时同样不自动保存：本地 revision 已过期，写出去必然 409，
    // 只会把这条提示替换成语义重叠的「冲突」提示。用户的输入留在编辑器里，
    // 等他点横幅上的按钮（flush 会采用服务端版本号去写，正是「保留我的」）。
    if (state.external) return
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
  /**
   * 载入一篇文档。
   *
   * 带请求令牌：快速切文档、或轮询（`onActiveDoc`）与点击同时发生时，先发的响应可能后到——
   * 没有令牌就会把已经切过去的那一篇盖回来（面板显示 A、宿主当前却是 B，
   * 此后打的字会按 `docKey = A` 存进 A）。`refreshPreview` 一直有同款 `previewToken`，这里补齐。
   *
   * 未保存的改动由调用方负责（`reloadSafely` / `restore` / `createDoc` / `openDocByKey`
   * 都是"先落盘再重载"）；但调用方的 dirty 检查只在 await **之前**——
   * fetch 期间用户敲的那一笔，靠这里在 patch 前再核一次 dirty 兜住：正文保留用户的输入，
   * 别的视图信息照常更新，下一拍预览会跟上。
   */
  async function loadDoc(docKey: string) {
    if (!docKey) return
    const token = ++loadToken
    const dirtyBefore = state.dirty
    const res = await api.doc(state.sessionId, docKey)
    if (token !== loadToken) return // 已经有更新的一次载入在路上，丢掉这次
    // fetch 期间用户又敲了字：不能拿服务端的版本整片盖掉（「绝不静默覆盖人的手改」的同一条纪律）
    const keepTyped = state.dirty && !dirtyBefore
    notesEpoch += 1
    patch({
      status: 'ready',
      error: null,
      docKey,
      path: res.doc.path,
      title: res.doc.title,
      ...(keepTyped ? {} : { markdown: res.doc.markdown, savedMarkdown: res.doc.markdown, dirty: false }),
      revision: res.doc.revision,
      meta: res.meta,
      blocks: res.blocks,
      notes: res.notes,
      placeholders: res.placeholders,
      images: res.images,
      // `/doc` 不带渲染信息：置 `null` 表示"还不知道"，开关因此**不会闪一下变灰**。
      // 紧随其后的那次预览会给出真值（`false`/`0` 才是"确实没有"）。
      linkCount: null,
      hasCode: null,
      imageMap: Object.fromEntries(imageCache.get(docKey) || []),
      history: res.history,
      conflict: null,
      external: null,
    })
    onDocLoaded?.(docKey)
    void ensureImages(res.images, docKey)
    // keepTyped 时正文是用户刚敲的那一份，预览也要跟着它走
    void refreshPreview(state.markdown, res.meta)
  }

  /**
   * 切换文档前的统一约定：有未保存的输入就先落盘，保存失败就取消切换。
   * 少了这一步，「新建空白文档 / 最近打开」会把用户刚敲的字静默丢掉——
   * 与 `reloadSafely` / `restore` 是同一条纪律，只是这两个入口原先漏了。
   */
  async function saveBeforeSwitch(): Promise<boolean> {
    if (!state.dirty || state.conflict || state.external) return true
    await saveNow()
    return !state.dirty
  }

  /**
   * 重新拉主题清单：模型可能刚存了一套「自定义主题」，那是**工作目录级**的，
   * 面板启动时拉过一次就不再看——不刷新的话列表里不会有它，用户会以为没生效。
   * 失败就保持旧清单，不打扰用户。
   */
  async function refreshThemes() {
    const res = await api.themes(state.sessionId).catch(() => null)
    if (res) patch({ themes: res.themes, presets: res.presets, sizes: res.sizes, fonts: res.fonts })
  }

  async function init() {
    try {
      patch({ status: 'loading', error: null })
      await refreshThemes()
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
        if (!(await saveBeforeSwitch())) {
          toast('保存没成功，已取消新建文档以免丢字', 'error')
          return
        }
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
        if (!(await saveBeforeSwitch())) {
          toast('保存没成功，已取消切换以免丢字', 'error')
          return
        }
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
     * 删掉工作目录级的那一套「自定义主题」（面板主题列表「我的」那一组右边的 ×）。
     * 只有一套，删了那一组就整个消失。宿主已把正用着它的当前文档退回「默认公众号」，
     * 这里把本地的 meta 与预览也同步过去，免得预览还停在已经不存在的主题上。
     */
    async clearCustomTheme() {
      try {
        const res = await api.clearTheme(state.sessionId)
        if (!res.removed) {
          toast('本来就没有自定义主题，什么都没动')
          return
        }
        await refreshThemes()
        if (state.meta.theme === 'custom') {
          const meta = { ...state.meta, theme: 'default' }
          patch({ meta })
          void refreshPreview(state.markdown, meta)
        }
        toast(res.reverted ? '已移除自定义主题；当前文档退回「默认公众号」' : '已移除自定义主题')
      } catch (error) {
        toast(`移除失败：${(error as Error).message}`, 'error')
      }
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
      // 与 `reloadSafely` 同一个约定：回滚会整篇换掉正文，先把未保存的输入落盘。
      // 少了这一步，"回滚到某一版"就顺带静默丢掉了用户刚打的字。
      if (state.conflict) {
        toast('先处理上方的冲突再回滚', 'error')
        return
      }
      if (state.dirty) {
        await saveNow()
        if (state.dirty) {
          toast('保存没成功，已取消回滚以免丢字', 'error')
          return
        }
      }
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

    /** 轮询发现宿主的当前文档变了（AI 写入 / 换了一篇 / 别的窗口写的 / 模型换了主题）。 */
    async onActiveDoc(key: string, revision: number, themeKey?: string) {
      if (!key) return
      // 主题变了（模型用 fishpai_theme 换的）：这是**纯元数据**，正文一个字都不用动，
      // 所以先处理它——尤其不能在用户正打字的时候走 loadDoc 把未保存的内容换掉。
      if (key === state.docKey && themeKey && themeKey !== state.meta.theme) {
        patch({ meta: { ...state.meta, theme: themeKey } })
        void refreshThemes()
        schedulePreview()
      }
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
      // 「外部更新」横幅在场时本地 revision 已过期：采用服务端报回来的版本号去写
      // （这就是横幅上「保留我的」的意思），否则必然撞 409。
      if (state.external) patch({ revision: state.external.revision, external: null })
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
      for (const timer of toastTimers) clearTimeout(timer)
      toastTimers.clear()
      imageCache.clear()
      listeners.clear()
    },
  }
}

export type FishpaiStore = ReturnType<typeof createFishpaiStore>
