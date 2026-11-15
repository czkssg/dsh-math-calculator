/**
 * 闭环稳态（上限）+ 故障模式 + 多舱段拓扑。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-closure-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const c = await import(pathToFileURL(join(root, 'lib/features/topology/closure.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 闭环上限（木桶短板）--')
{
  const r = c.solveClosure({ people: 6, cropAreaM2: 300, algaeM3: 2 })
  assert('★ 需氧面积 168 m²（6×0.84/0.03）', Math.abs(r.o2RequiredAreaM2 - 168) < 0.01, String(r.o2RequiredAreaM2))
  assert('★ 产氧 11.6 kg/天（300×0.03+2×1.3）', Math.abs(r.o2ProducedKgDay - 11.6) < 0.01, String(r.o2ProducedKgDay))
  assert('氧富余 6.56 kg/天', Math.abs(r.o2GapKgDay - 6.56) < 0.01, String(r.o2GapKgDay))
  assert('★ 自持上限 9.87 人（食物短板）', Math.abs(r.maxSelfSufficientPeople - 9.87) < 0.02, String(r.maxSelfSufficientPeople))
  assert('短板=食物', r.bottleneck === '食物', r.bottleneck)
}

console.log('-- 2. 无温室 → 上限 0（必须靠补给）--')
{
  const r = c.solveClosure({ people: 6, volumeM3: 400 })
  assert('★ 无作物 → 上限 0 人', r.maxSelfSufficientPeople === 0, String(r.maxSelfSufficientPeople))
  assert('氧缺口 -5.04', Math.abs(r.o2GapKgDay + 5.04) < 0.01, String(r.o2GapKgDay))
  assert('水自给 93%', r.waterSelfSufficiencyPct === 93, String(r.waterSelfSufficiencyPct))
}

console.log('-- 3. 故障模式（上限小时数）--')
{
  const r = c.solveClosure({ people: 6, volumeM3: 400, bufferO2Kg: 50 })
  assert('★ CO₂ 清除失效 → 15.84 小时到 5000 ppm', Math.abs((r.hoursToCo2Critical ?? 0) - 15.84) < 0.05, String(r.hoursToCo2Critical))
  assert('★ 50 kg 氧缓冲 → 238 小时（9.9 天）', Math.abs((r.hoursToO2Depletion ?? 0) - 238) < 1, String(r.hoursToO2Depletion))
  const none = c.solveClosure({ people: 6 })
  assert('无体积/无缓冲 → 故障项为 null（不瞎编）', none.hoursToCo2Critical === null && none.hoursToO2Depletion === null, '')
}

console.log('-- 4. 多舱段连通与泄漏 --')
{
  const t = c.analyzeCompartments({ compartments: [{ id: '居住', volumeM3: 200 }, { id: '温室', volumeM3: 500 }, { id: '气闸', volumeM3: 20 }], passages: [{ from: '居住', to: '温室' }, { from: '温室', to: '气闸', airlock: true }] })
  assert('★ 总泄漏 0.864 kg/天（720 m³×1.2×0.1%）', Math.abs(t.totalLeakKgDay - 0.864) < 0.001, String(t.totalLeakKgDay))
  assert('★ 三舱全连通', t.fullyConnected === true && t.reachable.length === 3, JSON.stringify(t.reachable))
  assert('★ 关键舱=温室/气闸（移除即断联）', t.criticalCompartments.includes('温室') && t.criticalCompartments.includes('气闸'), JSON.stringify(t.criticalCompartments))
  assert('气闸 1 个', t.airlockCount === 1, String(t.airlockCount))
  const broken = c.analyzeCompartments({ compartments: [{ id: 'A', volumeM3: 10 }, { id: 'B', volumeM3: 10 }], passages: [] })
  assert('无通道 → 不连通', broken.fullyConnected === false, '')
}

console.log('-- 5. 经 topology（closed-loop）--')
{
  const out = await run({ operation: 'topology', topology: { action: 'structure', kind: 'closed-loop', people: 6, cropAreaM2: 300, algaeM3: 2 } })
  assert('★ closed-loop 走规则表', out.ok === true && out.value.assessmentId === 'closed-loop', String(out.value?.assessmentId))
  assert('输出含自持上限', out.result.includes('maxSelfSufficientPeople'), out.result.slice(-120))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
