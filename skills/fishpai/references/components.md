# 鱼排专业组件手册

专业管线（`target: 'xiumi'`）在普通 Markdown 之外提供一组**版式级组件**：多栏卡片、进度条、时间线、对比卡，以及一批「粘进公众号也能动」的 **SMIL 交互组件**（点击展开、滑动切换、探照灯、弹幕等）。

## 用法总览

组件有两种插入方式，按场景选：

1. **面板「⊕ 组件」抽屉**（推荐人操作）：点按钮选组件，自动在光标处插入对应的 `:::` 指令块。
2. **手写 `:::` 容器指令**（推荐 AI 操作）：直接在 Markdown 里写，Agent 用 `fishpai_write` 插入。

所有组件都只产出**内联样式 HTML + 纯 SVG**，不含 `id` / `class` / CSS 动画，符合公众号正文的清洗规则。每个组件都可用 `fishpai_lint` 单独校验。

## 静态版式组件

### 卡片 `card`

```
:::card
这里是卡片内容，支持 **加粗** 等行内格式。
:::
```

### 双栏 `two_columns`

`---` 单独一行分左右两栏：

```
:::two_columns
左栏内容
---
右栏内容
:::
```

### 渐变横幅 `gradient_banner`

```
:::gradient_banner
一句话标语
:::
```

### 编号步骤 `number_steps`

```
:::number_steps
第一步：做什么
第二步：做什么
:::
```

每行一条，自动编号。也支持 `-` 或 `1.` 列表写法。

### 引用卡 `quote` 与波浪分隔 `wave_divider`

```
:::quote
引用内容
:::

:::wave_divider
:::
```

`wave_divider` 无正文，产出一条装饰分隔。

## 交互组件（SMIL，粘进公众号可点/可动）

> 机制：微信公众号正文禁用 CSS `@keyframes`/`transition`，但为交互排版保留了 **SVG SMIL** 窄缝——`<animate>`/`<animateTransform>`/`<set>` + `begin="click"` 可用。鱼排的交互组件全部是「外层 SVG 动画层 + 内层普通内容层」的混合分层，发布后真实可点。
>
> 两条铁律组件已内建遵守：①不用 `id`+`for` 联动（微信剥所有 `id`），纯 SMIL `begin="click"`；②`foreignObject` 里塞 HTML 会被过滤，所以内容层走内联 HTML、动画层走纯 SVG。

### 点击展开 `expand`

```
:::expand
点我展开（封面提示文字）
---
这里是展开后才显示的内容，支持 **加粗**、列表等。
:::
```

`---` 前是封面提示，后是展开内容。适合「答案/详情/剧透」折叠。

### 点击换图展开 `swap`

```
:::swap
封面图或封面文字
---
展开后的内容
:::
```

### 滑动切换图集 `swiper`

```
:::swiper
https://example.com/1.png
https://example.com/2.png
https://example.com/3.png
:::
```

每行一个图片 URL。注意：**外链图会被微信拦**，需先在公众号后台转存，或改用本地图（复制时自动内嵌）。

### 探照灯 `spotlight`

```
:::spotlight
被照亮的关键内容
:::
```

### 弹幕 `danmaku`

```
:::danmaku
第一条弹幕
第二条弹幕
第三条弹幕
:::
```

每行一条，横向滚动（SMIL `animateTransform`，允许循环）。

### 进度条 `progress`

```
:::progress
70
:::
```

`0`–`100` 的数字，自动收敛到区间。数字后可跟空格加标签：

```
:::progress
70 已完成
:::
```

适合「完成度/进度」可视化。

### 时间线 `timeline`

```
:::timeline
2024 · 事件一
2025 · 事件二
2026 · 事件三
:::
```

每行一个节点，建议「时间 · 事件」格式。

### 对比卡 `compare`

```
:::compare
左：方案 A 的要点
---
右：方案 B 的要点
:::
```

左右对比，内部用 `<table>` 分栏（**不用** `display:grid`，微信会剥）。

## 校验

写完组件后，用 `fishpai_lint` 校验正文：

- 它会检查 `id`/`class`/`display:grid`/CSS 变量等微信禁令；
- CSS 动画（`animation:`/`transition:`/`@keyframes`）会被标为错误——动效一律用本手册的 SMIL 组件；
- SMIL 在 `height`/`width` 上的 `repeatCount="indefinite"` 会被告警（`transform`/`opacity` 循环放行）。

lint 是**提示工具**，帮助定位问题，不阻断交付；发布到草稿箱由发布管线另行处理。

## 预览与发布的差别

- **预览**（面板实时预览、`mode:'preview'`）：不做文本包裹，贴近你写的 Markdown。
- **发布/复制**（`mode:'publish'`、复制到公众号、发送草稿）：自动把文本容器的裸文本包进 `<span>`（对齐微信结构校验），SVG 整块跳过不包。

所以**别拿预览的 HTML 判断粘进微信后的样子**。
