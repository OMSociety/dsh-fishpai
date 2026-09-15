/**
 * Markdown 源码编辑：快捷键与格式化动作的**唯一实现**。
 *
 * 为什么单独一层、而且是纯函数：这些变换最容易写错（选区、行前缀、光标落点、撤销），
 * 写在 React 组件里就只能靠人手点着试。这里的每个函数都是
 * `(text, start, end) => { from, to, insert, start, end }`——只描述"把哪一段换成什么、
 * 换完光标在哪"，谁来执行由调用方决定（面板走 `document.execCommand('insertText')`，
 * 这样 Ctrl+Z 仍然是浏览器原生的撤销栈）。`test/mdedit.test.mjs` 直接编译本文件跑断言。
 *
 * 快捷键表 `SHORTCUTS` 同时喂三处：键盘匹配 `matchShortcut()`、界面上的速查表、
 * 以及测试。三处各写一份是这类功能最常见的烂法（改了键、提示没改）。
 *
 * 键位参照 linux.do（Discourse）那套 Markdown 编辑器的习惯：Mod+B/I/K 是它本来就有的，
 * 其余按主流编辑器补齐（行内代码用 E、列表用 Shift+7/8、标题用 Alt+1/2/3）。
 */

/** 一次编辑：把旧文本的 `[from, to)` 换成 `insert`，结果里的选区是 `[start, end)`。 */
export interface EditResult {
  from: number
  to: number
  insert: string
  start: number
  end: number
}

