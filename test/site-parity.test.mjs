/**
 * 与墨排站点的一致性：把「点站点『复制到公众号』后剪贴板里的真实 HTML」当成金标准。
 *
 * `test/golden/site-clip.default.html` 是从墨排线上站点抓下来的真实剪贴板内容
 * （fixture = stress_real_img.md，主题 = default）。对比前做规范化——与
 * `.mopai-recon/offline_compare.py` 的 `canon()` 同一套规则：属性顺序、style 分隔、
 * 空白折叠、data-* 剥离。规范化之后应当逐字符相同。
 *
 * 这份样本与对应 fixture 里的示例文案，是把真实姓名替换成假名之后的版本
 * （同一套替换两边都做了，所以逐字符对照依然成立）。
 *
 * 这个测试让"与墨排一致"这句话在仓库内、离线可复验，而不依赖线上站点还在不在。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '../plugin/core/render.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `.mopai-recon/offline_compare.py::canon` 的等价移植。 */
export function canon(html) {
  let h = String(html).replace(/\sdata-[a-z-]+="[^"]*"/g, '')
  h = h.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  h = h.replace(/style='([^']*)'/g, (m, g) => `style="${g}"`)
  h = h.replace(/style="([^"]*)"/g, (m, value) => {
    const parts = value
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
    return `style="${parts.join('; ')}"`
  })
  h = h.replace(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (m, tag, body, selfClose) => {
    const attrs = [...body.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]])
    attrs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
    const rendered = attrs.map(([k, v]) => `${k}="${v}"`).join(' ')
    return `<${tag}${rendered ? ` ${rendered}` : ''}${selfClose ? ' /' : ''}>`
  })
  const tags = []
  h = h.replace(/<[^>]+>/g, (m) => {
    tags.push(m)
    return `\u0000${tags.length - 1}\u0000`
  })
  h = h.replace(/[ \t\r\n]+/g, ' ')
  h = h.replace(/(\u0000\d+\u0000) /g, '$1')
  h = h.replace(/ (\u0000\d+\u0000)/g, '$1')
  h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => tags[Number(i)])
  return h.trim()
}

test('default 主题的发布输出与站点真实剪贴板内容一致（规范化后）', () => {
  const markdown = readFileSync(path.join(ROOT, 'test', 'fixtures', 'stress_real_img.md'), 'utf8').replace(/\r\n/g, '\n')
  const gold = readFileSync(path.join(ROOT, 'test', 'golden', 'site-clip.default.html'), 'utf8')
  const { html, themeKey } = render(markdown, { theme: 'default' })
  assert.equal(themeKey, 'default')

  const a = canon(gold)
  const b = canon(html)
  if (a !== b) {
    let i = 0
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
    assert.fail(
      `站点与本地输出在第 ${i} 个字符处分叉\n` +
        `  站点: ${JSON.stringify(a.slice(Math.max(0, i - 120), i + 200))}\n` +
        `  本地: ${JSON.stringify(b.slice(Math.max(0, i - 120), i + 200))}`,
    )
  }
  assert.equal(a, b)
})
