/**
 * 块级 diff：把「AI 上次写入的版本」与「当前文档」对照成人能读、模型也能读的结构化差异。
 *
 * 为什么不是纯文本 diff：人改一句、AI 只需重写那一块。行级 diff 会把"改了一个词"摊成
 * 十几行噪声，块级 diff 直接给出"第 3 块（正文）从 X 变成 Y" —— 模型据此可以只 patch 那一块，
 * 从而不去碰人改过的其它块。
 *
 * 对齐算法：块 hash 序列的 LCS，再把相邻的 删除/新增 按位置配对成 `changed`（相似度 ≥ 阈值），
 * 配对失败就退回独立的 removed / added。
 */
import { splitBlocks, similarity } from './markdown.mjs'

/** 判定"这是同一块被改写"而不是"删一块加一块"的相似度下限。 */
export const CHANGE_THRESHOLD = 0.34

/** 差异条目数超过这个比例、且总块数够多时，折叠成"整篇重写"摘要。 */
export const REWRITE_RATIO = 0.6
export const REWRITE_MIN_BLOCKS = 12
/** 折叠后最多保留的改写样本数。 */
export const REWRITE_SAMPLES = 8
/** LCS 的规模上限（单元格数）：超了就降级成按位置比对，避免阻塞宿主。 */
export const MAX_DP_CELLS = 4_000_000

export { similarity }

/** 块 hash 序列的 LCS（返回对齐操作序列）。 */
function alignByLcs(a, b) {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS 长度；O(n·m) 时间与内存（调用方用 MAX_DP_CELLS 兜住规模）
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].hash === b[j].hash ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].hash === b[j].hash) {
      ops.push({ op: 'equal', a: a[i], b: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'delete', a: a[i] })
      i++
    } else {
      ops.push({ op: 'insert', b: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ op: 'delete', a: a[i++] })
  while (j < m) ops.push({ op: 'insert', b: b[j++] })
  return ops
}

/**
 * 超大文档的降级对齐：不做 LCS，直接按位置比。
 *
 * 会漏判"中间插了一段"导致的整体位移，但换来的是 O(n) 而不是 O(n·m) 的宿主阻塞。
 * 文章级文档（几百块以内）永远走 LCS 那条路。
 */
function alignByPosition(a, b) {
  const ops = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const x = a[i]
    const y = b[i]
    if (x && y && x.hash === y.hash) ops.push({ op: 'equal', a: x, b: y })
    else {
      if (x) ops.push({ op: 'delete', a: x })
      if (y) ops.push({ op: 'insert', b: y })
    }
  }
  return ops
}

function entry(status, block, extra = {}) {
  return {
    status,
    blockId: block ? block.id : null,
    index: block ? block.index : null,
    kind: block ? block.kind : null,
    headingPath: block ? block.headingPath : [],
    startLine: block ? block.startLine : null,
    endLine: block ? block.endLine : null,
    ...extra,
  }
}

/**
 * 计算块级差异。
 *
 * @param {string} baselineMarkdown AI 上次写入的版本（人改之前的基线）
 * @param {string} currentMarkdown  当前文档
 * @param {{limit?: number}} [opts] limit 是折叠后仍返回的条目上限（默认 40）
 * @returns {{entries: Array<object>, stats: object, rewritten: boolean}}
 */
export function diffBlocks(baselineMarkdown, currentMarkdown, opts = {}) {
  const limit = opts.limit ?? 40
  const before = splitBlocks(baselineMarkdown || '')
  const after = splitBlocks(currentMarkdown || '')
  // O(n·m) 的 DP 兜底：文章级文档几十到几百块，永不触发；真遇到怪文档就降级，别卡住宿主事件循环
  const degraded = (before.length + 1) * (after.length + 1) > MAX_DP_CELLS
  const ops = degraded ? alignByPosition(before, after) : alignByLcs(before, after)

  const entries = []
  const stats = {
    blocksBefore: before.length,
    blocksAfter: after.length,
    unchanged: 0,
    added: 0,
    removed: 0,
    changed: 0,
    charsBefore: (baselineMarkdown || '').length,
    charsAfter: (currentMarkdown || '').length,
  }

  // 先切成 run，再把删除/新增 run 配对成 changed
  let k = 0
  while (k < ops.length) {
    const op = ops[k]
    if (op.op === 'equal') {
      stats.unchanged++
      k++
      continue
    }
    const dels = []
    const ins = []
    while (k < ops.length && ops[k].op !== 'equal') {
      if (ops[k].op === 'delete') dels.push(ops[k].a)
      else ins.push(ops[k].b)
      k++
    }
    const pairs = Math.min(dels.length, ins.length)
    for (let p = 0; p < pairs; p++) {
      const sim = similarity(dels[p].text, ins[p].text)
      if (sim >= CHANGE_THRESHOLD) {
        stats.changed++
        entries.push(
          entry('changed', ins[p], {
            before: dels[p].text,
            after: ins[p].text,
            similarity: Number(sim.toFixed(3)),
            beforeHeadingPath: dels[p].headingPath,
          }),
        )
      } else {
        stats.removed++
        stats.added++
        entries.push(entry('removed', dels[p], { before: dels[p].text }))
        entries.push(entry('added', ins[p], { after: ins[p].text }))
      }
    }
    for (let p = pairs; p < dels.length; p++) {
      stats.removed++
      entries.push(entry('removed', dels[p], { before: dels[p].text }))
    }
    for (let p = pairs; p < ins.length; p++) {
      stats.added++
      entries.push(entry('added', ins[p], { after: ins[p].text }))
    }
  }

  const changedCount = entries.length
  const denominator = Math.max(before.length, 1)
  // 折叠门槛：改动面够大 + 文档够长 + 条目多到会灌满上下文
  const rewritten =
    before.length >= REWRITE_MIN_BLOCKS && changedCount > REWRITE_SAMPLES && changedCount / denominator > REWRITE_RATIO

  const payload = rewritten ? collapse(entries, stats) : entries.slice(0, limit)
  return {
    entries: payload,
    truncated: entries.length > payload.length,
    stats,
    rewritten,
    degraded,
  }
}

/** 整篇重写：只留统计与少量样本，避免把上下文灌满。 */
function collapse(entries, stats) {
  const sample = entries
    .filter((e) => e.status === 'changed')
    .slice(0, REWRITE_SAMPLES)
    .map((e) => ({ ...e, before: clip(e.before), after: clip(e.after) }))
  const added = entries.filter((e) => e.status === 'added').length
  const removed = entries.filter((e) => e.status === 'removed').length
  return [
    {
      status: 'rewritten',
      blockId: null,
      index: null,
      kind: 'document',
      headingPath: [],
      startLine: null,
      endLine: null,
      summary: `整篇重写：${stats.blocksBefore} 块 → ${stats.blocksAfter} 块（新增 ${added}、删除 ${removed}、改写 ${stats.changed}）`,
    },
    ...sample,
  ]
}

function clip(text, max = 400) {
  const s = String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max)}…`
}
