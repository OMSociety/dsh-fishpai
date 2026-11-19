# AGENTS.md — 鱼排 FishPai Agent 宪法

适用范围：本仓库全部目录（`OMSociety/dsh-fishpai`）。

## 项目概览

- 一句话定位：DSH 插件——把 Markdown 排成可直接粘进微信公众号编辑器的内联样式 HTML；宿主侧（Node ESM）与客户端侧（浏览器 TSX）在同一个包里，面板长在 DSH 右侧栏，人与模型协同改稿。
- 技术栈：Node ≥20（CI 用 22）/ React 18 + TSX（esbuild 打包）/ npm；`playwright-core` 是 README 预览构建的开发依赖，`@deepseek-ai/dsh-storage-domain` 是 optional peer（宿主提供用户级存储时启用）；不写 `engines.dsh`。
- 衍生来源：快速渲染管线与主题数据源自 `ye4wzp/mopai-markdown`（MIT），衍生起点为 `c91487a`（2026-08-19）；当前行为以本仓库代码、测试与自产 snapshot 为准，署名与出处见 [NOTICE.md](./NOTICE.md)。
- 文档索引：
  - 功能与安装：[README.md](./README.md)
  - 协作流程与 PR 硬要求：[CONTRIBUTING.md](./CONTRIBUTING.md)
  - 发版史：[CHANGELOG.md](./CHANGELOG.md)
  - 模型改稿纪律（技能形态）：[skills/fishpai/SKILL.md](./skills/fishpai/SKILL.md)

## 常用命令

| 目的 | 命令 |
|---|---|
| 安装依赖 | `npm install` |
| 跑全部测试 | `npm test` |
| 跑单个测试文件 | `node --test test/<name>.test.mjs` |
| 类型检查（只覆盖 `client/`） | `npm run typecheck` |
| 打包客户端 bundle | `npm run build` |
| 构建并核对 lib/ 无漂移 | `npm run check:build` |
| 重建正式 README 预览 | `npm run build:preview` |
| 重生成渲染 golden | `npm run test:golden:regen` |

```powershell
npm test
npm run typecheck
npm run check:build
```

本地安装验证需要**用户自己**停 / 起 `dsh web`（node-pty 文件锁，宿主一停会话即断）；agent 不自行停启主服务。

## 架构边界

```text
client/（TSX，浏览器）──fetch──▶ plugin/host/（路由+存储+工具）──▶ plugin/core/（纯函数渲染内核）──▶ plugin/vendor/（数据）
```

- `plugin/core/` 是纯函数、零依赖，除 `runtime.mjs` 用 vm 只读加载 vendor 外不碰文件系统；fs / HTTP 只允许出现在 `plugin/host/`。
- 浏览器侧读写文档的唯一通道是 `/fishpai/api/*`（`plugin/host/routes.mjs`）：同源校验（`Host` 必须是环路字面量，挡 DNS rebinding）+ docKey + revision 守卫。客户端不拿绝对路径。
- 禁止在客户端 bundle 里 `require('@deepseek-ai/*')`。原因：rc2 官方禁止客户端 bundle 加载 Harness Client 包（宿主改名会让整块界面白掉）；图标几何复制进 `client/theme-icons.tsx`（见硬约束 10）。esbuild external 列表与 `test/client.bundle.test.mjs` 是守卫。
- 宿主工具用 raw JSON-Schema 注册（`ctx.tools.register({name, description, parameters, output, execute})`）；不要 `import { defineTool } from '@deepseek-ai/dsh-tools'`——树外解析不可靠。

## 关键目录

