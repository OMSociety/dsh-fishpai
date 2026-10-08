/**
 * 图标导出名核对：鱼排引用的每个图标都要出现在**声明支持的最低宿主版本**
 * （`@deepseek-ai/dsh-client-ui-primitives` 0.2.0-rc.2）的运行时导出表里。
 *
 * 清单的来源是 npm 发布包 0.2.0-rc.2 的 `lib/index.js` 导出语句（浏览器 `require`
 * 到的就是它），冻结成 `ui-primitives-icons-0.2.0-rc.2.json`。
 * 宿主升级导致图标改名时，这份清单与 `icons.tsx` 的引用要一起更新——测试红就是在提醒这件事。
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

const hostList = new Set(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'ui-primitives-icons-0.2.0-rc.2.json'), 'utf8')))

/** icons.tsx 里以字面量引用到的图标名（主题图标 + 面板控件）。 */
function referencedIcons() {
  const source = fs.readFileSync(ICONS_SRC, 'utf8')
  return [...new Set([...source.matchAll(/'(Icon[A-Za-z0-9]+)'/g)].map((m) => m[1]))].sort()
}

test('清单是真货：导出清单就是 npm 发布包的运行时导出表（防"清空的 fixture 骗过核对"）', () => {
  assert.equal(hostList.size, 194, '0.2.0-rc.2 的 Icon* 组件导出应为 194 个（97 个图标的 Regular/Medium 各一支）')
  assert.ok(hostList.has('IconThinkOutlineRegular'), '新名应当在新清单里')
  assert.ok(!hostList.has('IconThinkOutline16'), '旧尺寸后缀拼写在 0.2.0 线里已不存在')
})

test('引用都有落点：icons.tsx 引用的每个图标都在宿主导出清单里', () => {
  const referenced = referencedIcons()
  assert.ok(referenced.length >= 14, `icons.tsx 里应至少引用 14 个图标（12 主题 + 2 控件），只找到 ${referenced.length} 个`)
  const missing = referenced.filter((name) => !hostList.has(name))
  assert.deepEqual(missing, [], `这些图标不在 0.2.0-rc.2 导出清单里（名字拼错或宿主已改名）：${missing.join(', ')}`)
})

test('resolveIconExport：取到就用、取不到就降级成纯文字', () => {
  const icon = () => null
  const ns = { IconThinkOutlineRegular: icon }

  assert.equal(names.resolveIconExport(ns, 'IconThinkOutlineRegular'), icon, '导出表里有就返回它')
  assert.equal(names.resolveIconExport(ns, 'IconCheckOutlineRegular'), null, '导出表里没有就 null')

  // 取不到 / 取到的不是组件：一律 null，由调用方降级成纯文字
  assert.equal(names.resolveIconExport({}, 'IconThinkOutlineRegular'), null)
  assert.equal(names.resolveIconExport(null, 'IconThinkOutlineRegular'), null)
  assert.equal(names.resolveIconExport(undefined, 'IconThinkOutlineRegular'), null)
  assert.equal(names.resolveIconExport({ IconThinkOutlineRegular: 'string' }, 'IconThinkOutlineRegular'), null, '字符串不是组件')
  assert.equal(names.resolveIconExport({ IconThinkOutlineRegular: 42 }, 'IconThinkOutlineRegular'), null, '数字不是组件')
  assert.equal(names.resolveIconExport({ IconThinkOutlineRegular: {} }, 'IconThinkOutlineRegular'), null, '裸对象不是组件')

  // memo / forwardRef 包出来的是带 $$typeof 的**对象**，必须照收（判 typeof === 'function' 会误伤）
  const memoized = { $$typeof: Symbol.for('react.memo') }
  assert.equal(names.resolveIconExport({ IconThinkOutlineRegular: memoized }, 'IconThinkOutlineRegular'), memoized)
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
  assert.doesNotThrow(() => names.resolveIconExport(strict, 'IconCheckOutlineRegular'), '取不到也只是拿不到图标')
  assert.equal(names.resolveIconExport(strict, 'IconCheckOutlineRegular'), null)
  assert.ok(names.resolveIconExport(strict, 'IconThinkOutlineRegular'), '有的名字仍要能取到')
})
