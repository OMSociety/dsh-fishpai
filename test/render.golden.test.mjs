/**
 * 渲染回归：`plugin/core/render.mjs` 必须与 `test/golden/**` 逐字节相同。
 *
 * golden 由**迁移前的冻结实现**（`test/oracle/render.cjs`）生成——两份独立代码互为对照，
 * 所以这个测试有意义：移植出错就会红，而不是自己给自己打分。
 * 重新生成见 `scripts/regen-golden.mjs` 与 AGENTS.md 的不变量 #1。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, themeCatalog } from '../plugin/core/render.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOLDEN = path.join(ROOT, 'test', 'golden')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')
const manifest = JSON.parse(readFileSync(path.join(GOLDEN, 'manifest.json'), 'utf8'))

function readFixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n')
}

test('golden 清单覆盖全部主题与全部 fixture', () => {
  // 不写死主题数量：删/加主题（那是 themes.js 里的数据）时只该重生成 golden，不该再改这里
  assert.deepEqual(manifest.themes, themeCatalog().map((t) => t.key))
  assert.ok(manifest.themes.length >= 8, `主题太少了：${manifest.themes.length}`)
  assert.ok(manifest.fixtures.length >= 4)
  const publishEntries = manifest.entries.filter((e) => e.mode === 'publish')
  assert.equal(publishEntries.length, manifest.themes.length * manifest.fixtures.length)
})

for (const entry of manifest.entries) {
  test(`golden: ${entry.file}`, () => {
    const expected = readFileSync(path.join(GOLDEN, entry.file), 'utf8')
    const { html, themeKey } = render(readFixture(entry.fixture), { theme: entry.theme, ...entry.opts })
    assert.equal(themeKey, entry.theme)
    assert.equal(html, expected)
  })
}

test('主题清单与 golden 记录的主题集合一致', () => {
  assert.deepEqual(
    themeCatalog().map((t) => t.key),
    manifest.themes,
  )
})

test('annotate 只是预览输出 + 不可见锚点，不改变任何其它字节', () => {
  const markdown = readFixture('stress_real_img.md')
  for (const theme of manifest.themes) {
    const preview = render(markdown, { theme, publish: false }).html
    const annotated = render(markdown, { theme, annotate: true }).html
    assert.equal(annotated.replace(/<fp-block data-b="[^"]*"><\/fp-block>/g, ''), preview, `theme=${theme}`)
    assert.match(annotated, /<fp-block data-b="/)
  }
})

test('annotate 返回的块与 splitBlocks 的块一一对应', async () => {
  const { splitBlocks } = await import('../plugin/core/markdown.mjs')
  const markdown = readFixture('edge.md')
  const annotated = render(markdown, { theme: 'default', annotate: true })
  const ids = [...annotated.html.matchAll(/<fp-block data-b="([^"]*)"><\/fp-block>/g)].map((m) => m[1])
  assert.deepEqual(ids, splitBlocks(markdown).map((b) => b.id))
  assert.deepEqual(annotated.blocks.map((b) => b.id), ids)
})

test('imageResolver 只在给出时生效，且不改动其它字节', () => {
  const markdown = readFixture('stress_real_img.md')
  const plain = render(markdown, { theme: 'default' }).html
  const same = render(markdown, { theme: 'default', imageResolver: () => null }).html
  assert.equal(same, plain)

  const embedded = render(markdown, {
    theme: 'default',
    imageResolver: (src) => (src === 'https://example.com/demo.png' ? 'data:image/png;base64,AAAA' : null),
  }).html
  assert.match(embedded, /src="data:image\/png;base64,AAAA"/)
  assert.equal(embedded.replace('data:image/png;base64,AAAA', 'https://example.com/demo.png'), plain)
})

test('未知主题抛出可读错误', () => {
  assert.throws(() => render('# x', { theme: '不存在的主题' }), /未知主题/)
})
