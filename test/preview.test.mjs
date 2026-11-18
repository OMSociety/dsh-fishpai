import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createPreviewFixture } from '../scripts/preview/fixture.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFileSync(path.join(ROOT, name), 'utf8')

test('README 预览 fixture 与正式专业渲染保持一致', () => {
  const actual = JSON.parse(read('docs/preview/fixture.json'))
  assert.equal(JSON.stringify(actual), JSON.stringify(createPreviewFixture()))
  assert.equal(actual.meta.mobile, true)
})

test('README 预览运行正式面板、store 与样式，并验收展开交互', () => {
  const entry = read('scripts/preview/main.tsx')
  const build = read('scripts/build-preview.mjs')
  assert.match(entry, /import \{ Panel \} from '\.\.\/\.\.\/client\/panel'/)
  assert.match(entry, /import \{ createFishpaiStore \} from '\.\.\/\.\.\/client\/store'/)
  assert.match(entry, /import \{ CSS, STYLE_TAG_ID \} from '\.\.\/\.\.\/client\/styles'/)
  assert.match(build, /await page\.mouse\.click\(before\.x \+ before\.width \/ 2, before\.y \+ before\.height \/ 2\)/)
  assert.match(build, /after\.height <= before\.height/)
})

test('README 预览产物自包含，PNG 尺寸可从文件头读取', () => {
  const html = read('docs/preview/panel.html')
  assert.match(html, /<div id="root"><\/div>/)
  assert.doesNotMatch(html, /<script[^>]+src=/)
  const png = readFileSync(path.join(ROOT, 'docs/panel-preview.png'))
  assert.equal(png.toString('ascii', 1, 4), 'PNG')
  assert.ok(png.readUInt32BE(16) >= 1080)
  assert.ok(png.readUInt32BE(16) <= 1200)
  assert.ok(png.readUInt32BE(20) > png.readUInt32BE(16))
})
