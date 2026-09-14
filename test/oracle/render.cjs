#!/usr/bin/env node
/**
 * ⚠️ 冻结的迁移前 oracle —— 不要修改这个文件。
 *
 * 这是鱼排 ESM 化**之前**的渲染器（`D:\WorkSpace\mopai\render.js`，已与墨排线上站点逐条对照过），
 * 用来生成 `test/golden/**`：ESM 移植版必须与它逐字节一致。
 * 与原件唯一的差异是下面的 VENDOR 常量（指向 `plugin/vendor`，原件指向自带的 `vendor/`）。
 * 它与 `plugin/core/render.mjs` 是**两份独立代码**，正是这一点让 golden 有意义：
 * 若移植出错，对照会失败，而不是自证自洽。
 *
 * 重新生成 golden：
 *   node scripts/regen-golden.mjs            # 用本 oracle（默认）
 *   node scripts/regen-golden.mjs --from-core # 用 plugin/core（仅在"上游行为确实变了"时使用）
 *
 * mopai-render — 把 Markdown 排成可直接粘贴进微信公众号编辑器的 HTML。
 *
 * 与 mopai-markdown.vercel.app 逐条对齐（同一套 themes.js / markdown-it 配置）：
 *   markdown-it(html, breaks, linkify, typographer) + 主题内联样式 + 微信脚注转换
 *
 * 用法:
 *   node render.js <input.md> [-t 少数派] [-o out.html] [-c "#0071e3"]
 *   node render.js --list                 # 列出所有主题
 *   echo "## hi" | node render.js -        # 从 stdin 读
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const VENDOR = path.join(__dirname, '..', '..', 'plugin', 'vendor');

// ── 1. 在 vm context 里加载站点原版依赖 ─────────────────────────
// themes.js 用顶层 const 声明，不挂 window，所以必须 context 级顶层求值。
function loadRuntime() {
  const sandbox = { console, document: undefined };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const load = (f) => vm.runInContext(fs.readFileSync(path.join(VENDOR, f), 'utf8'), sandbox, { filename: f });
  load('markdown-it.min.js');
  load('highlight.min.js');
  load('themes.js');

  // hljs 在 UMD 里挂到自己身上，取出来交给沙箱的全局
  const hljs = sandbox.hljs || (sandbox.window && sandbox.window.hljs);
  if (hljs) sandbox.hljs = hljs;

  return sandbox;
}

const ctx = loadRuntime();
const read = (expr) => vm.runInContext(expr, ctx);

const THEMES = read('themes');
const COLOR_PRESETS = read('colorPresets');

/** 主题名/别名 -> 主题 key。允许用中文名、emoji 名或 key 指定。 */
function resolveTheme(name) {
  if (!name) return 'default';
  if (THEMES[name]) return name;
  const norm = String(name).replace(/\s/g, '');
  for (const [key, t] of Object.entries(THEMES)) {
    if (key === norm || t.name.replace(/\s/g, '') === norm) return key;
    if (t.name.replace(/\s/g, '').includes(norm) || norm.includes(t.name.replace(/\s/g, ''))) return key;
  }
  return null;
}

// ── 2. 样式解析 ────────────────────────────────────────────────
// 站点的字体预设（app.js 的 fontMap）；默认 fontFamily='sans' 会覆盖主题自带字体
const FONT_MAP = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif',
  serif: '"Georgia", "Noto Serif SC", "Source Han Serif SC", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", monospace',
};

function makeStyler(theme, customColor) {
  const primary = customColor || '#4f6ef7';
  const primaryBg = primary + '12';
  const resolve = (s) =>
    (s || '')
      .replace(/\{\{PRIMARY\}\}/g, primary)
      .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg)
      .trim();
  const st = theme.styles;
  const map = {};
  for (const k of Object.keys(st)) map[k] = resolve(st[k]);
  return map;
}

