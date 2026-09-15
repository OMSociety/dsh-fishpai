# AGENTS.md — 鱼排 FishPai

Instructions for coding agents working on this repository (`OMSociety/dsh-fishpai`).

## 这个仓库是什么

- **DSH 插件**：宿主侧（Node）+ 客户端侧（浏览器）两半在同一个包里。
- **上游 fork**：`ye4wzp/mopai-markdown`（MIT）。上游 SPA 原样放在 `legacy-site/`，不要改它，
  它是渲染一致性的最后一道对照依据。署名/许可链条见 `NOTICE.md`。

## 不可违反的不变量

1. **渲染字节级一致**。`plugin/core/render.mjs` 在 `annotate`／`imageResolver`／`wrapText`／
   `wechatBackground` 都关闭时，输出必须与 `test/golden/**` 逐字节相同。改渲染代码前先跑 `npm test`；
   golden 只能用 `npm run test:golden:regen` 重生成（**默认用冻结 oracle**），且重生成必须说得清
   "为什么上游行为变了"。`plugin/vendor/themes.js` 是**数据**：上面说过的删/改主题就属于这一类，
   重生成 golden 用默认 oracle 即可（oracle 读的是同一个文件，验证的是渲染逻辑没被带歪）。
   **允许的三处偏离都只走复制/导出（publish）那条路径，且都由调用方显式开启**：
   - `wrapText`：把文字包进 `<span>`，让微信的结构校验不再把"含行内元素的段落"误报成行高过小。
     必须是**纯叠加**的（`test/wechat-structure.test.mjs` 守着），默认路径一个字节都不许动。
     它有两半：① 文字包 span（防行高误报）；② 给"以**行内元素**开头"的 `<li>` 前面补一个 U+00A0——
     微信会把**条目开头**的行内片段单独起一行（`1. **标签**：说明` 会被拆成两行）。补一个文字节点即可，
     "整条 li 包一个 span"试过无效（`37748d4` 加、`32ac970` 撤）；补的必须是真 U+00A0 字符，
     不能写 `&nbsp;` 实体（源码级扫描会把它当普通文字）。
     块级元素（`<p>`/`<ul>`/`<blockquote>`…）开头的条目**不许**补：松散列表（条目间有空行）第一条
     就是 `<p>`，补进去的文字节点会落在 `<p>` 外面、变成 `<li>` 的直接文字子节点（结构上多余）。
     松散列表本来就正常，别为它加东西。
   - `wechatBackground`：把 `background:` 简写拆成 `background-color:`／`background-image:`。
     微信的安全过滤按属性名过，简写会整条被丢（引用块的框、表头底色实测会消失）。
     必须是**纯规范化**（同一条测试守着"除了这几个属性名，别的字节一个都不动"）。
   - `promoteFontSize`：把选定的字号从 wrapper 推进到 p / li / blockquote 上。微信粘进去
     会剥掉最外层 wrapper 的样式，字号只挂在 wrapper 上等于没设（正文退回 16px，预览里却好好的）。
     同样**纯叠加**：没传 `fontSize` 时不加任何字节；自带字号的元素（h1–h3、表格、部分主题的引用）
     一律不动——表格字号不跟着正文字号走是**上游行为**，跟着改才是 bug；文末「参考资料」那一节
     自己带小字号（它的 `<section>` 粘进去后还在），也不推进。
   三条都**不要**改成默认开启，也不要用 `--from-core` 去"修"golden 失败。
   另有一条**平台限制**（不是渲染偏离，也没有开关）：公众号编辑器**只认黑体**（iOS 设备上才是
   苹方），`font-family` 里的衬线／等宽栈粘进编辑器会退回黑体，只有「导出 HTML」的文件保得住。
   面板预览在浏览器里**看不出这个差别**，所以 `FontPicker` 把衬线／等宽单列一组、标一句橙色
   小字「仅用于导出 HTML」。不要去"修"字体栈，也不要把标注拆掉。
2. **上游那 8 个坑不许"修好"**（完整列表见 `plugin/core/markdown.mjs` 的文件头注释），典型的是：
   紧凑列表项内段落 token 的 `hidden=true` 必须跳过；代码块的 mac 结构嵌在 `pre>code` **内部**；
   站点默认 `sans`/`16px` 总会覆盖主题自带字体字号。与上游不一致 = bug。
