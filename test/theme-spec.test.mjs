/**
 * 自定义主题（主题规格）：校验、合并、以及"别把这条路走成代码执行"。
 *
 * 这一层是"让模型写主题"的地基，所以测试的重点不是 happy path，而是**越权与写坏的形态**：
 * 未知槽位、白名单外的属性、注入面（`}`/`<`/`url(`）、缺 wrapper 必备声明导致面板控件变死。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SPEC_PROPS, THEME_SLOTS, buildCustomTheme, mergeTheme, validateThemeSpec } from '../plugin/core/theme-spec.mjs'
import { render } from '../plugin/core/render.mjs'
import { themes } from '../plugin/core/runtime.mjs'

const BASE = themes()

test('自定义主题：只写要改的槽位，其余从 base 逐字继承', () => {
  const { theme, spec } = buildCustomTheme(
    { name: '我的·灰底', base: 'elegant', styles: { blockquote: 'background: #f4f4f5;' } },
    BASE,
  )
  assert.equal(spec.base, 'elegant')
  assert.equal(theme.name, '我的·灰底')
  assert.equal(theme.custom, true)
  assert.equal(theme.styles.blockquote, 'background: #f4f4f5;')
  assert.equal(theme.styles.h2, BASE.elegant.styles.h2, '没改的槽位必须与 base 逐字相同')
  // 19 个槽位必须齐备：渲染器对缺失槽位的处理是"不加 style 属性"，缺了就是"没有样式"
  for (const slot of THEME_SLOTS) assert.equal(typeof theme.styles[slot], 'string', `${slot} 必须齐备`)
})

test('自定义主题：名字省略时自动命名，且不写进 base 主题表', () => {
  const { theme } = buildCustomTheme({ base: 'bamboo', styles: { p: 'line-height: 2;' } }, BASE)
  assert.match(theme.name, /竹林|自定义/)
  assert.equal(BASE.custom, undefined, '不能污染内置主题表')
  assert.equal(Object.keys(BASE).length, 11)
})

test('自定义主题：wrapper 漏了 font-family / font-size 时从 base 补上并说明原因', () => {
  const { theme, spec } = buildCustomTheme(
    { base: 'elegant', styles: { wrapper: 'line-height: 2.1; color: #111;' } },
    BASE,
  )
  assert.match(theme.styles.wrapper, /font-family:/)
  assert.match(theme.styles.wrapper, /font-size:/)
  assert.ok(
    spec.notes.some((n) => /font-family|字体/.test(n)),
    '补了就要说：漏掉它们面板的「字体」「字号」会变成点了没反应的死控件',
  )
  // 补进来的必须是 base 的值，不是编的
  assert.ok(theme.styles.wrapper.includes(/font-size:[^;]+/.exec(BASE.elegant.styles.wrapper)[0]))
  assert.ok(theme.styles.wrapper.includes('line-height: 2.1'), '模型自己写的声明一个字都不能丢')
})

test('自定义主题：走进 render 的仍是那条渲染路径，内置主题逐字节不受影响', () => {
  const md = '# 标题\n\n正文一段。\n\n> 引用\n'
  const { theme } = buildCustomTheme({ name: '试一套', base: 'default', styles: { p: 'line-height: 2.2;' } }, BASE)
  const custom = render(md, { theme })
  assert.equal(custom.themeKey, 'custom')
  assert.equal(custom.themeName, '试一套')
  assert.match(custom.html, /line-height: 2\.2/)
  // 同一份输入、内置主题两次渲染必须一模一样（golden 守的就是这条路的字节）
  assert.equal(render(md, { theme: 'default' }).html, render(md, { theme: 'default' }).html)
  assert.notEqual(custom.html, render(md, { theme: 'default' }).html)
  // 未知主题名照旧当场抛错（不能让拼错的主题名悄悄变成默认主题）
  assert.throws(() => render(md, { theme: '不存在' }), /未知主题/)
  // 占位符要真的被替换：能写 {{PRIMARY}}，面板的「主题色」色板对自定义主题才有效
  const accent = buildCustomTheme({ base: 'default', styles: { h2: 'color: {{PRIMARY}};' } }, BASE)
  assert.match(render('## 小标题\n', { theme: accent.theme, color: '#123456' }).html, /#123456/)
})

test('自定义主题：越权与写坏的规格一律拒绝，且文案说清哪里不对', () => {
  const cases = [
    ['不是对象', 'nope', /必须是一个对象/],
    ['base 不存在', { base: 'nope', styles: { p: 'color: #000;' } }, /base 必须是已有的主题 key/],
    ['白名单外的属性', { base: 'default', styles: { p: 'position: fixed;' } }, /不支持的属性/],
    ['外链请求', { base: 'default', styles: { p: 'background: url(http://x/y.png);' } }, /不允许的内容/],
    ['注入面', { base: 'default', styles: { p: 'color: red; } body { color: blue;' } }, /不允许的内容/],
    ['尖括号', { base: 'default', styles: { p: 'color: <script>' } }, /不允许的内容/],
    ['未知槽位', { base: 'default', styles: { pp: 'color: #000;' } }, /不认识的槽位/],
    ['槽位值不是字符串', { base: 'default', styles: { p: 42 } }, /必须是字符串/],
    ['空 styles', { base: 'default', styles: {} }, /一个槽位都没有/],
    ['缺 styles', { base: 'default' }, /styles 不能为空/],
    ['写了图标/emoji', { base: 'default', styles: { p: 'color: #000;' }, emoji: '🌿' }, /只认 name \/ base \/ styles/],
    ['看不懂的声明', { base: 'default', styles: { p: '!important' } }, /看不懂的声明/],
    ['主题名过长', { base: 'default', styles: { p: 'color: #000;' }, name: 'x'.repeat(30) }, /主题名太长/],
    ['换行', { base: 'default', styles: { p: 'color: #000;\nfont-size: 18px;' } }, /不能换行/],
    ['属性没值', { base: 'default', styles: { p: 'color: ;' } }, /看不懂的声明|没有值/],
  ]
  for (const [label, spec, re] of cases) {
    assert.throws(() => validateThemeSpec(spec, BASE), re, label)
  }
})

test('自定义主题：!important 被去掉并留一条提示（微信不保留它）', () => {
  const { theme, spec } = buildCustomTheme({ base: 'default', styles: { p: 'color: #b91c1c !important;' } }, BASE)
  assert.equal(theme.styles.p, 'color: #b91c1c;')
  assert.ok(spec.notes.some((n) => /important/.test(n)))
})

test('自定义主题：不用 {{PRIMARY}} 时给一条提示（面板色板对它无效，这没错但要说）', () => {
  const { spec } = buildCustomTheme({ base: 'default', styles: { p: 'color: #000;' } }, BASE)
  assert.ok(spec.notes.some((n) => /\{\{PRIMARY\}\}/.test(n)))
  const withAccent = buildCustomTheme({ base: 'default', styles: { h2: 'color: {{PRIMARY}};' } }, BASE)
  assert.ok(!withAccent.spec.notes.some((n) => /没有用到/.test(n)))
})

test('属性白名单是统计出来的：内置主题用过的属性一个都不能漏', () => {
  const used = new Set()
  for (const t of Object.values(BASE)) {
    for (const css of Object.values(t.styles || {})) {
      for (const decl of String(css).split(';')) {
        const m = /^\s*([-a-zA-Z]+)\s*:/.exec(decl)
        if (m) used.add(m[1].toLowerCase())
      }
    }
  }
  const missing = [...used].filter((p) => !SPEC_PROPS.has(p))
  assert.deepEqual(missing, [], `白名单漏了内置主题用过的属性：${missing.join(', ')}（补白名单要同时给"微信里活下来"的证据）`)
})

test('mergeTheme：不明文改动 base 主题对象（浅拷贝而不是就地改）', () => {
  const before = JSON.stringify(BASE.elegant.styles)
  mergeTheme(BASE.elegant, { name: 'x', base: 'elegant', styles: { p: 'color: #f00;' } })
  assert.equal(JSON.stringify(BASE.elegant.styles), before)
})
