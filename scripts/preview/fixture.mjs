/**
 * README 面板的确定性演示文档与正式接口回包。
 * 公众号 HTML 由专业渲染管线生成，块清单与宿主路由使用同一切分函数。
 */
import { readFileSync } from 'node:fs'
import { renderXiumi, normalizeSpec } from '../../plugin/core/xiumi/index.mjs'
import { hljsPreviewCss, themeCatalog } from '../../plugin/core/render.mjs'
import { colorPresets } from '../../plugin/core/runtime.mjs'
import { splitBlocks } from '../../plugin/core/markdown.mjs'

export const PREVIEW_KEY = 'preview'
export const PREVIEW_SESSION = 'preview'
export const PREVIEW_PATH = '/workspace/.fishpai/docs/preview.md'
export const PREVIEW_REVISION = 12
export const PREVIEW_UPDATED_AT = Date.parse('2026-11-18T08:00:00.000Z')

const FISHPAI_ICON = readFileSync(new URL('../../icon.svg', import.meta.url), 'utf8')
const PREVIEW_HERO = readFileSync(new URL('../../docs/preview/hero.svg', import.meta.url), 'utf8')
  .replace('__FISHPAI_ICON_BASE64__', Buffer.from(FISHPAI_ICON).toString('base64'))
  .trim()
const PREVIEW_PROCESS = readFileSync(new URL('../../docs/preview/process.svg', import.meta.url), 'utf8').trim()

export const PREVIEW_MARKDOWN = `:::raw
<section style="margin:0 -20px 30px;line-height:0;">${PREVIEW_HERO}</section>
:::

# 把内容，排成作品

好的排版先建立秩序，再表达个性。**观点、素材与阅读节奏**，都应该有清楚的位置。

鱼排把文稿、自由画布和复制放进同一个工作台：写作者专注于内容，工具负责把结构完整地带到公众号。

:::raw
<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:26px 0 34px;">
  <tr>
    <td style="vertical-align:top;padding:14px 12px 12px 0;border-top:2px solid #17213a;">
      <div style="font-size:24px;line-height:1.2;font-weight:750;color:#2f4fc1;">01</div>
      <div style="margin-top:8px;font-size:14px;line-height:1.6;font-weight:700;color:#17213a;">写下内容</div>
    </td>
    <td style="vertical-align:top;padding:14px 12px 12px;border-top:2px solid #17213a;">
      <div style="font-size:24px;line-height:1.2;font-weight:750;color:#2f4fc1;">02</div>
      <div style="margin-top:8px;font-size:14px;line-height:1.6;font-weight:700;color:#17213a;">组织阅读</div>
    </td>
    <td style="vertical-align:top;padding:14px 0 12px 12px;border-top:2px solid #17213a;">
      <div style="font-size:24px;line-height:1.2;font-weight:750;color:#2f4fc1;">03</div>
      <div style="margin-top:8px;font-size:14px;line-height:1.6;font-weight:700;color:#17213a;">抵达读者</div>
    </td>
  </tr>
</table>
:::

:::chapter_header
01
先建立秩序
一份文稿，承载完整的编辑过程
:::

写作、批注与修改都落在同一份 Markdown 上。正文保持可编辑，组件负责重复结构，独特画面则在自由画布中完成。

:::info_card
@一份文稿，三种输出
手机预览用于阅读确认，复制到剪贴板用于粘贴，导出 HTML 用于归档与进一步加工。
:::

:::raw
<section style="margin:24px 0 10px;padding:10px 8px 0;background-color:#ffffff;border:1px solid #e2e5ec;line-height:0;">
  ${PREVIEW_PROCESS}
</section>
<p style="margin:0;padding:0 12px 16px;background-color:#ffffff;color:#475467;font-size:13px;line-height:1.7;letter-spacing:0.5px;">从内容源到结构化排版，再到公众号成品，整条链路共享同一份文稿。</p>
:::

:::highlight
**写作、预览与复制，共享同一份内容**
:::

:::chapter_header
02
让视觉服务内容
自由画布不是装饰的堆叠
而是信息的另一种组织方式
:::

:::raw
<section style="margin:22px 0 14px;">
  <section style="width:90%;padding:18px;box-sizing:border-box;background-color:#17213a;color:#ffffff;">
    <div style="font-size:12px;line-height:1.5;letter-spacing:2px;color:#b8c7f5;">QUESTION</div>
    <div style="margin-top:8px;font-size:19px;line-height:1.55;font-weight:750;">什么时候需要自由画布？</div>
  </section>
  <section style="width:90%;margin:12px 0 0 auto;padding:18px;box-sizing:border-box;background-color:#ffffff;border:1px solid #dfe3ea;">
    <div style="font-size:12px;line-height:1.5;letter-spacing:2px;color:#2f4fc1;">ANSWER</div>
    <div style="margin-top:8px;font-size:15px;line-height:1.85;color:#344054;">当素材、层级或交互本身就是内容的一部分。照片、标识、艺术字与 SVG 可以自由组合，正文依然保持清晰。</div>
  </section>
</section>
:::

:::expand
展开看看：一篇专题稿如何被组织
---
**主视觉**建立主题，**章节头**划分阅读节奏，**信息卡**收拢时间与地点，**展开组件**承载补充细节。每一层都服务于阅读目标。
:::

:::chapter_header
03
从画布到剪贴板
同一份文稿，交给下一个编辑场景
:::

鱼排把同一份文稿渲染为内联样式 HTML，复制到剪贴板后即可带入目标编辑器。工具处理结构，作者把精力留给内容与视觉判断。

:::raw
<section style="margin:30px -20px 0;padding:30px 20px 26px;background-color:#2f4fc1;color:#ffffff;">
  <div style="font-size:26px;line-height:1.5;font-weight:750;letter-spacing:1px;">让工具处理复杂，<br>让阅读保持清晰。</div>
  <div style="width:44px;height:4px;margin:20px 0;background-color:#f4d35e;"></div>
  <div style="font-size:13px;line-height:1.8;color:#dce4ff;letter-spacing:1px;">FISHPAI · 公众号排版工作台</div>
</section>
:::

:::credits
文稿｜鱼排编辑部
视觉｜原创 SVG 与品牌图形
:::`

const PREVIEW_TITLE = '把内容，排成作品：鱼排排版工作台'

const PREVIEW_SPEC = {
  page_bg: '#f6f5f2',
  page_padding_x: 20,
  page_padding_y: 0,
  title_color: '#17213a',
  title_size: 30,
  title_align: 'left',
  body_color: '#344054',
  body_size: 15,
  body_align: 'left',
  body_spacing: 0.6,
  line_height: 1.85,
  muted_color: '#667085',
  card_bg: '#ffffff',
  card_radius: 0,
  card_padding: 20,
  accent: '#2f4fc1',
  accent2: '#17213a',
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
    xiumiSpec: normalizeSpec(PREVIEW_SPEC),
  }
  const blocks = publicBlocks(markdown)
  const notes = []
  const placeholders = []
  const images = []
  const history = [
    { id: 'preview-r12', rev: revision, at: updatedAt, by: 'human', chars: markdown.length, label: '演示文稿' },
  ]
  const docEntry = { key, path, title: PREVIEW_TITLE, revision, updatedAt }
  const rendered = renderXiumi(markdown, { spec: meta.xiumiSpec })

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
