// ============================================
// Markdown 排版器 V3 — Vue 3 应用主逻辑
// ============================================
const { createApp, ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

// localStorage JSON 读取兜底：数据损坏时返回默认值，避免整页崩溃
function lsReadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

const app = createApp({
  setup() {
    // ─── 状态 ──────────────────────────
    const markdownText = ref(sampleMarkdown);
    const currentTheme = ref('default');
    const showHistory = ref(false);
    const showSettings = ref(false);
    const showToc = ref(false);
    const historyList = ref([]);
    const copySuccess = ref(false);
    const copyTarget = ref('');
    const darkMode = ref(false);
    const customColor = ref('#4f6ef7');
    const fontFamily = ref('sans');
    const fontSize = ref(16);
    const macCodeBlock = ref(localStorage.getItem('md-converter-maccode') !== 'false');
    const mobilePreview = ref(false);
    const showImageGuide = ref(false);
    const wechatFootnote = ref(true);
    const hoveredTheme = ref(null);
    const themePreviewTimer = ref(null);
    const useImageHost = ref(localStorage.getItem('md-converter-imagehost') !== 'false');
    const uploadingImage = ref(false);

    // AI 检测状态
    const showAiDetect = ref(false);
    const aiDetectResult = ref({ total: 0, issues: [], score: 100 });
    const deepseekKey = ref(localStorage.getItem('md-converter-deepseek-key') || '');

    // 图床管理状态
    const showImageManager = ref(false);
    const imageHistory = ref(lsReadJSON('md-converter-image-history', []));

    // Phase 2 状态
    const focusMode = ref(false);
    const showFindReplace = ref(false);
    const findText = ref('');
    const replaceText = ref('');
    const findCount = ref(0);
    const wordGoal = ref(parseInt(localStorage.getItem('md-converter-word-goal') || '0'));
    const showLineNumbers = ref(localStorage.getItem('md-converter-linenumbers') !== 'false');

    // Phase 3 状态
    const showTemplates = ref(false);
    const templates = templateLibrary || [];
    const customCss = ref(localStorage.getItem('md-converter-custom-css') || '');
    const showExportMenu = ref(false);
    const mobileTab = ref('editor');

    // ─── 撤回/重做 ────────────────────
    const UNDO_MAX = 50;
    const undoStack = [];
    const redoStack = [];
    let isUndoRedo = false; // 防止 watch 触发时又压栈
    function pushUndo(text) {
      if (undoStack.length >= UNDO_MAX) undoStack.shift();
      undoStack.push(text);
      redoStack.length = 0; // 新编辑清空 redo
    }
    function undo() {
      if (undoStack.length === 0) return;
      isUndoRedo = true;
      redoStack.push(markdownText.value);
      markdownText.value = undoStack.pop();
      nextTick(() => { isUndoRedo = false; });
    }
    function redo() {
      if (redoStack.length === 0) return;
      isUndoRedo = true;
      undoStack.push(markdownText.value);
      markdownText.value = redoStack.pop();
      nextTick(() => { isUndoRedo = false; });
    }

    // ─── 渲染防抖 ────────────────────
    let renderTimer = null;
    const RENDER_DEBOUNCE = 300; // ms

    // ─── 图片存储（Base64 隐藏）──────────
    const IMAGE_STORE_KEY = 'md-converter-image-store';
    const imageStore = (() => {
      try {
        const saved = localStorage.getItem(IMAGE_STORE_KEY);
        return saved ? new Map(JSON.parse(saved)) : new Map();
      } catch { return new Map(); }
    })();
    function saveImageStore() {
      try { localStorage.setItem(IMAGE_STORE_KEY, JSON.stringify([...imageStore])); } catch {}
    }
    function genImageId() {
      return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    function expandImagePlaceholders(text) {
      return text.replace(/img:([a-z0-9_]+)/g, (match, id) => {
        return imageStore.has(id) ? imageStore.get(id) : match;
      });
    }

    // ─── Markdown-it 初始化 ──────────────
    const md = window.markdownit({
      html: true,
      breaks: true,
      linkify: true,
      typographer: true,
      highlight: function (str, lang) {
        const langLabel = lang || 'code';
        let highlighted = '';
        if (lang && hljs.getLanguage(lang)) {
          try {
            highlighted = hljs.highlight(str, { language: lang }).value;
          } catch (_) {
            highlighted = md.utils.escapeHtml(str);
          }
        } else {
          highlighted = md.utils.escapeHtml(str);
        }
        if (macCodeBlock.value) {
          return `<div class="mac-code-block">
            <div class="mac-code-header">
              <span class="mac-dot red"></span>
              <span class="mac-dot yellow"></span>
              <span class="mac-dot green"></span>
              <span class="mac-code-lang">${langLabel}</span>
            </div>
            <pre style="margin:0;"><code>${highlighted}</code></pre>
          </div>`;
        }
        return `<pre><code>${highlighted}</code></pre>`;
      }
    });

    // ─── 信息卡片插件 ──────────────────
    function infoCardPlugin(md) {
      md.core.ruler.after('block', 'info_card', function(state) {
        const tokens = state.tokens;
        let i = 0;
        while (i < tokens.length) {
          if (tokens[i].type === 'paragraph_open') {
            const nextToken = tokens[i + 1];
            if (nextToken && nextToken.type === 'inline' && nextToken.content) {
              const content = nextToken.content;
              const match = content.match(/^:::(info|warning|tip|danger)\s*(.*?)(?:\n|$)([\s\S]*?):::$/);
              if (match) {
                const type = match[1];
                const title = match[2].trim();
                const body = match[3].trim();
                const cardToken = new state.Token('html_block', '', 0);
                const colorMap = {
                  info: { bg: '#eef6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
                  warning: { bg: '#fff8e6', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
                  tip: { bg: '#ecfdf5', border: '#10b981', icon: '💡', color: '#065f46' },
                  danger: { bg: '#fef2f2', border: '#ef4444', icon: '🚫', color: '#991b1b' },
                };
                const c = colorMap[type] || colorMap.info;
                cardToken.content = `<div style="border-left: 4px solid ${c.border}; background: ${c.bg}; padding: 14px 18px; margin: 14px 0; border-radius: 0 8px 8px 0;">
                  <div style="font-weight: 600; color: ${c.color}; margin-bottom: 6px; font-size: 15px;">${title || (c.icon + ' ' + type.toUpperCase())}</div>
                  <div style="color: ${c.color}; opacity: 0.85; font-size: 14px; line-height: 1.7;">${md.renderInline(body)}</div>
                </div>`;
                tokens.splice(i, 3, cardToken);
                continue;
              }
            }
          }
          i++;
        }
      });
    }
    md.use(infoCardPlugin);

    // ─── Mermaid 代码块 → 占位符（避开高亮/代码块样式，渲染见 renderMermaidDiagrams）──
    const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
    md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
      if (tokens[idx].info.trim().toLowerCase() === 'mermaid') {
        return `<div class="mermaid-placeholder">${md.utils.escapeHtml(tokens[idx].content)}</div>`;
      }
      return defaultFence(tokens, idx, options, env, slf);
    };

    // ─── 微信链接转脚注（直接操作传入的 DOM 节点，省去额外解析） ──────────────────
    function convertLinksToFootnotesEl(root) {
      if (!wechatFootnote.value) return;

      const links = root.querySelectorAll('a[href]');
      const footnotes = [];
      let index = 1;

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        const text = link.textContent;
        // Create superscript reference
        const sup = document.createElement('sup');
        sup.textContent = `[${index}]`;
        sup.setAttribute('style', 'color: inherit; font-size: 80%; vertical-align: super; cursor: default;');

        // Replace link with text + superscript
        const span = document.createElement('span');
        span.textContent = text;
        span.setAttribute('style', link.getAttribute('style') || '');
        link.parentNode.replaceChild(span, link);
        span.appendChild(sup);

        footnotes.push({ index, text, href });
        index++;
      });

      // 正文末尾追加脚注列表（微信不支持正文外链，转为纯文本引用）
      if (footnotes.length) {
        const section = document.createElement('section');
        section.setAttribute('style', 'margin-top: 28px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.08); font-size: 13px; line-height: 1.8; color: #999;');
        const title = document.createElement('p');
        title.setAttribute('style', 'margin: 0 0 8px; font-weight: 600; color: #666;');
        title.textContent = '参考资料';
        section.appendChild(title);
        footnotes.forEach(({ index, text, href }) => {
          const p = document.createElement('p');
          p.setAttribute('style', 'margin: 0 0 4px; word-break: break-all;');
          p.textContent = text && text !== href ? `[${index}] ${text}: ${href}` : `[${index}] ${href}`;
          section.appendChild(p);
        });
        root.appendChild(section);
      }
    }

    // ─── 渲染 HTML ──────────────────────
    const renderedHtml = ref('');
    function doRender() {
      const theme = themes[currentTheme.value];
      if (!theme) { renderedHtml.value = ''; return; }
      const raw = md.render(expandImagePlaceholders(markdownText.value));
      // applyThemeStyles 内部已完成微信脚注转换，仅一趟 DOM 解析
      const styled = applyThemeStyles(raw, theme.styles);
      // DOMPurify 消毒：拦截 onerror/onload/<script>/javascript: 等注入向量（CDN 加载失败时降级为原样）
      renderedHtml.value = window.DOMPurify
        ? window.DOMPurify.sanitize(styled, { ADD_ATTR: ['style', 'target'] })
        : styled;
      // 预览 DOM 更新后再渲染 Mermaid（render 异步，须作用于真实 DOM）
      nextTick(renderMermaidDiagrams);
    }

    // ─── Mermaid 渲染（作用于已挂载的预览 DOM）──────────
    function renderMermaidDiagrams() {
      if (!window.mermaid) return;
      const preview = document.getElementById('preview-content');
      if (!preview) return;
      preview.querySelectorAll('.mermaid-placeholder').forEach(async (el) => {
        const code = el.textContent.trim();
        if (!code) return;
        try {
          const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
          const { svg } = await window.mermaid.render(id, code);
          el.innerHTML = svg;
          el.classList.remove('mermaid-placeholder');
        } catch (_) {}
      });
    }

    // 初始渲染
    doRender();

    // ─── TOC 大纲 ──────────────────────
    const tocList = computed(() => {
      const text = markdownText.value;
      const headings = [];
      const lines = text.split('\n');
      lines.forEach((line, idx) => {
        const match = line.match(/^(#{1,3})\s+(.+)/);
        if (match) {
          headings.push({
            level: match[1].length,
            text: match[2].replace(/[*`~]/g, ''),
            line: idx,
          });
        }
      });
      return headings;
    });

    function scrollToHeading(lineNum) {
      const textarea = document.querySelector('.editor-textarea');
      if (!textarea) return;
      const lines = markdownText.value.split('\n');
      let charPos = 0;
      for (let i = 0; i < lineNum && i < lines.length; i++) {
        charPos += lines[i].length + 1;
      }
      textarea.focus();
      textarea.setSelectionRange(charPos, charPos);
      // Scroll textarea
      const lineHeight = 24;
      textarea.scrollTop = lineNum * lineHeight - textarea.clientHeight / 3;
    }

    // ─── 应用主题样式 ────────────────────
    function applyThemeStyles(html, styles) {
      const primary = customColor.value || '#4f6ef7';
      const primaryBg = primary + '12';
      const fontMap = {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", sans-serif',
        serif: '"Georgia", "Noto Serif SC", "Source Han Serif SC", serif',
        mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "PingFang SC", monospace',
      };

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;

      const styleMap = {
        'h1': styles.h1, 'h2': styles.h2, 'h3': styles.h3,
        'h4': styles.h3, 'h5': styles.h3, 'h6': styles.h3,
        'p': styles.p, 'blockquote': styles.blockquote,
        'ul': styles.ul, 'ol': styles.ol, 'li': styles.li,
        'img': styles.img, 'a': styles.a,
        'table': styles.table, 'th': styles.th, 'td': styles.td,
        'hr': styles.hr, 'strong': styles.strong, 'em': styles.em,
      };

      for (const [tag, style] of Object.entries(styleMap)) {
        if (!style) continue;
        const resolved = style
          .replace(/\{\{PRIMARY\}\}/g, primary)
          .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
        wrapper.querySelectorAll(tag).forEach(el => {
          el.setAttribute('style', (el.getAttribute('style') || '') + resolved);
        });
      }

      wrapper.querySelectorAll('code').forEach(el => {
        if (el.parentElement && (el.parentElement.tagName === 'PRE' || el.closest('.mac-code-block'))) {
          el.setAttribute('style', 'font-family: inherit; font-size: inherit; color: inherit; background: transparent;');
        } else {
          const resolved = (styles.code_inline || '')
            .replace(/\{\{PRIMARY\}\}/g, primary)
            .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
          el.setAttribute('style', resolved);
        }
      });

      wrapper.querySelectorAll('pre').forEach(el => {
        if (!el.closest('.mac-code-block')) {
          const resolved = (styles.code_block || '')
            .replace(/\{\{PRIMARY\}\}/g, primary)
            .replace(/\{\{PRIMARY_BG\}\}/g, primaryBg);
          el.setAttribute('style', resolved);
        }
      });

      wrapper.querySelectorAll('.mac-code-block').forEach(el => {
        const codeBlockStyle = styles.code_block || 'background: #282c34; color: #abb2bf;';
        const bgMatch = codeBlockStyle.match(/background:\s*([^;]+)/);
        const bgColor = bgMatch ? bgMatch[1].trim() : '#282c34';
        const colorMatch = codeBlockStyle.match(/(?:^|;\s*)color:\s*([^;]+)/);
        const textColor = colorMatch ? colorMatch[1].trim() : '#abb2bf';
        el.setAttribute('style', `border-radius: 10px; overflow: hidden; margin: 14px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`);
        const header = el.querySelector('.mac-code-header');
        if (header) header.setAttribute('style', `background: ${bgColor}; padding: 10px 16px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);`);
        el.querySelectorAll('.mac-dot').forEach((dot, idx) => {
          const colors = ['#ff5f57', '#febc2e', '#28c840'];
          dot.setAttribute('style', `width: 12px; height: 12px; border-radius: 50%; background: ${colors[idx]}; display: inline-block;`);
        });
        const langLabel = el.querySelector('.mac-code-lang');
        if (langLabel) langLabel.setAttribute('style', `margin-left: auto; font-size: 12px; color: ${textColor}; opacity: 0.5; font-family: -apple-system, sans-serif;`);
        const pre = el.querySelector('pre');
        if (pre) pre.setAttribute('style', `background: ${bgColor}; color: ${textColor}; padding: 16px; margin: 0; font-size: 13px; line-height: 1.7; overflow-x: auto; font-family: "SFMono-Regular", Consolas, monospace;`);
      });

      // 脚注转换（作用于同一个 wrapper，避免再次解析序列化）
      convertLinksToFootnotesEl(wrapper);

      let wrapperStyle = styles.wrapper || '';
      if (fontFamily.value && fontMap[fontFamily.value]) {
        wrapperStyle = wrapperStyle.replace(/font-family:[^;]+;/, `font-family: ${fontMap[fontFamily.value]};`);
      }
      if (fontSize.value) {
        wrapperStyle = wrapperStyle.replace(/font-size:\s*\d+px;/, `font-size: ${fontSize.value}px;`);
      }

      // 确保 wrapperStyle 中的双引号不会破坏 HTML 属性
      wrapperStyle = wrapperStyle.replace(/"/g, "'");

      return `<div style="${wrapperStyle}">${wrapper.innerHTML}</div>`;
    }

    // ─── 计算属性 ──────────────────────
    const charCount = computed(() => markdownText.value.length);
    const wordCount = computed(() => {
      const text = markdownText.value.trim();
      if (!text) return 0;
      const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const english = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\b[a-zA-Z]+\b/g) || []).length;
      return chinese + english;
    });
    const readingTime = computed(() => {
      const w = wordCount.value;
      if (w === 0) return '0 分';
      return Math.ceil(w / 300) + ' 分钟';
    });
    const themeList = computed(() => {
      return Object.entries(themes).map(([key, val]) => ({
        key, name: val.name, emoji: val.emoji, desc: val.desc, category: val.category,
      }));
    });

    // ─── 主题切换 ──────────────────────
    function selectTheme(key) {
      currentTheme.value = key;
      localStorage.setItem('md-converter-theme', key);
    }

    // ─── 主题悬浮预览 ──────────────────
    function onThemeHover(key) {
      clearTimeout(themePreviewTimer.value);
      themePreviewTimer.value = setTimeout(() => { hoveredTheme.value = key; }, 400);
    }
    function onThemeLeave() {
      clearTimeout(themePreviewTimer.value);
      hoveredTheme.value = null;
    }
    const themePreviewHtml = computed(() => {
      const key = hoveredTheme.value;
      if (!key || key === currentTheme.value) return '';
      const theme = themes[key];
      if (!theme) return '';
      const sampleMd = `## 标题示例\n\n这是一段正文，**加粗**和*斜体*。\n\n> 引用块内容\n\n- 列表项 1\n- 列表项 2`;
      const raw = md.render(sampleMd);
      return applyThemeStyles(raw, theme.styles);
    });

    // ─── 暗色模式 ──────────────────────
    function toggleDarkMode() {
      darkMode.value = !darkMode.value;
      document.documentElement.setAttribute('data-theme', darkMode.value ? 'dark' : 'light');
      localStorage.setItem('md-converter-dark', darkMode.value ? 'true' : 'false');
    }

    function toggleSettings() { showSettings.value = !showSettings.value; }
    function toggleToc() { showToc.value = !showToc.value; }

    function setCustomColor(color) {
      customColor.value = color;
      document.documentElement.style.setProperty('--primary', color);
      localStorage.setItem('md-converter-color', color);
      doRender();
    }
    function setFontFamily(ff) { fontFamily.value = ff; localStorage.setItem('md-converter-font', ff); doRender(); }
    function setFontSize(size) { fontSize.value = size; localStorage.setItem('md-converter-fontsize', String(size)); doRender(); }

    // ─── 手机预览模式 ──────────────────
    function toggleMobilePreview() {
      mobilePreview.value = !mobilePreview.value;
    }

    // ─── 微信脚注开关 ──────────────────
    function toggleFootnote() {
      wechatFootnote.value = !wechatFootnote.value;
      localStorage.setItem('md-converter-footnote', wechatFootnote.value ? 'true' : 'false');
    }

    // ─── 复制功能 ──────────────────────
    async function preparePublishHtml(simple = false) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return '';

      if (window.MoPaiPublishUtils?.prepareHtml) {
        return window.MoPaiPublishUtils.prepareHtml(previewEl, {
          imageToBase64,
          simple,
        });
      }

      return previewEl.innerHTML;
    }

    async function copyPublishHtmlToClipboard(simple = true) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return '';

      const html = await preparePublishHtml(simple);
      const blob = new Blob([html], { type: 'text/html' });
      const plainBlob = new Blob([previewEl.innerText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })
      ]);
      return html;
    }

    async function copyToClipboard(target) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;

      try {
        await copyPublishHtmlToClipboard(false);
        showToast(target);
      } catch (err) {
        // 回退方案：直接选中并复制
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(previewEl);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        showToast(target);
      }
    }

    // 将图片URL转为 base64 data URL（用于微信兼容）
    function imageToBase64(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          try {
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl);
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = reject;
        img.src = src;
      });
    }

    function showToast(target) {
      copyTarget.value = target;
      copySuccess.value = true;
      setTimeout(() => { copySuccess.value = false; copyTarget.value = ''; }, 2000);
    }

    // ─── 文件操作 ──────────────────────
    function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
        alert('请选择 .md 或 .markdown 文件');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => { markdownText.value = e.target.result; };
      reader.readAsText(file);
      event.target.value = '';
    }

    function clearEditor() {
      if (markdownText.value.trim() === '') return;
      if (confirm('确定要清空编辑器内容吗？')) { markdownText.value = ''; }
    }

    // ─── 图片粘贴/拖拽 ──────────────────
    function handlePaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          insertImageFromFile(file);
          return;
        }
      }
    }

    function handleDrop(event) {
      event.preventDefault();
      const files = event.dataTransfer?.files;
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          insertImageFromFile(file);
          return;
        }
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
          const reader = new FileReader();
          reader.onload = (e) => { markdownText.value = e.target.result; };
          reader.readAsText(file);
          return;
        }
      }
    }

    async function insertImageFromFile(file) {
      const textarea = document.querySelector('.editor-textarea');
      const pos = textarea ? textarea.selectionStart : markdownText.value.length;
      const name = file.name || '图片';

      // 如果开启图床，先上传到 SM.MS
      if (useImageHost.value) {
        uploadingImage.value = true;
        copyTarget.value = 'uploading';
        copySuccess.value = true;
        try {
          const url = await uploadToSmms(file);
          const imgMarkdown = `\n![${name}](${url})\n`;
          markdownText.value = markdownText.value.slice(0, pos) + imgMarkdown + markdownText.value.slice(pos);
          uploadingImage.value = false;
          // 记录上传历史
          addImageHistory(name, url);
          showToast('image');
          return;
        } catch (err) {
          console.warn('SM.MS 上传失败，使用本地链接:', err);
          uploadingImage.value = false;
        }
      }

      // 回退：使用 Base64 + 占位符（编辑器里隐藏长字符串）
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Url = e.target.result;
        const imgId = genImageId();
        imageStore.set(imgId, base64Url);
        saveImageStore();
        const imgMarkdown = `\n![${name}](img:${imgId})\n`;
        markdownText.value = markdownText.value.slice(0, pos) + imgMarkdown + markdownText.value.slice(pos);
        showToast('image');
      };
      reader.readAsDataURL(file);
    }

    // SM.MS 图床上传
    async function uploadToSmms(file) {
      const formData = new FormData();
      formData.append('smfile', file);
      const resp = await fetch('https://sm.ms/api/v2/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (data.success) {
        return data.data.url;
      } else if (data.code === 'image_repeated') {
        // 图片已存在，返回已有链接
        return data.images;
      } else {
        throw new Error(data.message || '上传失败');
      }
    }

    function toggleImageHost() {
      useImageHost.value = !useImageHost.value;
      localStorage.setItem('md-converter-imagehost', useImageHost.value ? 'true' : 'false');
    }

    function handleDragOver(event) { event.preventDefault(); }

    // ─── 导出文件名自动命名 ────────────
    function getExportFilename(ext) {
      const match = markdownText.value.match(/^#\s+(.+)/m);
      const title = match ? match[1].replace(/[*`~#\/\\:?"<>|]/g, '').trim() : 'mopai-export';
      return title + '.' + ext;
    }

    // ─── 导出 HTML ──────────────────────
    function exportHtml() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Export</title>
</head>
<body style="max-width: 680px; margin: 0 auto; padding: 20px;">
${previewEl.innerHTML}
</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getExportFilename('html');
      a.click();
      URL.revokeObjectURL(url);
      showToast('export');
    }

    // ─── 导出 PDF ────────────────────
    function exportPdf() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;
      const printWin = window.open('', '_blank');
      const themeKey = currentTheme.value;
      const themeStyles = themes[themeKey] ? Object.entries(themes[themeKey]).map(([k,v]) => `${k}:${v}`).join(';') : '';
      printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>MoPai 导出</title>
<style>
  body { max-width: 680px; margin: 0 auto; padding: 40px 30px; font-family: -apple-system, sans-serif; line-height: 1.8; color: #333; ${themeStyles} }
  img { max-width: 100%; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: Consolas, monospace; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head><body>${previewEl.innerHTML}</body></html>`);
      printWin.document.close();
      setTimeout(() => { printWin.print(); }, 500);
    }

    // ─── 导出长图 ────────────────────
    async function exportImage() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl || !window.html2canvas) { alert('html2canvas 未加载'); return; }
      showToast('uploading');
      // 保存原始样式，临时展开全部内容
      const parent = previewEl.parentElement;
      const origOverflow = parent ? parent.style.overflow : '';
      const origHeight = parent ? parent.style.height : '';
      if (parent) {
        parent.style.overflow = 'visible';
        parent.style.height = 'auto';
      }
      try {
        const canvas = await html2canvas(previewEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollY: 0,
          height: previewEl.scrollHeight,
          windowHeight: previewEl.scrollHeight,
        });
        const link = document.createElement('a');
        link.download = getExportFilename('png');
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('export');
      } catch (e) {
        alert('导出失败: ' + e.message);
      } finally {
        // 恢复原始样式
        if (parent) {
          parent.style.overflow = origOverflow;
          parent.style.height = origHeight;
        }
      }
    }

    // ─── 导出 Word ────────────────────
    function exportDocx() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl || !window.htmlDocx) { alert('html-docx-js 未加载'); return; }
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; line-height: 1.8; color: #333;">
${previewEl.innerHTML}
</body></html>`;
      const blob = window.htmlDocx.asBlob(html);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = getExportFilename('docx');
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('export');
    }

    // ─── 分发到多平台（WechatSync）─────
    function getPublishTitle() {
      const titleMatch = markdownText.value.match(/^#\s+(.+)/m);
      return titleMatch ? titleMatch[1].replace(/[*`~#]/g, '').trim() : 'MoPai 文章';
    }

    async function buildPublishPost() {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return null;

      const firstImg = previewEl.querySelector('img');
      const thumb = firstImg ? firstImg.src : '';
      const title = getPublishTitle();
      return {
        title: title,
        content: await preparePublishHtml(true),
        desc: title,
        thumb: thumb,
      };
    }

    function hasWechatSyncBridge() {
      return Boolean(
        window.$syncer &&
        typeof window.$syncer.getAccounts === 'function' &&
        typeof window.$syncer.addTask === 'function'
      );
    }

    function waitForWechatSyncBridge(timeoutMs = 1200) {
      if (hasWechatSyncBridge()) return Promise.resolve(true);

      return new Promise(resolve => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (hasWechatSyncBridge()) {
            clearInterval(timer);
            resolve(true);
            return;
          }

          if (Date.now() - started >= timeoutMs) {
            clearInterval(timer);
            resolve(false);
          }
        }, 100);
      });
    }

    async function handleWechatSyncUnavailable() {
      try {
        await copyPublishHtmlToClipboard(true);
        showToast('wechat');
      } catch (err) {
        console.warn('同步助手不可用时复制失败:', err);
      }

      const message = '未检测到文章同步助手扩展注入。已先复制富文本；请确认用安装了扩展的 Google Chrome 打开本页，并在扩展详情里允许访问 localhost，然后刷新页面。';
      if (showPublish.value) {
        publishStatus.value = message;
      } else {
        alert(message);
      }
      return false;
    }

    async function syncToMultiPlatform() {
      const bridgeReady = await waitForWechatSyncBridge();
      if (!bridgeReady || typeof window.syncPost !== 'function') {
        return handleWechatSyncUnavailable();
      }

      const post = await buildPublishPost();
      if (!post) return false;
      window.syncPost(post);
      return true;
    }

    function getWechatSyncAccounts() {
      return new Promise(resolve => {
        if (!hasWechatSyncBridge()) {
          resolve([]);
          return;
        }

        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve([]);
          }
        }, 8000);

        window.$syncer.getAccounts((resp, maybeAccounts) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const accounts = Array.isArray(maybeAccounts) ? maybeAccounts : resp;
          resolve(Array.isArray(accounts) ? accounts : []);
        });
      });
    }

    function updateWechatDirectSyncStatus(status, targetAccounts) {
      const accounts = Array.isArray(status?.accounts) ? status.accounts : [];
      const targetTypes = new Set(targetAccounts.map(account => account.type));
      const targetStatuses = accounts.filter(account => targetTypes.has(account.type));
      if (!targetStatuses.length) return;

      const failed = targetStatuses.find(account => account.status === 'failed');
      if (failed) {
        publishStatus.value = `微信公众号同步失败：${failed.error || failed.msg || '请稍后重试'}`;
        return;
      }

      const done = targetStatuses.find(account => account.status === 'done');
      if (done) {
        const draftLink = done.editResp?.draftLink;
        publishStatus.value = draftLink ? '微信公众号草稿已创建，正在打开草稿...' : '微信公众号草稿已创建，请在同步助手里查看草稿';
        if (draftLink) window.open(draftLink, '_blank');
        return;
      }

      const uploading = targetStatuses.find(account => account.status === 'uploading') || targetStatuses[0];
      publishStatus.value = `正在同步微信公众号：${uploading.msg || '准备创建草稿...'}`;
    }

    async function publishToWechat() {
      publishStatus.value = '正在检测文章同步助手扩展...';
      const bridgeReady = await waitForWechatSyncBridge();
      if (!bridgeReady) {
        return handleWechatSyncUnavailable();
      }

      const accounts = await getWechatSyncAccounts();
      const wechatAccounts = accounts.filter(account => account.type === 'weixin');
      if (!wechatAccounts.length) {
        publishStatus.value = '已检测到扩展，但没有可用的微信公众号账号。请先在 Chrome 登录 mp.weixin.qq.com，或在同步助手里确认公众号授权后刷新本页。';
        return false;
      }

      const post = await buildPublishPost();
      if (!post) return false;

      publishStatus.value = `正在提交到 ${wechatAccounts.length} 个微信公众号账号...`;
      try {
        window.$syncer.addTask(
          { post, accounts: wechatAccounts },
          status => updateWechatDirectSyncStatus(status, wechatAccounts),
          () => {}
        );
        return true;
      } catch (err) {
        publishStatus.value = `微信公众号同步失败：${err.message || '扩展调用异常'}`;
        return false;
      }
    }

    // ─── 格式化工具栏 ──────────────────
    function insertFormat(type) {
      const textarea = document.querySelector('.editor-textarea');
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = markdownText.value;
      const selected = text.slice(start, end);

      const formatMap = {
        bold: { before: '**', after: '**', placeholder: '加粗文字' },
        italic: { before: '*', after: '*', placeholder: '斜体文字' },
        strike: { before: '~~', after: '~~', placeholder: '删除线文字' },
        code: { before: '`', after: '`', placeholder: '代码' },
        h1: { before: '# ', after: '', placeholder: '一级标题', newline: true },
        h2: { before: '## ', after: '', placeholder: '二级标题', newline: true },
        h3: { before: '### ', after: '', placeholder: '三级标题', newline: true },
        quote: { before: '> ', after: '', placeholder: '引用文字', newline: true },
        link: { before: '[', after: '](https://)', placeholder: '链接文字' },
        image: { before: '![', after: '](https://)', placeholder: '图片描述' },
        ul: { before: '- ', after: '', placeholder: '列表项', newline: true },
        ol: { before: '1. ', after: '', placeholder: '列表项', newline: true },
        table: { before: '', after: '', placeholder: '', newline: true, template: '\n| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |\n' },
        codeblock: { before: '', after: '', placeholder: '', newline: true, template: '\n```javascript\n// 代码\n```\n' },
        hr: { before: '', after: '', placeholder: '', newline: true, template: '\n---\n' },
        info: { before: '', after: '', placeholder: '', newline: true, template: '\n:::info ℹ️ 信息\n这里是信息卡片内容\n:::\n' },
        mermaid: { before: '', after: '', placeholder: '', newline: true, template: '\n```mermaid\ngraph TD\n    A[开始] --> B{判断}\n    B -->|是| C[结果1]\n    B -->|否| D[结果2]\n```\n' },
      };

      const fmt = formatMap[type];
      if (!fmt) return;

      let newText, cursorPos;
      if (fmt.template) {
        newText = text.slice(0, start) + fmt.template + text.slice(end);
        cursorPos = start + fmt.template.length;
      } else {
        const content = selected || fmt.placeholder;
        const prefix = fmt.newline && start > 0 && text[start - 1] !== '\n' ? '\n' : '';
        newText = text.slice(0, start) + prefix + fmt.before + content + fmt.after + text.slice(end);
        cursorPos = start + prefix.length + fmt.before.length + content.length;
      }

      markdownText.value = newText;
      nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    }

    // ─── Tab 缩进支持 ──────────────────
    function handleTab(event) {
      if (event.key === 'Tab') {
        event.preventDefault();
        const textarea = event.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = markdownText.value;

        if (event.shiftKey) {
          // Shift+Tab: 减少缩进
          const beforeCursor = text.slice(0, start);
          const lastNewline = beforeCursor.lastIndexOf('\n');
          const lineStart = lastNewline + 1;
          const lineContent = text.slice(lineStart, end);
          if (lineContent.startsWith('  ')) {
            markdownText.value = text.slice(0, lineStart) + lineContent.slice(2) + text.slice(end);
            nextTick(() => {
              textarea.selectionStart = Math.max(start - 2, lineStart);
              textarea.selectionEnd = Math.max(end - 2, lineStart);
            });
          }
        } else {
          // Tab: 增加缩进
          markdownText.value = text.slice(0, start) + '  ' + text.slice(end);
          nextTick(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 2;
          });
        }
      }
    }

    // ─── 快捷键 ──────────────────────
    function handleKeyboard(event) {
      const isMeta = event.metaKey || event.ctrlKey;

      // ESC 退出专注模式或关闭查找
      if (event.key === 'Escape') {
        if (focusMode.value) { focusMode.value = false; return; }
        if (showFindReplace.value) { showFindReplace.value = false; return; }
        return;
      }

      if (!isMeta) return;

      const keyMap = {
        'b': () => insertFormat('bold'),
        'i': () => insertFormat('italic'),
        'k': () => insertFormat('link'),
      };

      if (event.shiftKey) {
        if (event.key === 'C' || event.key === 'c') {
          event.preventDefault();
          copyToClipboard('wechat');
          return;
        }
        // ⌘⇧Z 重做
        if (event.key === 'Z' || event.key === 'z') {
          event.preventDefault();
          redo();
          return;
        }
      }

      // ⌘Z 撤回
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      // ⌘\ 专注模式
      if (event.key === '\\') {
        event.preventDefault();
        focusMode.value = !focusMode.value;
        return;
      }

      // ⌘F 查找
      if (event.key === 'f') {
        event.preventDefault();
        showFindReplace.value = true;
        nextTick(() => {
          const input = document.querySelector('.find-input');
          if (input) input.focus();
        });
        return;
      }

      if (event.key === 's') {
        event.preventDefault();
        saveToHistory();
        return;
      }

      if (keyMap[event.key]) {
        event.preventDefault();
        keyMap[event.key]();
      }
    }

    // ─── 历史记录 ──────────────────────
    function saveToHistory() {
      if (!markdownText.value.trim()) return;
      const item = {
        id: Date.now(),
        content: markdownText.value,
        theme: currentTheme.value,
        time: new Date().toLocaleString('zh-CN'),
        preview: markdownText.value.slice(0, 100) + (markdownText.value.length > 100 ? '...' : ''),
      };
      let history = lsReadJSON('md-converter-history', []);
      history.unshift(item);
      if (history.length > 20) history = history.slice(0, 20);
      localStorage.setItem('md-converter-history', JSON.stringify(history));
      historyList.value = history;
      showToast('save');
    }

    function loadHistory(item) {
      markdownText.value = item.content;
      if (item.theme && themes[item.theme]) currentTheme.value = item.theme;
      showHistory.value = false;
    }
    function deleteHistory(id) {
      let history = lsReadJSON('md-converter-history', []);
      history = history.filter(item => item.id !== id);
      localStorage.setItem('md-converter-history', JSON.stringify(history));
      historyList.value = history;
    }
    function toggleHistory() {
      showHistory.value = !showHistory.value;
      if (showHistory.value) {
        historyList.value = lsReadJSON('md-converter-history', []);
      }
    }

    // ─── 同步滚动（平滑版：标题锚点 + 缓动动画） ───
    let scrollTimer = null;
    let scrollAnimId = null;

    function syncScroll(event) {
      const editor = event.target;
      const preview = document.getElementById('preview-content');
      if (!preview) return;

      // 同步行号滚动
      const lineNums = document.querySelector('.line-numbers');
      if (lineNums) lineNums.scrollTop = editor.scrollTop;

      // 使用 rAF 节流替代 setTimeout，帧级同步更流畅
      if (scrollTimer) return;
      scrollTimer = requestAnimationFrame(() => {
        scrollTimer = null;
        const targetTop = calcTargetScroll(editor, preview);
        smoothScrollTo(preview, targetTop);
      });
    }

    // 计算目标滚动位置
    function calcTargetScroll(editor, preview) {
      const editorScrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
      const editorLines = markdownText.value.split('\n');
      const totalEditorLines = editorLines.length;
      const computedStyle = window.getComputedStyle(editor);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
      const paddingTop = parseFloat(computedStyle.paddingTop) || 16;
      const currentLine = Math.floor((editor.scrollTop - paddingTop + lineHeight / 2) / lineHeight);

      // 收集编辑器标题
      const editorHeadings = [];
      editorLines.forEach((line, idx) => {
        if (/^#{1,3}\s/.test(line)) {
          editorHeadings.push({ line: idx, text: line.replace(/^#{1,3}\s+/, '').trim() });
        }
      });

      // 收集预览标题
      const previewHeadings = preview.querySelectorAll('h1, h2, h3');
      const previewAnchors = [];
      previewHeadings.forEach(h => {
        previewAnchors.push({ top: h.offsetTop, text: h.textContent.trim() });
      });

      // 标题锚点分段映射
      if (editorHeadings.length >= 2 && previewAnchors.length >= 2) {
        let prevHeading = null;
        let nextHeading = null;
        for (let i = 0; i < editorHeadings.length; i++) {
          if (editorHeadings[i].line <= currentLine) {
            prevHeading = { ...editorHeadings[i], previewIdx: i };
          }
          if (editorHeadings[i].line > currentLine && !nextHeading) {
            nextHeading = { ...editorHeadings[i], previewIdx: i };
          }
        }

        if (prevHeading && prevHeading.previewIdx < previewAnchors.length) {
          const prevPreviewTop = previewAnchors[prevHeading.previewIdx]?.top || 0;
          if (nextHeading && nextHeading.previewIdx < previewAnchors.length) {
            const nextPreviewTop = previewAnchors[nextHeading.previewIdx].top;
            const progress = (currentLine - prevHeading.line) / (nextHeading.line - prevHeading.line || 1);
            return Math.max(0, prevPreviewTop + (nextPreviewTop - prevPreviewTop) * progress - 20);
          } else {
            const ratio = (currentLine - prevHeading.line) / (totalEditorLines - prevHeading.line || 1);
            return Math.max(0, prevPreviewTop + (preview.scrollHeight - prevPreviewTop) * ratio - 20);
          }
        }
      }

      // 回退：比例同步
      return editorScrollRatio * (preview.scrollHeight - preview.clientHeight);
    }

    // 平滑缓动滚动（easeOutCubic）
    function smoothScrollTo(el, targetTop) {
      cancelAnimationFrame(scrollAnimId);
      const startTop = el.scrollTop;
      const distance = targetTop - startTop;

      // 如果距离很小就直接跳
      if (Math.abs(distance) < 2) {
        el.scrollTop = targetTop;
        return;
      }

      const duration = Math.min(180, Math.abs(distance) * 0.5 + 40); // 更短响应更快
      const startTime = performance.now();

      function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart: 更平滑的减速曲线
        const eased = 1 - Math.pow(1 - progress, 4);
        el.scrollTop = startTop + distance * eased;

        if (progress < 1) {
          scrollAnimId = requestAnimationFrame(tick);
        }
      }
      scrollAnimId = requestAnimationFrame(tick);
    }

    function toggleImageGuide() {
      showImageGuide.value = !showImageGuide.value;
    }

    // ─── 智能发布助手 ──────────────────
    const showPublish = ref(false);
    const publishStatus = ref('');

    const platforms = [
      { key: 'wechat', name: '微信公众号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9.5 4C6.46 4 4 6.01 4 8.5c0 1.37.73 2.6 1.88 3.43l-.5 1.5 1.73-.96A7.08 7.08 0 009.5 13C12.54 13 15 11 15 8.5S12.54 4 9.5 4zm-2.13 2.63a.88.88 0 110 1.75.88.88 0 010-1.75zm4.26 0a.88.88 0 110 1.75.88.88 0 010-1.75zM15.5 9c-.01 0 .01 0 0 0 .17.58.25 1.17.25 1.75 0 2.93-2.78 5.25-6.25 5.25l-.43-.01C10.35 17.8 12.5 19 15 19c.65 0 1.28-.1 1.87-.28l1.44.8-.42-1.25C19.08 17.37 20 15.97 20 14.5 20 11.46 18.04 9 15.5 9z"/></svg>', color: '#07c160', url: '', format: 'html', desc: '用同步助手创建草稿' },
      { key: 'zhihu', name: '知乎', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5.721 0C5.04 0 4.487.554 4.487 1.236v21.528c0 .682.554 1.236 1.235 1.236h12.544c.682 0 1.236-.554 1.236-1.236V1.236C19.502.554 18.948 0 18.266 0zm.387 2.673h6.77v3.66H9.08l2.558 7.7-1.39.46-3.12-9.44h1.51V4.04H7.49v3.26l.8 2.44-1.39.46L5.75 6.89V2.673zm7.09 0h2.69v1.367h-2.69zm.068 2.27h2.554v1.11L14.2 12.4h1.7l-2.13 6.46h-1.56l1.85-5.61h-1.32l-1.41 4.28h-1.46l2.1-6.35h-1.7l1.79-5.26V4.943z"/></svg>', color: '#0066ff', url: 'https://zhuanlan.zhihu.com/write', format: 'markdown', desc: '复制 Markdown → 粘贴到专栏' },
      { key: 'weibo', name: '微博', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10.3 18.3c-3.63.4-6.77-1.28-7.01-3.75-.24-2.47 2.52-4.82 6.15-5.22 3.63-.4 6.77 1.28 7.01 3.75.24 2.47-2.52 4.82-6.15 5.22zM20.76 8.94c-.26-.82-1.14-1.23-1.96-.97-.82.26-1.27 1.12-1.01 1.95.57 1.82-.06 3.16-1.38 3.94l-.16.09c2.57-1.47 3.7-3.7 3.1-5.54l-.02-.05c-.03-.1-.19-.56-.57-1.42a3.87 3.87 0 012.37-1.75c.84-.22 1.34-1.08 1.12-1.92a1.55 1.55 0 00-1.89-1.13 6.9 6.9 0 00-4.06 3.07A6.6 6.6 0 0014 3.8c-.47-.73-1.44-.94-2.17-.47-.73.47-.94 1.44-.47 2.17.47.73 1 1.88.79 3.18C8.64 7.25 3.47 9.22 3.47 13.28c0 4.13 5.25 6.4 10.04 6.4 6.3 0 10.49-3.67 10.49-6.58 0-1.78-1.07-2.8-1.79-3.35z"/><ellipse cx="10.07" cy="14.72" rx="2" ry="1.4"/></svg>', color: '#e6162d', url: 'https://weibo.com/', format: 'excerpt', desc: '复制摘要 → 粘贴发布' },
      { key: 'csdn', name: 'CSDN', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.5c-2.65 0-4.8-2.02-4.8-4.5s2.15-4.5 4.8-4.5c1.29 0 2.46.49 3.33 1.29l-1.35 1.31a2.85 2.85 0 00-1.98-.78c-1.6 0-2.89 1.2-2.89 2.68s1.3 2.68 2.89 2.68c1.27 0 2.17-.72 2.5-1.72h-2.5V11.3h4.37c.06.3.09.6.09.92 0 2.47-1.65 4.28-3.96 4.28z"/></svg>', color: '#fc5531', url: 'https://editor.csdn.net/md', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'jianshu', name: '简书', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 4v16h3V4H5zm5 0v16h3V4h-3zm6.5 0l-1 16h3l1-16h-3z"/></svg>', color: '#ea6f5a', url: 'https://www.jianshu.com/writer', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'juejin', name: '掘金', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2l-3.5 3 3.5 3 3.5-3L12 2zm0 5.5L8.14 11 12 14.5 15.86 11 12 7.5zM4 12l8 8 8-8-2.5-2.14L12 15.5 6.5 9.86 4 12z"/></svg>', color: '#1e80ff', url: 'https://juejin.cn/editor/drafts/new', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'toutiao', name: '今日头条', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 4h18v2H3V4zm3 5h12v2H6V9zm-3 5h18v2H3v-2zm3 5h12v2H6v-2z"/></svg>', color: '#ed1c24', url: 'https://mp.toutiao.com/profile_v4/graphic/publish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'bilibili', name: 'B站专栏', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7.5 3L5.3 5.2h-1C2.45 5.2 1 6.65 1 8.5v9c0 1.85 1.45 3.3 3.3 3.3h15.4c1.85 0 3.3-1.45 3.3-3.3v-9c0-1.85-1.45-3.3-3.3-3.3h-1L16.5 3H14l2.2 2.2H7.8L10 3H7.5zM8 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm8 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>', color: '#fb7299', url: 'https://member.bilibili.com/platform/upload/text/edit', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'baijiahao', name: '百家号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 5a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm-9.5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm9 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 18.5c-2.33 0-4.3-1.46-5.06-3.5h10.12c-.76 2.04-2.73 3.5-5.06 3.5z"/></svg>', color: '#2932e1', url: 'https://baijiahao.baidu.com/builder/rc/edit', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'segmentfault', name: 'SF思否', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 3l8 4.5v9L4 12V3zm16 0l-8 4.5v9l8-4.5V3zM12 7.5L4 3h16l-8 4.5z"/></svg>', color: '#009a61', url: 'https://segmentfault.com/write', format: 'markdown', desc: '复制 Markdown → 粘贴到编辑器' },
      { key: 'dayuhao', name: '大鱼号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 12c0-1.5.7-2.8 1.8-3.7C5 7.3 7.3 7 10 7c1.5 0 3 .2 4.2.6l3.5-2.8c.4-.3.8-.1.8.4v5.3c1 .9 1.5 2 1.5 3.2 0 3.5-4.5 6.3-10 6.3S0 17.2 0 13.7c0-.6.1-1.2.3-1.7H2zm6 1.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>', color: '#ff6a00', url: 'https://mp.uc.cn/', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'penguin', name: '企鹅号', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 1.86.73 3.55 1.91 4.81L5 18l3.5-1.21C9.57 17.56 10.75 18 12 18c3.87 0 7-3.13 7-7a7 7 0 00-7-9zm-2.5 8.5a1 1 0 110-2 1 1 0 010 2zm5 0a1 1 0 110-2 1 1 0 010 2z"/><path d="M8 21l1-2.5M16 21l-1-2.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>', color: '#0078d7', url: 'https://om.qq.com/article/articlePublish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'xiaohongshu', name: '小红书', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/><path d="M7.5 6.5v2M16.5 6.5v2M7.5 15.5v2M16.5 15.5v2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>', color: '#fe2c55', url: 'https://creator.xiaohongshu.com/publish/publish', format: 'html', desc: '复制富文本 → 粘贴到编辑器' },
      { key: 'douban', name: '豆瓣', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 5h18v2H3V5zm2 4h14v6H5V9zm-2 8h18v2H3v-2zm5-6v2h8v-2H8z"/></svg>', color: '#00b51d', url: 'https://www.douban.com/note/create', format: 'html', desc: '复制富文本 → 粘贴到日记' },
    ];


    function togglePublish() {
      showPublish.value = !showPublish.value;
      publishStatus.value = '';
    }

    async function publishTo(platform) {
      const previewEl = document.getElementById('preview-content');
      if (!previewEl) return;

      if (platform.key === 'wechat') {
        await publishToWechat();
        return;
      }

      publishStatus.value = `正在复制 ${platform.name} 格式...`;

      try {
        if (platform.format === 'html') {
          // 富文本格式：复制 HTML
          await copyPublishHtmlToClipboard(true);
        } else if (platform.format === 'markdown') {
          // Markdown 格式：复制原始 MD
          await navigator.clipboard.writeText(markdownText.value);
        } else if (platform.format === 'excerpt') {
          // 摘要格式：取前 280 字 + 标题
          const lines = markdownText.value.split('\n');
          const title = lines.find(l => l.startsWith('# '))?.replace(/^#\s+/, '') || '';
          const body = markdownText.value
            .replace(/^#.*$/gm, '')
            .replace(/[*_~`>#\-\[\]()!|]/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
          const excerpt = body.slice(0, 280);
          const copyContent = title ? `【${title}】\n${excerpt}...` : `${excerpt}...`;
          await navigator.clipboard.writeText(copyContent);
        }

        publishStatus.value = `✅ 已复制到剪贴板，正在打开 ${platform.name}...`;

        // 打开平台编辑器
        setTimeout(() => {
          window.open(platform.url, '_blank');
          publishStatus.value = `✅ ${platform.name} 已打开，直接粘贴即可！`;
          setTimeout(() => { publishStatus.value = ''; }, 3000);
        }, 500);

      } catch (err) {
        // 回退
        if (platform.format === 'markdown') {
          const textarea = document.createElement('textarea');
          textarea.value = markdownText.value;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        publishStatus.value = `⚠️ 请手动复制内容，正在打开 ${platform.name}...`;
        setTimeout(() => { window.open(platform.url, '_blank'); }, 500);
      }
    }

    // ─── 去 AI 味检测 ──────────────────
    function runAiDetect() {
      const result = aiDetector.detect(markdownText.value);
      // 为每个 match 添加 Vue 响应式属性
      result.issues.forEach(issue => {
        issue.matches.forEach(m => {
          m.rewriting = false;
          m.rewriteResult = '';
        });
      });
      aiDetectResult.value = result;
      showAiDetect.value = true;
    }

    async function aiRewrite(match, issue) {
      if (!deepseekKey.value) return;
      match.rewriting = true;
      try {
        const result = await aiDetector.rewriteWithAI(match.matched, deepseekKey.value);
        match.rewriteResult = result;
      } catch (err) {
        match.rewriteResult = '❌ ' + (err.message || '改写失败');
      }
      match.rewriting = false;
    }

    function setDeepseekKey(key) {
      deepseekKey.value = key;
      localStorage.setItem('md-converter-deepseek-key', key);
    }

    // ─── 图床管理 ──────────────────────
    function addImageHistory(name, url) {
      const now = new Date();
      const time = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      imageHistory.value.unshift({ name, url, time });
      // 最多保留 50 条
      if (imageHistory.value.length > 50) imageHistory.value = imageHistory.value.slice(0, 50);
      localStorage.setItem('md-converter-image-history', JSON.stringify(imageHistory.value));
    }

    function toggleImageManager() {
      showImageManager.value = !showImageManager.value;
    }

    async function copyImageUrl(img) {
      await navigator.clipboard.writeText(img.url);
      showToast('copy');
    }

    async function copyImageMd(img) {
      await navigator.clipboard.writeText(`![${img.name}](${img.url})`);
      showToast('copy');
    }

    // ─── Phase 2 功能 ──────────────────

    // 查找替换（统一大小写不敏感，保证计数与替换结果一致）
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function findInEditor() {
      if (!findText.value) { findCount.value = 0; return; }
      const matches = markdownText.value.match(new RegExp(escapeRegExp(findText.value), 'gi'));
      findCount.value = matches ? matches.length : 0;
    }

    function replaceOne() {
      if (!findText.value) return;
      markdownText.value = markdownText.value.replace(new RegExp(escapeRegExp(findText.value), 'i'), replaceText.value);
      findInEditor();
    }

    function replaceAll() {
      if (!findText.value) return;
      markdownText.value = markdownText.value.replace(new RegExp(escapeRegExp(findText.value), 'gi'), replaceText.value);
      findCount.value = 0;
    }

    // 字数目标
    function setWordGoal(val) {
      wordGoal.value = parseInt(val) || 0;
      localStorage.setItem('md-converter-word-goal', wordGoal.value);
    }

    const wordGoalProgress = computed(() => {
      if (!wordGoal.value || wordGoal.value <= 0) return 0;
      return Math.min(100, Math.round((wordCount.value / wordGoal.value) * 100));
    });

    // 行号
    function toggleLineNumbers() {
      showLineNumbers.value = !showLineNumbers.value;
      localStorage.setItem('md-converter-linenumbers', showLineNumbers.value ? 'true' : 'false');
    }

    const lineNumbers = computed(() => {
      const lines = markdownText.value.split('\n').length;
      return Array.from({ length: lines }, (_, i) => i + 1);
    });

    // ─── Phase 3 功能 ──────────────────

    // 模板
    function applyTemplate(tpl) {
      if (markdownText.value.trim() && markdownText.value !== sampleMarkdown) {
        if (!confirm('当前编辑器有内容，使用模板将覆盖。确认继续？')) return;
      }
      markdownText.value = tpl.content;
      showTemplates.value = false;
    }

    // 自定义 CSS
    function setCustomCss(val) {
      customCss.value = val;
      localStorage.setItem('md-converter-custom-css', val);
      applyCustomCss(val);
    }

    function applyCustomCss(css) {
      let styleEl = document.getElementById('custom-user-css');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-user-css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    }

    // ─── 初始化 ──────────────────────
    onMounted(() => {
      const savedTheme = localStorage.getItem('md-converter-theme');
      if (savedTheme && themes[savedTheme]) currentTheme.value = savedTheme;

      const savedDark = localStorage.getItem('md-converter-dark');
      if (savedDark === 'true') {
        darkMode.value = true;
        document.documentElement.setAttribute('data-theme', 'dark');
      }

      const savedColor = localStorage.getItem('md-converter-color');
      if (savedColor) {
        customColor.value = savedColor;
        document.documentElement.style.setProperty('--primary', savedColor);
      }

      const savedFont = localStorage.getItem('md-converter-font');
      if (savedFont) fontFamily.value = savedFont;

      const savedSize = localStorage.getItem('md-converter-fontsize');
      if (savedSize) fontSize.value = parseInt(savedSize);

      const savedFootnote = localStorage.getItem('md-converter-footnote');
      if (savedFootnote === 'false') wechatFootnote.value = false;

      const draft = localStorage.getItem('md-converter-draft');
      if (draft) markdownText.value = draft;

      // 全局快捷键
      document.addEventListener('keydown', handleKeyboard);

      // 点击外部关闭导出菜单
      document.addEventListener('click', (e) => {
        if (showExportMenu.value && !e.target.closest('.export-dropdown-wrapper')) {
          showExportMenu.value = false;
        }
      });

      // Mermaid 初始化
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
      }

      // 恢复自定义 CSS
      if (customCss.value) applyCustomCss(customCss.value);
    });

    onUnmounted(() => {
      document.removeEventListener('keydown', handleKeyboard);
    });

    let undoCoalesceTimer = null;
    watch(markdownText, (val, oldVal) => {
      try { localStorage.setItem('md-converter-draft', val); } catch {}
      // 撤回栈：连续输入合并为一个快照（停顿 500ms 后才开新快照）
      if (!isUndoRedo && oldVal !== undefined) {
        if (!undoCoalesceTimer) pushUndo(oldVal);
        clearTimeout(undoCoalesceTimer);
        undoCoalesceTimer = setTimeout(() => { undoCoalesceTimer = null; }, 500);
      }
      // 防抖渲染
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(doRender, RENDER_DEBOUNCE);
    });

    // 设置变化时立即重新渲染
    watch(currentTheme, doRender);
    watch(wechatFootnote, doRender);
    watch(macCodeBlock, (val) => {
      localStorage.setItem('md-converter-maccode', val ? 'true' : 'false');
      doRender();
    });

    // Vue 3 不处理 mount 元素上的 :class 绑定，需手动同步
    watch(focusMode, (val) => {
      document.getElementById('app').classList.toggle('focus-mode', val);
    });

    return {
      markdownText, currentTheme, renderedHtml, charCount, wordCount, readingTime,
      themeList, showHistory, showSettings, showToc, historyList, copySuccess, copyTarget,
      darkMode, customColor, fontFamily, fontSize, macCodeBlock,
      mobilePreview, wechatFootnote, hoveredTheme, themePreviewHtml, tocList,
      showImageGuide, toggleImageGuide, useImageHost, uploadingImage, toggleImageHost,
      showPublish, publishStatus, platforms, togglePublish, publishTo,
      selectTheme, toggleDarkMode, toggleSettings, toggleToc, toggleMobilePreview, toggleFootnote,
      onThemeHover, onThemeLeave,
      setCustomColor, setFontFamily, setFontSize,
      copyToClipboard, handleFileUpload, clearEditor, exportHtml,
      exportPdf, exportImage, exportDocx, syncToMultiPlatform, showExportMenu,
      mobileTab,
      insertFormat, saveToHistory, loadHistory, deleteHistory, toggleHistory,
      syncScroll, scrollToHeading, handleTab, handlePaste, handleDrop, handleDragOver,
      colorPresets,
      // AI 检测
      showAiDetect, aiDetectResult, deepseekKey,
      runAiDetect, aiRewrite, setDeepseekKey,
      // 图床管理
      showImageManager, imageHistory,
      toggleImageManager, copyImageUrl, copyImageMd,
      // Phase 2
      focusMode, showFindReplace, findText, replaceText, findCount,
      wordGoal, wordGoalProgress, setWordGoal,
      showLineNumbers, toggleLineNumbers, lineNumbers,
      findInEditor, replaceOne, replaceAll,
      // Phase 3
      showTemplates, templates, applyTemplate,
      customCss, setCustomCss,
    };
  }
});

app.mount('#app');
