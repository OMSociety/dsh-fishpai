/**
 * 文档存储：一份 Markdown + 它的 FishPai 状态（主题、revision、baseline、批注、历史）。
 *
 * 设计取舍：
 *   - **文档本体是普通 .md 文件**，人可以用任何编辑器改，模型也能直接 read；鱼排不往正文里塞标记。
 *   - 批注、主题、baseline 放在 `<cwd>/.fishpai/state/<docKey>.json` 的 sidecar 里，
 *     `docKey = sha1(小写绝对路径)[:12]`，所以人把文件挪走/改名不会张冠李戴。
 *   - **baseline = AI 上一次写入的版本**。人在面板里改字**不移动** baseline，
 *     于是下一次 `fishpai_read` 拿到的恰好就是"人改了什么"。
 *   - 每次写入先把旧内容存进 history（可在面板里回滚），revision 单调递增。
 *   - 所有路径都必须落在会话工作目录内，且过扩展名白名单（见 resolveInCwd）。
 */
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const DOC_EXTS = ['.md', '.markdown', '.txt']
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']
export const STATE_VERSION = 1

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
}

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

/**
 * 把会话工作目录规范化成真实路径（展开 8.3 短名、解掉链接）。
 *
 * 必须在一开始就统一口径：`resolveInCwd` 做守卫时会 realpath，
 * 若调用方仍拿着原始写法（Windows 上可能是 `C:\Users\ADMINI~1\...`），
 * 两边的 `path.relative` 会算出奇怪的 `..\..\..\Administrator\...`。
 */
export function canonicalCwd(cwd) {
  const abs = path.resolve(cwd)
  return realOrSelf(abs)
}

// ── 路径守卫 ────────────────────────────────────────────────────

function realOrSelf(p) {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return p
  }
}

/**
 * 把一个可能是相对的路径解析到 `cwd` 之内，并拒绝越界与越权扩展名。
 *
 * 防的是：`../` 跳出工作目录、符号链接指向外部、以及从浏览器端点来的任意路径。
 *
 * @param {string} cwd 会话工作目录（绝对）
 * @param {string} target 目标路径（相对 cwd 或绝对）
 * @param {{exts?: string[]}} [opts]
 * @returns {string} 绝对路径
 * @throws {Error} 越界或扩展名不在白名单
 */
