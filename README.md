# 鱼排 FishPai

> 公众号排版工作台，长在 DeepSeek Harness 的右侧栏里。
> 人在侧栏改字、加批注占位；模型通过**块级 diff**看懂人改了什么、想要什么；成品仍由人复制粘贴进公众号编辑器。

鱼排是 [MoPai 墨排 / mopai-markdown](https://github.com/ye4wzp/mopai-markdown) 的 fork：
13 套主题与渲染管线取自上游（MIT），本仓库把同一套内核重构为 DSH 插件。
署名与许可链条见 [`NOTICE.md`](NOTICE.md)。

## 它解决什么

墨排网页版是个纯前端 SPA：**一次只能手动编一篇，编辑器在浏览器标签页里，和模型看不见彼此**。
鱼排把同一套渲染管线搬进 DSH：

| | 墨排网页版 | 鱼排 |
|---|---|---|
| 编辑位置 | 独立网页 | DSH 右侧栏（官方右侧栏为主，`dsh-better-sidebar` 为回退） |
| 与模型的关系 | 无（自带一个 AI 助手面板） | **模型能读能写**：块级 diff + 批注 + `base_revision` 防覆盖 |
| 排版结果 | 复制到公众号 | 同一套渲染器，同一份输出；复制/导出/预览三处一致 |
| 发布 | 复制粘贴（或多平台分发） | **只做复制粘贴**（不做公众号 API、不做多平台分发） |

## 工作流

```
你：让模型写/改一篇公众号文章
模型：fishpai_open        → 右侧栏自动弹出鱼排，写入 baseline
你：  在侧栏改字、加批注、插占位（<!-- 鱼排: 这里补个过渡 -->）
模型：fishpai_read       → 拿到块级 diff（改了哪块/加了哪块/删了哪块）+ 批注清单 + 占位清单
模型：fishpai_write      → 带 base_revision 局部改回，绝不覆盖你的手改
你：  点「复制到公众号」 → 粘进微信编辑器
```

## 目录

```
plugin/index.mjs        宿主入口：注册工具 + /fishpai/api 路由 + fishpai 技能
plugin/core/            渲染内核（ESM，零依赖）：render / blocks / diff / notes
plugin/host/            工具契约、HTTP 路由、文档存储与路径守卫
plugin/vendor/          上游 themes.js + markdown-it 14.1.0 + highlight.js 11.9.0 + hljs-map.json
client/                 客户端源码（TSX，esbuild 打成 lib/client.js）
lib/client.js           客户端 bundle（入库；dsh plugin add 不做构建）
skills/fishpai/         鱼排技能：教模型怎么选主题、怎么按块改稿
legacy-site/            上游 SPA 原样留存，便于本地起站复核渲染一致性
test/                   渲染 golden、块模型、diff、存储、工具契约
```

## 与墨排一致的验证

`plugin/core/render.mjs` 是上游渲染管线的 ESM 移植，**关掉预览注解与图片内嵌时，输出与迁移前的
`render.js` 逐字节相同**；而 `render.js` 已与墨排线上站点做过两轮对照：

- 真实预览 DOM：13 主题 × 覆盖标题/引用/嵌套列表/表格/代码块/信息卡片/脚注的样本，全部一致
- 真实剪贴板：点站点「复制到公众号」后的 `text/html`，规范化后零差异

仓库内的回归测试把这些结论固化为字节级快照；`legacy-site/` 保留原始站点，需要时可本地起站复跑对照。

## 安装

```powershell
# 先停 dsh web（node-pty 文件锁），在你的独立控制台执行：
dsh plugin --profile web add github:OMSociety/dsh-fishpai#v0.1.0
# 再启动 dsh web
```

## 许可

MIT。上游 `mopai-markdown` © 2026 ye4wzp；本仓库新增部分 © 2026 OMSociety。详见 [`LICENSE`](LICENSE) 与 [`NOTICE.md`](NOTICE.md)。
