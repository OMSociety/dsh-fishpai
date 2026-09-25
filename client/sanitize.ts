/**
 * 复制回退路径的 HTML 清洗（只在环境没有 `ClipboardItem` 时走，见 `panel.tsx` 的 `copyRich`）。
 *
 * 为什么光靠 `DOMParser` 不够：解析阶段不执行脚本，但**节点本身**带着的东西会留到插入之后——
 * `<img src=x onerror=…>` 的 `onerror` 会在搬进 WebUI 主文档（同源、能直接调 `/fishpai/api/*`）
 * 的那一刻触发；`<iframe srcdoc>`、`<link>`、`<style>` 同理，都是"解析时无害、插入后生效"。
 * 所以插入前必须把这几个标签整段剥掉、把所有事件属性与危险协议的 URL 属性去掉。
 *
 * `sanitizeTree` 只吃一棵 document-like 树（不 new DOMParser、不碰 document），于是能脱离浏览器测：
 * 真实 DOM 与测试里的桩都满足下面那几个成员。`sanitizeHtmlFragment` 只多两步：解析与取 fragment。
 */

/**
 * 整段剥掉（含内容）的标签：解析时都不会执行，插进主文档才有机会生效。
 *
 * 比"脚本类容器"多这几个：
 *   - `<style>` 能把整个 WebUI 主文档的显示改掉（覆盖层套密码框），`<base>` 会把界面里所有
 *     相对地址改掉——都是插进来才生效的同一类东西；
 *   - `<template>` 的内容挂在 `.content` 上、不在 `childNodes` 里：只走 childNodes 的遍历
 *     既清不到也不会剥它，而把模板插进主文档或 cloneNode 一样能拿到活节点；
 *   - SMIL 动画元素（`<animate attributeName="href">` 这类）能在**插入之后**改父元素属性，
 *     绕开"插入时查一次"的模型。这几个标签名只存在于 SVG（渲染器本身从不产出 SVG），
 *     代价只落在"用户在裸 HTML 里手写的 SVG 动画"上。
 */
const DROP_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'STYLE',
  'BASE',
  'TEMPLATE',
  'ANIMATE',
  'ANIMATEMOTION',
  'ANIMATETRANSFORM',
  'SET',
  'DISCARD',
])

/** 值可能是 URL 的属性。`srcset` 是逗号分隔的候选列表，单独处理。 */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'srcset', 'poster', 'formaction', 'action', 'data', 'background', 'dynsrc', 'lowsrc'])

/**
 * 栅格图的 data URI。
 *
 * `data:` 一律当危险会把**导出/复制路径自己内嵌的图片**删掉（`imageResolver` 就是写 data URI 的，
 * 而回退路径恰恰是图片最需要它的时候），所以只放行栅格类型——与宿主上传白名单
 * （`store.mjs` 的 `ASSET_MIME_EXT`）同一批，`data:image/svg+xml` 不在内。
 */
const RASTER_DATA_URI_RE = /^data:image\/(?:png|jpe?g|gif|webp|bmp)[;,]/i

export interface SanitizeAttribute {
  name: string
  value: string
}

export interface SanitizeNode {
  nodeType: number
  tagName?: string
  childNodes?: ArrayLike<SanitizeNode>
  attributes?: ArrayLike<SanitizeAttribute>
  removeAttribute?: (name: string) => void
  remove?: () => void
}

/**
 * 属性值里的控制字符与空白一律先抹掉再判协议。
 *
 * `java\tscript:` / `jav\nascript:` 是浏览器认的写法（URL 里的空白会被丢掉），
 * 只按字面前缀判会漏掉它们。
 */
function normalizeUrl(value: string): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0020\u007f-\u009f]+/g, '')
    .toLowerCase()
}

/** 这个 URL 值是不是可执行/可导航到脚本的形态。 */
function isDangerousUrl(value: string): boolean {
  const v = normalizeUrl(value)
  if (/^(?:javascript|vbscript):/.test(v)) return true
  if (v.startsWith('data:')) return !RASTER_DATA_URI_RE.test(v)
  return false
}

/**
 * 这个属性是不是"插进主文档就会生效"的属性。
 *
 * 判定前把属性名**开头的非 ASCII 字母**剥掉：`\onerror=` / `\0onerror=` 里的 `\`、NUL 不终止
 * 属性名（解析器把它们算进名字里），按原样比前缀会漏；合法属性名一律以字母开头，这一步对它们
 * 是恒等变换，`data-onerror` / `x-onerror` 也不会被误伤。
 */
function attributeIsDangerous(name: string, value: string): boolean {
  const lower = String(name || '')
    .toLowerCase()
    .replace(/^[^a-z]+/, '')
  // 事件属性与 srcdoc：都是"解析时无害、插进主文档才生效"的属性
  if (lower.startsWith('on') || lower === 'srcdoc') return true
  if (!URL_ATTRS.has(lower)) return false
  if (lower === 'srcset') {
    // "a.png 1x, javascript:… 2x"：逐个候选取 URL 部分判
    return String(value ?? '')
      .split(',')
      .some((candidate) => isDangerousUrl(candidate.trim().split(/\s+/)[0] || ''))
  }
  return isDangerousUrl(value)
}

function sanitizeAttributes(el: SanitizeNode): void {
  const attrs = el.attributes
  if (!attrs || typeof el.removeAttribute !== 'function') return
  // 属性表是实时的，删除会让它变短 —— 先快照
  for (const attr of Array.from(attrs)) {
    const name = String(attr.name || '')
    if (attributeIsDangerous(name, String(attr.value ?? ''))) el.removeAttribute(name)
  }
}

function walk(node: SanitizeNode, drop: SanitizeNode[]): void {
  const kids = node.childNodes
  if (!kids) return
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]
    if (!child) continue
    if (child.nodeType === 1) {
      const tag = String(child.tagName || '').toUpperCase()
      if (DROP_TAGS.has(tag)) {
        // 被剥掉的节点不必再往下走：它的子孙跟着一起消失
        drop.push(child)
        continue
      }
      sanitizeAttributes(child)
    }
    walk(child, drop)
  }
}

/**
 * 就地清洗一棵树（传 `doc.body`）。
 *
 * 先遍历收集、再统一删除：`remove()` 会改父节点的 childNodes，边遍历边删会漏掉兄弟节点。
 */
export function sanitizeTree(root: SanitizeNode): void {
  if (!root) return
  const drop: SanitizeNode[] = []
  walk(root, drop)
  for (const node of drop) node.remove?.()
}

/**
 * 解析 → 清洗 → 交出一个可插入的 fragment。
 *
 * 解析不出 body 时**抛错**而不是把原样的 HTML 插进主文档：回退路径是 Firefox 等环境下唯一的
 * 复制通道，静默失败会让人以为"复制成功了"，粘进公众号才发现是空的或带着脚本。
 */
export function sanitizeHtmlFragment(html: string, parser: DOMParser = new DOMParser()): DocumentFragment {
  const doc = parser.parseFromString(html, 'text/html')
  if (!doc || !doc.body) throw new Error('这段内容没能解析成 HTML，复制已中止')
  sanitizeTree(doc.body as unknown as SanitizeNode)
  const fragment = document.createDocumentFragment()
  // childNodes 是实时的：搬走一个就少一个，所以先快照
  for (const node of Array.from(doc.body.childNodes)) fragment.appendChild(node)
  return fragment
}
