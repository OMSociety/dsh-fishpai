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
  // 兼容层现在是"裸 span + 条目开头一个不换行空格"，两者都剥掉才算纯叠加
  const stripBareSpans = (html) => html.replace(/<span>/g, '').replace(/<\/span>/g, '').replace(/\u00a0/g, '')
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
 * 列表项前面那个 `&nbsp;`。
 *
 * 微信会把列表项**开头**的行内片段单独起一行（`1. **块级 diff**：AI 读到的…` 粘过去变成
 * "块级 diff"一行、`：AI 读到的…`一行）。两轮对照样张在真实公众号里量出来的边界：
 * 以文字开头的条目正常、加粗在中段正常、段落里的加粗开头正常、"整条 li 包一个 span"照样拆；
 * **以 `&nbsp;` 开头的条目正常**（这就是采用它的原因）。见 HANDOFF 第 20 条。
 */
test('列表项：条目前面补一个 &nbsp;（微信会把开头的行内片段单独起一行）', () => {
  const md = '1. **块级 diff**：AI 读到的不是全文\n2. 不加粗的一条\n\n- **甲** ｜ 乙\n  - 嵌套一条 **丙**\n'
  const { html } = render(md, { theme: 'default', publish: true, wrapText: true })
  // 每个 li 开标签后面必须紧跟一个不换行空格（嵌套条目也要）
  assert.doesNotMatch(html, /<li\b[^>]*>(?!\u00a0)/, '有 li 没补 nbsp')
  assert.match(html, /<li[^>]*>\u00a0<span>嵌套一条/, '嵌套条目同样要补')
  const count = (html.match(/<li\b/g) || []).length
  assert.ok(count >= 4, `li 数量不对：${count}`)
  // 只补在 li 上：段落、标题都不该被塞 nbsp
  assert.doesNotMatch(html, /<p[^>]*>\u00a0/, '段落不该被补 nbsp')
  // 纯叠加：去掉补的 nbsp 与裸 span 就回到默认产物；默认路径本身不带 nbsp
  const strip = (s) => s.replace(/\u00a0/g, '').replace(/<span>/g, '').replace(/<\/span>/g, '')
  assert.equal(strip(html), strip(render(md, { theme: 'default', publish: true }).html))
  assert.doesNotMatch(render(md, { theme: 'default', publish: true }).html, /<li[^>]*>\u00a0/, '默认路径不许动')
})

/**
 * 松散列表（条目之间有空行）：条目首个子元素是**块级** `<p>`，这时**不许**补 nbsp。
 *
 * 补上去的那个文字节点会落在 `<p>` 外面、成为 `<li>` 的直接文字子节点（结构上多余）。判据原本只写了
 * "li 后面紧跟 `<`"，不区分行内/块级，于是把 nbsp 塞到了 `<p>` 前面；现有用例全用紧凑列表，
 * 测不出这个差异。松散列表本来就正常，所以这条判据是为了让产物结构与"这层只作用于行内开头"一致，
 * 而不是在修一个已观测到的微信症状。
 */
test('列表项：块级元素开头的条目（松散列表）不补 nbsp', () => {
  const md = '- 甲\n\n- 乙\n\n- 甲\n\n  同一条目的第二段\n'
  const { html } = render(md, { theme: 'default', publish: true, wrapText: true })
  assert.match(html, /<li\b[^>]*><p /, '这个样本必须真的是"p 开头"的松散列表，否则这条测试没有意义')
  assert.doesNotMatch(html, /<li\b[^>]*>\u00a0/, '松散列表不该补：会变成 <p> 外面的文字节点')

  // 紧凑列表照旧要补——别把真机验证过的那条修掉了
  const tight = render('- **甲**：乙\n- 丙\n', { theme: 'default', publish: true, wrapText: true })
  assert.match(tight.html, /<li\b[^>]*>\u00a0<strong/, '紧凑列表（行内元素开头）仍然要补')
  assert.match(tight.html, /<li\b[^>]*>\u00a0<span>丙/, '纯文字条目包了 span 之后同样补')
  // 列表里嵌引用块、代码块：块级开头的条目一律不动
  const mixed = render('- 甲\n\n  > 引用\n', { theme: 'default', publish: true, wrapText: true })
  assert.doesNotMatch(mixed.html, /<li\b[^>]*>\u00a0<(?:p|blockquote)/)
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

test('包裹层不制造"以空白开头/结尾的 span"（微信会把这种行内元素当成新的行/块）', () => {
  // 实测：列表项 `**批注** ｜ 光标…` 粘进公众号会变成两行（"批注"一行、`｜` 开头一行），
  // 而面板预览里是正常的一行。原因是包裹层生成了 `<span> ｜ 光标…</span>`——
  // 微信的编辑器把"以空白开头"的行内元素当新行/新块。空白留在 span 外面即可（校验只看非空白直接文字）。
  for (const entry of publishEntries) {
    const { html } = render(readFixture(entry.fixture), { theme: entry.theme, ...entry.opts, wrapText: true })
    assert.doesNotMatch(html, /<span>\s/, `${entry.file}：有 span 以空白开头`)
    assert.doesNotMatch(html, /\s<\/span>/, `${entry.file}：有 span 以空白结尾`)
    assert.doesNotMatch(html, /<span><\/span>/, `${entry.file}：有空壳 span`)
  }
  // 列表项这一例单独钉住：空白必须在 strong 与 span 之间，而不是 span 里面
  const item = render('- **批注** ｜ 光标停在哪一段', { theme: 'default', publish: true, wrapText: true }).html
  assert.match(item, /<strong[^>]*><span>批注<\/span><\/strong> <span>｜ 光标停在哪一段<\/span>/)
})

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
  const markdown = readFixture('sample-article.md')
  const opts = { theme: 'bamboo', publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }
  assert.equal(render(markdown, { ...opts, wechatBackground: false }).html, render(markdown, opts).html)
})
