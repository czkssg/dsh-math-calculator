/**
 * 海绵状庇护所：小空腔网络（山体/太空舱群），跨度与 S/V 双限制。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-sponge-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const s = await import(pathToFileURL(join(root, 'lib/features/topology/sponge.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 小空腔不可太小（S/V 暴增）--')
{
  const small = s.designSpongeHabitat({ targetPeople: 1e6, cavityVolumeM3: 60 })
  const big = s.designSpongeHabitat({ targetPeople: 1e6, cavityVolumeM3: 1000 })
  assert('★ 60 m³ 室：边长 3.9 m，S/V 1.533', Math.abs(small.edgeM - 3.91) < 0.05 && Math.abs(small.surfaceToVolume - 1.533) < 0.01, JSON.stringify({ e: small.edgeM, sv: small.surfaceToVolume }))
  assert('★ 1000 m³ 室：边长 10 m，S/V 0.60', Math.abs(big.edgeM - 10) < 0.1 && Math.abs(big.surfaceToVolume - 0.6) < 0.01, JSON.stringify({ e: big.edgeM, sv: big.surfaceToVolume }))
  assert('★ 小室支护面积是大室的 2.5 倍', Math.abs(small.totalSurfaceM2 / big.totalSurfaceM2 - 2.55) < 0.05, String(small.totalSurfaceM2 / big.totalSurfaceM2))
}

console.log('-- 2. 千万级山体 --')
{
  const r = s.designSpongeHabitat({ targetPeople: 1e7, cavityVolumeM3: 60 })
  assert('★ 500 万空腔（60 m³、2 人/室）', r.cavityCount === 5000000, String(r.cavityCount))
  assert('★ 支护/密封面积 4.6e8 m²', Math.abs(r.totalSurfaceM2 / 1e8 - 4.598) < 0.01, String(r.totalSurfaceM2))
  assert('★ 排土 27 亿吨（开挖率 0.3）', Math.abs(r.spoilMassT / 1e9 - 2.7) < 0.01, String(r.spoilMassT))
  assert('每 m² 支护对应 0.65 m³ 空腔', Math.abs(r.volumePerSurfaceM3 - 0.652) < 0.01, String(r.volumePerSurfaceM3))
}

console.log('-- 3. 跨度限制 --')
{
  const ok = s.designSpongeHabitat({ targetPeople: 1e4, cavityVolumeM3: 60, maxSpanM: 15 })
  assert('★ 边长 3.9 m < 跨度 15 m → 通过', ok.spanOk === true, '')
  const bad = s.designSpongeHabitat({ targetPeople: 1e4, cavityVolumeM3: 8000, maxSpanM: 15 })
  assert('★ 边长 20 m > 跨度 15 m → 拒绝', bad.spanOk === false, String(bad.edgeM))
}

console.log('-- 4. 太空（无排土）--')
{
  const space = s.designSpongeHabitat({ targetPeople: 1e6, cavityVolumeM3: 100, mediumDensityKgM3: 0 })
  assert('★ 太空介质密度 0 → 排土 0', space.spoilMassT === 0, String(space.spoilMassT))
  assert('边长 4.64 m（100 m³ 室）', Math.abs(space.edgeM - 4.64) < 0.05, String(space.edgeM))
}

console.log('-- 5. 经 topology --')
{
  const out = await run({ operation: 'topology', topology: { action: 'structure', kind: 'sponge', targetPeople: 1e7, cavityVolumeM3: 60 } })
  assert('★ sponge 走规则表', out.ok === true && out.value.assessmentId === 'sponge', String(out.value?.assessmentId))
  const bad = await run({ operation: 'topology', topology: { action: 'structure', kind: 'sponge' } })
  assert('缺 targetPeople → 不附校核', bad.ok === true && bad.value.assessmentId === undefined, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
