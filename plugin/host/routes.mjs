/**
 * `/fishpai/api/*` HTTP 路由：浏览器侧唯一的读写入口。
 *
 * 安全边界（这是浏览器与文件系统之间唯一的一道门）：
 *   1. **同源校验**：`sec-fetch-site: cross-site` 直接拒；`Origin` 缺失视为同源，
 *      但 `Origin: null`（沙箱 iframe / `data:` 文档）一律拒。写方法额外要求
 *      `content-type: application/json`——跨站的简单请求会在浏览器侧先被拦下。
 *   2. **只认 docKey，不认路径**：客户端传索引里的键，宿主自己查出绝对路径，
 *      再用 `resolveInCwd` 复检（挡 `../`、挡符号链接逃逸、挡非白名单扩展名）。
 *      docKey 必须存在于**该 sessionId 工作目录**的索引里，所以跨会话读要先知道对方的
 *      sessionId **与** docKey；本机单用户场景下这条不是授权边界，同源校验才是。
 *   3. **revision 守卫**：写入必须带 `baseRevision`，不匹配返回 409 并回带服务端最新文本，
 *      绝不静默覆盖人的手改。
 *   4. **唯一一处"写新文件"是 `POST /upload`**：粘贴进来的图片落在**文档同级的 `assets/`**，
 *      文件名由宿主生成（时间戳 + 白名单扩展名），客户端给的名字只当作一段可读词，
 *      不参与路径拼接；大小与格式都在 `store.saveAsset` 里卡。正文仍只能由 `/doc` 改。
 */
import fs from 'node:fs'
import { render as renderCore, safeThemeKey, themeCatalog } from '../core/render.mjs'
import { colorPresets } from '../core/runtime.mjs'
import { splitBlocks } from '../core/markdown.mjs'
import { attachPlaceholdersToBlocks, extractPlaceholders, reanchorNotes } from '../core/notes.mjs'
import * as store from './store.mjs'
import { listLocalImages, makeImageResolver, readAsset } from './assets.mjs'

export const API_PREFIX = '/fishpai/api'

const MAX_BODY = 8 * 1024 * 1024

function json(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function fail(res, code, message) {
  json(res, code, { ok: false, error: message })
}

export function sameOrigin(req) {
  const host = req.headers && req.headers.host
  if (!host) return false
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false
  const origin = req.headers.origin
  // 没有 Origin 的是非浏览器客户端或同源 GET；`null` 只可能来自沙箱 iframe / data: 文档，
  // 属于不可信上下文，绝不能与"没有 Origin"混为一谈。
  if (origin === undefined) return true
  if (origin === 'null') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let overflowed = false
    req.on('data', (c) => {
      if (overflowed) return // 超限后继续把流读干，好让 413 有机会回出去
      size += c.length
      if (size > MAX_BODY) {
        overflowed = true
        chunks.length = 0
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (overflowed) return reject(new OversizeError())
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(new Error(`请求体不是合法 JSON: ${error.message}`))
      }
    })
    req.on('error', reject)
  })
}

/** 请求体超过上限：单独一个类型，好回 413 而不是 400。 */
export class OversizeError extends Error {
  constructor() {
    super(`请求体超过 ${Math.round(MAX_BODY / 1024 / 1024)}MB 上限`)
  }
}

