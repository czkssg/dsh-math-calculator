/**
 * 通用气候拟合模型：地球标定 + 推广到其他行星。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-cm-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const cm = await import(pathToFileURL(join(root, 'lib/features/deduction/climate-model.js')).href)
const gc = await import(pathToFileURL(join(root, 'lib/features/deduction/grid-climate.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 地球自检（拟合精度）--')
{
  const e = cm.validateAgainstEarth()
  assert('★ 平均温度残差 < 2 K', e.meanTempResidual < 2, e.meanTempResidual.toFixed(2))
  assert('★ 最大残差 < 3 K', e.maxTempResidual < 3, e.maxTempResidual.toFixed(2))
  assert('残差表覆盖 7 个纬度', e.residuals.length === 7, String(e.residuals.length))
}
console.log('-- 2. 曲线形状 --')
{
  const earth = cm.fitPlanetClimate({})
  assert('★ 赤道约 27°C', Math.abs(earth.equatorTempC - 27) < 1.5, String(earth.equatorTempC))
  assert('★ 极地约 -25°C', Math.abs(earth.poleTempC + 25) < 2.5, String(earth.poleTempC))
  assert('曲线 7 点（0–90°）', earth.curve.length === 7, String(earth.curve.length))
  const monotonic = earth.curve.every((point, index, all) => index === 0 || point.meanTempC <= all[index - 1].meanTempC)
  assert('★ 温度随纬度单调下降', monotonic, '')
}
console.log('-- 3. 推广到其他行星 --')
{
  const dim = cm.fitPlanetClimate({ stellarFlux: 0.7 })
  const bright = cm.fitPlanetClimate({ stellarFlux: 1.4 })
  assert('★ 恒星更暗 → 赤道更冷', dim.equatorTempC < bright.equatorTempC, dim.equatorTempC.toFixed(1) + ' < ' + bright.equatorTempC.toFixed(1))
  const thick = cm.fitPlanetClimate({ greenhouseK: 60 })
  const thin = cm.fitPlanetClimate({ greenhouseK: 5 })
  assert('★ 温室更强 → 更暖', thick.equatorTempC > thin.equatorTempC, thick.equatorTempC.toFixed(1) + ' > ' + thin.equatorTempC.toFixed(1))
  const slow = cm.fitPlanetClimate({ rotationHours: 240 })
  const fast = cm.fitPlanetClimate({ rotationHours: 12 })
  assert('★ 自转更快 → 纬向温差更小', fast.gradientK < slow.gradientK, fast.gradientK.toFixed(1) + ' < ' + slow.gradientK.toFixed(1))
}
console.log('-- 4. 与网格气候耦合 --')
{
  const cols = 60, rows = 30
  const heights = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0.7))
  const land = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const earth = gc.computeGridClimate({ heights, land, stellarFlux: 1 })
  const dim = gc.computeGridClimate({ heights, land, stellarFlux: 0.6 })
  assert('★ 网格气候随恒星通量变化', earth.arableRatio !== dim.arableRatio, earth.arableRatio.toFixed(3) + ' vs ' + dim.arableRatio.toFixed(3))
  assert('★ 含干旱分区（降水修正生效）', '干旱（沙漠）' in earth.zoneShare || '半干旱（草原）' in earth.zoneShare, JSON.stringify(Object.keys(earth.zoneShare)))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
