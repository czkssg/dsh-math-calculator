/**
 * 借 UCUM 代码建体系：把本地单位注册进 UnitTables，换算走 UCUM 引擎。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ucum-reg-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const regMod = await import(pathToFileURL(join(root, 'lib/core/ucum-registry.js')).href)
const pipeMod = await import(pathToFileURL(join(root, 'lib/core/unit-pipeline.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. 注册规模 --')
{
  const result = regMod.registerLocalUnits()
  assert('★ 注册 ≥ 650 个本地单位', result.registered >= 650, String(result.registered))
  assert('注册错误可控（< 60）', result.errors.length < 60, String(result.errors.length))
}

console.log('-- 2. UCUM 引擎直接换算本地单位 --')
{
  assert('★ 担 → kg = 50', regMod.convertViaUcum(1, '担', 'kg') === 50, String(regMod.convertViaUcum(1, '担', 'kg')))
  const shichi = regMod.convertViaUcum(1, '市尺', 'cm')
  assert('★ 市尺 → cm = 33.33', shichi !== null && Math.abs(shichi - 33.333) < 0.01, String(shichi))
  const pood = regMod.convertViaUcum(1, '普特', 'kg')
  assert('★ 普特 → kg = 16.38', pood !== null && Math.abs(pood - 16.38) < 0.001, String(pood))
  const acre = regMod.convertViaUcum(1, '英亩', 'm2')
  assert('★ 英亩 → m² = 4046.86', acre !== null && Math.abs(acre - 4046.8564224) < 0.01, String(acre))
  const bushel = regMod.convertViaUcum(1, '蒲式耳', 'L')
  assert('★ 蒲式耳 → L = 35.239', bushel !== null && Math.abs(bushel - 35.239) < 0.01, String(bushel))
  const versta = regMod.convertViaUcum(1, '俄里', 'm')
  assert('★ 俄里 → m = 1066.8', versta !== null && Math.abs(versta - 1066.8) < 0.01, String(versta))
}

console.log('-- 3. 管道：UCUM 引擎优先，体积回退索引 --')
{
  const dan = pipeMod.convertUnits(1, '担', 'kg')
  assert('★ 担→kg 走 UCUM 引擎', dan.ok && dan.value === 50 && dan.message.includes('UCUM'), JSON.stringify({ v: dan.value, m: dan.message }))
  const bu = pipeMod.convertUnits(1, '蒲式耳', 'L')
  assert('★ 蒲式耳→L 回退索引（35.239）', bu.ok && Math.abs((bu.value ?? 0) - 35.239) < 0.01, String(bu.value))
  const litre = pipeMod.convertUnits(1, 'L', 'mL')
  assert('★ L→mL = 1000（UCUM 识别 L 为 liters）', litre.ok && Math.abs((litre.value ?? 0) - 1000) < 0.01, String(litre.value))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
