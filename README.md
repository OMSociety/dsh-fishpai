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
plugin/core/            渲染内核（ESM，零依赖）
  runtime.mjs             vendor 资产的 vm 顶层求值（themes.js 不挂 window，必须这样取）
  markdown.mjs            与站点一致的所有渲染规则 + 顶层块切分（块的 id 是内容寻址的）
  render.mjs              渲染主流程（annotate 预览锚点 / imageResolver 图片内嵌，均默认关闭）
  diff.mjs                块级 diff（LCS 对齐 + 改写配对 + 大改折叠）
  notes.mjs               行内占位抽取 + 批注重锚（id → hash → 引用包含度 → orphan）
  patch.mjs               按块 id 的局部改稿（replace / insert_after / delete）
plugin/host/            宿主侧：工具契约、HTTP 路由、文档存储、图片
plugin/vendor/          上游 themes.js + markdown-it 14.1.0 + highlight.js 11.9.0 + hljs-map.json
client/                 客户端源码（TSX → esbuild 打成 lib/client.js）
lib/client.js           客户端 bundle（入库；dsh plugin add 不做构建）
skills/fishpai/         鱼排技能：教模型怎么选主题、怎么按块改稿
legacy-site/            上游 SPA 原样留存，便于本地起站复核渲染一致性
test/                   渲染 golden、站点剪贴板对照、块/diff/批注/补丁、宿主红线、bundle 形态
```

## 面板里能做什么

- **源码 + 实时预览**：打字 300ms 后预览跟着变；栏位够宽就左右并排，窄了自动单栏（编辑/预览 切换）
- **13 套主题 · 12 个预设色 · 自定义取色 · 字号 · 微信脚注开关 · mac 代码块开关**
- **手机宽度预览**（375px），看公众号里的真实观感
- **复制到公众号**：写 `text/html` + `text/plain` 双格式；本地图片（相对路径的磁盘图）会先内嵌成 base64，
  粘进编辑器不丢图（微信仍要求你在编辑器里重新上传一次，这是平台限制）
- **导出 HTML**：自包含文件，可直接归档或交给别人
- **批注**：光标放在某段上点「＋批注」，模型下次 `fishpai_read` 就会看到「哪一块、要怎样」；
  也可以直接在正文里写 `<!-- 鱼排: 这里补个过渡 -->`
- **历史回滚**：每次写入留快照，面板里一键回到任何一版
- **自动保存**（800ms 防抖）与 **冲突不丢字**：模型和你同时改时，面板给你「用我的覆盖 / 看 AI 的版本」

## 与墨排一致的验证

`plugin/core/render.mjs` 是上游渲染管线的 ESM 移植，**在预览锚点（`annotate`）与图片内嵌（`imageResolver`）
都不生效时，输出与迁移前的 `render.js` 逐字节相同**（`test/golden/**`，由迁移前的冻结实现 `test/oracle/render.cjs` 生成——
两份独立代码互为对照）。面板的预览与复制会显式开这两个能力，默认路径始终保持一致。

在此之上，`test/site-parity.test.mjs` 用**从墨排线上站点抓下来的真实剪贴板内容**
（`test/golden/site-clip.default.html`）做金标准，规范化后逐字符比对本地输出——所以"与墨排一致"这句话
在仓库内、离线就能复验，不依赖站点是否还在线。`legacy-site/` 留着上游原始站点，需要时可本地起站复跑对照。

## 开发

```powershell
npm install        # 只有 devDependencies（esbuild / typescript / @types/react）
npm test           # 渲染 golden + 站点对照 + 块/diff/批注/补丁 + 宿主红线 + bundle 形态
npm run typecheck  # 客户端 TSX 类型检查
npm run build      # 重新打包 lib/client.js（改完客户端必须跑，并提交产物）
```

## 安装

```powershell
# 先停 dsh web（node-pty 文件锁），在你的独立控制台执行：
dsh plugin --profile web add github:OMSociety/dsh-fishpai#v0.1.0
# 再启动 dsh web
```

装好后右侧栏会多出「鱼排编辑器」入口（官方右侧栏的 + 菜单或引导页里也能找到它）。
本插件零运行时依赖，不受 `minimumReleaseAge` 影响。

### 装完怎么验（人工 E2E 清单）

1. 让模型写一篇公众号文章 → 右侧栏应**自动弹出**鱼排并显示正文与预览
2. 在面板里打字 → 预览跟着变；宽栏可「并排」，窄栏自动单栏
3. 光标放在某段上点「＋批注」，写一句要求；再到正文里写一行 `<!-- 鱼排: 这里补个过渡 -->`
4. 让模型 `fishpai_read` → 它应当说出**你改了哪一块、批注要求什么、占位在哪一行**
5. 让模型 `fishpai_write`（`mode:"patch"`）→ 只有那块变了，你其它改动原样保留
6. 点「复制到公众号」，粘进微信编辑器 → 版式正确（列表/引用/表格/代码块/信息卡片）
7. 在模型写入后你继续改字，再让模型用**旧** revision 写入 → 应当被拒绝并回带"你改了什么"
8. 换主题、调字号、开「手机」、点「导出」→ 文件落地可打开

## 许可

MIT。上游 `mopai-markdown` © 2026 ye4wzp；本仓库新增部分 © 2026 OMSociety。详见 [`LICENSE`](LICENSE) 与 [`NOTICE.md`](NOTICE.md)。
