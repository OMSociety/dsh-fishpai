# 参与开发

鱼排（FishPai）是 DSH 插件：宿主侧（Node）与客户端侧（浏览器）两半在同一个包里。
改动前请先读 [`AGENTS.md`](AGENTS.md)——那 15 条不变量是硬约束，尤其是渲染字节级一致、
上游 8 个坑不许"修好"、以及"绝不静默覆盖人的手改"。

## 本地跑起来

```powershell
npm install          # 只有 devDependencies
npm test             # 全量回归（golden + 核心单测 + 宿主红线 + 客户端时序）
npm run typecheck    # 客户端 TSX 类型检查
npm run build        # 改过 client/ 就必须跑，并把 lib/client.js 一起提交
npm run check:build  # 确认 lib/ 与源码同步（CI 也跑这条）
```

CI（`.github/workflows/ci.yml`）跑的是 `npm ci` 加三条核对：`npm test`、`npm run typecheck`、
`npm run check:build`。最后一条自己会先构建再比对，所以本地不必单独跑 `npm run build`——
但改过 `client/` 记得把重新生成的 `lib/client.js` 一起提交（见下条）。

## 提 PR 的硬要求

1. **`npm test` / `npm run typecheck` / `npm run check:build` 三条全绿**。
2. **改过 `client/` 就必须提交重新构建的 `lib/client.js`**：`dsh plugin add` 不做构建，
   产物不同步 = 用户装到的还是旧界面。
3. **不要为了让测试变绿去动 `test/golden/**`**。golden 只能用 `npm run test:golden:regen`
   重生成，而且要在 PR 里说清"上游行为为什么变了"（不变量 1）。
4. **新增依赖前先看许可**（不变量 3）：GPL、无证、MPL 一律不进。
5. **宿主工具用 raw JSON-Schema 注册**，不要 `import { defineTool }`（不变量 4）。
6. **版本号与 CHANGELOG 属于同一次发布**：PR 里不要顺手改 `package.json` 的 `version`，
   发版单独走一次提交（本仓库不发 tag，发布前自查「version 与 CHANGELOG 一节对应」即可）。

## 改渲染内核时

`plugin/core/` 是纯函数、零依赖，`plugin/vendor/` 是数据（上游主题定义与两个压缩库）。
"预览看起来不对"绝大多数不是内核 bug——预览与发布是两条渲染路径，
判据见 `AGENTS.md` 不变量 15。

## 安全问题

不要开公开 issue，走 [`SECURITY.md`](SECURITY.md) 里的私密渠道。
