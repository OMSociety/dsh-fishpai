/**
 * 微信编辑器「结构校验」的可复现约束（不需要浏览器）。
 *
 * 背景（实测，见微信官方规范 1.3 与官方实现 `verify-article-structure-spec` 的
 * `cli/engine/layout.ts`）：它的 line-height 规则是**实测**的——
 *   lineCount  = Range(node).getClientRects().length
 *   overlapping = lineHeight === 0 || (lineCount >= 2 && contentHeight / lineCount < 0.95 × fontSize)
 * 它把"矩形个数"当行数，而**行内元素会把同一行拆成多个矩形**：一个 `line-height: 1.8` 的两行段落
 * 只要含一个 `<span>`/`<a>`/`<strong>`，矩形数就变成 6，"平均行高"被算成 8.97px < 15.2px
 * → 被报成"行高小于字体大小，且存在多行文本，可能导致文字重叠（实测）"。
 *
 * 修法：复制/导出时把文字包进 `<span>`（`wrapText`）——块级元素不再有**直接文字子节点**，
 * 那条规则就不再命中；这正是微信自己插入内容后的结构（`<span leaf="">`）。
 * **已知边界**：`wrapText` 改的是 markdown-it 的 `text` 规则，代码块走 `fence` 规则、包不到，
 * 而代码块天然多行，同一套"内容高度 ÷ 矩形数"照样算小——所以**带代码块的文章仍会被标出那一条**
 * （上游形态也一样；面板里对此没有承诺，README 里写明了）。
 * 本文件检查的就是这条**结构性充分条件**，所以它不依赖浏览器，也不需要联网。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '../plugin/core/render.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'test', 'golden', 'manifest.json'), 'utf8'))

/**
 * 官方兜底检测会看的块级标签（`collectLineHeightFallback` 的 blockTags）+ 引用/表头。
 * 故意**不含** `pre`/`code`：代码块里的文字包不到（见下面那条已知边界），
 * 把它们算进来只会让这条测试常年红着，反而失去信号。
 */
const BLOCK = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'blockquote'])
const VOID = new Set(['br', 'hr', 'img', 'input', 'col', 'source'])

/**
 * 找出"既有直接文字子节点、又有子元素"的块级元素——正好是官方那条规则会去量的候选。
 * （只做结构统计，不看样式；样式阈值由官方校验器实测，本仓库不重复实现。）
 */
function mixedBlocks(html) {
  const found = []
  const stack = []
  // 注释不是 DOM 文字节点（childNodes 里 nodeType 是 8），官方那条规则也只数 TEXT_NODE，
  // 所以先去掉注释再统计——否则行内占位 `<!-- 鱼排: … -->` 会被误当成"直接文字"。
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '')
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g
  let cursor = 0
  let m
  const markText = (text) => {
    if (!text.trim()) return
    const top = stack[stack.length - 1]
    if (top) top.text = true
  }
  while ((m = tagRe.exec(source)) !== null) {
    markText(source.slice(cursor, m.index))
    cursor = tagRe.lastIndex
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== tag) continue
        const [el] = stack.splice(i, 1)
        if (el.text && el.children && BLOCK.has(tag)) found.push(tag)
        break
      }
      continue
    }
    const parent = stack[stack.length - 1]
    if (parent) parent.children = true
    if (!VOID.has(tag) && !m[3].trimEnd().endsWith('/')) stack.push({ tag, text: false, children: false })
  }
  return found
}

const readFixture = (name) => readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n')

const publishEntries = manifest.entries.filter((e) => e.mode === 'publish')

test('复制/导出的产物里，没有"直接文字 + 子元素"混排的块（全部主题 × 全部 fixture）', () => {
  for (const entry of publishEntries) {
    const markdown = readFixture(entry.fixture)
    const { html } = render(markdown, { theme: entry.theme, ...entry.opts, wrapText: true })
    const mixed = mixedBlocks(html)
    assert.deepEqual(mixed, [], `${entry.file} 里仍有混排块（会被微信结构校验误报）：${mixed.join(',')}`)
  }
})

test('默认渲染路径保持原样（wrapText 关着，混排块照旧存在）', () => {
  const markdown = readFixture('stress.md') // 含链接与加粗，一定有混排块
  const plain = render(markdown, { theme: 'default', publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }).html
  assert.ok(mixedBlocks(plain).length > 0, '默认路径必须与 golden 一致，不应被兼容层改动')
})

test('兼容层是纯叠加：去掉它加的那层裸 span，就回到默认产物', () => {
  const stripBareSpans = (html) => html.replace(/<span>/g, '').replace(/<\/span>/g, '')
  for (const fixture of manifest.fixtures) {
    const markdown = readFixture(fixture)
    const opts = { theme: 'default', publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }
    const plain = render(markdown, opts).html
    const wrapped = render(markdown, { ...opts, wrapText: true }).html
    assert.equal(stripBareSpans(wrapped), stripBareSpans(plain), `${fixture}：兼容层不只是"多包一层 span"`)
    assert.match(wrapped, /<span>/, `${fixture}：wrapText 应当真的包了 span`)
  }
})

