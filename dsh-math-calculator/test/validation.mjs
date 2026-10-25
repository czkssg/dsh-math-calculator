/**
 * 世界参数输入校验（L1）。
 *
 * ## 为什么要有这一套
 *
 * `world-params.ts` 里每个参数都声明了 `range`，但 2026-10-25 之前**没有任何代码读它**
 * ——22 处声明等于注释，实测 `planetMass=-5`、`planetRadius=0`、`albedo=5`
 * 全都 200 OK 存进去了，然后下游算出负重力与 `Infinity`。
 *
 * 铁律是「不反驳用户设定」，所以校验**分三档**：
 *
 * | 档 | 行为 | 判据 |
 * |---|---|---|
 * | 硬拒绝 400 | 算出来是 NaN / Infinity / 负物理量，下游没法用 | `range.hard === true` 且越界 |
 * | 软警告 200 + warnings | 物理极端但可以是设定（巨兽、地狱行星） | 未标 hard 且越界 |
 * | 静默接受 | 在范围内 | — |
 *
 * 哪些参数标 hard **不是猜的**，是实测出来的：逐个参数取极端值跑 `opWorld`，
 * 看产物里有多少 `Infinity`/`NaN`（探针当时还暴露了一个坑 ——
 * `planet.surfaceGravity` 其实是**显示串** `'Infinity'`，只看 `typeof number` 会漏）。
 *
 * ## 另外两个真事故
 *
 * - `Number(true) === 1`、`Number([]) === 0`：`{planetMass:true}` 静默存成 1、
 *   `{planetMass:[]}` 静默存成 0。作者根本看不出自己传错了类型。
 * - `moons`（逐颗卫星）曾在 `world.ts` 里完整支持，但不在白名单里，
 *   所以「多卫星系统」只能直接调 tool，**存不进工作区**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { makeCordisCtx, makeFakeWebServer, callRoute } from './_host-mocks.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-validate-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { WORLD_PARAMS } = await import(pathToFileURL(join(root, 'lib/world-params.js')).href)

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
const get = (p) => callRoute(webServer, 'GET', BASE + p)

/** 存一次 world，返回 { status, json, world }。 */
async function save(world) {
  await post('/workspaces/reset-world', {})
  const r = await post('/workspaces/save-world', { world })
  const cur = await get('/workspaces/current')
  return { status: r.status, json: r.json || {}, world: (cur.json && cur.json.world) || {} }
}

console.log('-- 1. 硬边界：算不出物理量的必须 400 --')
{
  // 这些参数标了 range.hard，越界会产出 Infinity / NaN / 负物理量
  const hards = [
    ['planetMass', -5, '负质量'],
    ['planetMass', 0, '零质量（逃逸速度/年月全 NaN）'],
    ['planetRadius', 0, '零半径（重力 Infinity）'],
    ['planetRadius', -1, '负半径'],
    ['rotationHours', 0, '零自转（离心比 Infinity）'],
    ['starMass', 0, '零恒星质量（年长 Infinity）'],
    ['starMass', -1, '负恒星质量'],
    ['orbitAU', 0, '零轨道（80 个 Infinity）'],
    ['orbitAU', -1, '负轨道'],
    ['starTemp', 0, '零温（峰值波长 Infinity）'],
    ['moonMass', 0, '零卫星质量（视星等 Infinity）'],
    ['moonDistance', 0, '零卫星距离（潮汐 Infinity）'],
  ]
  for (const [key, value, why] of hards) {
    const r = await save({ [key]: value })
    assert(`${key}=${value} 被拒（${why}）`, r.status === 400, 'HTTP ' + r.status)
    assert(`${key}=${value} 没有写进存档`, r.world[key] === undefined, JSON.stringify(r.world[key]))
  }
}

console.log('-- 2. 软范围：越界只警告，不拦 --')
{
  // 作者要 500 倍质量的行星是设定自由，插件只该说代价
  const softs = [
    ['planetMass', 500, '超出常规上限 100'],
    ['albedo', 1.5, '反射率大于全部入射'],
    ['eccentricity', 0.95, '超出常规上限 0.9'],
    ['obliquityDeg', 100, '超出常规上限 90'],
    ['materialStrength', 1e15, '超出常规上限 1e12'],
  ]
  for (const [key, value, why] of softs) {
    const r = await save({ [key]: value })
    assert(`${key}=${value} 仍被接受（设定自由）`, r.status === 200, 'HTTP ' + r.status)
    assert(`${key}=${value} 确实存进去了`, r.world[key] === value, JSON.stringify(r.world[key]))
    const w = r.json.warnings
    assert(`${key}=${value} 带警告（${why}）`,
      Array.isArray(w) && w.some((item) => item.key === key), JSON.stringify(w))
    // 警告必须说清代价，不是干巴巴一句「越界」
    const line = (Array.isArray(w) ? w : []).find((item) => item.key === key)
    assert(`${key} 的警告含范围与建议`, Boolean(line && line.message && line.range),
      line ? JSON.stringify(line) : '无')
  }
}