| 我要… | 改这里 |
|---|---|
| 改渲染输出 | `plugin/core/render.mjs` / `plugin/core/markdown.mjs`（先读 `markdown.mjs` 文件头的「8 个坑」清单） |
| 改主题数据 | `plugin/vendor/themes.js`，再 `npm run test:golden:regen` |
| 改块切分 / diff / 补丁 / 批注 | `plugin/core/markdown.mjs` / `diff.mjs` / `patch.mjs` / `notes.mjs` |
| 改自定义主题 | `plugin/core/theme-spec.mjs`（校验+合并）+ `plugin/host/custom-theme.mjs`（存取） |
| 改写作风格学习 | `plugin/core/learn.mjs`（规则反推）+ `plugin/host/learn.mjs`（pending、网页抓取、入库） |
| 改页头页尾片段 | `plugin/core/snippets.mjs`（提取+装配）+ `plugin/host/snippets.mjs`（pending+入库） |
| 改微信约束检查 | `plugin/core/wechat-lint.mjs` + `test/wechat-lint.test.mjs` |
| 改秀米组件渲染 | `plugin/core/xiumi/{spec,components,interactive,index}.mjs`（独立目标，不改微信 render 签名） |
| 改模型工具 | `plugin/host/tools.mjs`（raw JSON-Schema 注册） |
| 改面板读写 / 安全边界 | `plugin/host/routes.mjs` + `client/api.ts` |
| 改图片存取与内嵌 | `plugin/host/assets.mjs` |
| 改面板挂载 / 槽位登记 | `client/index.tsx`（官方右侧栏三段式登记的现行实现；机制以 `@deepseek-ai/dsh-client-ui-sidebar-right` 的 README 为准） |
| 改快捷键 / 格式化动作 | `client/mdedit.ts`（唯一实现），同步 `test/mdedit.test.mjs` |
| 加测试 | `test/*.test.mjs`（node:test，ESM） |

## 数据流

- 模型侧：`fishpai_open` → 人在面板改字 / 加批注 → `fishpai_read`（块级 diff + 批注 + 占位）→ `fishpai_write`（必须带 `base_revision`，优先 `mode:"patch"` 按块改）→ 人点「复制到剪贴板」。
- 浏览器侧：面板 → `/fishpai/api/*`（同源 + docKey + revision 守卫）→ `plugin/host/store.mjs` → 会话工作目录下的 `.md` 与 `.fishpai/`。客户端 3s 轮询拿 `openRequest` 与 revision 变化。

## 修改契约

- 改 `client/`：跑 `npm run build` 并把 `lib/client.js` 一起提交。`dsh plugin add` 只安装不构建，产物不同步 = 用户装到旧界面；`npm run check:build` 与 CI 会拦。
- 改渲染默认路径：先 `npm test` 确认绿；`test/golden/**` 是当前核心的自产 snapshot，只能用 `npm run test:golden:regen` 重生成，且必须在 PR 里说清预期行为变化。`node scripts/regen-golden.mjs --check` 只核对漂移、不写文件。
- 改 `plugin/vendor/themes.js`：同上重生成 snapshot，并核对主题清单与全部 fixture。
- 改 `client/theme-icons.tsx` 的几何：先回到 rc2 的 `@deepseek-ai/dsh-client-ui-primitives` 逐字比对（来源记录见 NOTICE.md），再 `npm run build` 提交产物。`test/theme-icons.test.mjs` 只守结构与接线，守不住几何内容。
- 改包根 `icon.svg`：同步改 `client/icons.tsx` 里 `FishMark` 的同一份 36 画板几何；别处没有第二份。
- 改 README 效果图：运行 `npm run build:preview`。构建链直接运行正式 `Panel`、`createFishpaiStore` 与面板 CSS，由 `docs/preview/fixture.json` 应答接口，输出 `docs/preview/panel.html` 与 `docs/panel-preview.png`，并在 Chrome 中验收展开交互；改 client、专业渲染或演示文稿后同步重出预览。
- 加主题：`plugin/vendor/themes.js` 加定义（仿 `default` 主题那套 19 个槽位），往 `client/icons.tsx` 的 `THEME_GLYPH` 补一行（仿现有行；新几何走 `client/theme-icons.tsx` 的复制流程），再重生成 golden。`test/theme-info.test.mjs` 查漏；README / 技能里写死的「11 套主题」计数同步改。
- 改快捷键 / 键位文案 / 格式化动作：只改 `client/mdedit.ts` + `test/mdedit.test.mjs`，别处不抄第二份。
- 改依赖：用 `npm install <pkg>`，锁文件随改动一起提交；新增依赖先查许可证（见硬约束 3）。
- 改 `package.json` 的 `version`：不许顺手改。版本号与 CHANGELOG 条目同属一次发版提交，且 bump 前必须先报备用户。

## 硬约束

