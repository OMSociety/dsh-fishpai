import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { componentsFromMarkdown, renderProfessional, renderProfessionalPublish } from '../plugin/core/professional/index.mjs'
import { render, themeCatalog } from '../plugin/core/render.mjs'
import { lintWechatHtml } from '../plugin/core/wechat-lint.mjs'
import { registerTools } from '../plugin/host/tools.mjs'

const TABLE = '| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| 甲 | 乙 | 丙 |'
const PUBLISH_OPTIONS = {
  publish: true,
  footnotes: true,
  macCodeBlock: true,
  fontSize: '16px',
  wrapText: true,
  wechatBackground: true,
  promoteFontSize: true,
}

function openingTags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))].map((match) => match[0])
}

function expandedHeight(html, from = 56) {
  return Number(html.match(new RegExp(`<animate attributeName="height" from="${from}" to="(\\d+)"`))?.[1])
}

function fakeHost(cwd) {
  const tools = []
  registerTools({
    tools: { register: (tool) => { tools.push(tool); return () => {} } },
  }, { resolveCwd: () => cwd, log: () => {} })
  return { tools, exec: { agent: { session: { id: 'render-review' } } } }
}

async function lintToolExport(t, args) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-render-review-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const { tools, exec } = fakeHost(cwd)
  const opened = await tools.find((tool) => tool.name === 'fishpai_open').execute({ markdown: '正文' }, exec)
  assert.equal(opened.isError, false, opened.text)
  const rendered = await tools.find((tool) => tool.name === 'fishpai_render').execute({
    ...args,
    target: 'quick',
    publish: true,
    embed_images: false,
    out_path: 'render-review.html',
  }, exec)
  assert.equal(rendered.isError, false, rendered.text)
  const html = fs.readFileSync(path.join(cwd, 'render-review.html'), 'utf8')
  const linted = await tools.find((tool) => tool.name === 'fishpai_lint').execute({ html }, exec)
  assert.equal(linted.isError, false, linted.text)
  return { html, result: JSON.parse(linted.text) }
}

