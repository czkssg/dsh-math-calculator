/**
 * 完整世界编排（world-build）：多模块串联 + 瓶颈判定。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-wb-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const wb = await import(pathToFileURL(join(root, 'lib/features/deduction/world-build.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 地球参数 --')
{
  const r = wb.buildWorldProfile({})
  assert('★ 地表约 510 M km²（地球）', Math.abs(r.world.surfaceKm2 / 1e6 - 510) < 5, String(r.world.surfaceKm2))
  assert('★ 陆地约 148 M km²', Math.abs(r.landKm2 / 1e6 - 148) < 3, String(r.landKm2))
  assert('★ 承载力约 14.8 亿（15 亩/人）', Math.abs(r.carryingCapacity / 1e8 - 14.8) < 0.5, String(r.carryingCapacity))
  assert('★ 瓶颈是粮食（人均 0.62 kg/天）', r.bottleneck.includes('粮食'), r.bottleneck)
}
console.log('-- 2. 大行星 --')
{
  const r = wb.buildWorldProfile({ planetRadius: 2 })
  assert('★ 半径 2 倍 → 地表 4 倍', Math.abs(r.world.surfaceKm2 / 1e6 - 510 * 4) < 20, String(r.world.surfaceKm2))
  assert('体积更大的世界承载力更高', r.carryingCapacity > 4e9, String(r.carryingCapacity))
}
console.log('-- 3. 小人口与大人口 --')
{
  const small = wb.buildWorldProfile({ initialPopulation: 1000 })
  assert('★ 初始 1000 → 百年显著增长', small.populationAfter100y > 1000, String(small.populationAfter100y))
  const dense = wb.buildWorldProfile({ initialPopulation: 2e6, muPerPerson: 3 })
  assert('★ 人口超百万 + 人均 3 亩 → 需舱室网络', dense.needsMegastructure === true, String(dense.needsMegastructure))
}
console.log('-- 4. 校验 --')
{
  let threw = false
  try { wb.buildWorldProfile({ planetMass: 0 }) } catch { threw = true }
  assert('质量 0 → 报错', threw, '')
}
console.log('-- 5. 经 tool --')
{
  const out = await run({ operation: 'world-build', planetMass: 1.2, planetRadius: 1.05 })
  assert('★ world-build 经 tool', out.ok === true && out.result.includes('完整世界画像'), out.result.slice(0, 60))
  assert('输出含瓶颈', out.result.includes('瓶颈'), '')
  assert('value 含承载/人口/粮食/疆域', typeof out.value.build.carryingCapacity === 'number' && typeof out.value.build.realmRadiusKm === 'number', '')
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
