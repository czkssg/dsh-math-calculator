/**
 * structure 测试：建筑容量/限高、载具续航/载荷。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-str-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/topology/structure.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

console.log('-- 1. 建筑 --')
{
  const out = mod.assessStructure({ kind: 'building', floors: 10, footprintM2: 800 })
  assert('★ 10 层 × 800m² / 15m² 人 = 533 人', out.value.capacity === 533, String(out.value.capacity))
  assert('总高 35m', out.value.heightM === 35, String(out.value.heightM))
  assert('★ 地球限高约 4903m，35m 通过', out.value.ok === true && near(out.value.limitM, 4903, 20), String(out.value.limitM))

  const tall = mod.assessStructure({ kind: 'building', floors: 2000, footprintM2: 800 })
  assert('★ 2000 层 7000m 超过限高', tall.value.ok === false, String(tall.value.heightM))
  assert('超限给 notice', (tall.notice ?? '').includes('超过材料上限'), String(tall.notice))

  const heavy = mod.assessStructure({ kind: 'building', floors: 800, footprintM2: 800, world: { planetMass: 2 } })
  assert('★ 2g 星球限高约 2451m', near(heavy.value.limitM, 2451, 20), String(heavy.value.limitM))
  assert('2g 星球 2800m 塔超限', heavy.value.ok === false, '')

  assert('floors ≤ 0 → invalid_argument', throwsOf(() => mod.assessStructure({ kind: 'building', floors: 0, footprintM2: 800 }))?.type === 'invalid_argument', '')
}

console.log('-- 2. 载具 --')
{
  const out = mod.assessStructure({ kind: 'vehicle', massKg: 5000, payloadKg: 1000, speedKph: 200, energyJ: 1e10, energyPerKmJ: 1e6 })
  assert('★ 续航 = 1e10 / 1e6 = 10000km', out.value.rangeKm === 10000, String(out.value.rangeKm))
  assert('★ 时间 = 10000 / 200 = 50h', near(out.value.hours, 50, 1e-9), String(out.value.hours))
  assert('载荷比 20%', near(out.value.payloadRatio, 0.2, 1e-9), String(out.value.payloadRatio))
  assert('载荷比合理 → 无 notice', out.notice === undefined, String(out.notice))

  const overload = mod.assessStructure({ kind: 'vehicle', massKg: 5000, payloadKg: 6000, speedKph: 200, energyJ: 1e10, energyPerKmJ: 1e6 })
  assert('★ 载荷比 > 1 给出提示', overload.value.payloadRatio > 1 && (overload.notice ?? '').includes('载荷比 > 1'), String(overload.notice))

  assert('energyJ ≤ 0 → invalid_argument', throwsOf(() => mod.assessStructure({ kind: 'vehicle', massKg: 1, speedKph: 1, energyJ: 0, energyPerKmJ: 1 }))?.type === 'invalid_argument', '')
  assert('缺输入 → missing_params', throwsOf(() => mod.assessStructure(undefined))?.type === 'missing_params', '')
  assert('未知 kind → unknown_argument', throwsOf(() => mod.assessStructure({ kind: 'ship' }))?.type === 'unknown_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
