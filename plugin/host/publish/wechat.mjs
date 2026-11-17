import { LoginRequiredError } from './engine.mjs'

export const HOME_URL = 'https://mp.weixin.qq.com'
export const MENU_TITLE = '文章'
export const LOGIN_MARKERS = ['图文消息', '素材库', '首页', '草稿箱', '发表记录']

async function pause(page, ms) {
  if (ms > 0) await page.waitForTimeout(ms)
}

export async function openWechatLogin(page, { loadDelay = 6000 } = {}) {
  await page.goto(HOME_URL, { waitUntil: 'commit', timeout: 30000 })
  await pause(page, loadDelay)
}

export async function prepareWechat(page, options = {}) {
  await openWechatLogin(page, options)
  if (!page.url().includes('/cgi-bin/home')) throw new LoginRequiredError('微信登录态无效或已过期，请在打开的浏览器中登录')
}

export async function waitForWechatLogin(page, { timeoutMs = 900000, pollMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (page.url().includes('/cgi-bin/home')) {
      for (const marker of LOGIN_MARKERS) {
        const matches = page.getByText(marker, { exact: false })
        const count = await matches.count()
        for (let index = 0; index < count; index += 1) {
          if (await matches.nth(index).isVisible()) return
        }
      }
    }
    await pause(page, pollMs)
  }
  throw new LoginRequiredError('等待微信登录超时，请重新发起发布')
}

async function fillField(page, selector, value) {
  await page.locator(selector).evaluate((element, text) => {
    element.value = text
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

/** 微信编辑器必须从首页菜单打开；深链不属于已验证链路。 */
export async function saveWechatDraft({ context, page, title, author = '', html, loadDelay = 8000, submitTimeoutMs = 40000 }) {
  await prepareWechat(page, { loadDelay: 3000 })
  const items = page.locator('.new-creation__menu .new-creation__menu-item')
  await items.first().waitFor({ state: 'visible', timeout: 40000 })
  const count = await items.count()
  let target = null
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index)
    const text = await item.locator('.new-creation__menu-title').innerText()
    if (text.includes(MENU_TITLE)) {
      target = item
      break
    }
  }
  if (!target) throw new Error('微信首页未找到「文章」新建菜单，请退回人工检查')
  const editorPromise = context.waitForEvent('page', { timeout: 40000 })
  await target.click()
  const editor = await editorPromise
  await editor.waitForLoadState('domcontentloaded', { timeout: 40000 })
  await pause(editor, loadDelay)
  await editor.waitForSelector('#title', { state: 'attached', timeout: 40000 })
  await editor.waitForSelector('#author', { state: 'attached', timeout: 40000 })
  await editor.waitForSelector('.rich_media_content .ProseMirror', { state: 'attached', timeout: 40000 })
  await fillField(editor, '#title', title)
  await fillField(editor, '#author', author)
  const body = editor.locator('.rich_media_content .ProseMirror')
  await body.evaluate((element) => { element.focus() })
  const inserted = await body.evaluate((element, value) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
    return document.execCommand('insertHTML', false, value)
  }, html)
  if (!inserted) throw new Error('微信正文注入未成功，请在已打开的编辑器中人工粘贴；当前不会强制点击保存')
  await editor.locator('#js_submit button').evaluate((element) => { element.click() })
  const deadline = Date.now() + submitTimeoutMs
  while (Date.now() < deadline) {
    const state = await editor.evaluate(() => {
      const button = document.querySelector('#js_submit button')
      return {
        appmsgid: new URL(location.href).searchParams.get('appmsgid'),
        loading: document.querySelector('#js_submit')?.classList.contains('btn_loading') || false,
        disabled: button?.disabled || false,
      }
    })
    if (state.appmsgid && !state.loading && !state.disabled) return { draftSaved: true, appmsgid: state.appmsgid, platform: 'wechat', url: editor.url() }
    await pause(editor, 1500)
  }
  throw new Error('微信草稿保存结果尚未确认，请人工检查草稿箱')
}
