// ============================================
// MoPai 墨排 — AI 写作痕迹检测引擎
// 参考: Humanizer-zh (github.com/op7418/Humanizer-zh)
// ============================================

const aiDetector = (() => {

  // ─── AI 高频词汇列表 ──────────────────
  const AI_WORDS = [
    '此外', '至关重要', '深入探讨', '值得注意的是', '毋庸置疑',
    '不可否认', '显而易见', '众所周知', '总而言之', '综上所述',
    '由此可见', '不难发现', '事实上', '实际上', '从某种意义上说',
    '充满活力', '宝贵的', '独特的', '卓越的', '显著的',
    '令人瞩目', '引人注目', '举足轻重', '不容忽视', '意义深远',
    '至关紧要', '不言而喻', '毫无疑问', '无可争辩',
    '深刻影响', '深远影响', '积极影响', '重大影响',
    '发挥着.*作用', '扮演着.*角色', '起着.*作用',
    '赋能', '助力', '加持', '驱动', '引领', '赋予',
    '无缝', '生态', '闭环', '底层逻辑', '顶层设计',
    '全方位', '多维度', '深层次', '高质量',
    '践行', '落地', '抓手', '打通',
  ];

  // ─── 检测规则定义 ──────────────────────
  const rules = [

    // ═══ 📝 内容模式 ═══
    {
      id: 'content-significance',
      category: '📝 内容模式',
      name: '过度强调意义',
      description: '过度使用象征性、遗产性表达',
      test: (text) => {
        const patterns = [
          /作为[\u4e00-\u9fa5]*(?:证明|象征|体现|标志)/g,
          /(?:深远的?|深刻的?|重大的?)(?:意义|影响|启示)/g,
          /(?:开创|开启|引领)[\u4e00-\u9fa5]*(?:新纪元|新时代|新篇章|新征程)/g,
          /(?:具有|拥有)[\u4e00-\u9fa5]*(?:里程碑|划时代)[\u4e00-\u9fa5]*意义/g,
        ];
        return matchPatterns(text, patterns, '建议：用具体事实替代空泛的意义描述');
      }
    },
    {
      id: 'content-promo',
      category: '📝 内容模式',
      name: '宣传/广告式语言',
      description: '过于推销、夸大的表达',
      test: (text) => {
        const patterns = [
          /(?:革命性|颠覆性|突破性|划时代)的?[\u4e00-\u9fa5]*(?:产品|技术|方案|创新)/g,
          /(?:无与伦比|无可比拟|首屈一指|独一无二|业界领先)/g,
          /(?:完美|极致|卓越|超凡)的?(?:体验|品质|性能|服务)/g,
          /(?:一站式|全方位|一体化)[\u4e00-\u9fa5]*(?:解决方案|服务|平台)/g,
        ];
        return matchPatterns(text, patterns, '建议：用数据和事实代替夸大描述');
      }
    },
    {
      id: 'content-vague',
      category: '📝 内容模式',
      name: '模糊归因',
      description: '含糊的来源引用',
      test: (text) => {
        const patterns = [
          /(?:有人说|有人认为|据说|据了解|据悉)/g,
          /(?:专家|学者|业内人士|分析人士)(?:表示|认为|指出|强调)/g,
          /(?:研究|调查|数据)(?:表明|显示|证明)[^，。]{0,5}[，。]/g,
        ];
        return matchPatterns(text, patterns, '建议：注明具体来源、人名或机构');
      }
    },
    {
      id: 'content-challenge-outlook',
      category: '📝 内容模式',
      name: '"挑战与展望"套路',
      description: '公式化的总结段落',
      test: (text) => {
        const patterns = [
          /(?:挑战与机遇并存|机遇与挑战并存|风险与机遇并存)/g,
          /(?:未来可期|前景广阔|大有可为|方兴未艾)/g,
          /(?:任重道远|道阻且长|砥砺前行|勇毅前行)/g,
          /让我们拭目以待/g,
          /(?:展望未来|放眼未来|面向未来)[，,][\u4e00-\u9fa5]*/g,
        ];
        return matchPatterns(text, patterns, '建议：给出具体的下一步计划或预测');
      }
    },

    // ═══ 🔤 语言和语法模式 ═══
    {
      id: 'lang-ai-words',
      category: '🔤 语言模式',
      name: 'AI 高频词汇',
      description: '在 AI 文本中出现频率异常高的词汇',
      test: (text) => {
        const results = [];
        for (const word of AI_WORDS) {
          try {
            const regex = new RegExp(word, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
              results.push({
                start: match.index,
                end: match.index + match[0].length,
                matched: match[0],
                suggestion: `"${match[0]}" 是 AI 常用词，考虑换一个更自然的表达`,
              });
            }
          } catch (e) { /* skip invalid regex */ }
        }
        return results;
      }
    },
    {
      id: 'lang-triple',
      category: '🔤 语言模式',
      name: '三段式法则',
      description: '过度使用三个并列词/短语',
      test: (text) => {
        const patterns = [
          /[\u4e00-\u9fa5]{2,6}[、，,][\u4e00-\u9fa5]{2,6}[、，,][\u4e00-\u9fa5]{2,6}(?:的|地|等)/g,
          /(?:不仅|既)[\u4e00-\u9fa5]*[，,](?:而且|也|还)[\u4e00-\u9fa5]*[，,](?:更|同时|并且)/g,
        ];
        return matchPatterns(text, patterns, '建议：保留最关键的一个点，删去冗余并列');
      }
    },
    {
      id: 'lang-negation-parallel',
      category: '🔤 语言模式',
      name: '否定式排比',
      description: '"不仅...更是...而是..." 句式',
      test: (text) => {
        const patterns = [
          /不仅仅是[\u4e00-\u9fa5]*[，,](?:更是|而是|也是)[\u4e00-\u9fa5]*/g,
          /不只是[\u4e00-\u9fa5]*[，,](?:更是|而是|也是)[\u4e00-\u9fa5]*/g,
          /不是[\u4e00-\u9fa5]*[，,]而是[\u4e00-\u9fa5]*/g,
        ];
        return matchPatterns(text, patterns, '建议：直接说明事物本身，不用否定对比');
      }
    },
    {
      id: 'lang-synonym-cycling',
      category: '🔤 语言模式',
      name: '同义词循环',
      description: '刻意换词避免重复',
      test: (text) => {
        const synonymGroups = [
          ['推动', '促进', '助推', '驱动', '助力'],
          ['提升', '提高', '增强', '强化', '优化'],
          ['打造', '构建', '搭建', '营造', '塑造'],
          ['探索', '探究', '研究', '深入', '钻研'],
        ];
        const results = [];
        for (const group of synonymGroups) {
          const found = [];
          for (const word of group) {
            const regex = new RegExp(word, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
              found.push({ word, index: match.index });
            }
          }
          if (found.length >= 3) {
            const words = [...new Set(found.map(f => f.word))].join('、');
            results.push({
              start: found[0].index,
              end: found[0].index + found[0].word.length,
              matched: words,
              suggestion: `同义词循环使用过多（${words}），选择一个最准确的表达`,
            });
          }
        }
        return results;
      }
    },

    // ═══ 🎨 风格模式 ═══
    {
      id: 'style-dash-overuse',
      category: '🎨 风格模式',
      name: '破折号过度使用',
      description: '频繁使用 —— 插入解释',
      test: (text) => {
        const dashMatches = text.match(/——/g);
        if (dashMatches && dashMatches.length >= 3) {
          const results = [];
          const regex = /——/g;
          let match;
          while ((match = regex.exec(text)) !== null) {
            results.push({
              start: match.index,
              end: match.index + 2,
              matched: '——',
              suggestion: '破折号使用过多（全文 ' + dashMatches.length + ' 处），考虑用逗号或分句替代',
            });
          }
          return results;
        }
        return [];
      }
    },
    {
      id: 'style-bold-overuse',
      category: '🎨 风格模式',
      name: '粗体过度使用',
      description: 'Markdown 中过多加粗',
      test: (text) => {
        const boldMatches = text.match(/\*\*[^*]+\*\*/g);
        if (boldMatches && boldMatches.length >= 5) {
          return [{
            start: 0, end: 0,
            matched: `全文 ${boldMatches.length} 处加粗`,
            suggestion: `加粗过多（${boldMatches.length} 处），重点太多 = 没有重点，建议保留最关键的 2-3 处`,
          }];
        }
        return [];
      }
    },
    {
      id: 'style-emoji-overuse',
      category: '🎨 风格模式',
      name: '表情符号泛滥',
      description: '过多使用 emoji',
      test: (text) => {
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
        const emojiMatches = text.match(emojiRegex);
        if (emojiMatches && emojiMatches.length >= 8) {
          return [{
            start: 0, end: 0,
            matched: `全文 ${emojiMatches.length} 个 emoji`,
            suggestion: `emoji 过多（${emojiMatches.length} 个），正式文章建议控制在 3-5 个以内`,
          }];
        }
        return [];
      }
    },

    // ═══ 💬 交流模式 ═══
    {
      id: 'comm-flattery',
      category: '💬 交流模式',
      name: '谄媚/夸大语气',
      description: '过度积极、讨好的表达',
      test: (text) => {
        const patterns = [
          /(?:令人(?:振奋|鼓舞|欣喜|激动|兴奋)|激动人心|振奋人心|鼓舞人心)/g,
          /(?:可喜的是|令人欣慰的是|值得庆幸的是)/g,
        ];
        return matchPatterns(text, patterns, '建议：用平实客观的语气陈述');
      }
    },
    {
      id: 'comm-filler',
      category: '💬 交流模式',
      name: '填充短语',
      description: '不增加信息量的空话',
      test: (text) => {
        const patterns = [
          /在当今(?:社会|时代|世界|数字化时代)/g,
          /随着[\u4e00-\u9fa5]*(?:的发展|的进步|的普及|的推进)/g,
          /在这个[\u4e00-\u9fa5]*的时代/g,
          /纵观[\u4e00-\u9fa5]*(?:历史|发展)/g,
        ];
        return matchPatterns(text, patterns, '建议：直接进入主题，删掉这个开场白');
      }
    },
    {
      id: 'comm-over-qualify',
      category: '💬 交流模式',
      name: '过度限定',
      description: '不必要的条件限定',
      test: (text) => {
        const patterns = [
          /(?:在一定程度上|从某种角度来看|在某种意义上)/g,
          /(?:可以说|某种程度上说|不得不说)/g,
          /(?:应该说|客观来说|公平地说)/g,
        ];
        return matchPatterns(text, patterns, '建议：直接表达观点，不要过度铺垫');
      }
    },
    {
      id: 'comm-generic-positive',
      category: '💬 交流模式',
      name: '通用积极结论',
      description: '空泛的正面总结',
      test: (text) => {
        const patterns = [
          /(?:相信在[\u4e00-\u9fa5]*的(?:努力|推动|引领)下)/g,
          /(?:我们有理由相信|我们完全有理由)/g,
          /(?:必将|终将|定将)[\u4e00-\u9fa5]*(?:辉煌|成功|突破)/g,
          /(?:美好的?明天|光明的?未来|崭新的?篇章)/g,
        ];
        return matchPatterns(text, patterns, '建议：用具体的计划或数据代替空泛乐观');
      }
    },
  ];

  // ─── 工具函数 ──────────────────────────
  function matchPatterns(text, patterns, defaultSuggestion) {
    const results = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        results.push({
          start: match.index,
          end: match.index + match[0].length,
          matched: match[0],
          suggestion: defaultSuggestion,
        });
      }
    }
    return results;
  }

  // ─── 主检测函数 ──────────────────────────
  function detect(text) {
    if (!text || text.trim().length === 0) return { total: 0, issues: [] };

    const allIssues = [];
    for (const rule of rules) {
      const matches = rule.test(text);
      if (matches.length > 0) {
        allIssues.push({
          ruleId: rule.id,
          category: rule.category,
          name: rule.name,
          description: rule.description,
          matches: matches,
          count: matches.length,
        });
      }
    }

    const total = allIssues.reduce((sum, issue) => sum + issue.count, 0);

    return {
      total,
      issues: allIssues,
      score: Math.max(0, 100 - total * 5), // AI 味评分：0-100，越高越人性化
    };
  }

  // ─── 改写用 system prompt（传输由 aiClient 负责）──
  const REWRITE_PROMPT = `你是一个中文写作优化专家。用户会给你一段包含 AI 写作痕迹的文字，请改写它，要求：
1. 去除 AI 味（不用"此外""至关重要""深入探讨"等 AI 高频词）
2. 不用三段式并列（"A、B、C"的句式）
3. 不用否定式排比（"不仅...更是..."）
4. 语气自然朴实，像真人写的
5. 保留原文的核心信息和意思
6. 直接输出改写结果，不要解释`;

  return { detect, REWRITE_PROMPT };
})();
