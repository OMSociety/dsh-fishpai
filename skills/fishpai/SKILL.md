---
name: fishpai
description: 把 Markdown 排成可直接粘进微信公众号编辑器的内联样式 HTML，并在 DSH 右侧栏的「鱼排编辑器」面板里与人协同改稿（专业自由画布 + 11 套快速主题 + 微信脚注 + 代码块高亮 + 复制到剪贴板）。当用户要求「公众号排版」「微信排版」「把这篇 Markdown 排好看点」「套个主题」「加交互组件」「复制到剪贴板」「导出公众号 HTML」「改这篇公众号文章」「导入 / 复刻公众号文章」，或提到鱼排 / FishPai / 墨排 / MoPai / mopai-markdown / 专业 / professional 时使用；也用于人在鱼排面板里改过稿、加了批注或行内占位之后，需要读懂 diff 再改稿的场合。
---

# 鱼排 FishPai（公众号排版与协同改稿）

鱼排把 Markdown 排成**内联样式 HTML**：复制到剪贴板后粘进微信公众号编辑器就得到成品排版，也可以导出自包含 HTML 文件。

## 两条渲染管线

鱼排有两条管线，产出目标都是「粘进公众号能活」的内联样式 HTML：

| 管线 | target | 适合 |
|---|---|---|
| **专业**（默认） | `professional` | 自由排版画布：Markdown、语义组件、用户素材与原创 HTML/SVG 可以混合。适合活动专题、品牌视觉、复杂分层与 SMIL 交互；预设组件是快捷方式，不是创作上限。见 [版式设计指南](references/layout.md) 与 [组件手册](references/components.md) |
| **快速** | `quick` | 快速成稿：快速渲染内核 + 11 套主题 + 主题色，一次排版直接复制 |

面板顶部用「专业 / 快速」标签切换；`fishpai_render` 的 `target` 参数省略时跟随文档当前模式（默认专业）。

## 什么时候用

- 用户要把一篇 Markdown（活动通告、文章、说明）排成公众号样式
- 用户想换主题、调字号、调主题色，或要「复制到剪贴板」「导出 HTML」
- 用户要加交互组件（点击展开、图集、弹幕、进度条、时间线等）
- 用户在**鱼排面板里改过稿、加过批注/占位**，要你把他的改动读进来再改
- 用户提到鱼排 / FishPai / 墨排 / MoPai / mopai-markdown / 专业 / professional

**不适用**：需要**群发**公众号。鱼排只产出可粘贴或可导出的 HTML；**群发永远由人在公众号后台手动完成**，鱼排不做、也不绕平台风控。

## 改稿事实边界

尊重用户当次指令，保留原文的事实、观点、引用与明确要求固定的内容；不补写没有依据的数字、案例、引语或亲历。

## 八个工具与正确顺序

| 工具 | 用途 |
|---|---|
| `fishpai_open` | 打开/新建文档并在右侧栏弹出面板。传 `markdown` 新建；传 `path` 打开已有的 `.md`（**不覆盖**已有内容）。专业稿可同时传 `professional_spec`，画布参数随文档保存，预览、复制与导出共用 |
| `fishpai_read` | **改稿前必做**。返回：与"你上次写入的版本"的**块级 diff**、人的**批注**、**行内占位**、图片提醒、全文与块 id |
| `fishpai_write` | 改稿。必须带 `base_revision`；优先 `mode:"patch"` 只改指定块，`mode:"replace"` 才整篇换 |
| `fishpai_render` | 导出可粘贴/归档用的 HTML 文件（发布形态默认内嵌本地图片；`out_path` 可省略扩展名）。`target` 选 `professional`（专业，默认跟随文档）或 `quick`（快速）；`snippetId` 可拼入已确认的页头页尾片段 |
| `fishpai_import` | 从公众号 URL、粘贴 HTML 或工作区 HTML 新建专业文档。`url` / `html` / `path` 三选一，`out_path` 必须不存在；raw 保真、保守提升、图片本地化，返回结构 / 素材 / 规格证据 / lint 报告 |
| `fishpai_theme` | 管理**用户级命名主题库**（`set` / `show` / `clear` / `list`），可存多套命名主题，跨工作目录共享。用户要"某种观感"时用，见下面「自定义主题」一节 |
| `fishpai_snippets` | 提取并管理页头页尾片段。`preview` 生成候选 → 用户确认 → `commit` 入库；渲染时用 `fishpai_render` 的 `snippetId` 装配，不改源 Markdown |
| `fishpai_lint` | 检查 HTML 是否满足微信粘贴约束（id/class/CSS 动画/grid 等禁令），结果区分草稿 API 路径观察与粘贴路径推论 |

