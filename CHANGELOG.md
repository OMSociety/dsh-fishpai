# Changelog

本项目的更改记录在此文件。

All notable changes to this project are documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 新增

- 专业管线新增 `full_bleed` 全幅容器：按文档 `page_padding_x` 计算左右出血并解除正文限宽；`fishpai_lint` 新增 `full-bleed-width` 与 `table-cell-border-reset` 检查及对应技能指引。

### 修复

- 专业双栏与对比卡显式清除表格单元格默认边框；正式演示文稿的全幅头图、结尾色块与三栏表格使用统一的微信安全结构。
- 专业复制与导出会分别包裹粗体、链接或换行后的每个直接文本节点，候选稿可通过文本结构检查。

### Added

- Added the professional `full_bleed` container, which derives horizontal bleed from the document's `page_padding_x` and opts out of content-width clamping; `fishpai_lint` now checks `full-bleed-width` and `table-cell-border-reset`, with matching skill guidance.

### Fixed

- Professional two-column and comparison components explicitly reset table-cell borders; the formal preview article uses consistent WeChat-safe structures for its full-bleed hero, closing color block, and three-column table.
- Professional copy and export now wrap every direct text node after bold text, links, or line breaks, allowing candidate articles to pass text-structure checks.

## [2.0.0] - 2026-11-18

### 新增

- 新增写作规范技能参考 `skills/fishpai/references/writing.md`：九字段风格卡、AI 味指纹库、五维质量自评与文末收束规范，起草与润色时按需读取。
- 新增 `fishpai_lint` 与 `POST /lint`：检查微信粘贴结构、内联样式与正文对比度，并明确区分 API 路径观察与粘贴路径推论。
- 新增 `fishpai_learn` 与 `POST /learn`：从定稿、HTML 或公开网页反推写作风格九字段，经 pending 候选与用户确认后写入 storageDomain writing 表。
- 新增 `fishpai_snippets` 与 `POST /snippets`：页头首图、可配置页尾锚点片段经预览确认后入库；`fishpai_render` 与 `POST /render` 可用 `snippetId` 在渲染前装配。
- 新增独立秀米渲染目标与 SVG 组件库；`fishpai_render` 和 `POST /render` 接受 `target:'xiumi'`，微信渲染管线保持独立。
- 新增文档级秀米画布规格（18 项）：`fishpai_open({xiumi_spec})` 校验并持久化，预览、复制与导出共用；`fishpai_render({xiumi_spec})` 仅覆盖当次。
- 新增章节头、信息卡、重点行与制作名单四个语义组件，以及版式设计指南 `skills/fishpai/references/layout.md`。
- 新增专业组件手册 `skills/fishpai/references/components.md`，含 8 个 SMIL 交互组件（点击展开 `expand`、点击换图 `swap`、滑动图集 `swiper`、探照灯 `spotlight`、弹幕 `danmaku`、进度条 `progress`、时间线 `timeline`、对比卡 `compare`）与静态版式组件；`fishpai_lint` 补 CSS 动画禁令与 SMIL 循环校验。
- 专业管线升级为自由排版画布：Markdown、语义组件与 `:::raw` 可混合，raw 承载安全 HTML / SVG 原创与同等素材复刻，并拒绝脚本、事件属性与主动内容。
- raw HTML / SVG 的本地 `<img>` 与 `<image>` 素材纳入统一素材清单，预览可读取，复制与导出默认内嵌 base64。

### 变更

- **BREAKING**：文档默认走秀米组件管线（专业，`target:'xiumi'`）；快速渲染内核保留为「快速」模式（`target:'wechat'`）。`fishpai_render` 省略 `target` 时跟随文档当前模式。
- 声明可选 peer `@deepseek-ai/dsh-storage-domain`（用户级库存储）；`playwright-core` 用于 README 正式预览构建，属于开发依赖。
- **BREAKING**：命名自定义主题改为用户级多主题库，存入 storageDomain themes 表，主题 key 使用 `custom:<id>`；`fishpai_theme` 支持 `set` / `show` / `clear` / `list`，并可用 `theme_id` 指定主题。不再读取 `.fishpai/theme.json` 或主题名 `custom`。
- 渲染 golden 改为当前核心自产 snapshot，`scripts/regen-golden.mjs` 只从 `plugin/core/render.mjs` 生成；站点样本 parity 由 `FISHPAI_SITE_PARITY=1` 显式启用。
- 项目说明、代码注释与技能文档统一以本仓库为行为依据；MoPai 保留为衍生来源与许可证出处。

