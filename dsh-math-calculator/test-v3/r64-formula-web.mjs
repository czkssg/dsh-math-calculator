/**
 * 公式网：物理常数 → 第一层公式 → 下游公式（全量网查询）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-web-'))
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

console.log('-- 1. 全量统计 --')
{
  const out = await run({ operation: 'formulas', query: 'web' })
  assert('★ 统计输出成功', out.ok === true, String(out.error?.message))
  const v = out.value
  assert('★ 常数节点 ≥ 40', v.constants >= 40, String(v.constants))
  assert('★ 公式节点 = 805', v.formulas === 805, String(v.formulas))
  assert('★ 常数边 ≥ 100', v.constantEdges >= 100, String(v.constantEdges))
  assert('★ 公式边 ≥ 60000（闭合版）', v.formulaEdges >= 60000, String(v.formulaEdges))
  assert('★ 物理量组 ≥ 20', v.groups >= 20, String(v.groups))
  assert('★ 从常数可达的公式 ≥ 650', v.reachable >= 650, String(v.reachable))
  assert('无入边（源/孤立）≤ 130', v.sources <= 130, String(v.sources))
  assert('无出边（汇）≤ 50', v.sinks <= 50, String(v.sinks))
  assert('★ 闭合环 ≥ 10000 条环边', v.cycleEdges >= 10000, String(v.cycleEdges))
  assert('result 说明强边口径', String(out.result).includes('强边'), '')
  assert('result 报告闭合环', String(out.result).includes('闭合环'), '')
  assert('环样例可读', /→/.test(String(out.result)), '')
}

console.log('-- 2. 从常数出发（G）--')
{
  const out = await run({ operation: 'formulas', query: 'web', formulaFocus: 'G', webDepth: 2 })
  assert('★ G 第 0 层', String(out.result).includes('第 0 层 · G = 6.6743e-11'), String(out.result).slice(0, 80))
  assert('★ G 第 1 层含万有引力', String(out.result).includes('gravitation') && String(out.result).includes('作为 G'), '')
  assert('★ G 第 1 层含环绕速度', String(out.result).includes('orbital_velocity'), '')
  assert('★ G 第 2 层存在', String(out.result).includes('第 2 层'), '')
}

console.log('-- 3. 从公式出发（上下游）--')
{
  const out = await run({ operation: 'formulas', query: 'web', formulaFocus: 'orbital_velocity', webDirection: 'both', webDepth: 1 })
  assert('★ orbital_velocity 下游含动能', String(out.result).includes('kinetic_energy'), '')
  assert('★ 输出含上下游标题', String(out.result).includes('下游：') && String(out.result).includes('上游：'), '')
}

console.log('-- 4. 边界 --')
{
  const unknown = await run({ operation: 'formulas', query: 'web', formulaFocus: 'no-such-thing' })
  assert('★ 未知 focus → unknown_formula', unknown.ok === false && unknown.error?.type === 'unknown_formula', String(unknown.error?.type))
  const limited = await run({ operation: 'formulas', query: 'web', formulaFocus: 'G', webDepth: 2, webLimit: 5 })
  assert('★ webLimit 生效（有截断提示）', String(limited.result).includes('另有'), '')
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