3. **不引入 GPL / 无证 / MPL 依赖**。具体禁的是 `Wechatsync` 系（GPL-3.0 / 无证）与 `DOMPurify`（MPL）。
4. **宿主工具用 raw JSON-Schema 注册**（`ctx.tools.register({name, description, parameters, output, execute})`），
   **不要** `import { defineTool } from '@deepseek-ai/dsh-tools'` —— 树外解析不可靠。
5. **客户端 bundle 必须是** `window.__ModuleLoader__.load({ id, factory: (require) => exports })`。
   改完客户端源码必须 `npm run build` 并把 `lib/client.js` 一起提交（`dsh plugin add` 不构建）。
6. **样式只用 `--dsw-alias-*` 主题变量**；旧名（`--dsw-text-secondary` 一类）在新版 DSH 里一个都不存在。
7. **文件只能落在会话工作目录内**（`header.cwd`），并过扩展名白名单；不做任意路径读写。
8. **绝不静默覆盖人的手改**：任何写入都要带 `base_revision`，不匹配就拒绝并回带最新 diff。
   **块的行范围包含末尾那个空行**（块与块的分隔符）：`applyPatches` 的 `replace` 必须把分隔空行补回去，
   否则下一块会被 markdown 的"懒延续"并进列表/段落，下一轮再改那个被并大的块就**会把它整段删掉**
   （实测踩过：改列表项吃掉了文末两行）。`test/host.test.mjs` 有回归守卫。
9. **`package.json` 的 `dsh.client.inject` 是「包依赖边」，不是服务依赖**。它声明的是
   "这一行的 factory 到位前必须先到位的**包**"（DSH `dsh-client-modules` 的 `WebBootEntry`：
   "names package rows whose factories must arrive before this row materializes"），
   名字对不上任何包行时被**静默忽略**。本包客户端只 require **shell 的基线模块**
   （`react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`）——基线模块与
   `react` 同级、任何 bundle 都能直接 require，**不是图里的行**，所以这个字段留空；
   **服务依赖由 bundle 导出的 `inject` 决定**，把 `slots` / `sessions` 这类服务名写进去是无效声明。
   `test/client.bundle.test.mjs` 有守卫。
10. **块 id 一律来自 `splitBlocks`**（`plugin/host/routes.mjs` 的 `liveSurface`）：批注锚点与
    `fishpai_write` 的 `block_id` 用的就是它。渲染器自己的 blocks 只服务于 HTML 里的
    `<fp-block data-b>` 锚点，随 `macCodeBlock` 等渲染选项变化，**不能**当成面板的块清单。
11. **图标用 DSH 内建的那一套，不引第三方图标包**：主题图标取
    `@deepseek-ai/dsh-client-ui-primitives` 的 `Icon*` 导出（右侧栏画图标用的同一套，画法一致），
    鱼排自己的标在 `client/icons.tsx` 里按同一口径自绘（16px 网格、约 1.05 描边、圆角连接）。
    **颜色只走 `currentColor` 与 `--dsw-alias-*` 令牌**，浅色/深色共用一套图，绝不硬编码颜色。
    取不到那个基线模块时必须降级（退回纯文字）而不是让插件整块加载不了。
    加了主题就往 `THEME_GLYPH` 补一行，`test/theme-info.test.mjs` 会检查不漏。
12. **编辑器的快捷键与格式化动作只有一份实现**（`client/mdedit.ts`，纯函数）：
    `SHORTCUTS` 一张表同时喂键盘匹配 `matchShortcut()`、界面上的速查表 `shortcutHint()` 与测试——
    别在别处再抄一份键位或文案。编辑动作必须走 `document.execCommand('insertText')`
    （退回受控赋值只在浏览器不支持时发生）：直接改 `value` 会让 `Ctrl+Z` 的原生撤销栈作废，
    而"按了加粗发现手滑、想撤销"是最常见的动作。加动作/改键位只改这个文件，并补 `test/mdedit.test.mjs`。
