import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { PublishJobs } from '../plugin/host/publish/jobs.mjs'
import { BrowserEngine, LoginRequiredError, playwrightCliPath } from '../plugin/host/publish/engine.mjs'
import { saveXiumiDraft } from '../plugin/host/publish/xiumi.mjs'
import { HOME_URL, saveWechatDraft } from '../plugin/host/publish/wechat.mjs'
import { memoryStores } from './memory-stores.mjs'
import { createApiHandler } from '../plugin/host/routes.mjs'
import { registerTools } from '../plugin/host/tools.mjs'
import * as store from '../plugin/host/store.mjs'

function adapter(overrides = {}) {
  return {
    openLogin: async (page) => { page.loginOpened = true },
    prepare: async (page) => { page.prepareCount = (page.prepareCount || 0) + 1 },
    waitForLogin: async (page) => { page.loggedIn = true },
    save: async ({ page, title }) => ({ draftSaved: true, title, prepared: page.prepareCount }),
    ...overrides,
  }
}

function browserFixture() {
  const page = { url: () => 'https://example.test/editor' }
  const context = {
    page,
    async storageState() { return { cookies: [], origins: [] } },
    async newPage() { return page },
    closed: false,
    async close() { this.closed = true },
  }
  const browser = {
    context,
    closed: false,
    async newContext() { return context },
    async close() { this.closed = true },
  }
  return { browser, context, page, engine: { async launch() { return browser } } }
}

function jobsFixture(overrides = {}) {
  const stores = memoryStores()
  const fixture = browserFixture()
  const jobs = new PublishJobs({
    getStores: async () => stores,
    engine: fixture.engine,
    adapters: { wechat: adapter(overrides), xiumi: adapter(overrides) },
  })
  return { ...fixture, stores, jobs }
}

const input = { platform: 'wechat', title: '标题', author: '作者', html: '<section><p>正文</p></section>' }

test('发布任务立即返回 queued，完成后只回传草稿结果', async () => {
  const { jobs, browser, context, stores } = jobsFixture()
  const job = jobs.submit(input)
  assert.equal(job.status, 'queued')
  assert.ok(job.id)
  assert.equal(jobs.status(job.id).status, 'queued')
  await jobs.drain()
  const done = jobs.status(job.id)
  assert.equal(done.status, 'done')
  assert.equal(done.result.draftSaved, true)
  assert.equal(done.error, null)
  assert.equal(context.closed, true)
  assert.equal(browser.closed, true)
  await stores.close()
})

test('登录等待暴露 need-login，确认后 storageState 只写 auth 域', async () => {
  let release
  let seen
  const loginSeen = new Promise((resolve) => { seen = resolve })
  const { jobs, page, stores } = jobsFixture({
    openLogin: async (p) => { p.loginOpened = true; seen() },
    waitForLogin: async () => new Promise((resolve) => { release = resolve }),
  })
  const job = jobs.submit(input)
  await loginSeen
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(jobs.status(job.id).status, 'need-login')
  assert.equal(page.loginOpened, true)
  release()
  await jobs.drain()
  assert.equal(jobs.status(job.id).status, 'done')
  const saved = stores.auth.table('auth').get('wechat')
  assert.equal(saved.platform, 'wechat')
  assert.deepEqual(saved.storageState, { cookies: [], origins: [] })
  await stores.close()
})

test('失效登录态与保存异常都进入可查询的终态', async () => {
  let prepareCount = 0
  const first = jobsFixture({
    prepare: async () => { prepareCount += 1; if (prepareCount === 1) throw new LoginRequiredError('登录态失效') },
    waitForLogin: async () => {},
  })
  await first.stores.auth.table('auth').put('wechat', { platform: 'wechat', storageState: { cookies: [], origins: [] }, savedAt: 'x' })
  const loginJob = first.jobs.submit(input)
  await first.jobs.drain()
  assert.equal(first.jobs.status(loginJob.id).status, 'done')
  await first.stores.close()

  const second = jobsFixture({ save: async () => { throw new Error('保存结果未确认') } })
  const failed = second.jobs.submit(input)
  await second.jobs.drain()
  assert.equal(second.jobs.status(failed.id).status, 'failed')
  assert.equal(second.jobs.status(failed.id).error.message, '保存结果未确认')
  await second.stores.close()
})

