/**
 * 主题能力标注的测试。
 *
 * 分两层：
 *   1. `classifyTheme` 对**合成主题**的规则边界（未来改规则时先在这里说明白）
 *   2. 真实 `themes.js` 语料的断言——它把"当前主题里谁有主题色、谁有微信风险"
 *      钉成事实；上游改主题时这里会红，提醒复核，而不是让 UI 悄悄变错
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTheme, wrapperBackground } from '../plugin/core/theme-info.mjs'
import { themeCatalog } from '../plugin/core/render.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const theme = (styles) => ({ name: 't', styles })

test('usesAccent：{{PRIMARY}} 与 {{PRIMARY_BG}} 都算用了主题色', () => {
  assert.equal(classifyTheme(theme({ h1: 'color: {{PRIMARY}};' })).usesAccent, true)
  assert.equal(classifyTheme(theme({ quote: 'background: {{PRIMARY_BG}}; color: {{PRIMARY}};' })).usesAccent, true)
  assert.equal(classifyTheme(theme({ h1: 'color: #0071e3;' })).usesAccent, false)
  // 名字里带 PRIMARY 但没写占位符：不算
  assert.equal(classifyTheme(theme({ h1: 'color: PRIMARY;' })).usesAccent, false)
})

test('gradientText：background-clip:text 的两种写法都能识别', () => {
  assert.equal(classifyTheme(theme({ h1: 'background-clip: text; color: transparent;' })).gradientText, true)
  assert.equal(classifyTheme(theme({ h1: '-webkit-background-clip: text; -webkit-text-fill-color: transparent;' })).gradientText, true)
  assert.equal(classifyTheme(theme({ h1: 'background: linear-gradient(#fff, #000);' })).gradientText, false, '纯渐变背景不算渐变文字')
})

test('darkWrapper：只有深色 wrapper 才算，浅色与解析不出都不标记', () => {
  assert.equal(classifyTheme(theme({ wrapper: 'color: #eee; background: #1a1a2e;' })).darkWrapper, true)
  assert.equal(classifyTheme(theme({ wrapper: 'background-color: #ffffff;' })).darkWrapper, false)
  assert.equal(classifyTheme(theme({ wrapper: 'background-color: rgb(26, 26, 46);' })).darkWrapper, true)
  assert.equal(classifyTheme(theme({ wrapper: 'background: linear-gradient(#fff, #000);' })).darkWrapper, false, '解析不出颜色时选不标记')
  assert.equal(classifyTheme(theme({ wrapper: 'color: #333;' })).darkWrapper, false)
  assert.equal(wrapperBackground(theme({ wrapper: 'background: #000;' })).r, 0)
})

test('防御：结构缺失时给安全默认（wechatSafe = true）', () => {
  for (const broken of [null, undefined, {}, { styles: null }, { styles: 'x' }, { styles: { h1: 42 } }]) {
    const info = classifyTheme(broken)
    assert.deepEqual(info, { usesAccent: false, gradientText: false, darkWrapper: false, wechatSafe: true })
  }
})

test('真实语料：只有「默认公众号」用主题色', () => {
  const catalog = themeCatalog()
  assert.deepEqual(
    catalog.filter((t) => t.usesAccent).map((t) => t.key),
    ['default'],
    '主题色只对默认公众号有效；若上游给别的主题加了 {{PRIMARY}}，这里会红',
  )
})

test('真实语料：渐变文字与深底的主题被准确标出', () => {
  const catalog = themeCatalog()
  assert.deepEqual(catalog.filter((t) => t.gradientText).map((t) => t.key).sort(), ['gradient', 'tech'])
  assert.deepEqual(catalog.filter((t) => t.darkWrapper).map((t) => t.key), ['dark_night'])
})

test('真实语料：wechatSafe 是其余两个 flag 的结果，且数量对得上', () => {
  const catalog = themeCatalog()
  assert.equal(catalog.length, 11, '主题数量变了就要连 golden 一起重生成（见 AGENTS.md 不变量 1）')
  assert.deepEqual(catalog.map((t) => t.key), ['default', 'tech', 'elegant', 'deep_read', 'nyt', 'apple', 'claude', 'sspai', 'bamboo', 'dark_night', 'gradient'])
  for (const t of catalog) {
    assert.equal(t.wechatSafe, !t.gradientText && !t.darkWrapper, `${t.key} 的 wechatSafe 与前两个 flag 不一致`)
  }
  const safe = catalog.filter((t) => t.wechatSafe)
  assert.equal(safe.length, 8)
  assert.ok(safe.some((t) => t.key === 'default'), '默认公众号必须在"适合公众号"一组里')
  assert.ok(!safe.some((t) => t.key === 'dark_night'))
})

test('每套主题都配了图标（面板的主题列表靠它，不许悄悄漏）', () => {
  const source = fs.readFileSync(path.join(ROOT, 'client', 'icons.tsx'), 'utf8')
  const block = source.slice(source.indexOf('const THEME_GLYPH'), source.indexOf('/** 某套主题的图标'))
  const mapped = new Map(
    [...block.matchAll(/^\s{2}([a-z_]+):\s*'([A-Za-z0-9]+)'/gm)].map((m) => [m[1], m[2]]),
  )
  const keys = themeCatalog().map((t) => t.key)
  // 方向一：内置主题一个都不许漏（这条是原本的意图）
  const missing = keys.filter((k) => !mapped.has(k))
  assert.deepEqual(missing, [], `THEME_GLYPH 缺图标：${missing.join(', ')}（加了主题就要补一行）`)
  // 方向二：多出来的键必须是**有意**的。`custom` 是允许的——「自定义主题」由**路由层**加进清单，
  // 不在 core 的 `themeCatalog()` 里，所以这里允许它是超集；除此之外多出来的键多半是拼错的 key。
  const extra = [...mapped.keys()].filter((k) => !keys.includes(k) && k !== 'custom')
  assert.deepEqual(extra, [], `THEME_GLYPH 里有不认识的键：${extra.join(', ')}`)
  for (const [key, name] of mapped) {
    assert.match(name, /^Icon[A-Za-z0-9]+$/, `${key} 的图标名不像 DSH 内置图标：${name}`)
  }
})