/**
 * `<pre>` / `<code>` 里**直接挂着的文字**（含空白）——这也是"代码块仍会被官方校验器标出"
 * 的原因：那里的文字走 markdown-it 的 `fence` 规则（不是 `text` 规则），`wrapText` 包不到，
 * 而代码块天然多行，于是同一套"内容高度 ÷ 矩形数"的算法照样算小（上游形态也一样，见 README）。
 */
function bareCodeTexts(html) {
  const out = []
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '')
  const stack = []
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g
  let cursor = 0
  let m
  while ((m = tagRe.exec(source)) !== null) {
    const text = source.slice(cursor, m.index)
    const top = stack[stack.length - 1]
    if (text && (top === 'pre' || top === 'code')) out.push(text)
    cursor = tagRe.lastIndex
    const tag = m[2].toLowerCase()
    if (m[1] === '/') {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] !== tag) continue
        stack.splice(i, 1)
        break
      }
    } else if (!VOID.has(tag) && !m[3].trimEnd().endsWith('/')) {
      stack.push(tag)
    }
  }
  return out
}

test('代码块不在 wrapText 的覆盖范围内（这是已知边界，不是漏做）', () => {
  const markdown = readFixture('stress.md') // 含带高亮的 python 围栏 + 无语言围栏
  const opts = { theme: 'default', publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }
  const plain = render(markdown, opts).html
  const wrapped = render(markdown, { ...opts, wrapText: true }).html
  assert.ok(bareCodeTexts(plain).length > 0)
  assert.ok(bareCodeTexts(wrapped).length > 0, 'wrapText 只改 markdown-it 的 text 规则，碰不到 fence')
  // 高亮 span 的样式不能被顺手改掉
  assert.match(wrapped, /class="hljs-keyword" style="color: rgb\(198, 120, 221\);">def<\/span>/)
})

test('预览路径不加兼容层（预览 HTML 只用于面板 iframe，不进微信）', () => {
  const markdown = readFixture('stress.md')
  const preview = render(markdown, { theme: 'default', annotate: true }).html
  assert.doesNotMatch(preview, /<span>/)
})

// ── 底色兼容层：background 简写 → 微信肯保留的长写 ─────────────
//
// 微信的安全过滤是**按属性名**过的：`background-color` 在名单里，`background` 简写不在。
// 实测表现：竹林主题的引用块（background: #f0f8f0）粘进公众号后，框和底色整条丢掉。

test('底色兼容层：复制/导出的产物里没有裸的 background 简写（全部主题 × 全部 fixture）', () => {
  let withBackground = 0
  for (const entry of publishEntries) {
    const markdown = readFixture(entry.fixture)
    const { html } = render(markdown, { theme: entry.theme, ...entry.opts, wechatBackground: true })
    const bare = [...html.matchAll(/style="([^"]*)"/g)].filter((m) => /(^|;)\s*background\s*:/.test(m[1]))
    assert.deepEqual(bare.map((m) => m[1].slice(0, 60)), [], `${entry.file} 里还有裸的 background 简写（微信会整条丢掉）`)
    if (/(^|;)\s*background-(color|image)\s*:/.test(html)) withBackground += 1
  }
  assert.ok(withBackground > 0, '至少要有主题真的带块级底色，否则这条测试等于没测到东西')
})

test('底色兼容层是纯规范化：只有 background 被拆成长写，别的字节一个都不动', () => {
  const normalize = (html) => html.replace(/background(-color|-image)?:/g, 'BG:')
  for (const fixture of manifest.fixtures) {
    for (const theme of ['default', 'bamboo', 'claude', 'gradient']) {
      const markdown = readFixture(fixture)
      const opts = { theme, publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }
      const plain = render(markdown, opts).html
      const safe = render(markdown, { ...opts, wechatBackground: true }).html
      assert.equal(normalize(safe), normalize(plain), `${fixture}/${theme}：兼容层动了 background 以外的字节`)
    }
  }
})

test('底色兼容层：引用的框、表头底色在复制形态里确实是长写（竹林主题，实测的那一例）', () => {
  const markdown = readFixture('stress.md')
  const safe = render(markdown, { theme: 'bamboo', publish: true, wechatBackground: true }).html
  assert.match(safe, /<blockquote style="[^"]*background-color: #f0f8f0/)
  assert.match(safe, /<th style="[^"]*background-color: #f0f8f0/)
  assert.match(safe, /background-color: #e8f5e9/, '行内代码的底色同样要留住')
  // 渐变主题不能把 background-image 错拆成 background-color（那会变成一块纯色）
  const gradient = render(markdown, { theme: 'gradient', publish: true, wechatBackground: true }).html
  assert.match(gradient, /background-image: linear-gradient/)
  assert.doesNotMatch(gradient, /background-color: linear-gradient/)
})

test('默认渲染路径不受底色兼容层影响（关着的时候一个字节不动）', () => {
  const markdown = readFixture('reading-group.md')
  const opts = { theme: 'bamboo', publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }
  assert.equal(render(markdown, { ...opts, wechatBackground: false }).html, render(markdown, opts).html)
})
