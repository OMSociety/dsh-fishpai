/**
 * 宿主侧测试：路径守卫、revision 守卫、baseline/history、批注、块级补丁、HTTP 路由、工具契约。
 *
 * 这些是"绝不覆盖人的手改""不越出工作目录"两条红线的可执行证明。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as store from '../plugin/host/store.mjs'
import * as custom from '../plugin/host/custom-theme.mjs'
import { themes } from '../plugin/core/runtime.mjs'
import { applyPatches } from '../plugin/core/patch.mjs'
import { splitBlocks } from '../plugin/core/markdown.mjs'
import { createApiHandler, sameOrigin } from '../plugin/host/routes.mjs'
import { registerTools } from '../plugin/host/tools.mjs'

function tmpWorkspace() {
  // 与生产路径同一口径：resolveCwd 会把工作目录规范化成真实路径
  return store.canonicalCwd(fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-')))
}

const ARTICLE = '# 示例标题\n\n这是第一段示例文本。\n\n## 示例小节\n\n这是第二段示例文本。\n'

// ── 路径守卫 ───────────────────────────────────────────────────

test('路径守卫：允许工作目录内的 .md，拒绝越界与非白名单扩展名', () => {
  const cwd = tmpWorkspace()
  assert.equal(store.resolveInCwd(cwd, 'a.md'), path.join(cwd, 'a.md'))
  assert.equal(store.resolveInCwd(cwd, path.join('docs', 'b.markdown')), path.join(cwd, 'docs', 'b.markdown'))
  assert.throws(() => store.resolveInCwd(cwd, '../outside.md'), /越界/)
  assert.throws(() => store.resolveInCwd(cwd, path.join('..', '..', 'evil.md')), /越界/)
  assert.throws(() => store.resolveInCwd(cwd, 'page.html'), /扩展名/) // 文档只放行 .md/.markdown/.txt
  assert.throws(() => store.resolveInCwd(cwd, 'shell.exe'), /扩展名/)
  assert.equal(store.resolveInCwd(cwd, 'notes.txt'), path.join(cwd, 'notes.txt'))
  assert.equal(store.resolveInCwd(cwd, 'pic.png', { exts: ['.png'] }), path.join(cwd, 'pic.png'))
  assert.throws(() => store.resolveInCwd(cwd, ''), /不能为空/)
})

test('路径容错：只写名字时补默认扩展名，写了扩展名（哪怕是别的）就原样交给守卫', () => {
  const cwd = tmpWorkspace()
  assert.equal(store.withDefaultExt('草稿', '.md'), '草稿.md')
  assert.equal(store.withDefaultExt('docs/草稿', '.md'), 'docs/草稿.md')
  assert.equal(store.withDefaultExt('a.MD', '.md'), 'a.MD', '已经写了扩展名就不动它（守卫自己折大小写判断）')
  assert.equal(store.withDefaultExt('a.notes', '.md'), 'a.notes')
  assert.equal(store.withDefaultExt('docs/', '.md'), 'docs/', '结尾是分隔符：像是想指目录，交给守卫报错')
  assert.equal(store.withDefaultExt('   ', '.md'), '')
  assert.equal(store.withDefaultExt('page', '.html'), 'page.html')
  // 补出来的路径照样要过白名单，不是"绕过守卫的另一个入口"
  assert.equal(store.resolveInCwd(cwd, store.withDefaultExt('草稿', '.md')), path.join(cwd, '草稿.md'))
})

test('路径守卫：链接指向外部时被拒（目录 junction 与文件级链接走的是不同分支）', (t) => {
  const cwd = tmpWorkspace()
  const outside = tmpWorkspace()
  fs.writeFileSync(path.join(outside, 'secret.md'), 'secret\n')
  try {
    fs.symlinkSync(outside, path.join(cwd, 'link'), 'junction')
  } catch {
    // 显式 skip，不再 `return`：以前那样等于把断言静默吞掉——测试空跑也算过，
    // 在没有权限建链接的环境里既没有信号、也没有保护。
    t.skip('本平台不允许建链接，越界用例无法执行')
    return
  }
  assert.throws(() => store.resolveInCwd(cwd, path.join('link', 'secret.md')), /越界/)
  // 文件级链接是另一条分支（第一次探测就命中 abs 本身，不靠向上找祖先），单独钉一条
  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(cwd, 'file-link.md'), 'file')
  assert.throws(() => store.resolveInCwd(cwd, 'file-link.md'), /越界/)
  assert.throws(() => store.openDoc({ cwd, docPath: 'file-link.md', by: 'ai' }), /越界/)
})

test('路径守卫：NTFS 备用数据流（ADS）路径被拒，正常路径不受影响', (t) => {
  const cwd = tmpWorkspace()
  if (process.platform !== 'win32') {
    t.skip('ADS 只在 Windows 的 NTFS 上存在')
    return
  }
  // `notes.md:stream.txt` 的 extname 是 `.txt`，能骗过扩展名白名单，
  // 写进去的内容挂在 notes.md 的隐藏流里（readdir 看不见）——"文件系统里有、列表里没有"的黑户。
  assert.throws(() => store.resolveInCwd(cwd, 'notes.md:stream.txt'), /非法/)
  assert.throws(() => store.openDoc({ cwd, docPath: 'notes.md:stream.txt', by: 'ai' }), /非法/)
  assert.equal(store.resolveInCwd(cwd, 'notes.md'), path.join(cwd, 'notes.md'))
})

// ── 文档生命周期 ───────────────────────────────────────────────

test('新建文档：写文件 + 建 baseline + 建索引，revision 从 1 开始', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'article.md', markdown: ARTICLE, by: 'ai' })
  assert.equal(opened.created, true)
  assert.equal(opened.state.revision, 1)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), ARTICLE)
  assert.ok(opened.state.baseline && opened.state.baseline.file)
  assert.equal(store.baselineContent(cwd, opened.state), ARTICLE)
  assert.equal(store.listDocs(cwd).length, 1)
  assert.ok(fs.existsSync(path.join(cwd, '.fishpai', '.gitignore')), '应自建 .fishpai/.gitignore')
})

test('.fishpai/.gitignore 忽略运行时状态与自定义主题；已存在的文件只补缺的行', () => {
  const fresh = tmpWorkspace()
  store.ensureFishpaiLayout(fresh)
  const text = fs.readFileSync(path.join(fresh, '.fishpai', '.gitignore'), 'utf8')
  assert.ok(['state/', 'history/', 'theme.json'].every((line) => text.split(/\r?\n/).includes(line)), 'state / history / theme.json 都要忽略')

  // 老目录（在 theme.json 落盘之前就建过）：用户写的内容一字不动，只追加缺的行
  const old = tmpWorkspace()
  const ignore = path.join(old, '.fishpai', '.gitignore')
  fs.mkdirSync(path.dirname(ignore), { recursive: true })
  fs.writeFileSync(ignore, '# 我的注释\nstate/\n', 'utf8')
  store.ensureFishpaiLayout(old)
  const patched = fs.readFileSync(ignore, 'utf8')
  assert.ok(patched.startsWith('# 我的注释\nstate/\n'), '用户已有的行不动')
  assert.ok(patched.includes('theme.json'), '补上后来加的 theme.json')
  store.ensureFishpaiLayout(old)
  assert.equal(fs.readFileSync(ignore, 'utf8'), patched, '再跑一次是空操作')
})

test('打开已存在的文档不会覆盖内容，并明确告诉调用方 markdown 被忽略', () => {
  const cwd = tmpWorkspace()
  fs.writeFileSync(path.join(cwd, 'exists.md'), ARTICLE)
  const opened = store.openDoc({ cwd, docPath: 'exists.md', markdown: '完全不同的内容', by: 'ai' })
  assert.equal(opened.created, false)
  assert.equal(opened.markdownIgnored, true)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), ARTICLE)
})

test('接管既有文档时不编造 baseline：模型还没写过，就不该假装"人什么都没改"', () => {
  const cwd = tmpWorkspace()
  fs.writeFileSync(path.join(cwd, 'exists.md'), ARTICLE)
  const opened = store.openDoc({ cwd, docPath: 'exists.md', by: 'ai' })
  assert.equal(opened.state.baseline, null, '接管既有文件时 baseline 必须为空')

  // 人接着改一笔，baseline 仍为空——模型的第一次 read 会明确说"还没有基线"
  const saved = store.saveDoc({ cwd, docPath: 'exists.md', markdown: `${ARTICLE}\n人加了一句。\n`, baseRevision: 1, by: 'human' })
  assert.equal(saved.ok, true)
  assert.equal(saved.state.baseline, null)

  // 模型写一次之后才有基线，其后人的改动才会变成 diff
  const ai = store.saveDoc({ cwd, docPath: 'exists.md', markdown: `${ARTICLE}\n人加了一句。\n模型也加了一句。\n`, baseRevision: 2, by: 'ai' })
  assert.equal(ai.ok, true)
  assert.ok(ai.state.baseline, '模型写入后就该有基线了')
  assert.equal(store.baselineContent(cwd, ai.state), `${ARTICLE}\n人加了一句。\n模型也加了一句。\n`)
})

test('docKey：Windows 上大小写视为同一份状态（其它平台区分大小写）', () => {
  const cwd = tmpWorkspace()
  const upper = path.join(cwd, 'Notes.md')
  const lower = path.join(cwd, 'notes.md')
  const same = store.docKey(upper) === store.docKey(lower)
  assert.equal(same, process.platform === 'win32', `platform=${process.platform} 时大小写归一应当 ${process.platform === 'win32'}`)
  assert.equal(store.docKey(upper), store.docKey(path.join(cwd, '.', 'Notes.md')), '同一路径的不同写法必须同一个 key')
})

test('图片清单：会说清楚"哪些能内嵌、哪些粘过去要手动上传"', async () => {
  const { listLocalImages, listRemoteImages } = await import('../plugin/host/assets.mjs')
  const cwd = tmpWorkspace()
  fs.writeFileSync(path.join(cwd, 'ok.png'), Buffer.alloc(1024))
  fs.writeFileSync(path.join(cwd, 'huge.png'), Buffer.alloc(64))
  const markdown = [
    '![好图](ok.png)',
    '![大图](huge.png)',
    '![缺图](nope.png)',
    '![越界](../outside.png)',
    '![外链](https://example.com/a.png)',
  ].join('\n\n')

  const local = listLocalImages({ markdown, cwd, docPath: path.join(cwd, 'a.md'), maxBytes: 32 })
  assert.deepEqual(
    local.map((i) => [path.basename(i.src), i.status, i.embed]),
    [
      ['ok.png', 'too-large', false], // 1024 字节 > maxBytes(32)
      ['huge.png', 'too-large', false],
      ['nope.png', 'missing', false],
      ['outside.png', 'outside', false],
    ],
  )
  const generous = listLocalImages({ markdown, cwd, docPath: path.join(cwd, 'a.md'), maxBytes: 4096 })
  assert.equal(generous.find((i) => path.basename(i.src) === 'ok.png').embed, true, '没超上限就该能内嵌')
  assert.equal(generous.find((i) => path.basename(i.src) === 'huge.png').embed, true)
  assert.equal(generous.find((i) => path.basename(i.src) === 'nope.png').status, 'missing')
  assert.equal(generous.find((i) => path.basename(i.src) === 'outside.png').status, 'outside')

  // 外链图单独一类：它们才是微信会拦的那种
  const remote = listRemoteImages({ markdown })
  assert.deepEqual(remote.map((i) => i.src), ['https://example.com/a.png'])
})

// ── 粘贴进来的图片（POST /upload）──────────────────────────────

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

test('粘贴图片：落在文档同级的 assets/ 里，回相对路径，重名不覆盖', () => {
  const cwd = tmpWorkspace()
  const docPath = path.join(cwd, 'notes', 'article.md')
  const first = store.saveAsset({ cwd, docPath, name: '微信截图.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  assert.equal(first.src, `assets/${path.basename(first.path)}`, 'src 是相对文档目录的写法')
  assert.ok(first.src.startsWith('assets/'), `src 应当是 assets/ 下的相对路径，实际 ${first.src}`)
  assert.equal(path.dirname(first.path), path.join(cwd, 'notes', 'assets'), '落在文档同级的 assets/ 里')
  assert.deepEqual(fs.readFileSync(first.path), PNG_BYTES, '内容要一字不差')
  assert.equal(first.bytes, PNG_BYTES.length)
  // 文件名带得出来路（时间戳 + 原名的可读部分），但不采信客户端给的路径
  const base = path.basename(first.path)
  assert.match(base, /^\d{8}-\d{6}-微信截图\.png$/)
  assert.ok(!base.includes('..') && !base.includes('/') && !base.includes('\\'))

  // 同一秒内再来一张同名：加序号，绝不覆盖
  const second = store.saveAsset({ cwd, docPath, name: '微信截图.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  assert.notEqual(second.path, first.path)
  assert.deepEqual(fs.readFileSync(first.path), PNG_BYTES, '先存的那张不能被后来的盖掉')

  // 客户端给的名字是路径也不参与拼接
  const sneaky = store.saveAsset({ cwd, docPath, name: '../../../evil.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  assert.equal(path.dirname(sneaky.path), path.join(cwd, 'notes', 'assets'))
  // 剪贴板里的通用名换成 paste（image.png 这种等于没有名字）
  const generic = store.saveAsset({ cwd, docPath, name: 'image.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  assert.match(path.basename(generic.path), /-paste\.png$/)
})

test('粘贴图片的边界：超限、非图片、空内容、扩展名不合法都当场拒绝', () => {
  const cwd = tmpWorkspace()
  const docPath = path.join(cwd, 'a.md')
  const png = PNG_BYTES.toString('base64')
  assert.throws(() => store.saveAsset({ cwd, docPath, name: 'x.png', mime: 'image/png', data: '' }), /内容为空/)
  assert.throws(
    () => store.saveAsset({ cwd, docPath, name: 'x.png', mime: 'image/png', data: Buffer.alloc(store.MAX_ASSET_BYTES + 1024).toString('base64') }),
    /超过 5MB 上限/,
  )
  assert.throws(() => store.saveAsset({ cwd, docPath, name: 'x.exe', mime: 'application/octet-stream', data: png }), /只支持/)
  // 文档路径本身仍要过守卫：越界的"文档"不许成为写文件的入口
  assert.throws(() => store.saveAsset({ cwd, docPath: path.join('..', '..', 'evil.md'), mime: 'image/png', data: png }), /越界/)
  // 没有任何图片落盘
  assert.equal(fs.existsSync(path.join(cwd, 'assets')), false)
})

test('粘贴进来的图与复制/导出那条路对得上：能被内嵌成 base64', async () => {
  const { makeImageResolver, listLocalImages } = await import('../plugin/host/assets.mjs')
  const cwd = tmpWorkspace()
  const docPath = path.join(cwd, 'a.md')
  const saved = store.saveAsset({ cwd, docPath, name: '图.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  const markdown = `正文\n\n![](${saved.src})\n`
  fs.writeFileSync(docPath, markdown)
  const listed = listLocalImages({ markdown, cwd, docPath })
  assert.equal(listed[0].src, saved.src)
  assert.equal(listed[0].embed, true, '自己存进来的图当然要能内嵌')
  const resolver = makeImageResolver({ cwd, docPath })
  assert.match(resolver(saved.src), /^data:image\/png;base64,/)
})

test('revision 守卫：baseRevision 不匹配就拒绝，且盘上内容不变', () => {
  const cwd = tmpWorkspace()
  store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const okSave = store.saveDoc({ cwd, docPath: 'a.md', markdown: `${ARTICLE}\n人加了一句。\n`, baseRevision: 1, by: 'human' })
  assert.equal(okSave.ok, true)
  assert.equal(okSave.state.revision, 2)

  const stale = store.saveDoc({ cwd, docPath: 'a.md', markdown: '想把人的改动盖掉', baseRevision: 1, by: 'ai' })
  assert.equal(stale.ok, false)
  assert.equal(stale.conflict, true)
  assert.equal(stale.revision, 2)
  assert.match(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), /人加了一句/)
})

test('revision 守卫：**缺** baseRevision 不等于强制覆盖（存储层自己也要挡住）', () => {
  const cwd = tmpWorkspace()
  store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.saveDoc({ cwd, docPath: 'a.md', markdown: `${ARTICLE}\n人的手改。\n`, baseRevision: 1, by: 'human' })
  const human = fs.readFileSync(path.join(cwd, 'a.md'), 'utf8')

  // 若把守卫写成"有版本才比对"，不传 baseRevision 就能连续覆盖人的手改，而现有用例一条也抓不住
  // （`Number(undefined)` 是 NaN，连"版本号非法"都识别不出来），所以这里逐个钉住"拿不出合法版本号"的各种形态。
  for (const bad of [undefined, null, NaN, 'abc', {}]) {
    const res = store.saveDoc({ cwd, docPath: 'a.md', markdown: '模型静默覆盖。\n', baseRevision: bad, by: 'ai' })
    assert.equal(res.ok, false, `baseRevision=${String(bad)} 必须被拒`)
    assert.equal(res.conflict, true)
    assert.equal(res.revision, 2, '回带的应当是服务端当前版本，冲突流程据此继续')
    assert.equal(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), human, '被拒的写入一个字都不许碰正文')
  }
})

test('baseline 只在 AI 写入时前移：人的手改会成为下一次 read 的 diff', () => {
  const cwd = tmpWorkspace()
  store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const beforeRead = store.readState(cwd, store.docKey(path.join(cwd, 'a.md')))
  assert.equal(beforeRead.baseline.rev, 1)

  store.saveDoc({ cwd, docPath: 'a.md', markdown: ARTICLE.replace('这是第一段示例文本。', '这是改过的示例文本。'), baseRevision: 1, by: 'human' })
  const afterHuman = store.readState(cwd, store.docKey(path.join(cwd, 'a.md')))
  assert.equal(afterHuman.baseline.rev, 1, '人的手改不移动 baseline')
  assert.equal(store.baselineContent(cwd, afterHuman), ARTICLE)

  store.saveDoc({ cwd, docPath: 'a.md', markdown: 'AI 重写过的一版。', baseRevision: afterHuman.revision, by: 'ai' })
  const afterAi = store.readState(cwd, store.docKey(path.join(cwd, 'a.md')))
  assert.equal(afterAi.baseline.rev, afterAi.revision, 'AI 写入后 baseline 前移')
  assert.equal(store.baselineContent(cwd, afterAi), 'AI 重写过的一版。')
})

test('历史：每次写入留快照，可按 revision 回滚', () => {
  const cwd = tmpWorkspace()
  store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.saveDoc({ cwd, docPath: 'a.md', markdown: '第二版', baseRevision: 1, by: 'human' })
  store.saveDoc({ cwd, docPath: 'a.md', markdown: '第三版', baseRevision: 2, by: 'human' })
  const key = store.docKey(path.join(cwd, 'a.md'))
  const state = store.readState(cwd, key)
  assert.ok(state.history.length >= 2, '应有历史快照')

  const first = store.readHistoryEntry(cwd, key, 1)
  assert.equal(first.content, ARTICLE)
  const restored = store.saveDoc({ cwd, docPath: 'a.md', markdown: first.content, baseRevision: state.revision, by: 'human' })
  assert.equal(restored.ok, true)
  assert.equal(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), ARTICLE)
})

test('批注增删改与打开请求', () => {
  const cwd = tmpWorkspace()
  store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const note = store.addNote({ cwd, docPath: 'a.md', note: { blockId: 'x', quote: '示例', text: '这里加个二维码' } })
  assert.ok(note.id)
  const updated = store.updateNote({ cwd, docPath: 'a.md', id: note.id, patch: { resolved: true } })
  assert.equal(updated.resolved, true)
  assert.equal(store.removeNote({ cwd, docPath: 'a.md', id: note.id }), true)
  assert.equal(store.removeNote({ cwd, docPath: 'a.md', id: note.id }), false)

  store.requestOpen({ cwd, docPath: 'a.md', sessionId: 's1' })
  const state = store.readState(cwd, store.docKey(path.join(cwd, 'a.md')))
  assert.ok(store.pendingOpenRequest(state, 's1'))
  assert.equal(store.pendingOpenRequest(state, 's2'), null)
  assert.equal(store.consumeOpenRequest({ cwd, docPath: 'a.md', sessionId: 's1' }), true)
  assert.equal(store.pendingOpenRequest(store.readState(cwd, store.docKey(path.join(cwd, 'a.md'))), 's1'), null)
})

// ── 块级补丁 ───────────────────────────────────────────────────

test('块级补丁：只改指定块，其余字节原样保留', () => {
  const blocks = splitBlocks(ARTICLE)
  const target = blocks.find((b) => b.text.includes('这是第一段示例文本'))
  const result = applyPatches(ARTICLE, blocks, [{ block_id: target.id, op: 'replace', markdown: '这是改过的示例文本。' }])
  assert.deepEqual(result.errors, [])
  assert.equal(result.applied.length, 1)
  assert.equal(result.markdown.includes('这是改过的示例文本。'), true)
  assert.equal(result.markdown.includes('## 示例小节'), true, '其它块应原样保留')
  assert.equal(ARTICLE.includes('## 示例小节'), true)
})

test('块级补丁：insert_after 与 delete', () => {
  const blocks = splitBlocks(ARTICLE)
  const heading = blocks.find((b) => b.kind === 'heading' && b.text.startsWith('##'))
  const inserted = applyPatches(ARTICLE, blocks, [
    { block_id: heading.id, op: 'insert_after', markdown: '\n这是插入的示例文本。\n' },
  ])
  assert.deepEqual(inserted.errors, [])
  assert.match(inserted.markdown, /## 示例小节\n\n这是插入的示例文本。\n\n这是第二段示例文本。/)

  const para = blocks.find((b) => b.text.includes('这是第二段示例文本'))
  const deleted = applyPatches(ARTICLE, blocks, [{ block_id: para.id, op: 'delete' }])
  assert.deepEqual(deleted.errors, [])
  assert.equal(deleted.markdown.includes('这是第二段示例文本'), false)
  assert.equal(deleted.markdown.includes('## 示例小节'), true)
})

test('块级补丁：找不到的块给出可读错误而不是乱改', () => {
  const blocks = splitBlocks(ARTICLE)
  const result = applyPatches(ARTICLE, blocks, [{ block_id: 'nope', op: 'replace', markdown: 'x' }])
  assert.equal(result.applied.length, 0)
  assert.match(result.errors[0], /找不到块/)
  assert.equal(result.markdown, ARTICLE)
})

test('块级补丁：多个补丁从下往上应用，行号不会互相顶偏', () => {
  const blocks = splitBlocks(ARTICLE)
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  const result = applyPatches(ARTICLE, blocks, [
    { block_id: first.id, op: 'replace', markdown: '# 换了个标题' },
    { block_id: last.id, op: 'replace', markdown: '改过的结尾。' },
  ])
  assert.deepEqual(result.errors, [])
  assert.match(result.markdown, /^# 换了个标题\n/)
  assert.match(result.markdown, /改过的结尾。\n$/)
  assert.match(result.markdown, /## 示例小节/)
})

test('块级补丁：replace 保住块尾的分隔空行，后面的块不会被吞掉', () => {
  // 块的行范围含末尾那个空行（块与块的分隔符）。replace 若把它一起吃掉，
  // 下一块会被 markdown 的"懒延续"并进列表/段落，而人下一轮再改那个被并大的块时，
  // **被吞掉的块就被整段删掉**（踩过：改一次列表项，吃掉了文末的「项目地址」两行）。
  const doc = '第一段。\n\n1. 甲\n2. 乙\n\n**项目地址：**\nexample.com\n'
  const before = splitBlocks(doc)
  assert.equal(before.length, 3, '应当是 段落 / 列表 / 段落 三块')
  assert.equal(before[1].kind, 'list')

  const once = applyPatches(doc, before, [{ block_id: before[1].id, op: 'replace', markdown: '1. 丙' }])
  assert.deepEqual(once.errors, [])
  const after = splitBlocks(once.markdown)
  assert.equal(after.length, 3, '替换列表后仍应是三块（分隔空行必须补回来）')
  assert.equal(after[2].kind, 'paragraph')
  assert.match(after[2].text, /项目地址/)
  assert.match(once.markdown, /\n\n\*\*项目地址：\*\*\n/, '列表与地址之间要留一个空行')

  // 第二轮：再改一次列表（这次改的是替换后的新块 id），地址仍不能被吃掉
  const twice = applyPatches(once.markdown, after, [{ block_id: after[1].id, op: 'replace', markdown: '1. 丁\n2. 戊' }])
  assert.deepEqual(twice.errors, [])
  assert.match(twice.markdown, /项目地址/, '第二次 replace 不许吃掉后面的块')
  assert.match(twice.markdown, /example\.com/)
  assert.equal(splitBlocks(twice.markdown).length, 3)
})

test('块级补丁：insert_after 插入的新块与前后都隔开（不然并进相邻段）', () => {
  // 段落的 map 不含它后面的分隔空行；插入文本若不自带空行，两边都必须补上，
  // 否则 markdown 的"懒延续"把新块并进相邻段——模型以为加了段落，实际只加了一行。
  const mid = '## 小节\n\n这是第一段。\n\n这是第二段。\n'
  const blocks = splitBlocks(mid)
  const out = applyPatches(mid, blocks, [
    { block_id: blocks.find((b) => b.text.includes('这是第一段')).id, op: 'insert_after', markdown: '这是插入的新段。' },
  ])
  assert.deepEqual(out.errors, [])
  assert.equal(splitBlocks(out.markdown).length, 4, '应当多出一个块')
  assert.match(out.markdown, /这是第一段。\n\n这是插入的新段。\n\n这是第二段。/, '前后都要恰好一个空行')
  // 插入文本自带前导/尾随空行时不重复补
  const selfBlank = applyPatches(mid, blocks, [
    { block_id: blocks.find((b) => b.text.includes('这是第一段')).id, op: 'insert_after', markdown: '\n这是插入的新段。\n' },
  ])
  assert.deepEqual(selfBlank.errors, [])
  assert.doesNotMatch(selfBlank.markdown, /\n\n\n/, '不许出现连续两个空行')
  // 插在文末
  const tail = applyPatches(mid, blocks, [
    { block_id: blocks[blocks.length - 1].id, op: 'insert_after', markdown: '插在文末。' },
  ])
  assert.deepEqual(tail.errors, [])
  assert.equal(splitBlocks(tail.markdown).length, 4)
  assert.match(tail.markdown, /这是第二段。\n\n插在文末。/)
  // 列表的 map 含分隔行：插在列表后，新块要落在分隔行之后
  const listDoc = '第一段。\n\n1. 甲\n2. 乙\n\n**项目地址：**\nexample.com\n'
  const lb = splitBlocks(listDoc)
  const lo = applyPatches(listDoc, lb, [{ block_id: lb[1].id, op: 'insert_after', markdown: '插在列表后。' }])
  assert.deepEqual(lo.errors, [])
  assert.equal(splitBlocks(lo.markdown).length, 4)
  assert.match(lo.markdown, /2\. 乙\n\n插在列表后。\n\n\*\*项目地址/)
})

test('块级补丁：CRLF 文档不吞分隔行、不混排行尾', () => {
  // Windows 上用记事本/别的编辑器存的 .md 常是 CRLF：split('\n') 会把 \r 留在行尾，
  // 于是「空行」是 '\r' 而非 ''——所有空行判据失灵，replace 会吞掉块尾分隔行，
  // 下一块被并进列表（正是上一条测试在 LF 下防的故障），补丁文本还会把文档变成 CRLF/LF 混排。
  const doc = '第一段。\r\n\r\n1. 甲\r\n2. 乙\r\n\r\n**项目地址：**\r\nexample.com\r\n'
  const before = splitBlocks(doc)
  assert.equal(before.length, 3)

  const once = applyPatches(doc, before, [{ block_id: before[1].id, op: 'replace', markdown: '1. 丙' }])
  assert.deepEqual(once.errors, [])
  assert.equal(splitBlocks(once.markdown).length, 3, 'CRLF 下替换列表后仍应是三块')
  assert.match(once.markdown, /项目地址/, '后面的块不许被吃掉')
  assert.doesNotMatch(once.markdown, /[^\r]\n/, '整篇仍应是纯 CRLF，不许混入裸 LF')

  // insert_after 同样要保持 CRLF 与块边界
  const inserted = applyPatches(once.markdown, splitBlocks(once.markdown), [
    { block_id: splitBlocks(once.markdown)[1].id, op: 'insert_after', markdown: '插在列表后。' },
  ])
  assert.deepEqual(inserted.errors, [])
  assert.equal(splitBlocks(inserted.markdown).length, 4)
  assert.doesNotMatch(inserted.markdown, /[^\r]\n/, '插入后仍是纯 CRLF')
})

// ── HTTP 路由 ──────────────────────────────────────────────────

test('同源守卫：跨站与伪造 Origin 一律拒绝', () => {
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:3080' } }), true)
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } }), true)
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:3080', origin: 'https://evil.example' } }), false)
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }), false)
  // `Origin: null` 只可能来自沙箱 iframe / data: 文档，是不可信上下文，不能当"没有 Origin"
  assert.equal(sameOrigin({ headers: { host: '127.0.0.1:3080', origin: 'null' } }), false)
  assert.equal(sameOrigin({ headers: {} }), false)
})

/** 最小 req/res 桩，够跑通路由分支。`chunks` 可以指定分块；`failAfter` 注入一次流错误。 */
function callRoute(handler, { method, url, body, raw, chunks, emitError = false, headers = {} }) {
  const hasBody = raw !== undefined || body !== undefined || chunks !== undefined
  const payload = chunks !== undefined ? chunks : raw !== undefined ? [raw] : body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url,
    headers: {
      host: '127.0.0.1:3080',
      origin: 'http://127.0.0.1:3080',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    on(event, cb) {
      if (event === 'data') {
        if (emitError) return this
        for (const p of payload) cb(p)
      }
      if (event === 'error' && emitError) cb(new Error('socket hang up'))
      if (event === 'end') {
        if (emitError) return this
        cb()
      }
      return this
    },
  }
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      body: '',
      writeHead(code, h) {
        this.statusCode = code
        this.headers = h || {}
      },
      end(chunk) {
        // 图片响应是 Buffer：留一份原始字节，别只用字符串形态（那会把二进制读坏）
        this.raw = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk ? String(chunk) : '', 'utf8')
        this.body = this.raw.toString('utf8')
        resolve({ status: this.statusCode, headers: this.headers, json: tryParse(this.body), raw: this.raw })
      },
    }
    handler(req, res)
  })
}

