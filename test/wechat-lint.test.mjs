import test from 'node:test'
import assert from 'node:assert/strict'
import { contrastRatio, lintWechatHtml, parseColor } from '../plugin/core/wechat-lint.mjs'

test('微信 lint：全内联且文本包裹的片段通过', () => {
  const result = lintWechatHtml('<section style="color:#333333;background-color:#ffffff"><p><span>正文</span></p></section>')
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('微信 lint：禁标签、属性、position、CSS 变量与 grid', () => {
  const html = '<style>p{color:red}</style><div id="x" class="y" style="position:relative;display:grid;--accent:red;color:var(--accent)"><span>字</span></div><link rel="stylesheet" href="https://example.com/a.css">'
  const rules = lintWechatHtml(html).errors.map((item) => item.rule)
  for (const rule of ['forbidden-tag', 'forbidden-attribute', 'position', 'grid', 'css-variable']) assert.ok(rules.includes(rule), rule)
  assert.ok(lintWechatHtml(html).errors.every((item) => item.evidence.includes('粘贴路径推论')))
})

test('微信 lint：全幅容器必须解除正文限宽，且不误报单边定位', () => {
  const source = '<section style="margin:0 -20px;max-width:100%"><span>整幅内容</span></section>'
  const result = lintWechatHtml(source)
  const fullBleed = result.errors.find((item) => item.rule === 'full-bleed-width')
  assert.ok(fullBleed)
  assert.equal(fullBleed.evidence, '微信临时预览粘贴路径实测')
  assert.deepEqual(lintWechatHtml('<section style="max-width:none;margin:0 -20px"><span>整幅内容</span></section>').errors, [])
  assert.deepEqual(lintWechatHtml('<section style="margin-left:-20px;margin-right:auto"><span>定位内容</span></section>').errors, [])
})

test('微信 lint：表格单元格先清默认边框再保留指定边线', () => {
  const source = '<table><tbody><tr><td style="border-top:2px solid #17213a"><span>栏目</span></td></tr></tbody></table>'
  const result = lintWechatHtml(source)
  const border = result.errors.find((item) => item.rule === 'table-cell-border-reset')
  assert.ok(border)
  assert.equal(border.evidence, '微信临时预览粘贴路径实测')
  assert.deepEqual(lintWechatHtml('<table><tbody><tr><td style="border:0;border-top:2px solid #17213a"><span>栏目</span></td></tr></tbody></table>').errors, [])
})

test('微信 lint：直接文本节点必须包裹', () => {
  const result = lintWechatHtml('<p>直接文字<strong>粗体</strong></p>')
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((item) => item.rule === 'text-wrapping'))
})

test('微信 lint：正文颜色对比度至少 4.5:1', () => {
  assert.equal(contrastRatio(parseColor('#777777'), parseColor('#ffffff')) < 4.5, true)
  const result = lintWechatHtml('<section style="color:#777777;background:#ffffff"><p><span>浅灰正文</span></p></section>')
  const contrast = result.errors.find((item) => item.rule === 'contrast')
  assert.ok(contrast)
  assert.equal(contrast.minimum, 4.5)
  assert.equal(lintWechatHtml('<p style="color:#595959"><span>合格正文</span></p>').ok, true)
})