/** 只取键盘事件里真正用到的几个字段，方便测试直接造事件。 */
export interface KeyEventLike {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export type EditAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h0'
  | 'quote'
  | 'ul'
  | 'ol'

export type ShortcutId = EditAction | 'save' | 'copy' | 'note'

export interface ShortcutSpec {
  id: ShortcutId
  label: string
  group: '编辑' | '面板'
  /** 字母键（小写）。 */
  key?: string
  /** 非字母键用 `KeyboardEvent.code`（Shift+7 在多数键盘上是 `&`，只认 key 会认错）。 */
  code?: string
  fallbackKey?: string
  /** 速查表上显示的键名；不给就用 `key` 的大写。 */
  keyLabel?: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** `panel` 的条目不由编辑器的键盘处理消化（例如批注框自己的 Enter）。 */
  scope: 'editor' | 'panel'
}

// ── 行与选区 ───────────────────────────────────────────────────

/** 选区覆盖到的整行区间（`[from, to)` 不含行尾换行符）。 */
function lineBounds(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  let to: number
  if (end > from && text[end - 1] === '\n') to = end - 1
  else {
    to = text.indexOf('\n', end)
    if (to < 0) to = text.length
  }
  return { from, to }
}

const INDENT_OF = /^[ \t]*/

/** 行首的**块级标记**（标题/引用/列表）：一次只允许一种，互相替换。 */
const BLOCK_PREFIX = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/

interface LineSpec {
  /** 判"这一行已经是这种类型了"（再按一次就取消）。 */
  match: RegExp
  /** 生成要加在行首的标记（有序列表要按行号递增）。 */
  render: (index: number) => string
}

const LINE_SPECS: Record<'h1' | 'h2' | 'h3' | 'h0' | 'quote' | 'ul' | 'ol', LineSpec> = {
  h1: { match: /^#{1}\s+/, render: () => '# ' },
  h2: { match: /^#{2}\s+/, render: () => '## ' },
  h3: { match: /^#{3}\s+/, render: () => '### ' },
  // 「正文」：把任意级别的标题摘掉
  h0: { match: /^#{1,6}\s+/, render: () => '' },
  quote: { match: /^>\s?/, render: () => '> ' },
  ul: { match: /^[-*+]\s+/, render: () => '- ' },
  ol: { match: /^\d+[.)]\s+/, render: (i) => `${i + 1}. ` },
}

// ── 行内标记（加粗/斜体/…）─────────────────────────────────────

const INLINE: Record<'bold' | 'italic' | 'strike' | 'code', { mark: string; placeholder: string }> = {
  bold: { mark: '**', placeholder: '加粗文字' },
  italic: { mark: '*', placeholder: '斜体文字' },
  strike: { mark: '~~', placeholder: '删除线' },
  code: { mark: '`', placeholder: '代码' },
}

/**
 * 用 `mark` 把选区包起来；再按一次取消（选中已是 `**x**` 或把标记一起选中时都认）。
 * 空选区插入带占位文字的标记，占位文字保持选中——直接打字就替换掉它。
 */
function wrapInline(text: string, start: number, end: number, mark: string, placeholder: string): EditResult {
  const selected = text.slice(start, end)
  const before = text.slice(Math.max(0, start - mark.length), start)
  const after = text.slice(end, end + mark.length)

  // 1) 标记就在选区外侧：取消它
  if (selected && before === mark && after === mark) {
    const from = start - mark.length
    return { from, to: end + mark.length, insert: selected, start: from, end: from + selected.length }
  }
  // 2) 标记被一起选中了：只留里面的内容
  if (selected.length >= mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark)) {
    const inner = selected.slice(mark.length, selected.length - mark.length)
    return { from: start, to: end, insert: inner, start, end: start + inner.length }
  }

  const body = selected || placeholder
  const insert = `${mark}${body}${mark}`
  const bodyStart = start + mark.length
  return { from: start, to: end, insert, start: bodyStart, end: bodyStart + body.length }
}

/** 链接：选中了文字就把它当标题、把 URL 位置选中（直接粘贴即替换）；没选就把标题占位选中。 */
function insertLink(text: string, start: number, end: number): EditResult {
  const selected = text.slice(start, end)
  const label = selected || '文字'
  const href = '链接地址'
  const insert = `[${label}](${href})`
  const hrefStart = start + label.length + 3
  if (selected) {
    return { from: start, to: end, insert, start: hrefStart, end: hrefStart + href.length }
  }
  return { from: start, to: end, insert, start: start + 1, end: start + 1 + label.length }
}

// ── 块级前缀（标题/引用/列表）───────────────────────────────────

function withLinePrefix(text: string, start: number, end: number, spec: LineSpec): EditResult {
  const { from, to } = lineBounds(text, start, end)
  const block = text.slice(from, to)

  // 空行：直接把标记插进去，光标落在标记后面，用户接着写就是新的一段
  if (!block.trim()) {
    const insert = spec.render(0)
    return { from, to, insert, start: from + insert.length, end: from + insert.length }
  }

  const lines = block.split('\n').map((line) => {
    const indent = (INDENT_OF.exec(line) || [''])[0]
    const raw = line.slice(indent.length)
    return { indent, raw, bare: raw.replace(BLOCK_PREFIX, '') }
  })
  // 判"已经是这种类型了"要看**带标记的原行**；要写的正文则是摘掉标记之后的
  const all = lines.every((l) => spec.match.test(l.raw))
  const insert = lines.map((l, i) => (all ? l.indent + l.bare : l.indent + spec.render(i) + l.bare)).join('\n')
  return { from, to, insert, start: from, end: from + insert.length }
}

// ── 缩进 / 反缩进 ──────────────────────────────────────────────

const LIST_OR_INDENT = /^(?:[ \t]+|[-*+]\s+|\d+[.)]\s+)/

/**
 * Tab：段落里就是插一段缩进（保持原有手感），列表里或选了多行则整体缩进一级。
 */
export function indentSelection(text: string, start: number, end: number, step = '  '): EditResult {
  const { from, to } = lineBounds(text, start, end)
  const line = text.slice(from, to)
  const inList = LIST_OR_INDENT.test(line)
  // 选了东西、或本来就是列表/缩进行：整体缩进一级；普通段落里只是插入一段空白
  const multi = end > start
  if (!inList && !multi) {
    return { from: start, to: end, insert: step + text.slice(start, end), start: start + step.length, end: end + step.length }
  }
  const lines = text.slice(from, to).split('\n')
  const insert = lines.map((l) => step + l).join('\n')
  return { from, to, insert, start: start + step.length, end: end + step.length * lines.length }
}

/** Shift+Tab：去掉一级缩进；没有可去的就返回 null（调用方只吞掉按键，不动文本）。 */
export function outdentSelection(text: string, start: number, end: number, step = '  '): EditResult | null {
  const { from, to } = lineBounds(text, start, end)
  const lines = text.slice(from, to).split('\n')
  let deltaHead = 0
  let deltaAll = 0
  const out = lines.map((line, i) => {
    const indent = (INDENT_OF.exec(line) || [''])[0]
    if (!indent) return line
    const cut = indent.length >= step.length ? step.length : indent.length
    if (i === 0) deltaHead = cut
    deltaAll += cut
    return line.slice(cut)
  })
  if (!deltaAll) return null
  const insert = out.join('\n')
  const nextStart = Math.max(from, start - deltaHead)
  return { from, to, insert, start: nextStart, end: Math.max(nextStart, end - deltaAll) }
}

// ── 回车续列表 ─────────────────────────────────────────────────

const LINE_MARKER = /^([ \t]*)([-*+]|\d+[.)]|>)\s+(.*)$/

/**
 * 在列表/引用行里按回车：接着写下一项（有序列表自动 +1）。
 * 空条目不续——先缩进退一级，已经在顶层就把标记摘掉，等于"退出列表"。
 *
 * 返回 null 表示"这不是列表行"，让浏览器按原样插入换行。
 */
export function continueList(text: string, start: number, end: number): EditResult | null {
  const { from, to } = lineBounds(text, start, end)
  const raw = text.slice(from, to)
  // CRLF：行尾那个 `\r` 不算正文。JS 的 `.` **不匹配 `\r`**，带着它去匹配行标记会整条失败——
  // 实测 CRLF 文本里"在列表行中间按回车"返回 null（不续列表），而同样的 LF 文本正常。
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const lineEnd = from + line.length // 本行正文的结束位置（不含 `\r`）
  const m = LINE_MARKER.exec(line)
  if (!m) return null
  const [full, indent, marker, rest] = m
  const restStart = from + full.length - rest.length
  if (start < restStart) return null // 光标还在标记里：别自作聪明

  // 空条目 + 光标在行尾：退出（嵌套的先退一级）
  if (!rest.trim() && start >= lineEnd) {
    // 替换范围截到 `lineEnd`：CRLF 文本里不能把行尾那个 `\r` 一起换掉，
    // 否则这一行会从 CRLF 变成孤立的 LF（同一份文档里混两种行尾）。
    const cut = Math.min(to, lineEnd)
    if (indent.length >= 2) {
      const insert = `${indent.slice(0, -2)}${marker} `
      return { from, to: cut, insert, start: from + insert.length, end: from + insert.length }
    }
    return { from, to: cut, insert: '', start: from, end: from }
  }

  const nextMarker = marker === '>' ? '>' : /^\d/.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker
  const insert = `\n${indent}${nextMarker} `
  return { from: start, to: end, insert, start: start + insert.length, end: start + insert.length }
}

// ── 动作入口 ───────────────────────────────────────────────────

/** 面板里所有格式化动作的唯一入口。 */
export function applyAction(id: EditAction, text: string, start: number, end: number): EditResult {
  switch (id) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code': {
      const spec = INLINE[id]
      return wrapInline(text, start, end, spec.mark, spec.placeholder)
    }
    case 'link':
      return insertLink(text, start, end)
    default:
      return withLinePrefix(text, start, end, LINE_SPECS[id])
  }
}

