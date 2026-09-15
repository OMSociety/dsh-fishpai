/**
 * 局部改稿：按块 id / 序号打补丁，而不是整篇重写。
 *
 * 这是"AI 不去动人手改过的其它块"的落地方式：模型改哪块就只改哪块，
 * 剩下的字节原样保留（连空行、行尾空格都不动）。
 *
 * 补丁从文档底部往上应用，避免前面的改动把后面的行号顶偏。
 */

/**
 * @param {string} markdown 当前文档
 * @param {Array<object>} blocks `splitBlocks(markdown)` 的结果
 * @param {Array<object>} patches `{block_id?|block_index?, op, markdown?}`
 * @returns {{markdown: string, applied: Array<object>, errors: Array<string>}}
 */
export function applyPatches(markdown, blocks, patches) {
  const lines = String(markdown ?? '').split('\n')
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const byIndex = new Map(blocks.map((b) => [b.index, b]))

  const resolved = []
  const errors = []
  for (const patch of patches || []) {
    const op = String(patch.op || 'replace')
    if (!['replace', 'insert_after', 'delete'].includes(op)) {
      errors.push(`未知 op「${op}」`)
      continue
    }
    let block = null
    if (patch.block_id) block = byId.get(String(patch.block_id)) || null
    else if (patch.block_index !== undefined && patch.block_index !== null) block = byIndex.get(Number(patch.block_index)) || null
    else {
      errors.push('补丁缺少 block_id 或 block_index')
      continue
    }
    if (!block) {
      errors.push(`找不到块 ${patch.block_id ?? patch.block_index}（文档可能已变，请重新 fishpai_read）`)
      continue
    }
    resolved.push({ op, block, text: patch.markdown === undefined ? null : String(patch.markdown) })
  }

  // 同一个块被多次 patch：按原始顺序自下而上执行，后写的在下（同位置时后执行者更靠前）
  resolved.sort((a, b) => (a.block.startLine === b.block.startLine ? b.block.endLine - a.block.endLine : b.block.startLine - a.block.startLine))

  const applied = []
  for (const { op, block, text } of resolved) {
    const from = block.startLine - 1
    const to = block.endLine // 独占末端（1-based 闭区间 → 0-based 半开）
    const newLines = text === null || text === '' ? [] : text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
    if (op === 'replace') {
      if (!newLines.length) {
        errors.push(`replace 需要 markdown：块 ${block.id}`)
        continue
      }
      // 块的行范围**包含末尾那个空行**（它就是块与块之间的分隔符）。替换时必须把分隔符补回去：
      // 少了它，下一块会与这里的结尾粘在一起——markdown 的"懒延续"会把下一段并进列表/段落，
      // 而下一轮再 replace 这个被并大了的块时，**被吞掉的块就被一起删掉了**。
      // 踩过：改一次列表项，吃掉了文末的「项目地址」两行。
      const keepsBlank = to > from && lines[to - 1] === ''
      lines.splice(from, to - from, ...newLines, ...(keepsBlank ? [''] : []))
    } else if (op === 'delete') {
      lines.splice(from, to - from)
    } else {
      if (!newLines.length) {
        errors.push(`insert_after 需要 markdown：块 ${block.id}`)
        continue
      }
      // 插入点前面补一个空行，保证与上一块分隔
      const at = to
      const needsBlank = at > 0 && lines[at - 1] !== '' && lines[at] !== undefined && lines[at] !== ''
      lines.splice(at, 0, ...(needsBlank ? [''] : []), ...newLines)
    }
    applied.push({ blockId: block.id, op })
  }

  return { markdown: lines.join('\n'), applied, errors }
}
