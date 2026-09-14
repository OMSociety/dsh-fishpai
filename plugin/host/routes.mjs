/**
 * `/fishpai/api/*` HTTP 路由：浏览器侧唯一的读写入口。
 *
 * 安全边界（这是浏览器与文件系统之间唯一的一道门）：
 *   1. **同源校验**：`sec-fetch-site: cross-site` 直接拒；带 `Origin` 时必须与请求 Host 一致。
 *      写方法额外要求 `content-type: application/json`——跨站的简单请求会在浏览器侧先被拦下。
 *   2. **只认 docKey，不认路径**：客户端传索引里的键，宿主自己查出绝对路径，
 *      再用 `resolveInCwd` 复检（挡 `../`、挡符号链接逃逸、挡非白名单扩展名）。
 *   3. **revision 守卫**：写入必须带 `baseRevision`，不匹配返回 409 并回带服务端最新文本，
 *      绝不静默覆盖人的手改。
 */
import fs from 'node:fs'
import { render as renderCore, themeCatalog } from '../core/render.mjs'
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

function docPayload({ cwd, key }) {
  const abs = docPathByKey(cwd, key)
  const state = store.readState(cwd, key)
  if (!state) throw new Error(`文档状态缺失：${key}`)
  const markdown = readText(abs)
  const blocks = splitBlocks(markdown)
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
      theme: state.theme,
      color: state.color,
      font: state.font,
      fontSize: state.fontSize,
      footnotes: state.footnotes !== false,
      macCodeBlock: state.macCodeBlock !== false,
      mobile: !!state.mobile,
    },
    blocks: blocks.map(publicBlock),
    notes: reanchorNotes(state.notes, blocks),
    placeholders: attachPlaceholdersToBlocks(extractPlaceholders(markdown), blocks),
    images: listLocalImages({ markdown, cwd, docPath: abs }),
    history: state.history.map((h) => ({ id: h.id, rev: h.rev, at: h.at, by: h.by, chars: h.chars, label: h.label || null })),
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
        return json(res, 200, { ok: true, revision: saved.state.revision, updatedAt: saved.state.updatedAt })
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
          // 引用片段由宿主按当前正文补全：客户端只给块 id，避免"批注引用"与正文不一致
          const note = { ...(body.note || {}) }
          const blocks = splitBlocks(readText(abs))
          const block = blocks.find((b) => b.id === note.blockId) || blocks.find((b) => b.index === note.blockIndex)
          if (!note.quote && block) note.quote = block.text.slice(0, 200)
          if (!note.blockId && block) note.blockId = block.id
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
          theme: meta.theme,
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
          blocks: out.blocks.map(publicBlock),
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
          return json(res, 200, { ok: true, history: state.history.map((h) => ({ id: h.id, rev: h.rev, at: h.at, by: h.by, chars: h.chars, label: h.label || null })) })
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
