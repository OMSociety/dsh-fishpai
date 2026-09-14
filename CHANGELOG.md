# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### Added

- 面板的空白状态（没有文档时）改成一张能用的卡片：品牌行 + 一句说明 + 真能点的动作。
  载入中是走马灯；载入失败写明原因并可「重试」；还没有文档时可以「新建空白文档」，
  也可以从「最近打开」里点开这个工作目录里已有的鱼排文档。
  宿主配套新增 `POST /fishpai/api/doc`（新建，`baseline` 保持 `null`）与
  `POST /fishpai/api/active`（切换当前文档）。
- 快捷键提示分系统显示：Mac 显示 `⌘` / `⌘⇧C`，其它平台显示 `Ctrl` / `Ctrl+Shift+C`。
  键盘处理一直同时接受 meta 与 ctrl，提示只是文案。
- 图标：鱼排自己的**鱼形标**（自绘，16px 网格、`currentColor`）出现在标签页 chip 与
  「新标签页」引导列表里（后者原先是没有 `icon` 时的立方体占位）。
- 主题列表换成带图标的列表：13 套主题各有 16px 描边图标，取自 DSH 内建的图标集
  （`@deepseek-ai/dsh-client-ui-primitives`，右侧栏画图标用的同一套），不再用 emoji。
  原生 `<select>` 的 `<option>` 放不进 SVG，所以主题选择器改为自绘 listbox，
  保留 ↑↓ / Enter / Esc 与点击外部关闭。
  图标全部走 `currentColor` + `--dsw-alias-*` 令牌，**浅色与深色主题共用一套，不需要两套图**。

### Fixed

- **复制到公众号不再被平台的结构校验报「行高过小」**。公众号编辑器的 line-height 规则是实测的：
  `行数 = Range.getClientRects().length`，而**行内元素会把同一行拆成多个矩形**——一个
  `line-height: 1.8` 的两行段落只要含一个链接，矩形数就是 6，"平均行高"被算成 8.97px < 15.2px，
  于是被报成"行高小于字体大小，且存在多行文本，可能导致文字重叠（实测）"。
  现在复制/导出的产物会把文字包进 `<span>`（块级元素不再有直接文字子节点，那条规则不再命中），
  这也正是微信自己插入内容后的形态。渲染内核的默认路径保持与上游逐字节一致，
  兼容层只走 publish 一条路径、且是纯叠加（`test/wechat-structure.test.mjs` 守着）。
  13 套主题用微信官方校验器实测通过 11 套（10 套「适合公众号」的 + `dark_night`）；`tech`/`gradient` 会命中
  `darkmode-no-gradient`（与面板里"微信可能掉样式"的提示一致，要发公众号请用「默认公众号」）。

## [0.1.0] - 2026-09-15

首个版本。fork 自 [mopai-markdown](https://github.com/ye4wzp/mopai-markdown)（MIT），重构为 DSH 插件。

### Added

- 宿主侧工具 `fishpai_open` / `fishpai_read` / `fishpai_write` / `fishpai_render`：
  打开文档、读块级 diff 与批注、按 `base_revision` 局部改稿、导出可粘贴的 HTML。
  `path` / `out_path` 可省略扩展名（自动补 `.md` / `.html`）。
- 宿主侧 `/fishpai/api/*` 路由与文档存储（`.fishpai/` 下的 `docs/` 文档、`state/` 状态与 `history/` 快照），路径限定在会话工作目录内。
- 客户端右侧栏面板：Markdown 源码 + 公众号实时预览、13 主题与 12 预设色、字号、
  微信脚注与 mac 代码块开关、手机 375px 预览、复制到公众号、导出 HTML。
  - 面板显示的信息（块清单、行内占位、图片与「需手动上传」提示、批注锚点、历史）跟着当前正文实时刷新。
  - 批注可一键定位并选中它引用的片段；被改写过的引用会退回原块并说明原因。
  - 复制/导出失败给出原因与替代按钮；批注写入失败时已输入的文字保留在输入框里。
- 块级批注与行内占位（`<!-- 鱼排: … -->`），供模型读取人改了什么、想要什么。
- `fishpai` 技能：主题选择、按块改稿纪律、排版建议。
- 渲染内核 ESM 化，并固化为字节级 golden 回归测试。