console.log('-- 3. 范围内：静默接受，不产生噪音 --')
{
  const r = await save({ planetMass: 1.5, albedo: 0.3, rotationHours: 24 })
  assert('合法值 200', r.status === 200, 'HTTP ' + r.status)
  assert('三个值都存进去了',
    r.world.planetMass === 1.5 && r.world.albedo === 0.3 && r.world.rotationHours === 24,
    JSON.stringify(r.world))
  assert('没有警告', !r.json.warnings || r.json.warnings.length === 0, JSON.stringify(r.json.warnings))
}

console.log('-- 4. 类型错误：不再静默强转 --')
{
  // Number(true)===1、Number([])===0，这些曾是静默通过的
  for (const [value, why] of [
    [true, 'true → 1'],
    [false, 'false → 0'],
    [[], '[] → 0'],
    [[1], '[1] → 1'],
    [{}, '{} → NaN'],
  ]) {
    const r = await save({ planetMass: value })
    assert(`planetMass=${JSON.stringify(value)} 被拒（${why}）`, r.status === 400, 'HTTP ' + r.status)
    assert(`planetMass=${JSON.stringify(value)} 没写进存档`, r.world.planetMass === undefined,
      JSON.stringify(r.world.planetMass))
  }
  // 数字字符串仍应接受（AI 常传字符串）
  const r = await save({ planetMass: '1.5' })
  assert('数字字符串 "1.5" 仍接受', r.status === 200 && r.world.planetMass === 1.5,
    'HTTP ' + r.status + ' 值=' + JSON.stringify(r.world.planetMass))
}

console.log('-- 5. 逐颗卫星（moons）终于能存档了 --')
{
  const moons = [
    { name: '小月', massMoon: 0.1, distanceMoon: 3 },
    { name: '大月', massMoon: 2, distanceMoon: 8 },
  ]
  const r = await save({ moons })
  assert('moons 数组被接受', r.status === 200, 'HTTP ' + r.status)
  assert('两颗都存进去了', Array.isArray(r.world.moons) && r.world.moons.length === 2,
    JSON.stringify(r.world.moons))
  assert('名字保留', r.world.moons && r.world.moons[0].name === '小月',
    JSON.stringify(r.world.moons && r.world.moons[0]))

  // 存进去的 moons 要能真的进推演
  const s = await post('/summary', {})
  assert('summary 正常返回', s.status === 200, 'HTTP ' + s.status)

  // 逐颗参数也要校验：零质量 → 视星等 Infinity
  const bad = await save({ moons: [{ massMoon: 0, distanceMoon: 3 }] })
  assert('moons 里零质量被拒', bad.status === 400, 'HTTP ' + bad.status)
  const badDist = await save({ moons: [{ massMoon: 1, distanceMoon: 0 }] })
  assert('moons 里零距离被拒', badDist.status === 400, 'HTTP ' + badDist.status)
  const badType = await save({ moons: 'abc' })
  assert('moons 不是数组被拒', badType.status === 400, 'HTTP ' + badType.status)
  const tooMany = await save({ moons: Array.from({ length: 31 }, () => ({ massMoon: 1, distanceMoon: 3 })) })
  assert('moons 超过 30 颗被拒', tooMany.status === 400, 'HTTP ' + tooMany.status)
}

console.log('-- 6. 元数据自身的完整性 --')
{
  // 标了 hard 的参数必须在实测里真的会产出非有限数，不然标了没意义
  const hardKeys = WORLD_PARAMS.filter((p) => p.range && p.range.hard).map((p) => p.key)
  assert('有 hard 边界参数', hardKeys.length > 0, hardKeys.join(','))
  assert('moons 在参数表里', WORLD_PARAMS.some((p) => p.key === 'moons'), '')
  const moonsSpec = WORLD_PARAMS.find((p) => p.key === 'moons')
  assert('moons 是 array 型', moonsSpec && moonsSpec.kind === 'array', moonsSpec && moonsSpec.kind)
  assert('moons 有 itemShape', Boolean(moonsSpec && moonsSpec.itemShape && moonsSpec.itemShape.length > 0),
    String(moonsSpec && moonsSpec.itemShape && moonsSpec.itemShape.length))
  // 每个 array 型参数都必须有 itemShape，否则没法校验
  for (const p of WORLD_PARAMS) {
    if (p.kind === 'array') {
      assert(`${p.key} 的 itemShape 非空`, Boolean(p.itemShape && p.itemShape.length > 0), '')
    }
  }
  // hard 边界必须有上下界，否则「越界」无从判断
  for (const p of WORLD_PARAMS) {
    if (p.range && p.range.hard) {
      assert(`${p.key} 的 hard 范围有上下界`,
        typeof p.range.min === 'number' || typeof p.range.max === 'number',
        JSON.stringify(p.range))
    }
  }
}

console.log('-- 7. 校验不影响正常链路（回归）--')
{
  const r = await save({ planetMass: 1.5 })
  assert('gravity 反解链仍可用', r.status === 200, 'HTTP ' + r.status)
  const anchor = await post('/solve-anchor', { kind: 'gravity', wanted: 1.5 })
  const changes = (anchor.json || {}).changes || {}
  assert('反解结果仍在硬边界内（能被校验接受）',
    (changes.planetMass || 0) >= 0.01 && (changes.planetMass || 0) <= 100,
    String(changes.planetMass))
  const saved = await post('/workspaces/save-world', { world: changes })
  assert('反解结果可以直接存（不会被自己的校验拦）', saved.status === 200, 'HTTP ' + saved.status)
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
