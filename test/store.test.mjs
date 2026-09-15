/**
 * 客户端状态机（client/store.ts）的时序测试。
 *
 * 为什么这里要单独搭一套 mock：这个文件测的全是「await 前后」的窗口——
 * 切文档前先落盘、载入期间用户敲的字不被覆盖、外部更新横幅在场时的保存口径。
 * 这些在真实面板里要靠「打字 → 恰好同时点按钮」的人肉时序，测不了也不稳定；
 * 把 api 换成桩（全局 `__fpStub`，每个用例自己塞行为）之后，时序完全可控，
 * 测的就是面板真正跑的那份 store 代码（esbuild 现场打包，不改源码）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE_SRC = path.join(ROOT, 'client', 'store.ts')

/** api 桩的源码：所有方法都转发到全局 `__fpStub` 上，没准备的调用直接大声报错。 */
const STUB_CODE = `
export class ConflictError extends Error {
  constructor(revision, markdown) {
    super('revision 冲突：服务端是 ' + revision)
    this.revision = revision
    this.markdown = markdown
  }
}
const need = (name) => (...args) => {
  const h = globalThis.__fpStub
  if (!h || typeof h[name] !== 'function') throw new Error('测试桩没有准备 ' + name)
  return h[name](...args)
}
export const api = {
  state: need('state'),
  themes: need('themes'),
  doc: need('doc'),
  save: need('save'),
  createDoc: need('createDoc'),
  activate: need('activate'),
  meta: need('meta'),
  clearTheme: need('clearTheme'),
  renderPreview: need('renderPreview'),
  renderPublish: need('renderPublish'),
  upload: need('upload'),
  notes: need('notes'),
  history: need('history'),
  tabOpened: need('tabOpened'),
  assetUrl: (sid, key, src) => '/asset/' + key + '/' + src,
}
`

const stubPlugin = {
  name: 'fishpai-api-stub',
  setup(b) {
    b.onResolve({ filter: /\.\/api$/ }, () => ({ path: 'stub:api', namespace: 'fp-stub' }))
    b.onLoad({ filter: /^stub:api$/, namespace: 'fp-stub' }, () => ({ contents: STUB_CODE, loader: 'js' }))
  },
}

