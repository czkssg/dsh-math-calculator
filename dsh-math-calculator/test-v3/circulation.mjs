/**
 * 简化环流：热成风 + 三圈环流 + 水汽平流（不是 CFD）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-circ-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const cir = await import(pathToFileURL(join(root, 'lib/features/deduction/circulation.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const earthTemps = [27, 25, 19, 11, 0, -12, -25]
console.log('-- 1. 风向（地球校核）--')
{
  const r = cir.computeCirculation({ latTemps: earthTemps })
  assert('★ 信风带（0–15°）为东风（u<0）', r.zonal[0] < 0 && r.zonal[1] < 0, r.zonal.slice(0, 2).join(','))
  assert('★ 西风带（30–45°）为西风（u>0）', r.zonal[2] > 0 && r.zonal[3] > 0, r.zonal.slice(2, 4).join(','))
  assert('★ 极地东风带（60–75°）为东风（u<0）', r.zonal[4] < 0 && r.zonal[5] < 0, r.zonal.slice(4, 6).join(','))
}
console.log('-- 2. 风力量级 --')
{
  const r = cir.computeCirculation({ latTemps: earthTemps })
  assert('★ 西风带约 5–20 m/s', Math.abs(r.zonal[3]) > 3 && Math.abs(r.zonal[3]) < 20, String(r.zonal[3]))
  assert('★ 信风约 5–20 m/s', Math.abs(r.zonal[1]) > 3 && Math.abs(r.zonal[1]) < 20, String(r.zonal[1]))
}
console.log('-- 3. 三圈环流 --')
{
  const r = cir.computeCirculation({ latTemps: earthTemps })
  assert('★ Hadley 上升（0–15° v>0）', r.meridional[0] > 0 && r.meridional[1] > 0, r.meridional.slice(0, 2).join(','))
  assert('★ Ferrel 下沉（30–45° v<0）', r.meridional[2] < 0 && r.meridional[3] < 0, r.meridional.slice(2, 4).join(','))
  assert('★ Polar 上升（60–75° v>0）', r.meridional[4] > 0 && r.meridional[5] > 0, r.meridional.slice(4, 6).join(','))
}
console.log('-- 4. 自转影响 --')
{
  const fast = cir.computeCirculation({ latTemps: earthTemps, rotationHours: 10 })
  const slow = cir.computeCirculation({ latTemps: earthTemps, rotationHours: 48 })
  /** 热成风 u ∝ 1/f：快转 f 大 → 同样温度梯度下风更弱（模型结论，已写入 notes）。 */
  assert('★ 自转改变风场：快转（f 大）热成风更弱', Math.abs(fast.zonal[3]) < Math.abs(slow.zonal[3]), fast.zonal[3].toFixed(1) + ' vs ' + slow.zonal[3].toFixed(1))
}
console.log('-- 5. 水汽衰减 --')
{
  const land = Array.from({ length: 90 }, () => Array.from({ length: 180 }, () => true))
  const r = cir.computeCirculation({ latTemps: earthTemps, land, width: 180, height: 90 })
  assert('★ 全陆地图给出水汽半衰距离', typeof r.moistureHalfDistanceCells === 'number' && r.moistureHalfDistanceCells > 0, String(r.moistureHalfDistanceCells))
  const noLand = cir.computeCirculation({ latTemps: earthTemps })
  assert('不给海陆网格 → null（不瞎猜）', noLand.moistureHalfDistanceCells === null, String(noLand.moistureHalfDistanceCells))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
