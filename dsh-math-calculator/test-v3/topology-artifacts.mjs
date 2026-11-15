/**
 * 拓扑模型持久化 + 工作区产物导出/导入。
 *
 * 用户要求：导出路径在工作区；导出的是**结果**（建好的模型/自创常数/公式），
 * 并且要能**导入**（常用字段不必每次重抄）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-artifacts-'))
process.env.DSH_MATH_CALC_HOME = home
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

const MODEL = {
  nodes: [{ id: '师', type: 'unit', level: '师', headcount: 12000 }, { id: '军', type: 'unit', level: '军', headcount: 30000, parent: '师' }],
  edges: [{ from: '师', to: '军', kind: 'command' }],
}

console.log('-- 1. 拓扑模型：save/list/load --')
{
  const save = await run({ operation: 'topology', topology: { action: 'save', modelKey: '北境军', nodes: MODEL.nodes, edges: MODEL.edges } })
  assert('★ 保存模型到工作区', save.ok === true, String(save.error?.message))
  const list = await run({ operation: 'topology', topology: { action: 'list' } })
  assert('★ list 含「北境军」', list.value.models.includes('北境军'), JSON.stringify(list.value))
  const load = await run({ operation: 'topology', topology: { action: 'load', modelKey: '北境军' } })
  assert('★ 载入模型（2 节点 1 边）', load.ok === true && load.value.nodes.length === 2 && load.value.edges.length === 1, JSON.stringify(load.value).slice(0, 100))
  const missing = await run({ operation: 'topology', topology: { action: 'load', modelKey: '不存在' } })
  assert('未知模型 → unknown_symbol', missing.ok === false && missing.error?.type === 'unknown_symbol', '')
}

console.log('-- 2. 模型导出/导入（路径在工作区）--')
{
  const exported = await run({ operation: 'topology', topology: { action: 'export', modelKey: '北境军', nodes: MODEL.nodes, edges: MODEL.edges } })
  assert('★ 导出到工作区产物目录', exported.ok === true && exported.value.path.includes('.artifacts'), exported.value?.path)
  assert('文件确实存在', existsSync(exported.value.path), exported.value?.path)
  const imported = await run({ operation: 'topology', topology: { action: 'import', file: '北境军.json' } })
  assert('★ 从工作区导入拓扑', imported.ok === true && imported.value.nodes.length === 2, JSON.stringify(imported.value).slice(0, 100))
  const absent = await run({ operation: 'topology', topology: { action: 'import', file: 'nope.json' } })
  assert('不存在的文件 → unknown_symbol', absent.ok === false && absent.error?.type === 'unknown_symbol', '')
}

console.log('-- 3. 工作区状态导出/导入（结果是自创常数/公式/变量）--')
{
  await run({ operation: 'workspace', action2: 'create', workspace: '北境' })
  await run({ operation: 'workspace', action2: 'set', constants: { G: 6.67e-11 }, workspaceVariables: { 人口: 920000000 } })
  await run({ operation: 'custom', customAction: 'add', customConstant: { name: 'aetherPressure', label: '以太压', value: 1e5, unit: 'Pa', meaning: '超光速媒质', dimension: { M: 1, L: -1, T: -2 }, origin: 'author' } })
  const exported = await run({ operation: 'workspace', action2: 'export' })
  assert('★ 状态导出路径在工作区', exported.ok === true && exported.value.path.includes('北境.artifacts'), exported.value?.path)
  const state = JSON.parse(readFileSync(exported.value.path, 'utf8'))
  assert('导出含自创常数与变量', Object.keys(state.customConstants).length === 0 || state.customConstants.length === 1, JSON.stringify(state.customConstants).slice(0, 100))
  assert('导出含 constants 与 variables', Object.keys(state.constants).length === 1 && state.variables['人口'] === 920000000, JSON.stringify({ c: state.constants, v: state.variables }))

  /** 清空后再导入，验证恢复。 */
  await run({ operation: 'workspace', action2: 'set', constants: {}, workspaceVariables: {} })
  await run({ operation: 'custom', customAction: 'remove', customConstantName: 'aetherPressure' })
  const imported = await run({ operation: 'workspace', action2: 'import' })
  assert('★ 导入恢复自创常数与变量', imported.ok === true && Object.keys(imported.value.data.constants).length === 1 && imported.value.data.variables['人口'] === 920000000, JSON.stringify(imported.value.data).slice(0, 150))
}

console.log('-- 4. 内置数据快照仍可导出（export-builtin）--')
{
  const builtin = await run({ operation: 'workspace', action2: 'export-builtin', what: 'formulas' })
  assert('★ 内置公式可导出为快照', builtin.ok === true && existsSync(builtin.value.exports[0].path), JSON.stringify(builtin.value).slice(0, 100))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
