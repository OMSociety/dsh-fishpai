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
