/**
 * 实体类型 / 自创接口 / 数据导出。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-entities-'))
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

console.log('-- 1. 实体类型清单 --')
{
  const out = await run({ operation: 'topology', topology: { action: 'entities' } })
  assert('★ 内置实体类型 20 种', out.value.entityTypes.length === 20, String(out.value?.entityTypes?.length))
  assert('关系类型 14 种', out.value.relationTypes.length === 14, String(out.value?.relationTypes?.length))
  const names = out.value.entityTypes.map((type) => type.name)
  assert('含物理实体 unit/terrain/ship/compartment', ['unit', 'terrain', 'ship', 'compartment'].every((name) => names.includes(name)), JSON.stringify(names))
  assert('含概念实体 faction/office/tech/law', ['faction', 'office', 'tech', 'law'].every((name) => names.includes(name)), '')
}

console.log('-- 2. 自创接口 define --')
{
  const define = await run({ operation: 'topology', topology: { action: 'define', entityType: { name: 'clan', label: '氏族', category: 'conceptual', required: ['members', 'leader'], relations: ['alliance', 'rivalry', 'member_of'] } } })
  assert('★ 定义自创类型成功', define.ok === true, String(define.error?.message))
  const list = await run({ operation: 'topology', topology: { action: 'entities' } })
  assert('★ 自创类型出现在清单', list.value.entityTypes.some((type) => type.name === 'clan'), '')
  const bad = await run({ operation: 'topology', topology: { action: 'define', entityType: { name: 'Clan', label: 'x', required: ['a'] } } })
  assert('非法名（大写）→ invalid_argument', bad.ok === false && bad.error?.type === 'invalid_argument', JSON.stringify(bad.error))
  const empty = await run({ operation: 'topology', topology: { action: 'define', entityType: { name: 'clan2', label: 'x', required: [] } } })
  assert('required 空 → invalid_argument', empty.ok === false && empty.error?.type === 'invalid_argument', '')
}

console.log('-- 3. 实体图校验 --')
{
  const good = await run({ operation: 'topology', topology: { action: 'validate', entities: [{ id: '师', type: 'unit', level: '师', headcount: 12000 }, { id: '军', type: 'unit', level: '军', headcount: 30000 }], relations: [{ from: '师', to: '军', kind: 'command' }] } })
  assert('★ 合法实体图无问题', good.ok === true && good.value.problems.length === 0, JSON.stringify(good.value?.problems))

  const missing = await run({ operation: 'topology', topology: { action: 'validate', entities: [{ id: '师', type: 'unit', level: '师' }] } })
  assert('★ 缺必填 headcount → missing-field', missing.value.problems.some((problem) => problem.kind === 'missing-field'), JSON.stringify(missing.value?.problems))

  const unknown = await run({ operation: 'topology', topology: { action: 'validate', entities: [{ id: '舰', type: 'starship', massKg: 1 }] } })
  assert('★ 未知类型 → unknown-type', unknown.value.problems.some((problem) => problem.kind === 'unknown-type'), '')

  const badRelation = await run({ operation: 'topology', topology: { action: 'validate', entities: [{ id: '师', type: 'unit', level: '师', headcount: 1 }, { id: '城', type: 'settlement', population: 1, type2: 'x' }], relations: [{ from: '师', to: '城', kind: 'alliance' }] } })
  assert('★ 单位不该有同盟关系 → relation-not-allowed', badRelation.value.problems.some((problem) => problem.kind === 'relation-not-allowed'), JSON.stringify(badRelation.value?.problems))

  const cardinality = await run({ operation: 'topology', topology: { action: 'validate', entities: [{ id: '师', type: 'unit', level: '师', headcount: 1 }, { id: '军A', type: 'unit', level: '军', headcount: 1 }, { id: '军B', type: 'unit', level: '军', headcount: 1 }], relations: [{ from: '师', to: '军A', kind: 'command' }, { from: '师', to: '军B', kind: 'command' }] } })
  assert('★ 两个上级 → cardinality 提示', cardinality.value.problems.some((problem) => problem.kind === 'cardinality'), JSON.stringify(cardinality.value?.problems))
}

console.log('-- 4. 数据导出（本地快照，供 AI 之后引用）--')
{
  const one = await run({ operation: 'workspace', action2: 'export-builtin', what: 'formulas' })
  assert('★ 导出 formulas 到本地', one.ok === true && existsSync(one.value.exports[0].path), JSON.stringify(one.value).slice(0, 120))
  const exported = JSON.parse(readFileSync(one.value.exports[0].path, 'utf8'))
  assert('导出的公式数 804', exported.length === 804, String(exported.length))

  const all = await run({ operation: 'workspace', action2: 'export-builtin', what: 'all' })
  assert('★ 全量导出 8 项', all.ok === true && all.value.exports.length === 8, JSON.stringify(all.value?.exports?.map((item) => item.what)))
  assert('导出目录在本地', all.value.directory.includes('exports'), all.value.directory)

  const unknown = await run({ operation: 'workspace', action2: 'export-builtin', what: 'nope' })
  assert('未知导出项 → unknown_argument', unknown.ok === false && unknown.error?.type === 'unknown_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
