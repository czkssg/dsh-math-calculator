/**
 * 整合验收测试：验证拼装后的插件是一个完整可用的整体。
 *
 * 与单功能测试不同，这里只关心「装起来对不对」：
 *   1. 入口契约（apply/name/inject）
 *   2. 工具注册与 25 个 operation 全部可达
 *   3. 三个钩子（systemPrompt / agent-pre-step / server route）都能注册
 *   4. client 产物是宿主能认的格式
 *   5. package.json / cordis.patch.yml / exports 三者一致
 *   6. 跨模块协作：workspace → constants → formula 真正串起来
 */
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makeCordisCtx, makeFakeWebServer } from './_host-mocks.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-integ-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. 入口契约 --')
{
  assert('导出 name', typeof mod.name === 'string' && mod.name === 'dsh-math-calculator', mod.name)
  assert('导出 apply', typeof mod.apply === 'function')
  assert('inject 恰好是 [tools]（可选服务必须走 ctx.get，不能写进 inject）',
    Array.isArray(mod.inject) && mod.inject.length === 1 && mod.inject[0] === 'tools',
    JSON.stringify(mod.inject))
  // 回归：曾经导出 injectOptional，而 cordis 4 根本没有这个 API。
  // 它骗过了所有测试，代价是插件在真宿主里 entry did not activate、工具从未注册。
  assert('不再导出 injectOptional（cordis 无此 API）', mod.injectOptional === undefined,
    String(mod.injectOptional))
  assert('默认导出完整', mod.default && mod.default.apply === mod.apply)
}

