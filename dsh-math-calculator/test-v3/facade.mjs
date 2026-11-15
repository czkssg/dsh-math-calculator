/**
 * 门面：53 个 operation 收成 3 个入口（calc / derive / manage），旧名仍可用。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-facade-'))
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

console.log('-- 1. calc 门面 --')
{
  const e = await run({ operation: 'calc', op: 'evaluate', expression: '1/8' })
  assert('★ calc:evaluate = 0.125', e.ok === true && e.result.includes('0.125'), e.result.slice(0, 40))
  const s = await run({ operation: 'calc', op: 'solve', expression: 'x^2-9=0' })
  assert('★ calc:solve = ±3', s.ok === true && s.result.includes('3') && s.result.includes('-3'), s.result.slice(0, 60))
  const f = await run({ operation: 'calc', op: 'formula', formula: 'ideal_gas', params: { n: 1, T: 300 } })
  assert('★ calc:formula 可用', f.ok === true && f.result.includes('理想气体'), f.result.slice(0, 40))
}

console.log('-- 2. derive 门面 --')
{
  const w = await run({ operation: 'derive', op: 'world', planetMass: 1.5, planetRadius: 1.2, brief: true })
  assert('★ derive:world 可用', w.ok === true && w.result.includes('骨架'), w.result.slice(0, 50))
  const d = await run({ operation: 'derive', op: 'derivation', derivation: 'anchors' })
  assert('★ derive:derivation 可用', d.ok === true && d.result.includes('锚点'), d.result.slice(0, 50))
}

console.log('-- 3. manage 门面 --')
{
  const h = await run({ operation: 'manage', op: 'help' })
  assert('★ manage:help 可用', h.ok === true && h.result.includes('能力目录'), h.result.slice(0, 40))
  const w = await run({ operation: 'manage', op: 'workspace', action: 'list' })
  assert('manage:workspace 可用', w.ok === true || w.error?.type !== 'invalid_argument', String(w.error?.type ?? 'ok'))
}

console.log('-- 4. 错误与兼容 --')
{
  const bad = await run({ operation: 'calc', op: 'nope' })
  assert('★ 非法子命令 → 给可用清单（不报错）', bad.ok === true && bad.result.includes('不接受 op'), bad.result.slice(0, 60))
  const none = await run({ operation: 'calc' })
  assert('★ 缺 op → 给清单', none.ok === true && none.result.includes('需要 op'), none.result.slice(0, 60))
  const legacy = await run({ operation: 'evaluate', expression: '2+2' })
  assert('★ 旧 op 名仍可用（不破坏兼容）', legacy.ok === true && legacy.result.includes('4'), legacy.result.slice(0, 40))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