1. **渲染字节级一致**。`plugin/core/render.mjs` 在 `annotate`／`imageResolver`／`wrapText`／`wechatBackground` 全关时，输出必须与当前核心自产的 `test/golden/**` 逐字节相同。`test/site-parity.test.mjs` 是外部样本软参考，只有设置 `FISHPAI_SITE_PARITY=1` 才运行一致性断言。**允许的三处偏离只走 publish（复制/导出）路径、由调用方显式开启、且都是纯叠加/纯规范化**：
   - `wrapText`（`test/wechat-structure.test.mjs` 守着）：文字包 `<span>` 防微信行高误报；给以**行内元素**开头的 `<li>` 前补一个真 U+00A0 字符（不能写 `&nbsp;` 实体，「整条 li 包 span」实测无效）；以块级元素开头的条目（松散列表）**不补**。
   - `wechatBackground`：`background:` 简写拆成 `background-color:`／`background-image:`（微信按属性名过滤，简写整条丢）。
   - `promoteFontSize`：选定字号从 wrapper 推进 p / li / blockquote（微信会剥 wrapper 样式）；h1–h3、表格、文末「参考资料」节**不动**——表格字号不跟正文走是快速管线既定行为，跟着改才是 bug。
   三条都不许改成默认开启。另有一条**平台限制**（无开关）：公众号编辑器只认黑体，衬线/等宽栈粘进去会退回；所以 `FontPicker` 把衬线/等宽单列一组并标「仅用于导出 HTML」——不许「修」字体栈，也不许拆标注。
