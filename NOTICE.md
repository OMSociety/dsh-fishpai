# 起源与第三方许可（NOTICE）

鱼排（FishPai，仓库 `OMSociety/dsh-fishpai`）是 [MoPai 墨排 / mopai-markdown](https://github.com/ye4wzp/mopai-markdown)
的 **fork**，在保持上游 MIT 许可与版权声明的前提下，重构为 DeepSeek Harness（DSH）插件。

## 1. 上游

| 项 | 内容 |
|---|---|
| 上游仓库 | https://github.com/ye4wzp/mopai-markdown |
| 上游作者 | ye4wzp |
| 许可 | MIT |
| 本仓库 fork 自 | `main`（fork 时的上游 HEAD） |
| 上游原样保留位置 | `legacy-site/`（去掉 `screenshots/`，其余原样：`index.html`、`css/`、`js/`、`docs/`、`DESIGN.md`、`README*.md`、`tests/` 等） |

鱼排直接复用了上游两项核心资产，均为 MIT：

1. **主题定义** —— 上游 `js/themes.js` 复制为本仓库 `plugin/vendor/themes.js`（换行符归一为 LF；
   另外**有意删除了两套主题**：「金融时报（ft）」与「Medium」——前者靠整页异色底立身、公众号文章不要
   整页底色，后者与「纽约时报」只剩字号与字体栈的差别）。上游那 13 套的原版文件仍在 `legacy-site/js/`，
   需要逐字节比对时看那边。
2. **渲染管线设计** —— 「先渲染 HTML，再给每个标签内联主题样式」「复制到公众号时把代码块内
   span 的计算样式内联」「h4–h6 套 h3 样式」「外链转文末参考资料」等行为与验收标准。

## 2. 打包进本仓库的运行时依赖

| 文件 | 版本 | 许可 | 版权 |
|---|---|---|---|
| `plugin/vendor/markdown-it.min.js` | markdown-it 14.1.0 | MIT | © markdown-it contributors |
| `plugin/vendor/highlight.min.js` | highlight.js 11.9.0 (git f47103d4f1) | BSD-3-Clause | © 2006-2023 highlight.js contributors |
| `plugin/vendor/themes.js` | 上游同步（移除两套主题，见上） | MIT | © 2026 ye4wzp |
| `plugin/vendor/hljs-map.json` | — | MIT（本仓库整理） | 从真实浏览器导出的 highlight.js token 计算样式表 |

`markdown-it` 与 `highlight.js` 的运行时代码随本插件一起分发，故在此保留其声明。
BSD-3-Clause 要求保留版权声明与免责声明；两处声明均完整保留在对应 `.min.js` 文件的首部注释中。

## 3. 刻意**未**引入的东西

| 项目 | 原因 |
|---|---|
| `wechatsync/Wechatsync` 及其派生的 `article-syncjs` | 上游为 GPL-3.0，派生物**没有**许可证文件（默认保留全部权利）。鱼排不做多平台分发。 |
| `DOMPurify` | 许可为 `(MPL-2.0 OR Apache-2.0)`，MPL 是文件级 copyleft。鱼排的渲染在宿主侧完成，预览走沙箱 iframe，不需要它。 |

## 4. 本仓库新增部分的许可

新增代码同样以 MIT 发布，版权归 OMSociety。完整条款见 `LICENSE`。
