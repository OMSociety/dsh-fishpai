/**
 * 从宿主的 `@deepseek-ai/dsh-client-ui-primitives` 命名空间里安全取一个图标组件。
 *
 * 图标名直接用宿主当前的导出拼写（`*Regular` / `*Medium` 字重后缀，见 `icons.tsx`）。
 * 取不到就返回 null，由调用方降级成纯文字：模块缺失、宿主版本没这个图标、
 * 严格代理对未知键抛错——这三种都不该把整块面板拖垮。
 *
 * 调用点真正引用到的名字由 `test/icons-compat.test.mjs` 对着宿主导出清单核对，
 * 改了名字或宿主升级导致改名时测试会红。
 */

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
 * 按导出名解析宿主的图标组件；取不到（或拿到的不是组件）就返回 null，
 * 由调用方降级成纯文字。取值包 try：严格的 namespace 代理可能对未知键抛错，
 * 那不该把整块面板拖垮。
 */
export function resolveIconExport(primitives: Record<string, unknown> | null | undefined, name: string): any {
  let value: unknown
  try {
    value = primitives ? primitives[name] : undefined
  } catch {
    return null
  }
  return isIconComponent(value) ? value : null
}