2. **Markdown 管线的 8 个兼容性约束不许随手改**（完整列表见 `plugin/core/markdown.mjs` 文件头）：紧凑列表内段落 token 的 `hidden=true` 必须跳过；mac 结构嵌在 `pre>code` **内部**；默认 `sans`/`16px` 总会覆盖主题自带字体字号；等。改动必须先更新行为测试与自产 snapshot，并说明预期差异。
3. **不引入 GPL / 无证 / MPL 依赖**。具体禁的是 `Wechatsync` 系（GPL-3.0 / 无证）与 `DOMPurify`（MPL）。
4. **客户端 bundle 必须是** `window.__ModuleLoader__.load({ id, factory: (require) => exports })` 形态（由 `scripts/build-client.mjs` 产出）。
5. **样式只用 `--dsw-alias-*` 主题变量**（阴影例外：`--dsw-shadow-lv1` / `lv2` / `lv3`）；旧名（`--dsw-text-secondary` 一类）在当前 DSH 里不存在，写了就是深色主题下的白块。
6. **工作目录文件只能落在会话工作目录内**（`header.cwd`），并过 `store.mjs` 的扩展名白名单（`resolveInCwd`）。命名主题等用户级数据走 `storageDomain`，不进入工作目录。新建文件一共两处：`POST /upload`（图片，落文档同级 `assets/`）与 `POST /doc`（文档）；文件名都由宿主生成，客户端给的名字只当可读词、不参与路径拼接；图片上限 `MAX_ASSET_BYTES` 与内嵌上限共用一处定义。
7. **绝不静默覆盖人的手改**：任何写入带 `base_revision`，不匹配就拒绝并回带最新 diff（409 是界面上的冲突态，不是重试信号）。`applyPatches` 必须在拼接处自己保证恰好一个空行：块的行范围**列表含末尾分隔空行、段落不含**，漏补会让下一块被 markdown 的懒延续并进来，之后改那个被并大的块会把它整段删掉（`test/host.test.mjs` 覆盖此约束）。
8. **`package.json` 的 `dsh.client` 是「包依赖边 + 激活提示」，不是服务依赖**。本包客户端只 require shell 基线种子模块（不是依赖图里的行），所以不靠 `inject` 拿服务；`inject` 只写**槽位属主包**——`client/index.tsx` 注册的 `sidebar.right.pane.tab` / `.title` 由 `@deepseek-ai/dsh-client-ui-sidebar-right` 声明，属主的 bundle 必须先到位，所以它列在这里；`external` / `immediately` 留空。把 `slots` / `sessions` 这类服务名写进 `dsh.client.inject` 是无效声明（服务依赖由 bundle 导出的 `inject` 决定）。`test/client.bundle.test.mjs` 守着种子表与这条属主边。
9. **面板块 id 一律来自 `splitBlocks`**（`plugin/host/routes.mjs` 的 `liveSurface`）：批注锚点与 `fishpai_write` 的 `block_id` 用的就是它。渲染器 HTML 里的 `<fp-block data-b>` 锚点随 `macCodeBlock` 等渲染选项变化，**不能**当成面板的块清单。
10. **图标全部内联在本包里**：14 支主题/控件图标几何在 `client/theme-icons.tsx`（复制自宿主 rc2 图标包，MIT，见 NOTICE.md）；品牌鱼只有一份几何——`icon.svg`（36 画板、自带渐变）与 `FishMark` 必须同步。除品牌标外颜色只走 `currentColor` 与 `--dsw-alias-*`。
11. **编辑器的快捷键与格式化动作只有一份实现**（`client/mdedit.ts`，纯函数）：`SHORTCUTS` 一张表同时喂键盘匹配、界面速查表与测试。编辑动作必须走 `document.execCommand('insertText')`——直接改 `value` 会让 `Ctrl+Z` 的原生撤销栈作废。
12. **自定义主题是数据，不是代码**：`plugin/core/theme-spec.mjs` 只做校验 + 合并，绝不求值模型给的代码。属性白名单统计自 11 套内置主题（它们实测能在公众号里活）；规格只认 `name` / `base` / `styles`，多写的键报错而不是默默忽略；必须在内置主题上做增量覆盖（缺槽位 = 不加 style 属性）；`wrapper` 必含 `font-family` / `font-size`（漏了面板字体/字号控件变死控件）。命名主题存 storageDomain themes 表，主题 key 为 `custom:<id>`，同一 id 的 `set` 即覆盖；损坏或非法记录在读取时给出错误，缺失 id 回默认并标记 `missing`。临时 `theme_spec` 仍只用于本次渲染。规格里**没有图标字段**。换主题**不动 revision**——面板靠 `/state` 的 `active.theme` 发现，只换 meta、不重载正文，别让用户正在打的字被换掉。
13. **learn 的候选不是用户资产**：`fishpai_learn` 与 `POST /learn` 必须先生成 pending 候选，只有 `commit + confirm=true` 才写 storageDomain writing 表。九字段必须含 styleId/tone/structure/audience/purpose/do/dont/sourceName/sourceRef；网页只抓公开 HTTPS，DNS 解析到本机或私有网段即拒绝，正文上限 2 MiB。
14. **页头页尾片段是预览确认后的用户资产**：`POST /snippets` 与 `fishpai_snippets` 走 preview→commit；页头取正文首个 mmbiz 图，页尾锚点关键词必须由用户显式配置。渲染通过 `snippetId` 在 render 前拼 Markdown，不改源文档；片段存 storageDomain snippets 表。
15. **微信 lint 必须标明证据边界**：`fishpai_lint` 与 `POST /lint` 检查全内联、禁 position/class/id/div/CSS 变量/grid、文本节点包裹与正文 4.5:1 对比度。既有规则观察来自草稿 API 路径；用于鱼排粘贴路径时一律标为推论，不冒充粘贴实测。
16. **秀米是独立渲染目标与自由排版画布**：组件与 Markdown 映射只放 `plugin/core/xiumi/`，接入点是 `fishpai_render.target` 与 `POST /render.target`；微信 `render()` 不加 target。静态组件与 8 个交互组件分别由 components.mjs、interactive.mjs 注册，DEFAULT_SPEC 的 18 个键按模块常量校验；文档级 `xiumiSpec` 由 store 持久化，预览、复制与导出共用。`raw` 承载安全 HTML / SVG，素材经 assets.mjs 统一收集与内嵌；未知组件、非法规格和主动内容必须报错。展开组件使用零高正文与 SVG 高度动画，不依赖 foreignObject；复制到目标编辑器后的结构与交互以该编辑器的粘贴处理为准。
17. **复制与导出是插件的交付面**：面板复制与 `fishpai_render` 通过 publish 模式生成同一形态的 HTML；插件运行时只执行本地渲染、剪贴板复制与文件导出，平台草稿与群发由用户在对应平台完成。`playwright-core` 仅服务于维护者执行 `npm run build:preview`，属于开发依赖。
18. **预览与复制产物是两条渲染路径，预览的样式问题不许改渲染内核**。`publish` 模式才开三处兼容层；`preview`（`annotate: true`）不开，也不做 hljs 内联。预览 iframe 是沙箱 srcdoc、没有外部样式表：预览缺的样式只能由宿主生成 CSS 随响应下发（范例：`hljsPreviewCss()` → `hljsCss` → 客户端 `buildSrcdoc`），不能改 `render.mjs`（golden 守的是 publish + 默认路径，改内核同时污染两条路）。判据：**预览有差异、复制产物正常 = 补在预览侧，不是内核 bug**。

