## 这个 PR 做了什么

<!-- 一两句说清"改了哪一面的什么"。关联的 issue 用 Fixes #NN 写。 -->

## 自查

- [ ] `npm test` / `npm run typecheck` / `npm run check:build` 三条本地全绿
- [ ] 改过 `client/` 的话，已跑 `npm run build` 并把 `lib/client.js` 一起提交
- [ ] 没有为了让测试变绿去动 `test/golden/**`（如确有需要，下面说明了"上游行为为什么变了"）
- [ ] 没有引入 GPL / 无证 / MPL 依赖
- [ ] 没有改 `package.json` 的 `version`（发版单独走一次提交）
- [ ] 新增的注释/文档只写最终采用的客观状态（不写被否方案与中间尝试）

## 需要 Reviewer 特别注意的地方

<!-- 比如：动了渲染内核、改了宿主工具契约、新增了对外接口。没有就写"无"。 -->
