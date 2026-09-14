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

/** 从 Markdown 里抽出全部行内占位（1-based 行号，便于面板跳转）。 */
export function extractPlaceholders(markdown) {
  const out = []
  const lines = String(markdown || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(PLACEHOLDER_RE.source, 'g')
    let m
    while ((m = re.exec(lines[i])) !== null) {
      out.push({
        line: i + 1,
        text: m[1].trim(),
        raw: m[0],
        blockId: null,
      })
    }
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
