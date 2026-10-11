/**
 * 图标：鱼排自己的鱼形标 + 主题/控件用的内联几何。
 *
 * 主题图标**不再** require 宿主的 `@deepseek-ai/dsh-client-ui-primitives`：rc2 官方在
 * `cordis-plugin-development/references/practices.md` 里明文禁止客户端 bundle 把 Harness
 * Client 包当模块加载（"They change without notice, a plain-JS plugin has no type check,
 * and a throwing component blanks your slot entry"），替代做法是把 primitive 的标记复制进插件。
 * 几何就在 `theme-icons.tsx`，全部走 `currentColor`，浅色/深色主题自动跟随。
 *
 * 于是 bundle 的 require 只剩 `react` / `react/jsx-runtime`（shell 的基线种子模块），
 * 宿主升级改名影响不到这里；代价是几何要自己维护（见 `NOTICE.md` 的许可与来源记录）。
 */
import * as React from 'react'
import {
  AgentPresetGlyph,
  BranchGlyph,
  BrowseGlyph,
  CheckGlyph,
  ChevronDownGlyph,
  CodeGlyph,
  DarkGlyph,
  EditGlyph,
  EnhanceGlyph,
  LightGlyph,
  ListPenGlyph,
  PersonalizationGlyph,
  SparkleGlyph,
  ThinkGlyph,
} from './theme-icons'

export interface GlyphProps {
  size?: number
  className?: string
}

/**
 * 鱼排的标：一条侧视的鱼——圆头、带缺口的尾鳍、一只眼睛。
 *
 * **与包根目录的 `icon.svg` 逐字相同的路径与描边**，内联渲染。插件列表的磁贴是同一个
 * 文件的 `<img>` 版本（宿主读成 data URI、那份不能走 `currentColor`）。
 *
 * 全仓库**只有这一处几何**：右侧栏的标签页、引导列表，以及面板内空白页
 * 卡片的品牌行，都用它。**改 `icon.svg` 就回来改这里**，别处没有第二份要对齐。
 *
 * 两处差异只因为取景与取色：36 画板的图形只占 53%，直接缩到 16px 会比旁边的图标瘦
 * 一圈，所以放大 1.3 倍；而宿主在侧边栏读不到主题上下文，所以这里自带渐变——这是
 * 「界面图标颜色只走 `currentColor`」那条纪律的**例外**，渐变 id 因此带上插件前缀，
 * 免得同一页里与别的标撞车。
 */
export function FishMark({ size = 16, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="dsh-fishpai-mark" x1="7" y1="10" x2="29" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7FA0FF" />
          <stop offset="1" stopColor="#3B54C9" />
        </linearGradient>
      </defs>
      <g transform="translate(18 18) scale(1.3) translate(-18 -18)">
        <path
          d="M7.5 18C9.348 13.56 13.044 10.785 17.748 10.785C20.94 10.785 23.292 12.45 24.804 14.67L28.5 11.34L26.316 18L28.5 24.66L24.804 21.33C23.292 23.55 20.94 25.215 17.748 25.215C13.044 25.215 9.348 22.44 7.5 18Z"
          stroke="url(#dsh-fishpai-mark)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="12.2" cy="16.5" r="1.3" fill="url(#dsh-fishpai-mark)" />
      </g>
    </svg>
  )
}

/**
 * 每套主题各自的图标，值是 `theme-icons.tsx` 里导出的内联几何组件。
 *
 * 加主题时在这里补一行；`test/theme-info.test.mjs` 会检查"每套主题都有图标"，
 * `test/theme-icons.test.mjs` 会核对这些组件真能渲染出 `<svg>`，漏了会红。
 */
const THEME_GLYPH: Record<string, React.ComponentType<GlyphProps>> = {
  default: ListPenGlyph, // 排版：默认公众号就是给微信做的那套
  elegant: SparkleGlyph, // 优雅简约
  deep_read: ThinkGlyph, // 深度阅读
  nyt: BrowseGlyph, // 纽约时报（版面）
  apple: LightGlyph, // Apple 极简（明亮、留白）
  claude: AgentPresetGlyph, // Claude（对话助手）
  sspai: PersonalizationGlyph, // 少数派（个性）
  bamboo: BranchGlyph, // 竹林（枝叶）
  tech: CodeGlyph, // 技术风格（代码）
  dark_night: DarkGlyph, // 暗夜模式
  gradient: EnhanceGlyph, // 渐变彩虹（增色）
  // 「自定义主题」：工作目录里那**一套**模型生成的主题，图标固定这一个。
  custom: EditGlyph,
}

/** 某套主题的图标。 */
export function ThemeGlyph({ themeKey, size = 16, className }: GlyphProps & { themeKey: string }) {
  const Icon = THEME_GLYPH[themeKey]
  if (!Icon) return null
  return <Icon size={size} className={className} />
}

/** 下拉箭头。 */
export function CaretGlyph({ size = 14, className }: GlyphProps) {
  return <ChevronDownGlyph size={size} className={className} />
}

/** 选中勾。 */
export function TickGlyph({ size = 14, className }: GlyphProps) {
  return <CheckGlyph size={size} className={className} />
}