// ── 3. markdown-it 实例（配置与站点一致）───────────────────────
function createMd(styles, opts = {}) {
  const macCodeBlock = opts.macCodeBlock !== false;
  const markdownit = read('markdownit');
  const md = markdownit({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight(str, lang) {
      const hljs = read('hljs');
      let body = '';
      if (lang && hljs && hljs.getLanguage(lang)) {
        try { body = hljs.highlight(str, { language: lang }).value; }
        catch (_) { body = md.utils.escapeHtml(str); }
      } else {
        body = md.utils.escapeHtml(str);
      }
      return `<pre><code>${body}</code></pre>`;
    },
  });

  const attr = (extra) => extra; // 兼容辅助

  // 逐 token 打内联样式：等价于站点「DOM 扫描 + setAttribute('style', 原有+主题)」
  const styled = (tag, key) => (tokens, idx, opts, env, slf) => {
    const s = styles[key];
    const a = slf.renderAttrs(tokens[idx]);
    const style = s ? ` style="${s}"` : '';
    return `<${tag}${style}${a}>`;
  };
  const styledClose = (tag) => (tokens, idx) => {
    const s = styles[tag];
    return `</${tag}>`;
  };

  // 标题：token 类型统一是 heading_open，真实标签在 token.tag 上
  md.renderer.rules.heading_open = (t, i, o, e, slf) => {
    const h = t[i].tag;                       // h1..h6
    const key = ['h1', 'h2', 'h3'].includes(h) ? h : 'h3';  // 站点把 h4-h6 归到 h3
    const a = slf.renderAttrs(t[i]);
    return `<${h}${styles[key] ? ` style="${styles[key]}"` : ''}${a}>`;
  };
  md.renderer.rules.paragraph_open = (t, i, o, e, slf) => {
    if (t[i].hidden) return '';               // 紧凑列表内的段落，站点走的也是默认行为：不输出
    const a = slf.renderAttrs(t[i]);
    return `<p${styles.p ? ` style="${styles.p}"` : ''}${a}>`;
  };
  md.renderer.rules.paragraph_close = (t, i) => (t[i].hidden ? '' : '</p>\n');
  md.renderer.rules.blockquote_open = (t, i) => `<blockquote${styles.blockquote ? ` style="${styles.blockquote}"` : ''}>`;
  md.renderer.rules.bullet_list_open = (t, i) => `<ul${styles.ul ? ` style="${styles.ul}"` : ''}>`;
  md.renderer.rules.ordered_list_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i]);
    return `<ol${styles.ol ? ` style="${styles.ol}"` : ''}${a}>`;
  };
  md.renderer.rules.list_item_open = (t, i) => `<li${styles.li ? ` style="${styles.li}"` : ''}>`;
  md.renderer.rules.hr = (t, i, o, e, slf) => `<hr${styles.hr ? ` style="${styles.hr}"` : ''}${slf.renderAttrs(t[i])}>`;

  // 链接
  md.renderer.rules.link_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i]);
    return `<a${styles.a ? ` style="${styles.a}"` : ''}${a}>`;
  };

  // 行内 code
  md.renderer.rules.code_inline = (t, i) => `<code${styles.code_inline ? ` style="${styles.code_inline}"` : ''}>${md.utils.escapeHtml(t[i].content)}</code>`;

  // 代码块
  md.renderer.rules.fence = (t, i) => {
    const tok = t[i];
    const info = (tok.info || '').trim();
    if (info.toLowerCase() === 'mermaid') {
      return `<div class="mermaid-placeholder">${md.utils.escapeHtml(tok.content)}</div>`;
    }
    const s = styles.code_block || '';
    let body;
    const hljs = read('hljs');
    if (info && hljs && hljs.getLanguage(info)) {
      try { body = hljs.highlight(tok.content, { language: info }).value; }
      catch (_) { body = md.utils.escapeHtml(tok.content); }
    } else {
      body = md.utils.escapeHtml(tok.content);
    }
    // mac 形态：站点默认开启。markdown-it 的默认 fence 规则会把 highlight 回调的返回值
    // 再包一层 <pre><code class="language-xxx">，而 highlight 回调本身返回 mac 结构，
    // 于是真实 DOM 是 pre > code > div.mac-code-block > (header + pre > code)。
    // 外层 pre/code 随后被主题样式覆盖，内层 pre 被 publish-utils 压平。
    if (macCodeBlock) {
      const langLabel = info || 'code';
      const bg = (s.match(/background:\s*([^;]+)/) || [])[1] || '#282c34';
      const fg = (s.match(/(?:^|;\s*)color:\s*([^;]+)/) || [])[1] || '#abb2bf';
      return `<pre${s ? ` style="${s}"` : ''}><code${info ? ` class="language-${info}"` : ''} style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">`
        + `<div class="mac-code-block" style="border-radius: 10px; overflow: hidden; margin: 14px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">`
        + `<div class="mac-code-header" style="background: ${bg.trim()}; padding: 10px 16px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">`
        + `<span class="mac-dot red" style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; display: inline-block;"></span>`
        + `<span class="mac-dot yellow" style="width: 12px; height: 12px; border-radius: 50%; background: #febc2e; display: inline-block;"></span>`
        + `<span class="mac-dot green" style="width: 12px; height: 12px; border-radius: 50%; background: #28c840; display: inline-block;"></span>`
        + `<span class="mac-code-lang" style="margin-left: auto; font-size: 12px; color: ${fg.trim()}; opacity: 0.5; font-family: -apple-system, sans-serif;">${langLabel}</span>`
        + `</div>`
        + `<pre style="background: ${bg.trim()}; color: ${fg.trim()}; padding: 16px; margin: 0; font-size: 13px; line-height: 1.7; overflow-x: auto; font-family: &quot;SFMono-Regular&quot;, Consolas, monospace;">`
        + `<code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${body}</code></pre>`
        + `</div></code></pre>`;
    }
    return `<pre${s ? ` style="${s}"` : ''}><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${body}</code></pre>\n`;
  };
  md.renderer.rules.code_block = (t, i) => {
    const s = styles.code_block ? ` style="${styles.code_block}"` : '';
    return `<pre${s}><code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent;">${md.utils.escapeHtml(t[i].content)}</code></pre>\n`;
  };

  // 图片：站点只给 img 打主题样式
  md.renderer.rules.image = (t, i, o, e, slf) => {
    const tok = t[i];
    tok.attrSet('style', styles.img || '');
    const src = tok.attrGet('src') || '';
    const alt = slf.renderInlineAsText(tok.children, o, e);
    const title = tok.attrGet('title');
    const t2 = title ? ` title="${md.utils.escapeHtml(title)}"` : '';
    return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}"${t2} style="${styles.img || ''}">`;
  };

  // 表格
  md.renderer.rules.table_open = () => `<table${styles.table ? ` style="${styles.table}"` : ''}>\n`;
  md.renderer.rules.thead_open = () => '<thead>\n';
  md.renderer.rules.tbody_open = () => '<tbody>\n';
  md.renderer.rules.tr_open = () => '<tr>';
  md.renderer.rules.th_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i]);
    return `<th${styles.th ? ` style="${styles.th}"` : ''}${a}>`;
  };
  md.renderer.rules.td_open = (t, i, o, e, slf) => {
    const a = slf.renderAttrs(t[i]);
    return `<td${styles.td ? ` style="${styles.td}"` : ''}${a}>`;
  };

  // 加粗 / 斜体
  md.renderer.rules.strong_open = () => `<strong${styles.strong ? ` style="${styles.strong}"` : ''}>`;
  md.renderer.rules.em_open = () => `<em${styles.em ? ` style="${styles.em}"` : ''}>`;

  // ── 信息卡片 ::: info/warning/tip/danger ──
  const colorMap = {
    info: { bg: '#eef6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
    warning: { bg: '#fff8e6', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
    tip: { bg: '#ecfdf5', border: '#10b981', icon: '💡', color: '#065f46' },
    danger: { bg: '#fef2f2', border: '#ef4444', icon: '🚫', color: '#991b1b' },
  };
  md.core.ruler.after('block', 'info_card', (state) => {
    const tokens = state.tokens;
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].type === 'paragraph_open') {
        const nx = tokens[i + 1];
        if (nx && nx.type === 'inline' && nx.content) {
          const m = nx.content.match(/^:::(info|warning|tip|danger)\s*(.*?)(?:\n|$)([\s\S]*?):::$/);
          if (m) {
            const c = colorMap[m[1]] || colorMap.info;
            const title = m[2].trim();
            const body = m[3].trim();
            const tk = new state.Token('html_block', '', 0);
            tk.content = `<div style="border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;">
  <div style="font-weight: 600; color: ${c.color}; margin-bottom: 6px; font-size: 15px;">${title || c.icon + ' ' + m[1].toUpperCase()}</div>
  <div style="color: ${c.color}; opacity: 0.85; font-size: 14px; line-height: 1.7;">${md.renderInline(body)}</div>
</div>`;
            tokens.splice(i, 3, tk);
            continue;
          }
        }
      }
      i++;
    }
  });

  return md;
}

