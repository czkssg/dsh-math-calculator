/**
 * AI 全链路验收：作者说一句话，AI 该走的那条链能不能真的走通。
 *
 * ## 为什么要有这一套
 *
 * 交接文档把「验证 AI 全链路」列为未完成事项，但原来的验证方式是**人肉真机**
 * （重启 DSH、在对话里说句话、肉眼观察）。那种验证不可重复、也不进回归。
 *
 * 这一套把那条链**逐字复刻成路由调用**，用宿主 mock（`_host-mocks.mjs`）跑：
 *
 *   作者：「我要个重力 1.5 倍、能住人的世界」
 *   AI：
 *     1. GET  /world-params          先看哪些能改（基础量清单）
 *     2. POST /solve-anchor          从锚点反解出该改 planetMass
 *     3. POST /workspaces/save-world 只写基础量（派生量写不进去）
 *     4. POST /summary               全量重算：派生量+生物+文明+环境
 *     5. POST /derive {sub:dead}     能不能住
 *
 * 断言的重点不是「路由存在」（integration.mjs 已查），而是**这条链走完之后
 * 世界是自洽的**：存进去的只有基础量、重力确实是 1.5 g、派生量一个都没入库。
 *
 * 这套测试跑在真路由派发上（`callRoute` 逐字复刻宿主 `match()` 与请求处理），
 * 不是直接调函数——所以路由顺序错误、前缀错误、handler 契约错误都会在这里暴露。
 *
 * ## 响应形状备注（这些不是 {ok, value} 包装，是裸对象）
 *
 *   GET  /world-params          → { groups: [{ group, params: [...] }] }
 *   POST /solve-anchor          → { kind, solved, changes, reasons, sideEffects }
 *   POST /workspaces/save-world → { saved, name, world }
 *   GET  /workspaces/current    → { name, world, constants, ... }
 *   POST /summary               → { params, derived, biology, civilization, environment, verdict }
 *   POST /derive                → { result: <渲染文本>, value: { subcommand, dead } }
 *
 * @module test/ai-journey
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makeCordisCtx, makeFakeWebServer, callRoute } from './_host-mocks.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-journey-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

// ── 装配（与 integration.mjs 同样的方式：真契约的 ctx + 假 webserver）──
const webServer = makeFakeWebServer()
const host = makeCordisCtx({
  inject: mod.inject,
  services: {
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
    webServer,
  },
})
mod.apply(host.ctx)

const BASE = '/api/dsh-math-calculator'

/** POST 一个 JSON 到插件路由。 */
async function post(path, body) {
  return callRoute(webServer, 'POST', BASE + path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

/** GET 一个插件路由。 */
async function get(path) {
  return callRoute(webServer, 'GET', BASE + path)
}

/** 取当前工作区存着的 world 对象。 */
async function currentWorld() {
  const r = await get('/workspaces/current')
  return (r.json && r.json.world) || {}
}

// 从干净的地球开始（每个套件有自己的临时 home，这里再显式重置一次）
await post('/workspaces/reset-world', {})

console.log('-- 0. 路由可达（否则后面全是假失败）--')
{
  const params = await get('/world-params')
  assert('GET /world-params 路由命中', params.matched, String(params.status))
  assert('world-params 返回 200', params.status === 200, String(params.status))
  const solved = await post('/solve-anchor', { kind: 'gravity', wanted: 1.5 })
  assert('POST /solve-anchor 路由命中', solved.matched, String(solved.status))
  const saved = await post('/workspaces/save-world', { world: { planetMass: 1.5 } })
  assert('POST /workspaces/save-world 路由命中', saved.matched, String(saved.status))
  const sum = await post('/summary', {})
  assert('POST /summary 路由命中', sum.matched, String(sum.status))
  const dead = await post('/derive', { sub: 'dead' })
  assert('POST /derive 路由命中', dead.matched, String(dead.status))
}

console.log('-- 1. 作者说「重力 1.5 倍」，AI 先看能改哪些参数 --')
{
  const r = await get('/world-params')
  const groups = (r.json && r.json.groups) || []
  assert('给了分组清单', groups.length > 0, String(groups.length))
  const params = groups.flatMap(function (g) { return g.params || [] })
  assert('参数清单非空', params.length > 0, String(params.length))
  // 关键：清单里绝不能有派生量，否则 AI 会以为可以硬设重力
  const keys = params.map(function (item) { return item.key })
  assert('清单里没有 gravity（派生量只读）', keys.indexOf('gravity') === -1, keys.join(','))
  assert('清单里没有 surfaceMeanK（派生量只读）', keys.indexOf('surfaceMeanK') === -1)
  assert('清单里有 planetMass（基础量可写）', keys.indexOf('planetMass') !== -1)
  assert('至少 20 个基础量', keys.length >= 20, String(keys.length))
  assert('每个参数都写明改了影响什么',
    params.every(function (item) { return typeof item.affects === 'string' && item.affects.length > 0 }),
    String(params.length))
  assert('每个参数都有单位与中文名',
    params.every(function (item) { return typeof item.label === 'string' && typeof item.unit === 'string' }),
    String(params.length))
}

console.log('-- 2. 「重力 1.5 倍」 → 反解出 planetMass = 1.5 --')
{
  const r = await post('/solve-anchor', { kind: 'gravity', wanted: 1.5 })
  const v = r.json || {}
  assert('反解成功', v.solved === true, String(v.why))
  // 半径保持 1 时 M = g_target × R² = 1.5
  assert('planetMass = 1.5', Math.abs((v.changes || {}).planetMass - 1.5) < 1e-9,
    String((v.changes || {}).planetMass))
  assert('没有建议改 gravity 本身', (v.changes || {}).gravity === undefined,
    JSON.stringify(v.changes))
  const labels = (v.sideEffects || []).map(function (item) { return item.label })
  assert('给了连带效应（≥2 条）', labels.length >= 2, String(labels.length))
  assert('连带效应含逃逸速度', labels.indexOf('逃逸速度') !== -1, labels.join(','))
  assert('连带效应含大气标高', labels.indexOf('大气标高') !== -1, labels.join(','))
  // 连带效应必须有前后对比值，AI 才能转述「会变成什么」
  assert('连带效应带前后对比',
    (v.sideEffects || []).every(function (item) { return item.before && item.after }),
    JSON.stringify(v.sideEffects))
  assert('说明了为什么（讲给作者听的理由）', Boolean(v.reasons && v.reasons.length > 0),
    (v.reasons || [])[0] || '')
  // 铁律：措辞不反驳用户
  assert('反解措辞不反驳用户', !/错误|禁止|必须/.test(JSON.stringify(v)), '')
}

console.log('-- 3. 把反解结果存进世界（只写基础量）--')
{
  const anchor = await post('/solve-anchor', { kind: 'gravity', wanted: 1.5 })
  const changes = ((anchor.json || {}).changes) || {}
  // 模拟 AI 的正确做法：把 changes 交给 save-world
  const saved = await post('/workspaces/save-world', { world: changes })
  const v = saved.json || {}
  assert('保存成功', v.saved === true, JSON.stringify(v))
  assert('存进去的 planetMass = 1.5', Math.abs((v.world || {}).planetMass - 1.5) < 1e-9,
    String((v.world || {}).planetMass))
  assert('存进去的没有 gravity 字段', (v.world || {}).gravity === undefined,
    JSON.stringify((v.world || {}).gravity))

  // 恶意/旧代码：试图把派生量写进去
  const bad = await post('/workspaces/save-world', { world: { gravity: 99, surfaceMeanK: 999 } })
  assert('硬塞派生量不报错但也不生效（不是 400 崩掉）', bad.status === 200, String(bad.status))
  const world = await currentWorld()
  assert('派生量确实没入库', world.gravity === undefined, JSON.stringify(world.gravity))
  assert('surfaceMeanK 也进不去', world.surfaceMeanK === undefined, JSON.stringify(world.surfaceMeanK))
  assert('planetMass 没被派生量覆盖', Math.abs(world.planetMass - 1.5) < 1e-9,
    String(world.planetMass))
}

console.log('-- 4. 全量重算：重力确实是 1.5 g --')
{
  const r = await post('/summary', {})
  const v = r.json || {}
  const gravity = (v.derived || []).find(function (item) { return item.key === 'gravity' })
  assert('拿到重力派生量', Boolean(gravity), JSON.stringify(gravity))
  // 1.5 倍质量、1 倍半径 → g = 1.5 g（地球基准 9.82 m/s²）
  assert('重力是 1.5 g（自洽，不是 99）',
    gravity && Math.abs(gravity.value / 9.8 - 1.5) < 0.02, gravity && (gravity.value + ' m/s²'))
  assert('重力显示串说 1.5 g', gravity && gravity.text.indexOf('1.5') !== -1, gravity && gravity.text)
  const keys = (v.derived || []).map(function (item) { return item.key })
  assert('七个派生量齐全', keys.length === 7, keys.join(','))
  assert('params 里仍然只有基础量', (v.params || {}).gravity === undefined, JSON.stringify(v.params))
  assert('生物结论跟着重力变', 
    (v.biology || []).some(function (item) { return item.label.indexOf('高度') !== -1 }),
    JSON.stringify((v.biology || [])[0]))
  assert('给出能不能住的结论',
    (v.environment || []).some(function (item) { return item.label.indexOf('住') !== -1 }),
    JSON.stringify((v.environment || [])[0]))
}

console.log('-- 5. 「能住人吗」 → dead 判定 --')
{
  const r = await post('/derive', { sub: 'dead' })
  const wrapper = r.json || {}
  const v = wrapper.value || {}
  // dead 的结果挂在 value.dead 下
  const dead = v.dead || v
  assert('给出判定等级', typeof dead.level === 'string', String(dead.level))
  assert('判定等级是已知值', ['alive', 'marginal', 'dead'].includes(dead.level), String(dead.level))
  assert('1.5 g 地球型世界仍可住（alive）', dead.level === 'alive', String(dead.level))
  assert('给了结构化原因字段', Array.isArray(dead.causes), typeof dead.causes)
  assert('有一段给人看的总结', typeof dead.summary === 'string' && dead.summary.length > 0,
    String(dead.summary))
  // 这是「插件不做穷举」的落点：渲染结果里明确写了「给 AI 的提示」
  assert('渲染结果含给 AI 的提示段', String(wrapper.result).indexOf('给 AI 的提示') !== -1, '')
  assert('提示里说不要反驳用户', /不要说「这不合理」|不反驳/.test(String(wrapper.result)), '')
  // 铁律：措辞不反驳用户
  assert('dead 措辞不反驳用户', !/错误|禁止|必须/.test(wrapper.result || ''), '')
}

console.log('-- 6. 整条链走完，世界依然自洽 --')
{
  // 前面做过「硬塞派生量」的攻击，这里确认体系没被污染
  const world = await currentWorld()
  const worldKeys = Object.keys(world || {})
  const params = await get('/world-params')
  const allowed = ((params.json && params.json.groups) || [])
    .flatMap(function (g) { return g.params || [] })
    .map(function (item) { return item.key })
  const illegal = worldKeys.filter(function (key) { return allowed.indexOf(key) === -1 })
  assert('世界表里没有白名单外的键', illegal.length === 0, illegal.join(',') || '无')
  assert('链路结束时 planetMass 仍是 1.5', Math.abs(world.planetMass - 1.5) < 1e-9,
    String(world.planetMass))

  // 再存一次基础量，确认幂等、不产生派生字段
  await post('/workspaces/save-world', { world: { planetMass: 1.5, rotationHours: 24 } })
  const w2 = await currentWorld()
  assert('重复保存仍无派生字段',
    w2.gravity === undefined && w2.surfaceMeanK === undefined,
    JSON.stringify(Object.keys(w2)))
  const sum = await post('/summary', {})
  const g2 = ((sum.json || {}).derived || []).find(function (item) { return item.key === 'gravity' })
  assert('改自转不影响重力（工程量独立）', g2 && Math.abs(g2.value / 9.8 - 1.5) < 0.02,
    g2 && g2.value.toFixed(3))
}

console.log('-- 7. save-world 的白名单必须与 world-params 一致 --')
{
  // 回归：save-world 曾经自带一份 14 键硬编码白名单，而 world-params 有 23 个基础量。
  // 结果 author 最常用的 starClass（「我要 G2V 恒星」）被**静默丢弃** ——
  // 不报错、不提示，存完一看世界还是太阳。这是「双白名单不同步」的经典事故。
  const params = await get('/world-params')
  const allowedKeys = ((params.json && params.json.groups) || [])
    .flatMap(function (g) { return g.params || [] })
    .map(function (item) { return item.key })

  // 逐个试存每一个合法基础量，全都必须能存进去
  await post('/workspaces/reset-world', {})
  const dropped = []
  for (const key of allowedKeys) {
    // 按类型给一个**合法**值：要落在该参数声明的范围内，
    // 否则会被校验正确拒绝，而那不是「静默丢弃」。
    const spec = (await get('/world-params')).json.groups
      .flatMap(function (g) { return g.params || [] })
      .find(function (item) { return item.key === key })
    let value
    if (spec && spec.kind === 'array') {
      value = [{ name: '甲', massMoon: 1, distanceMoon: 3 }]
    } else if (spec && spec.kind === 'choice') {
      value = (spec.choices && spec.choices[0] && spec.choices[0].value) || 'G2V'
    } else if (spec && spec.kind === 'bool') {
      value = true
    } else if (spec && spec.range) {
      // 取范围中点，保证在 hard 边界内
      const min = typeof spec.range.min === 'number' ? spec.range.min : 1
      const max = typeof spec.range.max === 'number' ? spec.range.max : min * 10
      value = min + (max - min) / 2
    } else {
      value = 1
    }
    await post('/workspaces/reset-world', {})
    const saved = await post('/workspaces/save-world', { world: { [key]: value } })
    const world = await currentWorld()
    const got = world[key]
    const rejectedOnPurpose = saved.status === 400
    if (rejectedOnPurpose) {
      // 值是按范围算的，不该被拒；被拒说明 range 与校验脱节
      dropped.push(key + '(被拒:400)')
      continue
    }
    if (got === undefined) dropped.push(key)
  }
  assert('每个合法基础量都存得进去（无静默丢弃）', dropped.length === 0, dropped.join(',') || '无')

  // 最要紧的一个：starClass —— 作者最常用的入口
  await post('/workspaces/reset-world', {})
  const star = await post('/workspaces/save-world', { world: { starClass: 'G2V' } })
  const starWorld = await currentWorld()
  assert('starClass 能存（「我要 G2V 恒星」不再失效）', starWorld.starClass === 'G2V',
    JSON.stringify(starWorld.starClass))
  assert('starClass 存进去后重力动量级仍正常',
    star.status === 200, String(star.status))

  // 非法键仍然必须被挡住 —— 防止为了修上面这条把白名单彻底放开
  await post('/workspaces/reset-world', {})
  const junk = await post('/workspaces/save-world', {
    world: { 垃圾字段: 1, gravity: 99, surfaceMeanK: 999, __proto__: 'x' },
  })
  const junkWorld = await currentWorld()
  assert('非法键仍被挡住', Object.keys(junkWorld).length === 0, JSON.stringify(junkWorld))
  assert('非法键不导致 500', junk.status === 200, String(junk.status))

  // 非数字值对 number 型参数应报 400，而不是静默写入
  await post('/workspaces/reset-world', {})
  const badNum = await post('/workspaces/save-world', { world: { planetMass: 'abc' } })
  assert('number 型参数给非数字值会 400', badNum.status === 400, String(badNum.status))
}

console.log('-- 8. 反向链路：重置回地球 --')
{
  const r = await post('/workspaces/reset-world', {})
  assert('reset-world 成功', (r.json || {}).reset === true, JSON.stringify(r.json && r.json.reset))
  const sum = await post('/summary', {})
  const gravity = ((sum.json || {}).derived || []).find(function (item) { return item.key === 'gravity' })
  assert('重置后重力回到 1 g（9.8 m/s²）',
    gravity && Math.abs(gravity.value / 9.8 - 1.0) < 0.02, gravity && gravity.value.toFixed(3))
  const world = await currentWorld()
  assert('重置后世界表为空', Object.keys(world).length === 0, JSON.stringify(world))
}

// ── 收尾 ──
try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
