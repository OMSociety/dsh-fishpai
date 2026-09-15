/**
 * 宿主插件的**真实挂载**测试：在真正的 Cordis 里跑一遍 `apply()`。
 *
 * 为什么值得单独一个文件：`ctx.effect` / `ctx.inject` / `ctx.get` / `ctx.provide` 的语义
 * 只有真库才知道（比如"`ctx.inject` 的回调是异步的"就是真库行为，桩里同步触发会掩盖竞态）。
 * 这一层挂得起来，安装到 DSH 里才谈得上能跑。
 *
 * 这里只搭最小的服务面：webServer / sessions / tools / skills，其余用不上。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../plugin/index.mjs'

/** 搭一个最小宿主：四个服务 + 一块临时工作目录。 */
function makeApp(cwd) {
  const app = new Context()
  const registeredTools = []
  const routes = []
  const skills = []
  const sessions = new Map([['s1', { header: { cwd } }]])

  app.provide('webServer', {
    register(route) {
      routes.push(route)
      return () => {
        const i = routes.indexOf(route)
        if (i >= 0) routes.splice(i, 1)
      }
    },
  })
  app.provide('sessions', {
    get: (id) => sessions.get(id),
    list: () => [...sessions.values()],
  })
  app.provide('tools', {
    register(tool) {
      registeredTools.push(tool)
      return () => {
        const i = registeredTools.indexOf(tool)
        if (i >= 0) registeredTools.splice(i, 1)
      }
    },
  })
  app.provide('skills', {
    register(definition) {
      // 照真注册器的默认值补 invocation / provider（source 不补——那正是那个坑）
      const stored = {
        ...definition,
        invocation: definition.invocation ?? { modelInvocable: true, userInvocable: true },
        provider: definition.provider ?? 'runtime',
      }
      skills.push(stored)
      return () => {
        const i = skills.indexOf(stored)
        if (i >= 0) skills.splice(i, 1)
      }
    },
  })

  return { app, registeredTools, routes, skills }
}

const flush = async (times = 8) => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
test('宿主插件能在真实 Cordis 里挂载，并注册五个工具、一条路由、一个技能', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const cwd = fs.realpathSync.native ? fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-mount-'))) : fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-mount-'))

  const { app, registeredTools, routes, skills } = makeApp(cwd)
  const fiber = app.plugin(plugin)
  await fiber
  await flush()

  assert.deepEqual(
    registeredTools.map((t) => t.name).sort(),
    ['fishpai_open', 'fishpai_read', 'fishpai_render', 'fishpai_theme', 'fishpai_write'],
  )
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, '/fishpai/api')
  assert.equal(typeof routes[0].handler, 'function')
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'fishpai')
  assert.match(skills[0].description, /公众号/)
  assert.equal(skills[0].resourceBase.kind, 'directory')
  // runtime 技能被 load 时会走 validateDefinition：source / provider / content 必须是字符串。
  // 只给 name/description/content 时，技能在目录里看得见、一加载就报
  // "loaded skill ... source must be a string"（注册器只补 provider，不补 source）。
  assert.equal(typeof skills[0].source, 'string', 'source 必须显式给')
  assert.equal(skills[0].source, 'bundled')
  assert.equal(typeof skills[0].provider, 'string')
  assert.equal(typeof skills[0].content, 'string')
  assert.ok(skills[0].content.length > 100, '技能正文不能为空')

  // 真库这一侧：工具能跑通"新建 → 读"
  const open = registeredTools.find((t) => t.name === 'fishpai_open')
  const read = registeredTools.find((t) => t.name === 'fishpai_read')
  const exec = { agent: { session: { id: 's1' } } }
  const opened = await open.execute({ markdown: '# 标题\n\n正文。\n' }, exec)
  assert.equal(opened.isError, false, opened.text)
  const readBack = await read.execute({ include: 'summary' }, exec)
  assert.equal(readBack.isError, false, readBack.text)
  // 钉住**唯一**那一支：`open({markdown})` 刚建好文档、baseline 就是这一版，
  // 所以这里必然是"没有改动正文"。写成三选一等于没有判据（任一支命中都算过）。
  assert.match(readBack.text, /自你上次写入以来，用户没有改动正文/)
  assert.doesNotMatch(readBack.text, /还没有基线|无法计算/)

  // 卸载要把所有贡献收干净
  await fiber.dispose()
  await flush()
  assert.equal(registeredTools.length, 0, '卸载后不应残留工具')
  assert.equal(routes.length, 0, '卸载后不应残留路由')
  assert.equal(skills.length, 0, '卸载后不应残留技能')
})

test('缺少 webServer 时照样挂载（工具与技能仍然可用）', async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fishpai-noweb-'))

  const app = new Context()
  app.provide('webServer', undefined) // 服务存在但没有实现：插件应当降级，而不是挂不起来
  app.provide('sessions', { get: () => ({ header: { cwd } }), list: () => [] })
  const tools = []
  app.provide('tools', {
    register(tool) {
      tools.push(tool)
      return () => {
        const i = tools.indexOf(tool)
        if (i >= 0) tools.splice(i, 1)
      }
    },
  })
  const skills = []
  app.provide('skills', {
    register(definition) {
      // 照真注册器的默认值补 invocation / provider（source 不补——那正是那个坑）
      const stored = {
        ...definition,
        invocation: definition.invocation ?? { modelInvocable: true, userInvocable: true },
        provider: definition.provider ?? 'runtime',
      }
      skills.push(stored)
      return () => {
        const i = skills.indexOf(stored)
        if (i >= 0) skills.splice(i, 1)
      }
    },
  })

  const fiber = app.plugin(plugin)
  await fiber
  await flush()

  assert.equal(tools.length, 5, '没有 webServer 时工具仍应注册')
  assert.equal(skills.length, 1, '没有 webServer 时技能仍应注册')
  await fiber.dispose()
  await flush()
  assert.equal(tools.length, 0)
  assert.equal(skills.length, 0)
})
