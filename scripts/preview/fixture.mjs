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

export const PREVIEW_MARKDOWN = `# 鱼排 FishPai：把公众号排版台搬进 DSH

在右侧栏完成改稿、组件排版与公众号预览，AI 能读懂人的每一处修改。

**专业管线**把 Markdown 文稿与交互组件组合成公众号 HTML，复制或保存草稿都使用同一份产物。

::: gradient_banner
从 Markdown 到公众号，一份文稿走完整条排版链
:::

## 内容按阅读节奏展开

::: expand
点我展开详情
---
补充说明、进阶阅读和技术细节可以收进展开组件，正文继续保持清晰。
:::

## 本周文稿进度

::: progress
86 编辑与校对
:::

::: compare
**写作者专注内容**

文稿、批注与块级修改留在同一个工作流里。
---
**读者获得清晰节奏**

标题、展开组件与进度信息组成易读的版面。
:::
`

const PREVIEW_TITLE = '鱼排 FishPai：把公众号排版台搬进 DSH'

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
  const rendered = renderXiumi(markdown)

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
