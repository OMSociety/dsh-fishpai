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

/** 发布产物内嵌 raw HTML/SVG 的本地图片；远程图、越界图与超限图保持原引用。 */
export function inlineHtmlImages(html, { cwd, docPath, maxBytes = MAX_EMBED_BYTES }) {
  const resolve = makeImageResolver({ cwd, docPath, maxBytes })
  const replace = (full, prefix, quote, src) => {
    const dataUri = resolve(decodeAttr(src))
    return dataUri ? `${prefix}${quote}${dataUri}${quote}` : full
  }
  return String(html || '')
    .replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi, replace)
    .replace(/(<image\b[^>]*?\b(?:href|xlink:href)\s*=\s*)(["'])(.*?)\2/gi, replace)
}

/**
 * 造一个 `imageResolver` 给 `render()` 用：把 <img src> 换成 data URI。
 *
 * @param {{cwd: string, docPath: string, maxBytes?: number}} ctx
 * @returns {(src: string) => string | null} 返回 null 表示保持原样
 */
export function makeImageResolver({ cwd, docPath, maxBytes = MAX_EMBED_BYTES }) {
  const baseDir = path.dirname(docPath)
  return (src) => {
    if (!src || isRemote(src)) return null
    let abs
    try {
      abs = resolveInCwd(cwd, path.isAbsolute(src) ? src : path.join(baseDir, src), { exts: IMAGE_EXTS })
    } catch {
      return null // 越界或不是图片：原样保留，交给微信去处理
    }
    let stat
    try {
      stat = fs.statSync(abs)
    } catch {
      return null
    }
    if (!stat.isFile() || stat.size > maxBytes) return null
    const data = fs.readFileSync(abs)
    return `data:${mimeFor(abs)};base64,${data.toString('base64')}`
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
