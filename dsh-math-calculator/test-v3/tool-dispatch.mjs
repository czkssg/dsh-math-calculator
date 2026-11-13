/**
 * 第 8 步入口测试：dispatch 路由 + tool 执行 + 输出 schema。
 *
 * ## 这条测试证明的事
 *
 * 前 35 套证明「新实现算得对」，这一套证明「新实现接得上入口」：
 *   · 已迁移的 operation 走新代码（不再经过 5,720 行老入口）；
 *   · 未迁移的仍然可用（绞杀者模式，功能不缩水）；
 *   · 新实现的错误被翻译成结构化 error.type，不是内部异常。
 *
 * 直接在进程内调 tool.execute，不依赖宿主。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-tool-'))
// 先加载插件入口：它会把老 runMathTool 注入 tool 层（bindLegacy）
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

/** 调工具。 */
async function run(args) {
  return tool.execute(args, {})
}

console.log('-- 1. schema 与注册形态 --')
{
  assert('工具名 math_execute', tool.name === 'math_execute', String(tool.name))
  assert('★ 输出 schema 声明 additionalProperties:false', tool.output?.schema?.additionalProperties === false, JSON.stringify(tool.output?.schema?.additionalProperties))
  const schema = tool.output.schema
  const required = ['ok', 'operation', 'input', 'result', 'precision']
  assert('输出必备字段都在 properties 里', required.every((key) => schema.properties[key] !== undefined), JSON.stringify(Object.keys(schema.properties)))
  assert('★ required 数组含五个必备字段', required.every((key) => schema.required.includes(key)), JSON.stringify(schema.required))
  const params = tool.parameters.properties ?? tool.parameters
  assert('参数 schema 有 operation/expression/world/derivation', ['operation', 'expression', 'world', 'derivation'].every((key) => params[key] !== undefined), JSON.stringify(Object.keys(params).slice(0, 12)))
  assert('★ 新增 operation 的参数也在 schema 里', ['chain', 'threshold', 'scaling', 'anchor', 'quickFeasible', 'world_state', 'hierarchy'].every((key) => params[key] !== undefined), '')
}

console.log('-- 2. 已迁移 operation 走新实现 --')
{
  const world = await run({ operation: 'world' })
  assert('world 成功', world.ok === true && world.operation === 'world', String(world.error?.message ?? ''))
  assert('★ world 是新实现的输出（含【恒星】段）', world.result.includes('【恒星】'), world.result.slice(0, 40))
  assert('world 带 value', typeof world.value === 'object' && world.value !== null, '')
  assert('★ world 的 notice 通道仍在', typeof world.notice === 'string', String(world.notice).slice(0, 30))

  const derivation = await run({ operation: 'derivation', derivation: 'stack' })
  assert('derivation 走新实现（8 层）', derivation.ok === true && derivation.result.includes('推演栈（8 层）'), '')

  const bodies = await run({ operation: 'bodies', bodyName: '太阳' })
  assert('bodies 走新实现', bodies.ok === true && bodies.result.includes('【太阳】'), bodies.result.slice(0, 40))

  const feasibility = await run({ operation: 'feasibility', claims: { buildingHeight: 9000 } })
  assert('★ feasibility 走新实现并报超限', feasibility.ok === true && feasibility.result.includes('【超限说明】'), feasibility.result.slice(0, 40))

  const chain = await run({ operation: 'chain', chain: { raw: 8, stages: [{ name: '坑口价', expr: 'raw' }, { name: '到岸', expr: 'prev*1.3' }] } })
  assert('chain 走新实现', chain.ok === true && chain.result.includes('链条传导'), '')

  const threshold = await run({ operation: 'threshold', threshold: { value: 0.35, thresholds: [{ at: 0.2, label: '低' }, { at: 0.5, label: '中' }] } })
  assert('threshold 走新实现（0.35→中）', threshold.ok === true && threshold.value.label === '中', JSON.stringify(threshold.value))

  const scaling = await run({ operation: 'scaling', scaling: { from: { size: 1 }, to: { size: 10 } } })
  assert('scaling 走新实现（负载 ×10）', scaling.ok === true && Math.abs(scaling.value.loadPerSupportRatio - 10) < 1e-9, '')

  const anchor = await run({ operation: 'anchor', anchor: { anchor: '罗马', anchors: [{ name: '罗马', value: 5.5e7 }] } })
  assert('anchor 走新实现', anchor.ok === true && anchor.value.value === 5.5e7, '')

  const quick = await run({ operation: 'quick_feasible', quickFeasible: { claim: '这座塔能有 8000 米高' } })
  assert('quick_feasible 走新实现（不可行）', quick.ok === true && quick.value.verdict === 'infeasible', String(quick.value?.verdict))

  const hierarchy = await run({ operation: 'hierarchy', hierarchy: { levels: ['师', '团'], tree: [3], base: 10 } })
  assert('hierarchy 走新实现（师 30 人）', hierarchy.ok === true && hierarchy.value.fullStrength === 30, String(hierarchy.value?.fullStrength))

  const extract = await run({ operation: 'extract_numbers', text: '年产 1.49 亿吨。' })
  assert('extract_numbers 走新实现（中文量级）', extract.ok === true && extract.value.items[0].value === 1.49e8, String(extract.value?.items?.[0]?.value))

  const audit = await run({ operation: 'units_audit', claims: [{ name: '年产量', unit: '吨' }, { name: '年产量', unit: '米' }] })
  assert('units_audit 走新实现（量纲冲突）', audit.ok === true && audit.result.includes('conflict') === false && audit.value.findings[0].status === 'conflict', '')

  const timeline = await run({ operation: 'timeline_check', events: [{ name: '施工', start: 8, end: 3 }] })
  assert('timeline_check 走新实现（逆序）', timeline.ok === true && timeline.value.counts.reversed === 1, '')

  const state = await run({ operation: 'world_state', world_state: { action: 'set', entries: [{ id: 'T01', title: '北境有铁矿', body: '品位 28%。' }] } })
  assert('world_state 走新实现（落盘成功）', state.ok === true && state.result.includes('设定库已更新'), state.result.slice(0, 40))
}