console.log('-- 2. 工具注册与 operation 全覆盖（在复刻 cordis 契约的 ctx 上）--')
const webServer = makeFakeWebServer()
const captured = { tool: null, section: null }
const host = makeCordisCtx({
  inject: mod.inject,
  services: {
    tools: {
      register: (def) => {
        captured.tool = def
        return () => {}
      },
    },
    systemPrompt: {
      section: (spec) => {
        captured.section = spec
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
assert('apply 在真实 ctx 契约下不抛异常', applyError === null, applyError ? applyError.message : '')

const stub = { tool: captured.tool, hooks: host.hooks, promptSection: captured.section, webServer }

{
  assert('注册了工具', Boolean(stub.tool))
  assert('工具名是 math_execute', stub.tool.name === 'math_execute', stub.tool.name)
  const ops = stub.tool.parameters.properties.operation.enum
  const expected = ['auto','evaluate','solve','system','derivative','integral','simplify','expand','roots','matrix','eigen','stats','dist','regression','formula','formulas','ode','world','constants','workspace','impact','quantities','formula-table','feasibility','help']
  const missing = expected.filter((op) => !ops.includes(op))
  assert('全部 25 个 operation 都在 schema 里', missing.length === 0,
    '缺失: ' + missing.join(', '))
  assert('operation 数量 = 26', ops.length === 26, String(ops.length))
  assert('有 output.schema', Boolean(stub.tool.output && stub.tool.output.schema))
  assert('有 output.render', typeof stub.tool.output.render === 'function')
}

console.log('-- 3. 三个提醒层 + UI 路由都按真契约注册了 --')
{
  assert('注册了 agent/pre-step', Boolean(stub.hooks && stub.hooks['agent/pre-step']))
  assert('注册了 systemPrompt.section', Boolean(stub.promptSection))
  const exact = webServer.routes.exact.get('/api/dsh-math-calculator')
  const prefix = webServer.routes.prefix.get('/api/dsh-math-calculator')
  assert('注册了 exact 路由 /api/dsh-math-calculator', exact !== undefined)
  assert('注册了 prefix 路由 /api/dsh-math-calculator', prefix !== undefined)
  // 回归：prefix 带尾斜杠 = 永远匹配不上子路径（宿主判据自带斜杠）
  assert('prefix 路径不带尾斜杠', prefix !== undefined && prefix.path === '/api/dsh-math-calculator',
    prefix ? prefix.path : '未注册')
}

console.log('-- 4. 每个 operation 都能实际执行 --')
{
  // 用最小参数跑一遍，只看是否 ok 或有结构化错误（不能抛异常）
  const probes = [
    { expression: '1+1' },
    { expression: 'x^2 = 4', operation: 'solve' },
    { expression: 'x^3', operation: 'derivative' },
    { expression: 'x^2', operation: 'integral' },
    { expression: '2*x+3*x', operation: 'simplify' },
    { expression: '(x+1)^2', operation: 'expand' },
    { expression: 'x^2-1', operation: 'roots' },
    { expression: '[[1,2],[3,4]]', operation: 'matrix' },
    { matrix: [[2,1],[1,2]], operation: 'eigen' },
    { data: [1,2,3,4], operation: 'stats' },
    { distribution: 'normal', params: [0,1], x: 0, operation: 'dist' },
    { data: [1,2,3], dataY: [2,4,6], operation: 'regression' },
    { expression: 'dy/dt = y', initial: { y: 1 }, from: 0, to: 1, operation: 'ode' },
    { operation: 'world' },
    { operation: 'quantities' },
    { operation: 'feasibility' },
    { operation: 'workspace', action2: 'list' },
    { operation: 'formulas', query: '重力' },
    { operation: 'help' },
  ]
  let executed = 0
  let threw = 0
  for (const probe of probes) {
    try {
      const r = await stub.tool.execute(probe, {})
      if (r && typeof r.ok === 'boolean') executed++
    } catch {
      threw++
    }
  }
  assert('全部探针都返回结构化结果', executed === probes.length,
    executed + '/' + probes.length)
  assert('没有任何探针抛异常', threw === 0, String(threw))
}

console.log('-- 5. client 产物格式（宿主能否加载）--')
{
  const clientPath = join(root, 'lib/client.js')
  assert('client.js 存在', existsSync(clientPath))

  const source = readFileSync(clientPath, 'utf8')
  assert('是脚本格式（无顶层 import/export）',
    !/^(import |export )/m.test(source),
    (source.match(/^(import |export )/m) || [''])[0])
  assert('用 __ModuleLoader__ 注册', source.includes('__ModuleLoader__'))
  assert('有 factory', source.includes('factory'))
  assert('声明了 slots 依赖', source.includes("inject: ['slots']") || source.includes('inject:["slots"]'))

  // 在模拟的浏览器环境里加载它
  let loadedSpec = null
  const fakeWindow = {
    __ModuleLoader__: {
      load: (spec) => {
        loadedSpec = spec
      },
    },
  }
  // 用 vm 跑，模拟浏览器
  const vm = await import('node:vm')
  const context = vm.createContext({ window: fakeWindow, console, setTimeout, Promise, fetch: () => Promise.reject(new Error('no fetch')) })
  try {
    vm.runInContext(source, context)
    assert('client.js 能在脚本环境执行', true)
    assert('向 loader 注册了模块', Boolean(loadedSpec))
    // 宿主按包名查找 client 模块：id 必须是包名（真机事故，见 docs/handoff）
    assert('模块 id 等于包名', loadedSpec && loadedSpec.id === 'dsh-math-calculator',
      loadedSpec ? loadedSpec.id : '')
    // 调用 factory
    const fakeRequire = () => ({ createElement: () => null, useState: () => [{}, () => {}], useEffect: () => {}, useCallback: (fn) => fn })
    const mod2 = loadedSpec.factory(fakeRequire)
    assert('factory 返回 apply', typeof mod2.apply === 'function')
    assert('factory 返回 inject', Array.isArray(mod2.inject) && mod2.inject.includes('slots'),
      JSON.stringify(mod2.inject))
  } catch (error) {
    bad('client.js 在脚本环境执行', error.message)
  }
}

console.log('-- 6. manifest 三者一致 --')
{
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert('name 与入口导出一致', pkg.name === mod.name, pkg.name + ' vs ' + mod.name)
  assert('main 指向 lib/index.js', pkg.main === 'lib/index.js', pkg.main)
  assert('有 dsh.bundle.patch', Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
  assert('有 dsh.client 声明', Boolean(pkg.dsh && pkg.dsh.client))
  assert('exports 有 ./client', Boolean(pkg.exports && pkg.exports['./client']))
  assert('exports 有 ./package.json', Boolean(pkg.exports && pkg.exports['./package.json']))
  assert('deps 含 mathjs', Boolean(pkg.dependencies && pkg.dependencies.mathjs))
  assert('deps 含 algebrite', Boolean(pkg.dependencies && pkg.dependencies.algebrite))
  assert('没有运行期 @deepseek-ai 依赖（只 peer）',
    !Object.keys(pkg.dependencies || {}).some((k) => k.startsWith('@deepseek-ai/')),
    JSON.stringify(Object.keys(pkg.dependencies || {})))

  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert('patch 用 insert 包裹', patch.includes('- insert:'))
  assert('patch 里的 name 与包名一致', patch.includes("name: 'dsh-math-calculator'"))
  assert('patch 的 id 是 math-calc', patch.includes('id: math-calc'))
}

console.log('-- 7. 跨模块协作（整合的核心）--')
{
  const exec = (a) => mod.runMathTool(a)

  // 建工作区
  const created = exec({ operation: 'workspace', action2: 'create', workspace: 'integ-world' })
  assert('创建世界观', created.ok, created.error?.message)

  // 改常数
  const changed = exec({ operation: 'constants', constants: { c: 1.5e8, G: 1.3e-10 } })
  assert('改常数', changed.ok, changed.error?.message)

  // 常数应立刻反映在公式里
  const mass = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const expected = Math.pow(1.5e8, 2)
  assert('公式立即用新常数', Math.abs(Number(mass.value.answer) - expected) / expected < 1e-6,
    Number(mass.value.answer).toExponential(4) + ' vs ' + expected.toExponential(4))

  // quantities 应看到 g 变了（因为 G 变了）
  const quant = exec({ operation: 'quantities', constants: { G: 1.3e-10 } })
  assert('quantities 报告受影响量', quant.ok && quant.value.bounded.some((b) => b.changed),
    quant.ok ? 'ok' : quant.error?.message)

  // impact 应报告公式偏差
  const impact = exec({ operation: 'impact', constants: { c: 1.5e8 } })
  assert('impact 报告受影响公式', impact.ok && impact.value.affected > 0,
    impact.ok ? String(impact.value.affected) : impact.error?.message)

  // feasibility 用同一套世界参数
  const feas = exec({
    operation: 'feasibility',
    world: { planetMass: 2 },
    claims: { creatureHeight: 50 },
  })
  assert('feasibility 检出超限', feas.ok && feas.value.violations.length > 0,
    feas.ok ? JSON.stringify(feas.value.violations) : feas.error?.message)

  // 切回另一工作区，常数应隔离
  exec({ operation: 'workspace', action2: 'create', workspace: 'integ-pure' })
  const pure = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  const real = Math.pow(299792458, 2)
  assert('新工作区用现实常数（隔离生效）',
    Math.abs(Number(pure.value.answer) - real) / real < 1e-6,
    Number(pure.value.answer).toExponential(4) + ' vs ' + real.toExponential(4))

  // 切回去，常数还在
  exec({ operation: 'workspace', action2: 'switch', workspace: 'integ-world' })
  const back = exec({ operation: 'formula', formula: 'mass_energy', overrides: { m: 1 } })
  assert('切回后常数恢复', Math.abs(Number(back.value.answer) - expected) / expected < 1e-6,
    Number(back.value.answer).toExponential(4))
}

console.log('-- 8. API 路由与工具行为一致 --')
{
  const { handleApiRequest } = await import(pathToFileURL(join(root, 'lib/api.js')).href)
  const listViaApi = handleApiRequest('/workspaces', { method: 'GET' })
  const listViaTool = mod.runMathTool({ operation: 'workspace', action2: 'list' })
  assert('API 与工具看到同一批工作区',
    listViaApi.json.workspaces.length === listViaTool.value.workspaces.length,
    listViaApi.json.workspaces.length + ' vs ' + listViaTool.value.workspaces.length)

  const statsViaApi = handleApiRequest('/workspaces/stats', { method: 'GET' })
  assert('API stats 有数据', statsViaApi.status === 200 && typeof statsViaApi.json.totalBytes === 'number')
}

rmSync(home, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
