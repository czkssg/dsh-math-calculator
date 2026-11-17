/**
 * 入口收尾批：剩余 8 个 operation（constants/workspace/quantities/formula-table/custom/balance/help/auto）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-tool-rest-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const dispatch = await import(pathToFileURL(join(root, 'lib/dispatch.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) {
  return tool.execute(args, {})
}

console.log('-- 1. constants --')
{
  const list = await run({ operation: 'constants' })
  assert('无改动 → 列基础旋钮', list.ok === true && list.result.includes('基础旋钮') && list.result.includes('派生量'), list.result.slice(0, 80))
  const changed = await run({ operation: 'constants', constants: { c: 1.5e8 } })
  assert('★ 改 c → 改动清单 + 无量纲视角', changed.ok === true && changed.result.includes('你直接改动的旋钮') && changed.result.includes('无量纲视角'), changed.result.slice(0, 100))
  assert('偏离评分', typeof changed.value.deviationScore === 'number', String(changed.value?.deviationScore))
  const preview = await run({ operation: 'constants', constants: { c: 1.5e8 }, preview: true })
  assert('★ preview 不生效', preview.ok === true && preview.value.applied === false, String(preview.value?.applied))
  const reset = await run({ operation: 'constants', constants: {} })
  assert('★ 传空对象 → 恢复现实宇宙', reset.ok === true && reset.result.includes('已恢复现实宇宙'), reset.result.slice(0, 60))
}

console.log('-- 2. quantities --')
{
  const out = await run({ operation: 'quantities', constants: { G: 1e-10 }, constantName: 'G' })
  assert('三类量分段', out.ok === true && out.result.includes('导出量') && out.result.includes('设定量') && out.result.includes('受限量'), out.result.slice(0, 100))
  assert('★ 给 constantName → 缩放指数表', out.result.includes('缩放指数'), '')
  assert('轨道周期对 G 是负指数', out.value.derived.some((item) => item.relativeChange !== 0), '')
}

console.log('-- 3. balance --')
{
  const out = await run({ operation: 'balance', balance: { grain: { demand: 2.7e6, supply: 3.1e6, unit: '吨' }, fodder: { demand: 1e6, supply: 1.2e6, unit: '吨' } } })
  assert('★ 两项都撑得住', out.ok === true && out.value.checks.length === 2 && out.value.sustainable === true, JSON.stringify(out.value.verdict))
  const short = await run({ operation: 'balance', balance: { grain: { demand: 100, supply: 80 } } })
  assert('★ 缺口 → 最短板', short.ok === true && short.result.includes('最短板'), short.result.slice(0, 100))
  const bad = await run({ operation: 'balance', balance: { grain: { demand: -1, supply: 1 } } })
  assert('负数 → invalid_argument', bad.ok === false && bad.error?.type === 'invalid_argument', JSON.stringify(bad.error))
}

console.log('-- 4. workspace / custom / formula-table --')
{
  const created = await run({ operation: 'workspace', action2: 'create', workspace: '北境' })
  assert('★ 创建工作区并切换', created.ok === true && created.value.current === '北境', created.result.slice(0, 60))
  const set = await run({ operation: 'workspace', action2: 'set', workspaceVariables: { m: 620 }, useWorkspaceVariables: true })
  assert('set 写入变量', set.ok === true && set.value.data.variables.m === 620, '')
  const list = await run({ operation: 'workspace', action2: 'list' })
  assert('list 含北境', list.ok === true && list.value.workspaces.includes('北境'), JSON.stringify(list.value))

  const customAdd = await run({ operation: 'custom', customAction: 'add', customConstant: { name: 'aetherPressure', label: '以太压', value: 1e5, unit: 'Pa', meaning: '超光速通信的媒质压强', dimension: { M: 1, L: -1, T: -2 }, origin: 'author' } })
  assert('★ custom add', customAdd.ok === true && customAdd.result.includes('已定义自创量'), customAdd.result.slice(0, 60))
  const customList = await run({ operation: 'custom', customAction: 'list' })
  assert('custom list 含自创量', customList.ok === true && customList.result.includes('aetherPressure'), '')
  const check = await run({ operation: 'custom', customAction: 'check', expression: 'mass*acceleration*length', expectedDimension: { M: 1, L: 2, T: -2 } })
  assert('★ 量纲检查认出能量', check.ok === true && check.result.includes('✓ 与期望一致'), check.result.slice(0, 80))

  const table = await run({ operation: 'formula-table', tableAction: 'show' })
  assert('★ 公式表 show（模板 665 条）', table.ok === true && table.result.includes('模板公式'), table.result.slice(0, 80))
  const added = await run({ operation: 'formula-table', tableAction: 'add', customFormula: { id: 'my_force', name: '我的力', expression: 'k*x', params: { k: { value: 2, desc: '刚度' }, x: { value: null, desc: '位移' } } } })
  assert('★ 新增自定义公式', added.ok === true && added.result.includes('已新增自定义公式'), added.result.slice(0, 80))
  const disabled = await run({ operation: 'formula-table', tableAction: 'disable', formulaId: 'my_force' })
  assert('停用公式', disabled.ok === true && disabled.result.includes('已停用'), '')
  const removed = await run({ operation: 'formula-table', tableAction: 'remove', formulaId: 'my_force' })
  assert('删除自定义公式', removed.ok === true, removed.result.slice(0, 60))
}

console.log('-- 5. help --')
{
  const catalog = await run({ operation: 'help' })
  assert('★ 目录 ≥55 节（含 help 自述节）', catalog.ok === true && catalog.value.topics >= 55, String(catalog.value?.topics))
  assert('★ 目录分四段（算术 / 建模与推演 / 对账与设定 / 其余）', catalog.result.includes('一、算术') && catalog.result.includes('二、建模与推演') && catalog.result.includes('三、对账与设定') && catalog.result.includes('四、其余能力'), '')
  const world = await run({ operation: 'help', helpTopic: 'world' })
  assert('★ 单节正文', world.ok === true && world.result.includes('world') && world.result.length > 620, String(world.result.length))
  const search = await run({ operation: 'help', helpQuery: '账本对不上' })
  assert('★ 任务描述搜到 ledger', search.ok === true && search.value.hits.some((hit) => hit.key === 'ledger'), JSON.stringify(search.value?.hits?.map((h) => h.key)))
}

console.log('-- 6. auto --')
{
  const math = await run({ expression: '2+3*4' })
  assert('★ auto → evaluate（14）', math.ok === true && math.operation === 'evaluate' && math.result.includes('14'), JSON.stringify(math).slice(0, 120))
  const equation = await run({ expression: 'x^2-4=0' })
  assert('★ auto → solve', equation.ok === true && equation.operation === 'solve', equation.result.slice(0, 60))
  const matrix = await run({ matrix: [[1, 2], [3, 4]] })
  assert('★ auto → matrix', matrix.ok === true && matrix.operation === 'matrix', matrix.result.slice(0, 60))
}

console.log('-- 7. 迁移清单 --')
{
  assert('★ 62 个 operation 全部走新实现', dispatch.MIGRATED_OPERATIONS.length === 62, String(dispatch.MIGRATED_OPERATIONS.length))
  assert('auto 在清单里', dispatch.MIGRATED_OPERATIONS.includes('auto'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