function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

test('路由：只认 docKey，路径穿越与未知 docKey 都被挡', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const unknown = await callRoute(handler, { method: 'GET', url: '/fishpai/api/doc?sessionId=s1&docKey=deadbeef' })
  assert.equal(unknown.status, 400)
  assert.match(unknown.json.error, /没有这个文档/)

  const evil = await callRoute(handler, { method: 'GET', url: '/fishpai/api/doc?sessionId=s1&docKey=../../etc/passwd' })
  assert.equal(evil.status, 400)

  const noSession = await callRoute(handler, { method: 'GET', url: '/fishpai/api/doc' })
  assert.equal(noSession.status, 400)
  assert.match(noSession.json.error, /sessionId/)

  const crossSite = await callRoute(handler, { method: 'GET', url: '/fishpai/api/state?sessionId=s1', headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(crossSite.status, 403)
})

test('路由：doc 返回块/批注/占位；PUT 冲突返回 409 与最新文本', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=s1&docKey=${opened.key}` })
  assert.equal(doc.status, 200)
  assert.ok(doc.json.blocks.length >= 3)
  assert.equal(doc.json.doc.markdown, ARTICLE)

  const good = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    body: { sessionId: 's1', docKey: opened.key, markdown: `${ARTICLE}\n人写的结尾。\n`, baseRevision: 1 },
  })
  assert.equal(good.status, 200)
  assert.equal(good.json.revision, 2)

  const conflict = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    body: { sessionId: 's1', docKey: opened.key, markdown: 'AI 想覆盖', baseRevision: 1 },
  })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.json.conflict, true)
  assert.match(conflict.json.markdown, /人写的结尾/)

  const notJson = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    body: { sessionId: 's1', docKey: opened.key, markdown: 'x', baseRevision: 2 },
    headers: { 'content-type': 'text/plain' },
  })
  assert.equal(notJson.status, 415)
})

test('路由：render 预览带块锚点，publish 不带且与 core 一致', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const preview = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'preview' },
  })
  assert.equal(preview.status, 200)
  assert.match(preview.json.html, /<fp-block data-b="/)
  assert.ok(preview.json.blocks.length >= 3)

  // 预览回带的必须是"面板要显示的一整套当前正文"：块 + 批注锚点 + 行内占位 + 图片，
  // 缺一个面板就只能在"保存 + 重载"之后才看得到自己刚写的东西。
  fs.writeFileSync(
    path.join(cwd, 'pic.png'),
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  )
  const edited = `${ARTICLE}\n![图](./pic.png)\n\n<!-- 鱼排: 这里补一句 -->\n`
  const live = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, markdown: edited, mode: 'preview' },
  })
  assert.equal(live.status, 200)
  for (const field of ['blocks', 'notes', 'placeholders', 'images']) {
    assert.ok(field in live.json, `预览响应应当带上 ${field}`)
  }
  // 关键：跟着**传进去的 markdown** 走，不是磁盘上那份（磁盘上还没有这段占位）
  assert.equal(live.json.placeholders.length, 1)
  assert.match(live.json.placeholders[0].text, /补一句/)
  assert.equal(live.json.images.length, 1)
  assert.equal(live.json.images[0].embed, true)
  assert.equal(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), ARTICLE, '预览不该动磁盘上的文档')

  const publish = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'publish' },
  })
  assert.equal(publish.status, 200)
  assert.doesNotMatch(publish.json.html, /<fp-block/)
  assert.equal(publish.json.themeName, '默认公众号')
  // publish 只管"粘进公众号的那份 HTML"，不该顺手回带面板状态
  assert.equal(publish.json.blocks, undefined)
  assert.equal(publish.json.placeholders, undefined)
})

test('路由：面板自己新建空白文档（不编造 baseline），POST /active 能切换当前文档', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const created = await callRoute(handler, { method: 'POST', url: '/fishpai/api/doc', body: { sessionId: 's1' } })
  assert.equal(created.status, 200)
  const newKey = created.json.docKey
  assert.ok(newKey && newKey !== opened.key)
  assert.equal(path.dirname(created.json.path), path.join(cwd, '.fishpai', 'docs'), '落在 .fishpai/docs 下')
  assert.equal(fs.readFileSync(created.json.path, 'utf8'), '# 未命名\n')

  const state = store.readState(cwd, newKey)
  assert.equal(state.updatedBy, 'human')
  assert.equal(state.baseline, null, '模型还没写过，就不该编造一个"上次写入的版本"')

  // 同名再来一篇：各占一个文件，不互相覆盖
  const second = await callRoute(handler, { method: 'POST', url: '/fishpai/api/doc', body: { sessionId: 's1', title: '未命名' } })
  assert.equal(second.status, 200)
  assert.notEqual(second.json.path, created.json.path)

  const st = await callRoute(handler, { method: 'GET', url: '/fishpai/api/state?sessionId=s1' })
  assert.equal(st.json.active.key, second.json.docKey, '新建后应当自动切到新那篇')
  assert.ok(st.json.docs.length >= 3, '三篇都应当出现在「最近打开」清单里')

  const back = await callRoute(handler, { method: 'POST', url: '/fishpai/api/active', body: { sessionId: 's1', docKey: opened.key } })
  assert.equal(back.status, 200)
  const st2 = await callRoute(handler, { method: 'GET', url: '/fishpai/api/state?sessionId=s1' })
  assert.equal(st2.json.active.key, opened.key, 'POST /active 应当把当前文档切回去')
  assert.equal(st2.json.openRequest, null, '切换文档不该顺手造出打开请求')

  const bogus = await callRoute(handler, { method: 'POST', url: '/fishpai/api/active', body: { sessionId: 's1', docKey: 'deadbeef' } })
  assert.equal(bogus.status, 400)
  assert.match(bogus.json.error, /没有这个文档/)
})

test('微信结构兼容层只走复制/导出：publish 包 span，preview 不包', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const publish = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'publish' },
  })
  assert.equal(publish.status, 200)
  // 微信的结构校验用「内容高度 ÷ 行框矩形数」估行高，含行内元素的段落会被误判成行高过小；
  // 把文字包进 span（块级元素不再有直接文字子节点）就不命中——这条只该出现在复制/导出产物里。
  assert.match(publish.json.html, /<span>这是第一段示例文本/, '复制/导出产物应当把文字包进 span')

  const preview = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, mode: 'preview' },
  })
  assert.equal(preview.status, 200)
  assert.doesNotMatch(preview.json.html, /<span>/, '预览不加兼容层（那段 HTML 不进微信）')
})

test('微信底色兼容层只走复制/导出：publish 把 background 拆成长写，preview 原样', async () => {
  const RICH = '# 标题\n\n> 引用一段\n\n| 概念 | 说明 |\n| --- | --- |\n| 示例概念 | 示例说明 |\n'
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: RICH, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const render = (mode) => callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, mode } })

  // 微信的安全过滤按属性名过：`background` 简写不在名单里 → 引用块的框、表头底色粘过去会整条丢
  const publish = await render('publish')
  assert.equal(publish.status, 200)
  assert.match(publish.json.html, /background-color:/, '复制/导出的产物必须用长写')
  assert.doesNotMatch(publish.json.html, /(^|[;"\s])background\s*:/, '复制/导出的产物里不该再有裸的 background 简写')

  const preview = await render('preview')
  assert.equal(preview.status, 200)
  assert.match(preview.json.html, /(^|[;"\s])background\s*:/, '预览保持与站点一致的原始形态')
})

test('面板开关的判据由渲染结果给出：linkCount / hasCode 随预览一起回带', async () => {
  const cwd = tmpWorkspace()
  // 故意用没有协议的裸域名 + 缩进式代码块：这两类正是"面板自己猜"会猜错的
  const markdown = '看 github.com/OMSociety/dsh-fishpai 这个仓库。\n\n段落\n\n    缩进式代码块\n'
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const preview = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, mode: 'preview' } })
  assert.equal(preview.status, 200)
  assert.equal(preview.json.linkCount, 1, '裸域名也算链接（linkify 会把它变成 <a>）')
  assert.equal(preview.json.hasCode, true, '缩进式代码块也算代码块')
  assert.match(preview.json.html, /参考资料/, '有链接就一定有「参考资料」——开关必须能点')

  const plain = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, markdown: '只有正文，没有链接也没有代码。', mode: 'preview' } })
  assert.equal(plain.json.linkCount, 0)
  assert.equal(plain.json.hasCode, false)

  // 关掉「脚注」之后 linkCount 必须照实（还是 1）。
  // 若写成 `opts.footnotes === false ? 0 : …`：面板拿 linkCount > 0 判断开关能不能点，
  // 于是关一次就变 0 → 开关置灰 → 再也打不开（自锁），提示还写着"正文里没有外链"而正文其实有。
  const off = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/render',
    body: { sessionId: 's1', docKey: opened.key, meta: { footnotes: false }, mode: 'preview' },
  })
  assert.equal(off.json.linkCount, 1, '「脚注」开关关着也要照实报链接数，否则开关自锁')
  assert.doesNotMatch(off.json.html, /参考资料/, '开关关着就不该生成参考资料')
  assert.match(off.json.html, /<a /, '关的是"转脚注"，不是把链接本身去掉')
})

test('状态里存着已移除的主题（ft/medium）：退回默认，不让文档打不开', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  store.updateMeta({ cwd, docPath: opened.path, meta: { theme: 'ft' } }) // 旧状态 / 手改的状态
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=s1&docKey=${opened.key}` })
  assert.equal(doc.status, 200)
  assert.equal(doc.json.meta.theme, 'default', '认不出的主题要退回默认，而不是原样回给面板')

  const preview = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, mode: 'preview' } })
  assert.equal(preview.status, 200, '主题名失效不该让整篇预览失败')
  const publish = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, mode: 'publish' } })
  assert.equal(publish.status, 200)
})

