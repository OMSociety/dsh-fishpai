import { randomUUID } from 'node:crypto'
import { BrowserEngine, LoginRequiredError } from './engine.mjs'
import { openWechatLogin, prepareWechat, saveWechatDraft, waitForWechatLogin } from './wechat.mjs'
import { openXiumiLogin, prepareXiumi, saveXiumiDraft, waitForXiumiLogin } from './xiumi.mjs'

const DEFAULT_ADAPTERS = {
  wechat: { openLogin: openWechatLogin, prepare: prepareWechat, waitForLogin: waitForWechatLogin, save: saveWechatDraft },
  xiumi: { openLogin: openXiumiLogin, prepare: prepareXiumi, waitForLogin: waitForXiumiLogin, save: saveXiumiDraft },
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function validateInput({ platform, title, author = '', html }) {
  if (platform !== 'wechat' && platform !== 'xiumi') throw new Error('platform 只支持 wechat / xiumi')
  if (typeof title !== 'string' || !title.trim() || title.length > 256) throw new Error('title 必须是 1–256 字符')
  if (typeof author !== 'string' || author.length > 128) throw new Error('author 必须是 128 字符以内的字符串')
  if (typeof html !== 'string' || !html.trim() || html.length > 4 * 1024 * 1024) throw new Error('html 不能为空且不能超过 4 MiB')
  if (/<\s*script\b/i.test(html)) throw new Error('发布 HTML 不允许包含 script')
  return { platform, title: title.trim(), author, html }
}

/** 浏览器只保存草稿；登录等待期间保持页面打开，不执行群发或风控规避。 */
export class PublishJobs {
  constructor({ getStores, engine = null, adapters = DEFAULT_ADAPTERS, loginTimeoutMs = 900000 } = {}) {
    this.getStores = getStores || (async () => null)
    this.engine = engine || new BrowserEngine()
    this.adapters = adapters
    this.loginTimeoutMs = loginTimeoutMs
    this.jobs = new Map()
    this.tasks = new Set()
    this.closed = false
  }

  list() {
    return [...this.jobs.values()].map((job) => clone(job))
  }

  status(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('发布 job 不存在')
    return clone(job)
  }

  update(id, patch) {
    const job = this.jobs.get(id)
    if (!job) throw new Error('发布 job 不存在')
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    return clone(job)
  }

  submit(input) {
    if (this.closed) throw new Error('发布任务队列已关闭')
    const data = validateInput(input)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.jobs.set(id, {
      id, platform: data.platform, title: data.title, status: 'queued', phase: 'queued', progress: 0,
      message: '发布任务已排队', result: null, error: null, createdAt: now, updatedAt: now,
    })
    const task = this.run(id, data).catch((error) => {
      this.update(id, { status: 'failed', phase: 'failed', message: error.message, error: { name: error.name, message: error.message } })
    }).finally(() => this.tasks.delete(task))
    this.tasks.add(task)
    return this.status(id)
  }

  async authTable() {
    const stores = await this.getStores()
    if (!stores?.auth) throw new Error('storageDomain 不可用，无法安全保存或读取登录态')
    return stores.auth.table('auth')
  }

  async run(id, input) {
    const adapter = this.adapters[input.platform]
    const auth = await this.authTable()
    const saved = auth.get(input.platform)
    this.update(id, { status: 'running', phase: 'launch', progress: 5, message: '正在启动发布浏览器' })
    const browser = await this.engine.launch({ headless: false, onDownload: (message) => this.update(id, { message }) })
    let context
    let page
    try {
      const state = saved?.storageState
      if (state !== undefined && (!state || typeof state !== 'object' || Array.isArray(state))) throw new Error('auth 域中的登录态损坏，请删除后重新登录')
      context = await browser.newContext(state ? { storageState: state } : {})
      page = await context.newPage()
      if (state) {
        try {
          await adapter.prepare(page)
        } catch (error) {
          if (!(error instanceof LoginRequiredError)) throw error
          this.update(id, { status: 'need-login', phase: 'login', progress: 20, message: error.message })
        }
      } else {
        await adapter.openLogin(page)
        this.update(id, { status: 'need-login', phase: 'login', progress: 20, message: `请在打开的浏览器中登录${input.platform === 'wechat' ? '微信公众平台' : '秀米'}，登录态仅写入用户级 auth 域` })
      }
      const current = this.jobs.get(id)
      if (current.status === 'need-login') {
        await adapter.waitForLogin(page, { timeoutMs: this.loginTimeoutMs })
        const storageState = await context.storageState()
        await auth.put(input.platform, { platform: input.platform, storageState, savedAt: new Date().toISOString() })
      }
      this.update(id, { status: 'running', phase: 'editor', progress: 55, message: '登录态已确认，正在打开编辑器' })
      await adapter.prepare(page)
      this.update(id, { phase: 'draft', progress: 75, message: '正在填写标题与正文，只保存草稿' })
      const result = await adapter.save({ context, page, ...input })
      this.update(id, { status: 'done', phase: 'done', progress: 100, message: '草稿已保存，请人工检查内容', result })
    } catch (error) {
      this.update(id, { status: 'failed', phase: 'failed', message: error.message, error: { name: error.name, message: error.message } })
    } finally {
      if (context) await context.close().catch(() => {})
      await browser.close().catch(() => {})
    }
  }

  async drain() {
    while (this.tasks.size) await Promise.allSettled([...this.tasks])
  }

  async close() {
    this.closed = true
    await this.drain()
  }
}
