/**
 * derivation 演示模式：五条子命令无参也能跑（反馈报告 H 类）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deriv-demo-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(sub, extra) {
  return tool.execute({ operation: 'derivation', derivation: sub, ...(extra ?? {}) }, {})
}

console.log('-- 1. 无参也可跑（演示模式）--')
{
  const back = await run('backSolve')
  assert('★ backSolve 无参：列锚点 + 演示', back.ok === true && back.result.includes('可反推的叙事锚点'), String(back.error?.message))
  const impact = await run('impact')
  assert('★ impact 无参：列可查量 + 演示', impact.ok === true && impact.result.includes('可查影响的量'), String(impact.error?.message))
  const fantasy = await run('fantasy')
  assert('★ fantasy 无参：示例能力', fantasy.ok === true && fantasy.result.includes('演示模式'), String(fantasy.error?.message))
  const compare = await run('compare')
  assert('★ compare 无参：演示对比', compare.ok === true && compare.result.includes('演示模式'), String(compare.error?.message))
  const diff = await run('diff')
  assert('★ diff 无参：演示差异', diff.ok === true && diff.result.includes('演示模式'), String(diff.error?.message))
}

console.log('-- 2. 给参仍走真实逻辑 --')
{
  const back = await run('backSolve', { anchor: 'creatureHeight', anchorValue: 50 })
  assert('backSolve 给锚点 → 真实解', back.ok === true && !back.result.includes('演示'), back.result.slice(0, 60))
  const impact = await run('impact', { traceTarget: 'alpha' })
  assert('impact 给目标 → 真实影响面', impact.ok === true && !impact.result.includes('演示'), impact.result.slice(0, 60))
  const bad = await run('impact', { traceTarget: '不存在的东西' })
  assert('★ impact 未知目标 → unknown_symbol', bad.ok === false && bad.error?.type === 'unknown_symbol', JSON.stringify(bad.error))
}

console.log('-- 3. 输出说明是演示 --')
{
  const compare = await run('compare')
  assert('演示结果带「真实对比」提示', compare.result.includes('真实对比'), compare.result.slice(0, 80))
  const back = await run('backSolve')
  assert('演示结果带「要算别的」提示', back.result.includes('要算别的'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