// ── 4. 微信脚注：正文外链转上标 + 文末「参考资料」──
// 站点做法：把 <a> 换成 <span>，沿用该 <a> 已经拿到的主题链接样式（含 border-bottom），
// 再补一个 cursor: default 的 <sup>；文末追加纯文本「参考资料」（微信不支持正文外链）。
function linksToFootnotes(md, html, styles = {}) {
  const links = [];
  const supStyle = 'color: inherit; font-size: 80%; vertical-align: super; cursor: default;';
  const out = html.replace(
    /<a\s([^>]*?)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g,
    (full, pre, href, post, inner) => {
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return full;
      const text = inner.replace(/<[^>]+>/g, '');
      const idx = links.length + 1;
      links.push({ idx, text, href });
      // 原 <a> 上的 style 即主题链接样式，站点直接沿用它
      const sm = full.match(/\sstyle="([^"]*)"/);
      const spanStyle = sm ? sm[1] : '';
      return `<span style="${spanStyle}">${inner}<sup style="${supStyle}">[${idx}]</sup></span>`;
    }
  );
  if (!links.length) return out;
  return out + `\n<section style="margin-top: 28px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; line-height: 1.8; color: #999;">\n`
    + `<p style="margin: 0 0 8px; font-weight: 600; color: #666;">参考资料</p>\n`
    + links.map((l) => `<p style="margin: 0 0 4px; word-break: break-all;">${l.text && l.text !== l.href ? `[${l.idx}] ${l.text}: ${l.href}` : `[${l.idx}] ${l.href}`}</p>`).join('\n')
    + `\n</section>`;
}

