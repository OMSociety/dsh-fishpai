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
 *
 * 另有一层版本兜底：0.1.7 起这套图标的导出名整体改了拼写（去尺寸后缀、改字重后缀），
 * 所以调用点写**稳定名**、运行时按对照表找两代拼写（见 `icon-names.ts`），
 * 一份 bundle 在两代宿主上都画得出图标。
 */
import * as React from 'react'
import { resolveIconExport } from './icon-names'

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

/** 按稳定名取一个内置图标（两代导出拼写都认，见 `icon-names.ts`）；没有就返回 null，由调用方降级成纯文字。 */
function builtin(name: string, props: GlyphProps, fallbackSize: number): React.ReactElement | null {
  const Icon = resolveIconExport(PRIMITIVES, name)
  if (!Icon) return null
  return <Icon size={props.size ?? fallbackSize} className={props.className} />
}

/**
 * 鱼排的标：一条侧视的鱼——圆头、带缺口的尾鳍、一只眼睛。
 *
 * **与包根目录的 `icon.svg` 逐字相同的路径与描边**，内联渲染。插件列表的磁贴是同一个
 * 文件的 `<img>` 版本（宿主读成 data URI、那份不能走 `currentColor`）。
 *
 * 全仓库**只有这一处几何**：右侧栏的标签页、引导列表、回退标签页，以及面板内空白页
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
 * 每套主题各自的图标，值是 `@deepseek-ai/dsh-client-ui-primitives` 的**稳定名**
 * （两代导出拼写的对照与解析见 `icon-names.ts`）。
 *
 * 加主题时在这里补一行（新图标名还要去 `icon-names.ts` 补对照）；
 * `test/theme-info.test.mjs` 会检查"每套主题都有图标"，
 * 漏了会红（主题列表退化成没有图标也能用，但不该悄悄漏）。
 */
const THEME_GLYPH: Record<string, string> = {
  default: 'IconListPenOutline16', // 排版：默认公众号就是给微信做的那套
  elegant: 'IconSparkle16', // 优雅简约
  deep_read: 'IconThinkOutline16', // 深度阅读
  nyt: 'IconBrowseOutline16', // 纽约时报（版面）
  apple: 'IconLightOutline16', // Apple 极简（明亮、留白）
  claude: 'IconAgentPresetOutline16', // Claude（对话助手）
  sspai: 'IconPersonalizationOutline16', // 少数派（个性）
  bamboo: 'IconBranchOutline16', // 竹林（枝叶）
  tech: 'IconCodeOutline16', // 技术风格（代码）
  dark_night: 'IconDarkOutline16', // 暗夜模式
  gradient: 'IconEnhanceOutline16', // 渐变彩虹（增色）
  // 「自定义主题」：工作目录里那**一套**模型生成的主题，图标固定这一个。
  // 为什么不让模型挑：合法图标名的名单只在浏览器这半（`icon-names.ts` 的对照表），而校验器在宿主那半——
  // 让模型选就得在宿主再抄一份、跟着 DSH 升级维护，抄漏一个的后果是"图标静默消失且不报错"。
  custom: 'IconEditOutline16',
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
