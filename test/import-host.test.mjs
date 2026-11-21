import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importArticleDocument } from '../plugin/host/importer.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-import-host-'))
}

function syntheticPage() {
  return `<!doctype html><html><head><title>合成文章</title></head><body><div id="js_content"><h1>标题</h1><p>一段普通正文。</p><p><a href="https://example.com/jump?tempkey=link-secret&poc_token=captcha-secret&target_url=https%3A%2F%2Fexample.com%2Fprivate%3Ftoken%3Dnested-secret&keep=1#fragment">链接</a></p><p><img data-src="/asset.png?tempkey=asset-secret&keep=1" alt="示例"></p><svg viewBox="0 0 10 10"><rect width="10" height="10"></rect></svg></div></body></html>`
}

test('URL导入新建并打开专业文档，素材本地化且来源不保留临时凭据', async () => {
  const cwd = workspace()
  const fetchImpl = async (url) => {
    if (String(url).includes('asset.png')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
    return new Response(syntheticPage(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  const result = await importArticleDocument({
    url: 'https://mp.weixin.qq.com/s?tempkey=secret&poc_token=page-secret&keep=1',
    out_path: 'imported.md',
  }, { cwd, sessionId: 'session-1', fetchImpl, lookup: publicLookup })
  assert.equal(result.title, '合成文章')
  assert.equal(result.sourceRef.includes('tempkey'), false)
  assert.match(result.sourceRef, /keep=1/)
  assert.equal(result.stats.assetsLocal, 1)
  assert.equal(result.lint.errors.filter((item) => /script|on\*|javascript/i.test(item.message || item)).length, 0)
  const markdown = fs.readFileSync(path.join(cwd, 'imported.md'), 'utf8')
  assert.match(markdown, /assets\/.+\.png/)
  assert.doesNotMatch(markdown, /tempkey=secret|asset-secret|link-secret|captcha-secret|nested-secret|page-secret/)
  assert.doesNotMatch(JSON.stringify(result), /tempkey=secret|asset-secret|link-secret|captcha-secret|nested-secret|page-secret/)
  const state = JSON.parse(fs.readFileSync(path.join(cwd, '.fishpai', 'state', `${result.key}.json`), 'utf8'))
  assert.equal(state.target, 'xiumi')
  assert.equal(state.xiumiSpec.body_size, 16)
})

test('公众号人机验证页明确失败且不建稿', async () => {
  const cwd = workspace()
  const fetchImpl = async (url) => {
    if (String(url).includes('/s/sample')) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=must-not-leak' },
      })
    }
    return new Response('<html><body><p>请完成安全验证</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  await assert.rejects(() => importArticleDocument({
    url: 'https://mp.weixin.qq.com/s/sample',
    out_path: 'captcha.md',
  }, { cwd, sessionId: 'session-1', fetchImpl, lookup: publicLookup }), (error) => {
    assert.match(error.message, /人机验证|复制 HTML/)
    assert.doesNotMatch(error.message, /must-not-leak|poc_token/)
    return true
  })
  assert.equal(fs.existsSync(path.join(cwd, 'captcha.md')), false)
})

test('目标文件已存在时拒绝覆盖', async () => {
  const cwd = workspace()
  fs.writeFileSync(path.join(cwd, 'existing.md'), '用户原文')
  await assert.rejects(() => importArticleDocument({ html: '<p>新内容</p>', out_path: 'existing.md' }, {
    cwd, sessionId: 'session-1', lookup: publicLookup,
  }), /为避免覆盖/)
  assert.equal(fs.readFileSync(path.join(cwd, 'existing.md'), 'utf8'), '用户原文')
})