标准流程：

- **直接排版**：`fishpai_open`（专业稿同时设 `professional_spec`）→ 写稿或局部改稿 → 面板复制或 `fishpai_render` 导出。插件内部自动校验规格、组件必填内容和 raw 安全边界；不逐项跑 lint、不主动做浏览器截图、不研究平台内部机制。工具明确报错时才针对该错误修正。
- **协同改稿**：打开后告诉用户可在右侧栏改字、选块加批注；用户说“我改了”再 `fishpai_read`，按 diff 与批注用 `fishpai_write` 局部修改。
- **现有文章导入**：`fishpai_import({url, out_path})`，或传 `html` / `path`。导入后先读返回的分块、素材、规格证据与 lint 报告；复杂 raw 块按块编辑，不强行把 SVG / 微信专用结构改写成普通 Markdown。私有测试原文、图片与报告放暂存区，不进仓库。
- **交付**：用户点「复制到剪贴板」；需要成品 HTML 文件时调用 `fishpai_render`。真实设备验收只在最终候选完成后做一次，不把中途验收转嫁给用户。

## 专业自由画布

专业稿先确定内容角色，再决定视觉结构；不要从某个固定组件或模板出发套满全文。常见的三类结构是：

1. **活动长文**：章节编号与标题带 → 普通正文 → 白底信息卡 → 图片／重点行。
2. **对话或快闪**：整页底色 → 大幅主视觉 → 问答／对白 → 时间地点信息卡。
3. **互动叙事**：固定比例 SVG／分层位图主视觉承担画面，普通 HTML 保留正文、名单和链接。

这三类只是组织方法。用户给了素材时，模型应自由做裁切、叠层、色块、对白、图像组合与原创 SVG；素材中有品牌标识就使用对应素材，不另造标识。详细设计决策与起点参数见 [references/layout.md](references/layout.md)。

### 文档级 `professional_spec`

`fishpai_open({ path, professional_spec })` 保存画布；`fishpai_render({ target:'professional', professional_spec })` 只做当次覆盖。两组工具都不需要手动修改渲染代码。

```json
{
  "page_bg": "#f2f2f2",
  "page_padding_x": 20,
  "page_padding_y": 0,
  "body_color": "#3e3e3e",
  "body_size": 15,
  "body_align": "center",
  "body_spacing": 1,
  "line_height": 1.8,
  "accent": "#3f63d7",
  "accent2": "#17213a",
  "card_bg": "#ffffff",
  "card_radius": 10,
  "card_padding": 20
}
```

规格键分组：

- 画布：`page_bg` `page_width` `page_padding_x` `page_padding_y`。需要整页视觉时设置背景与留白；跨出正文左右留白的主视觉用 `full_bleed`，不手写负外边距。`page_padding_y` 控制文末画布底色延伸，默认为 `0`。
- 标题：`title_color` `title_size` `title_align`。
- 正文：`body_color` `body_size` `body_align` `body_spacing` `line_height` `muted_color`。
- 卡片：`card_bg` `card_radius` `card_padding`。
- 色彩：`accent` `accent2`。先建立角色，再在组件和 raw 中复用，避免逐段换色。

未知键、越界数值与非法颜色会在写入或渲染时直接报错；修正参数即可，不需要额外排障。

### `raw` 是自由创作区

```markdown
:::raw
<section style="width:100%;background-color:#f2f2f2;padding:24px 0;">
  <svg viewBox="0 0 700 360" role="img" aria-label="主视觉" style="display:block;width:100%;height:auto;">
    <!-- 自有图片、矢量路径、色块与 SMIL 图层 -->
  </svg>
</section>
:::
```

