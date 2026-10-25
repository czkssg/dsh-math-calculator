/**
 * 物理量健全性（L2）：非法参数不能让 Infinity/NaN 流到 AI。
 *
 * ## 为什么必须有这一层
 *
 * L1（`test/validation.mjs`）在**写入时**拦住了会导致无穷的输入。但：
 *   · 历史存档里可能已经有坏值（作者手改 JSON、旧版本存过）；
 *   · `POST /summary` 可以直接带 `world` 参数绕过存档；
 *   · 存档被外部工具改成坏值时，插件管不到。
 *
 * 所以下游必须能优雅降级。之前的实测：
 *
 *     planetRadius=0 → summary 输出 gravity=Infinity，但 dead 判定仍说 alive
 *
 * AI 会把 `Infinity` 当成真数字写进结语——「这颗星球重力是 Infinity」，
 * 这比直接报错更伤可信度。
 *
 * ## invalid 与 dead 的区别
 *
 * - `dead` 是**设定结果**：死寂宇宙是一种合法写法，措辞只讲代价与如何改；
 * - `invalid` 是**算不出来**：不是设定太极端，是参数本身有问题。
 *
 * 两者混在一起会让作者以为「我把世界设得太狠了」，实际是他把半径写成了 0。
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makeCordisCtx, makeFakeWebServer, callRoute } from './_host-mocks.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-sanity-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const dead = await import(pathToFileURL(join(root, 'lib/dead-universe.js')).href)
const { opWorld } = await import(pathToFileURL(join(root, 'lib/ops/world-op.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

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
const post = (p, b) => callRoute(webServer, 'POST', BASE + p, {
  body: b === undefined ? undefined : JSON.stringify(b),
  headers: { 'content-type': 'application/json' },
})

console.log('-- 1. findPhysicsIssues 能嗅出无穷/负值 --')
{
  const cases = [
    ['planetRadius', 0, '零半径 → 重力 Infinity'],
    ['planetMass', -5, '负质量 → 逃逸速度 NaN'],
    ['planetMass', 0, '零质量 → 离心比 Infinity'],
    ['orbitAU', 0, '零轨道 → 大量 Infinity'],
  ]
  for (const [key, value, why] of cases) {
    const world = opWorld({ world: { [key]: value } }, 32).value
    const issues = dead.findPhysicsIssues(world)
    assert(`${key}=${value} 被检出（${why}）`, issues.length > 0, String(issues.length))
    assert(`${key}=${value} 的问题名说清了是什么`,
      issues.every((item) => item.name && item.physics && item.remedy), JSON.stringify(issues[0] && issues[0].name))
  }

  // 正常世界不该有 issue
  const goodWorld = opWorld({ world: {} }, 32).value
  assert('地球参数没有任何 physicsIssue', dead.findPhysicsIssues(goodWorld).length === 0,
    String(dead.findPhysicsIssues(goodWorld).length))
  const heavyWorld = opWorld({ world: { planetMass: 500 } }, 32).value
  assert('500 倍质量（极端但算得出）不算 issue', dead.findPhysicsIssues(heavyWorld).length === 0,
    String(dead.findPhysicsIssues(heavyWorld).length))
}

console.log('-- 2. judgeDead 把 invalid 与 dead 分开 --')
{
  const badWorld = opWorld({ world: { planetRadius: 0 } }, 32).value
  const v = dead.judgeDead(badWorld)
  assert('零半径判为 invalid', v.level === 'invalid', v.level)
  assert('invalid 有结构化原因', v.causes.length > 0, String(v.causes.length))
  assert('invalid 的 note 说明「不是设定问题」', /不是设定太极端|不是设定/.test(v.note), v.note)
  assert('invalid 措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(v.note + v.summary), '')

  // 真正的死寂仍然是 dead，不被 invalid 抢走
  const deadWorld = JSON.parse(JSON.stringify(opWorld({ world: {} }, 32).value))
  deadWorld.life = deadWorld.life || {}
  deadWorld.life.chemistry = {
    verdict: 'bonds-too-weak',
    bondEnergyEv: 0.2,
    stability: 0.8,
    alphaRatio: 1,
    window: [],
    note: '',
  }
  const dv = dead.judgeDead(deadWorld)
  assert('化学键过弱仍判 dead（不是 invalid）', dv.level === 'dead', dv.level)

  // 冻结仍是 marginal，没有被改成 dead 或 invalid
  const frozen = JSON.parse(JSON.stringify(opWorld({ world: { orbitAU: 5 } }, 32).value))
  if (frozen.temperature) {
    frozen.temperature.surfaceMeanK = 120
    frozen.temperature.freezingPointK = 273.15
    frozen.temperature.boilingPointK = 373.15
  }
  const fv = dead.judgeDead(frozen)
  assert('冻结仍是 marginal', fv.level === 'marginal', fv.level)
}

console.log('-- 3. 渲染层不输出裸 Infinity/NaN --')
{
  const badWorld = opWorld({ world: { planetRadius: 0 } }, 32).value
  const v = dead.judgeDead(badWorld)
  const text = dead.renderDead(v)
  assert('渲染里有「参数不成立」标记', text.includes('参数不成立'), text.split(String.fromCharCode(10))[0])
  assert('渲染里不出现 "Infinity" 字面量作为结论', !/重力是 Infinity/.test(text), '')
  assert('渲染里给了要修的参数', text.includes('要修的参数'), '')
  assert('渲染措辞不反驳用户', !/错误|禁止|必须/.test(text), '')
}

console.log('-- 4. /summary 在非法参数下仍然给出结构，不崩 --')
{
  const r = await post('/summary', { world: { planetRadius: 0 } })
  assert('summary 返回 200（不崩）', r.status === 200, String(r.status))
  const v = (r.json || {})
  assert('verdict.level 是 invalid', (v.verdict || {}).level === 'invalid', JSON.stringify((v.verdict || {}).level))
  // 派生量里的 Infinity 必须被格式化成 '—'，不能原样给 AI
  const gravity = (v.derived || []).find((item) => item.key === 'gravity')
  assert('重力派生量的 text 用 — 而不是 Infinity',
    gravity && !String(gravity.text).includes('Infinity'), gravity && gravity.text)
  const headline = v.headline || ''
  assert('headline 不含 Infinity/NaN', !/Infinity|NaN/.test(headline), headline)
  // 整个响应里不应该有裸 Infinity 字面量
  const raw = JSON.stringify(r.json)
  assert('整个 summary 响应不含 "Infinity" 字面量',
    !raw.includes('Infinity'), raw.slice(0, 200))
}

console.log('-- 5. /derive dead 同样降级 --')
{
  const r = await post('/derive', { sub: 'dead', world: { planetRadius: 0 } })
  assert('derive dead 返回 200', r.status === 200, String(r.status))
  const wrapper = r.json || {}
  const v = (wrapper.value || {}).dead || (wrapper.value || {})
  assert('derive 的判定是 invalid', v.level === 'invalid', String(v.level))
  assert('derive 的渲染说参数不成立', String(wrapper.result).includes('参数不成立'), '')
}

console.log('-- 6. 历史存档被外部改成坏值也能兜住 --')
{
  // 直接往磁盘写一个坏 world，模拟「作者手改 JSON / 旧版本留下的坏数据」
  const dir = join(home, 'workspaces')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'corrupt.json')
  writeFileSync(file, JSON.stringify({
    name: 'corrupt',
    constants: {},
    world: { planetRadius: 0, planetMass: -3 },
    terrains: [],
    variables: {},
    formulaTable: { overrides: [], custom: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  const sum = await post('/summary', { world: { planetRadius: 0, planetMass: -3 } })
  assert('坏存档的 summary 仍返回 200', sum.status === 200, String(sum.status))
  assert('坏存档判为 invalid', ((sum.json || {}).verdict || {}).level === 'invalid',
    JSON.stringify(((sum.json || {}).verdict || {}).level))
  assert('坏存档不产生 Infinity 字面量', !JSON.stringify(sum.json).includes('Infinity'), '')
}

console.log('-- 7. 正常链路不受影响（回归）--')
{
  const okSum = await post('/summary', {})
  assert('地球 summary 判 alive', ((okSum.json || {}).verdict || {}).level === 'alive',
    JSON.stringify(((okSum.json || {}).verdict || {}).level))
  const gravity = ((okSum.json || {}).derived || []).find((item) => item.key === 'gravity')
  assert('地球重力 9.82', gravity && Math.abs(gravity.value - 9.82) < 0.05, gravity && gravity.value)

  const heavy = await post('/summary', { world: { planetMass: 500 } })
  assert('500 倍质量仍算得出（不判 invalid）',
    ((heavy.json || {}).verdict || {}).level !== 'invalid',
    JSON.stringify(((heavy.json || {}).verdict || {}).level))
}

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