function readText(abs) {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

/** 从索引里按 docKey 查出文档绝对路径，并复检它仍在会话工作目录内。 */
function docPathByKey(cwd, key) {
  if (!key) throw new Error('缺少 docKey')
  const entry = store.readIndex(cwd).docs[key]
  if (!entry) throw new Error(`没有这个文档：${key}`)
  return store.resolveInCwd(cwd, entry.path)
}

function publicBlock(b) {
  return {
    index: b.index,
    id: b.id,
    kind: b.kind,
    variant: b.variant,
    lang: b.lang,
    level: b.level,
    headingPath: b.headingPath,
    startLine: b.startLine,
    endLine: b.endLine,
    hash: b.hash,
    preview: b.text.split('\n')[0].slice(0, 60),
  }
}

function publicHistory(history) {
  return (history || []).map((h) => ({ id: h.id, rev: h.rev, at: h.at, by: h.by, chars: h.chars, label: h.label || null }))
}

/**
 * 面板要显示的那一层「当前正文」：块、批注锚点、行内占位、图片清单。
 *
 * **块的 id 一律走 `splitBlocks`**：`fishpai_write` 的 block_id 与批注锚点用的就是它。
 * 预览渲染器自己也返回 blocks，但那是给 HTML 锚点（`<fp-block data-b>`）用的，
 * 且随 `macCodeBlock` 等渲染选项变化——把它当面板的块清单会让「块/第 N 块」与批注对不上号。
 *
 * `/doc` 与 `/render` 预览共用这一份，避免两处各算一套看起来一样、其实会漂移的视图。
 */
function liveSurface({ cwd, key, abs, markdown }) {
  const blocks = splitBlocks(markdown)
  const state = key ? store.readState(cwd, key) : null
  return {
    blocks: blocks.map(publicBlock),
    notes: state ? reanchorNotes(state.notes, blocks) : [],
    placeholders: attachPlaceholdersToBlocks(extractPlaceholders(markdown), blocks),
    images: listLocalImages({ markdown, cwd, docPath: abs }),
  }
}

function docPayload({ cwd, key }) {
  const abs = docPathByKey(cwd, key)
  const state = store.readState(cwd, key)
  if (!state) throw new Error(`文档状态缺失：${key}`)
  const markdown = readText(abs)
  const index = store.readIndex(cwd)
  return {
    doc: {
      key,
      path: abs,
      title: store.docTitle(markdown, abs),
      markdown,
      revision: state.revision,
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
      baseline: state.baseline ? { rev: state.baseline.rev, at: state.baseline.at, by: state.baseline.by } : null,
    },
    meta: {
      // 状态里的主题可能已经被移除（上游主题删过两套）：退回默认，别让文档打不开
      theme: safeThemeKey(state.theme),
      color: state.color,
      font: state.font,
      fontSize: state.fontSize,
      footnotes: state.footnotes !== false,
      macCodeBlock: state.macCodeBlock !== false,
      mobile: !!state.mobile,
    },
    ...liveSurface({ cwd, key, abs, markdown }),
    history: publicHistory(state.history),
    docs: index.docs,
    active: index.active,
  }
}

/**
 * 建一个 `/fishpai/api` 前缀处理器。
 *
 * @param {{resolveCwd: (sessionId: string) => string, log?: (msg: string) => void}} deps
 * @returns {(req: object, res: object) => Promise<void>}
 */
export function createApiHandler({ resolveCwd, log = () => {} }) {
  function sessionOf(source, url) {
    const sessionId = String(source.sessionId || url.searchParams.get('sessionId') || '')
    if (!sessionId) throw new Error('缺少 sessionId')
    const cwd = resolveCwd(sessionId)
    if (!cwd) throw new Error(`无法解析会话工作目录：${sessionId}`)
    return { sessionId, cwd }
  }

  return async function handle(req, res) {
    if (!sameOrigin(req)) return fail(res, 403, '拒绝跨站请求')
    const url = new URL(req.url || '/', 'http://localhost')
    const route = `${req.method} ${url.pathname.slice(API_PREFIX.length)}`

    try {
      if (route === 'GET /themes') {
        return json(res, 200, {
          ok: true,
          themes: themeCatalog(),
          presets: colorPresets(),
          fonts: ['sans', 'serif', 'mono'],
          sizes: ['14px', '15px', '16px', '17px', '18px'],
        })
      }

      if (route === 'GET /state') {
        const { sessionId, cwd } = sessionOf({}, url)
        const key = store.activeKey(cwd, sessionId)
        const state = key ? store.readState(cwd, key) : null
        const pending = store.pendingOpenRequest(state, sessionId)
        const entry = key ? store.readIndex(cwd).docs[key] : null
        return json(res, 200, {
          ok: true,
          cwd,
          active: entry ? { key, path: entry.path, title: entry.title, revision: state ? state.revision : entry.revision } : null,
          openRequest: pending ? { key, at: pending } : null,
          docs: store.listDocs(cwd),
        })
      }

      if (route === 'GET /doc') {
        const { cwd } = sessionOf({}, url)
        return json(res, 200, { ok: true, ...docPayload({ cwd, key: String(url.searchParams.get('docKey') || '') }) })
      }

      if (route === 'GET /asset') {
        const { cwd } = sessionOf({}, url)
        const abs = docPathByKey(cwd, String(url.searchParams.get('docKey') || ''))
        const asset = readAsset({ cwd, docPath: abs, src: String(url.searchParams.get('src') || '') })
        if (!asset) return fail(res, 404, '图片不可读')
        res.writeHead(200, { 'content-type': asset.mime, 'cache-control': 'no-cache' })
        return res.end(asset.bytes)
      }

      // ── 写方法：先卡内容类型 ────────────────────────────────
      const type = String(req.headers['content-type'] || '')
      if (!type.includes('application/json')) return fail(res, 415, '写操作必须使用 application/json')
      const body = await readBody(req)

      if (route === 'PUT /doc') {
        const { sessionId, cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const saved = store.saveDoc({
          cwd,
          docPath: abs,
          markdown: String(body.markdown ?? ''),
          baseRevision: body.baseRevision,
          by: 'human',
          meta: body.meta || {},
        })
        if (!saved.ok) return json(res, 409, { ok: false, conflict: true, revision: saved.revision, markdown: saved.markdown, key })
        store.setActive(cwd, sessionId, key)
        // 带历史一起回：每次写入都会留一份快照，面板的「历史」抽屉因此不用再手动刷新
        return json(res, 200, {
          ok: true,
          revision: saved.state.revision,
          updatedAt: saved.state.updatedAt,
          history: publicHistory(saved.state.history),
        })
      }

      if (route === 'POST /doc') {
        // 人在面板上自己起一篇（空文档 + 一个标题行）。与 fishpai_open 建的是同一类文件，
        // 区别只在 by:'human'、baseline 保持 null（模型还没写过，就不编造"上次写入的版本"）。
        const { sessionId, cwd } = sessionOf(body, url)
        const created = store.createDoc({ cwd, title: body.title })
        store.setActive(cwd, sessionId, created.key)
        return json(res, 200, { ok: true, docKey: created.key, path: created.path })
      }

      if (route === 'POST /active') {
        // 面板上从「最近打开」切一篇：只改这个会话的当前文档，不碰打开请求
        //（打开请求归 /tab-opened，那是"模型刚 open 了一篇"的通道）
        const { sessionId, cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        docPathByKey(cwd, key) // 不存在就抛，回一个可读的 400
        store.setActive(cwd, sessionId, key)
        return json(res, 200, { ok: true, docKey: key })
      }

      if (route === 'POST /upload') {
        // 面板上直接粘贴/拖进来的图片：存到**文档同级的 assets/**，回一个相对文档目录的 src，
        // 面板把它当成 `![](assets/xxx.png)` 插进正文。正文一个字都不在这里改（改由人/模型写）。
        const { cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const saved = store.saveAsset({ cwd, docPath: abs, name: body.name, mime: body.mime, data: body.data })
        return json(res, 200, { ok: true, src: saved.src, path: saved.path, bytes: saved.bytes })
      }

      if (route === 'POST /meta') {
        const { sessionId, cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const state = store.updateMeta({ cwd, docPath: abs, meta: body.meta || {} })
        if (!state) return fail(res, 404, '文档状态缺失')
        store.setActive(cwd, sessionId, key)
        return json(res, 200, { ok: true })
      }

      if (route === 'POST /notes') {
        const { cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const action = String(body.action || 'add')
        if (action === 'add') {
          // 引用片段由宿主按当前正文补全：客户端只给块 id（旧了就用块序号兜底），
          // 避免"批注引用"与正文不一致。命中块后把 id 归一化到它——留着已失效的旧 id，
          // 只会让下一次重锚多绕一圈、并在人再改一次之后彻底失锚。
          const note = { ...(body.note || {}) }
          const blocks = splitBlocks(readText(abs))
          const block = blocks.find((b) => b.id === note.blockId) || blocks.find((b) => b.index === note.blockIndex)
          if (block) {
            note.blockId = block.id
            if (!note.quote) note.quote = block.text.slice(0, 200)
          }
          if (!store.addNote({ cwd, docPath: abs, note })) return fail(res, 404, '文档状态缺失')
        } else if (action === 'update') {
          if (!store.updateNote({ cwd, docPath: abs, id: String(body.id || ''), patch: body.patch || {} })) return fail(res, 404, '批注不存在')
        } else if (action === 'remove') {
          store.removeNote({ cwd, docPath: abs, id: String(body.id || '') })
        } else {
          return fail(res, 400, `未知 action: ${action}`)
        }
        const state = store.readState(cwd, key)
        return json(res, 200, { ok: true, notes: reanchorNotes(state.notes, splitBlocks(readText(abs))) })
      }

      if (route === 'POST /render') {
        const { cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const state = store.readState(cwd, key)
        const markdown = typeof body.markdown === 'string' ? body.markdown : readText(abs)
        const meta = { ...(state || {}), ...(body.meta || {}) }
        const common = {
          theme: safeThemeKey(meta.theme),
          color: meta.color || undefined,
          font: meta.font,
          fontSize: meta.fontSize,
          footnotes: meta.footnotes !== false,
          macCodeBlock: meta.macCodeBlock !== false,
        }
        if (String(body.mode) === 'publish') {
          const out = renderCore(markdown, {
            ...common,
            publish: true,
            simple: !!body.simple,
            // 微信结构兼容层（把文字包进 <span>）只在复制/导出这条路径上开：
            // 微信编辑器的结构校验用「内容高度 ÷ 行框矩形数」估行高，而含行内元素的段落
            // 一行会被拆成多个矩形 → 被误判成"行高小于字体大小、文字重叠"。
            // 默认渲染路径（golden 守着的那条）一个字节都不动。
            wrapText: true,
            // 同一条兼容层：微信的安全过滤按属性名过，`background` 简写不在名单里、
            // `background-color` 才在 —— 不拆的话引用块的框、表头底色粘过去就没了。
            wechatBackground: true,
            imageResolver: makeImageResolver({ cwd, docPath: abs }),
          })
          return json(res, 200, { ok: true, mode: 'publish', html: out.html, themeKey: out.themeKey, themeName: out.themeName })
        }
        const out = renderCore(markdown, { ...common, annotate: true })
        return json(res, 200, {
          ok: true,
          mode: 'preview',
          html: out.html,
          themeKey: out.themeKey,
          themeName: out.themeName,
          // 「脚注 / Mac 代码框」这两个开关能不能点，由**渲染结果**说话：
          // 以前面板拿正则猜正文（只认带 `//` 的链接、只认 ``` 围栏），
          // 于是 `github.com/x/y` 生成了「参考资料」而开关是灰的、缩进式代码块也漏。
          linkCount: out.linkCount,
          hasCode: out.hasCode,
          // 预览跟着本地正文走，所以块/占位/图片/批注锚点也一起回带——
          // 面板因此不必等"保存 + 重载"才看得到自己刚写的东西。
          ...liveSurface({ cwd, key, abs, markdown }),
        })
      }

      if (route === 'POST /history') {
        const { cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        const state = store.readState(cwd, key)
        if (!state) return fail(res, 404, '文档状态缺失')
        const action = String(body.action || 'list')
        if (action === 'list') {
          return json(res, 200, { ok: true, history: publicHistory(state.history) })
        }
        if (action === 'stash') {
          // 把一段不落盘的文本存进历史：冲突时保住用户的未保存草稿，正文一个字不动
          const stashed = store.stash({ cwd, docPath: abs, markdown: String(body.markdown ?? ''), by: 'human', label: body.label })
          if (!stashed) return fail(res, 404, '文档状态缺失')
          return json(res, 200, { ok: true, entry: stashed.entry, revision: stashed.revision })
        }
        if (action === 'restore') {
          const found = store.readHistoryEntry(cwd, key, body.id !== undefined ? body.id : Number(body.rev))
          if (!found) return fail(res, 404, '找不到这一版历史')
          const saved = store.saveDoc({ cwd, docPath: abs, markdown: found.content, baseRevision: state.revision, by: 'human' })
          if (!saved.ok) return json(res, 409, { ok: false, conflict: true, revision: saved.revision, markdown: saved.markdown, key })
          return json(res, 200, { ok: true, revision: saved.state.revision })
        }
        if (action === 'rebase') {
          const next = store.rebase({ cwd, docPath: abs, by: 'human' })
          return json(res, 200, { ok: true, revision: next ? next.revision : state.revision })
        }
        return fail(res, 400, `未知 action: ${action}`)
      }

      if (route === 'POST /tab-opened') {
        const { sessionId, cwd } = sessionOf(body, url)
        const key = String(body.docKey || '')
        const abs = docPathByKey(cwd, key)
        store.consumeOpenRequest({ cwd, docPath: abs, sessionId })
        store.setActive(cwd, sessionId, key)
        return json(res, 200, { ok: true })
      }

      return fail(res, 404, `未知接口：${route}`)
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      log(`[fishpai] ${route} 失败: ${message}`)
      if (error instanceof OversizeError) return fail(res, 413, message)
      return fail(res, 400, message)
    }
  }
}