test('fishpai_render：默认（复制形态）加兼容层，publish:false 时保持原始形态', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const byName = (name) => tools.find((t) => t.name === name)
  await byName('fishpai_open').execute({ markdown: ARTICLE }, exec)

  const wrapped = await byName('fishpai_render').execute({ out_path: '导出成品' }, exec)
  assert.equal(wrapped.isError, false, wrapped.text)
  assert.match(fs.readFileSync(path.join(cwd, '导出成品.html'), 'utf8'), /<span>这是第一段示例文本/)

  const plain = await byName('fishpai_render').execute({ out_path: '预览原样', publish: false }, exec)
  assert.equal(plain.isError, false, plain.text)
  assert.doesNotMatch(fs.readFileSync(path.join(cwd, '预览原样.html'), 'utf8'), /<span>/)
})

test('fishpai_render 的兼容层与面板的「复制到公众号」同款：字号也推进，且不碰「参考资料」', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const byName = (name) => tools.find((t) => t.name === name)
  // 有链接才会有文末「参考资料」那一节（它自己带小字号，不该被推进）
  const md = '# 标题\n\n正文一段，里面有一个[链接](https://example.com)。\n'
  await byName('fishpai_open').execute({ markdown: md }, exec)
  const key = store.activeKey(cwd, 's1')
  store.updateMeta({ cwd, docPath: store.readState(cwd, key).docPath, meta: { fontSize: '17px' } })

  const out = await byName('fishpai_render').execute({}, exec)
  assert.equal(out.isError, false, out.text)
  const html = fs.readFileSync(path.join(cwd, /已导出 HTML：(\S+)/.exec(out.text)[1]), 'utf8')
  assert.match(html, /<p style="font-size: 17px; /, '选定的字号要推进到正文 p（与面板复制/导出那条路一致，否则导出的成品字号粘进去仍失效）')
  const section = html.slice(html.indexOf('<section'))
  assert.match(section, /font-size: 13px/, '参考资料那一节自带小字号')
  assert.doesNotMatch(section, /font-size: 17px/, '小字不该被撑成正文字号')

  // publish:false（预览原样形态）不推进：字号仍然只挂在 wrapper 上（那是原始形态）
  const plain = await byName('fishpai_render').execute({ publish: false }, exec)
  assert.equal(plain.isError, false, plain.text)
  const raw = fs.readFileSync(path.join(cwd, /已导出 HTML：(\S+)/.exec(plain.text)[1]), 'utf8')
  assert.match(raw, /font-size: 17px/, '原始形态下字号仍然在（挂在 wrapper 上）')
  assert.doesNotMatch(raw, /<p style="font-size: 17px/, '原始形态不该把字号推进到元素上')
})

test('路由：Origin: null 的请求被拒（沙箱 iframe / data: 文档）', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const res = await callRoute(handler, {
    method: 'GET',
    url: `/fishpai/api/doc?sessionId=s1&docKey=${opened.key}`,
    headers: { origin: 'null' },
  })
  assert.equal(res.status, 403)
})