### 移除

- 移除 `test/oracle/` 与 regen 的 `--from-core` 分支，渲染测试只保留当前核心这一份实现。

### 修复

- 会话工作目录在启动阶段尚未就绪时，面板在首次成功轮询后自动恢复文档初始化。

### Added

- Added the writing-guide reference `skills/fishpai/references/writing.md`: nine-field style cards, AI-flavor fingerprint library, five-dimension quality self-review, and closing conventions, read on demand while drafting or polishing.
- Added `fishpai_lint` and `POST /lint` for WeChat paste-structure, inline-style, and text-contrast checks with explicit evidence boundaries.
- Added `fishpai_learn` and `POST /learn`: infer nine writing-style fields from drafts, HTML, or public pages, then persist confirmed candidates to the storageDomain writing table.
- Added `fishpai_snippets` and `POST /snippets`: confirm header/footer fragments before storage, then compose them by `snippetId` before rendering.
- Added an independent Xiumi rendering target and SVG component library; `fishpai_render` and `POST /render` accept `target:'xiumi'`, while the WeChat rendering pipeline remains independent.
- Added an 18-key document-level Xiumi canvas spec: `fishpai_open({xiumi_spec})` validates and persists it for preview, copy, and export; `fishpai_render({xiumi_spec})` overrides only the current render.
- Added four semantic components (chapter headers, info cards, highlight lines, and credits) plus the layout guide `skills/fishpai/references/layout.md`.
- Added the component reference `skills/fishpai/references/components.md` with 8 SMIL interactive components plus static layout components; `fishpai_lint` now flags CSS animations and risky SMIL loops.
- Upgraded the professional pipeline into a free-form canvas: Markdown, semantic components, and `:::raw` can be mixed, with raw supporting safe HTML / SVG original designs and same-material recreations while rejecting scripts, event handlers, and active content.
- Local `<img>` and `<image>` assets in raw HTML / SVG now share the unified asset inventory: previews can read them, and copy and export embed them as base64 by default.

### Changed

- **BREAKING**: Documents default to the Xiumi component pipeline (professional, `target:'xiumi'`); the quick rendering core remains available as the "quick" mode (`target:'wechat'`). `fishpai_render` follows the document's current mode when `target` is omitted.
- Declared the optional peer `@deepseek-ai/dsh-storage-domain` for user-level stores; `playwright-core` supports the formal README preview build as a development dependency.
- **BREAKING**: Named custom themes now live in the user-level storageDomain themes table and use `custom:<id>` keys. `fishpai_theme` supports `set` / `show` / `clear` / `list` with an optional `theme_id`. `.fishpai/theme.json` and the bare `custom` theme name are no longer read.
- Rendering goldens are now snapshots produced by the current core, with `scripts/regen-golden.mjs` using only `plugin/core/render.mjs`; site parity is an opt-in soft reference via `FISHPAI_SITE_PARITY=1`.
- Project guides, code comments, and skill documentation now use this repository as the behavioral source of truth; MoPai remains credited as the derivative source and license origin.

### Removed

- Removed `test/oracle/` and the regen `--from-core` branch, leaving a single rendering implementation for tests.

### Fixed

- When the session working directory is not ready during startup, the panel automatically resumes document initialization after the first successful poll.

## [1.2.1] - 2026-11-02

### 修复

- **右侧栏页签声明槽位属主包。** `client/index.tsx` 注册 `sidebar.right.pane.tab` 与 `.title`；`package.json` 的 `dsh.client.inject` 声明 `@deepseek-ai/dsh-client-ui-sidebar-right`，以包依赖边约束属主包的装载顺序。

### Fixed

- **Declared the sidebar tab's slot owner.** `client/index.tsx` registers `sidebar.right.pane.tab` and `.title`; `dsh.client.inject` in `package.json` declares `@deepseek-ai/dsh-client-ui-sidebar-right`, constraining the owner package's load order through a package dependency edge.

## [1.2.0] - 2026-10-11

### 新增

