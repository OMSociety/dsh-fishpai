import { createHash, randomUUID } from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import { readFile } from 'node:fs/promises'
import { inferWritingStyle } from '../core/learn.mjs'
import { resolveInCwd } from './store.mjs'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_PENDING = 64
const PENDING_TTL_MS = 30 * 60 * 1000
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

function requiredText(value, label, max = 4000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`)
  if (value.length > max) throw new Error(`${label} 超过 ${max} 字符上限`)
  return value.trim()
}

function normalizeStyleId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!ID_RE.test(id)) throw new Error('styleId 需为 1–40 位小写字母、数字或连字符，且以字母或数字开头')
  return id
}

function privateAddress(address) {
  const ip = String(address || '').toLowerCase().split('%')[0]
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number)
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
      || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 192 && parts[1] === 0 && [0, 2].includes(parts[2]))
      || (parts[0] === 198 && [18, 19, 51].includes(parts[1]))
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || parts[0] >= 224
  }
  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return privateAddress(mapped[1])
  }
  return false
}

async function assertPublicUrl(value, lookup) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('网页来源只接受无凭据的 HTTPS URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (hostname.toLowerCase() === 'localhost' || hostname.endsWith('.localhost') || privateAddress(hostname)) throw new Error('网页来源不能指向本机或私有网络')
  const records = await lookup(hostname, { all: true, verbatim: true })
  if (!records.length || records.some((record) => privateAddress(record.address))) throw new Error('网页来源解析到本机或私有网络，已拒绝')
  return url
}

async function responseText(response) {
  if (!response.ok) throw new Error(`网页抓取失败：HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > MAX_SOURCE_BYTES) throw new Error('网页正文超过 2 MiB 上限')
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('网页正文超过 2 MiB 上限')
    return buffer.toString('utf8')
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_SOURCE_BYTES) {
      await reader.cancel()
      throw new Error('网页正文超过 2 MiB 上限')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchPublicPage(value, { fetchImpl = fetch, lookup = dns.lookup } = {}) {
  let url = await assertPublicUrl(value, lookup)
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetchImpl(url, { redirect: 'manual', headers: { accept: 'text/html,text/plain,markdown;q=0.9,*/*;q=0.1' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('网页重定向缺少 Location')
      url = await assertPublicUrl(new URL(location, url).href, lookup)
      continue
    }
    const text = await responseText(response)
    const contentType = response.headers.get('content-type') || ''
    return { text, contentType, finalUrl: url.href }
  }
  throw new Error('网页重定向超过 5 次')
}

function sourceDigest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

export class LearnService {
  constructor(getStores, { fetchImpl = fetch, lookup = dns.lookup, now = () => Date.now() } = {}) {
    this.getStores = getStores
    this.fetchImpl = fetchImpl
    this.lookup = lookup
    this.now = now
    this.pending = new Map()
  }

  async domain() {
    const stores = await this.getStores()
    if (!stores?.writing) throw new Error('storageDomain 不可用，learn 风格库需要宿主提供用户级存储')
    return stores.writing
  }

  prune() {
    const cutoff = this.now() - PENDING_TTL_MS
    for (const [id, item] of this.pending) if (item.createdAt < cutoff) this.pending.delete(id)
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value)
  }

  async preview(input = {}) {
    const domain = await this.domain()
    this.prune()
    const supplied = ['markdown', 'html', 'url', 'path'].filter((key) => typeof input[key] === 'string' && input[key].trim())
    if (supplied.length !== 1) throw new Error('preview 必须且只能提供 markdown、html、url、path 之一')
    let source
    if (input.url) {
      const page = await fetchPublicPage(input.url, { fetchImpl: this.fetchImpl, lookup: this.lookup })
      source = page.contentType.includes('html') ? { html: page.text } : { markdown: page.text }
    } else if (input.path) {
      if (!input.cwd) throw new Error('读取定稿路径需要会话工作目录')
      const file = await resolveInCwd(input.cwd, input.path, { exts: ['.md', '.html'] })
      const text = await readFile(file, 'utf8')
      source = file.toLowerCase().endsWith('.html') ? { html: text } : { markdown: text }
    } else {
      source = input.html ? { html: input.html } : { markdown: input.markdown }
    }
    const rawText = source.html || source.markdown
    if (Buffer.byteLength(rawText) > MAX_SOURCE_BYTES) throw new Error('待学习内容超过 2 MiB 上限')
    const inferred = inferWritingStyle(source)
    const styleId = input.styleId ? normalizeStyleId(input.styleId) : `style-${randomUUID().slice(0, 8)}`
    const sourceName = requiredText(input.sourceName || input.url || input.path || '粘贴的定稿', 'sourceName', 300)
    const sourceRef = requiredText(input.sourceRef || input.url || input.path || sourceDigest(rawText), 'sourceRef', 1000)
    const { evidence, ...fields } = inferred
    const style = { styleId, ...fields, sourceName, sourceRef, createdAt: this.now() }
    const pendingId = randomUUID()
    this.pending.set(pendingId, style)
    return { pendingId, style, evidence, duplicate: Boolean(domain.table('styles').get(styleId)), expiresAt: this.now() + PENDING_TTL_MS }
  }

  async commit({ pendingId, confirm, style } = {}) {
    const domain = await this.domain()
    this.prune()
    if (confirm !== true) throw new Error('learn 入库需要用户明确确认（confirm=true）')
    const candidate = this.pending.get(pendingId)
    if (!candidate) throw new Error('pendingId 不存在或已过期，请重新 preview')
    const merged = { ...candidate, ...(style || {}) }
    const styleId = normalizeStyleId(merged.styleId)
    if (styleId !== candidate.styleId) throw new Error('确认时不能改 styleId；请用目标 styleId 重新 preview')
    for (const key of ['tone', 'structure', 'audience', 'purpose', 'do', 'dont']) requiredText(merged[key], key)
    const record = {
      styleId,
      tone: merged.tone.trim(), structure: merged.structure.trim(), audience: merged.audience.trim(), purpose: merged.purpose.trim(),
      do: merged.do.trim(), dont: merged.dont.trim(),
      sourceName: requiredText(merged.sourceName, 'sourceName', 300), sourceRef: requiredText(merged.sourceRef, 'sourceRef', 1000),
      createdAt: candidate.createdAt,
    }
    await domain.table('styles').put(styleId, record)
    this.pending.delete(pendingId)
    return { style: record }
  }

  async list() {
    const domain = await this.domain()
    return domain.table('styles').keys().map((id) => domain.table('styles').get(id)).filter(Boolean)
  }

  async delete({ styleId } = {}) {
    const domain = await this.domain()
    const id = normalizeStyleId(styleId)
    return { removed: await domain.table('styles').delete(id) }
  }
}
