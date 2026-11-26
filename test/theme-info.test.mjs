/**
 * 主题能力标注的测试。
 *
 * 分两层：
 *   1. `classifyTheme` 对**合成主题**的规则边界（未来改规则时先在这里说明白）
 *   2. 真实 `themes.js` 语料的断言——它把"当前主题里谁有主题色"与粘贴安全样式
 *      钉成事实；主题数据变化时这里会红，提醒复核，而不是让 UI 悄悄变错
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTheme } from '../plugin/core/theme-info.mjs'
import { themes } from '../plugin/core/runtime.mjs'
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

test('防御：结构缺失时不标记主题色', () => {
  for (const broken of [null, undefined, {}, { styles: null }, { styles: 'x' }, { styles: { h1: 42 } }]) {
    assert.deepEqual(classifyTheme(broken), { usesAccent: false })
  }
})

test('真实语料：只有「默认公众号」用主题色', () => {
  const catalog = themeCatalog()
  assert.deepEqual(
    catalog.filter((t) => t.usesAccent).map((t) => t.key),
    ['default'],
    '主题色只对默认公众号有效；若主题数据给别的主题加了 {{PRIMARY}}，这里会红',
  )
})

test('真实语料：内置主题清单与粘贴安全样式', () => {
  const catalog = themeCatalog()
  assert.equal(catalog.length, 11, '主题数量变了就要连 golden 一起重生成（见 AGENTS.md 不变量 1）')
  assert.deepEqual(catalog.map((t) => t.key), ['default', 'tech', 'elegant', 'deep_read', 'nyt', 'apple', 'claude', 'sspai', 'bamboo', 'dark_night', 'gradient'])
  const source = JSON.stringify(Object.values(themes()).map((theme) => theme.styles))
  assert.doesNotMatch(source, /background-clip|text-fill-color|border-image/, '内置主题只用公众号保留的样式属性')
})

test('每套主题都配了图标（面板的主题列表靠它，不许悄悄漏）', () => {
  const source = fs.readFileSync(path.join(ROOT, 'client', 'icons.tsx'), 'utf8')
  const block = source.slice(source.indexOf('const THEME_GLYPH'), source.indexOf('/** 某套主题的图标'))
  const mapped = new Map(
    [...block.matchAll(/^\s{2}([a-z_]+):\s*([A-Za-z0-9]+),/gm)].map((m) => [m[1], m[2]]),
  )
  const keys = themeCatalog().map((t) => t.key)
  // 方向一：每套内置主题都必须有图标
  const missing = keys.filter((k) => !mapped.has(k))
  assert.deepEqual(missing, [], `THEME_GLYPH 缺图标：${missing.join(', ')}（加了主题就要补一行）`)
  // 方向二：多出来的键必须是**有意**的。`custom` 是允许的——「自定义主题」由**路由层**加进清单，
  // 不在 core 的 `themeCatalog()` 里，所以这里允许它是超集；除此之外多出来的键多半是拼错的 key。
  const extra = [...mapped.keys()].filter((k) => !keys.includes(k) && k !== 'custom')
  assert.deepEqual(extra, [], `THEME_GLYPH 里有不认识的键：${extra.join(', ')}`)
  // 值是 `client/theme-icons.tsx` 导出的本地几何组件：必须真导出（拼错就是运行时白屏）
  const glyphSrc = fs.readFileSync(path.join(ROOT, 'client', 'theme-icons.tsx'), 'utf8')
  const exported = new Set([...glyphSrc.matchAll(/^export function ([A-Za-z0-9]+)/gm)].map((m) => m[1]))
  for (const [key, name] of mapped) {
    assert.ok(exported.has(name), `${key} 的图标 ${name} 没有在 client/theme-icons.tsx 里导出`)
  }
})