`raw` 原样保留安全 HTML/SVG，适合独特主视觉、复杂对白、素材分层和固定比例交互。它与 Markdown、语义组件可交替出现，不要求整篇位图化。脚本、事件处理器、iframe、外链样式与危险 URL 会被插件拒绝。

### 全幅内容用 `full_bleed`

需要让头图、色块或 SVG 顶到页面左右边缘时，用 `full_bleed` 包裹安全 HTML/SVG：

```markdown
:::full_bleed
<section style="margin:0 0 30px;background-color:#17213a;">
  <svg viewBox="0 0 700 360" role="img" aria-label="整幅主视觉" style="display:block;width:100%;height:auto;">
    <rect width="700" height="360" fill="#17213a"/>
  </svg>
</section>
:::
```

组件会按当前文稿的 `page_padding_x` 自动计算左右出血，并显式设置 `max-width:none !important`。普通 `max-width:none` 会被微信临时预览的高优先级规则覆盖，不能作为全幅验收依据。不要在 `raw` 里手写依赖某个固定留白值的负外边距。raw 表格的 `td` / `th` 先写 `border:0`，再写需要保留的 `border-top` 等边线。

含手写 `raw` 的复制或导出候选，用 `fishpai_lint` 检查发布形态 HTML，处理 `full-bleed-width`、`table-cell-border-reset` 及其它被检出的结构问题；不能只凭侧栏预览判断粘贴结果。普通 Markdown 与语义组件不增加这套流程。

正文使用系统默认字体。SVG 里的 `font-family` 只决定支持该字体时的显示，微信与手机可能回退成系统字形；需要固定造型的展示字、艺术字和标题字，优先转成带 `aria-label` 的矢量路径，不把 `<text>` 的字号生效误认为字体生效，也不必位图化。普通正文仍保留可选择、可编辑的 HTML 文本，不配置网页字体。文章是一套明确配色；深色适配由微信阅读端处理，不使用 `prefers-color-scheme` 假设编辑端会生成双主题，最终候选在目标阅读环境检查即可。

## 铁律

1. **先读后写**。`fishpai_write` 不带 `base_revision` 或版本不匹配会被**拒绝**——这是为了不覆盖人的手改。
   被拒绝时不要硬来：重新 `fishpai_read`，看清人又改了什么，再用新 revision 提交。
2. **只改要改的块**。`mode:"patch"` 配 `block_id`（来自 `fishpai_read` 的 diff 或 `outline`）局部改；
   整篇 `replace` 会覆盖人其它位置的改动，只在确实需要重写时用。
3. **块 id 是内容寻址的**：人改了某块内容，它的 id 就变了。所以要用**最近一次 `read` 的结果**里的 id，
   不要复用上一轮的 id。
4. **批注是对你的指令**。`fishpai_read` 里 `[块 xxx]：正文` 形式的批注就是人让他改哪块、怎么改。
   标了「锚点已失效」的批注说明那块被大改过，按 `quote` 片段自行判断位置。
5. **行内占位要清掉**。`<!-- 鱼排: … -->` 是人留的待补记号；处理完对应正文后把那行注释一并删除。

## 排版口径

> 以下口径针对**快速管线**（`quick`，快速渲染内核）的主题与粘贴效果；专业管线走组件规格，见[组件手册](references/components.md)。

- **默认用「默认公众号」**：它才是给微信做的（浅底、内联样式最稳）。只有当用户明确要某种观感、
  或明确说"只是要一份 HTML"时才换主题。
- **主题色只对「默认公众号」生效**：只有它用了主题色占位符，换到别的主题点了也不会变
  （面板在这种情况下已经把取色控件藏起来）。别向用户承诺"换个主题色"。
- **微信风险主题**：`tech`、`gradient` 用渐变文字（`background-clip: text` + 透明字色），
  微信编辑器可能重写掉渐变导致标题异常（平台结构校验也会直接标出 `darkmode-no-gradient`）；
  `dark_night` 是深色底，粘进公众号会是一整块深色。要发公众号就先提醒用户；
  需要这些风格时走「导出 HTML」拿文件。