- 治理面补件：`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`CODEOWNERS`、Issue 与 PR 模板、`dependabot.yml`。
- 测试补强：接口层 `client/api.ts` 的 409 → 冲突映射与错误文案、主题图标内联核对、补丁游标与拼接空行、正文缺失回 404、DNS rebinding 守卫、工具注册失败回滚、主题字号的五种写法与引号陷阱。

### 变更

- `peerDependencies` 去掉已不再 require 的 `@deepseek-ai/dsh-client-ui-primitives`，由七个降到六个——rc2 的安装闸门逐条判定 peer 区间，声明一个用不到的包会误拒合法宿主。宿主下限仍是 `>=0.2.0-rc.2 <0.3.0-0`。
- `devDependencies` 的 `@deepseek-ai/cordis` 由 `^4.0.2` 收到 `~4.0.4`，与宿主包 peer 声明的 `~4.0.4` 对齐。
- **同源守卫按平台判据重写**：`Host` 必须是环路字面量（`localhost` / 整段 `127/8` / `[::1]`）——这一条挡的是 DNS rebinding，光比 `Origin === Host` 挡不住"攻击者域名解析到 127.0.0.1"。判据与平台 `dsh-client-connection` 的 `parseAuthority` / `isLoopbackHostname` 一致。
- 自定义主题写在 `wrapper` 上的 `font-size` 会得到一条提示：它不生效，要固定正文字号请改具体槽位（`p` / `li` / `blockquote`）。规格照常通过，声明一字不丢。

### 修复

- **主题与控件图标内联**：14 支图标的几何位于本包 `client/theme-icons.tsx`（复制自 DSH 内建图标集，MIT，见 `NOTICE.md`）。图标渲染与宿主图标包的导出名解耦。
- **图标守卫核对本包内联几何**：直接验证 14 支几何的导出、渲染与接线。
- **正文读取失败返回 404**：文档被删除或改名时，`/doc` 给出可读原因，面板进入错误态并保留屏幕上的正文；`fishpai_read` 对缺失正文明确报错。
- **缺失基线快照明确提示**：`.fishpai` 状态被清理时，`fishpai_read` 给出提示与空差异统计。
- **同块多条补丁按块内游标连续计算**：变长 `replace` 后的补丁落在正确位置，拼接处的空行由补丁器保证。
- **面板「字号」支持 wrapper 上的合法字号写法**：`1rem` / `16.5px` / `17PX` / `16` 等形式均按声明边界替换；引号内的分号不作为边界，同名声明全部替换，预览与发布采用同一口径。
- **批注身份字段由宿主控制**：调用方不能覆盖 `id` / `author` / `at`，`resolved` 仍可修改。
- **工具或路由注册失败整体回滚并抛出**：插件挂载失败在界面与日志中呈现。
- **`rebase` 与 `/doc` 共用正文读取口径**：正文不可读时经 `readDocText` 返回 404。
- **同块 `replace` 与 `delete` 组合采用确定规则**：保留 `replace`、跳过 `delete`，并在 `errors` 中报告冲突，结果与补丁顺序无关。
- **`replace` 的首尾空行与块间分隔空行去重**：删除首块时同时收掉文档开头的前导空行。
- **自定义主题校验与渲染共用引号感知的声明切分**：`font-family: 'a; font-size: 99px', serif` 中引号内的分号保留在值内，字号提示与自动补全使用同一份解析结果。

### Added

- Governance: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CODEOWNERS`, issue and PR templates, `dependabot.yml`.
- Test coverage: the API layer's 409 → conflict mapping and error text, inlined theme icons, patch cursors and seam blank lines, missing-body 404, the DNS rebinding guard, tool-registration rollback, and five legal spellings of the theme font size plus its quoting traps.

### Changed

- Dropped `@deepseek-ai/dsh-client-ui-primitives` from `peerDependencies` (seven down to six) since nothing requires it any more — the rc2 install gate checks every peer range, so declaring an unused package rejects legitimate hosts. The host floor stays `>=0.2.0-rc.2 <0.3.0-0`.
- `@deepseek-ai/cordis` in `devDependencies` tightened from `^4.0.2` to `~4.0.4`, matching the host packages' own peer range.
- **The same-origin guard was rewritten to the platform's criteria**: `Host` must be a loopback literal (`localhost` / any `127/8` / `[::1]`), which is what stops DNS rebinding — comparing `Origin === Host` alone does not. Criteria now match `dsh-client-connection`'s `parseAuthority` / `isLoopbackHostname`.
- A `font-size` written on a custom theme's `wrapper` now produces a note: it has no effect, and a fixed body size belongs on the concrete slots (`p` / `li` / `blockquote`). The spec still validates and keeps every declaration.

### Fixed

- **Inlined theme and control icons**: the 14 geometries live in `client/theme-icons.tsx` (copied from the DSH built-in icon set, MIT, see `NOTICE.md`). Icon rendering is decoupled from host icon-package export names.
- **Icon guards check the inlined geometries**: they validate the export, rendering, and wiring of all 14 geometries directly.
- **Unreadable document bodies return 404**: when a file is deleted or renamed, `/doc` returns a readable reason and the panel enters its error state while keeping the text on screen; `fishpai_read` reports the missing body explicitly.
- **Missing baseline snapshots produce an explicit warning**: when `.fishpai` state is cleaned, `fishpai_read` returns empty diff statistics with a warning.
- **Multiple patches to one block advance an in-block cursor**: patches after a length-changing `replace` land at the correct position, and the patcher guarantees the blank line at each seam.
- **The font-size control supports legal `wrapper` spellings**: `1rem` / `16.5px` / `17PX` / `16` and similar forms are replaced on declaration boundaries; semicolons inside quotes stay inside values, same-named declarations are all replaced, and preview and publish share the same behavior.
- **Note identity fields are controlled by the host**: callers cannot override `id` / `author` / `at`, while `resolved` remains editable.
- **Tool or route registration failures roll back and throw**: mount failures appear in the interface and logs.
- **`rebase` and `/doc` share body-read behavior**: unreadable bodies return 404 through `readDocText`.
- **Same-block `replace` + `delete` uses a deterministic rule**: the replace is kept, the delete is skipped, and the conflict is reported in `errors`, regardless of patch order.
- **Leading/trailing blank lines in `replace` are deduplicated against block separators**: deleting the first block also strips the leading blank line at the start of the document.
- **Theme-spec validation and rendering share the quote-aware declaration splitter**: in `font-family: 'a; font-size: 99px', serif`, the quoted semicolon stays inside the value, and font-size notes and auto-completion use the same parse result.

## [1.1.0] - 2026-10-09

### 变更

- 客户端挂载改为只走 DSH **官方右侧栏**：标签页与引导列表经 `sidebarRightTabs.register` 加两个 `sidebar.right.pane.tab` 槽位注册，打开走 `sidebarRight.openTab`。此前与之并存的 `dsh-better-sidebar` 回退通道移除。
- 宿主依赖下限抬到 `>=0.2.0-rc.2 <0.3.0-0`：`peerDependencies` 的七个 `@deepseek-ai/dsh-*` 包与新增的 `engines.dsh` 一条同口径。此前声明的下限是 0.1.5-rc.2。
- 内置图标名改用宿主当前导出的拼写（`*Regular` 字重后缀），去掉两代拼写的对照表：下限抬高后只需服务一条线；某个名字取不到时仍降级成纯文字。
- 面板空白页的品牌标改用 `FishMark`——与包根 `icon.svg` 同一份 36 画板几何内联渲染，删掉此前的 16 画板 `FishGlyph`。同一支鱼在全仓库只剩一份几何，改 `icon.svg` 只需回来改一处。
- 移除仓库内的来源项目静态站点副本 `legacy-site/`（27 个文件），安装说明收口到 npm 包：本仓库此后只保留插件本体，`dsh plugin add dsh-fishpai` 是唯一安装入口。

### Changed

- The client now mounts only through the DSH **official right sidebar**: the tab and the guide entry are registered via `sidebarRightTabs.register` plus the two `sidebar.right.pane.tab` slots, and opening goes through `sidebarRight.openTab`. The parallel `dsh-better-sidebar` fallback channel that previously accompanied it is removed.
- Raised the host floor to `>=0.2.0-rc.2 <0.3.0-0`, applied uniformly to the seven `@deepseek-ai/dsh-*` packages in `peerDependencies` and to a new `engines.dsh` entry. The previous floor was 0.1.5-rc.2.
- Built-in icon names now use the host's current export spelling (the `*Regular` weight suffix), dropping the two-generation alias table; with the floor raised there is only one line to serve. A name that cannot be resolved still degrades to plain text.
- The panel blank page's brand mark now uses `FishMark` — the same 36-canvas geometry as the package-root `icon.svg`, inlined — and the earlier 16-canvas `FishGlyph` is gone. One fish, one drawing in the whole repository: changing `icon.svg` means coming back to a single place.
- Removed the in-repo copy of the source project's static site (`legacy-site/`, 27 files) and settled the install instructions on the npm package: this repository now carries the plugin only, with `dsh plugin add dsh-fishpai` as the single entry point.

## [1.0.4] - 2026-10-04

### 新增