## 禁止操作

- 禁止手改 `test/golden/**`、`lib/client.js`。原因：两者都是生成物，手改即作废对照体系。要改走 `npm run test:golden:regen` / `npm run build`。
- 禁止把凭据、内网地址、真实个人信息写进仓库任何文件。原因：公网仓库，泄露即事故。
- 禁止自行停 / 起用户本机的 DSH 主服务。原因：宿主一停当前会话即断；安装验证交回给用户操作（见「常用命令」末尾）。
- 禁止在 `client/styles.ts` 的 CSS 模板字符串注释里写反引号字符——会提前闭合字符串，`tsc` 报 TS1005。

## 验收标准

改动完成 = 下列全部通过（与 CI 一致，`.github/workflows/ci.yml`）：

1. `npm test`
2. `npm run typecheck`
3. `npm run check:build`

## 提交与协作

- Commit：conventional commits 前缀 + 中文描述（`feat:` / `fix(render):` / `docs:` / `chore:` / `refactor:`，见 `git log`）。
- PR：按 [.github/PULL_REQUEST_TEMPLATE.md](./.github/PULL_REQUEST_TEMPLATE.md) 的自查清单走。
- 发版：版本号 bump 与 CHANGELOG 更新单独一次提交；CHANGELOG 遵循 Keep a Changelog + 语义化版本，中英双语体例。CI 只跑测试与构建核对、不发布：npm 发布由维护者本机执行，不经 Actions。
- 文档纪律：交付物（README / CHANGELOG / 提交信息）只写最终采用的客观状态，被否方案与中间尝试不写入。
- 安全问题：不开公开 issue，走 [SECURITY.md](./SECURITY.md) 的私密渠道。

## 已知风险区

| 路径 | 风险 | 改动前后置动作 |
|---|---|---|
| `plugin/core/render.mjs` | 47KB 主流程，默认路径与 golden 字节级绑定 | 先 `npm test`；动过就全量回归 |
| `plugin/core/patch.mjs` | CRLF、同块多补丁与列表分隔空行会改变补丁落点 | `node --test test/core.test.mjs test/host.test.mjs` |
| `plugin/host/routes.mjs` | 浏览器与文件系统之间唯一的门；同源守卫挡 DNS rebinding（Host 必须是环路字面量） | `node --test test/security.test.mjs` |
| `plugin/vendor/themes.js` | 内置主题数据，删 / 改主题 = golden 全变 | `npm run test:golden:regen` 并在 PR 说明原因 |
| `client/theme-icons.tsx` | 几何复制自宿主 rc2 图标包；测试只守结构、守不住几何内容 | 与 rc2 原版逐字比对后再 `npm run build` |
| `scripts/regen-golden.mjs` | 自产 snapshot 的唯一生成器，决定 fixture、主题与渲染参数覆盖 | 改后先跑 `--check`，再显式重生成并审阅差异 |

## 出错怎么办

| 症状（可检索片段） | 处理 |
|---|---|
| snapshot 测试红 / `snapshot 有 ... 处渲染差异` | 先确认是否动了默认渲染路径；预期行为变化才 `npm run test:golden:regen` 并审阅差异，否则回退 |
| `check:build` 红（`git diff --exit-code -- lib/`） | `npm run build` 并把 `lib/client.js` 一起提交 |
| `TS1005`（tsc） | 查 `client/styles.ts` 模板字符串注释里的反引号 |
| 技能加载报 `source must be a string` | `plugin/index.mjs` 注册技能时必须带 `source: 'bundled'` |
| 面板整块白掉 / bundle 里多出 `require('@deepseek-ai/...')` | 客户端新 import 了宿主包；把几何 / 逻辑复制进本包，守卫见 `test/client.bundle.test.mjs` |

## 维护

本文件与触发它的代码改动进同一个 PR。改动验收命令、架构边界、硬约束、风险区、发版流程时必须同步本文件；发现与代码不符，先改本文件再继续。
