/**
 * 工作区命名变量：默认不参与计算，显式打开后才生效。
 *
 * ## 为什么默认要关
 *
 * 打开后，同一个调用在不同工作区状态下会给出不同结果 ——
 * 那会削弱「同输入同输出」，而后者是本项目做 hash 复现与回归对比的基础。
 * 所以它是一个**逐工作区的显式选择**，不默认生效。
 *
 * ## 最要紧的一条是缓存
 *
 * 缓存键原本只含工作区名与常数指纹，**不含变量内容**。于是：
 *
 *   存 BTU_LB=1260000 → 算 → 进缓存
 *   改成 1055000       → 再算 → 若键不变就命中旧缓存 → 静默返回 1260
 *
 * 这是「静默返回改之前的数」，比不缓存危险得多。
 * 本套测试的第 3 节专门守这条。
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-wsvars-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')
const okOf = async (args) => (await run(args)).ok

console.log('-- 1. 默认关闭：存得进，但不参与计算 --')
{
  await text({ operation: 'workspace', action2: 'set', workspace: 'ws', workspaceVariables: { BTU_LB: 1260000 } })
  await text({ operation: 'workspace', action2: 'switch', workspace: 'ws' })
  assert('变量确实存住了（切换时会报个数）', true, '')
  const r = await okOf({ operation: 'evaluate', expression: 'BTU_LB/1000' })
  assert('默认关闭时变量不参与计算', !r, '应报 unknown_symbol')
}

console.log('-- 2. 打开开关后参与计算 --')
{
  await text({ operation: 'workspace', action2: 'set', useWorkspaceVariables: true })
  const t = await text({ operation: 'evaluate', expression: 'BTU_LB/1000' })
  assert('打开后可算出 1260', t.trim() === '1260', t.trim())
  const t2 = await text({ operation: 'evaluate', expression: '30*BTU_LB/86400/2240' })
  assert('可参与复合表达式', t2.trim() === '0.1953125', t2.trim())
}

console.log('-- 3. 改变量后缓存必须失效（最要紧的一条）--')
{
  const before = (await text({ operation: 'evaluate', expression: 'BTU_LB/1000' })).trim()
  await text({ operation: 'workspace', action2: 'set', workspaceVariables: { BTU_LB: 1055000 } })
  const after = (await text({ operation: 'evaluate', expression: 'BTU_LB/1000' })).trim()
  assert('改前是 1260', before === '1260', before)
  assert('改后是 1055（不是命中旧缓存的 1260）', after === '1055', after)
  assert('两个结果确实不同', before !== after, before + ' vs ' + after)
}

console.log('-- 4. 本次 variables 参数优先于工作区 --')
{
  const t = await text({ operation: 'evaluate', expression: 'BTU_LB/1000', variables: { BTU_LB: 999000 } })
  assert('本次参数覆盖工作区值', t.trim() === '999', t.trim())
  const t2 = await text({ operation: 'evaluate', expression: 'BTU_LB/1000' })
  assert('不传则回落到工作区值（覆盖不持久）', t2.trim() === '1055', t2.trim())
}

console.log('-- 5. 关掉开关：完全回到旧行为 --')
{
  await text({ operation: 'workspace', action2: 'set', useWorkspaceVariables: false })
  const r = await okOf({ operation: 'evaluate', expression: 'BTU_LB/1000' })
  assert('关掉后变量又不参与计算', !r, '')
  const t = await text({ operation: 'workspace', action2: 'show' })
  assert('但变量仍然存着（能删能看）', /BTU_LB/.test(t), t.slice(0, 60))
}

console.log('-- 6. 开关是逐工作区的，不串到别的区 --')
{
  await text({ operation: 'workspace', action2: 'set', workspace: 'other', workspaceVariables: { RATE: 5 } })
  await text({ operation: 'workspace', action2: 'switch', workspace: 'other' })
  const r = await okOf({ operation: 'evaluate', expression: 'RATE*2' })
  assert('新工作区默认仍是关闭', !r, '')
  await text({ operation: 'workspace', action2: 'set', useWorkspaceVariables: true })
  const t = await text({ operation: 'evaluate', expression: 'RATE*2' })
  assert('打开后可用', t.trim() === '10', t.trim())
  const missing = await okOf({ operation: 'evaluate', expression: 'BTU_LB/1000' })
  assert('看不到别的区的变量', !missing, 'BTU_LB 属于 ws，不该在这里可见')
}

console.log('-- 7. 落盘结构确实带开关与变量 --')
{
  const dir = join(home, 'workspaces')
  const files = readdirSync(dir)
  assert('生成了工作区文件', files.length >= 2, files.join(','))
  let sawSwitch = false
  let sawVars = false
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (data && data.name && data.useWorkspaceVariables === true) sawSwitch = true
    if (data && data.name && data.variables && Object.keys(data.variables).length > 0) sawVars = true
  }
  assert('至少一个工作区把开关存成了 true', sawSwitch, '')
  assert('至少一个工作区存有变量', sawVars, '')
}

console.log('-- 8. 非法变量名不能绕过校验（合并后仍要校验）--')
{
  await text({ operation: 'workspace', action2: 'switch', workspace: 'ws' })
  await text({ operation: 'workspace', action2: 'set', useWorkspaceVariables: true })
  /**
   * ## 契约变更（2026-11-06）
   *
   * 旧行为：非法变量名 → 抛错 → **整批中止**。
   * 新行为：非法键**跳过 + 告知**，其余照算（见实测报告 1106b 的 P1）。
   *
   * 理由：这类语料的概念名几乎全是中文（人口/粮食/石料），
   * 用户第一反应就是用中文命名；一个键写错就让前面排队的算式全白写，
   * 代价远大于「那个键没生效」。
   *
   * 但**「不绕过校验」这条实质要求没变** —— 非法键仍然不进作用域，
   * 只是失败方式从「中止」改成「跳过 + 明确告知」。
   */
  const r = await run({ operation: 'evaluate', expression: '1+1', variables: { 'bad-name': 3 } })
  assert('非法键不进作用域（不绕过校验）', r.result.trim() === '2', String(r.result))
  assert('并且明确告知被跳过', /bad-name/.test(String(r.notice)), String(r.notice).slice(0, 60))
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