test('引擎按 Chrome → Windows Edge → 数据区 Chromium 解析，并当场告知下载', async () => {
  const calls = []
  let installed = ''
  const chromium = { async launch(options) { calls.push(options); if (calls.length < 3) throw new Error('missing'); return { options } } }
  const engine = new BrowserEngine({
    dataDir: path.join(os.tmpdir(), 'fishpai-engine-test'), playwright: chromium, platform: 'win32',
    install: async (dir) => { installed = dir }, executable: () => installed ? path.join(os.tmpdir(), 'fake-chromium.exe') : null,
  })
  let notice = ''
  const browser = await engine.launch({ onDownload: (message) => { notice = message } })
  assert.deepEqual(calls.slice(0, 2).map((x) => x.channel), ['chrome', 'msedge'])
  assert.equal(calls[2].executablePath.endsWith('fake-chromium.exe'), true)
  assert.ok(installed.endsWith(path.join('fishpai-engine-test', 'browsers')))
  assert.match(notice, /170 MB/)
  assert.match(notice, /用户插件数据区/)
  assert.equal(browser.options.executablePath.endsWith('fake-chromium.exe'), true)
})

test('引擎能定位 playwright-core 的实际 CLI 入口', () => {
  assert.equal(path.basename(playwrightCliPath()), 'cli.js')
  assert.equal(fs.existsSync(playwrightCliPath()), true)
})

test('秀米只填写内容并点击可见保存按钮', async () => {
  let html = ''
  let inputEvents = 0
  let clicked = 0
  const area = {
    async waitFor() {}, async evaluate(fn, value) {
      if (String(fn).includes('innerHTML')) html = value
      else inputEvents += 1
    },
  }
  const button = { async isVisible() { return true }, async click() { clicked += 1 } }
  const page = {
    locator(selector) {
      if (selector.includes('请输入图文的标题')) return { fill: async () => {} }
      assert.ok(selector.includes('contenteditable'))
      return { first: () => area }
    },
    getByText() { return { async count() { return 1 }, nth: () => button } },
    async waitForTimeout() {}, url: () => 'https://xiumi.us/studio/v5/paper',
  }
  const result = await saveXiumiDraft({ page, title: '标题', html: '<p>正文</p>', settleDelay: 0 })
  assert.equal(html, '<p>正文</p>')
  assert.equal(inputEvents, 1)
  assert.equal(clicked, 1)
  assert.equal(result.draftSaved, true)
})

test('微信首次保存建立草稿，随后直存原始 HTML 并按新 data_seq 重试', async () => {
  let menuClicked = 0
  let insertedHtml = ''
  const directBodies = []
  const saveRequest = {
    postData: () => 'data_seq=1&fingerprint=fp&title0=old',
    url: () => 'https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=update&type=77&token=old&lang=zh_CN',
    response: async () => ({ json: async () => ({ data_seq: '2' }) }),
  }
  const editor = {
    async waitForLoadState() {}, async waitForTimeout() {}, async waitForSelector() {},
    async waitForRequest() { return saveRequest },
    locator(selector) {
      return { async evaluate(fn, value) { if (String(fn).includes('execCommand')) { insertedHtml = value; return true } } }
    },
    async evaluate(fn, arg) {
      if (String(fn).includes('fetch(')) {
        directBodies.push(arg.body)
        if (directBodies.length === 1) return { status: 200, data: { base_resp: { ret: 0 }, msg: '当前草稿非最新内容，请重新进入页面', data_seq: '9' } }
        return { status: 200, data: { base_resp: { ret: 0 }, msg: '', data_seq: '10' } }
      }
      return { appmsgid: '12345', loading: false, disabled: false }
    },
    url: () => 'https://mp.weixin.qq.com/cgi-bin/appmsg?appmsgid=12345&token=current',
  }
  const title = { innerText: async () => '文章' }
  const item = { locator: () => title, click: async () => { menuClicked += 1 } }
  const items = { first: () => ({ waitFor: async () => {} }), count: async () => 1, nth: () => item }
  const home = {
    url: () => `${HOME_URL}/cgi-bin/home`, goto: async (url) => { assert.equal(url, HOME_URL) },
    waitForTimeout: async () => {}, locator: (selector) => { assert.match(selector, /new-creation__menu/); return items },
  }
  const context = { waitForEvent: async (name) => { assert.equal(name, 'page'); return editor } }
  const result = await saveWechatDraft({ context, page: home, title: '标题', author: '作者', html: '<section><svg></svg></section>', loadDelay: 0 })
  assert.equal(menuClicked, 1)
  assert.equal(insertedHtml, '<section><svg></svg></section>')
  assert.equal(result.appmsgid, '12345')
  assert.equal(result.saveMode, 'direct')
  assert.equal(directBodies.length, 2)
  const first = new URLSearchParams(directBodies[0])
  const retry = new URLSearchParams(directBodies[1])
  assert.equal(first.get('data_seq'), '2')
  assert.equal(retry.get('data_seq'), '9')
  for (const fields of [first, retry]) {
    assert.equal(fields.get('content0'), '<section><svg></svg></section>')
    assert.equal(fields.get('title0'), '标题')
    assert.equal(fields.get('author0'), '作者')
    assert.equal(fields.get('AppMsgId'), '12345')
    assert.equal(fields.get('token'), 'current')
  }
})

