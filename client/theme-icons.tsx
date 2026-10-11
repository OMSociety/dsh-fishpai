/**
 * 主题图标的几何：**复制**自 DSH 内建图标集 `@deepseek-ai/dsh-client-ui-primitives`
 * （0.2.0-rc.2，MIT，© 2026 DeepSeek —— 见 `NOTICE.md`）。
 *
 * 为什么不直接 `require` 那个包：rc2 官方在 `cordis-plugin-development/references/practices.md`
 * 里明文禁止客户端 bundle 把 Harness Client 包当模块加载（"They change without notice, a plain-JS
 * plugin has no type check, and a throwing component blanks your slot entry"），并给出替代做法：
 * 把 primitive 的标记与行为复制进插件。这个文件就是那一步。
 *
 * 于是 bundle 的 require 只剩 `react` / `react/jsx-runtime`（shell 的基线种子模块），
 * 宿主升级改名也影响不到这里。代价是几何要自己维护：**改这些路径要回来改这里**。
 *
 * **自动守卫只守结构与接线**（`test/theme-icons.test.mjs`：14 支都导出、都是 16 画板、
 * 图形非空、颜色走 `currentColor`、路径真进了产物）。它**守不住几何内容本身**——把某条
 * 路径的数字改错、或整条换成别的形状，测试照样绿。改这里的几何必须回到 rc2 的
 * `@deepseek-ai/dsh-client-ui-primitives` 逐字比对（见 `NOTICE.md` 的来源记录），
 * 改完 `npm run build` 并提交 `lib/client.js`。
 *
 * 全部走 `currentColor`：浅色/深色主题自动跟随，不需要准备两套图。
 */

interface GlyphProps {
  size?: number
  className?: string
}

interface ArtworkProps extends GlyphProps {
  strokeWidth?: number
}

