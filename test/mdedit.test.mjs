/**
 * Markdown 编辑动作与快捷键表的单测。
 *
 * 直接编译 `client/mdedit.ts`（esbuild 的 transform，不落盘）再 import，
 * 所以测的就是面板真正跑的那份代码——这些变换全是纯函数，"选区算错一位"是它们最容易出的错。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'client', 'mdedit.ts')

const source = fs.readFileSync(SRC, 'utf8')
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2020', charset: 'utf8' })
const md = await import(`data:text/javascript;base64,${Buffer.from(compiled.code, 'utf8').toString('base64')}`)

/** 执行一次编辑，回"新文本 + 新选区里的内容"。 */
function run(text, result) {
  const out = text.slice(0, result.from) + result.insert + text.slice(result.to)
  return { text: out, picked: out.slice(result.start, result.end), start: result.start, end: result.end }
}

/** 选中 `needle` 后按下某个动作。 */
function act(action, text, needle) {
  const start = text.indexOf(needle)
  assert.ok(start >= 0, `测试自身写错了：文本里没有 ${needle}`)
  return run(text, md.applyAction(action, text, start, start + needle.length))
}

/** 造一个真实键盘事件的形状。 */
function keyEvent(spec, overrides = {}) {
  return {
    key: spec.key ? spec.key : spec.fallbackKey || '',
    code: spec.code,
    metaKey: !!spec.mod,
    ctrlKey: false,
    shiftKey: !!spec.shift,
    altKey: !!spec.alt,
    ...overrides,
  }
}

// ── 行内标记 ───────────────────────────────────────────────────

test('加粗：包住选区、再按一次取消、空选区插占位文字并选中它', () => {
  const bold = act('bold', '这里要强调一下。', '强调')
  assert.equal(bold.text, '这里要**强调**一下。')
  assert.equal(bold.picked, '强调', '加完仍然选中原文字，方便接着改')

  // 再按一次（标记在选区外侧）
  const wrapped = bold.text
  const back = run(wrapped, md.applyAction('bold', wrapped, wrapped.indexOf('强调'), wrapped.indexOf('强调') + 2))
  assert.equal(back.text, '这里要强调一下。')

  // 连标记一起选中
  const all = '这里要**强调**一下。'
  const s = all.indexOf('**')
  const strip = run(all, md.applyAction('bold', all, s, all.indexOf('**', s + 1) + 2))
  assert.equal(strip.text, '这里要强调一下。')

  // 空选区
  const empty = run('', md.applyAction('bold', '', 0, 0))
  assert.equal(empty.text, '**加粗文字**')
  assert.equal(empty.picked, '加粗文字', '占位文字保持选中，直接打字就替换掉它')
})

test('斜体 / 删除线 / 行内代码：标记各自独立，互不干扰', () => {
  assert.equal(act('italic', '一段文字', '文字').text, '一段*文字*')
  assert.equal(act('strike', '一段文字', '文字').text, '一段~~文字~~')
  assert.equal(act('code', '一段文字', '文字').text, '一段`文字`')
  // 已经是斜体的文字按加粗：** 在外面再包一层（嵌套是合法的）
  assert.equal(act('bold', '一段*文字*', '*文字*').text, '一段***文字***')
})

test('链接：选中文字时把 URL 位置选中（直接粘贴即替换），没选时选中占位标题', () => {
  const withSel = act('link', '看这里', '这里')
  assert.equal(withSel.text, '看[这里](链接地址)')
  assert.equal(withSel.picked, '链接地址')

  const empty = run('', md.applyAction('link', '', 0, 0))
  assert.equal(empty.text, '[文字](链接地址)')
  assert.equal(empty.picked, '文字')
})

// ── 块级标记 ───────────────────────────────────────────────────

