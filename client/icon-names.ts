/**
 * DSH 内置图标导出名的双版本对照（0.1.5 线 ↔ 0.1.7 线）。
 *
 * 为什么要这张表：0.1.7 起 `@deepseek-ai/dsh-client-ui-primitives` 的图标导出名
 * 去掉了尺寸后缀、换成字重后缀（`IconThinkOutline16` → `IconThinkOutlineRegular`，
 * 另有 `*Medium` 一支），旧拼写在 0.1.7 的导出表里一个都不剩。鱼排的一份 bundle 要在
 * 两代宿主上都能跑，所以调用点只写**稳定名**（沿用 0.1.5 的拼写），运行时按
 * 「0.1.7 名 → 旧名」的顺序去宿主导出表里找，命中哪个用哪个——两代都直接命中，
 * 不需要靠 engines/peer 下限把任何一代挡在门外。
 *
 * 只收鱼排真正引用的图标；新增引用要在这里补一行，
 * `test/icons-compat.test.mjs` 拿两代导出清单逐行核对落点，漏了会红。
 */
export const ICON_EXPORT_ALIASES: Record<string, readonly [modern: string, legacy: string]> = {
  // 主题图标（THEME_GLYPH 引用的就是这些稳定名）
  IconAgentPresetOutline16: ['IconAgentPresetOutlineRegular', 'IconAgentPresetOutline16'],
  IconBranchOutline16: ['IconBranchOutlineRegular', 'IconBranchOutline16'],
  IconBrowseOutline16: ['IconBrowseOutlineRegular', 'IconBrowseOutline16'],
  IconCodeOutline16: ['IconCodeOutlineRegular', 'IconCodeOutline16'],
  IconDarkOutline16: ['IconDarkOutlineRegular', 'IconDarkOutline16'],
  IconEditOutline16: ['IconEditOutlineRegular', 'IconEditOutline16'],
  IconEnhanceOutline16: ['IconEnhanceOutlineRegular', 'IconEnhanceOutline16'],
  IconLightOutline16: ['IconLightOutlineRegular', 'IconLightOutline16'],
  IconListPenOutline16: ['IconListPenOutlineRegular', 'IconListPenOutline16'],
  IconPersonalizationOutline16: ['IconPersonalizationOutlineRegular', 'IconPersonalizationOutline16'],
  IconSparkle16: ['IconSparkleRegular', 'IconSparkle16'],
  IconThinkOutline16: ['IconThinkOutlineRegular', 'IconThinkOutline16'],
  // 面板控件（下拉箭头 / 选中勾）
  IconChevronDownOutline14: ['IconChevronDownOutlineRegular', 'IconChevronDownOutline14'],
  IconCheckOutline14: ['IconCheckOutlineRegular', 'IconCheckOutline14'],
}

/**
 * 一个稳定名在宿主导出表里的候选拼写，按尝试顺序排（0.1.7 的先试，旧名兜底）。
 * 不在表里的名字原样当候选拼写——方便过渡期临时引用，正式引用仍要补表。
 */
export function iconExportCandidates(stable: string): readonly string[] {
  const aliases = ICON_EXPORT_ALIASES[stable]
  return aliases ? [aliases[0], aliases[1]] : [stable]
}

/**
 * React 能当组件用的值：普通函数组件，或 `memo` / `forwardRef` 包出来的**对象**
 * （带 `$$typeof`）。只判 `typeof === 'function'` 会把它们误判成"没有这个图标"而
 * 静默退回纯文字；真正不能交给 React 的是那种既不是函数、又没有 `$$typeof` 的东西
 * （会整块崩），那种才降级。
 */
function isIconComponent(value: unknown): boolean {
  if (typeof value === 'function') return true
  return !!value && typeof value === 'object' && !!(value as { $$typeof?: unknown }).$$typeof
}

/**
 * 按稳定名解析宿主的图标组件；两个拼写都拿不到（或拿到的不是组件）就返回 null，
 * 由调用方降级成纯文字。取值包 try：严格的 namespace 代理可能对未知键抛错，
 * 那不该把整块面板拖垮。
 */
export function resolveIconExport(primitives: Record<string, unknown> | null | undefined, stable: string): any {
  for (const name of iconExportCandidates(stable)) {
    let value: unknown
    try {
      value = primitives ? primitives[name] : undefined
    } catch {
      continue
    }
    if (isIconComponent(value)) return value
  }
  return null
}
