# 鱼排 FishPai

> 公众号排版工作台，长在 DeepSeek Harness 的右侧栏里。
> 人在侧栏改字、加批注占位；模型通过**块级 diff**看懂人改了什么、想要什么；成品仍由人复制粘贴进公众号编辑器。

鱼排是 [MoPai 墨排 / mopai-markdown](https://github.com/ye4wzp/mopai-markdown) 的 fork：
主题与渲染管线取自上游（MIT），本仓库把同一套内核重构为 DSH 插件。
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
- **11 套主题 · 12 个预设色 · 自定义取色 · 字号 · 微信脚注开关 · mac 代码块开关**
- **Markdown 快捷键**（编辑器右上角「快捷键」里有一张速查表，与键盘处理同一份来源）：
  加粗 `Ctrl/⌘+B`、斜体 `Ctrl/⌘+I`、行内代码 `Ctrl/⌘+E`、链接 `Ctrl/⌘+K`、删除线 `Ctrl/⌘+Shift+X`、
  标题 `Ctrl/⌘+Alt+1/2/3`（`+0` 去掉标题）、引用 `Ctrl/⌘+Shift+.`、
  无序/有序列表 `Ctrl/⌘+Shift+8` / `+7`；`Tab`/`Shift+Tab` 缩进反缩进，列表里回车自动接着写下一项。
  这些编辑动作走浏览器的原生输入路径，**`Ctrl+Z` 撤销照旧可用**
- **图片直接粘进来**：截图或图片文件 `Ctrl/⌘+V` 粘到编辑器（也可以把图片拖进去）→
  存到**文档同级的 `assets/`** 目录，正文里自动插入 `![](assets/xxx.png)`；
  预览立刻显示，复制到公众号时同样被内嵌成 base64
- **手机宽度预览**（375px），看公众号里的真实观感
- **复制到公众号**：写 `text/html` + `text/plain` 双格式；本地图片（相对路径的磁盘图）会先内嵌成 base64，
  粘进编辑器时图片跟着一起过去、**不需要手动重新上传**（编辑器接收后由微信自行转存）。
  会被微信拦掉的是**外链图**（`http(s)://` 指向别处），以及内嵌不了的本地图（文件不在、在工作目录外、超过 5 MB）。
  产物还带一层微信兼容层（文字包进 `<span>`、`background` 简写拆成长写），见下文。
- **导出 HTML**：自包含文件，可直接归档或交给别人
- **批注**：光标放在某段上点「＋批注」，模型下次 `fishpai_read` 就会看到「哪一块、要怎样」；
  也可以直接在正文里写 `<!-- 鱼排: 这里补个过渡 -->`
- **批注可定位**：点批注卡片上的「定位」→ 编辑器里**选中它引用的那段文字**；那句已被改写就退回
  它原来所在的块并说明原因。在「预览」视图下点「定位」会自动切到带编辑器的视图，而不是没有反应
- **面板信息跟着正文走**：块清单、待补占位、图片提示、批注锚点都在打字后自动刷新，不用手动点刷新
- **失败会说清楚**：复制/导出失败时红色提示会写清原因并告诉你改用另一个按钮；
  批注没写成功时，文字仍留在输入框里
- **历史回滚**：每次写入留快照，面板里一键回到任何一版
- **自动保存**（800ms 防抖）与 **冲突不丢字**：模型和你同时改时，面板给你「用我的覆盖 / 看 AI 的版本」

## 与墨排一致的验证

`plugin/core/render.mjs` 是上游渲染管线的 ESM 移植，**在预览锚点（`annotate`）与图片内嵌（`imageResolver`）
都不生效时，输出与迁移前的 `render.js` 逐字节相同**（`test/golden/**`，由迁移前的冻结实现 `test/oracle/render.cjs` 生成——
两份独立代码互为对照）。面板的**预览**只额外开锚点，那条路径同样与站点逐字节一致；
**复制/导出**还会加两层微信兼容层（`wrapText`、`wechatBackground`），见下两节。

在此之上，`test/site-parity.test.mjs` 用**从墨排线上站点抓下来的真实剪贴板内容**
（`test/golden/site-clip.default.html`）做金标准，规范化后逐字符比对本地输出——所以"与墨排一致"这句话
在仓库内、离线就能复验，不依赖站点是否还在线。`legacy-site/` 留着上游原始站点，需要时可本地起站复跑对照。

**主题清单有意与上游不同**：上游的「金融时报」与「Medium」两套已移除——前者靠整页粉橙异色底立身
（公众号文章不适合整页底色，去掉底之后与相邻的衬线主题几乎一样），后者与「纽约时报」只剩字号与字体栈的差别。
`Claude` 主题的整页米色底也去掉了，其余风格保留。上游原版 `themes.js` 仍完整留在 `legacy-site/` 里。

**两处有意的偏离**（都只在**复制到公众号 / 导出 HTML** 这条路径上，且都请调用方显式开启）：

- `wrapText`：把文字包进 `<span>`，见下节。它只加一层不带样式的 `<span>`、视觉零影响，
  `test/wechat-structure.test.mjs` 守着"去掉它加的那层裸 span 就回到默认产物"这条纯叠加性质。
- `wechatBackground`：把 `background:` 简写拆成 `background-color:` / `background-image:`。
  微信编辑器的安全过滤是**按属性名**过的，`background` 简写不在名单里，于是引用块的框、表头底色、
  行内代码底色粘过去会**整条丢掉**（实测：竹林主题的引用块在面板里是绿框、粘进公众号就成了普通段落）。
  拆长写是纯规范化：一条声明里只有一个值时，两种写法的渲染结果完全一致。

## 正文的「行高过小」是怎么消掉的

公众号编辑器插入内容后会跑一遍结构校验（微信官方规范
[《微信公众平台编辑器插件开发规范》](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html)
§1.3，官方实现 [wechatjs/verify-article-structure-spec](https://github.com/wechatjs/verify-article-structure-spec)）。
它的 line-height 规则是**实测**的：

```
lineCount   = Range(节点).getClientRects().length
overlapping = lineHeight === 0 || (lineCount >= 2 && 内容高度 / lineCount < 0.95 × 字号)
```

它把"矩形个数"当行数，而**行内元素（`<span>` / `<a>` / `<strong>`）会把同一行拆成多个矩形**。
实测：一个 `line-height: 1.8` 的两行段落，只要中间有一个链接，矩形数就是 6 →
"平均行高"被算成 8.97px < 15.2px → 被报成「行高小于字体大小，且存在多行文本，可能导致文字重叠（实测）」。
**这是校验器的误报**（`line-height` 1.8 并不会重叠），但提示会一直在。

鱼排的做法：复制/导出时把文字包进 `<span>`——块级元素不再有**直接文字子节点**，那条规则就不再命中；
这恰好也是微信自己插入内容之后的形态（`<span leaf="">`）。11 套主题用微信官方校验器实测：
**「适合公众号」的 8 套 + `dark_night` 全部通过**（`tech` / `gradient` 会被另一条 `darkmode-no-gradient`
标出，与面板里"微信可能掉样式"的提示一致）。

**一处已知边界**：**代码块**里的文字走的是 markdown-it 的 `fence` 规则（mac 标题栏结构是上游的坑之一，
不能动那条规则），`wrapText` 包不到它；而代码块天然多行，同一套"内容高度 ÷ 矩形数"的算法照样算小，
于是**带围栏代码块的文章仍会被标出那条 line-height**——上游形态（墨排）也一样。
正文段落、引用、列表、表格、信息卡片都不受影响。

想自己复验，见下节。

## 开发

```powershell
npm install        # 只有 devDependencies（esbuild / typescript / @types/react）
npm test           # 渲染 golden + 站点对照 + 块/diff/批注/补丁 + 宿主红线 + 微信结构 + bundle 形态
npm run typecheck  # 客户端 TSX 类型检查
npm run build      # 重新打包 lib/client.js（改完客户端必须跑，并提交产物）
```

### 可选：用微信官方校验器复验（需要本机 Chrome，不进依赖）

```powershell
git clone --depth 1 https://github.com/wechatjs/verify-article-structure-spec "$env:TEMP\was"
cd "$env:TEMP\was\cli"; $env:PUPPETEER_SKIP_DOWNLOAD='true'; npm install
$env:PUPPETEER_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npx tsx src/index.ts <导出的 article.html> --json   # isValid: true 即通过
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
6. 点「复制到公众号」，粘进微信编辑器 → 版式正确（列表/引用/表格/代码块/信息卡片）；
   正文段落不再弹「行高小于字体大小」；**带围栏代码块**的文章仍会弹那一条（见上文已知边界）
7. 在模型写入后你继续改字，再让模型用**旧** revision 写入 → 应当被拒绝并回带"你改了什么"
8. 换主题、调字号、开「手机」、点「导出 HTML」→ 文件落地可打开
9. 边打字边看状态条：新插一张图、写一行 `<!-- 鱼排: … -->` → 图片与待补计数、块清单跟着变
10. 光标放到正文里某段 → 点「＋批注」；再点这条批注的「定位」→ 源码里选中它引用的那段
11. 在「预览」视图下点任意「定位」→ 自动切到带编辑器的视图并跳过去（不是没反应）

## 许可

MIT。上游 `mopai-markdown` © 2026 ye4wzp；本仓库新增部分 © 2026 OMSociety。详见 [`LICENSE`](LICENSE) 与 [`NOTICE.md`](NOTICE.md)。
