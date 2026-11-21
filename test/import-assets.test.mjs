import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadImportedImage } from '../plugin/host/import-assets.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-import-assets-'))
}

test('下载公开栅格图片并返回文档相对 assets 路径', async () => {
  const cwd = workspace()
  const result = await downloadImportedImage('https://example.com/a.png', {
    cwd,
    docPath: path.join(cwd, 'article.md'),
    lookup: publicLookup,
    fetchImpl: async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }),
  })
  assert.match(result.src, /^assets\/.+\.png$/)
  assert.deepEqual(fs.readFileSync(result.path), PNG)
  assert.equal(fs.statSync(result.path).size, PNG.length)
  assert.equal(result.mime, 'image/png')
})

test('内容类型与字节签名不一致时拒绝落盘', async () => {
  const cwd = workspace()
  await assert.rejects(() => downloadImportedImage('https://example.com/a.png', {
    cwd,
    docPath: path.join(cwd, 'article.md'),
    lookup: publicLookup,
    fetchImpl: async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  }), /类型不一致/)
  assert.equal(fs.existsSync(path.join(cwd, 'assets')), false)
})

test('图片重定向到私有地址时拒绝', async () => {
  const cwd = workspace()
  await assert.rejects(() => downloadImportedImage('https://example.com/a.png', {
    cwd,
    docPath: path.join(cwd, 'article.md'),
    lookup: publicLookup,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private.png' } }),
  }), /本机或私有网络/)
})
