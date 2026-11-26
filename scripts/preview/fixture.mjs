/**
 * README 面板的确定性演示文档与正式接口回包。
 * `docs/preview/preview-article.md` 是演示文稿唯一来源；公众号 HTML 由专业渲染管线生成，
 * 块清单与宿主路由使用同一切分函数。
 */
import { readFileSync } from 'node:fs'
import { renderProfessional, normalizeSpec } from '../../plugin/core/professional/index.mjs'
import { hljsPreviewCss, themeCatalog } from '../../plugin/core/render.mjs'
import { colorPresets } from '../../plugin/core/runtime.mjs'
import { splitBlocks } from '../../plugin/core/markdown.mjs'
import { toWechatDark } from '../../plugin/core/dark-preview.mjs'

export const PREVIEW_KEY = 'preview'
export const PREVIEW_SESSION = 'preview'
export const PREVIEW_PATH = '/workspace/.fishpai/docs/preview.md'
export const PREVIEW_REVISION = 12
export const PREVIEW_UPDATED_AT = Date.parse('2026-11-18T08:00:00.000Z')

// 演示 Markdown 统一使用 LF，保证 Windows 与 CI 生成同一份 fixture。
const PREVIEW_ARTICLE = readFileSync(
  new URL('../../docs/preview/preview-article.md', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')

// 头图品牌标取 icon.svg 的 path / circle 几何，以渐变首色填涂（公众号正文不保留 id 引用），只按文字高度做整体缩放与对位。
function previewBrandMark() {
  const icon = readFileSync(new URL('../../icon.svg', import.meta.url), 'utf8')
  const color = icon.match(/<stop stop-color="(#[0-9A-Fa-f]{6})"/)?.[1]
  const shapes = ['path', 'circle'].map((tag) => icon.match(new RegExp(`^\\s*<${tag}\\b.*\\/>$`, 'm'))?.[0].trim())
  if (!color || shapes.some((shape) => !shape)) throw new Error('icon.svg 缺少品牌渐变首色或鱼标 path / circle')
  const solid = shapes.map((shape) => shape.replace(/url\(#[\w-]+\)/g, color))
  return `<g fill="none" transform="translate(30 17) scale(1.8)">${solid.join('')}</g>`
}

const BRAND_PLACEHOLDER = '<!-- FISHPAI_BRAND -->'
if (!PREVIEW_ARTICLE.includes(BRAND_PLACEHOLDER)) throw new Error('演示文稿缺少品牌鱼标占位')
export const PREVIEW_MARKDOWN = PREVIEW_ARTICLE.replace(BRAND_PLACEHOLDER, previewBrandMark()).trimEnd()

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
    target: 'professional',
    professionalSpec: normalizeSpec(PREVIEW_SPEC),
  }
  const blocks = publicBlocks(markdown)
  const notes = []
  const placeholders = []
  const images = []
  const history = [
    { id: 'preview-r12', rev: revision, at: updatedAt, by: 'human', chars: markdown.length, label: '演示文稿' },
  ]
  const docEntry = { key, path, title: PREVIEW_TITLE, revision, updatedAt }
  const rendered = renderProfessional(markdown, { spec: meta.professionalSpec })

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
      darkHtml: toWechatDark(rendered.html),
      linkCount: 0,
      hasCode: false,
      blocks,
      notes,
      placeholders,
      images,
    },
  }
}
