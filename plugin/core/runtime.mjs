/**
 * 上游运行时加载：在 vm context 里求值站点原版的三个 vendor 资产。
 *
 * 为什么必须用 vm 顶层求值：上游 `js/themes.js` 用顶层 `const themes = {...}` 声明，
 * 不挂 `window`；直接 `import` 拿不到，必须 context 级顶层求值。
 * （这是上游的既有行为，不是我们选择的实现方式——见 NOTICE.md）
 *
 * 全部懒加载并缓存：插件启动时不付这份解析代价。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

export const VENDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor')

let sandbox = null

function loadRuntime() {
  const box = { console, document: undefined }
  box.window = box
  box.self = box
  box.globalThis = box
  vm.createContext(box)

  const load = (f) => vm.runInContext(fs.readFileSync(path.join(VENDOR, f), 'utf8'), box, { filename: f })
  load('markdown-it.min.js')
  load('highlight.min.js')
  load('themes.js')

  // hljs 在 UMD 里挂到自己身上，取出来交给沙箱的全局
  const hljs = box.hljs || (box.window && box.window.hljs)
  if (hljs) box.hljs = hljs

  return box
}

/** 在 vendor 沙箱里求值一个表达式（'markdownit' / 'hljs' / 'themes' …）。 */
export function read(expr) {
  if (sandbox === null) sandbox = loadRuntime()
  return vm.runInContext(expr, sandbox)
}

export function themes() {
  return read('themes')
}

export function colorPresets() {
  return read('colorPresets')
}

/** 主题名/别名 -> 主题 key。允许用中文名、emoji 名或 key 指定。 */
export function resolveTheme(name) {
  const THEMES = themes()
  if (!name) return 'default'
  if (THEMES[name]) return name
  const norm = String(name).replace(/\s/g, '')
  for (const [key, t] of Object.entries(THEMES)) {
    if (key === norm || t.name.replace(/\s/g, '') === norm) return key
    if (t.name.replace(/\s/g, '').includes(norm) || norm.includes(t.name.replace(/\s/g, ''))) return key
  }
  return null
}

/** 站点的字体预设（上游 app.js 的 fontMap）；默认 fontFamily='sans' 会覆盖主题自带字体。 */
export const FONT_MAP = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif',
  serif: '"Georgia", "Noto Serif SC", "Source Han Serif SC", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", monospace',
}

let HLJS_MAP = null

/** highlight.js token 的计算样式表（从真实浏览器导出，见 NOTICE.md）。 */
export function hljsMap() {
  if (HLJS_MAP) return HLJS_MAP
  try {
    HLJS_MAP = JSON.parse(fs.readFileSync(path.join(VENDOR, 'hljs-map.json'), 'utf8'))
  } catch {
    HLJS_MAP = {}
  }
  return HLJS_MAP
}
