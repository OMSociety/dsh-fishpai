# 起源与第三方许可（NOTICE）

鱼排（FishPai，仓库 `OMSociety/dsh-fishpai`）是 [MoPai 墨排 / mopai-markdown](https://github.com/ye4wzp/mopai-markdown)
的 **fork**，在保持上游 MIT 许可与版权声明的前提下，重构为 DeepSeek Harness（DSH）插件。

## 1. 上游

| 项 | 内容 |
|---|---|
| 上游仓库 | https://github.com/ye4wzp/mopai-markdown |
| 上游作者 | [@ye4wzp](https://github.com/ye4wzp) |
| 许可 | MIT |
| 本仓库 fork 自 | 上游 `main` 的 `c91487abfc5848f5b78e9fcec3b62d58033c61dc`（2026-08-19）——即 fork 当时的 `main` 顶端；两者的共同祖先是 `a33b33d606032091f48e62386592daefc3f8f472`（2026-06-08），此后本仓库独立演进 |

鱼排直接复用了上游两项核心资产，均为 MIT：

1. **主题定义** —— 上游 `js/themes.js` 复制为本仓库 `plugin/vendor/themes.js`（换行符归一为 LF；
   另外**有意删除了两套主题**：「金融时报（ft）」与「Medium」——前者靠整页异色底立身、公众号文章不要
   整页底色，后者与「纽约时报」只剩字号与字体栈的差别）。保留下来的主题里**「claude」有一处有意改动**：
   上游 wrapper 结尾的 `background: #fffcf5;`（整页米色底）已删除，理由与 ft 相同。
   上游原版 `js/themes.js` 的 blob SHA 为 `dfa0ea47287fb16969aabe75163f9049c10c82e8`，
   需要逐字节比对时按此锚点取上游文件核对。
2. **渲染管线设计** —— 「先渲染 HTML，再给每个标签内联主题样式」「复制到公众号时把代码块内
   span 的计算样式内联」「h4–h6 套 h3 样式」「外链转文末参考资料」等行为与验收标准。

## 2. 打包进本仓库的第三方代码与图形数据

| 文件 | 版本 | 许可 | 版权 |
|---|---|---|---|
| `plugin/vendor/markdown-it.min.js` | markdown-it 14.1.0 | MIT | © 2014 Vitaly Puzrin, Alex Kocharin |
| `plugin/vendor/highlight.min.js` | highlight.js 11.9.0 (git f47103d4f1) | BSD-3-Clause | © 2006, Ivan Sagalaev |
| `plugin/vendor/themes.js` | 上游同步（移除两套主题，见上） | MIT | © 2026 [@ye4wzp](https://github.com/ye4wzp) |
| `plugin/vendor/hljs-map.json` | — | MIT（本仓库整理） | 从真实浏览器导出的 highlight.js token 计算样式表 |
| `client/theme-icons.tsx` | 图标几何复制自 `@deepseek-ai/dsh-client-ui-primitives` 0.2.0-rc.2 | MIT | © 2026 DeepSeek |

最后一行（`client/theme-icons.tsx`）不是打包进来的依赖，而是**复制**过来的图形数据：主题与控件
图标的 `<path>` 几何取自 DSH 内建图标集。之所以复制而不是 `require` 那个包，是因为 rc2 官方在
`cordis-plugin-development/references/practices.md` 里明文禁止客户端 bundle 把 Harness Client
包当模块加载（宿主升级改名会让插件静默少图标），替代做法就是把 primitive 的标记复制进插件。
按 MIT 的要求保留版权与许可声明如下；条款正文与本节末尾 `markdown-it` 的 MIT 全文逐字相同，
此处只另列版权行。

```
MIT License

Copyright (c) 2026 DeepSeek
```

`markdown-it` 与 `highlight.js` 的运行时代码随本插件一起分发。两者都是压缩产物，首部注释里
只留了一行简短声明——MIT 要求"在软件的所有副本中保留版权声明与本许可声明"，BSD-3-Clause
要求"以二进制形式再分发时在文档中复现版权声明、条件列表与免责声明"。两份完整条款因此
附在本节末尾；`.min.js` 首部的原文如下（逐字，`undefined` 是上游构建脚本留下的占位符，
版权人以上游 `LICENSE` 的 `Copyright (c) 2006, Ivan Sagalaev.` 为准）：

```
/*! markdown-it 14.1.0 https://github.com/markdown-it/markdown-it @license MIT */
```

```
/*!
  Highlight.js v11.9.0 (git: f47103d4f1)
  (c) 2006-2023 undefined and other contributors
  License: BSD-3-Clause
 */
```

### markdown-it 14.1.0 — MIT

```
Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin.

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```

### highlight.js 11.9.0 — BSD-3-Clause

```
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 3. 刻意**未**引入的东西

| 项目 | 原因 |
|---|---|
| `wechatsync/Wechatsync` 及其派生的 `article-syncjs` | 上游为 GPL-3.0，派生物**没有**许可证文件（默认保留全部权利）。鱼排不做多平台分发。 |
| `DOMPurify` | 许可为 `(MPL-2.0 OR Apache-2.0)`，MPL 是文件级 copyleft。鱼排的渲染在宿主侧完成，预览走沙箱 iframe，不需要它。 |

## 4. 本仓库新增部分的许可

新增代码同样以 MIT 发布，版权归 [@OMSociety](https://github.com/OMSociety)。完整条款见 `LICENSE`。
