# Changelog

本项目的更改记录在此文件。

All notable changes to this project are documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