test('路由：超过 8MB 的请求体回 413 而不是断连', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const res = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    // 超大 JSON：走 readBody 的 overflow 分支
    raw: Buffer.from(JSON.stringify({ sessionId: 's1', docKey: opened.key, baseRevision: 1, markdown: 'x'.repeat(9 * 1024 * 1024) })),
  })
  assert.equal(res.status, 413)
  assert.match(res.json.error, /上限/)
})

test('路由：history 的 stash 把草稿存成历史，且可按 id 回滚', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const stash = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/history',
    body: { sessionId: 's1', docKey: opened.key, action: 'stash', markdown: '我还没保存的稿子', label: '冲突时我的版本' },
  })
  assert.equal(stash.status, 200)
  assert.ok(stash.json.entry.id)
  assert.equal(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), ARTICLE, 'stash 不能动正文')

  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=s1&docKey=${opened.key}` })
  const entry = doc.json.history.find((h) => h.id === stash.json.entry.id)
  assert.ok(entry, '历史列表里应能按 id 找到草稿')
  assert.equal(entry.label, '冲突时我的版本')

  const restore = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/history',
    body: { sessionId: 's1', docKey: opened.key, action: 'restore', id: stash.json.entry.id },
  })
  assert.equal(restore.status, 200)
  assert.equal(fs.readFileSync(path.join(cwd, 'a.md'), 'utf8'), '我还没保存的稿子')
})

// ── 工具契约 + 端到端 ──────────────────────────────────────────

function fakeHost(cwd) {
  const tools = []
  const ctx = {
    tools: { register: (t) => (tools.push(t), () => {}) },
    sessions: { get: (id) => (id === 's1' ? { header: { cwd } } : null) },
    logger: { info: () => {} },
  }
  const dispose = registerTools(ctx, { resolveCwd: (id) => (id === 's1' ? cwd : null), log: () => {} })
  const exec = { agent: { session: { id: 's1' } } }
  return { ctx, tools, dispose, exec }
}

test('工具契约：五个工具都是合法的 raw JSON-Schema 形态', () => {
  const { tools } = fakeHost(tmpWorkspace())
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['fishpai_open', 'fishpai_read', 'fishpai_render', 'fishpai_theme', 'fishpai_write'],
  )
  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, `${tool.name} 描述太短`)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(Array.isArray(tool.parameters.required))
    for (const name of tool.parameters.required) assert.ok(tool.parameters.properties[name], `${tool.name} required 里的 ${name} 未声明`)
    assert.equal(tool.output.schema.type, 'object')
    assert.ok(tool.output.schema.required.includes('text'))
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(typeof tool.execute, 'function')
    const rendered = tool.output.render({}, { text: 'hello' })
    assert.deepEqual(rendered, [{ type: 'text', text: 'hello' }])
  }
})

test('端到端：open → 人改 + 加批注 → read 看到 diff → write 局部改 → 再 read 归零', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const byName = (n) => tools.find((t) => t.name === n)

  const opened = await byName('fishpai_open').execute({ markdown: ARTICLE }, exec)
  assert.equal(opened.isError, false)
  assert.match(opened.text, /已新建文档/)
  const key = opened.doc_key
  assert.equal(store.pendingOpenRequest(store.readState(cwd, key), 's1') !== null, true, '应把打开请求置位给客户端轮询')

  // 人在面板里改字 + 加批注 + 留行内占位
  const state = store.readState(cwd, key)
  const docPath = state.docPath
  const blocks = splitBlocks(ARTICLE)
  store.addNote({ cwd, docPath, note: { blockId: blocks[1].id, quote: blocks[1].text, text: '时间改成周五' } })
  const edited = ARTICLE.replace('这是第一段示例文本。', '这是第一段示例文本。\n\n<!-- 鱼排: 这里补一个地点地图 -->')
  store.saveDoc({ cwd, docPath, markdown: edited, baseRevision: state.revision, by: 'human' })

  const read = await byName('fishpai_read').execute({ include: 'outline' }, exec)
  assert.equal(read.isError, false)
  assert.match(read.text, /1 处新增/)
  assert.match(read.text, /时间改成周五/)
  assert.match(read.text, /这里补一个地点地图/)
  assert.match(read.text, /revision = 2/)
  assert.doesNotMatch(read.text, /块 undefined/)

  const write = await byName('fishpai_write').execute(
    {
      base_revision: 2,
      mode: 'patch',
      patches: [
        { block_id: blocks[1].id, op: 'replace', markdown: '这是改过的示例文本。' },
        { block_id: blocks[blocks.length - 1].id, op: 'insert_after', markdown: '\n\n（地图见群公告）\n' },
      ],
    },
    exec,
  )
  assert.equal(write.isError, false, write.text)
  assert.match(write.text, /应用了 2 个补丁/)

  const after = await byName('fishpai_read').execute({ include: 'summary' }, exec)
  assert.equal(after.isError, false)
  assert.match(after.text, /用户没有改动正文/)
  const onDisk = fs.readFileSync(docPath, 'utf8')
  assert.match(onDisk, /这是改过的示例文本/)
  assert.match(onDisk, /（地图见群公告）/)
  assert.match(onDisk, /## 示例小节/, '未被 patch 的块必须原样保留')
})

test('端到端：write 用过期 revision 会被拒绝，并回带最新差异', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const byName = (n) => tools.find((t) => t.name === n)
  const opened = await byName('fishpai_open').execute({ markdown: ARTICLE }, exec)
  const key = opened.doc_key
  const docPath = store.readState(cwd, key).docPath

  store.saveDoc({ cwd, docPath, markdown: `${ARTICLE}\n人又加了一段。\n`, baseRevision: 1, by: 'human' })

  const stale = await byName('fishpai_write').execute({ base_revision: 1, mode: 'replace', markdown: 'AI 的整篇新稿' }, exec)
  assert.equal(stale.isError, true)
  assert.match(stale.text, /写入被拒绝/)
  assert.match(stale.text, /自你上次写入以来/, '被拒时应当回带"人改了什么"，而不是只说版本不对')
  assert.match(stale.text, /人又加了一段/)
  assert.match(fs.readFileSync(docPath, 'utf8'), /人又加了一段/)
})

test('工具：没写扩展名时自动补（.md / .html），写了别的扩展名仍然明确报错', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  const byName = (name) => tools.find((t) => t.name === name)

  const opened = await byName('fishpai_open').execute({ path: '草稿', markdown: ARTICLE }, exec)
  assert.equal(opened.isError, false, opened.text)
  assert.ok(fs.existsSync(path.join(cwd, '草稿.md')), 'path 少写扩展名应当补成 .md')

  const rendered = await byName('fishpai_render').execute({ out_path: '导出' }, exec)
  assert.equal(rendered.isError, false, rendered.text)
  assert.ok(fs.existsSync(path.join(cwd, '导出.html')), 'out_path 少写扩展名应当补成 .html')

  const bad = await byName('fishpai_open').execute({ path: '草稿.bak', markdown: 'x' }, exec)
  assert.equal(bad.isError, true)
  assert.match(bad.text, /扩展名/)
})

test('工具在没有会话工作目录时给出可读错误而不是抛异常', async () => {
  const tools = []
  const ctx = { tools: { register: (t) => (tools.push(t), () => {}) }, sessions: { get: () => null } }
  registerTools(ctx, { resolveCwd: () => null, log: () => {} })
  const result = await tools[0].execute({ markdown: 'x' }, { agent: { session: { id: 'nope' } } })
  assert.equal(result.isError, true)
  assert.match(result.text, /没有工作目录/)
})

test('客户端契约：api.ts 用到的路由与字段在宿主侧全都存在（跨边界对账）', async () => {
  const cwd = tmpWorkspace()
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const session = 's1'

  // tools 先建文档（模型侧入口）
  const { tools, exec } = fakeHost(cwd)
  const opened = await tools.find((t) => t.name === 'fishpai_open').execute({ markdown: ARTICLE, theme: 'sspai' }, exec)
  const docKey = opened.doc_key

  // 1) GET /themes —— 面板工具栏
  const themes = await callRoute(handler, { method: 'GET', url: '/fishpai/api/themes' })
  assert.equal(themes.status, 200)
  // 主题是 themes.js 里的数据，数量会变；这里钉住的是"两套不适合公众号的已被移除"
  assert.ok(themes.json.themes.length >= 8, `主题太少了：${themes.json.themes.length}`)
  assert.deepEqual(
    themes.json.themes.map((t) => t.key).filter((k) => ['ft', 'medium'].includes(k)),
    [],
    'ft（整页粉橙异色底）与 medium（与 nyt 几乎重合）不该再出现在面板里',
  )
  assert.equal(themes.json.presets.length, 12)
  assert.ok(themes.json.sizes.includes('17px'))
  // 每条都要带能力标注，否则面板没法判断"主题色该不该显示""要不要提醒微信风险"
  for (const t of themes.json.themes) {
    for (const flag of ['usesAccent', 'gradientText', 'darkWrapper', 'wechatSafe']) {
      assert.equal(typeof t[flag], 'boolean', `${t.key} 缺少 ${flag}`)
    }
    assert.equal(t.wechatSafe, !t.gradientText && !t.darkWrapper)
  }
  assert.deepEqual(themes.json.themes.filter((t) => t.usesAccent).map((t) => t.key), ['default'])

  // 2) GET /state —— 轮询
  const state = await callRoute(handler, { method: 'GET', url: `/fishpai/api/state?sessionId=${session}` })
  assert.equal(state.status, 200)
  assert.equal(state.json.active.key, docKey)
  assert.equal(state.json.active.revision, 1)
  assert.ok(state.json.openRequest, 'fishpai_open 之后应当有待处理的打开请求')
  assert.ok(Array.isArray(state.json.docs))

  // 3) POST /tab-opened —— 面板弹出后清请求
  const tabOpened = await callRoute(handler, { method: 'POST', url: '/fishpai/api/tab-opened', body: { sessionId: session, docKey } })
  assert.equal(tabOpened.status, 200)
  const state2 = await callRoute(handler, { method: 'GET', url: `/fishpai/api/state?sessionId=${session}` })
  assert.equal(state2.json.openRequest, null)

  // 4) GET /doc —— 面板初始化
  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=${session}&docKey=${docKey}` })
  assert.equal(doc.status, 200)
  for (const field of ['doc', 'meta', 'blocks', 'notes', 'placeholders', 'images', 'history']) {
    assert.ok(field in doc.json, `GET /doc 应当返回 ${field}`)
  }
  // 反过来也要钉住：`/doc` 只回这一篇要用的东西。
  // `active` 是**全量** sessionId → docKey 映射（面板自己要的那一项走 /state 就有了），
  // 回给任何能发同源 GET 的调用方等于白送别的会话 id；`docs` 与 /state 的清单重复。
  assert.ok(!('active' in doc.json), 'GET /doc 不该回带全量 sessionId → docKey 映射')
  assert.ok(!('docs' in doc.json), 'GET /doc 不该重复回文档清单（/state 已提供）')
  assert.equal(doc.json.meta.theme, 'sspai', 'fishpai_open 传的主题要落到状态里')
  for (const field of ['key', 'path', 'title', 'markdown', 'revision', 'updatedAt', 'updatedBy', 'baseline']) {
    assert.ok(field in doc.json.doc, `doc.${field} 缺失`)
  }
  assert.ok(doc.json.blocks.every((b) => typeof b.preview === 'string' && typeof b.id === 'string' && typeof b.startLine === 'number'))

  // 5) PUT /doc —— 自动保存（带 meta）
  const saved = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    body: { sessionId: session, docKey, markdown: `${ARTICLE}\n新增一段。\n`, baseRevision: 1, meta: { fontSize: '17px' } },
  })
  assert.equal(saved.status, 200)
  assert.equal(saved.json.revision, 2)
  // 每次写入都留一份快照，顺手回带：面板的「历史」抽屉因此不用再手动刷新
  assert.ok(Array.isArray(saved.json.history), 'PUT /doc 应当回带 history')
  assert.ok(saved.json.history.length >= 1)
  assert.equal(saved.json.history[0].rev, 1)
  for (const field of ['id', 'rev', 'at', 'by', 'chars']) {
    assert.ok(field in saved.json.history[0], `history.${field} 缺失`)
  }

  // 6) POST /render preview + publish —— 预览与复制
  const preview = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: session, docKey, markdown: `${ARTICLE}\n新增一段。\n\`\`\`js\nconst x = 1;\n\`\`\`\n`, meta: { theme: 'sspai' }, mode: 'preview' } })
  assert.equal(preview.status, 200)
  assert.ok(Array.isArray(preview.json.blocks))
  assert.match(preview.json.html, /<fp-block data-b="/)
  // 预览 iframe 是沙箱 srcdoc，里面没有 highlight.js 样式表：宿主把同一份色表（hljs-map.json）
  // 生成 CSS 随预览下发，客户端注入。不带着，代码块在面板里就是黑的，而复制出来的成品是彩的。
  assert.equal(typeof preview.json.hljsCss, 'string', 'preview 响应必须带 hljsCss')
  assert.match(preview.json.hljsCss, /\.hljs-keyword\{/, '色表里要有 keyword 这一条')
  // 只发单段选择器：复合选择器（".hljs-meta .hljs-string"）在 srcdoc 里用不上
  // （hljsStyleFor 的兜底逻辑保证复合写法仍能命中单段规则）
  assert.doesNotMatch(preview.json.hljsCss, /\.hljs-[a-z-]+ \./, '复合选择器不该出现在预览 CSS 里')
  // 发布产物不吃这份 CSS（走 inlineCodeStyles 内联），golden 不受影响
  const publish = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: session, docKey, markdown: `${ARTICLE}\n新增一段。\n\`\`\`js\nconst x = 1;\n\`\`\`\n`, mode: 'publish' } })
  assert.equal(publish.status, 200)
  assert.equal(typeof publish.json.html, 'string')
  assert.ok(!('hljsCss' in publish.json), 'publish 响应不该带 hljsCss（它走内联）')
  assert.match(publish.json.html, /hljs-keyword[^>]*style="[^"]*color/, 'publish 产物里代码块 token 是内联色的')

  // 7) POST /notes add / update / remove
  const blockId = doc.json.blocks[1].id
  const added = await callRoute(handler, { method: 'POST', url: '/fishpai/api/notes', body: { sessionId: session, docKey, action: 'add', note: { blockId, text: '这里加个二维码' } } })
  assert.equal(added.status, 200)
  const note = added.json.notes.find((n) => n.text === '这里加个二维码')
  assert.ok(note.id)
  assert.ok(note.quote, '引用片段应由宿主按当前正文补全')
  assert.equal(typeof note.blockIndex, 'number')

  // 只给块序号也要能挂上：面板在"块 id 已经因为人改过正文而失效"时靠的就是这条兜底
  const byIndex = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/notes',
    body: { sessionId: session, docKey, action: 'add', note: { blockId: '已失效的旧id', blockIndex: doc.json.blocks[0].index, text: '按序号挂的批注' } },
  })
  assert.equal(byIndex.status, 200)
  const indexed = byIndex.json.notes.find((n) => n.text === '按序号挂的批注')
  assert.ok(indexed, '只给 blockIndex 也应当挂上')
  assert.equal(indexed.orphan, false, '按序号命中就不该标成失锚')
  assert.equal(indexed.blockIndex, doc.json.blocks[0].index)
  assert.equal(indexed.blockId, doc.json.blocks[0].id, '命中块后应把已失效的旧 id 归一化掉')
  assert.ok(indexed.quote, '命中后引用片段同样要补全')
  await callRoute(handler, { method: 'POST', url: '/fishpai/api/notes', body: { sessionId: session, docKey, action: 'remove', id: indexed.id } })

  const resolved = await callRoute(handler, { method: 'POST', url: '/fishpai/api/notes', body: { sessionId: session, docKey, action: 'update', id: note.id, patch: { resolved: true } } })
  assert.equal(resolved.status, 200)
  assert.equal(resolved.json.notes.find((n) => n.id === note.id).resolved, true)
  const removed = await callRoute(handler, { method: 'POST', url: '/fishpai/api/notes', body: { sessionId: session, docKey, action: 'remove', id: note.id } })
  assert.equal(removed.status, 200)
  assert.equal(removed.json.notes.length, 0)

  // 删一条不存在的批注：和 add/update 一样给 404，而不是在 reanchorNotes 上炸成 400
  const missing = await callRoute(handler, { method: 'POST', url: '/fishpai/api/notes', body: { sessionId: session, docKey, action: 'remove', id: '不存在的id' } })
  assert.equal(missing.status, 404)
  assert.match(missing.json.error, /批注不存在/)

  // 8) POST /meta —— 样式开关
  const meta = await callRoute(handler, { method: 'POST', url: '/fishpai/api/meta', body: { sessionId: session, docKey, meta: { mobile: true, color: '#10b981' } } })
  assert.equal(meta.status, 200)
  const after = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=${session}&docKey=${docKey}` })
  assert.equal(after.json.meta.mobile, true)
  assert.equal(after.json.meta.color, '#10b981')

  // 9) POST /history list / stash / restore
  const listed = await callRoute(handler, { method: 'POST', url: '/fishpai/api/history', body: { sessionId: session, docKey, action: 'list' } })
  assert.equal(listed.status, 200)
  assert.ok(listed.json.history.every((h) => typeof h.id === 'string'))
  const stashed = await callRoute(handler, { method: 'POST', url: '/fishpai/api/history', body: { sessionId: session, docKey, action: 'stash', markdown: '草稿' } })
  assert.equal(stashed.status, 200)
  const restored = await callRoute(handler, { method: 'POST', url: '/fishpai/api/history', body: { sessionId: session, docKey, action: 'restore', id: stashed.json.entry.id } })
  assert.equal(restored.status, 200)

  // 10) GET /asset —— 本地图片（这里没有图片，只验证路由存在且不 500）
  const asset = await callRoute(handler, { method: 'GET', url: `/fishpai/api/asset?sessionId=${session}&docKey=${docKey}&src=nope.png` })
  assert.equal(asset.status, 404)

  // 11) POST /doc + POST /active —— 空面板上的「新建空白文档」与「最近打开」
  const blank = await callRoute(handler, { method: 'POST', url: '/fishpai/api/doc', body: { sessionId: session } })
  assert.equal(blank.status, 200)
  assert.ok(blank.json.docKey)
  const activated = await callRoute(handler, { method: 'POST', url: '/fishpai/api/active', body: { sessionId: session, docKey } })
  assert.equal(activated.status, 200)
  assert.equal(activated.json.docKey, docKey)

  // 12) POST /upload —— 粘贴进来的图片：只存图、不动正文
  const docFile = doc.json.doc.path
  const before = fs.readFileSync(docFile, 'utf8')
  const uploaded = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/upload',
    body: { sessionId: session, docKey, name: 'image.png', mime: 'image/png', data: PNG_BYTES.toString('base64') },
  })
  assert.equal(uploaded.status, 200)
  assert.match(uploaded.json.src, /^assets\/\d{8}-\d{6}-paste\.png$/)
  assert.deepEqual(fs.readFileSync(uploaded.json.path), PNG_BYTES)
  assert.equal(path.dirname(uploaded.json.path), path.join(path.dirname(docFile), 'assets'), '落在文档同级的 assets/ 里')
  assert.equal(fs.readFileSync(docFile, 'utf8'), before, '存图不许碰正文')

  // 存进来的图立刻出现在「图片清单」里，且可内嵌（面板据此提示"不用手动重传"）
  const afterUpload = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=${session}&docKey=${docKey}` })
  assert.equal(afterUpload.json.images.length, 0, '正文还没引用它，清单里就不该有')

  // 越权与超限：都不是能写文件的入口
  const badKey = await callRoute(handler, { method: 'POST', url: '/fishpai/api/upload', body: { sessionId: session, docKey: 'nope', mime: 'image/png', data: PNG_BYTES.toString('base64') } })
  assert.equal(badKey.status, 400)
  const tooBig = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/upload',
    body: { sessionId: session, docKey, mime: 'image/png', data: Buffer.alloc(store.MAX_ASSET_BYTES + 1024).toString('base64') },
  })
  assert.equal(tooBig.status, 400)
  assert.match(tooBig.json.error, /超过 5MB 上限/)
  // 跨站：写操作的入口守卫照旧
  const crossSite = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/upload',
    headers: { origin: 'https://evil.example' },
    body: { sessionId: session, docKey, mime: 'image/png', data: PNG_BYTES.toString('base64') },
  })
  assert.equal(crossSite.status, 403)
})