// ── 5. 清理：去掉公众号不认的属性 ──────────────────────────────
// 注意：不做全局空白折叠 —— 站点是 DOM 序列化，段落/标题开始的换行会保留成文本节点，
// 折叠它反而会改变预览观感（列表项还会多出缩进）。
function cleanForWechat(html) {
  return html
    .replace(/\sclass="mermaid-placeholder"/g, '')
    .replace(/\starget="[^"]*"/g, '')
    .replace(/<div >/g, '<div>')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

// ── 6. 「复制到公众号」那层清洗（对应站点 js/publish-utils.js）──
// 站点点「复制到公众号」时不是照搬预览 HTML，而是走 simplifyHtmlForPlatform：
//   1) 内联样式按白名单过滤（border-radius / box-shadow / letter-spacing 等会被剥掉）
//   2) 去掉 class / data-* 属性
//   3) 代码块扁平化，并把 highlight.js 的 token 颜色内联成 style
//   4) 图片补 max-width:100%; height:auto
const STYLE_ALLOWLIST = new Set([
  'background', 'background-color', 'border', 'border-left', 'border-right', 'border-top',
  'border-bottom', 'border-collapse', 'color', 'font-family', 'font-size', 'font-style',
  'font-weight', 'height', 'letter-spacing', 'line-height', 'margin', 'margin-bottom',
  'margin-left', 'margin-right', 'margin-top', 'max-width', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'text-align', 'text-decoration',
  'vertical-align', 'width',
]);

const DEFAULT_PRE_STYLE =
  'margin: 14px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; ' +
  'line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;';

let HLJS_MAP = null;
function hljsMap() {
  if (HLJS_MAP) return HLJS_MAP;
  try {
    HLJS_MAP = JSON.parse(fs.readFileSync(path.join(VENDOR, 'hljs-map.json'), 'utf8'));
  } catch (_) {
    HLJS_MAP = {};
  }
  return HLJS_MAP;
}

function filterInlineStyles(styleText) {
  return String(styleText || '')
    .split(';')
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((rule) => STYLE_ALLOWLIST.has((rule.split(':')[0] || '').trim().toLowerCase()))
    .join('; ');
}

function appendInlineStyle(styleText, extra) {
  const cur = String(styleText || '');
  const sep = cur && !cur.trim().endsWith(';') ? '; ' : '';
  return `${cur}${sep}${extra}`;
}

/** 给 highlight.js 的 <span class="hljs-xxx"> 内联颜色
 *  （hljs-map.json 是从真实浏览器导出的计算样式，已处理 CSS 优先级） */
function hljsStyleFor(cls) {
  const map = hljsMap();
  if (!cls) return null;
  // 1) 优先按完整 class 串查（覆盖 "hljs-title function_" 这类复合写法）
  if (map[cls]) return styleFrom(map[cls]);
  // 2) 再按 class 出现顺序逐段查，取第一个有规则的
  for (const n of cls.split(/\s+/).filter(Boolean)) {
    if (map[n]) return styleFrom(map[n]);
  }
  return null;
}

function styleFrom(m) {
  if (!m) return null;
  let s = '';
  if (m.color) s += `color: ${m.color};`;
  if (m.fontWeight && m.fontWeight !== '400' && m.fontWeight !== 'normal') s += ` font-weight: ${m.fontWeight};`;
  if (m.fontStyle && m.fontStyle !== 'normal') s += ` font-style: ${m.fontStyle};`;
  return s.trim() || null;
}

/** mac 标题栏圆点/语言标签：站点也会被 inlineCodeTokenStyles 命中，补上计算样式 */
function macSpanStyle(cls) {
  if (/\bmac-dot\b/.test(cls)) {
    let bg = null, color = null;
    let m = cls.match(/\bmac-dot\s+red\b/); if (m) { bg = 'rgb(255, 95, 87)'; }
    m = cls.match(/\bmac-dot\s+yellow\b/); if (m) { bg = 'rgb(254, 188, 46)'; }
    m = cls.match(/\bmac-dot\s+green\b/); if (m) { bg = 'rgb(40, 200, 64)'; }
    color = 'rgb(171, 178, 191)';
    let s = `color: ${color};`;
    if (bg) s += ` background-color: ${bg};`;
    return s;
  }
  if (/\bmac-code-lang\b/.test(cls)) return 'color: rgb(171, 178, 191);';
  return null;
}

function appendStyle(existing, extra) {
  if (!extra) return existing || '';
  const cur = existing || '';
  if (!cur) return extra;
  const sep = cur.trim().endsWith(';') ? ' ' : '; ';
  return cur + sep + extra;
}

/** 代码块扁平化（站点 simplifyMacCodeBlocks）：
 * 站点 DOM 里 mac 结构嵌在 pre>code 内，所以 block.querySelector('pre') 命中内层 pre，
 * 压平只是给内层 pre 重打一套固定样式，外层 pre>code 原样保留。 */
function simplifyCodeBlocks(html) {
  // 内层 pre（mac 代码正文）：重打固定样式，去掉 class
  html = html.replace(
    /<div class="mac-code-block"([^>]*)>([\s\S]*?)<\/div>\s*<\/code><\/pre>/g,
    (full, macAttrs, inner) => {
      const innerFixed = inner.replace(
        /<pre[^>]*>/,
        `<pre style="margin: 14px 0; padding: 14px 16px; background: #282c34; color: #abb2bf; line-height: 1.7; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px;">`
      );
      return `<div class="mac-code-block"${macAttrs}>${innerFixed}</div></code></pre>`;
    }
  );
  return html;
}

/**
 * 代码 span 样式内联（站点 inlineCodeTokenStyles）。
 *
 * 真实行为（已实测）：站点对 `pre code span` 里的**每一个** span 都写内联样式，
 * 不只是 hljs token —— mac 标题栏的圆点 span 同样在内。所以这里对
 * `<pre>…</pre>` 区间内的所有 span 统一处理。
 */
function inlineCodeStyles(html) {
  const blocks = [];
  const out = html.replace(/<pre[\s\S]*?<\/pre>/g, (m) => {
    blocks.push(m);
    return `\x01${blocks.length - 1}\x01`;
  });

  return out.replace(/\x01(\d+)\x01/g, (_, n) => {
    const block = blocks[Number(n)];
    return block.replace(/<span([^>]*)>/g, (full, attrs) => {
      const cm = attrs.match(/\bclass="([^"]*)"/);
      const cls = cm ? cm[1] : '';
      const sm = attrs.match(/\bstyle="([^"]*)"/);
      const existing = sm ? sm[1] : '';
      const extra = macSpanStyle(cls) || hljsStyleFor(cls);
      if (!extra) return full;
      const merged = appendStyle(existing, extra);
      const rest = sm ? attrs.replace(/\sstyle="[^"]*"/, '') : attrs;
      return `<span${rest} style="${merged}">`;
    });
  });
}