test('标题：同级再按一次取消，换级直接替换，正文（h0）把标题摘掉', () => {
  assert.equal(act('h1', '标题', '标题').text, '# 标题')
  assert.equal(act('h2', '# 标题', '标题').text, '## 标题')
  assert.equal(act('h2', '## 标题', '标题').text, '标题', '同级别再来一次 = 取消')
  assert.equal(act('h0', '### 标题', '标题').text, '标题')
  // 块级标记互斥：列表行套标题，先摘掉列表标记
  assert.equal(act('h1', '- 条目', '条目').text, '# 条目')
  assert.equal(act('quote', '# 标题', '标题').text, '> 标题')
})

test('引用与列表：整段多行一起加，再按一次整段取消；缩进保留', () => {
  const text = 'a\nb\nc'
  const ul = run(text, md.applyAction('ul', text, 0, text.length))
  assert.equal(ul.text, '- a\n- b\n- c')
  assert.equal(ul.picked, '- a\n- b\n- c', '选区覆盖整段，方便接着整体调整')

  const off = run(ul.text, md.applyAction('ul', ul.text, 0, ul.text.length))
  assert.equal(off.text, 'a\nb\nc')

  const ol = run(text, md.applyAction('ol', text, 0, text.length))
  assert.equal(ol.text, '1. a\n2. b\n3. c')

  const quoted = run(text, md.applyAction('quote', text, 0, text.length))
  assert.equal(quoted.text, '> a\n> b\n> c')

  const nested = '  a\n  b'
  assert.equal(
    run(nested, md.applyAction('ul', nested, 0, nested.length)).text,
    '  - a\n  - b',
    '已经在缩进里的行加标记时要保留缩进层级',
  )
})

test('块级标记只作用于选区碰到的整行，不动别的行', () => {
  const text = '前面\n中间\n后面'
  const out = run(text, md.applyAction('quote', text, text.indexOf('中间'), text.indexOf('中间') + 2))
  assert.equal(out.text, '前面\n> 中间\n后面')
})

// ── 缩进 ───────────────────────────────────────────────────────

test('Tab：列表或多行选区整体缩进；普通段落里只是插入一段空白', () => {
  const list = '- a\n- b'
  assert.equal(run(list, md.indentSelection(list, 0, list.length)).text, '  - a\n  - b')

  const para = '普通段落'
  const inserted = run(para, md.indentSelection(para, 2, 2))
  assert.equal(inserted.text, '普通  段落')
  assert.equal(inserted.start, 4, '光标跟着缩进一起后移')

  const caretInList = run(list, md.indentSelection(list, 4, 4))
  assert.equal(caretInList.text, '- a\n  - b', '光标所在那一行缩进，别的不动')
})

test('Shift+Tab：去掉一级缩进；没有缩进时返回 null（只吞按键、不动文本）', () => {
  const text = '  - a\n  - b'
  const out = run(text, md.outdentSelection(text, 0, text.length))
  assert.equal(out.text, '- a\n- b')

  assert.equal(md.outdentSelection('没有缩进的段落', 0, 7), null)
  // 缩进不足一级：把有的都去掉，不会把文字吃掉
  const half = ' a'
  assert.equal(run(half, md.outdentSelection(half, 0, 2)).text, 'a')
})

// ── 回车续列表 ─────────────────────────────────────────────────

test('回车：列表/引用自动接着写下一项，有序列表自动 +1', () => {
  assert.equal(run('- a', md.continueList('- a', 3, 3)).text, '- a\n- ')
  assert.equal(run('1. a', md.continueList('1. a', 4, 4)).text, '1. a\n2. ')
  assert.equal(run('> 引用', md.continueList('> 引用', 4, 4)).text, '> 引用\n> ')
  assert.equal(run('  - a', md.continueList('  - a', 5, 5)).text, '  - a\n  - ', '嵌套层级跟着走')
  // 光标在行中间：正常换行接着写，不续标记
  assert.equal(run('- ab', md.continueList('- ab', 3, 3)).text, '- a\n- b')
})

test('回车：空条目退出列表，嵌套空条目先退一级', () => {
  assert.equal(run('- a\n- ', md.continueList('- a\n- ', 6, 6)).text, '- a\n')
  assert.equal(run('  - ', md.continueList('  - ', 4, 4)).text, '- ')
  // 不是列表行：交给浏览器
  assert.equal(md.continueList('普通段落', 2, 2), null)
  assert.equal(md.continueList('# 标题', 4, 4), null)
})