// ── 写入守卫的第二道（路由层）与两条关键路径的测试盲区 ──────────
//
// 这一组是补洞用的：以前**所有** PUT /doc 用例都带 baseRevision，
// 于是"不传版本号就能静默覆盖人的手改"那个洞一条用例也覆盖不到。

test('路由守卫：PUT /doc 缺/非法 baseRevision 一律 400，过期版本 409 并回带最新正文', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const url = '/fishpai/api/doc'
  const human = `${ARTICLE}\n人加的一句。\n`

  const first = await callRoute(handler, { method: 'PUT', url, body: { sessionId: 's1', docKey: opened.key, markdown: human, baseRevision: 1 } })
  assert.equal(first.status, 200)
  assert.equal(first.json.revision, 2)

  for (const baseRevision of [undefined, null, '2', true, {}]) {
    const res = await callRoute(handler, { method: 'PUT', url, body: { sessionId: 's1', docKey: opened.key, markdown: '模型静默覆盖。\n', baseRevision } })
    assert.equal(res.status, 400, `baseRevision=${JSON.stringify(baseRevision)} 必须被 400 挡住`)
    assert.match(res.json.error, /baseRevision/)
    assert.equal(fs.readFileSync(opened.path, 'utf8'), human, '被拒的写入不许碰正文')
  }

  // 过期（但合法）的版本走另一条路：409 + 服务端最新正文，面板据此进冲突流程
  const stale = await callRoute(handler, { method: 'PUT', url, body: { sessionId: 's1', docKey: opened.key, markdown: '过期。\n', baseRevision: 1 } })
  assert.equal(stale.status, 409)
  assert.equal(stale.json.conflict, true)
  assert.equal(stale.json.markdown, human)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), human)
})

