/**
 * 批注与占位：人留给模型的"这批文字我想怎样"的信号。
 *
 * 两种载体，互不替代：
 *   1. **行内占位** `<!-- 鱼排: 这里补一个过渡句 -->` —— 人在正文里直接打字留下的记号。
 *      它是 Markdown 的一部分，所以天然进 diff；渲染时是 HTML 注释，公众号里不可见。
 *   2. **块级批注**（sidecar）—— 人不想动正文时用；挂在某个块上，人改了那段文字就靠
 *      hash / 引用片段重锚，锚不上就标 orphan 而不是悄悄丢掉。
 *
 * 这一层是纯函数：不碰文件系统，宿主负责存取。
 */

import { containment } from './markdown.mjs'

/** 行内占位语法：`<!-- 鱼排: 文字 -->`（也接受 fishpai / 中文冒号）。 */
export const PLACEHOLDER_RE = /<!--\s*(?:鱼排|fishpai)\s*[:：]\s*([\s\S]*?)\s*-->/g

/**
 * 把**代码区域**遮成等长空白，行结构不变（行号还能对上原文）。
 *
 * 为什么需要：文章里讲解用法时常常把 `<!-- 鱼排: 这里补个数据 -->` 写进行内代码当例子，
 * 那是"示例"不是"待办"。不遮的话面板会一直显示"待补 1"，而人根本找不到要补什么。
 * 遮的是**围栏代码块**与**行内代码**（缩进式代码块不遮：那需要更重的解析，收益也小）。
 */
function maskCode(markdown) {
  const lines = String(markdown || '').split('\n')
  let fence = null
  return lines.map((line) => {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      return ' '.repeat(line.length)
    }
    if (m) {
      fence = m[1]
      return ' '.repeat(line.length)
    }
    return line.replace(/(`+)[^`]*\1/g, (full) => ' '.repeat(full.length))
  })
}

/** 从 Markdown 里抽出全部行内占位（1-based 行号，便于面板跳转）。代码区域里的不算。 */
export function extractPlaceholders(markdown) {
  const source = String(markdown || '')
  const mask = maskCode(source).join('\n')
  // 遮罩与原文等长、行结构相同，所以在整篇上跑正则、再按字符偏移拆出行号/列号——
  // 逐行扫会漏掉**跨行**的占位（`<!-- 鱼排: 第一行\n第二行 -->` 这种写法直接整条消失）。
  const lines = source.split('\n')
  const lineStarts = [0]
  for (let i = 0; i < lines.length - 1; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1)
  const out = []
  const re = new RegExp(PLACEHOLDER_RE.source, 'g')
  let lineNo = 0
  let m
  while ((m = re.exec(mask)) !== null) {
    while (lineStarts[lineNo + 1] !== undefined && lineStarts[lineNo + 1] <= m.index) lineNo++
    // `col` = 这一行里的字符偏移：同一行有两处**文字相同**的占位时，
    // 只按 `行号-文字` 做 React key 会撞（重复 key → 警告与错渲染）
    out.push({ line: lineNo + 1, col: m.index - lineStarts[lineNo], text: m[1].trim(), raw: m[0], blockId: null })
  }
  return out
}

/** 把占位挂到它所在的块上（面板跳转与模型定位用）。 */
export function attachPlaceholdersToBlocks(placeholders, blocks) {
  return placeholders.map((p) => {
    const block = blocks.find((b) => b.startLine <= p.line && p.line <= b.endLine)
    return { ...p, blockId: block ? block.id : null, blockIndex: block ? block.index : null }
  })
}

/** 是否还有未处理的占位（复制到公众号前的提醒用）。 */
export function hasPlaceholders(markdown) {
  return extractPlaceholders(markdown).length > 0
}

let noteSeq = 0

/** 造一条批注。id 只在一次进程内唯一即可（真正持久化靠 sidecar 里的 id）。 */
export function makeNote({ blockId = null, quote = '', text = '', author = 'human', at = Date.now() } = {}) {
  noteSeq += 1
  return {
    id: `n${at.toString(36)}${noteSeq.toString(36)}`,
    blockId,
    quote: String(quote || '').slice(0, 200),
    text: String(text || '').slice(0, 2000),
    author,
    at,
    resolved: false,
    orphan: false,
  }
}

/**
 * 重锚批注：人改过正文之后，原来的 blockId 可能已经不存在。
 * 顺序：id 命中 → hash 命中 → 引用片段模糊命中 → orphan。
 *
 * 性能：模糊命中那一步是 notes × blocks 的 `containment`，但每对内部已截断到
 * 400 × 4000 字符（见 markdown.mjs），实测 50 注 × 200 块的全失锚最坏情况约 40ms——
 * 预览那条路有 300ms 防抖，够用。外层不需要再加批注数上限：真加出 500 注的文档时，
 * 该担心的是批注本身而不是这里。
 *
 * @param {Array<object>} notes  sidecar 里的批注
 * @param {Array<object>} blocks 当前文档的块
 * @returns {Array<object>} 锚定结果（新对象；不修改入参）
 */
export function reanchorNotes(notes, blocks) {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  return notes.map((note) => {
    const exact = note.blockId ? byId.get(note.blockId) : null
    if (exact) return { ...note, blockIndex: exact.index, headingPath: exact.headingPath, orphan: false }

    const quote = normalize(note.quote)
    if (quote) {
      // 先找包含引用片段的块；多个候选时取最靠前的（人改字后位置通常不变）
      const contains = blocks.find((b) => normalize(b.text).includes(quote))
      if (contains) {
        return { ...note, blockId: contains.id, blockIndex: contains.index, headingPath: contains.headingPath, orphan: false }
      }
      // 再退一步：人把那句话改掉了一部分，就看"这句话还剩多少"在哪个块里
      let best = null
      let bestScore = 0
      for (const b of blocks) {
        const score = containment(quote, b.text)
        if (score > bestScore) {
          bestScore = score
          best = b
        }
      }
      if (best && bestScore >= 0.6) {
        return { ...note, blockId: best.id, blockIndex: best.index, headingPath: best.headingPath, orphan: false }
      }
    }
    return { ...note, blockIndex: null, headingPath: [], orphan: true }
  })
}

function normalize(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 面板上的分组视图：未解决 / 已解决 / 失锚。 */
export function groupNotes(notes) {
  return {
    open: notes.filter((n) => !n.resolved && !n.orphan),
    orphan: notes.filter((n) => n.orphan),
    resolved: notes.filter((n) => n.resolved),
  }
}
