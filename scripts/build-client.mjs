/**
 * 把 `client/*.tsx` 打成 DSH 客户端 bundle（`lib/client.js`）。
 *
 * 产物形态是 DSH 客户端模块系统的唯一合法形态：
 *   `window.__ModuleLoader__.load({ id, factory: (require) => exports })`
 * 其中 `require` 由模块表提供（react / react-dom / @deepseek-ai/* 都是它给的），
 * 所以这些包一律 external，绝不能打进 bundle（打进去会出现两份 React）。
 *
 * 产物必须提交入库：`dsh plugin add github:` 只做安装，不跑构建。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = path.join(ROOT, 'client', 'index.tsx')
const OUT = path.join(ROOT, 'lib', 'client.js')
const PLUGIN_ID = 'dsh-fishpai'

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
})

const code = result.outputFiles[0].text
const indented = code
  .split('\n')
  .map((line) => (line ? `      ${line}` : line))
  .join('\n')

const banner = `/**
 * 自动生成，请勿手改 —— 源码在 client/，用 \`npm run build\` 重新生成。
 * 改完记得把本文件一起提交：\`dsh plugin add github:\` 只安装、不构建。
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PLUGIN_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${indented}
    return module.exports;
  },
});
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, banner, 'utf8')
const kb = (Buffer.byteLength(banner, 'utf8') / 1024).toFixed(1)
console.log(`[build-client] client/*.tsx → lib/client.js（${kb} KB）`)
