import { LoginRequiredError } from './engine.mjs'

export const EDITOR_URL = 'https://xiumi.us/studio/v5/paper'
export const TITLE_INPUT = "input[placeholder='请输入图文的标题']"
export const CONTENT_AREA = "div[contenteditable='true']"
export const LOGIN_MARKERS = ['我的图文', '图文素材', '我的秀米']

async function pause(page, ms) {
  if (ms > 0) await page.waitForTimeout(ms)
}

export async function openXiumiLogin(page, { loadDelay = 6000 } = {}) {
  await page.goto(EDITOR_URL, { waitUntil: 'commit', timeout: 30000 })
  await pause(page, loadDelay)
}

export async function prepareXiumi(page, options = {}) {
  await openXiumiLogin(page, options)
  try {
    await page.waitForSelector(TITLE_INPUT, { state: 'visible', timeout: 15000 })
  } catch {
    throw new LoginRequiredError('秀米登录态无效或已过期，请在打开的浏览器中登录')
  }
}

export async function waitForXiumiLogin(page, { timeoutMs = 900000, pollMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const marker of LOGIN_MARKERS) {
      const matches = page.getByText(marker, { exact: false })
      const count = await matches.count()
      for (let index = 0; index < count; index += 1) {
        if (await matches.nth(index).isVisible()) return
      }
    }
    await pause(page, pollMs)
  }
  throw new LoginRequiredError('等待秀米登录超时，请重新发起发布')
}

export async function saveXiumiDraft({ page, title, html, settleDelay = 1500 }) {
  const titleInput = page.locator(TITLE_INPUT)
  await titleInput.fill(title)
  const area = page.locator(CONTENT_AREA).first()
  await area.waitFor({ state: 'visible', timeout: 15000 })
  await area.evaluate((element, value) => { element.innerHTML = value }, html)
  await area.evaluate((element) => element.dispatchEvent(new Event('input', { bubbles: true })))
  const buttons = page.getByText('保存', { exact: false })
  const count = await buttons.count()
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    if (await button.isVisible()) {
      await button.click()
      await pause(page, settleDelay)
      return { draftSaved: true, platform: 'xiumi', url: page.url() }
    }
  }
  throw new Error('秀米编辑器中找不到可见的「保存」按钮，请退回人工检查')
}