/**
 * 「复制到公众号」那层处理（对应 publish-utils.prepareHtml）。
 *
 * 关键：站点「复制到公众号」按钮走的是 copyToClipboard → copyPublishHtmlToClipboard(false)，
 * 即 simple=false —— **不做样式白名单过滤**，也不压平 mac 代码块；
 * 只做一件事：把代码块内 span 的颜色用 getComputedStyle 内联进去。
 * 微信编辑器自己会丢弃不认识的内联属性。
 */
function prepareForPublish(html, opts = {}) {
  if (opts.simple) return simplifyForPublish(html);
  return inlineCodeStyles(html);
}

/** 严格简化（站点 simple=true，用于「一键发布到 14 平台」路径）：
 *  样式白名单过滤 + 去 class + 代码块扁平化 + 图片补样式。 */
function simplifyForPublish(html) {
  html = inlineCodeStyles(html);
  html = simplifyCodeBlocks(html);

  // 逐标签过滤 style + 去掉 class / data-*
  html = html.replace(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)(\/?)>/g, (full, tag, body, selfClose) => {
    if (!body || !body.trim()) return full;
    let rest = body
      .replace(/\sclass="[^"]*"/g, '')
      .replace(/\sdata-[a-z-]+="[^"]*"/g, '');
    const sm = rest.match(/\sstyle="([^"]*)"/);
    if (sm) {
      const kept = filterInlineStyles(sm[1]);
      rest = rest.replace(/\sstyle="[^"]*"/, kept ? ` style="${kept}"` : '');
    }
    return `<${tag}${rest}${selfClose || ''}>`;
  });

  // 图片补微信兼容样式
  html = html.replace(/<img([^>]*?)>/g, (full, body) => {
    const sm = body.match(/\sstyle="([^"]*)"/);
    const merged = appendInlineStyle(sm ? sm[1] : '', 'max-width: 100%; height: auto;');
    const cleaned = sm ? body.replace(/\sstyle="[^"]*"/, '') : body;
    return `<img${cleaned} style="${merged}">`;
  });

  return html;
}

