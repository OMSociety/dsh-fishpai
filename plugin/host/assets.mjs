/**
 * 图片处理：本地图片 → data URI（复制/导出时内嵌），以及给预览用的静态读取。
 *
 * 为什么在宿主侧做而不是浏览器 canvas：文档里的图片是**磁盘上的相对路径**
 * （写文章的人本来就这么引图）。浏览器拿不到它，宿主能；而且不需要 CORS 与 canvas。
 *
 * 除浏览器粘贴产生的 blob:/data: 图片外，相对路径的本地图片也能内嵌，
 * 粘进公众号编辑器时图片不会丢。
 */
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'cheerio'
import { IMAGE_EXTS, MAX_ASSET_BYTES, mimeFor, resolveInCwd } from './store.mjs'

/**
 * 单张图内嵌上限：**与"能不能存进来"同一个上限**（`MAX_ASSET_BYTES`）。
 * 两处各写一个数字的话，迟早出现"存得进来、却内嵌不了"的图，而面板只会说"需手动上传"。
 */
export const MAX_EMBED_BYTES = MAX_ASSET_BYTES

function isRemote(src) {
  return /^(https?:|data:|blob:|\/\/)/i.test(String(src || ''))
}

function decodeAttr(value) {
  return String(value || '').replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  })[entity] || entity)
}

/** Markdown 图片与 raw 中的 HTML/SVG 图片共用同一份素材清单，顺序稳定且按引用路径去重。 */
function imageSources(markdown) {
  const source = String(markdown || '')
  const out = []
  const seen = new Set()
  const add = (src) => {
    const value = decodeAttr(src).trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push(value)
  }
  for (const match of source.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) add(match[1])
  for (const match of source.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi)) add(match[2])
  for (const match of source.matchAll(/<image\b[^>]*?\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)) add(match[2])
  return out
}