- 插件提供包根 `icon.svg`（36×36，渐变描边的侧视鱼），由 `package.json` 顶层 `icon` 字段声明并列入 `files`，插件列表显示鱼排图标。
- 插件列表的显示名与描述提供中英两份（`locale/en.json`、`locale/zh.json` 的 `meta.title` 与 `meta.description`），中文名为「鱼排编辑器」；`package.json` 的 `exports` 与 `files` 包含 `locale/*.json`。

### 变更

- 右侧栏标签页、引导列表、回退标签页的那条鱼改用包根 `icon.svg` 的**同一份图**（36 画板内联渲染，放大 1.3 倍取景）。插件列表的磁贴与侧边栏不再各画一套。
- 面板内部（空白页的品牌行）仍用 16 画板的 `FishGlyph`，颜色走 `currentColor`；它与 `icon.svg` 同轮廓，按 36 ÷ 16 = 2.25 折算（描边 0.89，眼睛 0.72）。

### Added

- The plugin ships `icon.svg` at the package root (36×36, a gradient-outlined side-view fish), declared through the top-level `icon` field in `package.json` and listed in `files`; the plugin list displays the FishPai artwork.
- The plugin list display name and description ship in both languages (`meta.title` and `meta.description` in `locale/en.json` and `locale/zh.json`), with the Chinese name 鱼排编辑器; `exports` and `files` in `package.json` include `locale/*.json`.

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

- **复制回退路径先清理再插入**（没有 `ClipboardItem` 的环境）：渲染产物经解析、剥除脚本类容器与事件属性后才插入 WebUI 主文档。该文档与宿主同源，事件属性会在挂载时执行。
- **自定义主题样式值拒绝双引号**：样式值会原样拼进 `style="…"`，双引号可闭合属性并注入任意属性；单引号仍可用。主题色与正文字号共用形态校验，`POST /render` 与文档保存两条写入口采用同一规则。
- **复制与导出产物在清理阶段剥除危险标签与事件属性**：`<script>`、`<style>`、`<iframe>`、`<object>`、`<embed>`、`<link>`、`<meta>`、事件属性与危险协议 URL 一律移除，双击打开导出的 `.html` 时，稿件中的裸 HTML 不执行。
- **外链判定采用「归一化 + 协议白名单」**：`JavaScript:`、`java\tscript:`、实体编码等变体按危险协议处理。
- 代码块的围栏语言串、语言标签与提示卡片标题在拼入产物前转义，畸形语言串不能生成额外 `style` 属性或注入元素。

### 变更

- 「参考资料」脚注的判定改为协议白名单（`http`/`https`/`mailto`）：相对路径（如 `./notes.md`）与 `ftp:`、`tel:` 等不再计入脚注，但仍原样保留在产物里。

### Security

- **The copy fallback path sanitizes before insertion** (environments without `ClipboardItem`): rendered output is parsed, stripped of script-like containers and event attributes, and only then inserted into the WebUI main document. That document is same-origin with the host, so event attributes execute when mounted.
- **Custom theme style values reject double quotes**: a style value is concatenated verbatim into `style="…"`, where a double quote can close the attribute and inject arbitrary attributes; single quotes remain valid. Theme colors and body font size share shape validation across `POST /render` and document saving.
- **Copy and export output strips dangerous tags and event attributes during cleanup**: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, event attributes and dangerous-protocol URLs are removed, so bare HTML in the manuscript does not execute when the exported `.html` is opened by double-clicking.
- **External link detection uses normalization plus a protocol whitelist**: variants such as `JavaScript:`, `java\tscript:`, and entity-encoded forms are handled as dangerous protocols.
- Code block fence language strings, language labels, and prompt card titles are escaped before output composition, so malformed language strings cannot produce extra `style` attributes or inject elements.

### Changed

- The "References" footnote check now uses a protocol whitelist (`http`/`https`/`mailto`): relative paths (such as `./notes.md`) and `ftp:`, `tel:` and the like are no longer counted as footnotes, but they are still kept verbatim in the output.

## [1.0.1] - 2026-09-23

### 修复

- 适配 DSH 0.1.7 的 ui-primitives 图标导出名（尺寸后缀与字重后缀两种形式）：主题图标、下拉箭头与选中勾按「0.1.7 名 → 0.1.5 名」在运行时探测解析，两代宿主共用一份产物。
- 适配 DSH 0.1.7 客户端「Session 多实例」的当前会话解析：0.1.7 读取右侧栏座位的挂载会话，0.1.5 读取会话列表快照；轮询在两代宿主上均能定位当前会话。
- 右侧栏引导页的鱼排入口补上条目 id（0.1.7 起引导条目按 id 标识）。