// ── 7. 主渲染 ──────────────────────────────────────────────────
/**
 * @param {string} markdownText
 * @param {object} [opts]
 * @param {string} [opts.theme]       主题 key 或中文名，默认 default
 * @param {string} [opts.color]       主题色覆盖，如 '#0071e3'
 * @param {boolean}[opts.footnotes]   正文外链转脚注，默认 true
 * @param {boolean}[opts.publish]     true=按「复制到公众号」的清洗规则输出（默认），
 *                                    false=输出预览原样 HTML
 * @param {boolean}[opts.macCodeBlock] 代码块是否用 mac 标题栏形态，默认 true
 * @param {string} [opts.fontSize]    覆盖 wrapper 字号，如 '15px'
 */
function render(markdownText, opts = {}) {
  const key = resolveTheme(opts.theme);
  if (!key) throw new Error(`未知主题: ${opts.theme}（用 --list 查看）`);
  const theme = THEMES[key];
  const styles = makeStyler(theme, opts.color);
  const md = createMd(styles, { macCodeBlock: opts.macCodeBlock });

  let body = md.render(markdownText);
  if (opts.footnotes !== false) body = linksToFootnotes(md, body, styles);
  body = cleanForWechat(body);

  let wrapperStyle = styles.wrapper || '';
  // 站点行为：字体预设与字号总会覆盖主题自带的 font-family / font-size
  const font = opts.font === null ? null : (opts.font || 'sans');
  if (font && FONT_MAP[font]) {
    wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${FONT_MAP[font]};`);
  }
  const size = opts.fontSize || '16px';
  wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${size};`);
  // 站点会先把双引号换成单引号，避免破坏 style 属性
  wrapperStyle = wrapperStyle.replace(/"/g, "'");

  if (opts.publish !== false) {
    body = prepareForPublish(body, { simple: !!opts.simple });
  }

  const html = `<div style="${wrapperStyle}">${body}</div>`;
  return { html, themeKey: key, themeName: theme.name };
}

// ── 8. CLI ─────────────────────────────────────────────────────
function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--list')) {
    console.log('可用主题（key / 名称）:');
    for (const [k, t] of Object.entries(THEMES)) console.log(`  ${k.padEnd(11)} ${t.emoji} ${t.name}  — ${t.desc}`);
    console.log('\n预设颜色:');
    console.log('  ' + COLOR_PRESETS.map((c) => `${c.name} ${c.color}`).join(' | '));
    return 0;
  }

  let input = null, theme = 'default', out = null, color = null, footnotes = true;
  let publish = true, macCodeBlock = true, fontSize = null, simple = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-t' || a === '--theme') theme = args[++i];
    else if (a === '-o' || a === '--out') out = args[++i];
    else if (a === '-c' || a === '--color') color = args[++i];
    else if (a === '-s' || a === '--size') fontSize = args[++i];
    else if (a === '--no-footnotes') footnotes = false;
    else if (a === '--preview') publish = false;
    else if (a === '--no-mac') macCodeBlock = false;
    else if (a === '--simple') simple = true;
    else if (a === '-' || !a.startsWith('-')) input = a;
  }
  if (!input) {
    console.error(`用法: node render.js <input.md> [选项]

  -t, --theme <名>    主题（key 或中文名，默认 default；--list 查看全部）
  -o, --out <文件>    输出文件，缺省打印到 stdout
  -c, --color <色值>  主题色覆盖，如 '#0071e3'
  -s, --size <字号>   覆盖正文字号，如 15px
      --no-footnotes  不把正文外链转成文末脚注
      --no-mac        代码块不用 mac 标题栏形态
      --simple        再加一层样式白名单简化（站点「一键发布 14 平台」用的路径）
      --preview       输出预览原样 HTML（不套复制到公众号的处理）
      --list          列出主题与预设颜色`);
    return 2;
  }

  const text = input === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(input, 'utf8');
  const { html, themeName } = render(text, { theme, color, footnotes, publish, macCodeBlock, fontSize, simple });

  if (out) {
    fs.writeFileSync(out, html, 'utf8');
    console.error(`[ok] 主题「${themeName}」 -> ${out}  (${html.length} 字符)`);
  } else {
    process.stdout.write(html);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { render, THEMES, COLOR_PRESETS, resolveTheme };
