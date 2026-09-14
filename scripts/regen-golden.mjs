/**
 * 重新生成 `test/golden/**`（渲染回归的字节级标准答案）。
 *
 * 默认用 **冻结的迁移前 oracle**（`test/oracle/render.cjs`）——那是鱼排 ESM 化之前、
 * 且已与墨排线上站点逐条对照过的实现。只有当"上游/站点行为确实变了"时才改用
 * `--from-core`（用 `plugin/core/render.mjs` 自己给自己出题，等于放弃对照，必须能说清理由）。
 *
 * 用法：
 *   node scripts/regen-golden.mjs              # oracle → golden
 *   node scripts/regen-golden.mjs --from-core  # core   → golden
 *   node scripts/regen-golden.mjs --check      # 只报告差异，不写文件（退出码 1 表示有差异）
 */
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')
const GOLDEN = path.join(ROOT, 'test', 'golden')
const MANIFEST = path.join(GOLDEN, 'manifest.json')

const require = createRequire(import.meta.url)
const oracle = require('../test/oracle/render.cjs')
const core = await import('../plugin/core/render.mjs')

const fromCore = process.argv.includes('--from-core')
const checkOnly = process.argv.includes('--check')
const render = fromCore ? core.render : oracle.render

/** 预览形态只对每个 fixture 出一份（主题 default），发布形态覆盖全部主题。 */
const PREVIEW_THEMES = ['default']

/** 与渲染器保持一致的发布参数（站点「复制到公众号」那条路径）。 */
const PUBLISH_OPTS = {
  publish: true,
  footnotes: true,
  macCodeBlock: true,
  fontSize: '16px',
}

function fixtureNames() {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

function themeKeys() {
  return Object.keys(oracle.THEMES)
}

/** 读 fixture 并归一换行：磁盘上可能是 CRLF，渲染结果必须与 LF 时完全相同。 */
function readFixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n')
}

function entries() {
  const themes = themeKeys()
  const out = []
  for (const fixture of fixtureNames()) {
    for (const theme of themes) {
      out.push({ file: `${fixture}.${theme}.publish.html`, fixture, theme, mode: 'publish', opts: PUBLISH_OPTS })
    }
    for (const theme of PREVIEW_THEMES) {
      out.push({ file: `${fixture}.${theme}.preview.html`, fixture, theme, mode: 'preview', opts: { ...PUBLISH_OPTS, publish: false } })
    }
  }
  return out
}

const manifest = {
  $comment:
    '渲染回归标准答案。由 scripts/regen-golden.mjs 生成；source 记录生成时用的是冻结 oracle 还是 core。',
  source: fromCore ? 'plugin/core/render.mjs' : 'test/oracle/render.cjs',
  themes: themeKeys(),
  fixtures: fixtureNames(),
  publishOpts: PUBLISH_OPTS,
  entries: entries().map(({ file, fixture, theme, mode, opts }) => ({ file, fixture, theme, mode, opts })),
}

mkdirSync(GOLDEN, { recursive: true })

let changed = 0
for (const entry of manifest.entries) {
  const markdown = readFixture(entry.fixture)
  const { html } = render(markdown, { theme: entry.theme, ...entry.opts })
  const target = path.join(GOLDEN, entry.file)
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (existing === html) continue
  changed++
  if (checkOnly) {
    console.error(`  ✗ ${entry.file}${existing === null ? '（缺失）' : ''}`)
    continue
  }
  writeFileSync(target, html, 'utf8')
}

if (!checkOnly) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`golden: ${manifest.entries.length} 份，更新 ${changed} 份（source=${manifest.source}）`)
} else if (changed) {
  console.error(`golden 与 ${manifest.source} 有 ${changed} 处差异`)
  process.exit(1)
} else {
  console.log('golden 与 oracle 完全一致')
}
