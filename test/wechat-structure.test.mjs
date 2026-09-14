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

/** 官方兜底检测会看的块级标签（`collectLineHeightFallback` 的 blockTags）。 */
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

test('复制/导出的产物里，没有"直接文字 + 子元素"混排的块（13 主题 × 全部 fixture）', () => {
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

test('预览路径不加兼容层（预览 HTML 只用于面板 iframe，不进微信）', () => {
  const markdown = readFixture('stress.md')
  const preview = render(markdown, { theme: 'default', annotate: true }).html
  assert.doesNotMatch(preview, /<span>/)
})
