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
   **允许的两处偏离都只走复制/导出（publish）那条路径，且都由调用方显式开启**：
   - `wrapText`：把文字包进 `<span>`，让微信的结构校验不再把"含行内元素的段落"误报成行高过小。
     必须是**纯叠加**的（`test/wechat-structure.test.mjs` 守着），默认路径一个字节都不许动。
   - `wechatBackground`：把 `background:` 简写拆成 `background-color:`／`background-image:`。
     微信的安全过滤按属性名过，简写会整条被丢（引用块的框、表头底色实测会消失）。
     必须是**纯规范化**（同一条测试守着"除了这几个属性名，别的字节一个都不动"）。
   两条都**不要**改成默认开启，也不要用 `--from-core` 去"修"golden 失败。
2. **上游那 8 个坑不许"修好"**（`legacy-site/DESIGN.md` 与 README 里有完整列表），典型的是：
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
13. **粘贴进来的图片只落在文档同级的 `assets/`**：`POST /fishpai/api/upload` 是**唯一**一处写新文件的入口，
    文件名由宿主生成（时间戳 + 按 MIME 定的白名单扩展名），客户端给的名字只当一段可读词、不参与路径拼接；
    大小上限是 `store.mjs` 的 `MAX_ASSET_BYTES`（与内嵌上限共用一个常量，避免"存得进来却内嵌不了"）。
    正文仍然只能由 `/doc` 改——存图不许顺手改字。

## 命令

```powershell
npm install          # 只有 devDependencies（esbuild / typescript / @types/react）
npm test             # node --test：渲染 golden + 块模型 + diff + 批注 + 存储
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

## 文档纪律

交付物只写最终采用的客观状态：被否方案、中间尝试、负向约束不写进 README / CHANGELOG / 提交信息。
版本号变更单独报备用户后再动。