- **复制/导出会加一层结构兼容层**：把文字包进 `<span>`（微信自己插入内容后的形态），
  这样公众号编辑器的结构校验不会把"含行内元素的段落"误报成行高过小；同时把 `background:`
  简写拆成 `background-color:` / `background-image:`（微信按属性名过滤，简写会被整条丢掉，
  于是引用块的框、表头底色在公众号里消失）；选定的字号也会从最外层 wrapper 推进到
  p / 列表项 / 引用块上（微信会剥掉最外层 wrapper 的样式，字号只挂在它上面等于没设）。
  默认渲染路径不受影响，面板的预览不经过这三层——
  所以别拿"预览的 HTML"去判断粘进微信后的样子。
- **字号**：正文 16px 起步，长文 17px 更好读
- **字体**：面板上的「字体」预设（黑体 / 衬线 / 等宽）**总会覆盖主题自带的字体栈**——所以
  "这套主题是衬线的"能不能成立，取决于这个预设，而不是主题里写了什么。让用户切到「衬线」而不是向他保证主题自带衬线。
  **公众号编辑器只认黑体**（iOS 设备上才是苹方）：衬线 / 等宽只在「导出 HTML」里有效，粘进编辑器会退回黑体，
  而面板预览里看不出这个差别。用户要的是"公众号里也衬线"时，说明实际得用导出，别让他以为坏了。
- **段落**：段落之间空一行；`breaks` 已开启，单换行即换行
- **图片**：`![alt](相对路径)`。复制到剪贴板时本地图会自动内嵌成 base64，**粘进编辑器不需要手动重传**
  （编辑器接收后由微信自行转存）。会被微信拦掉的是 `http(s)://` 的**外链图**，以及内嵌不了的本地图
  （文件不存在、在工作目录之外、超过 5 MB）——这几类要在编辑器里手动上传，`fishpai_read` 会把它们单独列出来
- **外链**：正文里的 `[文字](url)` 会自动转成文末「参考资料」脚注（微信正文不支持外链）

## 面板操作

- **切换专业 / 快速**：顶部工具行的「专业」「快速」两枚标签对应当前文档的渲染目标，默认是「专业」。
  专业模式默认显示「预览」，快速模式默认「并排」；需要改稿时切到「编辑」。点击渲染标签后立即切换并重新预览，复制与导出也沿用这个选择。
- **插入交互组件**：在「编辑」或「并排」视图的 Markdown 文稿工具行点「⊕ 组件」，按名称与简介选择组件。
  面板会在光标处插入对应的 `:::` 容器模板，并选中第一行占位内容，直接输入即可替换；组件指令详见
  [组件手册](references/components.md)。在「快速」模式下使用组件会自动切到「专业」并提示原因。
- **复制与导出**：点「复制到剪贴板」取得当前渲染目标的 HTML；需要归档或进一步加工时用「导出 HTML」。复杂 SVG 与交互在目标编辑器中的保留程度以其粘贴处理为准。

## 自定义主题（用户级命名主题库）

用户说"想要 XX 那种观感"（衬线、灰底引用、行距更大、标题不要主题色…）时，在**某套内置主题上改几个槽位**就行。

> 主题只对**快速管线**（`quick`，快速渲染内核）生效；专业管线（`professional`）用组件规格，不走这套主题槽位。

两条路，按"要不要留下"选：

| 想要 | 用什么 | 落不落盘 |
|---|---|---|
| 先试一下、看效果 | `fishpai_render({ target:'quick', theme_spec })` | **不落盘**，只写进那份 HTML |
| 用户认可、以后一直用 | `fishpai_theme({ action:'set', theme_spec })` | 落进**用户级命名主题库**（storageDomain，跨工作目录共享） |

`fishpai_theme` 管的是**命名主题库**——可以存**多套**各自命名的主题（`custom:<id>`），面板主题列表里「我的」那一组会全部列出来。

- `action:'set'` 新建一套（省略 `theme_id`）或用 `theme_id` 覆盖一套，并把当前文档切到它；
- `action:'show'` 读回规格（要改就在那份规格上改）；
- `action:'list'` 列出全部命名主题；
- `action:'clear'` 删除指定主题（只有一套时 `theme_id` 可省略）。
- 只想临时试一次、不入库：用 `fishpai_render({ target:'quick', theme_spec })`，不落盘。

