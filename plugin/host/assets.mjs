/**
 * 图片处理：本地图片 → data URI（复制/导出时内嵌），以及给预览用的静态读取。
 *
 * 为什么在宿主侧做而不是浏览器 canvas：文档里的图片是**磁盘上的相对路径**
 * （写文章的人本来就这么引图）。浏览器拿不到它，宿主能；而且不需要 CORS 与 canvas。
 *
 * 上游只对 blob:/data: 的图做内嵌（浏览器里粘贴进来的图）。鱼排多做一步：
 * 相对路径的本地图片也能内嵌，粘进公众号编辑器时图片不会丢。
 */
import fs from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTS, mimeFor, resolveInCwd } from './store.mjs'

/** 单张图内嵌上限：超过就跳过（微信编辑器对大图本来也不友好）。 */
export const MAX_EMBED_BYTES = 5 * 1024 * 1024

function isRemote(src) {
  return /^(https?:|data:|blob:|\/\/)/i.test(String(src || ''))
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
  const out = []
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let m
  while ((m = re.exec(String(markdown || ''))) !== null) {
    if (isRemote(m[1])) out.push({ src: m[1] })
  }
  return out
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
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let m
  while ((m = re.exec(String(markdown || ''))) !== null) {
    const src = m[1]
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