// ── 快捷键表 ───────────────────────────────────────────────────

test('快捷键表：id 不重复、label 不为空、速查表两组都有', () => {
  const ids = md.SHORTCUTS.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length, 'id 不能重复')
  for (const spec of md.SHORTCUTS) {
    assert.ok(spec.label && spec.label.length, `${spec.id} 缺 label`)
    assert.ok(spec.mod || spec.alt, `${spec.id} 至少要有一个修饰键，否则会吞掉普通按键`)
    assert.ok(md.shortcutHint(spec, false).length && md.shortcutHint(spec, true).length, `${spec.id} 缺键位提示`)
  }
  const groups = new Set(md.SHORTCUTS.map((s) => s.group))
  assert.deepEqual([...groups].sort(), ['编辑', '面板'])
})

test('快捷键匹配：Mac 的 ⌘ 与 Windows 的 Ctrl 等效，多按/少按修饰键都不命中', () => {
  for (const spec of md.SHORTCUTS) {
    if (spec.scope !== 'editor') continue
    const base = keyEvent(spec)
    assert.equal(md.matchShortcut(base)?.id, spec.id, `${spec.id} 用声明的键位应当命中`)
    // code 认不出时退回 key（老浏览器 / 非 US 键盘）
    if (spec.code && spec.fallbackKey) {
      const noCode = keyEvent(spec, { code: undefined, key: spec.fallbackKey })
      assert.equal(md.matchShortcut(noCode)?.id, spec.id, `${spec.id} 应当在 code 缺失时按 key 命中`)
    }
  }
  // Ctrl 与 ⌘ 等效
  assert.equal(md.matchShortcut({ key: 'b', ctrlKey: true })?.id, 'bold')
  assert.equal(md.matchShortcut({ key: 'b', metaKey: true })?.id, 'bold')
  // 多按修饰键：不命中（否则会吞掉浏览器/输入法的组合键）
  assert.equal(md.matchShortcut({ key: 'b', metaKey: true, altKey: true }), null)
  assert.equal(md.matchShortcut({ key: 'b', metaKey: true, shiftKey: true }), null)
  // 少按修饰键：不命中
  assert.equal(md.matchShortcut({ key: 'b' }), null)
  assert.equal(md.matchShortcut({ key: 'x', metaKey: true }), null, '删除线要带上 Shift')
})

test('快捷键作用域：批注的 ⌘+Enter 不在编辑器的匹配范围里', () => {
  const enter = { key: 'Enter', metaKey: true }
  assert.equal(md.matchShortcut(enter), null)
  assert.equal(md.matchShortcut(enter, 'panel')?.id, 'note')
  assert.equal(md.matchShortcut(enter, 'all')?.id, 'note')
  // 编辑器自己消化的那几条：保存与复制到公众号
  assert.equal(md.matchShortcut({ key: 's', metaKey: true })?.id, 'save')
  assert.equal(md.matchShortcut({ key: 'c', metaKey: true, shiftKey: true })?.id, 'copy')
})

test('SHORTCUTS 与动作表对齐：每条编辑快捷键都有对应动作，反之也一样', () => {
  const actionIds = ['bold', 'italic', 'strike', 'code', 'link', 'h1', 'h2', 'h3', 'h0', 'quote', 'ul', 'ol']
  const bound = md.SHORTCUTS.filter((s) => s.scope === 'editor' && !['save', 'copy'].includes(s.id)).map((s) => s.id)
  assert.deepEqual(bound.sort(), actionIds.sort(), '动作表与快捷键表必须一一对应，否则会有"按了没反应"的键')
  for (const id of actionIds) {
    // 每个动作都要能真的跑出结果（不缺 LINE_SPECS / INLINE 的项）
    const out = md.applyAction(id, '样例', 0, 2)
    assert.equal(typeof out.insert, 'string', `${id} 没产出结果`)
  }
})