const result = await build({
  entryPoints: [STORE_SRC],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2020',
  charset: 'utf8',
  plugins: [stubPlugin],
})
const { createFishpaiStore, buildSrcdoc } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text, 'utf8').toString('base64')}`
)

/** 给全局桩换一套行为。 */
const stub = (methods) => {
  globalThis.__fpStub = methods
}

const docPayload = (key, markdown, revision) => ({
  doc: { key, path: `${key}.md`, title: '测试文档', markdown, revision, updatedAt: 1, updatedBy: 'human', baseline: null },
  meta: { theme: 'default', color: null, font: 'sans', fontSize: '16px', footnotes: true, macCodeBlock: true, mobile: false },
  blocks: [],
  notes: [],
  placeholders: [],
  images: [],
  history: [],
})

const emptyPreview = () => ({
  html: '',
  themeName: '默认公众号',
  linkCount: 0,
  hasCode: false,
  blocks: [],
  notes: [],
  placeholders: [],
  images: [],
})

/** 造一个已经载入好 `key`（正文 `markdown`、版本 `revision`）的 store。 */
async function readyStore(sid, key, markdown, revision) {
  let release = null
  stub({
    activate: async () => ({ ok: true }),
    doc: () => new Promise((resolve) => { release = resolve }),
    renderPreview: async () => emptyPreview(),
  })
  const store = createFishpaiStore(sid)
  const pending = store.actions.openDocByKey(key)
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve()
  if (!release) throw new Error('测试自身写错了：api.doc 没被调用')
  release(docPayload(key, markdown, revision))
  await pending
  return store
}

test('loadDoc：fetch 期间用户敲的字不被服务端版本整片覆盖', async () => {
  // 载入请求挂起，趁它没回来时打一个字——回来后正文必须仍是用户的那一份
  let release = null
  stub({
    activate: async () => ({ ok: true }),
    doc: () => new Promise((resolve) => { release = resolve }),
    renderPreview: async () => emptyPreview(),
  })
  const store = createFishpaiStore('s1')
  const pending = store.actions.openDocByKey('k1')
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve()
  if (!release) throw new Error('测试自身写错了：api.doc 没被调用')

  store.actions.setMarkdown('用户在 fetch 期间敲的字')
  release(docPayload('k1', '服务端的正文', 3))
  await pending

  const st = store.getSnapshot()
  assert.equal(st.docKey, 'k1')
  assert.equal(st.markdown, '用户在 fetch 期间敲的字', '用户的输入要留住')
  assert.equal(st.dirty, true)
  assert.equal(st.revision, 3, '版本号照服务端的来')
  store.dispose()
})

test('新建文档：有未保存的改动时先落盘，保存失败就不新建（字不丢）', async () => {
  const store = await readyStore('s1', 'k1', '服务端的正文', 3)
  store.actions.setMarkdown('未保存的字')

  let created = false
  stub({
    save: async () => {
      throw new Error('网络断了')
    },
    createDoc: async () => {
      created = true
      return { docKey: 'k2', path: 'k2.md' }
    },
  })
  await store.actions.createDoc()

  assert.equal(created, false, '保存失败时不应新建文档')
  const st = store.getSnapshot()
  assert.equal(st.markdown, '未保存的字', '用户的字要留住')
  assert.equal(st.docKey, 'k1', '文档不该被切走')
  store.dispose()
})

test('新建文档：保存成功后正常切到新文档', async () => {
  const store = await readyStore('s1', 'k1', '服务端的正文', 3)
  store.actions.setMarkdown('改过的字')

  let savedRev = null
  let created = false
  stub({
    save: async (sid, key, md, rev) => {
      savedRev = rev
      return { ok: true, revision: 4, updatedAt: 2 }
    },
    createDoc: async () => {
      created = true
      return { docKey: 'k2', path: 'k2.md' }
    },
    doc: async () => docPayload('k2', '', 1),
    renderPreview: async () => emptyPreview(),
  })
  await store.actions.createDoc()

  assert.equal(savedRev, 3, '保存用的应是载入时的版本号')
  assert.equal(created, true)
  assert.equal(store.getSnapshot().docKey, 'k2')
  store.dispose()
})

test('「最近打开」切文档：同样先落盘，保存失败就停在手上的文档', async () => {
  const store = await readyStore('s1', 'k1', '服务端的正文', 3)
  store.actions.setMarkdown('未保存的字')

  let activated = false
  stub({
    save: async () => {
      throw new Error('网络断了')
    },
    activate: async () => {
      activated = true
      return { ok: true, docKey: 'k2' }
    },
  })
  await store.actions.openDocByKey('k2')

  assert.equal(activated, false, '保存失败时不应切走')
  assert.equal(store.getSnapshot().markdown, '未保存的字')
  assert.equal(store.getSnapshot().docKey, 'k1')
  store.dispose()
})

test('flush：「外部更新」在场时用服务端版本号写（就是「保留我的」）', async () => {
  const store = await readyStore('s1', 'k1', '服务端的正文', 3)
  store.actions.setMarkdown('我的草稿')
  // 轮询发现服务端已经是 rev 5，本地还停在 3 → 挂外部横幅
  await store.actions.onActiveDoc('k1', 5)
  assert.notEqual(store.getSnapshot().external, null, '前置条件：外部横幅该挂出来')

  let savedRev = null
  stub({
    save: async (sid, key, md, rev) => {
      savedRev = rev
      return { ok: true, revision: rev + 1, updatedAt: 3 }
    },
  })
  await store.actions.flush()

  assert.equal(savedRev, 5, '应采用服务端报回来的版本号，而不是过期的 3')
  assert.equal(store.getSnapshot().external, null, '横幅该收掉')
  store.dispose()
})

test('自动保存：外部横幅在场时跳过，不把提示换成语义重叠的冲突条', async () => {
  const store = await readyStore('s1', 'k1', '服务端的正文', 3)
  store.actions.setMarkdown('我的草稿')
  await store.actions.onActiveDoc('k1', 5)

  let saveCalls = 0
  stub({
    save: async () => {
      saveCalls += 1
      return { ok: true, revision: 6, updatedAt: 4 }
    },
  })
  // 等过 800ms 的保存防抖
  await new Promise((resolve) => setTimeout(resolve, 1100))

  assert.equal(saveCalls, 0, 'external 在场时不应发起必然 409 的保存')
  assert.notEqual(store.getSnapshot().external, null, '横幅仍在，等用户点按钮')
  store.dispose()
})

test('buildSrcdoc：hljs 配色注入预览 iframe，不注入时代码块是黑的', () => {
  // 预览 iframe 是沙箱 srcdoc，里面没有 highlight.js 样式表：宿主把同一份色表生成 CSS
  // 随预览响应下发，这里要保证它真的落进 srcdoc，且只在给了的时候才出现
  const html = '<pre><code><span class="hljs-keyword">const</span> x = 1;</code></pre>'
  const withCss = buildSrcdoc(html, {}, '.hljs-keyword{color: rgb(198, 120, 221);}')
  assert.match(withCss, /\.hljs-keyword\{color: rgb\(198, 120, 221\);\}/, '配色要进 srcdoc 的样式表')
  assert.match(withCss, /<span class="hljs-keyword">/, '预览正文本身仍是 class（内联在 publish 那条路上做）')

  const noCss = buildSrcdoc(html)
  assert.doesNotMatch(noCss, /\.hljs-keyword\{/, '没给配色时不该凭空出现')
  assert.match(noCss, /<span class="hljs-keyword">/, '正文不受影响')
})
