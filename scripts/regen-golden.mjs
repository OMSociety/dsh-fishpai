/**
 * 用当前渲染核心生成或核对 test/golden/** 自产 snapshot。
 *
 *   node scripts/regen-golden.mjs          # 重建
 *   node scripts/regen-golden.mjs --check  # 只报告漂移，不写文件
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '../plugin/core/render.mjs'
import { themes as themeTable } from '../plugin/core/runtime.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')
const GOLDEN = path.join(ROOT, 'test', 'golden')
const MANIFEST = path.join(GOLDEN, 'manifest.json')
const checkOnly = process.argv.slice(2).includes('--check')
const unknown = process.argv.slice(2).filter((arg) => arg !== '--check')
if (unknown.length) throw new Error(`未知参数：${unknown.join(' ')}`)

const PREVIEW_THEMES = ['default']
const PUBLISH_OPTS = { publish: true, footnotes: true, macCodeBlock: true, fontSize: '16px' }

function fixtureNames() {
  return readdirSync(FIXTURES).filter((name) => name.endsWith('.md')).sort()
}
function themeKeys() {
  return Object.keys(themeTable())
}
function readFixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\r\n/g, '\n')
}
function entries() {
  const out = []
  for (const fixture of fixtureNames()) {
    for (const theme of themeKeys()) {
      out.push({ file: `${fixture}.${theme}.publish.html`, fixture, theme, mode: 'publish', opts: PUBLISH_OPTS })
    }
    for (const theme of PREVIEW_THEMES) {
      out.push({ file: `${fixture}.${theme}.preview.html`, fixture, theme, mode: 'preview', opts: { ...PUBLISH_OPTS, publish: false } })
    }
  }
  return out
}

const manifest = {
  $comment: '渲染核心自产 snapshot。由 scripts/regen-golden.mjs 生成；source 固定为当前核心入口。',
  source: 'plugin/core/render.mjs',
  themes: themeKeys(),
  fixtures: fixtureNames(),
  publishOpts: PUBLISH_OPTS,
  entries: entries(),
}

mkdirSync(GOLDEN, { recursive: true })
let changed = 0
for (const entry of manifest.entries) {
  const { html } = render(readFixture(entry.fixture), { theme: entry.theme, ...entry.opts })
  const target = path.join(GOLDEN, entry.file)
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (existing === html) continue
  changed += 1
  if (checkOnly) {
    console.error(`  ✗ ${entry.file}${existing === null ? '（缺失）' : ''}`)
  } else {
    writeFileSync(target, html, 'utf8')
  }
}
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
const manifestChanged = !existsSync(MANIFEST) || readFileSync(MANIFEST, 'utf8') !== manifestText

if (!checkOnly) {
  writeFileSync(MANIFEST, manifestText, 'utf8')
  console.log(`snapshot: ${manifest.entries.length} 份，更新 ${changed} 份（source=${manifest.source}）`)
} else if (changed || manifestChanged) {
  console.error(`snapshot 有 ${changed} 处渲染差异${manifestChanged ? '，manifest 也需更新' : ''}`)
  process.exit(1)
} else {
  console.log('snapshot 与当前核心一致')
}
