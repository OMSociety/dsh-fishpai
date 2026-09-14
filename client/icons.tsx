/**
 * 图标：鱼排自己的鱼形标 + DSH 内置图标集。
 *
 * 为什么主题图标用 DSH 自带的那一套（`@deepseek-ai/dsh-client-ui-primitives`）：
 *   - 它是 **shell 的基线模块**（与 `react` 同级：任何客户端 bundle 都能 require，不需要
 *     在 `dsh.client.inject` 里声明包依赖边）——右侧栏自己画图标用的就是它；
 *   - 于是鱼排的图标与内置面板天然同一套画法（16px 网格、约 1.1 描边、`currentColor`），
 *     **浅色/深色主题自动跟随，不需要准备两套图**；
 *   - 不必引入任何第三方图标依赖（Lucide / Tabler 那一类也用不上）。
 *
 * 兜底：万一某个 DSH 版本没提供这个模块，插件不能因此整块加载不了 ——
 * 取不到就退回"自绘的鱼形标 + 纯文字"，主题列表少几个图标而已，功能不受影响。
 */
import * as React from 'react'

// 客户端 bundle 是 CJS 形态的 factory(require)，这里的 require 由模块表提供（见 scripts/build-client.mjs）。
declare function require(id: string): any

export interface GlyphProps {
  size?: number
  className?: string
}

function loadPrimitives(): Record<string, any> {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') || {}
  } catch {
    return {}
  }
}

const PRIMITIVES = loadPrimitives()

/** 按导出名取一个内置图标；没有就返回 null，由调用方降级成纯文字。 */
function builtin(name: string, props: GlyphProps, fallbackSize: number): React.ReactElement | null {
  const Icon = PRIMITIVES[name]
  if (typeof Icon !== 'function') return null
  return <Icon size={props.size ?? fallbackSize} className={props.className} />
}

/**
 * 鱼排的标：一条侧视的鱼——圆头、带缺口的尾鳍、一只眼睛。
 *
 * 16px 网格手绘，描边口径与 DSH 内置图标一致；颜色走 `currentColor`，
 * 所以白天/黑暗模式、禁用态、悬停态都自动跟着走。
 */
export function FishGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.1 8C3.2 5.6 5.4 4.1 8.2 4.1C10.1 4.1 11.5 5 12.4 6.2L14.6 4.4L13.3 8L14.6 11.6L12.4 9.8C11.5 11 10.1 11.9 8.2 11.9C5.4 11.9 3.2 10.4 2.1 8Z"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="4.9" cy="7.2" r="0.75" fill="currentColor" />
    </svg>
  )
}

/**
 * 13 套主题各自的图标，值是 `@deepseek-ai/dsh-client-ui-primitives` 的导出名。
 *
 * 加主题时在这里补一行即可；`test/theme-info.test.mjs` 会检查"每套主题都有图标"，
 * 漏了会红（主题列表退化成没有图标也能用，但不该悄悄漏）。
 */
const THEME_GLYPH: Record<string, string> = {
  default: 'IconListPenOutline16', // 排版：默认公众号就是给微信做的那套
  elegant: 'IconSparkle16', // 优雅简约
  deep_read: 'IconThinkOutline16', // 深度阅读
  nyt: 'IconBrowseOutline16', // 纽约时报（版面）
  ft: 'IconGaugeOutline16', // 金融时报（行情）
  medium: 'IconEditOutline16', // Medium（长文写作）
  apple: 'IconLightOutline16', // Apple 极简（明亮、留白）
  claude: 'IconAgentPresetOutline16', // Claude（对话助手）
  sspai: 'IconPersonalizationOutline16', // 少数派（个性）
  bamboo: 'IconBranchOutline16', // 竹林（枝叶）
  tech: 'IconCodeOutline16', // 技术风格（代码）
  dark_night: 'IconDarkOutline16', // 暗夜模式
  gradient: 'IconEnhanceOutline16', // 渐变彩虹（增色）
}

/** 某套主题的图标（取不到内置图标时为 null，调用方直接不画）。 */
export function ThemeGlyph({ themeKey, size = 16, className }: GlyphProps & { themeKey: string }) {
  return builtin(THEME_GLYPH[themeKey] || '', { size, className }, 16)
}

/** 下拉箭头：内置 `IconChevronDownOutline14`，没有就退回字符。 */
export function CaretGlyph({ size = 14, className }: GlyphProps) {
  return builtin('IconChevronDownOutline14', { size, className }, 14) ?? <span className={className}>▾</span>
}

/** 选中勾：内置 `IconCheckOutline14`，没有就退回字符。 */
export function TickGlyph({ size = 14, className }: GlyphProps) {
  return builtin('IconCheckOutline14', { size, className }, 14) ?? <span className={className}>✓</span>
}
