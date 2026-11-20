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

test('README 演示文稿使用微信安全标签与品牌矢量图形', () => {
  const article = read('docs/preview/preview-article.md')
  const fixture = createPreviewFixture()
  assert.doesNotMatch(article, /<div\b/i, 'raw 文本容器不使用会被清洗的 div')
  assert.doesNotMatch(fixture.markdown, /<image\b|data:image\/svg\+xml;base64/i, 'SVG 不依赖会被剥离的 image href')
  assert.doesNotMatch(article, /font-weight:750/, '字重使用目标环境支持的档位')
  const icon = read('icon.svg')
  const brandPath = icon.match(/<path d="([^"]+)"/)?.[1]
  assert.match(article, /<!-- FISHPAI_BRAND -->/, '演示源文件只保留品牌占位')
  assert.ok(brandPath && fixture.markdown.includes(`d="${brandPath}"`), '构建时从品牌图标读取同一份几何')
  assert.equal((article.match(/:::full_bleed/g) || []).length, 2, '头图与结尾使用统一全幅组件')
  assert.doesNotMatch(article, /margin:[^;\"]*-20px/, '演示源文件不手写依赖页面留白的负外边距')
  assert.doesNotMatch(article, /<text[^>]*>CONTENT<|<text[^>]*>IN ORDER</, '展示字使用矢量轮廓')
  assert.match(article, /aria-label="CONTENT"/, 'CONTENT 保留语义')
  assert.match(article, /aria-label="IN ORDER"/, 'IN ORDER 保留语义')
  for (const match of article.matchAll(/<td style="([^"]+)"/g)) {
    assert.match(match[1], /(?:^|;)border:0;/, '表格单元格显式清除默认边框')
  }
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

test('独立操作与相邻按钮共用表面，键盘焦点使用独立轮廓', () => {
  const panel = read('client/panel.tsx')
  assert.match(panel, /<Btn primary title=\{`复制后可粘贴到目标编辑器/)
  const css = read('client/styles.ts')
  const primary = css.match(/\.fp-btn-primary\{([^}]+)\}/)?.[1] || ''
  assert.match(primary, /background:var\(--dsw-alias-bg-layer-2\)/)
  assert.match(primary, /border-color:var\(--dsw-alias-border-l2\)/)
  const focus = css.match(/\.fp-btn:focus-visible\{([^}]+)\}/)?.[1] || ''
  assert.match(focus, /outline:2px solid var\(--dsw-alias-brand-primary\)/)
  assert.doesNotMatch(focus, /border-color:/)
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