test('工具与 HTTP 路由使用同一个异步 job id 契约', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-publish-'))
  const opened = store.createDoc({ cwd, title: '发布' })
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const job = { id: 'job-1', platform: 'wechat', status: 'queued', phase: 'queued', progress: 0, message: 'queued', result: null, error: null, createdAt: 'now', updatedAt: 'now' }
  const publish = { submit: () => job, status: (id) => { assert.equal(id, 'job-1'); return job } }
  const tools = []
  registerTools({ tools: { register: (tool) => { tools.push(tool); return () => {} } } }, { resolveCwd: () => cwd, log: () => {}, publish })
  const result = await tools.find((x) => x.name === 'fishpai_publish').execute(input)
  assert.equal(result.isError, false)
  assert.match(result.text, /job-1/)
  const handler = createApiHandler({ resolveCwd: () => cwd, log: () => {}, publish })
  const server = createServer((req, res) => handler(req, res))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const created = await fetch(`${origin}/fishpai/api/publish`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's', docKey: opened.key, ...input }) })
  assert.equal(created.status, 202)
  assert.deepEqual(await created.json(), { ok: true, jobId: 'job-1', status: 'queued' })
  const status = await fetch(`${origin}/fishpai/api/publish/status?sessionId=s&jobId=job-1`, { headers: { origin } })
  const statusBody = await status.json()
  assert.equal(status.status, 200, JSON.stringify(statusBody))
  assert.equal(statusBody.job.id, 'job-1')
})

test('POST /auth 查询与清除登录态，Cookie 不回流面板', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-auth-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const stores = memoryStores()
  await stores.auth.table('auth').put('wechat', { platform: 'wechat', storageState: { cookies: [{ name: 'secret' }] }, savedAt: 1700000000000 })
  const handler = createApiHandler({ resolveCwd: () => cwd, log: () => {}, getStores: async () => stores })
  const server = createServer((req, res) => handler(req, res))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (body) => fetch(`${origin}/fishpai/api/auth`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 's', ...body }) })

  const loggedIn = await (await post({ platform: 'wechat', action: 'status' })).json()
  assert.equal(loggedIn.loggedIn, true)
  assert.equal(loggedIn.savedAt, 1700000000000)
  assert.ok(!JSON.stringify(loggedIn).includes('secret'), 'Cookie 内容绝不回传到面板')

  const notLogged = await (await post({ platform: 'xiumi', action: 'status' })).json()
  assert.equal(notLogged.loggedIn, false)
  assert.equal(notLogged.savedAt, null)

  const cleared = await (await post({ platform: 'wechat', action: 'clear' })).json()
  assert.equal(cleared.loggedIn, false)
  assert.equal(cleared.savedAt, null)
  const after = await (await post({ platform: 'wechat', action: 'status' })).json()
  assert.equal(after.loggedIn, false, '清除后再查应为未登录')

  const badPlatform = await post({ platform: 'hacker', action: 'status' })
  assert.equal(badPlatform.status, 400)
  const badAction = await post({ platform: 'wechat', action: 'unknown' })
  assert.equal(badAction.status, 400)
})
