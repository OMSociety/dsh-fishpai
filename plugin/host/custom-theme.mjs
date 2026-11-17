/**
 * 用户级命名主题库。记录由宿主的 storageDomain 持久化，文档只保存 custom:<id> 引用。
 * 主题规格在写入与读取时都经过 core 校验；渲染层始终拿到完整的合并主题。
 */
import { randomUUID } from 'node:crypto'
import { safeThemeKey } from '../core/render.mjs'
import { themes } from '../core/runtime.mjs'
import { buildCustomTheme } from '../core/theme-spec.mjs'
import { classifyTheme } from '../core/theme-info.mjs'

export const CUSTOM_THEME_PREFIX = 'custom:'

function tableOf(domain) {
  if (!domain || typeof domain.table !== 'function') {
    throw new Error('命名主题库不可用：当前宿主没有提供 storageDomain')
  }
  return domain.table('themes')
}

export function normalizeCustomThemeId(value) {
  const raw = String(value ?? '').trim()
  const id = raw.startsWith(CUSTOM_THEME_PREFIX) ? raw.slice(CUSTOM_THEME_PREFIX.length) : raw
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(id)) {
    throw new Error('theme_id 需为 1–40 位字母、数字、下划线或连字符，且以字母或数字开头')
  }
  return id
}

export function customThemeKey(id) {
  return `${CUSTOM_THEME_PREFIX}${normalizeCustomThemeId(id)}`
}

function readRecord(domain, id) {
  return tableOf(domain).get(normalizeCustomThemeId(id)) || null
}

function buildRecord(id, record) {
  if (!record) return null
  const key = customThemeKey(id)
  try {
    const built = buildCustomTheme({ name: record.name, base: record.base, styles: record.styles }, themes(), key)
    return { ...built, id, key, createdAt: record.createdAt, source: record.source }
  } catch {
    // 持久化记录也是不可信输入；单条坏记录不能拖垮整份主题清单。
    return null
  }
}

/** 按 id 读取；不存在的主题返回 null。 */
export function readCustomTheme(domain, id) {
  return buildRecord(normalizeCustomThemeId(id), readRecord(domain, id))
}

/** 返回按创建时间、id 稳定排序的全部命名主题。 */
export function listCustomThemes(domain) {
  if (!domain) return []
  const table = tableOf(domain)
  return Array.from(table.keys())
    .map((id) => readCustomTheme(domain, id))
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/** 新建或按 id 覆盖一套主题；省略 id 时由宿主生成。 */
export async function writeCustomTheme({ domain, spec, id, source = 'custom' }) {
  const themeId = id === undefined || id === null || id === ''
    ? randomUUID().replaceAll('-', '').slice(0, 12)
    : normalizeCustomThemeId(id)
  const key = customThemeKey(themeId)
  const built = buildCustomTheme(spec, themes(), key)
  const table = tableOf(domain)
  const previous = table.get(themeId)
  const record = {
    name: built.spec.name,
    base: built.spec.base,
    styles: built.spec.styles,
    createdAt: previous?.createdAt ?? Date.now(),
    source: source === 'learn' ? 'learn' : 'custom',
  }
  await table.put(themeId, record)
  return { ...buildRecord(themeId, record), record }
}

/** 删除一套命名主题。 */
export async function clearCustomTheme(domain, id) {
  const table = tableOf(domain)
  return table.delete(normalizeCustomThemeId(id))
}

function selectedId(domain, id) {
  if (id !== undefined && id !== null && id !== '') return normalizeCustomThemeId(id)
  const all = listCustomThemes(domain)
  if (!all.length) return null
  if (all.length === 1) return all[0].id
  throw new Error('主题库里有多套命名主题，请用 theme_id 指定要操作的一套；action=list 可查看全部 id')
}

/** 给 show/clear 使用：只有一套时允许省略 id，多套时必须明确指定。 */
export function describeCustomTheme(domain, id) {
  const themeId = selectedId(domain, id)
  return themeId ? readCustomTheme(domain, themeId) : null
}

/** 将文档中的主题引用解析为内置 key 或完整的命名主题对象。 */
export function themeFor({ domain, name }) {
  const value = String(name || '')
  if (!value.startsWith(CUSTOM_THEME_PREFIX)) {
    const key = safeThemeKey(value)
    return { theme: key, key, custom: false, missing: false }
  }
  const custom = readCustomTheme(domain, value)
  if (!custom) return { theme: 'default', key: 'default', custom: false, missing: true }
  return { theme: custom.theme, key: custom.key, custom: true, missing: false }
}

/** 面板主题清单中的用户级条目。 */
export function customCatalogEntries(domain) {
  return listCustomThemes(domain).map((custom) => ({
    key: custom.key,
    name: custom.spec.name,
    emoji: custom.theme.emoji || '✳️',
    desc: `基于「${themes()[custom.spec.base].name}」`,
    scope: 'user',
    ...classifyTheme(custom.theme),
  }))
}
