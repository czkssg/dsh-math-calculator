/**
 * consistency 的中国数字与指代主体（R48 反馈）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-cons-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
console.log('-- 1. 中文数字 --')
{
  const r = await run({ operation: 'consistency', consistency: { sections: [
    { number: 1, text: '北境军有八百人。' },
    { number: 2, text: '北境军有二千人。' },
  ] } })
  assert('★ 八百/二千 都能抽成数字', r.ok === true && r.value.claimCount === 2, String(r.value?.claimCount))
  assert('★ 八百→800、二千→2000', r.value.allClaims.map((c) => c.value).sort((a, b) => a - b).join(',') === '800,2000', JSON.stringify(r.value.allClaims.map((c) => c.value)))
  assert('★ 同一主体 → 报冲突', r.value.conflicts.length === 1, JSON.stringify(r.value.conflicts.map((c) => c.subject)))
}
console.log('-- 2. 指代主体被丢弃且明确告知 --')
{
  const r = await run({ operation: 'consistency', consistency: { sections: [{ text: '这支军队有八百人。' }] } })
  assert('★ 指代主体不参与比对（抽 0 条）', r.value.claimCount === 0, String(r.value.claimCount))
  assert('★ 必须列出被丢弃的主体（不静默通过）', Array.isArray(r.value.droppedSubjects) && r.value.droppedSubjects.length === 1, JSON.stringify(r.value.droppedSubjects))
  assert('★ 结果里明确说「被丢弃」', String(r.result).includes('被丢弃'), String(r.result).slice(0, 80))
  assert('不给「已检查过」的假安全感', String(r.result).includes('未参与比对'), '')
}
console.log('-- 3. 段号不出现 undefined --')
{
  const r = await run({ operation: 'consistency', consistency: { sections: [{ text: '人口 100 万。' }] } })
  assert('★ 无 number 时不写「第undefined段」', !String(r.result).includes('undefined'), String(r.result).slice(0, 100))
  const withNum = await run({ operation: 'consistency', consistency: { sections: [{ number: 3, text: '人口 100 万。' }] } })
  assert('★ 有 number 时写「第3段」', String(withNum.result).includes('第3段'), '')
}
console.log('-- 4. 成本 vs 售价是两个量（不是冲突）--')
{
  const r = await run({ operation: 'consistency', consistency: { sections: [{ text: '成本 100 元，售价 80 元。' }] } })
  assert('★ 成本与售价是不同主体 → 不算口径冲突', r.value.conflicts.length === 0, JSON.stringify(r.value.conflicts))
  assert('但两个量都被抽出（供核对）', r.value.allClaims.length === 2, String(r.value.allClaims.length))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
