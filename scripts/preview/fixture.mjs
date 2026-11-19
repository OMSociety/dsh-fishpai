/**
 * README 面板的确定性演示文档与正式接口回包。
 * 公众号 HTML 由专业渲染管线生成，块清单与宿主路由使用同一切分函数。
 */
import { renderXiumi } from '../../plugin/core/xiumi/index.mjs'
import { hljsPreviewCss, themeCatalog } from '../../plugin/core/render.mjs'
import { colorPresets } from '../../plugin/core/runtime.mjs'
import { splitBlocks } from '../../plugin/core/markdown.mjs'

export const PREVIEW_KEY = 'preview'
export const PREVIEW_SESSION = 'preview'
export const PREVIEW_PATH = '/workspace/.fishpai/docs/preview.md'
export const PREVIEW_REVISION = 12
export const PREVIEW_UPDATED_AT = Date.parse('2026-11-18T08:00:00.000Z')

const PREVIEW_HERO = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400" role="img" aria-label="鱼排：让内容自成章法。层叠的文稿卡片展示从写作到排版的完整过程" style="display:block;width:100%;height:auto;margin:0 0 22px;border-radius:18px;">
  <rect width="640" height="400" rx="24" fill="#16223f"/>
  <circle cx="604" cy="34" r="94" fill="#203257" opacity="0.72"/>
  <circle cx="36" cy="390" r="116" fill="#1c2d51" opacity="0.8"/>
  <path d="M36 50 C43 36 59 33 72 40 L86 30 L82 50 L86 70 L72 60 C59 67 43 64 36 50 Z" fill="none" stroke="#8da7ff" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="55" cy="45" r="2.2" fill="#c9f2d8"/>
  <text x="102" y="57" fill="#dfe6ff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="14" font-weight="650" letter-spacing="3">FISHPAI</text>
  <text x="36" y="139" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="46" font-weight="720" letter-spacing="1">让内容</text>
  <text x="36" y="198" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="50" font-weight="760" letter-spacing="1">自成章法</text>
  <text x="36" y="238" fill="#bcc9e9" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="17">文稿、组件与交互，</text>
  <text x="36" y="264" fill="#bcc9e9" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="17">在一处成为完整的阅读作品。</text>
  <path d="M36 302H304" stroke="#3a4d73" stroke-width="1"/>
  <circle cx="42" cy="334" r="4" fill="#c9f2d8"/>
  <text x="54" y="339" fill="#e4eaff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="14">写作</text>
  <circle cx="132" cy="334" r="4" fill="#8da7ff"/>
  <text x="144" y="339" fill="#e4eaff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="14">排版</text>
  <circle cx="222" cy="334" r="4" fill="#ffd166"/>
  <text x="234" y="339" fill="#e4eaff" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif" font-size="14">发布</text>

  <rect x="404" y="88" width="174" height="224" rx="17" fill="#263a61" transform="rotate(8 491 200)"/>
  <rect x="382" y="78" width="180" height="230" rx="17" fill="#4162cb" transform="rotate(-7 472 193)"/>
  <rect x="374" y="92" width="190" height="226" rx="17" fill="#f4f7ff"/>
  <rect x="392" y="111" width="54" height="8" rx="4" fill="#7895f2"/>
  <circle cx="536" cy="115" r="6" fill="#b8e6ca"/>
  <rect x="392" y="141" width="124" height="12" rx="6" fill="#1b2c50"/>
  <rect x="392" y="162" width="92" height="12" rx="6" fill="#1b2c50"/>
  <rect x="392" y="192" width="140" height="6" rx="3" fill="#c7d2eb"/>
  <rect x="392" y="206" width="126" height="6" rx="3" fill="#c7d2eb"/>
  <rect x="392" y="228" width="140" height="48" rx="11" fill="#dce6ff"/>
  <path d="M446 253 C452 240 465 238 476 244 L488 236 L485 253 L488 270 L476 262 C465 268 452 266 446 253 Z" fill="#4162cb"/>
  <circle cx="461" cy="249" r="2" fill="#f4f7ff"/>
  <rect x="392" y="291" width="64" height="8" rx="4" fill="#6d88df"/>
  <rect x="342" y="250" width="54" height="54" rx="15" fill="#c9f2d8" transform="rotate(-10 369 277)"/>
  <path d="M356 277 L366 287 L383 266" fill="none" stroke="#17304a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M570 62V82 M560 72H580" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>
  <circle cx="350" cy="76" r="5" fill="#c9f2d8"/>
