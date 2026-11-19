/**
 * output（输出物理量名）全库覆盖：830 条主公式都要有，且语义可用。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-output-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const mains = formulas.filter((item) => !item.aliasOf)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 覆盖率 --')
{
  const empty = mains.filter((item) => !(typeof item.output === 'string' && item.output.trim() !== ''))
  assert('★ 830 条主公式全部有 output', empty.length === 0, empty.map((item) => item.id).slice(0, 6).join(','))
  const odd = mains.filter((item) => item.output.trim().length < 1 || item.output.trim().length > 14)
  assert('output 长度在 1–14 字（「功」可以）', odd.length === 0, odd.map((item) => item.id + ':' + item.output).slice(0, 5).join(','))
}
console.log('-- 2. 关键语义抽查 --')
{
  const expect = { kinetic_energy: '动能', hall_petch: '屈服强度', carnot_efficiency: '卡诺效率', wien_displacement: '峰值波长', population_fed_by_grain: '可养人口', mass_energy: '能量' }
  const byId = new Map(mains.map((item) => [item.id, item]))
  const bad = Object.entries(expect).filter(([id, word]) => byId.get(id)?.output !== word).map(([id, word]) => id + '(' + (byId.get(id)?.output ?? 'missing') + '≠' + word + ')')
  assert('★ 关键条目 output 正确', bad.length === 0, bad.join(','))
}
console.log('-- 3. 查询/网络仍工作 --')
{
  const f = await tool.execute({ operation: 'formula', formula: 'kinetic_energy', params: { m: 2, v: 3 } }, {})
  assert('★ 公式调用正常', f.ok === true && String(f.value?.web?.output ?? '').length > 0, String(f.value?.web?.output))
  const w = await tool.execute({ operation: 'formulas', query: 'web' }, {})
  assert('网查询正常', w.ok === true && String(w.result).includes('节点'), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }