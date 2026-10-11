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
    // 双引号能闭合 style="…"（各槽位与 wrapper 都是双引号包裹的属性）
    ['双引号闭合 style 属性', { base: 'default', styles: { p: 'color: red" onmouseover="alert(1)' } }, /不允许的内容/],
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

test("自定义主题：单引号字体栈是合法写法（属性由双引号包裹，单引号闭合不了任何东西）", () => {
  const { theme } = buildCustomTheme({ base: 'default', styles: { p: "font-family: 'Georgia', serif;" } }, BASE)
  assert.equal(theme.styles.p, "font-family: 'Georgia', serif;")
  // 真的落进产物，且没有把 style 属性撑开（撑开的话会多出属性、正文跟着变）
  const html = render('正文一段。\n', { theme }).html
  assert.match(html, /<p style="font-family: 'Georgia', serif;">正文一段。<\/p>/)
})

test('自定义主题：!important 被去掉并留一条提示（微信不保留它）', () => {
  const { theme, spec } = buildCustomTheme({ base: 'default', styles: { p: 'color: #b91c1c !important;' } }, BASE)
  assert.equal(theme.styles.p, 'color: #b91c1c;')
  assert.ok(spec.notes.some((n) => /important/.test(n)))
})

test('自定义主题：写在 wrapper 上的 font-size 会被面板「字号」盖掉，要明说并给出替代写法', () => {
  const { spec } = buildCustomTheme(
    { base: 'default', styles: { wrapper: 'font-family: serif; font-size: 1rem;' } },
    BASE,
  )
  const note = spec.notes.find((n) => /不会生效/.test(n))
  assert.ok(note, '写了 wrapper font-size 却没有任何提示，模型会以为它生效了')
  assert.match(note, /1rem/, '提示要带上模型自己写的那个值，才认得出说的是哪一条')
  assert.match(note, /p \/ li \/ blockquote/, '只说"不生效"不够，要给出改哪里才生效')
  // 提示归提示：规格本身照样通过，声明一字不丢
  assert.match(spec.styles.wrapper, /font-size: 1rem;/)
})

test('自定义主题：没写 wrapper font-size 时不出现"不生效"的噪音提示', () => {
  const { spec } = buildCustomTheme({ base: 'default', styles: { p: 'color: #000;' } }, BASE)
  assert.ok(!spec.notes.some((n) => /不会生效/.test(n)))
})

test('自定义主题：单引号里的分号不是声明边界，不许截出假声明（与 render 同口径）', () => {
  // `font-family: 'a; font-size: 99px', serif` 是合法写法：那个分号在引号里。
  // 校验侧若用朴素 split(';')/正则切分，会把它拆成 `font-family: 'a` 与
  // `font-size: 99px', serif`——前者触发"自动补全"，后者被"不生效"提示原样引用，
  // 一句没写的字号被当成真声明报给模型。render 侧早就换成引号感知的
  // splitDeclarations，校验侧必须同口径，两侧才能不互相骗。
  const { spec } = buildCustomTheme(
    { base: 'default', styles: { wrapper: "font-family: 'a; font-size: 99px', serif;" } },
    BASE,
  )
  // 引号里的内容不是声明：提示里不许出现假字号
  assert.ok(!spec.notes.some((n) => /99px/.test(n)), '引号里的分号截出的假声明不该被引用')
  // wrapper 没写真 font-size：自动补全必须触发（不触发就是面板上的死控件）
  assert.ok(spec.notes.some((n) => /自动补上了 font-size/.test(n)), '真字号缺失时要自动补全')
  assert.match(spec.styles.wrapper, /font-size: 15px;/, '补全值来自 base 的 wrapper')
  // 单引号字体栈原样保留，不许被拆坏（校验侧的规格产物；渲染侧另由跨声明边界测试守）
  assert.match(spec.styles.wrapper, /font-family: 'a; font-size: 99px', serif;/)
})

test('自定义主题：真声明跟在单引号诱饵后面时，提示要引真声明', () => {
  const { spec } = buildCustomTheme(
    { base: 'default', styles: { wrapper: "font-family: 'a; font-size: 99px', serif; font-size: 17px;" } },
    BASE,
  )
  const note = spec.notes.find((n) => /不会生效/.test(n))
  assert.ok(note, '写了真 font-size 要有不生效提示')
  assert.match(note, /17px/, '提示引真声明（17px），不引引号里的假字号')
  assert.ok(!note.includes('99px'), '引号里的 99px 不是声明，不该出现在提示里')
  // 真字号在：不该触发自动补全
  assert.ok(!spec.notes.some((n) => /自动补上了 font-size/.test(n)))
})

test('自定义主题：面板「字号」能替掉单引号诱饵后面的真 font-size（跨声明边界）', () => {
  // 校验侧换口径只是前半程：渲染时 replaceDecl 同样要从引号感知的边界切，
  // 否则 `font-size: 17px` 淹在引号字体栈后面就替不掉，面板字号又成死控件。
  // 注：`annotate: true` 的预览路径会先替 wrapper 的 font-family（FONT_MAP 表常量），
  // 所以这里只断言 font-size 的替换，字体栈的去向由上一条测试守。
  const { theme } = buildCustomTheme(
    { base: 'default', styles: { wrapper: "font-family: 'a; font-size: 99px', serif; font-size: 17px;" } },
    BASE,
  )
  const wrapper = /<div style="([^"]*)"/.exec(render('正文一段。\n', { theme, fontSize: '22px', annotate: true }).html)[1]
  assert.match(wrapper, /font-size:\s*22px;/, '诱饵后面的真字号要被面板字号替掉')
  assert.doesNotMatch(wrapper, /font-size:\s*17px/, '旧值 17px 要整条消失')
  assert.doesNotMatch(wrapper, /99px/, '引号里的假字号不该被当成声明替换出什么')
})

test('自定义主题：病态输入的报错口径（切不出任何声明 / 属性名含非法字符）', () => {
  // splitDeclarations 对 `!important` 这类切不出声明的输入回空数组——
  // 校验侧要报"看不懂的声明"，不许静默当成空样式放行。
  assert.throws(() => validateThemeSpec({ base: 'default', styles: { p: '!important' } }, BASE), /看不懂的声明/)
  // `} body { color` 这种注入面在 FORBIDDEN_RE 就被挡住（`}` 与 `{` 都禁）
  assert.throws(() => validateThemeSpec({ base: 'default', styles: { p: 'color: red; } body { color: blue;' } }, BASE), /不允许的内容/)
})

test('自定义主题：面板「字号」能替掉 wrapper 上各种合法写法的 font-size（预览与发布同口径）', () => {
  // 这一条守的是 render.mjs 里那句 `wrapperStyle = replaceDecl(wrapperStyle, 'font-size', size)`。
  // 以前是 `wrapperStyle.replace(/font-size:\s*\d+px;/, …)`，只认整数 px：
  // 模型写 `1rem` / `16.5px` / `17PX` / `16` 时 wrapper 原样留着主题自己的字号，
  // 预览里控件点了没反应，而发布路径的 promoteFontSize 又把 <p> 撑成选定字号——
  // "预览不动、粘进微信却变了"是最难查的一类不一致。
  for (const decl of ['font-size: 16px;', 'font-size: 16.5px;', 'font-size: 1rem;', 'font-size: 17PX;', 'font-size: 16;']) {
    const { theme } = buildCustomTheme(
      { base: 'default', styles: { wrapper: `font-family: serif; ${decl}` } },
      BASE,
    )
    const html = render('正文一段。\n', { theme, fontSize: '22px', annotate: true }).html
    const wrapper = /<div style="([^"]*)"/.exec(html)
    assert.ok(wrapper, `wrapper div 必须存在（${decl}）`)
    assert.match(wrapper[1], /font-size:\s*22px;?/, `${decl} 没被替掉，面板字号控件会变成死控件`)
    assert.doesNotMatch(wrapper[1], /1rem|16\.5px|17PX/, `${decl} 的旧值要整条消失，不能残留在样式里`)
  }
})

test('自定义主题：同名 font-size 写了两条时两条都要替，不能留下后写那条继续生效', () => {
  // CSS 后写胜出。替换只替第一条的话，`font-size: 1rem; font-size: 18px;` 会变成
  // `font-size: 22px; font-size: 18px;`——预览里生效的还是 18px，与发布路径不一致。
  const { theme } = buildCustomTheme(
    { base: 'default', styles: { wrapper: 'font-family: serif; font-size: 1rem; font-size: 18px;' } },
    BASE,
  )
  const wrapper = /<div style="([^"]*)"/.exec(render('正文一段。\n', { theme, fontSize: '22px', annotate: true }).html)[1]
  assert.equal(wrapper.match(/font-size:/g).length, 2, '两条声明都要在，不能少替成一条')
  assert.doesNotMatch(wrapper, /18px|1rem/, '后写那条没被替，它仍会胜出')
  // 发布路径（宿主 /render 与 fishpai_render 都开 promoteFontSize）推进到 <p> 的字号必须与预览一致
  const pub = render('正文一段。\n', { theme, fontSize: '22px', publish: true, promoteFontSize: true }).html
  assert.match(pub, /<p style="[^"]*font-size: 22px/, '发布路径的 <p> 字号也要是选定值')
})

test('自定义主题：值里带字面 font-size: 的诱饵不能顶替真正的字号声明', () => {
  // `font` 为 null（或查不到表）时 render.mjs 整条不替换 font-family，
  // 于是没有声明边界锚定的正则会把 `font-family: 'font-size: 12px', serif` 里的
  // 字面 `font-size:` 当成目标，替坏 font-family 却漏掉真正的字号。
  const decoy = "font-family: 'font-size: 12px', serif; font-size: 16px;"
  const { theme } = buildCustomTheme({ base: 'default', styles: { wrapper: decoy } }, BASE)
  const wrapper = /<div style="([^"]*)"/.exec(render('正文一段。\n', { theme, font: null, fontSize: '22px', annotate: true }).html)[1]
  assert.match(wrapper, /font-size: 22px/, '真正的字号声明没被替')
  assert.match(wrapper, /'font-size: 12px', serif/, '诱饵（font-family 值里的字面 font-size:）必须原样留着')
  assert.equal((wrapper.match(/'/g) || []).length % 2, 0, 'font-family 的引号必须配平（诱饵没被替坏）')
})

test('自定义主题：引号里的分号不是声明边界（诱饵带 ; 时也不能切错声明）', () => {
  // 比上一条更狠的形态：诱饵值**自己带分号**。任何「属性名 + 非分号」的正则都会在这里切错——
  // `[^;]` 停在诱饵内部的 `;` 上，于是既咬坏 font-family 的引号、又漏掉真正的 font-size。
  // 只有按引号感知地扫声明（`splitDeclarations`）才切得对。
  // 该形态可经 API 落盘：theme-spec 允许单引号，且 `applyMeta` 对 `font` 无形态校验。
  const decoy = "font-family: 'a; font-size: 99px', serif; font-size: 14px; color: #333;"
  const { theme } = buildCustomTheme({ base: 'default', styles: { wrapper: decoy } }, BASE)
  const wrapper = /<div style="([^"]*)"/.exec(render('正文一段。\n', { theme, font: null, fontSize: '22px', annotate: true }).html)[1]
  assert.equal((wrapper.match(/'/g) || []).length % 2, 0, 'font-family 的引号必须配平（诱饵里的分号不能当声明边界）')
  assert.match(wrapper, /'a; font-size: 99px', serif/, '诱饵必须逐字留着，不能被替成字号')
  assert.match(wrapper, /font-size: 22px/, '真正的字号声明要替成选定值')
  assert.doesNotMatch(wrapper, /font-size: 14px/, '主题自己写的 14px 要被盖掉')
})

test('自定义主题：同名 font-family 写了两条时两条都要替（字体预设不能白点）', () => {
  // 与字号那条同 species：`/font-family:[^;]+;/` 无 `/g`，只替第一条，
  // 后写那条继续胜出，面板的字体预设点了没反应。
  const { theme } = buildCustomTheme(
    { base: 'default', styles: { wrapper: "font-family: 'Georgia', serif; font-family: 'Courier New', monospace;" } },
    BASE,
  )
  const wrapper = /<div style="([^"]*)"/.exec(render('正文一段。\n', { theme, font: 'sans', fontSize: '16px', annotate: true }).html)[1]
  assert.doesNotMatch(wrapper, /Courier New/, '后写那条没被替，它仍会胜出')
  assert.equal(wrapper.match(/font-family:/g).length, 2, '两条声明都要在')
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
