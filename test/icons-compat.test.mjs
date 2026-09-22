/**
 * 图标导出名的双版本对照测试：0.1.5 线（尺寸后缀拼写）↔ 0.1.7 线（字重后缀拼写）。
 *
 * 这里做的是"代码级证明"：鱼排引用的每个图标，在旧清单有落点（旧名）、在新清单有落点
 * （对照表映射后的名字），所以一份 bundle 在两代宿主上都画得出图标。
 *
 * 两份清单的来源是 npm 发布包 `@deepseek-ai/dsh-client-ui-primitives` 的 `lib/index.js`
 * 运行时导出表（浏览器 `require` 到的就是它）：
 *   - `ui-primitives-icons-0.1.5-rc.2.json`   ← @0.1.5-rc.2（旧名时代）
 *   - `ui-primitives-icons-0.1.7-alpha.2.json` ← @0.1.7-alpha.2（改名后）
 * 同名版本在宿主仓库 tag `dsh-v0.1.7-alpha.2` 里是同一份源码构建的。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NAMES_SRC = path.join(ROOT, 'client', 'icon-names.ts')
const ICONS_SRC = path.join(ROOT, 'client', 'icons.tsx')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')

const compiled = await transform(fs.readFileSync(NAMES_SRC, 'utf8'), {
  loader: 'ts',
  format: 'esm',
  target: 'es2020',
  charset: 'utf8',
})
const names = await import(`data:text/javascript;base64,${Buffer.from(compiled.code, 'utf8').toString('base64')}`)

const legacyList = new Set(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'ui-primitives-icons-0.1.5-rc.2.json'), 'utf8')))
const modernList = new Set(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'ui-primitives-icons-0.1.7-alpha.2.json'), 'utf8')))

/** icons.tsx 里以字面量引用到的图标稳定名（主题图标 + 面板控件）。 */
function referencedIcons() {
  const source = fs.readFileSync(ICONS_SRC, 'utf8')
  return [...new Set([...source.matchAll(/'(Icon[A-Za-z0-9]+)'/g)].map((m) => m[1]))].sort()
}

test('清单是真货：两份导出清单就是 npm 发布包的运行时导出表（防"清空的 fixture 骗过对照"）', () => {
  assert.equal(legacyList.size, 75, '0.1.5-rc.2 的 Icon* 导出应为 75 个（尺寸后缀拼写）')
  assert.equal(modernList.size, 186, '0.1.7-alpha.2 的 Icon* 导出应为 186 个（每图 Regular/Medium 两支）')
  assert.ok(legacyList.has('IconThinkOutline16') && !modernList.has('IconThinkOutline16'), '旧名在新清单里应当已消失（这才叫改名）')
  assert.ok(modernList.has('IconThinkOutlineRegular'), '新名应当在新清单里')
})

test('对照表与引用互相覆盖：引用了的都有对照行，对照行也都真的被引用', () => {
  const referenced = referencedIcons()
  assert.ok(referenced.length >= 14, `icons.tsx 里应至少引用 14 个图标（12 主题 + 2 控件），只找到 ${referenced.length} 个`)
  const keys = Object.keys(names.ICON_EXPORT_ALIASES).sort()
  const missing = referenced.filter((name) => !keys.includes(name))
  assert.deepEqual(missing, [], `这些引用没有对照行（去 icon-names.ts 补一行）：${missing.join(', ')}`)
  const extra = keys.filter((name) => !referenced.includes(name))
  assert.deepEqual(extra, [], `对照行里有没人引用的图标（多半是删引用漏删表）：${extra.join(', ')}`)
})

test('逐个落点：每个被引用的图标在旧清单有旧名、在新清单有映射后的新名', () => {
  const problems = []
  for (const [stable, [modern, legacy]] of Object.entries(names.ICON_EXPORT_ALIASES)) {
    if (!legacyList.has(legacy)) problems.push(`${stable}：旧名 ${legacy} 不在 0.1.5-rc.2 清单`)
    if (!modernList.has(modern)) problems.push(`${stable}：新名 ${modern} 不在 0.1.7-alpha.2 清单`)
    if (modernList.has(legacy)) problems.push(`${stable}：旧名 ${legacy} 也在新清单里？对照关系要重新核实`)
  }
  assert.deepEqual(problems, [], `落点核对失败：\n${problems.join('\n')}`)
})

test('解析顺序：0.1.7 拼写优先、旧名兜底；候选拼写就两种', () => {
  assert.deepEqual([...names.iconExportCandidates('IconThinkOutline16')], ['IconThinkOutlineRegular', 'IconThinkOutline16'])
  assert.deepEqual([...names.iconExportCandidates('IconCheckOutline14')], ['IconCheckOutlineRegular', 'IconCheckOutline14'])
  // 不在表里的名字原样当候选（过渡期临时引用），不猜别的拼写
  assert.deepEqual([...names.iconExportCandidates('IconWhatever9')], ['IconWhatever9'])
})

test('resolveIconExport：命中哪个用哪个、不命中就降级成纯文字', () => {
  const modern = () => null
  const legacy = () => null
  const both = { IconThinkOutlineRegular: modern, IconThinkOutline16: legacy }

  assert.equal(names.resolveIconExport(both, 'IconThinkOutline16'), modern, '两代都在时用 0.1.7 的名字')
  assert.equal(names.resolveIconExport({ IconThinkOutline16: legacy }, 'IconThinkOutline16'), legacy, '0.1.5 线只认旧名，要能兜住')
  assert.equal(names.resolveIconExport({ IconThinkOutlineRegular: modern }, 'IconThinkOutline16'), modern, '0.1.7 线只有新名')

  // 取不到 / 取到的不是组件：一律 null，由调用方降级成纯文字
  assert.equal(names.resolveIconExport({}, 'IconThinkOutline16'), null)
  assert.equal(names.resolveIconExport(null, 'IconThinkOutline16'), null)
  assert.equal(names.resolveIconExport({ IconThinkOutline16: 'string' }, 'IconThinkOutline16'), null, '字符串不是组件')
  assert.equal(names.resolveIconExport({ IconThinkOutline16: 42 }, 'IconThinkOutline16'), null, '数字不是组件')
  assert.equal(names.resolveIconExport({ IconThinkOutline16: {} }, 'IconThinkOutline16'), null, '裸对象不是组件')

  // memo / forwardRef 包出来的是带 $$typeof 的**对象**，必须照收（判 typeof === 'function' 会误伤）
  const memoized = { $$typeof: Symbol.for('react.memo') }
  assert.equal(names.resolveIconExport({ IconThinkOutline16: memoized }, 'IconThinkOutline16'), memoized)
})

test('严格的 namespace 代理对未知键抛错时不能拖垮面板', () => {
  const strict = new Proxy(
    { IconThinkOutlineRegular: () => null },
    {
      get(target, key) {
        if (typeof key === 'string' && !(key in target)) throw new Error(`unknown export ${key}`)
        return target[key]
      },
    },
  )
  assert.doesNotThrow(() => names.resolveIconExport(strict, 'IconCheckOutline14'), '两个拼写都抛错也只是拿不到图标')
  assert.equal(names.resolveIconExport(strict, 'IconCheckOutline14'), null)
  assert.ok(names.resolveIconExport(strict, 'IconThinkOutline16'), '有的名字仍要能取到')
})