13. **粘贴进来的图片只落在文档同级的 `assets/`**：`POST /fishpai/api/upload` 是写图片资产的入口
    （新建文件一共两处：`/upload` 存图、`POST /doc` 建文档，文件名与路径都由宿主生成），
    文件名由宿主生成（时间戳 + 按 MIME 定的白名单扩展名），客户端给的名字只当一段可读词、不参与路径拼接；
    大小上限是 `store.mjs` 的 `MAX_ASSET_BYTES`（与内嵌上限共用一个常量，避免"存得进来却内嵌不了"）。
    正文仍然只能由 `/doc` 改——存图不许顺手改字。
14. **自定义主题是数据，不是代码**：`plugin/core/theme-spec.mjs` 只做**校验 + 合并**，**绝不求值模型给的代码**。
    - 属性白名单（`SPEC_PROPS`）**统计自**内置 11 套主题实际用过的声明——那 11 套是真人实测能在公众号里活的；
      要加属性得先给出"在公众号里活下来"的证据，并让 `test/theme-spec.test.mjs` 的"白名单不许漏"守卫仍然绿。
    - 规格只认 `name` / `base` / `styles`：多写的键一律报错而**不是默默忽略**（写了没作用，比不让写更骗人）；
      必须在某套内置主题上做**增量覆盖**——渲染器对缺槽位是"不加 style 属性"，从零写一套等于大部分元素没样式。
    - `wrapper` 必须含 `font-family` / `font-size`：漏了面板的「字体」「字号」会变成点了没反应的死控件
      （校验器会从 base 补齐并说明原因）；保留 `{{PRIMARY}}` / `{{PRIMARY_BG}}` 占位符（面板色板因此仍有效）；
      `!important` 去掉（微信不保留它）。
    - 存下来的那套是**工作目录级、只有一套**：`<cwd>/.fishpai/theme.json`，面板里是**一个**「自定义主题」占位，
      由 `plugin/host/custom-theme.mjs` 的 `themeFor()` 解析——**没有主题库**，没有命名/列表管理，`set` 即覆盖；
      文件缺失或被改坏时**静默退回默认主题**（与 `safeThemeKey` 同口径），不留"选不中的状态"。
    - **图标不归模型**：合法图标名只在浏览器那半（66 个 `Icon*` 导出），让模型选就得在宿主再抄一份名单、迟早静默失配。
      `.json` 只对**宿主拼死**的这条路径放行，`.fishpai/state/*.json` 仍然不可达。
    - 最容易踩的一条：**换主题不动 `revision`**，所以面板靠 `/state` 的 `active.theme` 发现它，并且
      **只换 meta、不重载正文**——别让用户正在打的字被换掉。

## 命令

```powershell
npm install          # 只有 devDependencies（esbuild / typescript / @types/react / @types/react-dom / @deepseek-ai/cordis）
npm test             # node --test：golden + 站点对照 + 块/diff/批注/补丁 + 宿主红线 + 微信兼容层 + 主题规格 + bundle + 快捷键 + 挂载
npm run typecheck    # 客户端 TSX 类型检查
npm run build        # esbuild → lib/client.js（__ModuleLoader__ 形态）
npm run check:build  # 构建后确认 lib/ 无漂移（CI 用）
```

本地安装验证需要**用户自己**停/起 `dsh web`（node-pty 文件锁）；agent 不自行停启主服务。

## 改客户端 UI 时

先读本机同伴插件的真实写法（它们都跑在同一个 DSH 上）：

- `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-github-workbench\lib\client.js`
  —— 官方右侧栏 + `dsh-better-sidebar` **双通道注册与回退**的完整先例
- `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-context\lib\client.js`
  —— `sidebar.right.pane.tab` 席位注册、`--dsw-alias-*` 样式写法
- `dsh-better-sidebar\src\client\service.ts` —— `TabDescriptor` 与 `registerTab` 的完整契约

写样式时的一个坑：**`client/styles.ts` 的 CSS 装在模板字符串里**，注释里**别出现反引号字符**
（想提变量名就直接写名字或用引号）——它会把字符串提前闭合，`tsc` 报 TS1005、构建直接失败（实测踩过一次）。

## 文档纪律

交付物只写最终采用的客观状态：被否方案、中间尝试、负向约束不写进 README / CHANGELOG / 提交信息。
版本号变更单独报备用户后再动。