export function resolveInCwd(cwd, target, opts = {}) {
  const exts = opts.exts || DOC_EXTS
  if (typeof target !== 'string' || !target.trim()) throw new Error('路径不能为空')
  if (target.includes('\0')) throw new Error('路径非法')

  const rootReal = realOrSelf(path.resolve(cwd))
  const abs = path.resolve(rootReal, target)

  // 逐段向上找到第一个真实存在的祖先，再做 realpath，从而识破符号链接逃逸
  let probe = abs
  const tail = []
  for (;;) {
    if (fs.existsSync(probe)) break
    const parent = path.dirname(probe)
    if (parent === probe) break
    tail.unshift(path.basename(probe))
    probe = parent
  }
  const realProbe = realOrSelf(probe)
  const resolved = tail.length ? path.join(realProbe, ...tail) : realProbe

  const rel = path.relative(rootReal, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界（必须在会话工作目录内）：${target}`)
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!exts.includes(ext)) {
    throw new Error(`不支持的扩展名 ${ext || '(无)'}，只允许 ${exts.join(' / ')}`)
  }
  return resolved
}

/** 文档键：同一路径在不同大小写写法下必须落到同一份状态。 */
export function docKey(absPath) {
  return createHash('sha1').update(path.resolve(absPath).toLowerCase()).digest('hex').slice(0, 12)
}

// ── 目录与状态读写 ──────────────────────────────────────────────

export function fishpaiDir(cwd) {
  return path.join(cwd, '.fishpai')
}

function stateDir(cwd) {
  return path.join(fishpaiDir(cwd), 'state')
}

function historyDir(cwd, key) {
  return path.join(fishpaiDir(cwd), 'history', key)
}

function docsDir(cwd) {
  return path.join(fishpaiDir(cwd), 'docs')
}

/** 自建 .fishpai/.gitignore，免得运行时状态弄脏用户仓库；不动用户的 .gitignore。 */
export function ensureFishpaiLayout(cwd) {
  for (const dir of [fishpaiDir(cwd), stateDir(cwd), docsDir(cwd)]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const ignore = path.join(fishpaiDir(cwd), '.gitignore')
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, '# FishPai 运行时状态；文档本体在 docs/ 下，可自行决定是否入库\nstate/\nhistory/\n', 'utf8')
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // 临时文件 + rename，避免写一半留下坏 JSON
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

function indexPath(cwd) {
  return path.join(stateDir(cwd), 'index.json')
}

function emptyIndex() {
  return { version: STATE_VERSION, active: {}, docs: {} }
}

export function readIndex(cwd) {
  const idx = readJson(indexPath(cwd), emptyIndex())
  if (!idx || typeof idx !== 'object') return emptyIndex()
  idx.version = STATE_VERSION
  idx.active = idx.active && typeof idx.active === 'object' ? idx.active : {}
  idx.docs = idx.docs && typeof idx.docs === 'object' ? idx.docs : {}
  return idx
}

function writeIndex(cwd, idx) {
  writeJson(indexPath(cwd), idx)
}

function statePathFor(cwd, key) {
  return path.join(stateDir(cwd), `${key}.json`)
}

function defaultState(absPath) {
  return {
    version: STATE_VERSION,
    docPath: absPath,
    revision: 0,
    updatedAt: Date.now(),
    updatedBy: null,
    theme: 'default',
    color: null,
    font: 'sans',
    fontSize: '16px',
    footnotes: true,
    macCodeBlock: true,
    mobile: false,
    baseline: null,
    notes: [],
    history: [],
    openRequests: {},
  }
}

export function readState(cwd, key) {
  const st = readJson(statePathFor(cwd, key), null)
  if (!st) return null
  st.version = STATE_VERSION
  st.notes = Array.isArray(st.notes) ? st.notes : []
  st.history = Array.isArray(st.history) ? st.history : []
  st.openRequests = st.openRequests && typeof st.openRequests === 'object' ? st.openRequests : {}
  return st
}

function writeState(cwd, key, state) {
  writeJson(statePathFor(cwd, key), state)
  return state
}

// ── 标题与 slug ────────────────────────────────────────────────

/** 取文档标题：第一个 ATX 标题 > 第一行非空文本 > 文件名。 */
export function docTitle(markdown, absPath) {
  const lines = String(markdown || '').split('\n')
  for (const line of lines) {
    const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) return m[1].trim()
  }
  for (const line of lines) {
    if (line.trim()) return line.trim().slice(0, 60)
  }
  return path.basename(absPath, path.extname(absPath))
}

function slugify(title) {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|#]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return base || 'untitled'
}

/** 默认文档路径：`<cwd>/.fishpai/docs/<标题 slug>.md`（重名自动加序号）。 */
export function defaultDocPath(cwd, markdown) {
  ensureFishpaiLayout(cwd)
  const title = docTitle(markdown, 'untitled')
  const dir = docsDir(cwd)
  let candidate = path.join(dir, `${slugify(title)}.md`)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${slugify(title)}-${n}.md`)
    n++
  }
  return candidate
}

// ── 历史 ───────────────────────────────────────────────────────

