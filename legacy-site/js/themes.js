// ============================================
// 样式主题配置 — 13 种精美主题
// ============================================

const themes = {
  // ─── 经典公众号系列 ─────────────────────
  default: {
    name: '默认公众号',
    emoji: '📱',
    desc: '经典微信公众号排版',
    category: 'classic',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; color: #333; line-height: 1.75; padding: 16px 20px; font-size: 15px;',
      h1: 'font-size: 22px; font-weight: bold; text-align: center; margin: 24px 0 16px; color: #1a1a1a; border-bottom: 2px solid {{PRIMARY}}; padding-bottom: 12px;',
      h2: 'font-size: 18px; font-weight: bold; margin: 20px 0 12px; color: #1a1a1a; border-left: 4px solid {{PRIMARY}}; padding-left: 12px;',
      h3: 'font-size: 16px; font-weight: bold; margin: 16px 0 8px; color: #333;',
      p: 'margin: 8px 0; line-height: 1.8; letter-spacing: 0.5px;',
      blockquote: 'border-left: 4px solid {{PRIMARY}}; background: {{PRIMARY_BG}}; padding: 12px 16px; margin: 12px auto; color: #555; border-radius: 0 4px 4px 0;',
      code_inline: 'background: #fff5f5; color: #c7254e; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #282c34; color: #abb2bf; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.8;',
      img: 'max-width: 100%; border-radius: 8px; margin: 12px auto; display: block;',
      a: 'color: {{PRIMARY}}; text-decoration: none; border-bottom: 1px solid {{PRIMARY}};',
      table: 'width: 100%; border-collapse: collapse; margin: 12px auto; font-size: 14px;',
      th: 'background: {{PRIMARY_BG}}; padding: 10px 12px; border: 1px solid #e8e8e8; font-weight: bold; text-align: left;',
      td: 'padding: 10px 12px; border: 1px solid #e8e8e8;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, {{PRIMARY}}, transparent); margin: 24px 0;',
      strong: 'color: {{PRIMARY}}; font-weight: bold;',
      em: 'font-style: italic; color: #666;',
    }
  },

  tech: {
    name: '技术风格',
    emoji: '💻',
    desc: '适合技术文章',
    category: 'classic',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif; color: #2d3748; line-height: 1.8; padding: 16px 20px; font-size: 15px;',
      h1: 'font-size: 24px; font-weight: 700; margin: 28px 0 16px; color: #1a202c; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; padding-bottom: 8px;',
      h2: 'font-size: 19px; font-weight: 600; margin: 22px 0 12px; color: #2d3748; border-left: 4px solid #667eea; padding-left: 12px; background: linear-gradient(to right, #f0f0ff, transparent); padding: 8px 12px; border-radius: 0 4px 4px 0;',
      h3: 'font-size: 16px; font-weight: 600; margin: 16px 0 8px; color: #4a5568;',
      p: 'margin: 8px 0; line-height: 1.8; color: #4a5568;',
      blockquote: 'border-left: 4px solid #667eea; background: linear-gradient(135deg, #f5f3ff, #ede9fe); padding: 14px 18px; margin: 14px auto; color: #5b21b6; border-radius: 0 8px 8px 0; font-style: italic;',
      code_inline: 'background: #edf2f7; color: #553c9a; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1a1b26; color: #a9b1d6; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 1px solid #2d3748;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.8; color: #4a5568;',
      img: 'max-width: 100%; border-radius: 10px; margin: 14px auto; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);',
      a: 'color: #667eea; text-decoration: none; border-bottom: 1px dashed #667eea;',
      table: 'width: 100%; border-collapse: collapse; margin: 14px auto; font-size: 14px;',
      th: 'background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 10px 14px; border: 1px solid #e2e8f0; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e2e8f0;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, #667eea, #764ba2); margin: 24px 0; border-radius: 1px;',
      strong: 'color: #553c9a; font-weight: 700;',
      em: 'font-style: italic; color: #718096;',
    }
  },

  elegant: {
    name: '优雅简约',
    emoji: '✨',
    desc: '精致杂志风排版',
    category: 'classic',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", "Source Han Serif SC", serif; color: #3c3c3c; line-height: 1.9; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 26px; font-weight: 700; text-align: center; margin: 32px 0 20px; color: #1a1a1a; letter-spacing: 2px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 14px; color: #2c2c2c; text-align: center;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 10px; color: #444;',
      p: 'margin: 10px 0; line-height: 2; text-indent: 2em; letter-spacing: 0.5px;',
      blockquote: 'border-left: 3px solid #c9a96e; background: #fdf8f0; padding: 16px 20px; margin: 16px auto; color: #6b5b3e; font-style: italic; border-radius: 0 6px 6px 0;',
      code_inline: 'background: #f8f5f0; color: #8b6914; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #2b2b2b; color: #d4d4d4; padding: 18px; border-radius: 8px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 20px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.9;',
      img: 'max-width: 100%; border-radius: 6px; margin: 16px auto; display: block; box-shadow: 0 2px 12px rgba(0,0,0,0.08);',
      a: 'color: #c9a96e; text-decoration: none; border-bottom: 1px solid #c9a96e;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto; font-size: 14px;',
      th: 'background: #fdf8f0; padding: 12px 14px; border: 1px solid #e8dcc8; font-weight: bold;',
      td: 'padding: 12px 14px; border: 1px solid #e8dcc8;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, #c9a96e, transparent); margin: 28px 0;',
      strong: 'color: #8b6914; font-weight: 700;',
      em: 'font-style: italic; color: #777;',
    }
  },

  deep_read: {
    name: '深度阅读',
    emoji: '📖',
    desc: '适合长文阅读',
    category: 'classic',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: #374151; line-height: 2; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 800; margin: 36px 0 20px; color: #111827; letter-spacing: -0.5px;',
      h2: 'font-size: 22px; font-weight: 700; margin: 28px 0 14px; color: #1f2937; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;',
      h3: 'font-size: 18px; font-weight: 600; margin: 20px 0 10px; color: #374151;',
      p: 'margin: 12px 0; line-height: 2; color: #4b5563; letter-spacing: 0.3px;',
      blockquote: 'border-left: 3px solid #6366f1; background: #eef2ff; padding: 16px 20px; margin: 16px auto; color: #4338ca; border-radius: 0 8px 8px 0;',
      code_inline: 'background: #f3f4f6; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #111827; color: #e5e7eb; padding: 20px; border-radius: 12px; font-size: 14px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 2; color: #4b5563;',
      img: 'max-width: 100%; border-radius: 12px; margin: 20px auto; display: block;',
      a: 'color: #6366f1; text-decoration: none; font-weight: 500;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f9fafb; padding: 12px 16px; border: 1px solid #e5e7eb; font-weight: 600;',
      td: 'padding: 12px 16px; border: 1px solid #e5e7eb;',
      hr: 'border: none; text-align: center; margin: 32px 0; height: auto;',
      strong: 'color: #111827; font-weight: 700;',
      em: 'font-style: italic; color: #6b7280;',
    }
  },

  // ─── 媒体风格系列 ─────────────────────
  nyt: {
    name: '纽约时报',
    emoji: '📰',
    desc: '经典报刊风格',
    category: 'media',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", serif; color: #333; line-height: 1.8; padding: 20px 24px; font-size: 17px;',
      h1: 'font-family: "Georgia", serif; font-size: 32px; font-weight: 900; margin: 32px 0 8px; color: #121212; letter-spacing: -0.5px; line-height: 1.2;',
      h2: 'font-family: "Georgia", serif; font-size: 22px; font-weight: 700; margin: 28px 0 10px; color: #121212;',
      h3: 'font-size: 18px; font-weight: 700; margin: 20px 0 8px; color: #333; font-style: italic;',
      p: 'margin: 8px 0; line-height: 1.85; color: #333;',
      blockquote: 'border-left: 3px solid #121212; padding: 0 0 0 20px; margin: 16px auto; color: #555; font-style: italic; font-size: 18px;',
      code_inline: 'background: #f7f7f7; color: #333; padding: 2px 6px; border-radius: 2px; font-size: 88%;',
      code_block: 'background: #f7f7f7; color: #333; padding: 20px; border-radius: 4px; font-size: 14px; line-height: 1.6; overflow-x: auto; border: 1px solid #e0e0e0;',
      ul: 'margin: 8px 0; padding-left: 20px;',
      ol: 'margin: 8px 0; padding-left: 20px;',
      li: 'margin: 4px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 16px auto; display: block;',
      a: 'color: #326891; text-decoration: underline;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f7f7f7; padding: 10px 14px; border-bottom: 2px solid #121212; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #e0e0e0;',
      hr: 'border: none; border-top: 1px solid #ccc; margin: 28px 0;',
      strong: 'font-weight: 900; color: #121212;',
      em: 'font-style: italic;',
    }
  },

  ft: {
    name: '金融时报',
    emoji: '💰',
    desc: 'FT 经典粉橙色调',
    category: 'media',
    styles: {
      wrapper: 'font-family: "Georgia", "Noto Serif SC", serif; color: #33302e; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #fff1e5;',
      h1: 'font-size: 28px; font-weight: 700; margin: 32px 0 12px; color: #33302e; letter-spacing: -0.3px; line-height: 1.2; border-bottom: 1px solid #ccc1b7; padding-bottom: 8px;',
      h2: 'font-size: 22px; font-weight: 600; margin: 24px 0 10px; color: #33302e;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #66605c;',
      p: 'margin: 8px 0; line-height: 1.85; color: #33302e;',
      blockquote: 'border-left: 4px solid #0d7680; background: rgba(13,118,128,0.05); padding: 14px 20px; margin: 14px auto; color: #0d7680; border-radius: 0 4px 4px 0;',
      code_inline: 'background: rgba(13,118,128,0.08); color: #0d7680; padding: 2px 6px; border-radius: 3px; font-size: 90%;',
      code_block: 'background: #262a33; color: #ccc1b7; padding: 18px; border-radius: 6px; font-size: 13px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 8px 0; padding-left: 24px;',
      ol: 'margin: 8px 0; padding-left: 24px;',
      li: 'margin: 4px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 16px auto; display: block; border-radius: 4px;',
      a: 'color: #0d7680; text-decoration: none; border-bottom: 1px solid #0d7680;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: rgba(13,118,128,0.08); padding: 10px 14px; border-bottom: 2px solid #0d7680; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #ccc1b7;',
      hr: 'border: none; border-top: 1px solid #ccc1b7; margin: 28px 0;',
      strong: 'font-weight: 700; color: #0d7680;',
      em: 'font-style: italic; color: #66605c;',
    }
  },

  medium: {
    name: 'Medium',
    emoji: '📝',
    desc: 'Medium 博客风格',
    category: 'media',
    styles: {
      wrapper: 'font-family: "Charter", "Georgia", "Noto Serif SC", serif; color: #292929; line-height: 1.85; padding: 20px 24px; font-size: 18px;',
      h1: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 30px; font-weight: 800; margin: 36px 0 12px; color: #292929; letter-spacing: -0.5px; line-height: 1.25;',
      h2: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 22px; font-weight: 700; margin: 28px 0 8px; color: #292929;',
      h3: 'font-family: "Lucida Grande", "PingFang SC", sans-serif; font-size: 18px; font-weight: 600; margin: 20px 0 6px; color: #292929;',
      p: 'margin: 12px 0; line-height: 1.85; color: #292929; letter-spacing: -0.003em;',
      blockquote: 'border-left: 3px solid #292929; padding: 0 0 0 20px; margin: 20px auto; color: #292929; font-style: italic; font-size: 21px; line-height: 1.58;',
      code_inline: 'background: #f2f2f2; color: #292929; padding: 3px 6px; border-radius: 3px; font-size: 85%;',
      code_block: 'background: #f2f2f2; color: #292929; padding: 20px; border-radius: 6px; font-size: 14px; line-height: 1.6; overflow-x: auto;',
      ul: 'margin: 12px 0; padding-left: 28px;',
      ol: 'margin: 12px 0; padding-left: 28px;',
      li: 'margin: 6px 0; line-height: 1.85;',
      img: 'max-width: 100%; margin: 20px auto; display: block;',
      a: 'color: #292929; text-decoration: underline;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'padding: 10px 14px; border-bottom: 2px solid #292929; font-weight: bold; text-align: left;',
      td: 'padding: 10px 14px; border-bottom: 1px solid #e0e0e0;',
      hr: 'border: none; text-align: center; margin: 32px auto;',
      strong: 'font-weight: 700;',
      em: 'font-style: italic;',
    }
  },

  // ─── 现代数字系列 ─────────────────────
  apple: {
    name: 'Apple 极简',
    emoji: '🍎',
    desc: '苹果风格极简设计',
    category: 'modern',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif; color: #1d1d1f; line-height: 1.75; padding: 20px 28px; font-size: 17px;',
      h1: 'font-size: 32px; font-weight: 700; margin: 40px 0 16px; color: #1d1d1f; letter-spacing: -0.5px; line-height: 1.15;',
      h2: 'font-size: 24px; font-weight: 600; margin: 32px 0 12px; color: #1d1d1f;',
      h3: 'font-size: 19px; font-weight: 600; margin: 24px 0 8px; color: #1d1d1f;',
      p: 'margin: 10px 0; line-height: 1.75; color: #1d1d1f;',
      blockquote: 'border-left: 3px solid #0071e3; padding: 12px 20px; margin: 16px auto; color: #6e6e73; background: #f5f5f7; border-radius: 0 12px 12px 0;',
      code_inline: 'background: #f5f5f7; color: #1d1d1f; padding: 3px 8px; border-radius: 6px; font-size: 88%;',
      code_block: 'background: #1d1d1f; color: #f5f5f7; padding: 20px; border-radius: 14px; font-size: 14px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.75;',
      img: 'max-width: 100%; border-radius: 16px; margin: 20px auto; display: block;',
      a: 'color: #0071e3; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f5f5f7; padding: 12px 16px; border-bottom: 1px solid #d2d2d7; font-weight: 600; text-align: left;',
      td: 'padding: 12px 16px; border-bottom: 1px solid #d2d2d7;',
      hr: 'border: none; height: 1px; background: #d2d2d7; margin: 32px 0;',
      strong: 'font-weight: 600;',
      em: 'font-style: italic; color: #6e6e73;',
    }
  },

  claude: {
    name: 'Claude',
    emoji: '🤖',
    desc: 'Anthropic Claude 风格',
    category: 'modern',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: #2d2b2a; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #fffcf5;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: #c96442; letter-spacing: -0.3px;',
      h2: 'font-size: 21px; font-weight: 600; margin: 24px 0 12px; color: #c96442; border-bottom: 2px solid #f0dcc8; padding-bottom: 8px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #8b5c3e;',
      p: 'margin: 10px 0; line-height: 1.85; color: #2d2b2a;',
      blockquote: 'border-left: 3px solid #c96442; background: #faf3ea; padding: 14px 20px; margin: 14px auto; color: #5c4a3a; border-radius: 0 8px 8px 0;',
      code_inline: 'background: #f5ede4; color: #c96442; padding: 2px 8px; border-radius: 5px; font-size: 90%;',
      code_block: 'background: #2d2b2a; color: #f5ede4; padding: 18px; border-radius: 12px; font-size: 13.5px; line-height: 1.7; overflow-x: auto; border: 1px solid #e8dcc8;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85;',
      img: 'max-width: 100%; border-radius: 12px; margin: 18px auto; display: block; box-shadow: 0 2px 8px rgba(150,100,60,0.1);',
      a: 'color: #c96442; text-decoration: none; border-bottom: 1px solid #c96442;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #faf3ea; padding: 10px 14px; border: 1px solid #e8dcc8; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e8dcc8;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, transparent, #c96442, transparent); margin: 28px 0;',
      strong: 'color: #c96442; font-weight: 600;',
      em: 'font-style: italic; color: #8b7b6b;',
    }
  },

  // ─── V3 新增主题 ─────────────────────
  sspai: {
    name: '少数派',
    emoji: '🔮',
    desc: 'sspai 清新科技风',
    category: 'modern',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; color: #2b2b2b; line-height: 1.8; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: #d71a18; letter-spacing: -0.3px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: #2b2b2b; border-left: 4px solid #d71a18; padding-left: 12px;',
      h3: 'font-size: 16px; font-weight: 600; margin: 18px 0 8px; color: #444;',
      p: 'margin: 10px 0; line-height: 1.85; color: #2b2b2b;',
      blockquote: 'border-left: 4px solid #d71a18; background: #fef5f5; padding: 14px 18px; margin: 14px auto; color: #666; border-radius: 0 6px 6px 0;',
      code_inline: 'background: #f4f4f4; color: #d71a18; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1e1e1e; color: #d4d4d4; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.8;',
      img: 'max-width: 100%; border-radius: 8px; margin: 16px auto; display: block;',
      a: 'color: #d71a18; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #fef5f5; padding: 10px 14px; border: 1px solid #eee; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #eee;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, #d71a18, transparent); margin: 28px 0;',
      strong: 'color: #d71a18; font-weight: 700;',
      em: 'font-style: italic; color: #888;',
    }
  },

  bamboo: {
    name: '竹林',
    emoji: '🎋',
    desc: '中国风绿色雅致',
    category: 'creative',
    styles: {
      wrapper: 'font-family: "STKaiti", "KaiTi", "Noto Serif SC", "Georgia", serif; color: #2c3e2d; line-height: 1.9; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 700; text-align: center; margin: 36px 0 20px; color: #1a472a; letter-spacing: 4px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 14px; color: #2c5f3a; padding-bottom: 8px; border-bottom: 2px solid #8fbc8f;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 10px; color: #3a7d44;',
      p: 'margin: 10px 0; line-height: 2; text-indent: 2em; color: #2c3e2d;',
      blockquote: 'border-left: 4px solid #8fbc8f; background: #f0f8f0; padding: 16px 20px; margin: 16px auto; color: #3a7d44; border-radius: 0 8px 8px 0; font-style: italic;',
      code_inline: 'background: #e8f5e9; color: #2e7d32; padding: 2px 6px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1b2a1b; color: #a5d6a7; padding: 18px; border-radius: 8px; font-size: 13px; line-height: 1.7; overflow-x: auto;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 6px 0; line-height: 1.9;',
      img: 'max-width: 100%; border-radius: 8px; margin: 16px auto; display: block; box-shadow: 0 2px 12px rgba(60,120,60,0.1);',
      a: 'color: #2e7d32; text-decoration: none; border-bottom: 1px dashed #8fbc8f;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: #f0f8f0; padding: 10px 14px; border: 1px solid #c8e6c9; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #c8e6c9;',
      hr: 'border: none; height: 1px; background: linear-gradient(to right, transparent, #8fbc8f, transparent); margin: 28px 0;',
      strong: 'color: #1b5e20; font-weight: 700;',
      em: 'font-style: italic; color: #689f63;',
    }
  },

  dark_night: {
    name: '暗夜模式',
    emoji: '🌃',
    desc: '暗色背景高对比',
    category: 'creative',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #e0e0e0; line-height: 1.8; padding: 20px 24px; font-size: 16px; background: #1a1a2e;',
      h1: 'font-size: 26px; font-weight: 700; margin: 32px 0 16px; color: #e94560; letter-spacing: -0.3px;',
      h2: 'font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: #e94560; border-left: 4px solid #e94560; padding-left: 12px;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: #ff8a80;',
      p: 'margin: 10px 0; line-height: 1.85; color: #c0c0c0;',
      blockquote: 'border-left: 4px solid #e94560; background: rgba(233,69,96,0.08); padding: 14px 18px; margin: 14px auto; color: #ff8a80; border-radius: 0 8px 8px 0;',
      code_inline: 'background: rgba(255,255,255,0.08); color: #64ffda; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #0f0f1a; color: #a9b1d6; padding: 18px; border-radius: 10px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 1px solid #16213e;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85; color: #c0c0c0;',
      img: 'max-width: 100%; border-radius: 10px; margin: 16px auto; display: block;',
      a: 'color: #64ffda; text-decoration: none;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: rgba(233,69,96,0.15); padding: 10px 14px; border: 1px solid #16213e; font-weight: 600; text-align: left; color: #e94560;',
      td: 'padding: 10px 14px; border: 1px solid #16213e; color: #c0c0c0;',
      hr: 'border: none; height: 2px; background: linear-gradient(to right, #e94560, #0f3460, #e94560); margin: 28px 0;',
      strong: 'color: #e94560; font-weight: 700;',
      em: 'font-style: italic; color: #888;',
    }
  },

  gradient: {
    name: '渐变彩虹',
    emoji: '🌈',
    desc: '标题彩色渐变效果',
    category: 'creative',
    styles: {
      wrapper: 'font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #333; line-height: 1.8; padding: 20px 24px; font-size: 16px;',
      h1: 'font-size: 28px; font-weight: 800; margin: 32px 0 16px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center;',
      h2: 'font-size: 21px; font-weight: 700; margin: 24px 0 12px; background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;',
      h3: 'font-size: 17px; font-weight: 600; margin: 18px 0 8px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;',
      p: 'margin: 10px 0; line-height: 1.85; color: #444;',
      blockquote: 'border-left: 4px solid; border-image: linear-gradient(to bottom, #f093fb, #f5576c) 1; background: linear-gradient(135deg, #fdf2f8, #fce7f3); padding: 14px 18px; margin: 14px auto; color: #9b2c6c; border-radius: 0;',
      code_inline: 'background: linear-gradient(135deg, #e0c3fc, #8ec5fc); color: #5b21b6; padding: 2px 8px; border-radius: 4px; font-size: 90%;',
      code_block: 'background: #1a1a2e; color: #e0e0e0; padding: 18px; border-radius: 12px; font-size: 13px; line-height: 1.7; overflow-x: auto; border: 2px solid; border-image: linear-gradient(135deg, #f093fb, #f5576c, #4facfe) 1;',
      ul: 'margin: 10px 0; padding-left: 24px;',
      ol: 'margin: 10px 0; padding-left: 24px;',
      li: 'margin: 5px 0; line-height: 1.85;',
      img: 'max-width: 100%; border-radius: 12px; margin: 16px auto; display: block;',
      a: 'background: linear-gradient(135deg, #f093fb, #f5576c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-decoration: none; font-weight: 600;',
      table: 'width: 100%; border-collapse: collapse; margin: 16px auto;',
      th: 'background: linear-gradient(135deg, #e0c3fc, #8ec5fc); padding: 10px 14px; border: 1px solid #e2e8f0; font-weight: 600; text-align: left;',
      td: 'padding: 10px 14px; border: 1px solid #e2e8f0;',
      hr: 'border: none; height: 3px; background: linear-gradient(to right, #f093fb, #f5576c, #ffecd2, #43e97b, #4facfe); margin: 28px 0; border-radius: 2px;',
      strong: 'background: linear-gradient(135deg, #f5576c, #ff6b6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800;',
      em: 'font-style: italic; color: #888;',
    }
  },
};