```json
{ "name": "我的·灰底衬线",
  "base": "elegant",
  "styles": {
    "p": "line-height: 2; color: #2b2b2b;",
    "h2": "font-size: 19px; border-left: 4px solid {{PRIMARY}}; padding-left: 12px;",
    "blockquote": "background: #f4f4f5; border-left: 3px solid #a1a1aa; color: #3f3f46;"
  } }
```

规矩（写错会被拒绝，并在返回里说明原因，改对再来一次）：

- **只写想改的槽位**，其余自动从 `base` 继承。19 个槽位：
  `wrapper` `h1` `h2` `h3` `p` `blockquote` `code_inline` `code_block` `ul` `ol` `li` `img` `a`
  `table` `th` `td` `hr` `strong` `em`
- **属性白名单**（就是内置主题实际用过的那批）：`color` `background` `font-family` `font-size`
  `font-weight` `font-style` `line-height` `letter-spacing` `text-align` `text-decoration` `text-indent`
  `margin` `padding` `padding-left` `padding-bottom` `border` `border-top` `border-bottom` `border-left`
  `border-radius` `border-collapse` `border-image` `width` `height` `max-width` `display` `overflow-x`
  `box-shadow` `-webkit-background-clip` `-webkit-text-fill-color`
- **`wrapper` 里必须同时有 `font-family` 与 `font-size`**，否则面板的「字体」「字号」调节失效（漏了会自动补上）。
  但**写在 `wrapper` 上的 `font-size` 本身不生效**：面板的「字号」控件就是靠替换这一条工作的，预览与「复制到剪贴板」都以用户选的字号为准。
  想固定正文字号，改具体槽位（`p` / `li` / `blockquote`），别指望 `wrapper`。
- 想跟「主题色」联动就用 `{{PRIMARY}}` / `{{PRIMARY_BG}}` 占位符
- 不许出现 `{}` `<` `>` `"`（双引号；单引号可以，`font-family: 'Georgia', serif` 这类字体栈没问题）`url(...)` `expression(...)` `@import` `javascript:`；`!important` 写了会被自动去掉（微信不保留它）。不要写图标或 emoji
  （图标由鱼排统一给）
- 白色/深色底、渐变文字这类**微信会掉样式**的组合：`fishpai_render` 会照做，但你要当场提醒用户
  "这套更适合导出 HTML，发公众号可能变形"

## 支持的 Markdown（比标准多几种）

| 语法 | 效果 |
|---|---|
| `#`…`######` | 六级标题（h4–h6 套 h3 样式，与快速管线一致） |
| `>` 引用 | 主题色左边框块 |
| `-` / `1.` | 列表，支持嵌套 |
| `\| 表格 \|` | 主题化表格 |
| ` ```python ` | 代码块 + highlight.js 高亮（mac 标题栏形态） |
| `[文字](url)` | 自动转文末「参考资料」 |
| `<strong>文字</strong>` | 原样透传的粗体：**不加主题色**（写 `**文字**` 会套主题的 strong 样式，多数主题会染成主题色）。要"黑粗"就用它 |
| `![alt](相对路径)` | 图片 |
| `:::tip 标题` … `:::` | 信息卡片，四型：`info` `warning` `tip` `danger` |
| `---` | 主题色分隔线 |
| ` ```mermaid ` | 图表占位（预览里不渲染，保留代码原文） |

## 与人协作的说法

- 面板里能看到固定 375px 手机阅读宽度的实时预览、主题/字号设置、批注抽屉（可一键定位到引用它的那段）、历史回滚
- 面板的编辑器支持 Markdown 快捷键（`Ctrl/⌘+B` 加粗等，右上角「快捷键」里有速查表），
  截图可以直接 `Ctrl/⌘+V` 粘进去（存到文档同级的 `assets/` 并在正文插入 `![](assets/…)`）
- 你改完之后，明确告诉用户"改了什么、在哪一块"，而不是只说"已更新"
- 如果人的批注互相冲突或指向不存在的块，直接说出来，不要猜着改