function pushHistory(cwd, key, state, content, rev, by) {
  const rel = path.join('.fishpai', 'history', key, `${String(rev).padStart(4, '0')}-${by || 'system'}-${Date.now()}.md`)
  const abs = path.join(cwd, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  const entry = { rev, at: Date.now(), by: by || 'system', file: rel.replace(/\\/g, '/'), chars: content.length }
  state.history.unshift(entry)
  // 只留最近 50 份，避免无限膨胀
  for (const dropped of state.history.splice(50)) {
    try {
      fs.unlinkSync(path.join(cwd, dropped.file))
    } catch {
      /* 已经不在就算了 */
    }
  }
  return entry
}

export function readHistoryEntry(cwd, key, rev) {
  const state = readState(cwd, key)
  if (!state) return null
  const entry = state.history.find((h) => h.rev === Number(rev))
  if (!entry) return null
  const abs = path.join(cwd, entry.file)
  if (!fs.existsSync(abs)) return null
  return { entry, content: fs.readFileSync(abs, 'utf8') }
}

export function baselineContent(cwd, state) {
  if (!state || !state.baseline) return ''
  const abs = path.join(cwd, state.baseline.file)
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

// ── 文档读写 ───────────────────────────────────────────────────

/** 打开/新建文档。已存在就不覆盖——把"你没写进去"明确告诉模型。 */
export function openDoc({ cwd, docPath, markdown, theme, by = 'ai' }) {
  ensureFishpaiLayout(cwd)
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const exists = fs.existsSync(abs)
  let state = readState(cwd, key)

  if (!exists) {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const content = String(markdown ?? '')
    fs.writeFileSync(abs, content, 'utf8')
    state = defaultState(abs)
    state.revision = 1
    state.updatedBy = by
    if (theme) state.theme = theme
    state.baseline = { rev: 1, at: Date.now(), by, file: pushHistory(cwd, key, state, content, 1, by).file }
    state = writeState(cwd, key, state)
    registerDoc(cwd, key, abs, content, state)
    return { key, path: abs, state, markdown: content, created: true, markdownIgnored: false }
  }

  if (!state) {
    const content = fs.readFileSync(abs, 'utf8')
    state = defaultState(abs)
    state.revision = 1
    state.updatedBy = 'human'
    if (theme) state.theme = theme
    state.baseline = { rev: 1, at: Date.now(), by: 'human', file: pushHistory(cwd, key, state, content, 1, 'human').file }
    state = writeState(cwd, key, state)
    registerDoc(cwd, key, abs, content, state)
    return { key, path: abs, state, markdown: content, created: false, markdownIgnored: markdown !== undefined }
  }

  const content = fs.readFileSync(abs, 'utf8')
  if (theme && state.theme !== theme) state = writeState(cwd, key, { ...state, theme })
  registerDoc(cwd, key, abs, content, state)
  return { key, path: abs, state, markdown: content, created: false, markdownIgnored: markdown !== undefined }
}

function registerDoc(cwd, key, abs, markdown, state) {
  const idx = readIndex(cwd)
  idx.docs[key] = {
    key,
    path: abs,
    title: docTitle(markdown, abs),
    revision: state.revision,
    updatedAt: state.updatedAt,
  }
  writeIndex(cwd, idx)
}

export function setActive(cwd, sessionId, key) {
  const idx = readIndex(cwd)
  idx.active[String(sessionId)] = key
  writeIndex(cwd, idx)
}

export function activeKey(cwd, sessionId) {
  const idx = readIndex(cwd)
  return idx.active[String(sessionId)] || null
}

export function listDocs(cwd) {
  const idx = readIndex(cwd)
  return Object.values(idx.docs).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/**
 * 写文档（人改或 AI 改都走这里）。
 *
 * @param {object} p
 * @param {number} p.baseRevision 调用方读到的 revision；不匹配就拒绝（防覆盖）
 * @param {'human'|'ai'} p.by
 * @returns {{ok: true, state: object} | {ok: false, conflict: true, revision: number, markdown: string}}
 */
export function saveDoc({ cwd, docPath, markdown, baseRevision, by = 'human', meta = {} }) {
  ensureFishpaiLayout(cwd)
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const prevContent = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
  let state = readState(cwd, key)
  if (!state) {
    state = defaultState(abs)
    state.revision = 1
  }

  if (baseRevision !== undefined && baseRevision !== null && Number(baseRevision) !== state.revision) {
    return { ok: false, conflict: true, revision: state.revision, markdown: prevContent, path: abs, key }
  }

  // 先留旧内容，再覆盖：任何一版都能回滚
  if (prevContent && prevContent !== markdown) {
    pushHistory(cwd, key, state, prevContent, state.revision, state.updatedBy || 'system')
  }

  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, markdown, 'utf8')

  state.revision += 1
  state.updatedAt = Date.now()
  state.updatedBy = by
  for (const field of ['theme', 'color', 'font', 'fontSize', 'footnotes', 'macCodeBlock', 'mobile']) {
    if (meta[field] !== undefined) state[field] = meta[field]
  }

  if (by === 'ai') {
    // AI 写入即刷新 baseline：下一次 read 看到的就是"人在这之后改了什么"
    state.baseline = { rev: state.revision, at: Date.now(), by, file: pushHistory(cwd, key, state, markdown, state.revision, by).file }
  } else if (!state.baseline) {
    state.baseline = { rev: state.revision, at: Date.now(), by, file: pushHistory(cwd, key, state, markdown, state.revision, by).file }
  }

  state = writeState(cwd, key, state)
  registerDoc(cwd, key, abs, markdown, state)
  return { ok: true, state, path: abs, key }
}

/** 重新对齐 baseline 到当前内容（人在面板上点"以当前为准"时用）。 */
export function rebase({ cwd, docPath, by = 'human' }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  const content = fs.readFileSync(abs, 'utf8')
  const entry = pushHistory(cwd, key, state, content, state.revision, by)
  const next = { ...state, baseline: { rev: state.revision, at: Date.now(), by, file: entry.file } }
  return writeState(cwd, key, next)
}

export function updateMeta({ cwd, docPath, meta }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  const next = { ...state }
  for (const field of ['theme', 'color', 'font', 'fontSize', 'footnotes', 'macCodeBlock', 'mobile']) {
    if (meta[field] !== undefined) next[field] = meta[field]
  }
  return writeState(cwd, key, next)
}

// ── 批注 ───────────────────────────────────────────────────────

export function addNote({ cwd, docPath, note }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  const entry = { id: randomUUID().slice(0, 8), author: 'human', at: Date.now(), resolved: false, ...note }
  const next = { ...state, notes: [...state.notes, entry] }
  writeState(cwd, key, next)
  return entry
}

export function updateNote({ cwd, docPath, id, patch }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  let found = null
  const notes = state.notes.map((n) => {
    if (n.id !== id) return n
    found = { ...n, ...patch, id: n.id }
    return found
  })
  if (!found) return null
  writeState(cwd, key, { ...state, notes })
  return found
}

export function removeNote({ cwd, docPath, id }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  const before = state.notes.length
  const notes = state.notes.filter((n) => n.id !== id)
  writeState(cwd, key, { ...state, notes })
  return before !== notes.length
}

// ── 打开请求（宿主 → 客户端的唯一推送手段）─────────────────────

const OPEN_TTL_MS = 60_000

export function requestOpen({ cwd, docPath, sessionId }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return null
  const openRequests = { ...state.openRequests, [String(sessionId)]: Date.now() }
  return writeState(cwd, key, { ...state, openRequests })
}

export function consumeOpenRequest({ cwd, docPath, sessionId }) {
  const abs = resolveInCwd(cwd, docPath)
  const key = docKey(abs)
  const state = readState(cwd, key)
  if (!state) return false
  const at = state.openRequests[String(sessionId)]
  if (!at) return false
  const openRequests = { ...state.openRequests }
  delete openRequests[String(sessionId)]
  writeState(cwd, key, { ...state, openRequests })
  return true
}

/** 未过期且属于该会话的打开请求。 */
export function pendingOpenRequest(state, sessionId) {
  const at = state && state.openRequests ? state.openRequests[String(sessionId)] : null
  if (!at) return null
  return Date.now() - at < OPEN_TTL_MS ? at : null
}
