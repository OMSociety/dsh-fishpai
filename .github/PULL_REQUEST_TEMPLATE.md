## 这个 PR 改了什么

<!-- 关联的 issue 用 Fixes #NN 写。 -->

## 自查

- [ ] `npm test` / `npm run typecheck` / `npm run check:build` 三条本地全绿
- [ ] 改过 `client/` 的话，已跑 `npm run build` 并把 `lib/client.js` 一起提交
- [ ] 没有为了让测试变绿去动 `test/golden/**`（如确有需要，下面说明了"上游行为为什么变了"）
- [ ] 没有改 `package.json` 的 `version`（version bump 单独提交）
- [ ] 没有引入 GPL / 无证 / MPL 依赖

## 需要 Reviewer 注意的地方

<!-- 比如：动了渲染内核、改了宿主工具契约、新增了对外接口。没有就写"无"。 -->
