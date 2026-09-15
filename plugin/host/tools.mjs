/**
 * 模型侧工具：`fishpai_open` / `fishpai_read` / `fishpai_write` / `fishpai_render` / `fishpai_theme`。
 *
 * 用 **raw JSON-Schema 注册**（`ctx.tools.register({name, description, parameters, output, execute})`），
 * 不要 import `defineTool`——树外插件解析 `@deepseek-ai/dsh-tools` 不可靠（本机 dsh-ssh-tunnel /
 * dsh-git-forge 都因此改用 raw 形态）。
 *
 * 工具文案本身就是给模型的纪律：写之前先读、写要带 base_revision、人改优先。
 */
import fs from 'node:fs'
import path from 'node:path'
import { render as renderCore, safeThemeKey } from '../core/render.mjs'
import { themes } from '../core/runtime.mjs'
import { buildCustomTheme, describeThemeSpec } from '../core/theme-spec.mjs'
import { splitBlocks } from '../core/markdown.mjs'
import { diffBlocks } from '../core/diff.mjs'
import { applyPatches } from '../core/patch.mjs'
import { attachPlaceholdersToBlocks, extractPlaceholders, reanchorNotes } from '../core/notes.mjs'
import * as store from './store.mjs'
import {
  CUSTOM_THEME_KEY,
  clearCustomTheme,
  describeCustomTheme,
  themeFor,
  writeCustomTheme,
} from './custom-theme.mjs'
import { MAX_EMBED_BYTES, listLocalImages, listRemoteImages, makeImageResolver } from './assets.mjs'

const OUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    doc_key: { type: 'string' },
    isError: { type: 'boolean' },
  },
  required: ['text'],
}

const renderText = (_args, value) => [{ type: 'text', text: value.text }]

function ok(text, docKey) {
  return { text, ...(docKey ? { doc_key: docKey } : {}), isError: false }
}

function err(text) {
  return { text, isError: true }
}

