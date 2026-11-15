/**
 * topology 示例清单 + 小行星显示（反馈 107 次猜参数 / 5 篇小行星）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-ex-'))
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

console.log('-- 1. topology 示例清单 --')
{
  const out = await run({ operation: 'topology', topology: { action: 'examples' } })
  assert('★ examples 返回清单', out.ok === true && out.result.includes('可复制示例'), out.result.slice(0, 80))
  assert('★ 含全部 action（org/terrain/ship/validate）', ['org', 'terrain', 'ship', 'validate'].every((a) => out.result.includes(a)), '')
  assert('清单里有可直接粘贴的调用', out.result.includes('"operation":"topology"'), '')
}
console.log('-- 2. 拼错的 action 也给清单 --')
{
  const out = await run({ operation: 'topology', topology: { action: 'nope' } })
  assert('★ 未知 action → 清单（不报错）', out.ok === true && out.result.includes('可复制示例'), '')
}
console.log('-- 3. 小行星显示 --')
{
  const p = await run({ operation: 'world', planetMass: 0.0022, brief: true })
  assert('★ 冥王星质量显示 2.20e-3g（不是 0.00g）', p.ok === true && p.result.includes('2.20e-3g'), p.result.slice(0, 60))
  const a = await run({ operation: 'world', planetMass: 0.0001, brief: true })
  assert('小行星显示 1.00e-4g', a.ok === true && a.result.includes('1.00e-4g'), a.result.slice(0, 60))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