test('RENDER-01：专业管线把 Markdown 表格渲染成主题化语义表格', () => {
  const components = componentsFromMarkdown(TABLE)
  assert.deepEqual(components.map((component) => component.type), ['table'])

  for (const renderTarget of [renderProfessional, renderProfessionalPublish]) {
    const { html } = renderTarget(TABLE, { spec: { accent: '#123456', card_bg: '#f0f1f2' } })
    assert.equal(openingTags(html, 'table').length, 1)
    assert.equal(openingTags(html, 'thead').length, 1)
    assert.equal(openingTags(html, 'tbody').length, 1)
    assert.equal(openingTags(html, 'tr').length, 2)
    assert.equal(openingTags(html, 'th').length, 3)
    assert.equal(openingTags(html, 'td').length, 3)
    for (const [index, align] of ['left', 'center', 'right'].entries()) {
      for (const tag of ['th', 'td']) {
        const cell = openingTags(html, tag)[index]
        assert.equal((cell.match(/\sstyle=/g) || []).length, 1, cell)
        assert.match(cell, new RegExp(`text-align:${align}(?:;|")`), cell)
        assert.match(cell, /border:0;/, '专业表格单元格先清默认边框')
      }
    }
    assert.match(html, /#123456/)
    assert.match(html, /#f0f1f2/)
    assert.match(html, /<th[^>]*>(?:<span>)?左/)
    assert.match(html, /<td[^>]*>(?:<span>)?丙/)
  }
})

test('RENDER-01：引用在自己的闭合 token 结束，后文保持独立块', () => {
  const components = componentsFromMarkdown('> 引用第一行\n>\n> 引用第二行\n\n后文 **保留**。')
  assert.deepEqual(components.map((component) => component.type), ['quote', 'paragraph'])
  assert.equal(components[1].html.includes('后文'), true)

  const { html } = renderProfessional('> 引用\n\n后文保留')
  const quoteEnd = html.indexOf('</section>')
  const after = html.indexOf('<p', quoteEnd)
  assert.ok(quoteEnd >= 0 && after > quoteEnd, html)
  assert.match(html.slice(after), /后文保留/)
})

test('RENDER-02：多个短段逐块计行，展开高度容纳每一段的末行', () => {
  const paragraphs = Array.from({ length: 8 }, (_, index) => `短${index + 1}`).join('\n\n')
  const { html } = renderProfessional(`:::expand\n封面\n---\n${paragraphs}\n:::`)
  const height = expandedHeight(html)
  // 默认规格：56px 封面 + 8 行 × 16px × 1.8 + 7 个段间距 × 14px + 30px 容器留白 + 1px 取整余量。
  assert.ok(height >= 416, `八个短段需要至少 416px，实际为 ${height}px`)
  assert.ok(Number.isFinite(height))

  const manyParagraphs = Array.from({ length: 60 }, (_, index) => `段${index + 1}`).join('\n\n')
  const longHeight = expandedHeight(renderProfessional(`:::expand\n封面\n---\n${manyParagraphs}\n:::`).html)
  assert.ok(longHeight >= 2641, `六十个短段需要至少 2641px，实际为 ${longHeight}px`)
})

test('RENDER-03：默认专业目标收到 theme_spec 时明确报错，不静默忽略', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-render-review-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const { tools, exec } = fakeHost(cwd)
  const opened = await tools.find((tool) => tool.name === 'fishpai_open').execute({ markdown: '正文' }, exec)
  assert.equal(opened.isError, false, opened.text)

  const result = await tools.find((tool) => tool.name === 'fishpai_render').execute({
    theme_spec: { base: 'default', styles: { p: 'color: #111111;' } },
  }, exec)
  assert.equal(result.isError, true)
  assert.match(result.text, /theme_spec/)
  assert.match(result.text, /quick/)
})

test('RENDER-04：raw URL 在实体解码后校验协议并拒绝 javascript', () => {
  for (const url of ['jav&#x61;script:alert(1)', 'jav&#97;script:alert(1)', 'jav&Tab;ascript:alert(1)']) {
    assert.throws(
      () => renderProfessional(`:::raw\n<a href="${url}">危险链接</a>\n:::`),
      /raw 不允许/,
      url,
    )
  }
  assert.throws(() => renderProfessional(':::raw\n<iframe srcdoc="x"></iframe>\n:::'), /raw 不允许/)
})

test('RENDER-04：raw 保留安全链接、相对图片、SVG 引用与内嵌图片', () => {
  const source = '<a href="https://example.com/a">网页</a><a href="mailto:hi@example.com">邮件</a>'
    + '<img src="assets/pixel.png"><svg><use href="#shape"></use><image xlink:href="data:image/png;base64,AAAA"/></svg>'
  const { html } = renderProfessional(`:::raw\n${source}\n:::`)
  assert.ok(html.includes(source), html)
})

test('RENDER-05：快速管线对齐单元格只有一个 style，主题样式与对齐共存', () => {
  const { html } = render(TABLE, { theme: 'default', publish: false })
  for (const tag of [...openingTags(html, 'th'), ...openingTags(html, 'td')]) {
    assert.equal((tag.match(/\sstyle=/g) || []).length, 1, tag)
  }
  const firstHeader = openingTags(html, 'th')[0]
  const lastBodyCell = openingTags(html, 'td').at(-1)
  assert.match(firstHeader, /background:/)
  assert.match(firstHeader, /padding: 10px 12px/)
  assert.match(firstHeader, /text-align:left/)
  assert.match(lastBodyCell, /padding: 10px 12px/)
  assert.match(lastBodyCell, /text-align:right/)
})

test('RENDER-06：需要内容的空交互指令给出具名错误', () => {
  for (const directive of ['timeline', 'expand', 'swap', 'spotlight', 'compare']) {
    assert.throws(
      () => componentsFromMarkdown(`:::${directive}\n:::`),
      new RegExp(directive),
      directive,
    )
  }
  assert.throws(() => componentsFromMarkdown(':::compare\n只有左侧\n:::'), /compare/)
  assert.throws(() => componentsFromMarkdown(':::expand\n只有封面\n:::'), /expand/)
})

test('RENDER-06：可空指令有明确空态，合法交互内容不受影响', () => {
  assert.match(renderProfessional(':::swiper\n:::').html, /待补图片 1/)
  assert.match(renderProfessional(':::danmaku\n:::').html, /弹幕一/)
  for (const directive of ['expand', 'swap']) {
    const { html } = renderProfessional(`:::${directive}\n---\n合法正文\n:::`)
    assert.match(html, /合法正文/)
  }
  assert.match(renderProfessional(':::timeline\n2026 · 发布\n:::').html, /2026 · 发布/)
  assert.match(renderProfessional(':::spotlight\n照亮正文\n:::').html, /照亮正文/)
  assert.match(renderProfessional(':::compare\n左\n---\n右\n:::').html, /右/)
})

for (const { key } of themeCatalog()) {
  test(`QA-01：${key} 主题 fishpai_render 完整导出通过 fishpai_lint`, async (t) => {
    const markdown = '# 标题\n\n正文 **加粗** 与 [链接](https://example.com)。\n\n> 引用\n\n'
      + `${TABLE}\n\n\`\`\`js\nconst x = 1\n\`\`\``
    const { html, result } = await lintToolExport(t, { markdown, theme: key })
    assert.ok(html.startsWith('<div style="'), '快速导出是 article fragment，根 div 没有 doctype 或前导节点')
    assert.deepEqual(result.errors, [], `${key}: ${JSON.stringify(result.errors)}`)
  })
}

test('QA-01：自定义主题的低对比粗体仍被真实导出 lint 识别', async (t) => {
  const { result } = await lintToolExport(t, {
    markdown: '# 标题 **浅灰粗体**',
    theme_spec: {
      base: 'default',
      styles: { strong: 'color: #777777; font-weight: 700;' },
    },
  })
  assert.ok(result.errors.some((error) => error.rule === 'contrast' && error.ratio < 4.5), JSON.stringify(result.errors))
})

test('QA-01：lint 仍识别外部 raw 容器、未知 class、裸文本与低对比正文', () => {
  const external = render('<div class="external"><span>外部容器</span></div>', {
    theme: 'default', ...PUBLISH_OPTIONS,
  }).html
  const externalRules = lintWechatHtml(external).errors.map((error) => error.rule)
  assert.ok(externalRules.includes('forbidden-tag'))
  assert.ok(externalRules.includes('forbidden-attribute'))

  const fragment = '<p class="external" style="color:#777777;background-color:#ffffff">直接文字</p>'
  const rules = lintWechatHtml(fragment).errors.map((error) => error.rule)
  for (const rule of ['forbidden-attribute', 'text-wrapping', 'contrast']) {
    assert.ok(rules.includes(rule), `${rule}: ${JSON.stringify(rules)}`)
  }

  const externalTable = '<table><tbody><tr><td style="border-bottom:1px solid #999999"><span>外部表格</span></td></tr></tbody></table>'
  const wrappedExternalTable = render(externalTable, { theme: 'default', ...PUBLISH_OPTIONS }).html
  assert.ok(lintWechatHtml(wrappedExternalTable).errors.some((error) => error.rule === 'table-cell-border-reset'))
})
