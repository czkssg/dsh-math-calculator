/**
 * 2026-11-25 反馈修复：calls 继承 variables、工作区变量生效、BigNumber 溢出、not_found。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-fb1125-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. calls 继承 variables（P0）--')
{
  const out = await run({ variables: { LOW_FUEL: 101, GJ_LOW: 41.5 }, calls: [{ operation: 'evaluate', expression: 'LOW_FUEL/GJ_LOW' }] })
  const first = out.value?.results?.[0]
  assert('★ 批量条目能读到外层 variables', out.ok === true && first?.ok === true, JSON.stringify(first?.error ?? null))
  assert('★ 结果正确 2.4337…', String(first?.value ?? '').startsWith('2.4337'), String(first?.value))
  /** 条目自带变量应合并（条目优先，外层其余保留） */
  const merged = await run({ variables: { A: 2, B: 4 }, calls: [{ operation: 'evaluate', expression: 'A+B', variables: { B: 10 } }] })
  assert('★ 条目变量覆盖外层同名、其余保留', merged.ok === true && Number(merged.value?.results?.[0]?.value) === 12, String(merged.value?.results?.[0]?.value))
}
console.log('-- 2. 工作区变量生效（P0）--')
{
  await run({ operation: 'workspace', action2: 'create', workspace: 'fbws' })
  await run({ operation: 'workspace', action2: 'set', workspace: 'fbws', workspaceVariables: { AA: 10, BB: 4 } })
  await run({ operation: 'workspace', action2: 'set', workspace: 'fbws', useWorkspaceVariables: true })
  await run({ operation: 'workspace', action2: 'switch', workspace: 'fbws' })
  const out = await run({ operation: 'evaluate', expression: 'AA/BB' })
  assert('★ evaluate 读到工作区变量', out.ok === true && Number(out.value) === 2.5, JSON.stringify(out.value ?? out.error))
  /** 调用参数应优先于工作区 */
  const override = await run({ operation: 'evaluate', expression: 'AA/BB', variables: { AA: 20 } })
  assert('★ 调用参数优先于工作区', override.ok === true && Number(override.value) === 5, String(override.value))
  /** 关掉开关后不该读到 */
  await run({ operation: 'workspace', action2: 'set', workspace: 'fbws', useWorkspaceVariables: false })
  const off = await run({ operation: 'evaluate', expression: 'AA/BB' })
  /** 关掉开关后 nil 解析成单位（A=安培）——不报错但结果带单位，不是数字答案。 */
  assert('★ 关掉开关后不把工作区变量当数字用', off.ok === false || String(off.value) !== '2.5', String(off.value))
}
console.log('-- 3. BigNumber 溢出（P1）--')
{
  const out = await run({ operation: 'evaluate', expression: '(COAL/GJ_COAL - LOW_FUEL/GJ_LOW)/(COAL/GJ_COAL)*100', variables: { COAL: 80, GJ_COAL: 25, LOW_FUEL: 101, GJ_LOW: 41.5 } })
  assert('★ 复合式不再溢出', out.ok === true, JSON.stringify(out.error ?? null))
  assert('★ 结果 23.945…', String(out.value).startsWith('23.945'), String(out.value))
  const simple = await run({ operation: 'evaluate', expression: 'LOW_FUEL/GJ_LOW', variables: { LOW_FUEL: 101, GJ_LOW: 41.5 } })
  assert('★ 单条仍正确（未回归）', simple.ok === true && String(simple.value).startsWith('2.4337'), String(simple.value))
}
console.log('-- 4. not_found（P2）--')
{
  const out = await run({ operation: 'workspace', action2: 'switch', workspace: '不存在的世界' })
  assert('★ 工作区不存在 → not_found', out.ok === false && out.error?.type === 'not_found', String(out.error?.type))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
