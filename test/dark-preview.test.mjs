/**
 * 深色预览：微信公众平台 Dark Mode 转换算法的字符串级移植，以及 /render 的预览视图接入。
 * 阈值依据 wechatjs/mp-darkmode v1.2.2（commit 65fb6e4）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DARK_CONSTANTS, toWechatDark, darkenCss, darkPaletteFor,
  parseColorToken, formatColor, adjustBackground, adjustText, perceivedBrightness,
} from '../plugin/core/dark-preview.mjs'
import { lintWechatHtml } from '../plugin/core/wechat-lint.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import * as store from '../plugin/host/store.mjs'

const bg = (hex) => formatColor(adjustBackground(parseColorToken(hex)))
const brightness = (hex) => perceivedBrightness(parseColorToken(hex))

test('深色：常量与上游 constant.js 一致', () => {
  assert.equal(DARK_CONSTANTS.DEFAULT_DARK_BGCOLOR, '#191919')
  assert.equal(DARK_CONSTANTS.DEFAULT_DARK_TEXTCOLOR, '#a3a3a3')
  assert.equal(DARK_CONSTANTS.WHITE_LIKE_COLOR_BRIGHTNESS, 250)
  assert.equal(DARK_CONSTANTS.MAX_LIMIT_BGCOLOR_BRIGHTNESS, 190)
  assert.equal(DARK_CONSTANTS.MIN_LIMIT_OFFSET_BRIGHTNESS, 65)
})

test('深色：白底翻成深色底，亮灰压到感知亮度 190，过暗背景提亮', () => {
  assert.equal(bg('#ffffff'), '#191919')
  assert.equal(bg('#f5f5f5'), '#232323', '纯灰浅色底取反明度')
  assert.ok(Math.abs(brightness(bg('#f5f6f8')) - 190) < 1, '带色相的浅色底压到感知亮度 190')
  assert.ok(brightness(bg('#050505')) > brightness('#050505'), '过暗背景提亮')
  assert.equal(bg('#3f63d7'), '#3f63d7', '中等亮度的彩色背景保持原色')
})

test('深色：深色字在深色底上提亮，亮度差达到阈值', () => {
  const base = parseColorToken('#191919')
  for (const hex of ['#1f2329', '#3f4650']) {
    const next = adjustText(parseColorToken(hex), base)
    assert.ok(perceivedBrightness(next) - perceivedBrightness(base) >= 65, `${hex} 与深色底的亮度差达到 65`)
  }
  assert.equal(formatColor(adjustText(parseColorToken('#ffffff'), base)), '#ffffff', '接近白色的字保持高亮')
})

test('深色：HTML 变换只改颜色值，结构与其它声明逐字保留', () => {
  const html = '<section style="background-color: #ffffff; padding: 20px;"><p style="color: #3f4650; font-size: 16px;">正文</p></section>'
  const out = toWechatDark(html)
  assert.match(out, /background-color: #191919/)
  assert.match(out, /padding: 20px/)
  assert.match(out, /font-size: 16px/)
  assert.doesNotMatch(out, /class=|id=|<style/)
  assert.equal(out.replace(/style="[^"]*"/g, ''), html.replace(/style="[^"]*"/g, ''))
})

test('深色：SVG 整块原样保留', () => {
  const svg = '<svg viewBox="0 0 10 10"><rect fill="#ffffff"/><text fill="#222">t</text></svg>'
  assert.equal(toWechatDark(`<p>${svg}</p>`), `<p>${svg}</p>`)
})

test('深色：渐变背景压成纯色，背景图节点保留原色', () => {
  const gradient = toWechatDark('<section style="background: linear-gradient(90deg, #ffffff, #f5f6f8)"><span>x</span></section>')
  const colors = [...gradient.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0])
  assert.ok(colors.length >= 2 && new Set(colors.slice(0, 2)).size === 1, '渐变两端为同一纯色')
  const image = '<p style="background:url(data:image/png;base64,AA);color:#333">x</p>'
  assert.equal(toWechatDark(image), image, 'data URI 的分号与原色逐字保留')
})

test('深色：darkenCss 映射代码块配色并保留选择器', () => {
  const out = darkenCss('.hljs{color:#24292e;background:#fff}.hljs-keyword{font-weight:bold}')
  assert.match(out, /^\.hljs\{/)
  assert.match(out, /background: #191919/)
  assert.match(out, /\.hljs-keyword\{font-weight:bold\}/)
})

test('深色：darkPaletteFor 给出专业规格的深色文字/背景对', () => {
  const palette = darkPaletteFor({ page_bg: '#ffffff', card_bg: '#f5f6f8', body_color: '#3f4650', title_color: '#1f2329', muted_color: '#6b7280' })
  assert.equal(palette.page.background, '#191919')
  assert.ok(brightness(palette.body.color) - brightness(palette.page.background) >= 65)
})

test('深色诊断：独立放在 dark 段，粘贴约束结论保持原样', () => {
  const html = '<section style="background-color:#ffffff"><span style="color:#2a2a2a">a</span></section><span style="background:linear-gradient(#f00,#00f);-webkit-background-clip:text">g</span><svg><text fill="#222">t</text></svg>'
  const result = lintWechatHtml(html)
  const rules = result.dark.warnings.map((item) => item.rule)
  assert.ok(rules.includes('dark-gradient-text'))
  assert.ok(rules.includes('dark-svg-text'))
  assert.ok(result.dark.warnings.every((item) => item.severity === 'warning' && /真机效果以读者设备为准/.test(item.evidence)))
  assert.ok(result.errors.every((item) => !item.rule.startsWith('dark-')), 'errors 只含粘贴约束')
})

test('/render：dark 只作用于预览；复制形态与普通请求逐字节相同', async () => {
  const cwd = store.canonicalCwd(fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-dark-')))
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: '# 标题\n\n正文 `code`\n\n```js\nconst a = 1\n```\n', by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const call = (body) => new Promise((resolve) => {
    const payload = { sessionId: 's1', docKey: opened.key, ...body }
    const req = {
      method: 'POST',
      url: '/fishpai/api/render',
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' },
      on(event, callback) {
        if (event === 'data') callback(Buffer.from(JSON.stringify(payload), 'utf8'))
        if (event === 'end') callback()
        return this
      },
    }
    const res = {
      writeHead(status) { this.status = status },
      end(chunk) { resolve({ status: this.status, json: JSON.parse(String(chunk || 'null')) }) },
    }
    handler(req, res, { principal: { kind: 'owner' } })
  })
  for (const target of ['quick', 'professional']) {
    const light = await call({ target, mode: 'preview' })
    const dark = await call({ target, mode: 'preview', dark: true })
    assert.equal(light.status, 200)
    assert.equal(dark.json.dark, true)
    assert.notEqual(dark.json.html, light.json.html, `${target} 深色预览重算颜色`)
    const plain = await call({ target, mode: 'publish' })
    const flagged = await call({ target, mode: 'publish', dark: true })
    assert.equal(flagged.json.html, plain.json.html, `${target} 复制形态与普通请求一致`)
  }
})
