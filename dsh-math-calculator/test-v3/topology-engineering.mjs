/**
 * topology × 工程公式耦合：建筑校核 / 舰船校核。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-eng-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const engMod = await import(pathToFileURL(join(root, 'lib/features/topology/engineering.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 建筑校核函数 --')
{
  const b = engMod.assessBuildingEngineering({ floors: 100, footprintM2: 1000 })
  assert('★ 10 万㎡ → 10000 人（10 ㎡/人）', b.people === 10000, String(b.people))
  assert('★ 疏散宽 50 m（0.5 cm/人）', Math.abs(b.egressWidthM - 50) < 0.01, String(b.egressWidthM))
  assert('★ 电梯 129 台', b.elevators === 129, String(b.elevators))
  assert('★ 高 300 m 风压 1.63 kN/m²', Math.abs(b.windPressureKnm2 - 1.63) < 0.05, String(b.windPressureKnm2))
  assert('抗震底部剪力 4.76e4 kN', Math.abs(b.baseShearKn - 47600) < 100, String(b.baseShearKn))
}

console.log('-- 2. 舰船校核函数 --')
{
  const s = engMod.assessShipEngineering({ lengthM: 100, beamM: 15, draftM: 6, speedMps: 10 })
  assert('★ 排水量 ≈ 5996 t', Math.abs(s.displacementT - 5996) < 10, String(s.displacementT))
  assert('★ Fr=0.319 → 排水型', s.froude < 0.4, String(s.froude))
  assert('★ GM 在 2–6 m 量级（修正后不再是 13 m）', s.metacentricHeightM > 2 && s.metacentricHeightM < 6, String(s.metacentricHeightM))
  assert('横摇周期 3–8 s', s.rollPeriodS > 3 && s.rollPeriodS < 8, String(s.rollPeriodS))
}

console.log('-- 3. topology 输出附加工程校核 --')
{
  const b = await run({ operation: 'topology', topology: { action: 'structure', kind: 'building', levels: 100, area: 1000 } })
  assert('★ structure 结果含【工程校核 · building】', b.ok === true && b.result.includes('【工程校核 · building】'), b.result.slice(-120))
  assert('含疏散宽度与抗震字段', b.result.includes('egressWidthM') && b.result.includes('baseShearKn'), '')
  assert('value.engineering 存在', b.value.engineering !== null && b.value.engineering.people === 10000, JSON.stringify(b.value?.engineering).slice(0, 80))
  const s = await run({ operation: 'topology', topology: { action: 'ship', lengthM: 100, beamM: 15, draftM: 6, speedMps: 10, entry: '舰桥', compartments: [{ id: '舰桥' }, { id: '机舱' }], passages: [{ from: '舰桥', to: '机舱', kind: 'passage' }] } })
  assert('★ ship 结果含【工程校核 · ship】', s.ok === true && s.result.includes('【工程校核 · ship】'), s.result.slice(-120))
  assert('含排水量与稳性（规则表字段）', s.result.includes('displacementT') && s.result.includes('metacentricHeightM'), s.result.slice(-150))
}

console.log('-- 4. 无主尺度时不附校核 --')
{
  const s = await run({ operation: 'topology', topology: { action: 'ship', entry: '舰桥', compartments: [{ id: '舰桥' }], passages: [] } })
  assert('无 lengthM → 不附工程校核（不瞎编）', s.ok === true && !s.result.includes('【工程校核】'), s.result.slice(0, 80))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
