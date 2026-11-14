/**
 * 单位处理管道：统一别名索引（4,764 条）判定 + 换算。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-pipeline2-'))
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

console.log('-- 1. 统一索引规模与来源 --')
{
  const aliases = pipeMod.loadUnitAliases()
  const n = Object.keys(aliases).length
  assert('★ 别名 ≥ 4500', n >= 4500, String(n))
  assert('UCUM 别名来源正确（meter→ucum）', aliases['meter']?.source === 'ucum', JSON.stringify(aliases['meter']))
  assert('本地别名来源正确（担→local）', aliases['担']?.source === 'local', JSON.stringify(aliases['担']))
}

console.log('-- 2. UCUM 别名命中（防止「写对了却不认识」）--')
{
  const metre = await run({ expression: '1 metre to m' })
  assert('★ "metre"（同义词）→ 1 m', metre.ok === true && metre.result.includes('1 m'), metre.result.slice(0, 50))
  const litre = await run({ expression: '1 litre to L' })
  assert('★ "litre" → 1 L', litre.ok === true && litre.result.includes('1'), litre.result.slice(0, 50))
  const pound = await run({ expression: '1 pound to kg' })
  assert('★ "pound"（UCUM 同义词）→ 0.45359237 kg', pound.ok === true && pound.result.includes('0.4535'), pound.result.slice(0, 50))
}

console.log('-- 3. 本地非现代单位（桥接）--')
{
  const dan = await run({ expression: '1 担 to kg' })
  assert('★ 担 → 50 kg（桥接）', dan.ok === true && dan.result.includes('50'), dan.result.slice(0, 50))
  const shichi = await run({ expression: '1 市尺 to cm' })
  assert('★ 市尺 → 33.33 cm', shichi.ok === true && shichi.result.includes('33.3'), shichi.result.slice(0, 50))
  const rev = await run({ expression: '1 kg to 担' })
  assert('★ 回写：1 kg → 0.02 担', rev.ok === true && rev.result.includes('0.02'), rev.result.slice(0, 50))
}

console.log('-- 4. 分类与拒绝 --')
{
  assert('classify km = modern', pipeMod.classifyUnit('km') === 'modern', pipeMod.classifyUnit('km'))
  assert('classify 担 = nonmodern', pipeMod.classifyUnit('担') === 'nonmodern', pipeMod.classifyUnit('担'))
  assert('classify 未知 = unknown', pipeMod.classifyUnit('xyzzy') === 'unknown', pipeMod.classifyUnit('xyzzy'))
  const bad = pipeMod.convertUnits(1, '担', 'm')
  assert('★ 担（质量）→ m（长度）拒绝', bad.ok === false && bad.message.includes('量纲'), bad.message)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
