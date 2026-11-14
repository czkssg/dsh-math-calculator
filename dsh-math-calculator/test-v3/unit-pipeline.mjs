/**
 * 单位处理管道：现代 ↔ UCUM，非现代先经桥接换 SI 再 UCUM/回写。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-pipeline-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const pipeMod = await import(pathToFileURL(join(root, 'lib/core/unit-pipeline.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 分类 --')
{
  assert('modern: km', pipeMod.classifyUnit('km') === 'modern', pipeMod.classifyUnit('km'))
  assert('nonmodern: 担', pipeMod.classifyUnit('担') === 'nonmodern', pipeMod.classifyUnit('担'))
  assert('unknown: 未知词', pipeMod.classifyUnit('xyzzy') === 'unknown', pipeMod.classifyUnit('xyzzy'))
}

console.log('-- 2. 四条路径 --')
{
  const mm = pipeMod.convertUnits(1, 'km', 'm')
  assert('★ 现代→现代（UCUM）', mm.ok && mm.value === 1000 && mm.message.includes('UCUM'), JSON.stringify({ v: mm.value, m: mm.message }))
  const nm = pipeMod.convertUnits(1, '担', 'kg')
  assert('★ 非现代→现代（桥接→SI）', nm.ok && nm.value === 50 && nm.steps.length > 0, JSON.stringify({ v: nm.value, s: nm.steps }))
  const mn = pipeMod.convertUnits(1, 'kg', '担')
  assert('★ 现代→非现代（回写）', mn.ok && Math.abs((mn.value ?? 0) - 0.02) < 1e-9, String(mn.value))
  const nn = pipeMod.convertUnits(1, '担', '斤')
  assert('★ 非现代→非现代', nn.ok && nn.value === 100, String(nn.value))
}

console.log('-- 3. 经 tool 全链路 --')
{
  const a = await run({ expression: '1 kg to 担' })
  assert('1 kg → 0.02 担（带步骤说明）', a.ok === true && a.result.includes('0.02') && a.notice.includes('单位管道'), a.result.slice(0, 50))
  const b = await run({ expression: '1 kg/m³ to g/cm³' })
  assert('★ 上标复合走 UCUM', b.ok === true && b.result.includes('0.001') && b.notice.includes('UCUM'), b.result.slice(0, 50))
  const c = await run({ expression: '3 舍/日程 to km/h' })
  assert('★ 非现代复合 → 现代', c.ok === true && c.result.includes('6'), c.result.slice(0, 50))
  const d = await run({ expression: '2+2' })
  assert('普通表达式不接管', d.ok === true && d.result.trim() === '4', d.result)
}

console.log('-- 4. 量纲不同要拒绝 --')
{
  const bad = pipeMod.convertUnits(1, '担', 'm')
  assert('★ 担（质量）→ m（长度）拒绝', bad.ok === false, bad.message)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
