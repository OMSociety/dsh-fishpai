/**
 * 快捷键的**显示口径**（只影响提示文案）。
 *
 * 为什么这么轻：键盘处理一律 `e.metaKey || e.ctrlKey`（Mac 与 Windows 都能用），
 * 所以这里判错了也坏不了功能，只是提示串不好看。代价就是本文件——没有依赖、
 * 没有运行时查询，一处常量，谁用谁 import。
 *
 * 取平台的口径按可靠度排：`navigator.userAgentData.platform`（Chromium）→
 * `navigator.platform`（旧 API，仍在所有浏览器里可用）→ `navigator.userAgent`。
 * iPadOS 的 Safari 会把自己的平台报成 `MacIntel`，所以 `Mac` 这一支也覆盖 iPad。
 */
function detectMac(): boolean {
  try {
    const nav: any = typeof navigator === 'undefined' ? null : navigator
    if (!nav) return false
    const declared = String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || '')
    if (/mac|iphone|ipad|ipod/i.test(declared)) return true
    return typeof nav.userAgent === 'string' && /mac os x|iphone|ipad/i.test(nav.userAgent)
  } catch {
    return false
  }
}

export const IS_MAC = detectMac()

/** 修饰键的写法：Mac 用 ⌘，其余用 Ctrl。 */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'

/** 「复制到公众号」的快捷键提示（与 Editor 里监听的 meta/ctrl + shift + C 对应）。 */
export const COPY_HINT = IS_MAC ? '⌘⇧C' : 'Ctrl+Shift+C'