function fmtTime(at) {
  if (!at) return '未知时间'
  const d = new Date(at)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function anchor(block) {
  if (!block) return '文档'
  const where = block.headingPath && block.headingPath.length ? block.headingPath[block.headingPath.length - 1] : '开头'
  const id = block.id || block.blockId || '?'
  const start = block.startLine
  const end = block.endLine
  const kind = block.kind || '块'
  return start ? `块 ${id}（第 ${start}-${end} 行 · ${kind} · §${where}）` : `块 ${id}（${kind} · §${where}）`
}

function clip(text, max = 400) {
  const s = String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max)}…（截断）`
}

/** 会话身份与工作目录：工具必须知道自己在为哪个会话干活。 */
function sessionOf(deps, exec) {
  const sessionId = exec && exec.agent && exec.agent.session ? exec.agent.session.id : null
  if (!sessionId) throw new Error('无法确定调用方会话身份')
  const cwd = deps.resolveCwd(sessionId)
  if (!cwd) throw new Error('该会话没有工作目录，无法读写文档')
  return { sessionId, cwd }
}

/** 定位文档：显式 doc_key 优先，否则用该会话当前打开的那一份。 */
function locate(deps, exec, args = {}) {
  const { sessionId, cwd } = sessionOf(deps, exec)
  const key = args.doc_key ? String(args.doc_key) : store.activeKey(cwd, sessionId)
  if (!key) throw new Error('这个会话还没有打开任何鱼排文档，请先调用 fishpai_open')
  const entry = store.readIndex(cwd).docs[key]
  if (!entry) throw new Error(`没有这个文档：${key}`)
  const abs = store.resolveInCwd(cwd, entry.path)
  const state = store.readState(cwd, key)
  if (!state) {
    throw new Error(`文档状态缺失（.fishpai/state 可能被清理过）：${key}。请重新 fishpai_open 这篇文档。`)
  }
  return { sessionId, cwd, key, abs, state }
}

function readText(abs) {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 注册五个工具。
 * @param {object} ctx 宿主 cordis 上下文（需要 ctx.tools）
 * @param {{resolveCwd: (sessionId: string) => string|null, log?: Function}} deps
 * @returns {() => void} 全部工具的卸载函数
 */
export function registerTools(ctx, deps) {
  const disposers = []
  const register = (tool) => {
    try {
      const dispose = ctx.tools.register(tool)
      disposers.push(typeof dispose === 'function' ? dispose : () => {})
    } catch (error) {
      deps.log?.(`[fishpai] 工具 ${tool.name} 注册失败: ${error.message}`)
    }
  }

  // ── fishpai_open ─────────────────────────────────────────────
  register({
    name: 'fishpai_open',
    description:
      '在 DSH 右侧栏打开「鱼排编辑器」公众号排版台，并把它指向一篇 Markdown。传 markdown 会新建文档并写入；传 path 打开工作区里已有的 .md（已存在的文件不会被覆盖）。文档打开后请让用户在侧栏直接改字或加批注（也可用 <!-- 鱼排: … --> 留占位），然后用 fishpai_read 拿到块级 diff 与批注，再用 fishpai_write 局部改稿。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '工作目录内的 .md 路径（可省略扩展名，会自动补 .md）；省略则在 <工作目录>/.fishpai/docs/ 下按标题新建' },
        markdown: { type: 'string', description: '初始 Markdown。目标文件已存在时不会覆盖，只打开现状' },
        theme: { type: 'string', description: '主题 key 或中文名；省略则用 default（默认公众号，最适合粘进微信）。tech / gradient / dark_night 等风格更适合导出 HTML' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: OUT_SCHEMA, render: renderText },
    async execute(args, exec) {
      try {
        const { sessionId, cwd } = sessionOf(deps, exec)
        const docPath = args.path
          ? store.resolveInCwd(cwd, store.withDefaultExt(String(args.path), '.md'))
          : store.defaultDocPath(cwd, args.markdown)
        const opened = store.openDoc({
          cwd,
          docPath,
          markdown: args.markdown === undefined ? undefined : String(args.markdown),
          theme: args.theme ? String(args.theme) : undefined,
          by: 'ai',
        })
        store.setActive(cwd, sessionId, opened.key)
        store.requestOpen({ cwd, docPath: opened.path, sessionId })

        const rel = path.relative(cwd, opened.path).replace(/\\/g, '/')
        const lines = [
          opened.created ? `已新建文档并打开「鱼排编辑器」：${rel}` : `已打开已有文档：${rel}`,
          `revision = ${opened.state.revision}，主题 = ${opened.state.theme}`,
          '右侧栏的「鱼排编辑器」面板已弹出（若没看到请点右侧栏顶部的鱼排图标）。',
        ]
        if (opened.markdownIgnored && !opened.created) {
          lines.push('注意：该文件已存在，你传入的 markdown 没有写入，避免覆盖用户内容。要改内容请用 fishpai_write。')
        }
        lines.push('接下来等用户在面板里改动/加批注，然后调用 fishpai_read 看 diff。')
        return ok(lines.join('\n'), opened.key)
      } catch (error) {
        return err(`fishpai_open 失败：${error.message}`)
      }
    },
  })

  // ── fishpai_read ─────────────────────────────────────────────
  register({
    name: 'fishpai_read',
    description:
      '读取鱼排文档的当前状态：与「你上次写入的版本」之间的块级 diff、用户留下的批注与行内占位、以及全文。改稿之前必须先调用它——diff 告诉你用户到底改了什么、想要什么。',
    parameters: {
      type: 'object',
      properties: {
        doc_key: { type: 'string', description: '文档键；省略则读本会话当前打开的那一份' },
        include: {
          type: 'string',
          enum: ['full', 'summary', 'outline'],
          description: 'full（默认）附全文；summary 只给 diff/批注/占位；outline 另附块清单（id + 首行）',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: OUT_SCHEMA, render: renderText },
    async execute(args, exec) {
      try {
        const { cwd, key, abs, state } = locate(deps, exec, args)
        const markdown = readText(abs)
        const blocks = splitBlocks(markdown)
        const baseline = store.baselineContent(cwd, state)
        const diff = diffBlocks(baseline, markdown)
        const notes = reanchorNotes(state.notes, blocks)
        const placeholders = attachPlaceholdersToBlocks(extractPlaceholders(markdown), blocks)
        const images = listLocalImages({ markdown, cwd, docPath: abs })
        const include = String(args.include || 'full')

        const out = []
        out.push(`文档：${store.docTitle(markdown, abs)}`)
        out.push(`路径：${path.relative(cwd, abs).replace(/\\/g, '/')}　revision = ${state.revision}　共 ${blocks.length} 块`)
        const hasBaseline = !!state.baseline
        if (hasBaseline) {
          out.push(`你上次写入：rev ${state.baseline.rev} @ ${fmtTime(state.baseline.at)}（by ${state.baseline.by}）`)
        } else {
          out.push('⚠ 这篇文档还没有基线（你还没写入过，或 .fishpai 状态被清理过）——"人改了什么"无法计算，请按下面的全文与批注处理。')
        }

        const changed = diff.entries
        if (!changed.length) {
          out.push(
            hasBaseline
              ? '自你上次写入以来，用户没有改动正文。'
              : '（没有基线，因此不显示正文差异；人留下的批注与行内占位见下。）',
          )
        } else {
          out.push(`用户改动：${diff.stats.changed} 处改写 / ${diff.stats.added} 处新增 / ${diff.stats.removed} 处删除（共 ${diff.stats.blocksAfter} 块）`)
          for (const e of diff.entries) {
            if (e.status === 'rewritten') {
              out.push(`[整篇重写] ${e.summary}`)
              continue
            }
            out.push(`[${e.status}] ${anchor(e)}`)
            if (e.before !== undefined) out.push(`  改前：${clip(e.before)}`)
            if (e.after !== undefined) out.push(`  改后：${clip(e.after)}`)
          }
          if (diff.truncated) out.push('（差异过多，已折叠；如需定位具体块可先用 outline）')
        }

        const openNotes = notes.filter((n) => !n.resolved)
        if (openNotes.length) {
          out.push(`用户批注（${openNotes.length} 条）：`)
          for (const n of openNotes) {
            const where = n.orphan ? `锚点已失效（原文片段：${clip(n.quote, 60)}）` : anchor(blocks[n.blockIndex])
            out.push(`  - ${where}：${clip(n.text, 300)}`)
          }
        }
        if (placeholders.length) {
          out.push(`行内占位（${placeholders.length} 处，处理完请一并删掉）：`)
          for (const p of placeholders) out.push(`  - 第 ${p.line} 行：${clip(p.text, 200)}`)
        }
        // 图片分三类说清楚：会内嵌的（粘过去自带）、内嵌不了的、外链的（微信正文不许引用）
        const inlineOk = images.filter((i) => i.embed)
        const notEmbedded = images.filter((i) => !i.embed)
        const remoteImages = listRemoteImages({ markdown })
        if (images.length || remoteImages.length) {
          const parts = []
          if (inlineOk.length) parts.push(`${inlineOk.length} 张本地图会内嵌 base64（粘进公众号编辑器时跟着一起过去，不用手动重传）`)
          if (notEmbedded.length) parts.push(`${notEmbedded.length} 张本地图不会被内嵌`)
          if (remoteImages.length) parts.push(`${remoteImages.length} 张外链图会被微信拦掉`)
          out.push(`图片：${parts.join('；')}`)
          for (const img of notEmbedded) {
            const why =
              img.status === 'missing'
                ? '文件不存在'
                : img.status === 'too-large'
                  ? `超过 ${Math.round(MAX_EMBED_BYTES / 1024 / 1024)}MB 内嵌上限`
                  : '在工作目录之外'
            out.push(`  - ⚠ ${img.src}：${why}，粘过去可能不显示，要在编辑器里手动上传`)
          }
          for (const img of remoteImages) {
            out.push(`  - ⚠ ${img.src}：外链图，微信正文不允许引用，需要先下载再上传`)
          }
        }

        if (include === 'outline') {
          out.push('块清单：')
          for (const b of blocks) out.push(`  ${b.index} ${b.id} [${b.kind}] ${clip(b.text.split('\n')[0], 60)}`)
        }
        if (include === 'full') {
          out.push('—— 当前全文 ——')
          out.push(markdown)
        }
        out.push('—— 改稿提示：用 fishpai_write 的 mode:"patch" 只改你需要的块（block_id 见上），不要整篇重写，以免覆盖用户其余的手改。')
        return ok(out.join('\n'), key)
      } catch (error) {
        return err(`fishpai_read 失败：${error.message}`)
      }
    },
  })

  // ── fishpai_write ────────────────────────────────────────────
  register({
    name: 'fishpai_write',
    description:
      '按用户的最新改动改稿。必须带上你 read 到的 base_revision：如果用户在 read 之后又改过，写入会被拒绝并回带最新 diff（这是为了不覆盖人的手改）。优先用 mode:"patch" 只替换/插入/删除指定块，整篇重写只在确实需要时用 mode:"replace"。',
    parameters: {
      type: 'object',
      properties: {
        doc_key: { type: 'string', description: '文档键；省略则写本会话当前打开的那一份' },
        base_revision: { type: 'number', description: '你 read 到的 revision；不匹配则拒绝写入' },
        mode: { type: 'string', enum: ['patch', 'replace'], description: 'patch=按块局部改（推荐）；replace=整篇替换' },
        markdown: { type: 'string', description: 'mode=replace 时的全文' },
        patches: {
          type: 'array',
          description: 'mode=patch 时的块级补丁',
          items: {
            type: 'object',
            properties: {
              block_id: { type: 'string', description: '目标块 id（来自 fishpai_read 的 diff 或 outline）' },
              block_index: { type: 'number', description: '目标块序号（block_id 的替代写法）' },
              op: { type: 'string', enum: ['replace', 'insert_after', 'delete'], description: '改这块 / 在它后面插入 / 删掉它' },
              markdown: { type: 'string', description: 'replace / insert_after 要写入的 Markdown' },
            },
            required: ['op'],
            additionalProperties: false,
          },
        },
      },
      required: ['base_revision', 'mode'],
      additionalProperties: false,
    },
    output: { schema: OUT_SCHEMA, render: renderText },
    async execute(args, exec) {
      try {
        const { cwd, key, abs, state } = locate(deps, exec, args)
        const current = readText(abs)
        const mode = String(args.mode)

        // 先卡版本再看内容：版本不对时，块 id 也可能已经失效（人改了正文），
        // 那种情况下报"找不到块"会误导模型，报"版本不匹配，请重新 read"才准确。
        if (Number(args.base_revision) !== state.revision) {
          const diff = diffBlocks(store.baselineContent(cwd, state), current)
          const lines = [
            `写入被拒绝：base_revision=${args.base_revision} 但当前是 ${state.revision}——文档在你 read 之后被改过。`,
            '请重新 fishpai_read 拿到最新内容与块 id，再用新的 base_revision 提交，不要凭旧内容覆盖。',
          ]
          if (diff.entries.length) {
            lines.push('自你上次写入以来，文档里发生的改动：')
            for (const e of diff.entries.slice(0, 10)) {
              if (e.status === 'rewritten') {
                lines.push(`[整篇重写] ${e.summary}`)
                continue
              }
              const where = e.blockId ? `块 ${e.blockId}` : '文档'
              lines.push(`[${e.status}] ${where}${e.after !== undefined ? `：${clip(e.after, 200)}` : ''}`)
            }
          }
          return err(lines.join('\n'))
        }

        let next = current
        let applied = []
        let patchErrors = []
        if (mode === 'patch') {
          const patches = Array.isArray(args.patches) ? args.patches : []
          if (!patches.length) return err('mode=patch 需要 patches 数组；要么改用 mode=replace 并给 markdown')
          const result = applyPatches(current, splitBlocks(current), patches)
          next = result.markdown
          applied = result.applied
          patchErrors = result.errors
          if (!applied.length) return err(`没有一个补丁能应用：\n${patchErrors.join('\n')}`)
        } else if (mode === 'replace') {
          if (typeof args.markdown !== 'string' || !args.markdown.trim()) return err('mode=replace 需要 markdown 全文')
          next = args.markdown
        } else {
          return err(`未知 mode：${mode}`)
        }

        const saved = store.saveDoc({ cwd, docPath: abs, markdown: next, baseRevision: Number(args.base_revision), by: 'ai' })
        if (!saved.ok) {
          const diff = diffBlocks(saved.markdown, current)
          const lines = [
            `写入被拒绝：base_revision=${args.base_revision} 但当前是 ${saved.revision}——用户在 read 之后又改过文档。`,
            '请重新 fishpai_read 之后再用新的 base_revision 提交，不要凭旧内容覆盖。',
          ]
          if (diff.entries.length) {
            lines.push('同时给你看看现在差在哪：')
            for (const e of diff.entries.slice(0, 10)) {
              lines.push(`[${e.status}] ${e.blockId ? `块 ${e.blockId}` : '文档'}${e.after !== undefined ? `：${clip(e.after, 200)}` : ''}`)
            }
          }
          return err(lines.join('\n'))
        }

        const afterBlocks = splitBlocks(next)
        const lines = [`已写入，revision ${state.revision} → ${saved.state.revision}`]
        if (mode === 'patch') {
          lines.push(`应用了 ${applied.length} 个补丁：${applied.map((a) => `${a.op}(${a.blockId})`).join('、')}`)
          if (patchErrors.length) lines.push(`跳过的补丁：${patchErrors.join('；')}`)
        } else {
          lines.push(`整篇替换：${current.length} 字符 → ${next.length} 字符，共 ${afterBlocks.length} 块`)
        }
        lines.push('用户可在侧栏直接看到新版本；他们的下一次改动会出现在你的下一次 fishpai_read 里。')
        return ok(lines.join('\n'), key)
      } catch (error) {
        return err(`fishpai_write 失败：${error.message}`)
      }
    },
  })

  // ── fishpai_render ───────────────────────────────────────────
  register({
    name: 'fishpai_render',
    description:
      '把文档渲染成可直接粘贴进微信公众号编辑器的自包含 HTML 文件（内联样式、本地图片内嵌 base64），落在工作目录里。用于交付、预览或归档；日常发布仍由用户在侧栏点「复制到公众号」或「导出」。',
    parameters: {
      type: 'object',
      properties: {
        doc_key: { type: 'string', description: '文档键；省略则用本会话当前打开的那一份（主题、字号等开关跟着它走）' },
        markdown: { type: 'string', description: '直接渲染这段 Markdown（不读磁盘上的文件）；本会话仍需已打开一篇文档提供样式设置——没有就先 fishpai_open' },
        theme: { type: 'string', description: '主题 key 或中文名，覆盖文档当前设置' },
        theme_spec: {
          type: 'object',
          additionalProperties: true,
          description:
            '自定义主题（用 `fishpai_theme` 保存的那一套，或临时用这一次）：{"name":"我的·灰底衬线","base":"elegant","styles":{"h2":"font-size: 19px;","blockquote":"background: #f4f4f5;"}}。' +
            '只写想改的槽位，其余从 base 继承；base 省略时为 default。与 theme 同时给时以 theme_spec 为准。' +
            '可用槽位与允许的 CSS 属性见技能 fishpai 的「自定义主题」一节（超出白名单会被拒绝并说明原因）。',
        },
        out_path: { type: 'string', description: '输出 HTML 路径（工作目录内；可省略扩展名，会自动补 .html）；省略则与文档同名的 .html' },
        embed_images: { type: 'boolean', description: '是否把本地图片内嵌成 base64，默认 true' },
        publish: { type: 'boolean', description: 'true（默认）=「复制到公众号」形态；false = 预览原样 HTML' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: OUT_SCHEMA, render: renderText },
    async execute(args, exec) {
      try {
        const { cwd, key, abs, state } = locate(deps, exec, args)
        const markdown = typeof args.markdown === 'string' ? args.markdown : readText(abs)
        // 自定义主题（模型给的规格）：校验成数据再合并到 base 上，**不求值任何模型给的代码**。
        // 校验不过就直接失败——错误文案是写给模型看的，让它自己改对再来一次。
        const custom = args.theme_spec ? buildCustomTheme(args.theme_spec, themes()) : null
        // 主题名可能来自状态（那两套被移除的主题）、模型手写、或工作目录那套自定义主题
        //（`custom` 要读磁盘）：认不出就退回默认，别让导出整个失败。
        const theme = custom ? custom.theme : themeFor({ cwd, name: args.theme ? String(args.theme) : state.theme }).theme
        const out = renderCore(markdown, {
          theme,
          color: state.color || undefined,
          font: state.font,
          fontSize: state.fontSize,
          footnotes: state.footnotes !== false,
          macCodeBlock: state.macCodeBlock !== false,
          publish: args.publish !== false,
          // 导出的成品是要粘进公众号的，所以跟面板的「复制到公众号」走同一条兼容层：
          // ① 把文字包进 <span>，避开微信结构校验对"含行内元素的段落"的误报；
          // ② 把 background 简写拆成微信肯保留的长写，否则引用块/表头底色会被丢；
          // ③ 把选定的字号推进到 p / li / 引用上（微信会剥掉最外层 wrapper 的样式）。
          // publish:false（预览原样 HTML）时不加，保持与站点一致的原始形态。
          wrapText: args.publish !== false,
          wechatBackground: args.publish !== false,
          promoteFontSize: args.publish !== false,
          imageResolver: args.embed_images === false ? undefined : makeImageResolver({ cwd, docPath: abs }),
        })
        const target = args.out_path
          ? store.resolveInCwd(cwd, store.withDefaultExt(String(args.out_path), '.html'), { exts: ['.html', '.htm'] })
          : store.resolveInCwd(cwd, path.join(path.dirname(abs), `${path.basename(abs, path.extname(abs))}.html`), { exts: ['.html', '.htm'] })
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, out.html, 'utf8')
        const lines = [
          `已导出 HTML：${path.relative(cwd, target).replace(/\\/g, '/')}`,
          `主题「${out.themeName}」　${out.html.length} 字符（约 ${Math.round(Buffer.byteLength(out.html, 'utf8') / 1024)} KB）`,
          args.embed_images === false ? '本地图片未内嵌。' : '本地图片已内嵌 base64。',
        ]
        if (custom) {
          lines.push(describeThemeSpec(custom.spec))
          lines.push(
            '这套主题**没有保存**（只写进了这份 HTML）：不要告诉用户"已经存进主题列表"。' +
              '要把它变成面板里可点选的主题，等保存那一步（用户确认后再做）。',
          )
          for (const note of custom.spec.notes) lines.push(`提示：${note}`)
        }
        return ok(lines.join('\n'), key)
      } catch (error) {
        return err(`fishpai_render 失败：${error.message}`)
      }
    },
  })

  // 走 `register()` 而不是直接 `ctx.tools.register()`：它把卸载函数收进 disposers，
  // 插件卸载时才不会留下一个还挂着的工具（`plugin.mount.test.mjs` 会查这个）。
  register({
    name: 'fishpai_theme',
    description:
      '工作目录级的「自定义主题」：一个工作目录**只有一套**，存在 `.fishpai/theme.json`，' +
      '面板的主题列表里就是那一个「自定义主题」占位（不是主题库，改一次覆盖一次）。' +
      'action=set 写入并覆盖，同时把当前文档切到它（你能在面板里立刻看到）；action=show 看现在这套（改它就在这份规格上改）；' +
      'action=clear 移除，文档退回默认主题。只想试一次、不落盘，就用 fishpai_render 的 theme_spec。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['set', 'show', 'clear'], description: '默认 show' },
        theme_spec: {
          type: 'object',
          additionalProperties: true,
          description:
            'action=set 时必填：{"name":"我的·灰底衬线","base":"elegant","styles":{"blockquote":"background: #f4f4f5;"}}。' +
            '只写想改的槽位，其余从 base 继承。可用槽位与允许的 CSS 属性见技能 fishpai 的「自定义主题」一节。',
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: OUT_SCHEMA, render: renderText },
    async execute(args, exec) {
      try {
        // 这个工具是**工作目录级**的，不需要先有一篇文档：只要会话有 cwd 就能用
        const { sessionId, cwd } = sessionOf(deps, exec)
        const action = String(args.action || 'show')

        if (action === 'show') {
          const current = describeCustomTheme(cwd)
          if (!current) {
            return ok('这个工作目录还没有自定义主题。用 action=set 写一套，面板主题列表里就会出现「自定义主题」。')
          }
          return ok(
            [
              `当前自定义主题「${current.spec.name}」（base=${current.spec.base}）改了 ${Object.keys(current.spec.styles).length} 个槽位：`,
              JSON.stringify({ name: current.spec.name, base: current.spec.base, styles: current.spec.styles }, null, 2),
              '要改就在这份规格上改，然后 action=set 覆盖（只有这一套）。',
            ].join('\n'),
          )
        }

        // 当前文档（可能没有）：写/删之后顺手把文档状态对齐，别留下"选不中的主题"
        const activeKey = store.activeKey(cwd, sessionId)
        const activeEntry = activeKey ? store.readIndex(cwd).docs[activeKey] : null
        const docPath = activeEntry ? store.resolveInCwd(cwd, activeEntry.path) : null

        if (action === 'clear') {
          const removed = clearCustomTheme(cwd)
          let reverted = false
          if (docPath && store.readState(cwd, activeKey)?.theme === CUSTOM_THEME_KEY) {
            store.updateMeta({ cwd, docPath, meta: { theme: 'default' } })
            reverted = true
          }
          return ok(
            removed
              ? `已移除自定义主题${reverted ? '；当前文档已退回「默认公众号」' : ''}。`
              : '本来就没有自定义主题，什么都没动。',
            activeKey || undefined,
          )
        }

        if (action !== 'set') return err(`未知 action：${action}（可用 set / show / clear）`)

        const built = writeCustomTheme({ cwd, spec: args.theme_spec })
        let switched = false
        if (docPath) {
          store.updateMeta({ cwd, docPath, meta: { theme: CUSTOM_THEME_KEY } })
          switched = true
        }
        const lines = [
          `已保存自定义主题「${built.spec.name}」（base=${built.spec.base}，改了 ${Object.keys(built.spec.styles).length} 个槽位）。`,
          switched
            ? '当前文档已切到它——面板里就能看到效果（预览与「复制到公众号」都走这套）。'
            : '面板的主题列表里会多出「自定义主题」这一项，选它即可。',
          '工作目录里只有这一套：再 set 一次就是覆盖，不会多出第二套。',
        ]
        for (const note of built.spec.notes) lines.push(`提示：${note}`)
        return ok(lines.join('\n'), activeKey || undefined)
      } catch (error) {
        return err(`fishpai_theme 失败：${error.message}`)
      }
    },
  })

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose()
      } catch {
        /* 卸载失败不影响其它工具 */
      }
    }
  }
}

export { diffBlocks }