</svg>`

export const PREVIEW_MARKDOWN = `::: raw
${PREVIEW_HERO}
:::

好的排版，让**观点、节奏与细节各就其位**。

鱼排把文稿、组件和预览放进同一个工作台，从落笔开始，就给内容清晰的结构。

## 从空白，到清晰的结构

::: number_steps
- **先写下内容。** 标题、段落与批注，都在同一份文稿里。
- **再组织阅读。** 用组件安排重点与节奏，而不是堆叠样式。
- **最后抵达读者。** 预览、复制与草稿发布，共用同一份结果。
:::

::: quote
让工具处理复杂，让阅读保持简单。
:::

## 把细节，藏在恰好的位置

::: expand
展开看看：一篇文章如何被组织
---
正文保持轻盈，补充说明与技术细节收进展开组件。需要时点开，阅读节奏依然由你掌握。
:::

::: progress
100 预览与发布内容同源
:::

::: gradient_banner
把复杂留给工具，把清晰留给读者
:::

*这篇专题稿与主视觉用于展示鱼排的正式专业渲染结果。*`

const PREVIEW_TITLE = '让内容自成章法：鱼排排版工作台'

const PREVIEW_SPEC = {
  title_color: '#17213a',
  title_size: 24,
  title_align: 'left',
  body_color: '#4a5365',
  body_size: 15,
  line_height: 1.85,
  card_bg: '#f2f5fb',
  card_radius: 12,
  card_padding: 16,
  accent: '#3f63d7',
  accent2: '#8ba8f2',
}

function publicBlocks(markdown) {
  return splitBlocks(markdown).map((block) => ({
    index: block.index,
    id: block.id,
    kind: block.kind,
    variant: block.variant,
    lang: block.lang,
    level: block.level,
    headingPath: block.headingPath,
    startLine: block.startLine,
    endLine: block.endLine,
    hash: block.hash,
    preview: block.text.split('\n')[0].slice(0, 60),
  }))
}

export function createPreviewFixture() {
  const key = PREVIEW_KEY
  const path = PREVIEW_PATH
  const revision = PREVIEW_REVISION
  const updatedAt = PREVIEW_UPDATED_AT
  const markdown = PREVIEW_MARKDOWN
  const meta = {
    theme: 'default',
    color: null,
    font: 'sans',
    fontSize: '16px',
    footnotes: true,
    macCodeBlock: true,
    mobile: true,
    target: 'xiumi',
  }
  const blocks = publicBlocks(markdown)
  const notes = []
  const placeholders = []
  const images = []
  const history = [
    { id: 'preview-r12', rev: revision, at: updatedAt, by: 'human', chars: markdown.length, label: '演示文稿' },
  ]
  const docEntry = { key, path, title: PREVIEW_TITLE, revision, updatedAt }
  const rendered = renderXiumi(markdown, { spec: PREVIEW_SPEC })

  return {
    key,
    sessionId: PREVIEW_SESSION,
    markdown,
    meta,
    themes: {
      themes: themeCatalog(),
      presets: colorPresets(),
      fonts: ['sans', 'serif', 'mono'],
      sizes: ['14px', '15px', '16px', '17px', '18px'],
    },
    state: {
      cwd: '/workspace',
      active: { key, path, title: PREVIEW_TITLE, revision, theme: meta.theme },
      openRequest: null,
      docs: [docEntry],
    },
    doc: {
      doc: { ...docEntry, markdown, updatedBy: 'human', baseline: null },
      meta,
      blocks,
      notes,
      placeholders,
      images,
      history,
    },
    render: {
      mode: 'preview',
      ...rendered,
      hljsCss: hljsPreviewCss(),
      linkCount: 0,
      hasCode: false,
      blocks,
      notes,
      placeholders,
      images,
    },
  }
}
