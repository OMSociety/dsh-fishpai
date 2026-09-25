---
name: fishpai
description: 把 Markdown 排成可直接粘进微信公众号编辑器的内联样式 HTML，并在 DSH 右侧栏的「鱼排编辑器」面板里与人协同改稿（11 套主题 + 微信脚注 + 代码块高亮）。当用户要求「公众号排版」「微信排版」「把这篇 Markdown 排好看点」「套个主题」「复制到公众号」「改这篇公众号文章」，或提到鱼排 / FishPai / 墨排 / MoPai / mopai-markdown 时使用；也用于人在鱼排面板里改过稿、加了批注或行内占位之后，需要读懂 diff 再改稿的场合。
---

# 鱼排 FishPai（公众号排版与协同改稿）

鱼排把 Markdown 排成**内联样式 HTML**：整段粘进微信公众号编辑器就得到成品排版。
它的渲染内核与 [MoPai 墨排](https://github.com/ye4wzp/mopai-markdown) 的「复制到公众号」输出逐字节一致
（真实剪贴板内容规范化后零差异）。主题清单有意不同：上游的「金融时报」「Medium」已移除，「Claude」去掉了整页异色底。

## 什么时候用

- 用户要把一篇 Markdown（活动通告、文章、说明）排成公众号样式
- 用户想换主题、调字号、调主题色，或要「复制到公众号」
- 用户在**鱼排面板里改过稿、加过批注/占位**，要你把他的改动读进来再改
- 用户提到鱼排 / FishPai / 墨排 / MoPai / mopai-markdown

**不适用**：需要真的发布到公众号后台（要走微信官方 API 或人工粘贴）。鱼排只产出可粘贴的 HTML，
发布永远由人复制粘贴完成。

## 五个工具与正确顺序

| 工具 | 用途 |
|---|---|
| `fishpai_open` | 打开/新建文档并在右侧栏弹出面板。传 `markdown` 新建；传 `path` 打开已有的 `.md`（**不覆盖**已有内容；`path` 可省略扩展名，会自动补 `.md`） |
| `fishpai_read` | **改稿前必做**。返回：与"你上次写入的版本"的**块级 diff**、人的**批注**、**行内占位**、图片提醒、全文与块 id |
| `fishpai_write` | 改稿。必须带 `base_revision`；优先 `mode:"patch"` 只改指定块，`mode:"replace"` 才整篇换 |
| `fishpai_render` | 导出可粘贴/归档用的自包含 HTML 文件（本地图片内嵌 base64；`out_path` 可省略扩展名） |
| `fishpai_theme` | 存/看/删**工作目录级**的那一套「自定义主题」（`set` / `show` / `clear`）。用户要"某种观感"时用，见下面「自定义主题」一节 |

标准流程：

1. 用户要写/改一篇公众号文章 → `fishpai_open({ markdown })`（或 `{ path: 'in/x.md' }` 打开现成的）
2. 告诉用户「右侧栏的「鱼排编辑器」已打开，你可以直接改字、选中块加批注」，然后**停下等他**
3. 用户说"我改了，你看看" → `fishpai_read`
4. 按 diff + 批注改稿 → `fishpai_write({ base_revision, mode:'patch', patches:[…] })`
5. 用户满意 → 他自己点面板上的「复制到公众号」；需要成品文件时用 `fishpai_render`

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
- **图片**：`![alt](相对路径)`。复制到公众号时本地图会自动内嵌成 base64，**粘进编辑器不需要手动重传**
  （编辑器接收后由微信自行转存）。会被微信拦掉的是 `http(s)://` 的**外链图**，以及内嵌不了的本地图
  （文件不存在、在工作目录之外、超过 5 MB）——这几类要在编辑器里手动上传，`fishpai_read` 会把它们单独列出来
- **外链**：正文里的 `[文字](url)` 会自动转成文末「参考资料」脚注（微信正文不支持外链）

## 自定义主题

用户说"想要 XX 那种观感"（衬线、灰底引用、行距更大、标题不要主题色…）时，在**某套内置主题上改几个槽位**就行。

两条路，按"要不要留下"选：

| 想要 | 用什么 | 落不落盘 |
|---|---|---|
| 先试一下、看效果 | `fishpai_render({ theme_spec })` | **不落盘**，只写进那份 HTML |
| 用户认可、以后一直用 | `fishpai_theme({ action:'set', theme_spec })` | 落盘到 `<工作目录>/.fishpai/theme.json` |

`fishpai_theme` 存的是**工作目录级的一套**（不是主题库）：面板主题列表里只有**一个**「自定义主题」占位，
再 `set` 一次就是覆盖。`set` 之后会把当前文档切到它（若本会话已打开文档），用户在面板里立刻能看到；`action:'show'` 读回当前规格
（要改就在那份规格上改），`action:'clear'` 删掉（文档自动退回「默认公众号」；面板主题列表「我的」
那一组右边也有个 ×，效果一样）。
**别跟用户说"存了好几套"**——只有一套。

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
- **`wrapper` 里必须同时有 `font-family` 与 `font-size`**，否则面板的「字体」「字号」调节失效（漏了会自动补上）
- 想跟「主题色」联动就用 `{{PRIMARY}}` / `{{PRIMARY_BG}}` 占位符
- 不许出现 `{}` `<` `>` `"`（双引号；单引号可以，`font-family: 'Georgia', serif` 这类字体栈没问题）`url(...)` `expression(...)` `@import` `javascript:`；`!important` 写了会被自动去掉（微信不保留它）。不要写图标或 emoji
  （图标由鱼排统一给）
- 白色/深色底、渐变文字这类**微信会掉样式**的组合：`fishpai_render` 会照做，但你要当场提醒用户
  "这套更适合导出 HTML，发公众号可能变形"

## 支持的 Markdown（比标准多几种）

| 语法 | 效果 |
|---|---|
| `#`…`######` | 六级标题（h4–h6 套 h3 样式，与墨排一致） |
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

- 面板里能看到实时预览、主题/字号/手机宽度切换、批注抽屉（可一键定位到引用它的那段）、历史回滚
- 面板的编辑器支持 Markdown 快捷键（`Ctrl/⌘+B` 加粗等，右上角「快捷键」里有速查表），
  截图可以直接 `Ctrl/⌘+V` 粘进去（存到文档同级的 `assets/` 并在正文插入 `![](assets/…)`）
- 你改完之后，明确告诉用户"改了什么、在哪一块"，而不是只说"已更新"
- 如果人的批注互相冲突或指向不存在的块，直接说出来，不要猜着改
