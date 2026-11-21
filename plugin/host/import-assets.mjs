import { createHash } from 'node:crypto'
import dns from 'node:dns/promises'
import { assertPublicUrl } from './public-fetch.mjs'
import { MAX_ASSET_BYTES, saveAsset } from './store.mjs'

const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function rasterType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (bytes.length >= 2 && bytes.subarray(0, 2).toString('ascii') === 'BM') return 'bmp'
  return null
}

async function responseBytes(response, maxBytes) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') || 0)
  if (length > maxBytes) throw new Error(`图片超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 上限`)
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new Error(`图片超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 上限`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error(`图片超过 ${Math.round(maxBytes / 1024 / 1024)} MiB 上限`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/** 下载公开栅格图片并保存为文档旁 assets/ 的相对引用。 */
export async function downloadImportedImage(value, {
  cwd,
  docPath,
  fetchImpl = fetch,
  lookup = dns.lookup,
  maxBytes = MAX_ASSET_BYTES,
  timeoutMs = 20_000,
} = {}) {
  let url = await assertPublicUrl(value, lookup)
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.1' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('图片重定向缺少 Location')
      url = await assertPublicUrl(new URL(location, url).href, lookup)
      continue
    }
    const bytes = await responseBytes(response, maxBytes)
    const type = rasterType(bytes)
    if (!type) throw new Error('只下载 PNG / JPEG / GIF / WebP / BMP 栅格图片')
    const declared = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (declared && declared !== IMAGE_MIME[type] && !(type === 'jpg' && declared === 'image/jpg')) {
      throw new Error(`图片类型不一致：声明 ${declared}，内容 ${IMAGE_MIME[type]}`)
    }
    const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.${type === 'jpg' ? 'jpg' : type}`
    const saved = saveAsset({ cwd, docPath, name, mime: IMAGE_MIME[type], data: bytes.toString('base64'), maxBytes })
    return { ...saved, mime: IMAGE_MIME[type], source: url.href }
  }
  throw new Error('图片重定向超过 5 次')
}