/** 从最终 HTML 统计图片并只改写属性区间，保留 SVG 和内联排版的原始字节。 */
export function exportImages(html, { cwd, docPath, embed = true, strict = embed, maxBytes = MAX_EMBED_BYTES }) {
  const $ = load(html, { sourceCodeLocationInfo: true }, false)
  const cache = new Map()
  const edits = []
  const unresolved = new Map()
  const embedded = new Set()
  for (const node of $('img, image, source, [style]')) {
    const attrs = node.sourceCodeLocation?.attrs || {}
    const name = node.name
    const srcset = node.attribs.srcset
    if ((name === 'img' || name === 'source') && srcset) unresolved.set('srcset: ' + srcset.split('?')[0].slice(0, 80), '响应式图片引用')
    for (const m of (node.attribs.style || '').matchAll(/url\(\s*['"]?([^)'"\s]+)/gi)) {
      if (!/^(data:|#)/i.test(m[1])) unresolved.set(m[1], '样式图片引用')
    }
    const keys = name === 'img' ? ['src'] : name === 'image' ? ['href', 'xlink:href'] : []
    for (const key of keys) {
      const loc = attrs[key]
      if (!loc) continue
      const src = (node.attribs[key] ?? node.attribs.href ?? '').trim()
      if (/^data:image\//i.test(src) || (name === 'image' && src.startsWith('#'))) { embedded.add(src); continue }
      if (!embed || isRemote(src)) { unresolved.set(src, embed ? '外部图片引用' : '关闭内嵌'); continue }
      const result = cache.get(src) ?? localImage(src, { cwd, docPath, maxBytes })
      cache.set(src, result)
      if (!result.data) { unresolved.set(src, result.reason); continue }
      embedded.add(src)
      edits.push({ loc, replacement: `${key}="${result.data}"` })
    }
  }
  if (strict && unresolved.size) {
    const detail = [...unresolved].map(([src, reason]) => `${src.split(/[?#]/)[0].slice(0, 180) || '（空引用）'}（${reason}）`).join('、')
    throw new Error(`自包含导出缺少 ${unresolved.size} 项图片：${detail}`)
  }
  const parts = []
  let start = 0
  for (const { loc, replacement } of edits.sort((a, b) => a.loc.startOffset - b.loc.startOffset)) {
    parts.push(html.slice(start, loc.startOffset), replacement)
    start = loc.endOffset
  }
  parts.push(html.slice(start))
  return { html: parts.join(''), embedded: embedded.size, unresolved: unresolved.size }
}

export function inlineHtmlImages(html, options) {
  return exportImages(html, { ...options, strict: false }).html
}

/**
 * 造一个 `imageResolver` 给 `render()` 用：把 <img src> 换成 data URI。
 *
 * @param {{cwd: string, docPath: string, maxBytes?: number}} ctx
 * @returns {(src: string) => string | null} 返回 null 表示保持原样
 */
export function makeImageResolver({ cwd, docPath, maxBytes = MAX_EMBED_BYTES }) {
  return (src) => !src || isRemote(src) ? null : localImage(src, { cwd, docPath, maxBytes }).data ?? null
}

function localImage(src, { cwd, docPath, maxBytes }) {
  let abs
  try {
    const file = decodeURIComponent(src.split(/[?#]/)[0])
    abs = resolveInCwd(cwd, path.resolve(path.dirname(docPath), file), { exts: IMAGE_EXTS })
  } catch {
    return { reason: '路径或格式不支持' }
  }
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile()) return { reason: '不是文件' }
    if (stat.size > maxBytes) return { reason: '文件过大' }
    const bytes = fs.readFileSync(abs)
    if (bytes.length > maxBytes) return { reason: '文件过大' }
    return { data: `data:${mimeFor(abs)};base64,${bytes.toString('base64')}` }
  } catch (error) {
    return { reason: error.code === 'ENOENT' ? '文件不存在' : '无法读取' }
  }
}

/**
 * 读一张本地图片给预览 iframe 用（`/fishpai/api/asset`）。
 *
 * @returns {{bytes: Buffer, mime: string} | null}
 */
export function readAsset({ cwd, docPath, src, maxBytes = 20 * 1024 * 1024 }) {
  if (!src || isRemote(src)) return null
  const baseDir = path.dirname(docPath)
  let abs
  try {
    abs = resolveInCwd(cwd, path.isAbsolute(src) ? src : path.join(baseDir, src), { exts: IMAGE_EXTS })
  } catch {
    return null
  }
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile() || stat.size > maxBytes) return null
    return { bytes: fs.readFileSync(abs), mime: mimeFor(abs) }
  } catch {
    return null
  }
}

/**
 * Markdown 里引用的**外链图**清单：这些是微信会拦掉的那一类（"此图片来自…未经允许不可引用"），
 * 复制过去也不显示，必须手动重新上传。本地图不走这里——它们会被内嵌成 base64 带过去。
 */
export function listRemoteImages({ markdown }) {
  return imageSources(markdown).filter(isRemote).map((src) => ({ src }))
}

/**
 * Markdown 里引用的本地图片清单，并标出**能不能被内嵌**。
 *
 * 只有 `embed: true` 的图会被 base64 内嵌进剪贴板、跟着粘贴一起进公众号编辑器；
 * 其余的（文件不在、越界、超过大小上限）不会被内嵌，粘过去大概率不显示，需要手动上传。
 * 面板与 `fishpai_read` 都靠 `embed` 这一列说人话。
 */
export function listLocalImages({ markdown, cwd, docPath, maxBytes = MAX_EMBED_BYTES }) {
  const baseDir = path.dirname(docPath)
  const out = []
  for (const src of imageSources(markdown)) {
    if (isRemote(src)) continue
    let status = 'ok'
    let size = null
    try {
      const abs = resolveInCwd(cwd, path.isAbsolute(src) ? src : path.join(baseDir, src), { exts: IMAGE_EXTS })
      if (!fs.existsSync(abs)) {
        status = 'missing'
      } else {
        size = fs.statSync(abs).size
        if (size > maxBytes) status = 'too-large'
      }
    } catch {
      status = 'outside'
    }
    out.push({ src, status, size, embed: status === 'ok' })
  }
  return out
}
