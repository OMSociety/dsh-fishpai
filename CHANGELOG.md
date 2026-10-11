# Changelog

本项目的更改记录在此文件。

All notable changes to this project are documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-11

### 新增

- 治理面补件：`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`CODEOWNERS`、Issue 与 PR 模板、`dependabot.yml`；CI 增加 `v*` tag 触发，核对 tag、`package.json` 与 CHANGELOG 三者一致（只核对，不发布；CHANGELOG 核对锚定行首，正文里提到版本号不算数）。
- 测试补强：接口层 `client/api.ts` 的 409 → 冲突映射与错误文案、主题图标内联核对、补丁游标与拼接空行、正文缺失回 404、DNS rebinding 守卫、工具注册失败回滚、主题字号的五种写法与引号陷阱。

### 变更

- `peerDependencies` 去掉已不再 require 的 `@deepseek-ai/dsh-client-ui-primitives`，由七个降到六个——rc2 的安装闸门逐条判定 peer 区间，声明一个用不到的包会误拒合法宿主。宿主下限仍是 `>=0.2.0-rc.2 <0.3.0-0`。
- `devDependencies` 的 `@deepseek-ai/cordis` 由 `^4.0.2` 收到 `~4.0.4`，与宿主包 peer 声明的 `~4.0.4` 对齐。
- **同源守卫按平台判据重写**：`Host` 必须是环路字面量（`localhost` / 整段 `127/8` / `[::1]`）——这一条挡的是 DNS rebinding，光比 `Origin === Host` 挡不住"攻击者域名解析到 127.0.0.1"。判据与平台 `dsh-client-connection` 的 `parseAuthority` / `isLoopbackHostname` 一致。
- 自定义主题写在 `wrapper` 上的 `font-size` 会得到一条提示：它不生效，要固定正文字号请改具体槽位（`p` / `li` / `blockquote`）。规格照常通过，声明一字不丢。

### 修复

- **图标不再向宿主包要**：主题与控件图标（14 支）的几何改为内联在本包里（`client/theme-icons.tsx`，复制自 DSH 内建图标集，MIT，见 `NOTICE.md`）。此前走 `require('@deepseek-ai/dsh-client-ui-primitives')`，而 rc2 官方明确不赞成客户端 bundle 把 Harness Client 包当模块加载——宿主改名或取不到导出时整块界面会白掉，不是"降级成纯文字"那么轻。图标名随宿主版本变的耦合就此解除。
- **图标清单的守卫原本是空的**：旧 fixture 自称"就是 npm 发布包的运行时导出表"，实际混进了 6 个宿主不存在的名字（`IconFullAccess*` / `IconReadOnly*` / `IconWorkspaceWrite*`，rc2 里叫 `PermissionIcon*`），又漏收了实有的 6 支；两处差错恰好抵消，`assert.equal(size, 194)` 一直是绿的。新守卫直接核对**本包内联的 14 支几何**，不再依赖外部清单。
- **正文读不出来不再静默降级成空正文**：文档被删除或改名时，`/doc` 回 404 并给出可读原因，面板进错误态、保留屏幕上已有的正文。此前读失败被当成空串，面板显示"文档被清空"，`fishpai_read` 的差异也会把整篇算成"新增"。
- **基线快照丢了就明说**：`.fishpai` 状态被清理过时，`fishpai_read` 不再把整篇谎报成"人重写了全文"，而是给出提示并照实给出空差异统计。
- **同一个块的多条补丁不再错位**：`applyPatches` 此前对同块的多条补丁沿用同一个行号，前一条改了块的长度后，后一条会插进结果中间（`replace` 变长时实测）。现在按块内游标连续计算，拼接处的空行由补丁器自己保证。
- **面板「字号」能替掉 wrapper 上各种合法写法**：替换规则原先只认整数 px，自定义主题写 `1rem` / `16.5px` / `17PX` / `16` 时预览不动，而发布路径的 `promoteFontSize` 又把 `<p>` 撑成选定字号——预览与粘进微信的结果不一致。现在按声明边界替换（引号里的分号不算边界，同名声明全部替换）。
- **批注的身份字段由宿主钉死**：`id` / `author` / `at` 不再能被调用方覆盖（`resolved` 仍可改）。
- **工具或路由注册失败不再只写一行日志**：失败会整体回滚并抛出，不留"一半工具还装作挂载成功"的状态。
- **`rebase` 读不到正文也回 404**：此前 `rebase` 用裸 `readFileSync`，正文被删时抛原生 ENOENT 落进兜底 400「请求不合法」；现在走 `readDocText`，与 `/doc` 同口径回 404。
- **同块 `replace` 与 `delete` 组合不再由顺序决定结果**：此前 `[replace, delete]` 会让 delete 静默吃掉刚替换进去的内容、`applied` 照报两条；现在统一保 replace、跳过 delete，并在 errors 里给出信号，与顺序无关。
- **`replace` 的 markdown 自带首尾空行不再叠出 `\n\n\n`**：自带的空行与现场已留好的分隔空行只去重不叠加；删掉首块后文档开头的前导空行也一并收掉。
- **自定义主题校验与渲染同用引号感知的声明切分**：`font-family: 'a; font-size: 99px', serif` 里引号内的分号不再是声明边界——此前校验侧的朴素 `split(';')` 会截出假声明，让"不生效"提示引用一句没写过的字号、或让真字号缺失时补全不触发（面板字号成死控件）。

### Added

- Governance: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, issue and PR templates, `dependabot.yml`; CI now triggers on `v*` tags and checks that the tag, `package.json` and CHANGELOG agree (verification only, no publishing; the CHANGELOG check anchors to the start of a line, so a version number mentioned mid-text does not count).
- Test coverage: the API layer's 409 → conflict mapping and error text, inlined theme icons, patch cursors and seam blank lines, missing-body 404, the DNS rebinding guard, tool-registration rollback, and five legal spellings of the theme font size plus its quoting traps.

### Changed

- Dropped `@deepseek-ai/dsh-client-ui-primitives` from `peerDependencies` (seven down to six) since nothing requires it any more — the rc2 install gate checks every peer range, so declaring an unused package rejects legitimate hosts. The host floor stays `>=0.2.0-rc.2 <0.3.0-0`.
- `@deepseek-ai/cordis` in `devDependencies` tightened from `^4.0.2` to `~4.0.4`, matching the host packages' own peer range.
- **The same-origin guard was rewritten to the platform's criteria**: `Host` must be a loopback literal (`localhost` / any `127/8` / `[::1]`), which is what stops DNS rebinding — comparing `Origin === Host` alone does not. Criteria now match `dsh-client-connection`'s `parseAuthority` / `isLoopbackHostname`.
- A `font-size` written on a custom theme's `wrapper` now produces a note: it has no effect, and a fixed body size belongs on the concrete slots (`p` / `li` / `blockquote`). The spec still validates and keeps every declaration.

### Fixed

- **Icons no longer come from a host package**: the geometry of the 14 theme and control icons is now inlined in this package (`client/theme-icons.tsx`, copied from the DSH built-in icon set, MIT, see `NOTICE.md`). It previously went through `require('@deepseek-ai/dsh-client-ui-primitives')`, which rc2 official guidance discourages for a client bundle — a rename or a missing export blanks the whole surface rather than degrading to plain text.
- **The icon-list guard was hollow**: the old fixture claimed to be "the npm package's runtime export table" while carrying six names the host does not have (`IconFullAccess*` / `IconReadOnly*` / `IconWorkspaceWrite*`; rc2 calls them `PermissionIcon*`) and missing six that it does. The two errors cancelled out, so `assert.equal(size, 194)` stayed green. The new guard checks the 14 inlined geometries directly.
- **An unreadable document body no longer degrades to an empty body**: when the file is deleted or renamed, `/doc` returns 404 with a readable reason, and the panel keeps the text already on screen. Previously the read failure became an empty string — the panel showed "the document was cleared" and `fishpai_read` reported the whole file as newly added.
- **A missing baseline says so**: with `.fishpai` state cleaned out, `fishpai_read` no longer reports the whole document as rewritten by the user; it warns and returns honest empty diff statistics.
- **Multiple patches to one block no longer drift**: `applyPatches` used one fixed line range for every patch on the same block, so a length-changing `replace` made the next patch land in the middle of the result. Patches now advance an in-block cursor, and the blank line at the seam is guaranteed by the patcher.
- **The font-size control now replaces every legal spelling in `wrapper`**: the substitution only recognised integer px, so a custom theme writing `1rem` / `16.5px` / `17PX` / `16` left the preview unchanged while the publish path's `promoteFontSize` pushed the chosen size onto `<p>` — preview and WeChat disagreed. Substitution now works on declaration boundaries (a semicolon inside quotes is not a boundary; same-named declarations are all replaced).
- **Note identity fields are pinned by the host**: `id` / `author` / `at` can no longer be overridden by the caller (`resolved` stays editable).
- **Tool or route registration failures no longer just log**: they roll back and throw instead of leaving half the tools mounted while claiming success.
- **`rebase` returns 404 when the body is unreadable**: it used a bare `readFileSync`, so a deleted body threw a raw ENOENT into the catch-all 400 "invalid request"; it now goes through `readDocText`, matching `/doc`.
- **A same-block `replace` + `delete` pair no longer resolves by ordering**: `[replace, delete]` used to let the delete silently swallow the freshly replaced content while `applied` still reported both. The replace is now kept, the delete skipped, and the conflict surfaces in `errors` — regardless of order.
- **Leading/trailing blank lines in a `replace` payload no longer stack into `\n\n\n`**: a payload's own blank lines are deduplicated against the separator blank lines already in place; deleting the first block also strips the leading blank line it leaves behind.
- **Theme-spec validation now shares the quote-aware declaration splitter with rendering**: a semicolon inside quotes (`font-family: 'a; font-size: 99px', serif`) is no longer a declaration boundary — the naive `split(';')` used to cut out a phantom declaration, making the "won't take effect" note quote a font size that was never written, or skipping the auto-completion when the real one was missing (a dead font-size control).

## [1.1.0] - 2026-10-09

### 变更

- 客户端挂载改为只走 DSH **官方右侧栏**：标签页与引导列表经 `sidebarRightTabs.register` 加两个 `sidebar.right.pane.tab` 槽位注册，打开走 `sidebarRight.openTab`。此前与之并存的 `dsh-better-sidebar` 回退通道移除。
- 宿主依赖下限抬到 `>=0.2.0-rc.2 <0.3.0-0`：`peerDependencies` 的七个 `@deepseek-ai/dsh-*` 包与新增的 `engines.dsh` 一条同口径。此前声明的下限是 0.1.5-rc.2。
- 内置图标名改用宿主当前导出的拼写（`*Regular` 字重后缀），去掉两代拼写的对照表：下限抬高后只需服务一条线；某个名字取不到时仍降级成纯文字。
- 面板空白页的品牌标改用 `FishMark`——与包根 `icon.svg` 同一份 36 画板几何内联渲染，删掉此前的 16 画板 `FishGlyph`。同一支鱼在全仓库只剩一份几何，改 `icon.svg` 只需回来改一处。
- 移除仓库内的上游静态站点副本 `legacy-site/`（27 个文件），安装说明收口到 npm 包：本仓库此后只保留插件本体，`dsh plugin add dsh-fishpai` 是唯一安装入口。

### Changed

- The client now mounts only through the DSH **official right sidebar**: the tab and the guide entry are registered via `sidebarRightTabs.register` plus the two `sidebar.right.pane.tab` slots, and opening goes through `sidebarRight.openTab`. The parallel `dsh-better-sidebar` fallback channel that previously accompanied it is removed.
- Raised the host floor to `>=0.2.0-rc.2 <0.3.0-0`, applied uniformly to the seven `@deepseek-ai/dsh-*` packages in `peerDependencies` and to a new `engines.dsh` entry. The previous floor was 0.1.5-rc.2.
- Built-in icon names now use the host's current export spelling (the `*Regular` weight suffix), dropping the two-generation alias table; with the floor raised there is only one line to serve. A name that cannot be resolved still degrades to plain text.
- The panel blank page's brand mark now uses `FishMark` — the same 36-canvas geometry as the package-root `icon.svg`, inlined — and the earlier 16-canvas `FishGlyph` is gone. One fish, one drawing in the whole repository: changing `icon.svg` means coming back to a single place.
- Removed the in-repo copy of the upstream static site (`legacy-site/`, 27 files) and settled the install instructions on the npm package: this repository now carries the plugin only, with `dsh plugin add dsh-fishpai` as the single entry point.

## [1.0.4] - 2026-10-04

### 新增

- 插件有了自己的图标：包根 `icon.svg`（36×36，渐变描边的侧视鱼），由 `package.json` 顶层 `icon` 字段声明并列入 `files`。插件列表里不再显示 DSH 的默认图形。
- 插件列表里的显示名与描述有了中英两份（`locale/en.json`、`locale/zh.json` 的 `meta.title` 与 `meta.description`），中文名定为「鱼排编辑器」；`package.json` 的 `exports` 与 `files` 相应放行 `locale/*.json`。此前该处回退成包名与英文 `description`，在中文界面里中英混排。

### 变更

- 右侧栏标签页、引导列表、回退标签页的那条鱼改用包根 `icon.svg` 的**同一份图**（36 画板内联渲染，放大 1.3 倍取景）。插件列表的磁贴与侧边栏不再各画一套。
- 面板内部（空白页的品牌行）仍用 16 画板的 `FishGlyph`，颜色走 `currentColor`；它与 `icon.svg` 同轮廓，按 36 ÷ 16 = 2.25 折算（描边 0.89，眼睛 0.72）。

### Added

- The plugin now ships its own icon: `icon.svg` at the package root (36×36, a gradient-outlined side-view fish), declared through the top-level `icon` field in `package.json` and listed in `files`. The plugin list no longer falls back to the default DSH artwork.
- The plugin's display name and description in the plugin list now ship in both languages (`meta.title` and `meta.description` in `locale/en.json` and `locale/zh.json`), with the Chinese name settled as 鱼排编辑器; `exports` and `files` in `package.json` admit `locale/*.json` accordingly. The list previously fell back to the package name and the English `description`, mixing languages inside a Chinese interface.

### Changed

- The fish in the sidebar tab, the guide list, and the fallback tab now renders the **same artwork** as the package-root `icon.svg` (inlined on the 36-canvas, scaled 1.3× to take up the frame). The plugin-list tile and the sidebar no longer carry two separate drawings.
- Inside the panel (the blank page's brand row) the 16-canvas `FishGlyph` stays, coloured through `currentColor`; it shares its contour with `icon.svg`, derived by 36 ÷ 16 = 2.25 (stroke 0.89, eye radius 0.72).

## [1.0.3] - 2026-09-28

### 变更

- 声明宿主依赖区间 `>=0.1.5-rc.2 <0.3.0-0`（`peerDependencies`，覆盖本插件注入与运行时依赖的七个 `@deepseek-ai/dsh-*` 包）。DSH 0.1.7-rc.1 起的兼容闸按该字段逐条判定插件能否在宿主上加载；本插件在 DSH 0.2.0-rc.1 上安装与加载正常。

### Changed

- Declared the host range `>=0.1.5-rc.2 <0.3.0-0` in `peerDependencies`, covering the seven `@deepseek-ai/dsh-*` packages this plugin injects or requires at runtime. The compatibility gate in dsh 0.1.7-rc.1 and later checks this field entry by entry to decide whether the plugin may load on the host; this plugin installs and loads normally on dsh 0.2.0-rc.1.

## [1.0.2] - 2026-09-25

### 安全

- **复制回退路径**（没有 `ClipboardItem` 的环境）不再把渲染产物直接写进 WebUI 主文档：改为先解析、剥掉脚本类容器与事件属性、再插入。那个容器与宿主同源，事件属性会在挂载那一刻执行。
- **自定义主题的样式值不再放行双引号**：样式值会被原样拼进 `style="…"`，一个双引号即可闭合属性并注入任意属性；单引号仍可用。主题色与正文字号改为同一套形态校验，`POST /render` 与文档保存两条写入口共用这份规则。
- **复制与导出产物在清理阶段剥掉危险标签与事件属性**：`<script>`、`<style>`、`<iframe>`、`<object>`、`<embed>`、`<link>`、`<meta>`、事件属性与危险协议 URL 一律移除，导出的 `.html` 双击打开时稿件里的裸 HTML 不再执行。
- **外链判定改为「归一化 + 协议白名单」**：`JavaScript:`、`java\tscript:`、实体编码等变体不再被当成正常外链。
- 代码块的围栏语言串、语言标签与提示卡片标题改为转义后再拼入产物，畸形语言串不再产出第二个 `style` 属性或注入元素。

### 变更

- 「参考资料」脚注的判定改为协议白名单（`http`/`https`/`mailto`）：相对路径（如 `./notes.md`）与 `ftp:`、`tel:` 等不再计入脚注，但仍原样保留在产物里。

### Security

- **The copy fallback path** (environments without `ClipboardItem`) no longer writes the rendered output straight into the WebUI main document: it now parses the output first, strips script-like containers and event attributes, and only then inserts it. That container is same-origin with the host, so an event attribute would execute the moment it is mounted.
- **Custom theme style values no longer allow double quotes**: a style value is concatenated verbatim into `style="…"`, so a single double quote can close the attribute and inject arbitrary attributes; single quotes are still allowed. Theme colors and body font size now share the same shape validation, and the two write entry points — `POST /render` and document saving — use this same rule.
- **Copy and export output strips dangerous tags and event attributes during the cleanup stage**: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, event attributes and dangerous-protocol URLs are all removed, so bare HTML in the manuscript no longer executes when the exported `.html` is opened by double-clicking.
- **External link detection now uses normalization plus a protocol whitelist**: variants such as `JavaScript:` and `java\tscript:` and entity-encoded forms are no longer treated as ordinary external links.
- Code block fence language strings, language labels and prompt card titles are escaped before being concatenated into the output, so a malformed language string no longer produces a second `style` attribute or injects elements.

### Changed

- The "References" footnote check now uses a protocol whitelist (`http`/`https`/`mailto`): relative paths (such as `./notes.md`) and `ftp:`, `tel:` and the like are no longer counted as footnotes, but they are still kept verbatim in the output.

## [1.0.1] - 2026-09-23

### 修复

- 适配 DSH 0.1.7 的 ui-primitives 图标改名（0.1.7 起导出名去尺寸后缀、改字重后缀，旧拼写在 0.1.7 的导出表里已消失）：主题图标、下拉箭头与选中勾按「0.1.7 名 → 0.1.5 名」运行时探测解析，两代宿主共用一份产物（此前 0.1.7 上解析不到导出、按纯文字降级）。
- 适配 DSH 0.1.7 客户端「Session 多实例」后的当前会话解析：会话列表快照不再携带当前选中，改为读右侧栏座位的挂载会话（0.1.5 线仍走快照）；轮询在两代宿主上都定位得到会话（此前 0.1.7 读不到当前会话、整轮空转）。
- 右侧栏引导页的鱼排入口补上条目 id（0.1.7 起引导条目按 id 标识）。