/** `IconAgentPresetOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function AgentPresetGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M6.51867 12.3282C7.29816 12.6011 8.16475 12.6514 9.02269 12.4216C9.57879 12.2726 10.0784 12.0185 10.5087 11.6888C10.7819 12.0555 11.1606 12.3304 11.5913 12.4805C10.9688 13.029 10.2149 13.4478 9.35911 13.6771C8.13946 14.0038 6.90632 13.8971 5.82126 13.4533C6.15821 13.1562 6.4021 12.7652 6.51867 12.3282ZM9.17629 2.89409C11.1101 3.34433 12.739 4.81872 13.2889 6.87043C13.4219 7.3665 13.4811 7.8649 13.4774 8.35466C13.0924 8.13213 12.6422 8.01837 12.1741 8.05276L12.1711 8.05257C12.1539 7.77199 12.109 7.48889 12.0334 7.20684C11.6363 5.72533 10.5048 4.6372 9.13549 4.22844C9.25559 3.87667 9.29214 3.49087 9.22309 3.09892C9.2108 3.02922 9.19451 2.96108 9.17629 2.89409ZM4.7311 3.89107L4.78302 4.11879C4.87648 4.4488 5.04146 4.74263 5.25579 4.98896C3.98078 6.01355 3.35848 7.72904 3.8089 9.41059C3.81828 9.44559 3.82866 9.48025 3.83885 9.51479C3.38217 9.61268 2.98548 9.84137 2.68107 10.1556C2.63414 10.022 2.5897 9.88632 2.55244 9.74726C1.93301 7.43489 2.86717 5.07173 4.71504 3.76697L4.7311 3.89107Z" fill="currentColor" />
      <path d="M7.99136 5.28105C8.87501 5.28105 9.59136 4.56471 9.59136 3.68105C9.59136 2.7974 8.87501 2.08105 7.99136 2.08105C7.1077 2.08105 6.39136 2.7974 6.39136 3.68105C6.39136 4.56471 7.1077 5.28105 7.99136 5.28105Z" stroke="currentColor" />
      <path d="M3.94009 12.9417C4.82374 12.9417 5.54009 12.2254 5.54009 11.3417C5.54009 10.458 4.82374 9.7417 3.94009 9.7417C3.05643 9.7417 2.34009 10.458 2.34009 11.3417C2.34009 12.2254 3.05643 12.9417 3.94009 12.9417Z" stroke="currentColor" />
      <path d="M12.0851 12.9417C12.9688 12.9417 13.6851 12.2254 13.6851 11.3417C13.6851 10.458 12.9688 9.7417 12.0851 9.7417C11.2015 9.7417 10.4851 10.458 10.4851 11.3417C10.4851 12.2254 11.2015 12.9417 12.0851 12.9417Z" stroke="currentColor" />
    </svg>
  )
}

/** `IconBranchOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function BranchGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564" stroke="currentColor" />
      <path d="M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944" stroke="currentColor" />
      <circle cx="12.4502" cy="3.3079" r="1.56962" stroke="currentColor" />
      <circle cx="12.4502" cy="12.6921" r="1.56962" stroke="currentColor" />
    </svg>
  )
}

/** `IconBrowseOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function BrowseGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M4.9375 5.90295H11.0625" stroke="currentColor" />
      <path d="M4.9375 9.02991H8.27841" stroke="currentColor" />
      <path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z" fill="currentColor" />
    </svg>
  )
}

/** `IconCheckOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function CheckGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4" stroke="currentColor" />
    </svg>
  )
}

/** `IconChevronDownOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function ChevronDownGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor" />
    </svg>
  )
}

/** `IconCodeOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function CodeGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M6.27612 1.5L4.52612 14.5" stroke="currentColor" />
      <path d="M11.4739 1.5L9.72388 14.5" stroke="currentColor" />
      <path d="M2.39868 5.5H14.0681" stroke="currentColor" />
      <path d="M1.93188 10.5H13.6013" stroke="currentColor" />
    </svg>
  )
}

/** `IconDarkOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function DarkGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M14.1127 8.70663C14.2576 8.60602 14.4627 8.71355 14.4386 8.88834C14.2901 9.96567 13.8731 10.9912 13.2229 11.8692C12.479 12.8735 11.4613 13.6421 10.2917 14.0829C9.1222 14.5236 7.85038 14.6179 6.62865 14.3543C5.40692 14.0907 4.28709 13.4805 3.40332 12.5967C2.51955 11.7129 1.90931 10.5931 1.64572 9.37135C1.38212 8.14962 1.47635 6.87779 1.91711 5.70825C2.35787 4.5387 3.12647 3.52103 4.13083 2.77714C5.00878 2.12689 6.03433 1.70994 7.11166 1.5614C7.28645 1.5373 7.39397 1.74238 7.29337 1.88734C6.68703 2.76099 6.37885 3.81241 6.42313 4.88345C6.47392 6.11194 6.98471 7.27645 7.85413 8.14587C8.72355 9.01529 9.88805 9.52608 11.1166 9.57687C12.1876 9.62114 13.239 9.31296 14.1127 8.70663Z" stroke="currentColor" />
    </svg>
  )
}

/** `IconEditOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function EditGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z" fill="currentColor" />
      <path d="M7.7849 8.23878L13.888 2.13574" stroke="currentColor" />
    </svg>
  )
}

/** `IconEnhanceOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function EnhanceGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M1.98486 2.95374H14.0151" stroke="currentColor" />
      <path d="M1.98486 6.31787H14.0151" stroke="currentColor" />
      <path d="M1.98486 9.68213H14.0151" stroke="currentColor" />
      <path d="M1.98486 13.0463H8.4627" stroke="currentColor" />
    </svg>
  )
}

/** `IconLightOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function LightGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M8.00007 11.8117C10.1052 11.8117 11.8117 10.1052 11.8117 8.00007C11.8117 5.89499 10.1052 4.18848 8.00007 4.18848C5.89499 4.18848 4.18848 5.89499 4.18848 8.00007C4.18848 10.1052 5.89499 11.8117 8.00007 11.8117Z" stroke="currentColor" />
      <path d="M13.3899 8H15.1499" stroke="currentColor" />
      <path d="M11.8115 11.8115L13.0556 13.0556" stroke="currentColor" />
      <path d="M8 13.3901V15.1501" stroke="currentColor" />
      <path d="M4.18868 11.8115L2.94458 13.0556" stroke="currentColor" />
      <path d="M2.6101 8H0.850098" stroke="currentColor" />
      <path d="M4.18868 4.18856L2.94458 2.94446" stroke="currentColor" />
      <path d="M8 2.6101V0.850098" stroke="currentColor" />
      <path d="M11.8115 4.18856L13.0556 2.94446" stroke="currentColor" />
    </svg>
  )
}

/** `IconListPenOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function ListPenGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M4.9375 5.90295H11.0625" stroke="currentColor" />
      <path d="M4.9375 9.02991H8.27841" stroke="currentColor" />
      <path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z" fill="currentColor" />
      <path d="M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z" fill="currentColor" />
      <path d="M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z" fill="currentColor" />
    </svg>
  )
}

/** `IconPersonalizationOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function PersonalizationGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M3.25 7.16357C3.20417 7.32247 3.17778 7.48993 3.17773 7.66357C3.17773 7.83698 3.20336 8.00486 3.24902 8.16357H1.85742V7.16357H3.25ZM14.1426 8.16357H6.71484C6.76052 8.00485 6.78613 7.837 6.78613 7.66357C6.78609 7.48991 6.75971 7.32249 6.71387 7.16357H14.1426V8.16357Z" fill="currentColor" />
      <path d="M9.1377 11.9092C9.08596 12.0666 9.05668 12.2344 9.05664 12.4092C9.05664 12.5838 9.08606 12.7518 9.1377 12.9092H1.85742V11.9092H9.1377ZM14.1426 12.9092H12.1816C12.2332 12.7519 12.2617 12.5838 12.2617 12.4092C12.2617 12.2345 12.2333 12.0666 12.1816 11.9092H14.1426V12.9092Z" fill="currentColor" />
      <path d="M9.1123 3.09106C9.06138 3.24865 9.03324 3.41653 9.0332 3.59106C9.0332 3.76549 9.06148 3.93355 9.1123 4.09106H1.85742V3.09106H9.1123ZM14.1426 4.09106H12.207C12.2578 3.93358 12.2861 3.76545 12.2861 3.59106C12.2861 3.41657 12.2579 3.24862 12.207 3.09106H14.1426V4.09106Z" fill="currentColor" />
      <circle cx="4.97065" cy="7.66401" r="1.35151" stroke="currentColor" />
      <circle cx="10.6596" cy="12.4091" r="1.35151" stroke="currentColor" />
      <circle cx="10.6596" cy="3.59101" r="1.35151" stroke="currentColor" />
    </svg>
  )
}

/** `IconSparkleRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function SparkleGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z" stroke="currentColor" />
      <path d="M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z" stroke="currentColor" />
      <path d="M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z" stroke="currentColor" />
    </svg>
  )
}

/** `IconThinkOutlineRegular`（strokeWidth 1）的几何，复制自 rc2 的 primitives 包。 */
export function ThinkGlyph({ size = 16, className, strokeWidth = 1 }: ArtworkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={strokeWidth}
    >
      <path d="M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z" stroke="currentColor" />
      <path d="M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z" stroke="currentColor" />
      <path d="M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z" fill="currentColor" />
    </svg>
  )
}
