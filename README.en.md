<div align="center">

# MoPai ✒️

**More than a formatter — write once, then "de-AI" your prose and distribute to 14+ platforms in one click.**

A local, install-free Markdown typesetting tool built for creators on WeChat Official Accounts, Zhihu, CSDN and other Chinese content platforms.

[![▶ Live Demo](https://img.shields.io/badge/▶_Live-Demo-4f6ef7?style=for-the-badge)](https://mopai-markdown.vercel.app)

[![test](https://github.com/ye4wzp/mopai-markdown/actions/workflows/test.yml/badge.svg)](https://github.com/ye4wzp/mopai-markdown/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vuedotjs)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square)

**English** · [中文](README.md)

<img src="screenshots/main.png" alt="MoPai main interface" width="820">

👉 **No install needed — try it now: <https://mopai-markdown.vercel.app>**

</div>

## 🔥 Why MoPai

There are plenty of "Markdown → WeChat" formatters. MoPai aims at the **full write-to-publish loop**. Here's what sets it apart from a plain formatter:

- 🧹 **De-AI your writing** — a built-in detector flags telltale AI phrasing, with optional one-click rewriting via DeepSeek. Plain formatters don't do this.
- 🚀 **One-click multi-platform distribution** — copies content in each platform's best format for 14 platforms; pairs with the [WechatSync](https://github.com/wechatsync/Wechatsync) extension to push drafts to 29+ platforms.
- 🖼️ **Four export formats** — HTML / PDF / long-image PNG / Word, auto-named from the article title.
- 📱 **Works offline** — installable PWA; fully usable on mobile (edit / preview tabs).
- 🎨 **13 themes + deep customization** — dark mode, custom accent color, fonts, and custom CSS.

## ✨ Features

- **Editor** — live preview, undo/redo (50 steps), 300ms debounced render, formatting toolbar, Tab indent, find & replace, focus mode, line numbers, keyboard shortcuts.
- **Themes & styling** — 13 themes, dark mode, 12 preset accent colors + picker, 3 font families × 5 sizes, custom CSS, macOS-style code blocks.
- **Publish & distribute** — 14-platform one-click copy with per-platform format (rich text / Markdown / excerpt); WechatSync integration; ⌘⇧C to copy rich text straight into the WeChat editor.
- **Preview & export** — mobile preview, responsive mobile UI, export HTML / PDF / long image / Word, synced scrolling.
- **Images** — paste (⌘V) / drag-drop, Base64 placeholder hiding, optional SM.MS image hosting, image manager.
- **More** — floating TOC, WeChat link-to-footnote, Mermaid diagrams, template library, autosaved drafts, word count / reading time, word-count goal, PWA install.

## 🚀 Quick start

It's a pure front-end project — no build step, no dependencies.

```bash
git clone https://github.com/ye4wzp/mopai-markdown.git
cd mopai-markdown
python3 -m http.server 8080   # or: npx serve -p 8080
open http://localhost:8080
```

Or just use the hosted demo: <https://mopai-markdown.vercel.app>

## 🔄 Multi-platform distribution (WechatSync)

1. Install the [Article Sync Assistant Chrome extension](https://chrome.google.com/webstore/detail/hchobocdmclopcbnibdnoafilagadion)
2. Log into your target platforms in the browser
3. Write / format your article in MoPai
4. Toolbar → **Export ▾** → **🚀 Distribute to multiple platforms**
5. Pick platforms in the WechatSync dialog and publish (as drafts you can review)

## 🧪 Development

```bash
npm test   # runs the Chrome CDP integration test (needs Node 22+ and Chrome)
```

## 🙏 Credits

Inspired by [huasheng_editor](https://github.com/alchaincyf/huasheng_editor), [doocs/md](https://github.com/doocs/md), and built on [WechatSync](https://github.com/wechatsync/Wechatsync), [markdown-it](https://github.com/markdown-it/markdown-it), [Highlight.js](https://github.com/highlightjs/highlight.js), and [Mermaid](https://github.com/mermaid-js/mermaid).

## 📄 License

[MIT](LICENSE) © 2026 ye4wzp