// ── 快捷键表 ───────────────────────────────────────────────────

export const SHORTCUTS: ShortcutSpec[] = [
  { id: 'bold', label: '加粗', group: '编辑', key: 'b', mod: true, scope: 'editor' },
  { id: 'italic', label: '斜体', group: '编辑', key: 'i', mod: true, scope: 'editor' },
  { id: 'code', label: '行内代码', group: '编辑', key: 'e', mod: true, scope: 'editor' },
  { id: 'link', label: '链接', group: '编辑', key: 'k', mod: true, scope: 'editor' },
  { id: 'strike', label: '删除线', group: '编辑', key: 'x', mod: true, shift: true, scope: 'editor' },
  { id: 'h1', label: '一级标题', group: '编辑', code: 'Digit1', keyLabel: '1', mod: true, alt: true, scope: 'editor' },
  { id: 'h2', label: '二级标题', group: '编辑', code: 'Digit2', keyLabel: '2', mod: true, alt: true, scope: 'editor' },
  { id: 'h3', label: '三级标题', group: '编辑', code: 'Digit3', keyLabel: '3', mod: true, alt: true, scope: 'editor' },
  { id: 'h0', label: '正文（去掉标题）', group: '编辑', code: 'Digit0', keyLabel: '0', mod: true, alt: true, scope: 'editor' },
  { id: 'quote', label: '引用', group: '编辑', code: 'Period', fallbackKey: '.', keyLabel: '.', mod: true, shift: true, scope: 'editor' },
  { id: 'ul', label: '无序列表', group: '编辑', code: 'Digit8', fallbackKey: '8', keyLabel: '8', mod: true, shift: true, scope: 'editor' },
  { id: 'ol', label: '有序列表', group: '编辑', code: 'Digit7', fallbackKey: '7', keyLabel: '7', mod: true, shift: true, scope: 'editor' },
  { id: 'save', label: '保存', group: '面板', key: 's', mod: true, scope: 'editor' },
  { id: 'copy', label: '复制到公众号', group: '面板', key: 'c', mod: true, shift: true, scope: 'editor' },
  // 批注框有自己的键盘处理，这里只做速查
  { id: 'note', label: '添加批注', group: '面板', key: 'enter', keyLabel: 'Enter', mod: true, scope: 'panel' },
]