test('路由守卫：PUT /doc 的 markdown 缺字段是 400，不是"把正文清空"', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const url = '/fishpai/api/doc'

  for (const markdown of [undefined, { a: 1 }, 42, ['x']]) {
    const res = await callRoute(handler, { method: 'PUT', url, body: { sessionId: 's1', docKey: opened.key, markdown, baseRevision: 1 } })
    assert.equal(res.status, 400, `markdown=${JSON.stringify(markdown)} 必须是 400`)
    assert.equal(fs.readFileSync(opened.path, 'utf8'), ARTICLE, '缺字段/错类型都不许动正文')
    assert.equal(store.readState(cwd, opened.key).revision, 1, '被拒的请求不该留下一条历史')
  }

  // 显式空串是"确实要清空"，放行（并且要能靠历史取回）
  const cleared = await callRoute(handler, { method: 'PUT', url, body: { sessionId: 's1', docKey: opened.key, markdown: '', baseRevision: 1 } })
  assert.equal(cleared.status, 200)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), '')
  assert.equal(store.readHistoryEntry(cwd, opened.key, 1).content, ARTICLE, '清空前的正文要留在历史里')
})

test('并发写：同一个 baseRevision 的两个 PUT 只允许一个落盘', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const put = (markdown) =>
    callRoute(handler, { method: 'PUT', url: '/fishpai/api/doc', body: { sessionId: 's1', docKey: opened.key, markdown, baseRevision: 1 } })

  const [a, b] = await Promise.all([put(`${ARTICLE}\nA\n`), put(`${ARTICLE}\nB\n`)])
  assert.deepEqual([a.status, b.status].sort(), [200, 409], '一个落盘、一个冲突，不能两个都写进去')
  const final = fs.readFileSync(opened.path, 'utf8')
  assert.ok(final === `${ARTICLE}\nA\n` || final === `${ARTICLE}\nB\n`, `盘上是两次写入之一，实际是：${JSON.stringify(final)}`)
  assert.equal(store.readState(cwd, opened.key).revision, 2, '只前移一格')
})

