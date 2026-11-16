/**
 * 贸易网络：比较优势 + 引力模型 + 断供风险。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-trade-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const tr = await import(pathToFileURL(join(root, 'lib/features/deduction/trade.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 两地产销 --')
{
  const r = tr.computeTrade({
    regions: [
      { id: 'A', supply: { 粮: 1000, 铁: 100 }, demand: { 粮: 500, 铁: 300 } },
      { id: 'B', supply: { 粮: 300, 铁: 500 }, demand: { 粮: 800, 铁: 100 } },
    ],
    routes: [{ from: 'A', to: 'B', distanceKm: 500 }, { from: 'B', to: 'A', distanceKm: 500 }],
  })
  assert('★ 粮从 A 流向 B（A 有盈余、B 有缺口）', r.flows.some((f) => f.good === '粮' && f.from === 'A' && f.to === 'B'), JSON.stringify(r.flows.map((f) => f.good)))
  assert('★ 铁从 B 流向 A', r.flows.some((f) => f.good === '铁' && f.from === 'B' && f.to === 'A'), '')
  assert('粮流量 ≤ B 的缺口（800−300=500）', r.flows.find((f) => f.good === '粮').quantity <= 500.01, String(r.flows.find((f) => f.good === '粮').quantity))
}
console.log('-- 2. 距离与关税影响 --')
{
  const near = tr.computeTrade({ regions: [{ id: 'A', supply: { 粮: 1000 }, demand: {} }, { id: 'B', supply: {}, demand: { 粮: 500 } }], routes: [{ from: 'A', to: 'B', distanceKm: 100 }] })
  const far = tr.computeTrade({ regions: [{ id: 'A', supply: { 粮: 1000 }, demand: {} }, { id: 'B', supply: {}, demand: { 粮: 500 } }], routes: [{ from: 'A', to: 'B', distanceKm: 5000 }] })
  const nearQ = near.flows[0]?.quantity ?? 0
  const farQ = far.flows[0]?.quantity ?? 0
  assert('★ 距离越远流量越小', nearQ > farQ, nearQ.toFixed(1) + ' vs ' + farQ.toFixed(1))
  const tariff = tr.computeTrade({ regions: [{ id: 'A', supply: { 粮: 1000 }, demand: {} }, { id: 'B', supply: {}, demand: { 粮: 500 } }], routes: [{ from: 'A', to: 'B', distanceKm: 500, tariff: 0.5 }] })
  assert('★ 关税提高 → 到岸成本上升', tariff.flows[0].landedCostPerTon > 10, String(tariff.flows[0].landedCostPerTon))
}
console.log('-- 3. 断供风险 --')
{
  const r = tr.computeTrade({
    regions: [{ id: 'A', supply: { 粮: 1000 }, demand: {} }, { id: 'B', supply: {}, demand: { 粮: 500 } }],
    routes: [{ from: 'A', to: 'B', distanceKm: 200 }],
  })
  assert('★ 断掉唯一路线 → B 缺口 100%', r.fragility.length === 1 && r.fragility[0].shortfallRatio > 0.99, JSON.stringify(r.fragility[0]))
}
console.log('-- 4. 校验 --')
{
  let threw = false
  try { tr.computeTrade({ regions: [], routes: [] }) } catch { threw = true }
  assert('空地区 → 报错', threw, '')
  let threw2 = false
  try { tr.computeTrade({ regions: [{ id: 'A', supply: {}, demand: {} }], routes: [{ from: 'A', to: 'X', distanceKm: 10 }] }) } catch { threw2 = true }
  assert('★ 路线指向未知地区 → 报错', threw2, '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
