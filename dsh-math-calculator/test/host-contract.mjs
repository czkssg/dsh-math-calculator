/**
 * 宿主契约回归套件。
 *
 * 这一套存在的唯一目的：**让「插件在真宿主里装不起来」这类事故不再静默通过测试。**
 *
 * 历史事故（都在真机验证里才暴露，而当时 1008 项测试全绿）：
 *   1. `apply` 里直接读 `ctx.systemPrompt`。cordis 的 ctx 是 Proxy，读未在 `inject`
 *      声明的服务会抛 `cannot get property "systemPrompt" without inject`，整个 entry
 *      判为 did not activate —— **工具从未注册**。原因：当时的桩 ctx 是普通对象，
 *      直接读属性永远不报错，测试根本碰不到这条契约。
 *   2. UI 路由写成 `ctx.server.route(prefix, req => response)`。宿主既没有 `server`
 *      服务也没有 `route()` 方法。真契约是 `ctx.inject(['webServer'], cb)` +
 *      `webServer.register({ kind, path, handler })`，handler 是 `(req, res)`。
 *   3. prefix 路由注册成了 `/api/dsh-math-calculator/`（带尾斜杠）。宿主判据是
 *      `pathname === prefix || pathname.startsWith(prefix + '/')`，于是除了裸斜杠路径
 *      之外永远匹配不上 —— 面板所有子接口静默落到宿主的 /api 栅栏拿 401。
 *
 * 所以本套件的做法是：**先证明桩本身是忠实的（第 0 节），再在桩上跑真行为**。
 * 见 `test/_host-mocks.mjs`。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makeCordisCtx, makeFakeWebServer, callRoute } from './_host-mocks.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-hostcontract-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 0. 桩自身的忠实度（先证明这套测试抓得住问题）--')
{
  const probe = makeCordisCtx({ inject: ['tools'], services: { tools: {}, systemPrompt: {} } })

  let threw = null
  try {
    void probe.ctx.systemPrompt
  } catch (error) {
    threw = error
  }
  assert('未 inject 的服务「直接读」会抛 —— 与真宿主一致',
    threw instanceof Error && /without inject/.test(threw.message),
    threw ? threw.message : '没有抛（桩太宽松，测试会失效）')

  assert('ctx.get 能读到未 inject 的服务',
    probe.ctx.get('systemPrompt') !== undefined)
  assert('ctx.get 读不存在的服务返回 undefined',
    probe.ctx.get('definitely-missing') === undefined)

  const ws = makeFakeWebServer()
  ws.register({ kind: 'prefix', path: '/api/x', handler: () => {} })
  assert('宿主前缀判据：/api/x 命中', ws.match('/api/x') !== undefined)
  assert('宿主前缀判据：/api/x/y 命中', ws.match('/api/x/y') !== undefined)
  assert('宿主前缀判据：/api/xy 不命中（边界由宿主保证）', ws.match('/api/xy') === undefined)

  let dup = null
  try {
    ws.register({ kind: 'prefix', path: '/api/x', handler: () => {} })
  } catch (error) {
    dup = error
  }
  assert('同一张表内重复 path 抛错', dup instanceof Error, dup ? dup.message : '没有抛')
}

console.log('-- 1. 在 cordis 真契约的 ctx 上装载 --')
const webServer = makeFakeWebServer()
const holder = { tool: null, section: null }
const host = makeCordisCtx({
  inject: mod.inject,
  services: {
    tools: {
      register: (def) => {
        holder.tool = def
        return () => {}
      },
    },
    systemPrompt: {
      section: (spec) => {
        holder.section = spec
        return () => {}
      },
    },
    webServer,
  },
})

let applyError = null
try {
  mod.apply(host.ctx)
} catch (error) {
  applyError = error
}

assert('apply 不抛异常（真宿主里抛出去 = entry did not activate）',
  applyError === null, applyError ? applyError.message : '')
assert('工具已注册', holder.tool !== null && holder.tool.name === 'math_execute',
  holder.tool ? holder.tool.name : '未注册')
assert('systemPrompt 走 ctx.get 拿到了 spec', holder.section !== null)
assert('agent/pre-step 钩子已注册', typeof host.hooks['agent/pre-step'] === 'function')
assert('用 ctx.inject([webServer]) 挂路由（不是 ctx.server）',
  host.injected.some((entry) => entry.names.includes('webServer')),
  JSON.stringify(host.injected.map((entry) => entry.names)))

console.log('-- 2. 路由注册形状 --')
{
  const exact = webServer.routes.exact.get('/api/dsh-math-calculator')
  const prefix = webServer.routes.prefix.get('/api/dsh-math-calculator')
  assert('exact 路由已注册', exact !== undefined)
  assert('prefix 路由已注册', prefix !== undefined)
  assert('prefix 路径**不带尾斜杠**（带了就永远匹配不上子路径）',
    prefix !== undefined && prefix.path === '/api/dsh-math-calculator',
    prefix ? prefix.path : '未注册')
  assert('handler 是 (req, res) 两参形态',
    typeof (prefix && prefix.handler) === 'function' && prefix.handler.length === 2,
    prefix ? String(prefix.handler.length) + ' 参' : '未注册')
  assert('没有去碰宿主的 server 服务', host.store.has('server') === false)
}

console.log('-- 3. 走宿主派发路径的真实 HTTP 行为 --')
{
  const base = await callRoute(webServer, 'GET', '/api/dsh-math-calculator')
  assert('GET 裸入口 → 200', base.status === 200 && Array.isArray(base.json.workspaces),
    base.status + ' ' + JSON.stringify(base.json))

  const list = await callRoute(webServer, 'GET', '/api/dsh-math-calculator/workspaces')
  assert('GET /workspaces → 200（尾斜杠 bug 的回归点）',
    list.status === 200 && Array.isArray(list.json.workspaces), list.status + ' ' + JSON.stringify(list.json))

  const stats = await callRoute(webServer, 'GET', '/api/dsh-math-calculator/workspaces/stats')
  assert('GET /workspaces/stats → 200',
    stats.status === 200 && typeof stats.json.totalBytes === 'number', stats.status + ' ' + JSON.stringify(stats.json))

  const created = await callRoute(webServer, 'POST', '/api/dsh-math-calculator/workspaces/create',
    { body: JSON.stringify({ name: 'hc', description: 'host contract' }) })
  assert('POST /workspaces/create → 200 且真的建了',
    created.status === 200 && created.json.created === true, created.status + ' ' + JSON.stringify(created.json))

  const detail = await callRoute(webServer, 'GET', '/api/dsh-math-calculator/workspaces/hc')
  assert('GET /workspaces/hc → 200（动态详情段可达）',
    detail.status === 200 && detail.json.name === 'hc', detail.status + ' ' + JSON.stringify(detail.json))

  const saved = await callRoute(webServer, 'POST', '/api/dsh-math-calculator/workspaces/save-constant',
    { body: JSON.stringify({ name: 'hc', constantName: 'c_light', value: 3.0e8 }) })
  assert('POST /workspaces/save-constant → 200',
    saved.status === 200 && saved.json.saved === true, saved.status + ' ' + JSON.stringify(saved.json))

  const unknown = await callRoute(webServer, 'GET', '/api/dsh-math-calculator/nope')
  assert('未知路径 GET → 404（不是 405）', unknown.status === 404, String(unknown.status))

  const wrongMethod = await callRoute(webServer, 'PUT', '/api/dsh-math-calculator/workspaces/switch')
  assert('已知道路 + 错方法 → 405', wrongMethod.status === 405, String(wrongMethod.status))

  const unknownPut = await callRoute(webServer, 'PUT', '/api/dsh-math-calculator/nope')
  assert('未知路径 + 非 POST → 404', unknownPut.status === 404, String(unknownPut.status))

  const lan = await callRoute(webServer, 'GET', '/api/dsh-math-calculator/workspaces',
    { remoteAddress: '192.168.1.9' })
  assert('非回环来源 → 403（这些接口能删工作区）', lan.status === 403, String(lan.status))

  const boundary = await callRoute(webServer, 'GET', '/api/dsh-math-calculator-other')
  assert('前缀之外的相邻路径不命中（交给宿主栅栏）', boundary.matched === false,
    boundary.matched ? '竟然命中了' : '')

  const created2 = await callRoute(webServer, 'POST', '/api/dsh-math-calculator/workspaces/delete',
    { body: JSON.stringify({ name: 'hc' }) })
  assert('POST /workspaces/delete → 200', created2.status === 200 && created2.json.deleted === true,
    created2.status + ' ' + JSON.stringify(created2.json))
}

console.log('-- 4. 数据目录解析（必须跟随 DSH_HOME）--')
{
  const { workspaceDirectory } = await import(pathToFileURL(join(root, 'lib/workspace.js')).href)
  const savedCalc = process.env.DSH_MATH_CALC_HOME
  const savedHome = process.env.DSH_HOME

  delete process.env.DSH_MATH_CALC_HOME
  delete process.env.DSH_HOME
  const fallback = workspaceDirectory()
  assert('无任何覆盖 → ~/.dsh/math-calc/workspaces',
    /\.dsh[\\/]math-calc[\\/]workspaces$/.test(fallback), fallback)

  process.env.DSH_HOME = join(home, 'probe-home')
  const followed = workspaceDirectory()
  assert('设置了 DSH_HOME → 跟着走（隔离验证不再污染真实家目录）',
    followed === join(home, 'probe-home', 'math-calc', 'workspaces'), followed)

  process.env.DSH_MATH_CALC_HOME = join(home, 'probe-calc')
  const overridden = workspaceDirectory()
  assert('DSH_MATH_CALC_HOME 优先级最高',
    overridden === join(home, 'probe-calc', 'workspaces'), overridden)

  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  process.env.DSH_MATH_CALC_HOME = savedCalc
}

rmSync(home, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}