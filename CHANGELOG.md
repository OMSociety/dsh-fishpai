# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 未发布

首个版本。fork 自 [mopai-markdown](https://github.com/ye4wzp/mopai-markdown)（MIT），重构为 DSH 插件。

### Added

- 宿主侧工具 `fishpai_open` / `fishpai_read` / `fishpai_write` / `fishpai_render`：
  打开文档、读块级 diff 与批注、按 `base_revision` 局部改稿、导出可粘贴的 HTML。
- 宿主侧 `/fishpai/api/*` 路由与文档存储（`.fishpai/` 下的 `docs/` 文档、`state/` 状态与 `history/` 快照），路径限定在会话工作目录内。
- 客户端右侧栏面板：Markdown 源码 + 公众号实时预览、13 主题与 12 预设色、字号、
  微信脚注与 mac 代码块开关、手机 375px 预览、复制到公众号、导出 HTML。
- 块级批注与行内占位（`<!-- 鱼排: … -->`），供模型读取人改了什么、想要什么。
- `fishpai` 技能：主题选择、按块改稿纪律、排版建议。
- 渲染内核 ESM 化，并固化为字节级 golden 回归测试。
