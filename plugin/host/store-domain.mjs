/**
 * 用户级资产库：命名主题、写作风格、页头页尾片段、发布登录态。
 *
 * 为什么是 storageDomain 而不是 cwd 级文件：
 *   这四类是「用户级资产」——换工作目录、换会话都该跟着用户走，且要跨重启保留。
 *   宿主的 storageDomain（@deepseek-ai/dsh-storage-domain）正好提供版本化、schema 校验、
 *   宿主托管落盘（profile 目录）的 KV 存储，同步读、持久写，正是这类资产的归宿。
 *   文档协同状态（.fishpai/state、history）仍留在 cwd——那是「这篇文档」的状态，按工作区隔离才对。
 *
 * schema 用手写 { parse, safeParse }（宿主运行时只调这两个方法），不引入 zod 运行时依赖。
 */
// ── schema 小工具 ────────────────────────────────────────────────

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function str(v, { max = 4000, allowEmpty = false } = {}) {
  if (typeof v !== 'string') throw new TypeError('必须是字符串')
  if (!allowEmpty && !v.trim()) throw new TypeError('不能为空字符串')
  if (v.length > max) throw new TypeError(`长度超过上限 ${max}`)
  return v
}

/** 构造一个 { parse, safeParse }：parse 抛 TypeError，safeParse 包一层。 */
function codec(parse) {
  return {
    parse,
    safeParse(value) {
      try {
        return { success: true, data: parse(value) }
      } catch (error) {
        return { success: false, error }
      }
    },
  }
}

// ── 命名主题库 ──────────────────────────────────────────────────
// 记录：{ name, base, styles, createdAt, source }
// styles 的合法性由 core/theme-spec.mjs 在写入前校验；这里只做形态兜底。

const themeRecord = codec((v) => {
  if (!isRecord(v)) throw new TypeError('主题记录必须是对象')
  const styles = v.styles
  if (!isRecord(styles)) throw new TypeError('主题 styles 必须是对象')
  const cleanStyles = {}
  for (const [slot, css] of Object.entries(styles)) {
    cleanStyles[str(slot, { max: 40 })] = str(css, { max: 4000 })
  }
  return {
    name: str(v.name, { max: 60 }),
    base: str(v.base, { max: 40 }),
    styles: cleanStyles,
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : Date.now(),
    source: v.source === 'learn' ? 'learn' : 'custom',
  }
})

// ── 写作风格库 ──────────────────────────────────────────────────
// learn 产物：九字段风格描述 + 来源出处。

const writingStyleRecord = codec((v) => {
  if (!isRecord(v)) throw new TypeError('写作风格必须是对象')
  const arr = (x) => {
    if (!Array.isArray(x)) return []
    return x.filter((s) => typeof s === 'string').map((s) => s.slice(0, 500)).slice(0, 40)
  }
  return {
    styleId: str(v.styleId, { max: 60 }),
    tone: str(v.tone ?? '', { max: 2000, allowEmpty: true }),
    structure: str(v.structure ?? '', { max: 2000, allowEmpty: true }),
    audience: str(v.audience ?? '', { max: 500, allowEmpty: true }),
    purpose: str(v.purpose ?? '', { max: 500, allowEmpty: true }),
    do: arr(v.do),
    dont: arr(v.dont),
    sourceName: str(v.sourceName ?? '', { max: 200, allowEmpty: true }),
    sourceRef: str(v.sourceRef ?? '', { max: 1000, allowEmpty: true }),
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : Date.now(),
  }
})

// ── 页头页尾片段库 ──────────────────────────────────────────────
// 记录：{ name, headerHtml, footerHtml, footerImg, createdAt }

const snippetRecord = codec((v) => {
  if (!isRecord(v)) throw new TypeError('片段必须是对象')
  return {
    name: str(v.name, { max: 60 }),
    headerHtml: str(v.headerHtml ?? '', { max: 20000, allowEmpty: true }),
    footerHtml: str(v.footerHtml ?? '', { max: 20000, allowEmpty: true }),
    footerImg: str(v.footerImg ?? '', { max: 2000, allowEmpty: true }),
    createdAt: typeof v.createdAt === 'number' && Number.isFinite(v.createdAt) ? v.createdAt : Date.now(),
  }
})

// ── 发布登录态 ──────────────────────────────────────────────────
// 记录：{ platform, storageState, savedAt }
// storageState 是 playwright 的 storage_state JSON（含 Cookie），属敏感数据——
// 只存这里（宿主托管的 profile 目录），绝不进工作目录 / git。

const authRecord = codec((v) => {
  if (!isRecord(v)) throw new TypeError('登录态必须是对象')
  const platform = str(v.platform, { max: 20 })
  if (platform !== 'wechat' && platform !== 'xiumi') throw new TypeError('platform 只能是 wechat / xiumi')
  if (!isRecord(v.storageState)) throw new TypeError('storageState 必须是对象')
  return {
    platform,
    storageState: v.storageState,
    savedAt: typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) ? v.savedAt : Date.now(),
  }
})

// ── 域声明 ──────────────────────────────────────────────────────

export const THEMES_DOMAIN = 'fishpai_themes'
export const WRITING_DOMAIN = 'fishpai_writing_styles'
export const SNIPPETS_DOMAIN = 'fishpai_snippets'
export const AUTH_DOMAIN = 'fishpai_auth'

function domainSpecs(defineDomain) {
  return {
    themes: defineDomain({ name: THEMES_DOMAIN, version: 1, tables: { themes: { valueSchema: themeRecord } } }),
    writing: defineDomain({ name: WRITING_DOMAIN, version: 1, tables: { styles: { valueSchema: writingStyleRecord } } }),
    snippets: defineDomain({ name: SNIPPETS_DOMAIN, version: 1, tables: { snippets: { valueSchema: snippetRecord } } }),
    auth: defineDomain({ name: AUTH_DOMAIN, version: 1, tables: { auth: { valueSchema: authRecord } } }),
  }
}

/**
 * 打开全部用户级域，返回一组句柄；调用方（插件 apply）负责 close。
 *
 * storageDomain 不可用时返回 null；内置主题与文档协同仍可使用，
 * 命名主题、learn、片段与发布登录态会明确报告能力不可用。
 *
 * @param {object} ctx cordis 上下文
 * @returns {Promise<{themes, writing, snippets, auth, close} | null>}
 */
export async function openUserStores(ctx) {
  const storageDomain = ctx && typeof ctx.get === 'function' ? ctx.get('storageDomain', true) : ctx?.storageDomain
  if (!storageDomain || typeof storageDomain.open !== 'function') return null
  // 可选 peer 只在宿主确实提供服务时加载，纯文档/内置主题场景不依赖它。
  const { defineDomain } = await import('@deepseek-ai/dsh-storage-domain')
  const specs = domainSpecs(defineDomain)
  const opened = []
  try {
    const themes = await storageDomain.open(specs.themes)
    opened.push(themes)
    const writing = await storageDomain.open(specs.writing)
    opened.push(writing)
    const snippets = await storageDomain.open(specs.snippets)
    opened.push(snippets)
    const auth = await storageDomain.open(specs.auth)
    opened.push(auth)
    return {
      themes,
      writing,
      snippets,
      auth,
      async close() {
        for (const d of opened.reverse()) {
          try {
            await d.close()
          } catch {
            /* 关闭失败不影响其它域 */
          }
        }
      },
    }
  } catch (error) {
    for (const d of opened.reverse()) {
      try {
        await d.close()
      } catch {
        /* 忽略 */
      }
    }
    throw error
  }
}
