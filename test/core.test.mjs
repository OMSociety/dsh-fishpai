/**
 * 块模型 / 块级 diff / 批注与占位 的行为测试。
 *
 * 这些是"模型能不能看懂人改了什么"的地基，断言要具体到结构与语义，不能只断言"没抛异常"。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitBlocks, shortHash } from '../plugin/core/markdown.mjs'
import { diffBlocks, similarity } from '../plugin/core/diff.mjs'
import {
  attachPlaceholdersToBlocks,
  extractPlaceholders,
  groupNotes,
  hasPlaceholders,
  makeNote,
  reanchorNotes,
} from '../plugin/core/notes.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = (name) => readFileSync(path.join(ROOT, 'test', 'fixtures', name), 'utf8').replace(/\r\n/g, '\n')

const EDGE = fixture('edge.md')
const READING = fixture('reading-group.md')

// ── 块模型 ─────────────────────────────────────────────────────

test('块切分认得出各块类型、层级与行范围', () => {
  const blocks = splitBlocks(EDGE)
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['heading', 'code', 'html', 'paragraph', 'paragraph', 'html', 'paragraph', 'table', 'list', 'blockquote'],
  )
  assert.equal(blocks[0].level, 1)
  assert.equal(blocks[0].headingPath.length, 1)
  const code = blocks[1]
  assert.equal(code.text.startsWith('```mermaid'), true)
  assert.equal(code.startLine, 3)
  assert.equal(code.endLine, 5)
  for (const b of blocks) {
    assert.ok(b.startLine >= 1 && b.endLine >= b.startLine && b.endLine <= EDGE.split('\n').length, `行范围越界: ${b.id}`)
  }
})

test('信息卡片被认成 card 块并带上类型', () => {
  const blocks = splitBlocks(READING)
  const card = blocks.find((b) => b.kind === 'card')
  assert.ok(card, '应认出 :::tip 卡片')
  assert.equal(card.variant, 'tip')
  assert.equal(card.text.startsWith(':::tip'), true)
})

test('标题路径随层级正确嵌套', () => {
  const blocks = splitBlocks(READING)
  assert.deepEqual(blocks[4].headingPath, ['暑期活动预告第二弹 | 专题', '截至目前报名'])
  assert.deepEqual(blocks[8].headingPath, ['暑期活动预告第二弹 | 专题', '截至目前报名'])
})

test('块 id 是内容寻址：插入新段不改变其它块 id，改内容才改 id', () => {
  const before = splitBlocks('# 标题\n\n第一段。\n\n第二段。')
  const inserted = splitBlocks('# 标题\n\n新插一段。\n\n第一段。\n\n第二段。')
  const idsBefore = before.map((b) => b.id)
  const idsAfter = inserted.map((b) => b.id)
  assert.deepEqual(idsAfter.filter((id) => idsBefore.includes(id)), idsBefore)
  assert.equal(idsAfter.length, idsBefore.length + 1)

  const edited = splitBlocks('# 标题\n\n第一段改过了。\n\n第二段。')
  assert.notEqual(edited[1].id, before[1].id)
  assert.equal(edited[2].id, before[2].id)
})

test('重复内容的块 id 带序号后缀', () => {
  const blocks = splitBlocks('同一段。\n\n同一段。\n\n同一段。')
  assert.deepEqual(
    blocks.map((b) => b.id),
    [`${blocks[0].hash}`, `${blocks[0].hash}#2`, `${blocks[0].hash}#3`],
  )
  assert.equal(blocks[0].hash, shortHash(`paragraph\u0000${'同一段。'}`))
})

// ── 块级 diff ──────────────────────────────────────────────────

test('相同文档没有差异', () => {
  const d = diffBlocks(READING, READING)
  assert.equal(d.entries.length, 0)
  assert.equal(d.stats.changed, 0)
  assert.equal(d.stats.added, 0)
  assert.equal(d.stats.removed, 0)
  assert.equal(d.stats.unchanged, splitBlocks(READING).length)
})

test('改一段 → 一条 changed，并带前后文', () => {
  const current = READING.replace('后续更新，欢迎大家。', '后续更新，欢迎大家。（已截止）')
  const d = diffBlocks(READING, current)
  assert.equal(d.entries.length, 1)
  const e = d.entries[0]
  assert.equal(e.status, 'changed')
  assert.equal(e.kind, 'paragraph')
  assert.match(e.before, /后续更新/)
  assert.match(e.after, /已截止/)
  assert.deepEqual(e.headingPath, ['暑期活动预告第二弹 | 专题', '截至目前报名'])
})

test('加一段 / 删一段 → added / removed，且块 id 指向当前文档那一块', () => {
  const added = diffBlocks(READING, `${READING}\n\n补一段收尾。\n`)
  assert.equal(added.entries.length, 1)
  assert.equal(added.entries[0].status, 'added')
  assert.match(added.entries[0].after, /补一段收尾/)
  const blocksNow = splitBlocks(`${READING}\n\n补一段收尾。\n`)
  assert.equal(added.entries[0].blockId, blocksNow[blocksNow.length - 1].id)

  const removed = diffBlocks(`${READING}\n\n补一段收尾。\n`, READING)
  assert.equal(removed.entries.length, 1)
  assert.equal(removed.entries[0].status, 'removed')
  assert.match(removed.entries[0].before, /补一段收尾/)
})

test('整篇重写被折叠成摘要，避免灌满上下文', () => {
  const long = Array.from({ length: 20 }, (_, i) => `## 小节 ${i}\n\n第 ${i} 段内容。`).join('\n\n')
  const other = Array.from({ length: 20 }, (_, i) => `## 另起 ${i}\n\n完全不同的第 ${i} 段。`).join('\n\n')
  const d = diffBlocks(long, other)
  assert.equal(d.rewritten, true)
  assert.equal(d.entries[0].status, 'rewritten')
  assert.match(d.entries[0].summary, /整篇重写/)
  assert.ok(d.entries.length <= 9, '折叠后只留少量样本')
})

test('条目上限生效并标记 truncated', () => {
  const base = Array.from({ length: 10 }, (_, i) => `第 ${i} 段。`).join('\n\n')
  const next = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? `第 ${i} 段。` : `改了第 ${i} 段的内容。`)).join('\n\n')
  const d = diffBlocks(base, next, { limit: 3 })
  assert.equal(d.rewritten, false)
  assert.equal(d.entries.length, 3)
  assert.equal(d.truncated, true)
  assert.equal(d.stats.blocksAfter, 10)
})

test('相似度可区分改写与无关内容', () => {
  assert.ok(similarity('今天下午三点开会', '今天下午四点开会') > 0.5)
  assert.ok(similarity('今天下午三点开会', '随便一句完全不相干的话') < 0.2)
})

// ── 批注与占位 ─────────────────────────────────────────────────

test('抽出行内占位并挂到所在块', () => {
  const placeholders = extractPlaceholders(EDGE)
  assert.equal(placeholders.length, 1)
  assert.equal(placeholders[0].line, 13)
  assert.equal(placeholders[0].text, '这里需要一个过渡句')
  const attached = attachPlaceholdersToBlocks(placeholders, splitBlocks(EDGE))
  assert.ok(attached[0].blockId, '占位应挂到某个块上')
  assert.equal(attached[0].blockIndex, 5)
  assert.equal(hasPlaceholders(EDGE), true)
  assert.equal(hasPlaceholders(READING), false)
})

test('批注在正文未改时保持锚定，改动其它块不受影响', () => {
  const blocks = splitBlocks(READING)
  const note = makeNote({ blockId: blocks[5].id, quote: blocks[5].text, text: '这句太干，加个例子' })
  const anchored = reanchorNotes([note], blocks)
  assert.equal(anchored[0].orphan, false)
  assert.equal(anchored[0].blockIndex, 5)

  const editedOther = splitBlocks(READING.replace('****', '**（宣）**'))
  const still = reanchorNotes([note], editedOther)
  assert.equal(still[0].orphan, false)
  assert.equal(still[0].blockIndex, 5)
})

test('人改了那段文字后，批注按引用片段重锚', () => {
  const blocks = splitBlocks(READING)
  const note = makeNote({ blockId: blocks[5].id, quote: '后续更新，欢迎大家。', text: '改成已截止' })
  // 原句没被整段保留，但大部分还在 → 应重锚到同一块
  const edited = splitBlocks(READING.replace('后续更新，欢迎大家。', '后续更新，欢迎大家尽快。'))
  const anchored = reanchorNotes([note], edited)
  assert.equal(anchored[0].orphan, false)
  assert.equal(anchored[0].blockId, edited[5].id)
})

test('那句话被整段重写后，批注标 orphan 而不是乱挂', () => {
  const blocks = splitBlocks(READING)
  const note = makeNote({ blockId: blocks[5].id, quote: '后续更新，欢迎大家。', text: '改成已截止' })
  const edited = splitBlocks(READING.replace('后续更新，欢迎大家。', '名单已定，另行通知。'))
  const anchored = reanchorNotes([note], edited)
  assert.equal(anchored[0].orphan, true)
})

test('那块被删掉后批注标 orphan，而不是悄悄消失', () => {
  const blocks = splitBlocks(READING)
  const note = makeNote({ blockId: blocks[9].id, quote: '****', text: '这里加联系方式' })
  const without = splitBlocks(READING.replace('****', '**另一个署名**'))
  const anchored = reanchorNotes([note], without)
  const grouped = groupNotes(anchored)
  assert.equal(grouped.orphan.length, 1)
  assert.equal(grouped.open.length, 0)
})

test('批注分组：未解决 / 失锚 / 已解决', () => {
  const blocks = splitBlocks(READING)
  const open = makeNote({ blockId: blocks[5].id, quote: blocks[5].text, text: 'a' })
  const resolved = { ...makeNote({ blockId: blocks[6].id, quote: blocks[6].text, text: 'b' }), resolved: true }
  const orphan = { ...makeNote({ blockId: 'nope', quote: '', text: 'c' }), orphan: true }
  const g = groupNotes([open, resolved, orphan])
  assert.equal(g.open.length, 1)
  assert.equal(g.resolved.length, 1)
  assert.equal(g.orphan.length, 1)
})