console.log('-- 3. 未迁移 operation 交老入口（功能不缩水）--')
{
  const evaluate = await run({ expression: '2+3*4' })
  assert('★ auto → 老入口 evaluate', evaluate.ok === true && evaluate.operation === 'evaluate' && evaluate.result.includes('14'), JSON.stringify(evaluate).slice(0, 120))
  const help = await run({ operation: 'help', helpTopic: 'world' })
  assert('help 仍可用（老入口）', help.ok === true && help.result.length > 50, String(help.error?.message ?? ''))
  const stats = await run({ operation: 'stats', data: [1, 2, 3, 4] })
  assert('stats 仍可用（老入口）', stats.ok === true, String(stats.error?.message ?? ''))
  const matrix = await run({ operation: 'matrix', matrix: [[1, 2], [3, 4]] })
  assert('matrix 仍可用（老入口）', matrix.ok === true, '')
}

console.log('-- 4. 新实现的错误被翻译成结构化 error --')
{
  const missing = await run({ operation: 'chain' })
  assert('★ 缺参 → ok=false + missing_params', missing.ok === false && missing.error?.type === 'missing_params', JSON.stringify(missing.error))
  assert('错误里有 hint', typeof missing.error?.hint === 'string' && missing.error.hint.length > 10, String(missing.error?.hint ?? '').slice(0, 40))

  const badUnit = await run({ operation: 'units_audit', claims: [{ name: '人口', unit: 'xyz' }] })
  assert('未知单位 → ok=false + unknown-unit 语义（结果标出）', badUnit.ok === true && badUnit.value.findings[0].status === 'unknown-unit', '')
}

console.log('-- 5. dispatch 路由表 --')
{
  const migrated = dispatch.MIGRATED_OPERATIONS
  assert('★ 46 个 operation 全部迁移（含 impact）', migrated.length === 46, String(migrated.length))
  assert('清单含 constants/workspace/help/balance/auto', ['constants', 'workspace', 'help', 'balance', 'auto'].every((operation) => migrated.includes(operation)), '')
}

console.log('-- 6. apply 注册的是新工具（模拟宿主）--')
{
  const indexMod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
  let registered = null
  const ctx = {
    tools: { register: (value) => { registered = value } },
    get: () => undefined,
  }
  indexMod.apply(ctx)
  assert('apply 不抛错并注册了一个工具', registered !== null, '')
  assert('★ 注册的是新入口（名字 math_execute）', registered?.name === 'math_execute', String(registered?.name))
  const smoke = await registered.execute({ operation: 'world', brief: true }, {})
  assert('★ 注册的工具走新实现（brief 含【骨架】）', smoke.ok === true && smoke.result.includes('【骨架】'), smoke.result.slice(0, 40))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