test('请求体：分块累加按字节来（切在汉字中间的 chunk 也不会读坏）', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const markdown = '中文正文，一字不能少。\n'
  const payload = Buffer.from(JSON.stringify({ sessionId: 's1', docKey: opened.key, markdown, baseRevision: 1 }), 'utf8')
  const at = payload.indexOf(Buffer.from('中', 'utf8')) + 1 // 故意切在一个三字节汉字的中间
  const res = await callRoute(handler, {
    method: 'PUT',
    url: '/fishpai/api/doc',
    chunks: [payload.subarray(0, at), payload.subarray(at, at + 5), payload.subarray(at + 5)],
  })
  assert.equal(res.status, 200)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), markdown, '拼接必须按 Buffer 累加，不能按字符串')
})

test('请求体：流上出错时回 400 而不是挂住', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  // body:{} 只为带上 content-type（否则走 415 分支）；emitError 会让桩不投递任何数据
  const res = await callRoute(handler, { method: 'PUT', url: '/fishpai/api/doc', body: {}, emitError: true })
  assert.equal(res.status, 400)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), ARTICLE)
})

test('请求体超过上限：413，且盘上正文一个字不动', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const res = await callRoute(handler, { method: 'PUT', url: '/fishpai/api/doc', raw: Buffer.alloc(9 * 1024 * 1024, 0x61) })
  assert.equal(res.status, 413)
  assert.match(res.json.error, /上限/)
  assert.equal(fs.readFileSync(opened.path, 'utf8'), ARTICLE)
})

test('GET /asset：成功路径回真图与 content-type；越界/远程/不存在一律 404', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const saved = store.saveAsset({ cwd, docPath: opened.path, name: 'image.png', mime: 'image/png', data: PNG_BYTES.toString('base64') })
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const get = (src) => callRoute(handler, { method: 'GET', url: `/fishpai/api/asset?sessionId=s1&docKey=${opened.key}&src=${encodeURIComponent(src)}` })

  // 以前这里只有失败分支，而"路由被删掉"同样回 404——那条断言区分不了
  // "路由在且正确回 404"与"路由不存在"，`readAsset` 的成功分支也从没被执行过。
  const ok = await get(saved.src)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['content-type'], 'image/png')
  assert.deepEqual(ok.raw, PNG_BYTES, '回的必须是原字节')

  assert.equal((await get('assets/nope.png')).status, 404)
  assert.equal((await get('../outside.png')).status, 404, '越界不是"没找到"，是根本不许读')
  assert.equal((await get('https://example.com/x.png')).status, 404, '远程图不归宿主读')
})

test('存图守卫在落盘**之前**：assets/ 指向工作目录之外时，一个字节都不许写出去', (t) => {
  const cwd = tmpWorkspace()
  const outside = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  try {
    fs.symlinkSync(outside, path.join(cwd, 'assets'), 'junction')
  } catch {
    t.skip('本平台不允许建目录链接')
    return
  }

  assert.throws(
    () => store.saveAsset({ cwd, docPath: opened.path, name: 'x.png', mime: 'image/png', data: PNG_BYTES.toString('base64') }),
    /越界/,
  )
  // 这条才是关键：以前是"先 writeFileSync、再 resolveInCwd"，接口虽然回 400，
  // 但字节已经写到了工作目录外面。所以断言的不是"抛错"，而是"外面干干净净"。
  assert.deepEqual(fs.readdirSync(outside), [], '守卫必须挡在 writeFileSync 之前')
})

test('存图：上传只收栅格图，名字里的扩展名不会叠进落盘文件名', () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  const data = PNG_BYTES.toString('base64')

  // `.svg` 留在 IMAGE_EXTS 里是为了能解析正文已引用的图，但它不该是**上传**入口
  //（否则与"只支持 PNG / JPEG / GIF / WebP / BMP"的提示自相矛盾）
  assert.throws(() => store.saveAsset({ cwd, docPath: opened.path, name: 'x.svg', mime: 'text/plain', data }), /只支持/)
  assert.throws(() => store.saveAsset({ cwd, docPath: opened.path, name: 'x.svg', mime: 'image/svg+xml', data }), /只支持/)

  // mime 说了是 PNG，名字里的 `.svg` 只当一段可读词——不该变成 `…-x.svg.png`
  const saved = store.saveAsset({ cwd, docPath: opened.path, name: 'x.svg', mime: 'image/png', data })
  assert.match(path.basename(saved.path), /-x\.png$/)
})

test('新建文档：标题里的控制字符不会进到文件路径里', async () => {
  const cwd = tmpWorkspace()
  const handler = createApiHandler({ resolveCwd: () => cwd })
  const res = await callRoute(handler, { method: 'POST', url: '/fishpai/api/doc', body: { sessionId: 's1', title: '名\u0000字\u001b' } })
  assert.equal(res.status, 200)
  assert.ok(!/[\u0000-\u001f]/.test(res.json.path), `路径不该含控制字符：${JSON.stringify(res.json.path)}`)
  assert.ok(fs.existsSync(res.json.path))
})

test('fishpai_render 的自定义主题：theme_spec 校验后生效，越权规格当场被拒', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  // 正文里必须真的有引用块：不然自定义的 blockquote 槽位没有任何元素可以作用，断言就成了空的
  await tools
    .find((t) => t.name === 'fishpai_open')
    .execute({ markdown: `${ARTICLE}\n> 引用一句。\n`, theme: 'default' }, exec)
  const renderTool = tools.find((t) => t.name === 'fishpai_render')

  const good = await renderTool.execute(
    {
      theme_spec: {
        name: '我的·灰底',
        base: 'elegant',
        styles: { blockquote: 'background: #f4f4f5;', p: 'line-height: 2.2;' },
      },
    },
    exec,
  )
  assert.equal(good.isError, false, good.text)
  assert.match(good.text, /我的·灰底/)
  // 必须说清楚"没保存"：否则模型会告诉用户"已经存进主题列表了"，而面板里什么都不会出现
  assert.match(good.text, /没有保存/)
  const rel = /已导出 HTML：(\S+)/.exec(good.text)[1]
  const html = fs.readFileSync(path.join(cwd, rel), 'utf8')
  assert.match(html, /f4f4f5/, '自定义槽位的声明要进产物')
  assert.match(html, /line-height: 2\.2/)

  // 越权规格与写错的 base：拒绝 + 说清哪里不对（模型据此自己改对再来）
  const bad = await renderTool.execute({ theme_spec: { base: 'default', styles: { p: 'position: fixed;' } } }, exec)
  assert.equal(bad.isError, true)
  assert.match(bad.text, /不支持的属性/)
  const badBase = await renderTool.execute({ theme_spec: { base: '火星主题', styles: { p: 'color: #000;' } } }, exec)
  assert.equal(badBase.isError, true)
  assert.match(badBase.text, /base 必须是已有的主题 key/)
  // 不给 theme_spec 时，老的 theme 参数那条路照旧
  const plain = await renderTool.execute({ theme: 'bamboo' }, exec)
  assert.equal(plain.isError, false, plain.text)
  assert.match(plain.text, /竹林/)
})

// ── 自定义主题（工作目录级的那一套）──────────────────────────────
//
// 面板上只有一个「自定义主题」占位，所以这一组要钉住三件事：
//   ① 存储是**一个文件**（`<cwd>/.fishpai/theme.json`），没有主题库；
//   ② `custom` 这个 key 要能解析成那套主题，**文件没了就静默退回默认**（不留"选不中的状态"）；
//   ③ 换主题**不动 revision**，所以面板必须能从 `/state` 看出主题变了（否则模型换完没反应）。

