/**
 * 反馈报告 v3：consistency 三漏（中文数字 / 阈值 / 同义词）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-consistency-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
async function check(a, b) {
  return run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: a }, { number: 2, text: b }] } })
}

console.log('-- 1. 中文数字 --')
{
  const out = await check('人口 八百 万', '人口 二千 万')
  assert('★ 八百 vs 二千 → 报 2.5 倍', out.ok === true && out.result.includes('2.5'), out.result.slice(0, 140))
  const same = await check('人口 八百万', '人口 800 万')
  assert('八百 万 与 800 万 不报（同值）', same.ok === true && same.result.includes('没有发现'), same.result.slice(0, 100))
}

console.log('-- 2. 阈值 10% --')
{
  const ten = await check('兵力 700 万', '兵力 800 万')
  assert('★ 14% 差 → 报（1.1 倍）', ten.ok === true && ten.result.includes('1.1'), ten.result.slice(0, 140))
  const small = await check('人口 1 亿', '人口 1.02 亿')
  assert('★ 2% 差 → 不报（精度差异）', small.ok === true && small.result.includes('没有发现'), small.result.slice(0, 100))
  const big = await check('人口 1 亿', '人口 3 亿')
  assert('3 倍差 → 报', big.ok === true && big.result.includes('3.0'), big.result.slice(0, 100))
}

console.log('-- 3. 同义词 --')
{
  const out = await check('总人口 8 亿', '人口 920 亿')
  assert('★ 总人口 / 人口 归一后报 115 倍', out.ok === true && out.result.includes('115'), out.result.slice(0, 140))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
