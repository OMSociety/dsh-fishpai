import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_SOURCE_BYTES = 2 * 1024 * 1024

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
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return privateAddress(mapped[1])
  }
  return false
}

export async function assertPublicUrl(value, lookup = dns.lookup) {
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

async function readPage(value, fetchImpl, lookup, signal) {
  let url = await assertPublicUrl(value, lookup)
  for (let redirect = 0; redirect < 5; redirect += 1) {
    signal.throwIfAborted()
    const response = await fetchImpl(url, { signal, redirect: 'manual', headers: { accept: 'text/html,text/plain,markdown;q=0.9,*/*;q=0.1' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      signal.throwIfAborted()
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

export async function fetchPublicPage(value, { fetchImpl = fetch, lookup = dns.lookup, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController()
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`网页抓取超时：总时限 ${timeoutMs} 毫秒`)
      reject(error)
      controller.abort(error)
    }, timeoutMs)
  })
  try {
    return await Promise.race([deadline, readPage(value, fetchImpl, lookup, controller.signal)])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
