# AGENTS.md — 鱼排 FishPai

Instructions for coding agents working on this repository (`OMSociety/dsh-fishpai`).

## 这个仓库是什么

- **DSH 插件**：宿主侧（Node）+ 客户端侧（浏览器）两半在同一个包里。
- **上游 fork**：`ye4wzp/mopai-markdown`（MIT）。上游 SPA 原样放在 `legacy-site/`，不要改它，
  它是渲染一致性的最后一道对照依据。署名/许可链条见 `NOTICE.md`。

## 不可违反的不变量

1. **渲染字节级一致**。`plugin/core/render.mjs` 在 `annotate`/`embedImages` 关闭时，输出必须与
   `test/golden/**` 逐字节相同。改渲染代码前先跑 `npm test`；golden 只能用
   `npm run test:golden:regen` 重生成，且重生成必须说得清"为什么上游行为变了"。
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
