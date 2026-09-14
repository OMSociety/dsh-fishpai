/**
 * 主题能力标注的测试。
 *
 * 分两层：
 *   1. `classifyTheme` 对**合成主题**的规则边界（未来改规则时先在这里说明白）
 *   2. 真实 `themes.js` 语料的断言——它把"当前 13 个主题里谁有主题色、谁有微信风险"
 *      钉成事实；上游改主题时这里会红，提醒复核，而不是让 UI 悄悄变错
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyTheme, wrapperBackground } from '../plugin/core/theme-info.mjs'
import { themeCatalog } from '../plugin/core/render.mjs'

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
  assert.equal(catalog.length, 13)
  for (const t of catalog) {
    assert.equal(t.wechatSafe, !t.gradientText && !t.darkWrapper, `${t.key} 的 wechatSafe 与前两个 flag 不一致`)
  }
  const safe = catalog.filter((t) => t.wechatSafe)
  assert.equal(safe.length, 10)
  assert.ok(safe.some((t) => t.key === 'default'), '默认公众号必须在"适合公众号"一组里')
  assert.ok(!safe.some((t) => t.key === 'dark_night'))
})
