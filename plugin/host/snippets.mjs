import { randomUUID } from 'node:crypto'
import { composeMarkdown, extractSnippets, normalizeSnippetName, sanitizeFragment } from '../core/snippets.mjs'
import { fetchPublicPage } from './learn.mjs'

const PENDING_TTL_MS = 30 * 60 * 1000

export class SnippetService {
  constructor(getStores, { fetchPage = fetchPublicPage, renderFragment = (html) => sanitizeFragment(html) } = {}) {
    this.getStores = getStores
    this.fetchPage = fetchPage
    this.renderFragment = renderFragment
    this.pending = new Map()
  }

  async stores() {
    const stores = await this.getStores()
    if (!stores) throw new Error('storageDomain 不可用：请先在 DSH 安装并启用 storage-domain 插件')
    return stores
  }

  sweep() {
    const now = Date.now()
    for (const [id, row] of this.pending) if (now - row.createdAt > PENDING_TTL_MS) this.pending.delete(id)
  }

  async preview(args) {
    this.sweep()
    const name = normalizeSnippetName(args.name)
    let candidate
    if (args.url) {
      const page = await this.fetchPage(args.url)
      candidate = extractSnippets(page.html, { footerAnchors: args.footerAnchors })
      candidate.sourceName = page.title
      candidate.sourceRef = page.url
    } else {
      candidate = {
        headerHtml: args.headerHtml ? this.renderFragment(args.headerHtml) : null,
        footerHtml: args.footerHtml ? this.renderFragment(args.footerHtml) : null,
        footerImg: args.footerImg || null,
        sourceName: '手工片段',
        sourceRef: null,
      }
    }
    if (!candidate.headerHtml && !candidate.footerHtml && !candidate.footerImg) throw new Error('未提取到片段：页头取首个 mmbiz 图，页尾需配置能命中的锚点关键词')
    const record = { name, headerHtml: candidate.headerHtml, footerHtml: candidate.footerHtml, footerImg: candidate.footerImg, createdAt: Date.now() }
    const existing = (await this.stores()).snippets.table('snippets').get(name)
    if (existing && !args.force) {
      const error = new Error(`片段「${name}」已存在；确认覆盖时请使用 force:true`)
      error.duplicate = true
      throw error
    }
    const pendingId = randomUUID()
    this.pending.set(pendingId, { record, sourceName: candidate.sourceName, sourceRef: candidate.sourceRef, createdAt: Date.now() })
    if (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value)
    return { pendingId, snippet: record, sourceName: candidate.sourceName, sourceRef: candidate.sourceRef }
  }

  async commit({ pendingId, confirm }) {
    this.sweep()
    if (confirm !== true) throw new Error('请让用户确认片段预览后，再以 confirm:true 提交')
    const row = this.pending.get(pendingId)
    if (!row) throw new Error('pendingId 不存在或已过期，请重新 preview')
    await (await this.stores()).snippets.table('snippets').put(row.record.name, row.record)
    this.pending.delete(pendingId)
    return row.record
  }

  async list() {
    return (await this.stores()).snippets.table('snippets').keys().sort()
  }

  async get(name) {
    return (await this.stores()).snippets.table('snippets').get(normalizeSnippetName(name))
  }

  async delete(name) {
    const id = normalizeSnippetName(name)
    return (await this.stores()).snippets.table('snippets').delete(id)
  }

  async compose(markdown, name) {
    if (!name) return String(markdown || '')
    const record = await this.get(name)
    if (!record) throw new Error(`片段「${name}」不存在`)
    return composeMarkdown({ markdown, ...record })
  }
}
