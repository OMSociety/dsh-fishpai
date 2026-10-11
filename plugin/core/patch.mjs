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
  // CRLF 文档（Windows 上用记事本/别的编辑器存的 .md 很常见）：split('\n') 会把行尾的
  // `\r` 留在每行末尾，于是「空行」是 `'\r'` 而不是 `''`——下面所有「是不是空行」的判据
  // 都会失灵（replace 会吞掉块尾的分隔行，下一块被并进列表）。统一在 LF 世界里做行操作，
  // 输出时再按原文档的行尾风格还原（最后一行不加 `\r`：它后面没有换行）。
  const source = String(markdown ?? '')
  const isCrlf = /\r\n/.test(source)
  const lines = isCrlf ? source.replace(/\r\n/g, '\n').split('\n') : source.split('\n')
  const denorm = (out) => {
    if (!isCrlf) return out.join('\n')
    return out.map((l, i) => (i === out.length - 1 ? l : `${l}\r`)).join('\n')
  }
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

  // 同一个块的补丁**必须在块内连续算**。
  // 块的行范围只在那一次 `splitBlocks` 里成立：前一条补丁改了长度之后，后一条再按老行号
  // `splice` 就会落进上一条的结果内部（实测：同块 `replace` 变长 + `insert_after`，新段落被
  // 插进替换结果中间，却报 applied=2、errors=[]）。所以按块分组，块内维护两个游标：
  //   head 块头（块内所有编辑都在它之后，所以它不动）
  //   end  块自身的末尾（replace / delete 的作用范围，独占）
  //   tail 下一条 insert_after 的落点（插进来的内容不属于块自身，replace 不该吃掉它）
  // 块的先后仍是"自下而上"：先动下面的块，上面块的行号才不会被顶偏。
  resolved.sort((a, b) => b.block.startLine - a.block.startLine)

  const linesOf = (text) =>
    text === null || text === '' ? [] : text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')

  // 在 `at` 处放一段块级内容，并保证它与前后**恰好各隔一个空行**。
  // 少了任一边，markdown 的"懒延续"会把新块并进相邻段——模型以为加了新段落，
  // 实际只给已有段落加了一行。replace / insert_after 共用这一条，语义才一致。
  const placeAt = (at, newLines) => {
    // 新内容自带的首尾空行（replace 的 markdown 开头带个 `\n` 很常见）会跟
    // 现场已经留好的分隔空行叠出 `\n\n\n`：只在对面真的已是空行时去掉自带的
    // 那一个，内容本身一个字不动。
    let start = 0
    let stop = newLines.length
    if (newLines[start] === '' && at > 0 && lines[at - 1] === '') start += 1
    if (newLines[stop - 1] === '' && lines[at] !== undefined && lines[at] === '') stop -= 1
    const body = newLines.slice(start, stop)
    const needHead = at > 0 && lines[at - 1] !== '' && body[0] !== ''
    const needTail = lines[at] !== undefined && lines[at] !== '' && body[body.length - 1] !== ''
    const inserted = [...(needHead ? [''] : []), ...body, ...(needTail ? [''] : [])]
    lines.splice(at, 0, ...inserted)
    return inserted.length
  }

  // 同一个块既收到 replace 又收到 delete：保 replace、跳过 delete——与顺序无关。
  // replace 带内容、意图更明确；若按先后顺序"谁后到谁生效"，同一个补丁列表换个
  // 顺序就会从「换掉这块」变「删掉这块」，调用方还看不出来。预扫描一次，两种
  // 顺序得到同样的结果与同样的错误信号。
  const blocksWithReplace = new Set(resolved.filter((r) => r.op === 'replace').map((r) => r.block))

  const applied = []
  for (let i = 0; i < resolved.length; ) {
    const { block } = resolved[i]
    const head = block.startLine - 1
    let end = block.endLine // 块自身的末尾（独占）：replace / delete 的作用范围
    let tail = end // insert_after 的落点：初始等于块尾，随插进来的内容往后走
    for (; i < resolved.length && resolved[i].block === block; i++) {
      const { op, text } = resolved[i]
      const newLines = linesOf(text)
      if (op === 'replace') {
        if (!newLines.length) {
          errors.push(`replace 需要 markdown：块 ${block.id}`)
          continue
        }
        // 先把块自己的行范围摘掉，再按 placeAt 的规矩放回去。
        // 块的范围**可能含着末尾那个空行**（列表就是，段落不含），摘掉之后分隔行可能一起没了——
        // placeAt 会按前后实况补回来，所以这里不用再单独判断"要不要保分隔行"。
        // 踩过：改一次列表项，吃掉了文末的「项目地址」两行。
        const removed = end - head
        lines.splice(head, removed)
        const inserted = placeAt(head, newLines)
        end = head + inserted
        tail += inserted - removed // 插进来的内容在块后面，跟着一起挪
      } else if (op === 'delete') {
        if (blocksWithReplace.has(block)) {
          errors.push(`块 ${block.id} 同时收到 replace 与 delete：保 replace，跳过 delete`)
          continue
        }
        const removed = end - head
        lines.splice(head, removed)
        end = head
        tail -= removed
        // 删掉两块之间唯一的正文后，前后两个分隔空行会撞在一起（`\n\n\n`）。
        // 块的范围不含分隔行，所以这里要自己收掉一个，让拼接处仍然**恰好一个**空行。
        if (head > 0 && lines[head - 1] === '' && lines[head] === '') {
          lines.splice(head, 1)
          tail -= 1
        } else if (head === 0) {
          // 首块删掉后，原块与下一块之间的分隔行被顶到文档开头（`\n次。`）——
          // 文档开头本没有"上一块"，这行分隔留着就是前导空行，收掉。
          while (lines[0] === '' && lines.length > 1) lines.splice(0, 1)
        }
      } else {
        if (!newLines.length) {
          errors.push(`insert_after 需要 markdown：块 ${block.id}`)
          continue
        }
        // 只动 tail、不动 end：插进来的内容不属于块自身，后面的 replace 不许把它吃进范围。
        tail += placeAt(tail, newLines)
      }
      applied.push({ blockId: block.id, op })
    }
  }

  return { markdown: denorm(lines), applied, errors }
}
