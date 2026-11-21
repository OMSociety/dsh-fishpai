import fs from 'node:fs'
import path from 'node:path'
import dns from 'node:dns/promises'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { importArticle, publicAssetUrl } from '../core/import/index.mjs'
import { renderXiumiPublish } from '../core/xiumi/index.mjs'
import { lintWechatHtml } from '../core/wechat-lint.mjs'
import { fetchPublicPage } from './public-fetch.mjs'
import { downloadImportedImage } from './import-assets.mjs'
import * as store from './store.mjs'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024

function publicSourceRef(value) {
  try {
    return publicAssetUrl(new URL(value).href)
  } catch {
    return 'invalid-url'
  }
}

function ensureSourceSize(html) {
  if (Buffer.byteLength(html) > MAX_SOURCE_BYTES) throw new Error('导入正文超过 2 MiB 上限')
}

/** 将一份 HTML 导入为新文档；来源URL中的临时凭据只参与当次抓取，不进入返回值。 */
export async function importArticleDocument(args, {
  cwd,
  sessionId,
  fetchImpl = fetch,
  lookup = dns.lookup,
} = {}) {
  const supplied = ['url', 'html', 'path'].filter((key) => typeof args[key] === 'string' && args[key].trim())
  if (supplied.length !== 1) throw new Error('必须且只能提供 url、html、path 之一')
  if (!args.out_path || !String(args.out_path).trim()) throw new Error('out_path 必填：导入会新建并打开一篇 .md，不覆盖当前文档')
  const docPath = store.resolveInCwd(cwd, store.withDefaultExt(String(args.out_path), '.md'))
  if (fs.existsSync(docPath)) throw new Error('out_path 已存在；为避免覆盖，请换一个新路径')

  let html
  let baseUrl
  let sourceRef
  if (args.url) {
    const requested = new URL(args.url)
    if (requested.protocol !== 'https:' || requested.hostname !== 'mp.weixin.qq.com') {
      throw new Error('url 仅支持 https://mp.weixin.qq.com 的公开文章；其他 HTML 请用 path 或 html 导入')
    }
    const page = await fetchPublicPage(requested.href, { fetchImpl, lookup })
    if (!page.contentType.includes('html')) throw new Error(`URL 返回的不是 HTML：${page.contentType || '未知类型'}`)
    const captcha = /\/wappoc_appmsgcaptcha\b/i.test(page.finalUrl)
    const hasArticleBody = /\bid\s*=\s*["']js_content["']/i.test(page.text)
    if (captcha || !hasArticleBody) {
      throw new Error('公众号页面未返回正文（可能需要人机验证）；请在浏览器打开文章后复制 HTML，或保存为 HTML 后用 path 导入')
    }
    html = page.text
    baseUrl = page.finalUrl
    sourceRef = publicSourceRef(page.finalUrl)
  } else if (args.path) {
    const sourcePath = store.resolveInCwd(cwd, args.path, { exts: ['.html', '.htm'] })
    html = await readFile(sourcePath, 'utf8')
    sourceRef = path.relative(cwd, sourcePath).replace(/\\/g, '/')
  } else {
    html = String(args.html)
    sourceRef = `sha256:${createHash('sha256').update(html).digest('hex')}`
  }
  ensureSourceSize(html)

  const savedFiles = []
  const assets = []
  const resolveAsset = async (url) => {
    try {
      const saved = await downloadImportedImage(url, { cwd, docPath, fetchImpl, lookup })
      savedFiles.push(saved.path)
      assets.push({ source: publicSourceRef(url), src: saved.src, status: 'local', bytes: saved.bytes, mime: saved.mime })
      return saved.src
    } catch (error) {
      assets.push({ source: publicSourceRef(url), status: 'remote', error: error.message })
      throw error
    }
  }

  try {
    const imported = await importArticle({ html, baseUrl, resolveAsset })
    const spec = imported.xiumiSpec
    const rendered = renderXiumiPublish(imported.markdown, { spec })
    const lint = lintWechatHtml(rendered)
    const opened = store.openDoc({
      cwd,
      docPath,
      markdown: imported.markdown,
      meta: { target: 'xiumi', xiumiSpec: spec },
      by: 'ai',
    })
    store.setActive(cwd, sessionId, opened.key)
    store.requestOpen({ cwd, docPath: opened.path, sessionId })
    const blocks = Array.isArray(imported.blocks) ? imported.blocks : []
    return {
      key: opened.key,
      path: path.relative(cwd, opened.path).replace(/\\/g, '/'),
      revision: opened.state.revision,
      title: imported.title,
      sourceRef,
      stats: { ...imported.stats, assetsLocal: assets.filter((item) => item.status === 'local').length, assetsRemote: assets.filter((item) => item.status === 'remote').length },
      xiumiSpec: spec,
      specEvidence: imported.specEvidence,
      blocks: blocks.slice(0, 100).map(({ id, kind, tag, component, confidence, reason, sourceIndex }) => ({
        id, kind, tag, component, confidence, reason, sourceIndex,
      })),
      blocksTruncated: Math.max(0, blocks.length - 100),
      assets,
      warnings: imported.warnings || [],
      lint: { ok: lint.ok, errors: lint.errors, warnings: lint.warnings },
    }
  } catch (error) {
    for (const file of savedFiles) {
      try { fs.rmSync(file, { force: true }) } catch { /* 保留清理失败现场，不掩盖导入错误 */ }
    }
    throw error
  }
}
