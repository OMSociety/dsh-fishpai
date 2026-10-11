/**
 * 内联主题图标的守卫。
 *
 * 图标几何现在是**本仓库自己的代码**（`client/theme-icons.tsx`，复制自 rc2 的
 * `@deepseek-ai/dsh-client-ui-primitives`，MIT）。这里守四件事：
 *   1. `icons.tsx` 引用的每个几何组件都真的导出了（拼错 = 运行时整块白）
 *   2. **导出的每一支几何**（主题用的 12 支 + 控件用的 2 支）都能渲染出带
 *      `viewBox="0 0 16 16"` 的 `<svg>`，且图形节点不为空、颜色走 `currentColor`
 *      （空图形 = 主题列表里一个看不见的洞）
 *   3. `icons.tsx` 里不再出现 `require`，bundle 的宿主依赖只剩 react 系
 *   4. 鱼形标与包根 `icon.svg` 同源（取景、描边、渐变都要对得上）
 *
 * 这四件事都只守**结构与接线**，守不住"某条路径的数字被改错"——几何内容要与 rc2
 * 逐字比对，见 `NOTICE.md` 与 AGENTS.md 不变量 11。改几何后必须 `npm run build`。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICONS_SRC = path.join(ROOT, 'client', 'icons.tsx')
const GLYPH_SRC = path.join(ROOT, 'client', 'theme-icons.tsx')
const BUNDLE = path.join(ROOT, 'lib', 'client.js')

/** 把 TSX 编译成 ESM，`react/jsx-runtime` 走桩（只要求 jsx/jsxs 记账，不需要真 React）。 */
async function loadGlyphs() {
  const compiled = await transform(fs.readFileSync(GLYPH_SRC, 'utf8'), {
    loader: 'tsx',
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
    charset: 'utf8',
  })
  const stub =
    'data:text/javascript,' +
    encodeURIComponent(
      'export const jsx = (type, props) => ({ type, props });\n' +
        'export const jsxs = (type, props) => ({ type, props });\n' +
        'export const Fragment = Symbol("fragment");\n',
    )
  const code = compiled.code.replace(/from\s*["']react\/jsx-runtime["']/g, `from "${stub}"`)
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`)
}

/** 导出的几何组件名（`theme-icons.tsx` 的公开面就是这 14 支）。 */
function exportedGlyphNames() {
  const source = fs.readFileSync(GLYPH_SRC, 'utf8')
  return [...source.matchAll(/export function ([A-Za-z0-9]+Glyph)\(/g)].map((m) => m[1])
}

test('icons.tsx 不再 require 宿主 Client 包（rc2 官方明文禁止）', () => {
  const source = fs.readFileSync(ICONS_SRC, 'utf8')
  assert.ok(!/require\s*\(/.test(source), 'icons.tsx 里不该再有 require')
  const glyphSrc = fs.readFileSync(GLYPH_SRC, 'utf8')
  assert.ok(!/require\s*\(/.test(glyphSrc), 'theme-icons.tsx 里不该有 require')
  const bundle = fs.readFileSync(BUNDLE, 'utf8')
  const specs = [...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1])
  const hostPackages = [...new Set(specs)].filter((s) => s.startsWith('@deepseek-ai/'))
  assert.deepEqual(hostPackages, [], `产物里不该再有 Harness Client 包：${hostPackages.join(', ')}`)
})

test('导出的每一支几何都渲染出 16 画板的 svg、图形非空、颜色走 currentColor', async () => {
  const glyphs = await loadGlyphs()
  const names = exportedGlyphNames()
  assert.equal(names.length, 14, `theme-icons.tsx 应导出 14 支几何，实际 ${names.length} 支`)

  // icons.tsx 的主题表要真用上这些组件（漏一行 = 那套主题没图标）
  const source = fs.readFileSync(ICONS_SRC, 'utf8')
  const block = source.slice(source.indexOf('const THEME_GLYPH'), source.indexOf('/** 某套主题的图标'))
  const used = [...new Set([...block.matchAll(/:\s*([A-Za-z0-9]+),/g)].map((m) => m[1]))]
  assert.ok(used.length >= 12, `THEME_GLYPH 应至少用到 12 个几何组件，只找到 ${used.length} 个`)
  for (const name of used) {
    assert.ok(names.includes(name), `THEME_GLYPH 里的 ${name} 没有从 client/theme-icons.tsx 导出`)
  }
  // 控件几何（不在 THEME_GLYPH 里）也要有真实调用点，不能只是导出摆着
  for (const name of ['ChevronDownGlyph', 'CheckGlyph']) {
    assert.ok(source.includes(`<${name} `), `${name} 应当在 icons.tsx 里被渲染`)
  }

  // 逐支核对：14 支一个不落，全都得是 16 画板、非空、currentColor
  for (const name of names) {
    const Comp = glyphs[name]
    assert.equal(typeof Comp, 'function', `${name} 没有从 client/theme-icons.tsx 导出`)
    const tree = Comp({ size: 16, className: 'x' })
    assert.equal(tree.type, 'svg', `${name} 的根节点应当是 svg`)
    assert.equal(tree.props.viewBox, '0 0 16 16', `${name} 应当用 16 画板`)
    assert.equal(tree.props.width, 16)
    const kids = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children]
    assert.ok(kids.length > 0, `${name} 没有任何图形节点`)
    for (const kid of kids) {
      assert.ok(['path', 'circle', 'rect', 'line', 'polyline'].includes(kid.type), `${name} 里有意外节点：${kid.type}`)
      const paint = kid.props.stroke ?? kid.props.fill
      assert.equal(paint, 'currentColor', `${name} 的图形要跟随 currentColor`)
    }
  }
})

test('几何路径真进了产物（改了 theme-icons 必须重新 npm run build）', () => {
  const glyphSrc = fs.readFileSync(GLYPH_SRC, 'utf8')
  const bundle = fs.readFileSync(BUNDLE, 'utf8')
  // 源码里每一条 path 的 d 都要在产物里找到：漏一条就是"改了源码没重建"。
  // 去重后统计（几支图标共用同一条短线是 rc2 就有的实况），门槛按唯一值算。
  const dAttrs = [...new Set([...glyphSrc.matchAll(/d="([^"]+)"/g)].map((m) => m[1]))]
  assert.ok(dAttrs.length >= 40, `theme-icons.tsx 里应有 40 条以上唯一几何路径，只找到 ${dAttrs.length}`)
  const missing = dAttrs.filter((d) => !bundle.includes(d))
  assert.deepEqual(missing, [], `这些几何没进产物（改了 theme-icons 要重新 npm run build）：${missing.length} 条`)
})

test('FishMark 与包根 icon.svg 同轮廓（渐变标，不随主题）', () => {
  const source = fs.readFileSync(ICONS_SRC, 'utf8')
  const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
  // 鱼身路径在两处必须逐字相同
  const bodyPath = 'M7.5 18C9.348 13.56 13.044 10.785 17.748 10.785C20.94 10.785 23.292 12.45 24.804 14.67L28.5 11.34L26.316 18L28.5 24.66L24.804 21.33C23.292 23.55 20.94 25.215 17.748 25.215C13.044 25.215 9.348 22.44 7.5 18Z'
  assert.ok(source.includes(bodyPath), 'icons.tsx 的鱼身路径与 icon.svg 不一致')
  assert.ok(svg.includes(bodyPath), 'icon.svg 的鱼身路径变了，icons.tsx 要跟着改')
  // 取景与视觉重量：两处是有意相同的 36 画板与 2.0 描边，眼睛圆心也要一致
  assert.ok(/viewBox="0 0 36 36"/.test(source), 'FishMark 应当用 36 画板（与 icon.svg 同取景）')
  assert.ok(/viewBox="0 0 36 36"/.test(svg), 'icon.svg 的画板变了')
  assert.ok(/strokeWidth="2"/.test(source), 'FishMark 的鱼身描边应为 2.0（与 icon.svg 的 stroke-width="2" 同）')
  assert.ok(/stroke-width="2"/.test(svg), 'icon.svg 的描边变了')
  assert.ok(/cx="12\.2"\s+cy="16\.5"\s+r="1\.3"/.test(source), 'FishMark 的眼睛圆心/半径要与 icon.svg 一致')
  assert.ok(/cx="12\.2"\s+cy="16\.5"\s+r="1\.3"/.test(svg), 'icon.svg 的眼睛变了')
  // 两处渐变端点也要同（FishMark 自带渐变，因为宿主在侧边栏读不到主题色）
  for (const stop of ['#7FA0FF', '#3B54C9']) {
    assert.ok(source.includes(stop), `FishMark 的渐变少了 ${stop}`)
    assert.ok(svg.includes(stop), `icon.svg 的渐变少了 ${stop}`)
  }
})
