/**
 * 鱼排 FishPai —— 宿主入口。
 *
 * 三件事，都挂在 ctx.effect 上（HMR / 卸载时逐条收回）：
 *   1. 注册模型工具：fishpai_open / fishpai_read / fishpai_write / fishpai_render / fishpai_theme
 *   2. 注册 `/fishpai/api/*` 路由：右侧栏面板读写文档的唯一通道
 *   3. 注册 `fishpai` 技能：告诉模型什么时候用、按什么纪律改稿
 *
 * 客户端半边在 `lib/client.js`（由 client/*.tsx 打包），通过 package.json 的
 * `dsh.client` + `exports["./client"]` 声明，与本文件同属一个包。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTools } from './host/tools.mjs'
import { createApiHandler, API_PREFIX } from './host/routes.mjs'
import { canonicalCwd, ensureFishpaiLayout } from './host/store.mjs'

export const name = 'dsh-fishpai'

/** 少一个都会被 Cordis 拒绝访问：工具、路由、会话目录、技能。 */
export const inject = ['webServer', 'sessions', 'tools', 'skills']

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIR = path.join(ROOT, 'skills', 'fishpai')
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md')

/** 会话 → 工作目录（规范化成真实路径，与路径守卫同一口径）。 */
function makeResolveCwd(ctx) {
  return (sessionId) => {
    try {
      const session = ctx.sessions && ctx.sessions.get ? ctx.sessions.get(sessionId) : null
      const cwd = session && session.header ? session.header.cwd : null
      if (cwd) return canonicalCwd(cwd)
    } catch {
      /* 会话已消失就往下走 */
    }
    return null
  }
}

/** 极简 frontmatter 读取（技能只需要 name / description）。 */
function readSkillFrontmatter(source) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

function registerSkill(ctx, log) {
  if (!existsSync(SKILL_FILE)) return () => {}
  try {
    const source = readFileSync(SKILL_FILE, 'utf8')
    const frontmatter = readSkillFrontmatter(source)
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    const off = ctx.skills.register({
      name: frontmatter.name || 'fishpai',
      description: frontmatter.description || '公众号排版（鱼排）',
      content: body.trim(),
      // ⚠️ `source` **必须给**：runtime 技能的 register() 只校验 name/description，
      // 但技能被 load 时会走 validateDefinition，那里要求 source / provider 都是字符串
      // （provider 由注册器补默认值，source 不会）。漏了它，技能在目录里看得见、一加载就报
      // "loaded skill ... source must be a string"。
      source: 'bundled',
      resourceBase: { kind: 'directory', path: SKILL_DIR },
    })
    return typeof off === 'function' ? off : () => {}
  } catch (error) {
    log(`[fishpai] 技能注册失败：${error.message}`)
    return () => {}
  }
}

export function apply(ctx) {
  const log = (msg) => {
    try {
      ctx.logger?.info?.(msg)
    } catch {
      /* 没有 logger 也不影响功能 */
    }
  }
  const resolveCwd = makeResolveCwd(ctx)

  // 工作目录里的 .fishpai 布局在第一次真正用到时创建；这里只做一次尽力而为的预处理
  ctx.effect(() => {
    try {
      const sessionList = ctx.sessions && typeof ctx.sessions.list === 'function' ? ctx.sessions.list() : []
      for (const session of sessionList) {
        const cwd = session && session.header ? session.header.cwd : null
        if (cwd) ensureFishpaiLayout(cwd)
      }
    } catch {
      /* 拿不到会话列表就等第一次工具调用时再建 */
    }
    return () => {}
  }, 'fishpai: 初始化 .fishpai 布局')

  // ── 1. 模型工具 ────────────────────────────────────────────
  ctx.effect(() => registerTools(ctx, { resolveCwd, log }), 'fishpai: 注册模型工具')

  // ── 2. HTTP 路由 ───────────────────────────────────────────
  ctx.effect(() => {
    const webServer = ctx.webServer
    if (!webServer || typeof webServer.register !== 'function') {
      log('[fishpai] webServer 不可用，右侧栏面板将无法读写文档')
      return () => {}
    }
    try {
      const handler = createApiHandler({ resolveCwd, log })
      return webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
    } catch (error) {
      // 路由注册失败不应把整个插件拖垮：工具（模型侧）仍然可用
      log(`[fishpai] 路由注册失败：${error.message}`)
      return () => {}
    }
  }, 'fishpai: /fishpai/api 路由')

  // ── 3. 技能 ────────────────────────────────────────────────
  ctx.effect(() => {
    const off = registerSkill(ctx, log)
    return () => off()
  }, 'fishpai: 注册技能')
}
