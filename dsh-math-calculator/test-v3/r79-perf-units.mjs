/**
 * 压测第四/五轮回归：putRecord 性能、units 全表、rad_dose 映射与显示。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-stress4-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. putRecord 性能 --')
{
  const start = Date.now()
  let ok = 0
  for (let i = 0; i < 5000; i += 1) { if ((await run({ operation: 'data', dataAction: 'put', kind: 'note', name: '批量' + i, payload: { i } })).ok) ok += 1 }
  const elapsed = Date.now() - start
  assert('★ 5000 条 put 全部成功', ok === 5000, String(ok))
  assert('★ 5000 条 put ≤ 30s（此前 52s）', elapsed < 30000, elapsed + 'ms')
  const got = await run({ operation: 'data', dataAction: 'get', name: '批量4999' })
  assert('读回版本正确', got.value?.record?.version === 1, String(got.value?.record?.version))
}
console.log('-- 2. units 全表 --')
{
  const units = JSON.parse(readFileSync(join(root, 'src/data/units.json'), 'utf8'))
  const all = units.ALL_UNITS || units
  const groups = new Map()
  for (const unit of all) { if (!groups.has(unit.dimension)) groups.set(unit.dimension, []); groups.get(unit.dimension).push(unit.name) }
  const pairs = [...groups.values()].filter((names) => names.length >= 2).slice(0, 100).map((names) => [names[0], names[1]])
  let ok = 0
  for (const [from, to] of pairs) { if ((await run({ operation: 'units', unitFrom: from, unitTo: to, unitValue: 1 })).ok) ok += 1 }
  assert('★ 同量纲单位对全部可换算', ok === pairs.length, ok + '/' + pairs.length)
}
console.log('-- 3. rad_dose --')
{
  const forward = await run({ operation: 'units', unitFrom: 'Gy', unitTo: 'rad_dose', unitValue: 1 })
  assert('★ 1 Gy = 100 rad_dose', forward.ok === true && String(forward.result).includes('100 rad_dose'), String(forward.result).replace(/\s+/g, ' ').slice(0, 50))
  const same = await run({ operation: 'units', unitFrom: 'rad_dose', unitTo: 'rad_dose', unitValue: 5 })
  assert('★ 显示还原为 rad_dose（不是 raddose）', same.ok === true && String(same.result).includes('rad_dose') && !String(same.result).includes('raddose'), String(same.result).replace(/\s+/g, ' ').slice(0, 50))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