// ─── 预设颜色板 ─────────────────────
const colorPresets = [
  { name: '翡翠绿', color: '#10b981' },
  { name: '天空蓝', color: '#3b82f6' },
  { name: '靛蓝', color: '#4f6ef7' },
  { name: '薰衣紫', color: '#8b5cf6' },
  { name: '玫瑰粉', color: '#ec4899' },
  { name: '珊瑚红', color: '#ef4444' },
  { name: '琥珀橙', color: '#f59e0b' },
  { name: '青碧', color: '#0d9488' },
  { name: '海军蓝', color: '#1e40af' },
  { name: '深玫瑰', color: '#be185d' },
  { name: '石墨灰', color: '#4b5563' },
  { name: '经典蓝', color: '#1890ff' },
];

// ─── 示例 Markdown 内容 ─────────────────
const sampleMarkdown = `# MoPai 墨排 V3

欢迎使用 **MoPai 墨排** V3！✒️ 优雅高效的多平台 Markdown 排版工具。

## 🎯 核心功能

### 1. 实时预览
左侧输入 Markdown，右侧即时查看排版效果。

### 2. 13 种精美主题
> 💡 支持 13 种专业设计主题，涵盖经典公众号、媒体风格、现代数字、创意系列。

### 3. 暗色模式
点击右上角 🌙 图标切换暗色界面，减轻眼睛疲劳。

### 4. 自定义样式
- 🎨 12 种预设颜色 + 自定义取色器
- 🔤 3 种字体风格 + 5 档字号
- 💻 Mac 风格代码块

## 📝 排版示例

### 文字样式

**加粗文字** 和 *斜体文字*，以及 \`行内代码\`。

### 信息卡片

:::tip 💡 使用提示
你可以使用 \`:::info\`、\`:::warning\`、\`:::tip\` 来创建漂亮的信息卡片。
:::

:::warning ⚠️ 注意事项
复制到公众号时，请确保使用「复制到公众号」按钮。
:::

### 代码块

\`\`\`python
def hello():
    """Mac 风格代码块，带三色圆点"""
    print("Hello, Markdown! 🎉")
    return True
\`\`\`

\`\`\`javascript
const themes = ['默认', '技术', '优雅', 'Claude', '暗夜'];
themes.forEach(theme => console.log(\`🎨 \${theme}\`));
\`\`\`

### 表格

| 功能 | 说明 | 状态 |
|------|------|------|
| 13 种主题 | 经典 + 媒体 + 现代 + 创意 | ✅ |
| 暗色模式 | 一键切换 | ✅ |
| 自定义颜色 | 12 预设 + 自选 | ✅ |
| Mac 代码块 | 三色圆点标题栏 | ✅ |
| 格式工具栏 | 快捷插入语法 | ✅ |
| 导出 HTML | 下载排版文件 | ✅ |

### 有序列表

1. 编写 Markdown 内容
2. 选择心仪的样式主题
3. 调整字体和颜色
4. 点击复制到公众号
5. 粘贴到微信编辑器 🎉

---

*由 MoPai 墨排 V3 生成 · 优雅高效的排版工具*
`;
