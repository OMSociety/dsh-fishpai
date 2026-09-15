/**
 * 工作目录级的**自定义主题**：一个工作目录只有一套，存在 `.fishpai/theme.json`。
 *
 * 为什么不是"主题库"：面板上只留**一个**「自定义主题」占位，模型改一次就覆盖一次——
 * 不需要命名、列表、删除这一堆管理面，用户也不必维护一个主题清单。
 *
 * 路径由宿主拼死（**不接受**调用方传路径），所以这里给 `resolveInCwd` 放行 `.json`
 * 不会变成"任意 JSON 读写"：`.fishpai/state/*.json` 那些仍然不可达。
 */
import fs from 'node:fs'
import path from 'node:path'
import { safeThemeKey } from '../core/render.mjs'
import { themes } from '../core/runtime.mjs'
import { buildCustomTheme } from '../core/theme-spec.mjs'
import { classifyTheme } from '../core/theme-info.mjs'
import { ensureFishpaiLayout, resolveInCwd } from './store.mjs'

/** 主题列表里那个占位的 key（面板按它选中）。 */
export const CUSTOM_THEME_KEY = 'custom'
/** 占位的显示名：固定一个，不跟着模型起的名字变（面板上只留一个占位）。 */
export const CUSTOM_THEME_LABEL = '自定义主题'

const STORE_VERSION = 1

function themePath(cwd) {
  return resolveInCwd(cwd, path.join('.fishpai', 'theme.json'), { exts: ['.json'] })
}

/**
 * 读当前工作目录的自定义主题。
 *
 * 坏文件/校验不过 → `null`（当"没有"处理）：一份手改坏的 `theme.json` 不该让面板打不开，
 * 也不该让一篇文档渲染不出来。`missing` 与"坏掉了"在这里是同一件事。
 *
 * @returns {{spec: object, theme: object} | null}
 */
export function readCustomTheme(cwd) {
  try {
    const abs = themePath(cwd)
    if (!fs.existsSync(abs)) return null
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'))
    const spec = raw && typeof raw === 'object' && raw.spec ? raw.spec : raw
    return buildCustomTheme(spec, themes())
  } catch {
    return null
  }
}

/**
 * 写自定义主题（覆盖那唯一一套）。
 * @throws {Error} 规格不合法时抛出——文案是给模型看的，让它自己改对再来
 */
export function writeCustomTheme({ cwd, spec }) {
  ensureFishpaiLayout(cwd)
  const built = buildCustomTheme(spec, themes())
  const abs = themePath(cwd)
  // 只存**数据**三件套：校验产物还带着 `notes`（那是给模型的运行时提示），
  // 整个存下去的话，读回来会被"只认 name/base/styles"的规则拒掉——存了等于没存（测试抓到过）。
  const saved = { name: built.spec.name, base: built.spec.base, styles: built.spec.styles }
  // 临时文件 + rename：写一半留下坏 JSON 会让面板下次直接"没有自定义主题"
  const tmp = `${abs}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify({ version: STORE_VERSION, spec: saved }, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, abs)
  return built
}

/** 移除自定义主题。返回是否真的删掉了东西。 */
export function clearCustomTheme(cwd) {
  try {
    const abs = themePath(cwd)
    if (!fs.existsSync(abs)) return false
    fs.unlinkSync(abs)
    return true
  } catch {
    return false
  }
}

/**
 * 把文档状态里的主题名解析成 `render()` 能用的东西。
 *
 * `'custom'` 是唯一需要查磁盘的 key：那套主题不在内置表里，找不到就**退回默认主题**
 * （与 `safeThemeKey` 对未知主题的处理一致——别让一篇文档因为主题文件被删就打不开）。
 *
 * @returns {{theme: string|object, key: string, custom: boolean, missing: boolean}}
 */
export function themeFor({ cwd, name }) {
  if (name !== CUSTOM_THEME_KEY) {
    const key = safeThemeKey(name)
    return { theme: key, key, custom: false, missing: false }
  }
  const custom = readCustomTheme(cwd)
  if (!custom) return { theme: 'default', key: 'default', custom: false, missing: true }
  return { theme: custom.theme, key: CUSTOM_THEME_KEY, custom: true, missing: false }
}

/**
 * 主题清单里的那一个占位项（没有自定义主题时返回 `null`，面板就不显示这一组——
 * 宁可没有这一行，也不要一个点了没反应的灰项）。
 *
 * 能力标注照旧由 `classifyTheme()` 从主题定义推导：模型写了渐变文字/深色底，
 * 面板就会把它归进「微信可能掉样式」那一组，跟内置主题一个待遇。
 */
export function customCatalogEntry(cwd) {
  const custom = readCustomTheme(cwd)
  if (!custom) return null
  return {
    key: CUSTOM_THEME_KEY,
    name: CUSTOM_THEME_LABEL,
    emoji: custom.theme.emoji || '✳️',
    desc: `模型生成：${custom.spec.name}（基于「${themes()[custom.spec.base].name}」）`,
    ...classifyTheme(custom.theme),
  }
}

/** 给工具/模型看的当前规格（`fishpai_theme` 的 show 用）。 */
export function describeCustomTheme(cwd) {
  const custom = readCustomTheme(cwd)
  if (!custom) return null
  return { spec: custom.spec, theme: custom.theme }
}