function keyMatches(spec: ShortcutSpec, event: KeyEventLike): boolean {
  if (spec.code) {
    if (event.code) return event.code === spec.code
    return spec.fallbackKey ? String(event.key).toLowerCase() === spec.fallbackKey : false
  }
  if (!spec.key) return false
  return String(event.key).toLowerCase() === spec.key
}

/**
 * 命中哪条快捷键。
 *
 * 修饰键要求**严格相等**：没声明的修饰键按下了就不算命中——否则 Alt+B 之类会被当成加粗，
 * 把浏览器/输入法的组合键吞掉。`scope` 用来区分"编辑器消化"与"只在速查表里出现"。
 */
export function matchShortcut(event: KeyEventLike, scope: 'editor' | 'panel' | 'all' = 'editor'): ShortcutSpec | null {
  const mod = !!(event.metaKey || event.ctrlKey)
  for (const spec of SHORTCUTS) {
    if (scope !== 'all' && spec.scope !== scope) continue
    if (!!spec.mod !== mod) continue
    if (!!spec.alt !== !!event.altKey) continue
    if (!!spec.shift !== !!event.shiftKey) continue
    if (keyMatches(spec, event)) return spec
  }
  return null
}

/** 速查表上的键位写法：Mac 用符号串（⌘⇧X），其余用 `Ctrl+Shift+X`。 */
export function shortcutHint(spec: ShortcutSpec, isMac: boolean): string {
  const key = spec.keyLabel || (spec.key ? spec.key.toUpperCase() : '')
  if (isMac) return `${spec.mod ? '⌘' : ''}${spec.alt ? '⌥' : ''}${spec.shift ? '⇧' : ''}${key}`
  const parts: string[] = []
  if (spec.mod) parts.push('Ctrl')
  if (spec.alt) parts.push('Alt')
  if (spec.shift) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}