test('自定义主题：写/读/覆盖/移除都在这一个文件里，只有一套', () => {
  const cwd = tmpWorkspace()
  assert.equal(custom.readCustomTheme(cwd), null)
  assert.equal(custom.themeFor({ cwd, name: 'custom' }).key, 'default', '还没有就退回默认')
  assert.equal(custom.themeFor({ cwd, name: 'custom' }).missing, true, '要能区分"没有"与"选不中"')

  const built = custom.writeCustomTheme({ cwd, spec: { name: '灰底', base: 'elegant', styles: { p: 'line-height: 2;' } } })
  assert.equal(built.spec.name, '灰底')
  const file = path.join(cwd, '.fishpai', 'theme.json')
  assert.ok(fs.existsSync(file))
  const read = custom.readCustomTheme(cwd)
  assert.equal(read.spec.name, '灰底')
  assert.equal(read.theme.styles.p, 'line-height: 2;')
  assert.equal(read.theme.styles.h2, themes().elegant.styles.h2, '没改的槽位来自 base')
  assert.deepEqual(custom.themeFor({ cwd, name: 'custom' }).theme.styles, read.theme.styles)

  // 只有一套：再写一次是覆盖，不会多出第二个文件
  custom.writeCustomTheme({ cwd, spec: { name: '第二套', base: 'default', styles: { p: 'color: #111;' } } })
  assert.deepEqual(fs.readdirSync(path.join(cwd, '.fishpai')).filter((f) => f.endsWith('.json')), ['theme.json'])
  assert.equal(custom.readCustomTheme(cwd).spec.name, '第二套')

  assert.equal(custom.clearCustomTheme(cwd), true)
  assert.equal(custom.readCustomTheme(cwd), null)
  assert.equal(custom.clearCustomTheme(cwd), false, '再删一次是空操作')
})

test('自定义主题：坏文件与非法规格都不会把面板/文档弄坏', () => {
  const cwd = tmpWorkspace()
  store.ensureFishpaiLayout(cwd)
  const file = path.join(cwd, '.fishpai', 'theme.json')

  fs.writeFileSync(file, '{ 这不是 JSON', 'utf8')
  assert.equal(custom.readCustomTheme(cwd), null, '坏文件按"没有"处理，不许抛')
  assert.equal(custom.themeFor({ cwd, name: 'custom' }).key, 'default')

  // 盘上放着一份校验不过的规格（手改的）→ 同样当没有
  fs.writeFileSync(file, JSON.stringify({ version: 1, spec: { base: '不存在', styles: { p: 'color: #000;' } } }), 'utf8')
  assert.equal(custom.readCustomTheme(cwd), null)

  // 写非法规格：抛错，且不留半个文件（半截 JSON 会让下次直接"没有自定义主题"）
  fs.unlinkSync(file)
  assert.throws(
    () => custom.writeCustomTheme({ cwd, spec: { base: 'default', styles: { p: 'position: fixed;' } } }),
    /不支持的属性/,
  )
  assert.equal(fs.existsSync(file), false)
})

test('自定义主题：给 .json 放行只对这一条路径，state/ 那些仍然打不开', () => {
  const cwd = tmpWorkspace()
  assert.doesNotThrow(() => store.resolveInCwd(cwd, path.join('.fishpai', 'theme.json'), { exts: ['.json'] }))
  // 默认白名单是文档（.md/.markdown/.txt），没有 .json——
  // 别因为"要存主题"就把任意 JSON 读写打开（`.fishpai/state/*.json` 一直是有意不可达的）
  assert.throws(() => store.resolveInCwd(cwd, path.join('.fishpai', 'state', 'x.json')), /扩展名/)
})

test('自定义主题：清单里的占位（固定名 + 基于哪套 + 能力标注），没有就返回 null', () => {
  const cwd = tmpWorkspace()
  assert.equal(custom.customCatalogEntry(cwd), null, '没有自定义主题就不显示这一组（不要一个点了没反应的灰项）')
  custom.writeCustomTheme({ cwd, spec: { name: '灰底', base: 'elegant', styles: { p: 'line-height: 2;' } } })
  const entry = custom.customCatalogEntry(cwd)
  assert.equal(entry.key, 'custom')
  assert.equal(entry.name, '自定义主题', '固定一个占位名，不跟着模型起的名字变')
  assert.match(entry.desc, /灰底/)
  assert.match(entry.desc, /优雅简约/, '说明是基于哪套内置主题')
  for (const flag of ['usesAccent', 'gradientText', 'darkWrapper', 'wechatSafe']) {
    assert.equal(typeof entry[flag], 'boolean', `缺 ${flag}`)
  }
})

test('自定义主题：路由把它加进清单、渲染真的走它、/state 能看出主题变了', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: `${ARTICLE}\n> 引用一句。\n`, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  const before = await callRoute(handler, { method: 'GET', url: '/fishpai/api/themes?sessionId=s1' })
  assert.equal(before.json.themes.length, 11, '没有自定义主题时清单还是 11 套内置主题')
  assert.ok(!before.json.themes.some((t) => t.key === 'custom'))

  custom.writeCustomTheme({ cwd, spec: { name: '灰底', base: 'elegant', styles: { blockquote: 'background: #f4f4f5;' } } })
  const after = await callRoute(handler, { method: 'GET', url: '/fishpai/api/themes?sessionId=s1' })
  assert.equal(after.json.themes.length, 12)
  assert.equal(after.json.themes.filter((t) => t.key === 'custom').length, 1, '只留一个占位，不能出现两次')
  // 不带 sessionId 的调用方拿不到它：这是**工作目录级**的东西，得先知道是哪个工作目录
  const noSession = await callRoute(handler, { method: 'GET', url: '/fishpai/api/themes' })
  assert.equal(noSession.json.themes.length, 11)

  const meta = await callRoute(handler, {
    method: 'POST',
    url: '/fishpai/api/meta',
    body: { sessionId: 's1', docKey: opened.key, meta: { theme: 'custom' } },
  })
  assert.equal(meta.status, 200)
  const preview = await callRoute(handler, { method: 'POST', url: '/fishpai/api/render', body: { sessionId: 's1', docKey: opened.key, mode: 'preview' } })
  assert.equal(preview.status, 200)
  assert.match(preview.json.html, /f4f4f5/, '自定义主题的声明要真的进预览')

  // 换主题**不动 revision**，所以面板只能靠这个字段发现（否则模型换完没反应）
  const st = await callRoute(handler, { method: 'GET', url: '/fishpai/api/state?sessionId=s1' })
  assert.equal(st.json.active.theme, 'custom')

  // 主题文件被删掉：静默退回默认，不留"选不中的状态"
  custom.clearCustomTheme(cwd)
  const st2 = await callRoute(handler, { method: 'GET', url: '/fishpai/api/state?sessionId=s1' })
  assert.equal(st2.json.active.theme, 'default')
  const doc = await callRoute(handler, { method: 'GET', url: `/fishpai/api/doc?sessionId=s1&docKey=${opened.key}` })
  assert.equal(doc.json.meta.theme, 'default')
})

test('POST /theme：面板的 × 删掉自定义主题，并让正用着它的文档退回默认', async () => {
  const cwd = tmpWorkspace()
  const opened = store.openDoc({ cwd, docPath: 'a.md', markdown: ARTICLE, by: 'ai' })
  store.setActive(cwd, 's1', opened.key)
  const handler = createApiHandler({ resolveCwd: () => cwd })

  // 没有自定义主题时删一次：什么都不动，也不是错
  const noop = await callRoute(handler, { method: 'POST', url: '/fishpai/api/theme', body: { sessionId: 's1', action: 'clear' } })
  assert.equal(noop.status, 200)
  assert.equal(noop.json.removed, false)

  custom.writeCustomTheme({ cwd, spec: { name: '灰底', base: 'elegant', styles: { p: 'line-height: 2;' } } })
  await callRoute(handler, { method: 'POST', url: '/fishpai/api/meta', body: { sessionId: 's1', docKey: opened.key, meta: { theme: 'custom' } } })
  assert.equal(store.readState(cwd, opened.key).theme, 'custom')

  const res = await callRoute(handler, { method: 'POST', url: '/fishpai/api/theme', body: { sessionId: 's1', action: 'clear' } })
  assert.equal(res.status, 200)
  assert.equal(res.json.removed, true)
  assert.equal(res.json.reverted, true, '当前文档正用着它，要退回默认')
  assert.equal(custom.readCustomTheme(cwd), null, '主题文件删掉了')
  assert.equal(store.readState(cwd, opened.key).theme, 'default', '文档状态也退回了')
  const after = await callRoute(handler, { method: 'GET', url: '/fishpai/api/themes?sessionId=s1' })
  assert.equal(after.json.themes.length, 11, '清单里「我的」那一组整个消失')

  // 别的 action 不认
  const bad = await callRoute(handler, { method: 'POST', url: '/fishpai/api/theme', body: { sessionId: 's1', action: 'nuke' } })
  assert.equal(bad.status, 400)
})

test('fishpai_theme：set 落盘并切当前文档，show/clear，非法规格给可读文案', async () => {
  const cwd = tmpWorkspace()
  const { tools, exec } = fakeHost(cwd)
  await tools.find((t) => t.name === 'fishpai_open').execute({ markdown: ARTICLE, theme: 'default' }, exec)
  const themeTool = tools.find((t) => t.name === 'fishpai_theme')

  const empty = await themeTool.execute({ action: 'show' }, exec)
  assert.equal(empty.isError, false)
  assert.match(empty.text, /还没有自定义主题/)

  const set = await themeTool.execute(
    { action: 'set', theme_spec: { name: '灰底', base: 'elegant', styles: { p: 'line-height: 2;' } } },
    exec,
  )
  assert.equal(set.isError, false, set.text)
  assert.match(set.text, /已保存/)
  assert.match(set.text, /已切到它/)
  assert.equal(custom.readCustomTheme(cwd).spec.name, '灰底')
  // 写完就切当前文档：不然用户得自己去面板里找那一项，"改了没反应"最劝退
  const key = store.activeKey(cwd, 's1')
  assert.equal(store.readState(cwd, key).theme, 'custom')

  const show = await themeTool.execute({ action: 'show' }, exec)
  assert.match(show.text, /灰底/)
  assert.match(show.text, /line-height: 2/)

  const bad = await themeTool.execute({ action: 'set', theme_spec: { base: 'default', styles: { p: 'position: fixed;' } } }, exec)
  assert.equal(bad.isError, true)
  assert.match(bad.text, /不支持的属性/)

  const cleared = await themeTool.execute({ action: 'clear' }, exec)
  assert.equal(cleared.isError, false)
  assert.match(cleared.text, /已移除/)
  assert.match(cleared.text, /退回/)
  assert.equal(store.readState(cwd, key).theme, 'default', '文档不能停在一个已经删掉的主题上')
})
