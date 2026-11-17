const ENTITY_RE = /&(?:nbsp|amp|lt|gt|quot|#39);/g
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|h[1-6]|li|blockquote|section|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(ENTITY_RE, (entity) => ENTITIES[entity.toLowerCase()] || entity)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textAndSource({ markdown, html }) {
  if (html != null) return { text: htmlToText(html), html: String(html) }
  return { text: String(markdown || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`\[\]()-]/g, ' '), markdown: String(markdown || '') }
}

/** 规则反推只描述文本中可观察的倾向；调用方必须把候选交给用户确认。 */
export function inferWritingStyle(input) {
  const { text, html = '', markdown = '' } = textAndSource(input)
  if (!text.trim()) throw new Error('learn 需要非空的定稿、HTML 或网页正文')
  const headings = (markdown.match(/^#{1,6}\s+/gm) || []).length + (html.match(/<h[1-6]\b/gi) || []).length
  const lists = (markdown.match(/^\s*(?:[-*+]|\d+[.)])\s+/gm) || []).length + (html.match(/<li\b/gi) || []).length
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim().length >= 20).length
  const questions = (text.match(/[?？]/g) || []).length
  const exclamations = (text.match(/[!！]/g) || []).length
  const dialogue = (text.match(/我们|你|大家|咱们/g) || []).length
  const reasoning = (text.match(/因此|因为|所以|首先|其次|最后|具体而言/g) || []).length
  const caution = (text.match(/应当|需要|注意|避免|不能|不建议/g) || []).length
  const sentences = text.split(/[。！？!?；;]/).filter((part) => part.trim()).length || 1
  const chars = [...text.replace(/\s/g, '')].length
  const averageSentence = Math.round(chars / sentences)

  const tone = dialogue >= 2 || questions >= 2
    ? '对话感较强，用提问与称呼拉近和读者的距离'
    : reasoning >= 2
      ? '克制、条理清楚，以解释和论证推进'
      : exclamations > 0
        ? '表达直接，带适度的情绪强调'
        : '平实、克制，以清楚陈述为主'
  const structure = headings >= 2
    ? `以标题分层展开（观察到 ${headings} 个标题），${lists ? '并用列表归纳要点' : '段落按主题顺序推进'}`
    : lists >= 2
      ? `以短段和列表组织信息（观察到 ${lists} 个列表项）`
      : paragraphs >= 3
        ? '以连续段落逐层展开，开头建立背景，随后解释细节'
        : '以少量完整段落集中说明一个主题'
  const audience = /代码|函数|接口|部署|API|npm/i.test(text)
    ? '面向有技术背景的读者；保留必要术语，同时解释操作前提'
    : /我们|你|大家|咱们/.test(text)
      ? '面向对该主题已有兴趣的一般读者，减少阅读门槛'
      : '面向希望系统了解该主题的读者，需补足必要背景'
  const purpose = questions >= 2
    ? '从问题出发澄清概念，并引导读者形成判断或行动'
    : lists >= 2 || caution >= 2
      ? '解释主题并给出可执行的要点与注意事项'
      : '帮助读者理解主题的背景、核心观点与论证过程'
  const doItems = [
    headings >= 2 ? '保留清晰的小标题与层级' : '用段落中心句明确推进顺序',
    averageSentence > 80 ? '保留完整论证，同时把过长句拆成可扫描的短句' : '维持简洁句式与具体表达',
    lists >= 2 ? '并列信息优先使用列表' : '重要结论给出事实、例子或理由支撑',
  ]
  const dontItems = [
    '不要编造来源中没有的事实、数据或引文',
    dialogue >= 2 ? '避免连续提问和过度口语化' : '避免无铺垫地堆砌术语',
    exclamations >= 2 ? '避免过量感叹与绝对化措辞' : '避免空泛结论和重复铺陈',
  ]
  return {
    tone,
    structure,
    audience,
    purpose,
    do: doItems.join('；'),
    dont: dontItems.join('；'),
    evidence: { chars, headings, lists, paragraphs, questions, averageSentence },
  }
}
