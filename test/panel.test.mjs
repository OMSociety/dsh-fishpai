/**
 * 面板里的浏览器边界：剪贴板返回值与输入法组合事件。
 *
 * 只在测试构建里追加两个命名导出，运行的是真实 copyRich / Editor 函数；
 * React 与 DOM 都换成可观察的小桩，不复制一份业务实现。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PANEL_SRC = path.join(ROOT, 'client', 'panel.tsx')

const REACT_STUB = `
export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}]
export const useRef = (initial) => ({ current: initial })
export const useMemo = (fn) => fn()
export const useCallback = (fn) => fn()
export const useEffect = () => {}
export const useSyncExternalStore = () => { throw new Error('本测试不渲染 Panel 根组件') }
export const createElement = (type, props, ...children) => ({ type, props: { ...(props || {}), children } })
`

const RUNTIME_STUB = `
const element = (type, props, key) => ({ type, key, props: props || {} })
export const jsx = element
export const jsxs = element
export const Fragment = Symbol('Fragment')
`

const reactPlugin = {
  name: 'fishpai-react-stub',
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'stub:react', namespace: 'fp-react' }))
    b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'stub:jsx-runtime', namespace: 'fp-react' }))
    b.onLoad({ filter: /^stub:react$/, namespace: 'fp-react' }, () => ({ contents: REACT_STUB, loader: 'js' }))
    b.onLoad({ filter: /^stub:jsx-runtime$/, namespace: 'fp-react' }, () => ({ contents: RUNTIME_STUB, loader: 'js' }))
  },
}

const instrumentPanel = {
  name: 'fishpai-panel-test-export',
  setup(b) {
    b.onLoad({ filter: /panel\.tsx$/ }, async (args) => ({
      contents: `${await fs.promises.readFile(args.path, 'utf8')}\nexport { copyRich, Editor }\n`,
      loader: 'tsx',
      resolveDir: path.dirname(args.path),
    }))
  },
}

const result = await build({
  entryPoints: [PANEL_SRC],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  charset: 'utf8',
  plugins: [reactPlugin, instrumentPanel],
})
const { copyRich, Editor } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text, 'utf8').toString('base64')}`
)

function replaceGlobal(t, key, value) {
  const before = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  t.after(() => {
    if (before) Object.defineProperty(globalThis, key, before)
    else delete globalThis[key]
  })
}

function findElement(node, type) {
  if (!node || typeof node !== 'object') return null
  if (node.type === type) return node
  const children = node.props?.children
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type)
    if (found) return found
  }
  return null
}

test('copyRich：execCommand 返回 false 时拒绝，只有返回 true 才完成复制', async (t) => {
  let copyResult = false
  let copyCalls = 0
  let removed = 0
  const selection = { removeAllRanges() {}, addRange() {} }
  replaceGlobal(t, 'navigator', { clipboard: null })
  replaceGlobal(t, 'ClipboardItem', undefined)
  replaceGlobal(t, 'DOMParser', class {
    parseFromString() {
      return { body: { childNodes: [] } }
    }
  })
  replaceGlobal(t, 'window', { getSelection: () => selection })
  replaceGlobal(t, 'document', {
    createElement() {
      return {
        style: {},
        replaceChildren() {},
        remove() { removed += 1 },
      }
    },
    body: { appendChild() {} },
    createDocumentFragment() { return { appendChild() {} } },
    createRange() { return { selectNodeContents() {} } },
    execCommand(command) {
      assert.equal(command, 'copy')
      copyCalls += 1
      return copyResult
    },
  })

  await assert.rejects(copyRich('<p>正文</p>', '正文'), /复制/)
  assert.equal(copyCalls, 1)
  assert.equal(removed, 1, '失败也必须移除隐藏编辑容器')

  copyResult = true
  await copyRich('<p>正文</p>', '正文')
  assert.equal(copyCalls, 2)
  assert.equal(removed, 2)
})

test('Editor：输入法组合期间跳过回车续写和快捷键，组合结束后恢复', async (t) => {
  const changes = []
  let saves = 0
  const el = {
    value: '- 草稿',
    selectionStart: 4,
    selectionEnd: 4,
    focus() {},
    setSelectionRange(start, end) {
      this.selectionStart = start
      this.selectionEnd = end
    },
  }
  replaceGlobal(t, 'requestAnimationFrame', (fn) => fn())
  replaceGlobal(t, 'document', {
    execCommand() { return false },
    addEventListener() {},
    removeEventListener() {},
  })

  const tree = Editor({
    editorRef: { current: el },
    value: el.value,
    onChange: (text) => changes.push(text),
    onCaret() {},
    onSave: () => { saves += 1 },
    onCopy() {},
    upload: async () => ({ src: 'assets/a.png' }),
    toast() {},
    currentBlock: null,
    target: 'professional',
    onRefine() {},
  })
  const textarea = findElement(tree, 'textarea')
  assert.ok(textarea, '测试必须拿到真实编辑器的 keydown 入口')

  let prevented = 0
  textarea.props.onKeyDown({
    key: 'Enter',
    currentTarget: el,
    nativeEvent: { isComposing: true },
    preventDefault: () => { prevented += 1 },
  })
  assert.equal(prevented, 0, '候选词确认的回车必须交还给输入法')
  assert.equal(changes.length, 0, '组合期间不能续写列表')

  textarea.props.onKeyDown({
    key: 's',
    code: 'KeyS',
    ctrlKey: true,
    currentTarget: el,
    isComposing: true,
    nativeEvent: { isComposing: false },
    preventDefault: () => { prevented += 1 },
  })
  assert.equal(prevented, 0, '组合期间不能触发保存快捷键')
  assert.equal(saves, 0)

  textarea.props.onKeyDown({
    key: 'Enter',
    currentTarget: el,
    nativeEvent: { isComposing: false },
    preventDefault: () => { prevented += 1 },
  })
  assert.equal(prevented, 1, '组合结束后，普通回车仍由列表续写处理')
  assert.deepEqual(changes, ['- 草稿\n- '])
  assert.equal(saves, 0)
})
