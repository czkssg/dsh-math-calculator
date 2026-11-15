/**
 * 数据驱动耦合规则：建筑/舰船/太空舰船/太空建筑，未命中不瞎编。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-assess-rules-'))
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

console.log('-- 1. 规则表命中 --')
{
  const rules = [{ id: 'ship', match: { action: 'ship', requires: ['lengthM', 'beamM', 'draftM'] }, calculator: 'ship', output: 'engineering' }]
  const hit = engMod.resolveAssessment(rules, 'ship', { lengthM: 100, beamM: 15, draftM: 6 })
  assert('★ 主尺度齐 → 命中 ship', hit !== null && hit.rule.id === 'ship', JSON.stringify(hit && hit.rule.id))
  const miss = engMod.resolveAssessment(rules, 'ship', { massKg: 1 })
  assert('★ 缺 required → null（不瞎编）', miss === null, JSON.stringify(miss))
  const wrongAction = engMod.resolveAssessment(rules, 'structure', { lengthM: 100, beamM: 15, draftM: 6 })
  assert('动作不匹配 → null', wrongAction === null, '')
}

console.log('-- 2. 太空舰船（齐奥尔科夫斯基）--')
{
  const v = engMod.assessSpaceVessel({ massKg: 100000, deltaVKms: 10 })
  assert('★ 质量比 1.405', Math.abs(v.massRatio - 1.4048) < 0.01, String(v.massRatio))
  assert('★ 推进剂 40.5 t', Math.abs(v.propellantKg - 40481) < 200, String(v.propellantKg))
  assert('排气速度 29.4 km/s（Isp 3000）', Math.abs(v.exhaustVelocity - 29420) < 50, String(v.exhaustVelocity))
}

console.log('-- 3. 太空建筑（屏蔽 + 旋转重力）--')
{
  const h = engMod.assessSpaceHabitat({ floors: 5, footprintM2: 1000, spinning: true })
  assert('★ 500 人', h.people === 500, String(h.people))
  assert('★ 屏蔽质量 5.9e7 kg', Math.abs(h.shieldingKg / 1e7 - 5.95) < 0.2, String(h.shieldingKg))
  assert('★ 1 g 旋转半径 894 m（1 rpm）', Math.abs(h.spinRadiusM - 894) < 5, String(h.spinRadiusM))
  assert('不旋转 → 半径 null', engMod.assessSpaceHabitat({ floors: 1, footprintM2: 100, spinning: false }).spinRadiusM === null, '')
}

console.log('-- 4. 经 topology 四种类型 --')
{
  const b = await run({ operation: 'topology', topology: { action: 'structure', kind: 'building', levels: 100, area: 1000 } })
  assert('★ 建筑 → engineering（assessmentId=building）', b.ok === true && b.value.assessmentId === 'building', String(b.value?.assessmentId))
  const s = await run({ operation: 'topology', topology: { action: 'ship', lengthM: 100, beamM: 15, draftM: 6, compartments: [{ id: 'A' }], entry: 'A', passages: [] } })
  assert('★ 舰船 → assessmentId=ship', s.ok === true && s.value.assessmentId === 'ship', String(s.value?.assessmentId))
  const sv = await run({ operation: 'topology', topology: { action: 'ship', kind: 'space-vessel', massKg: 100000, deltaVKms: 10, compartments: [{ id: 'A' }], entry: 'A', passages: [] } })
  assert('★ 太空舰船 → assessmentId=space-vessel', sv.ok === true && sv.value.assessmentId === 'space-vessel', String(sv.value?.assessmentId))
  const sh = await run({ operation: 'topology', topology: { action: 'structure', kind: 'space-habitat', levels: 5, area: 1000, spinning: true } })
  assert('★ 太空建筑 → assessmentId=space-habitat', sh.ok === true && sh.value.assessmentId === 'space-habitat', String(sh.value?.assessmentId))
}

console.log('-- 5. 自由性：改规则表即生效 --')
{
  const rules = [{ id: 'custom', match: { action: 'ship', kind: 'my-ship', requires: ['lengthM', 'beamM', 'draftM'] }, calculator: 'ship', output: 'engineering' }]
  const hit = engMod.resolveAssessment(rules, 'ship', { kind: 'my-ship', lengthM: 50, beamM: 8, draftM: 3 })
  assert('★ 自定义规则（kind=my-ship）生效', hit !== null && hit.rule.id === 'custom', '')
  const noKind = engMod.resolveAssessment(rules, 'ship', { lengthM: 50, beamM: 8, draftM: 3 })
  assert('规则带 kind 时，无名 kind 不命中', noKind === null, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
