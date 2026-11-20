/**
 * mathEngine 公式链扩展：registerChains / listChains / unregisterChains / chain。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-chain-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { createMathEngineService } = await import(pathToFileURL(join(root, 'lib/service.js')).href)
const service = createMathEngineService()
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 自述 --')
{
  assert('★ methods 26 个（含链）', service.describe().methods.length === 26 && service.describe().methods.includes('registerChains') && service.describe().methods.includes('chain'), JSON.stringify(service.describe().methods))
}
console.log('-- 2. 注册与执行 --')
{
  service.registerUnits('w', [{ name: 'zunit', factor: 1 }])
  const reg = service.registerChains('w', [{
    id: 'mychain',
    name: '动能转功率',
    steps: [
      { formula: 'kinetic_energy', note: '动能' },
      { formula: 'power', dataFlow: { W: 1 } },
    ],
  }])
  assert('★ 注册 2 步链', reg.ok === true && reg.registered?.[0] === 'mychain', JSON.stringify(reg))
  const run = service.chain('mychain', { namespace: 'w', initial: { m: 2, v: 3, t: 2 } })
  assert('★ 链执行成功', run.ok === true, JSON.stringify(run.error))
  assert('第 1 步 = 9 J', run.value?.steps?.[0]?.value === 9 && run.value?.steps?.[0]?.unit === 'J', JSON.stringify(run.value?.steps?.[0]))
  assert('第 2 步 = 4.5 W（用第 1 步的功）', Math.abs(Number(run.value?.steps?.[1]?.value) - 4.5) < 1e-9 && run.value?.steps?.[1]?.unit === 'W', JSON.stringify(run.value?.steps?.[1]))
  assert('★ terminal = 4.5', Math.abs(Number(run.value?.terminal?.value) - 4.5) < 1e-9, JSON.stringify(run.value?.terminal))
  assert('linkedSteps 含第 2 步', Array.isArray(run.value?.linkedSteps) && run.value.linkedSteps.includes(2), JSON.stringify(run.value?.linkedSteps))
}
console.log('-- 3. 校验 --')
{
  const badId = service.registerChains('w', [{ id: 'bad id', steps: [{ formula: 'kinetic_energy' }] }])
  assert('非法 id 被拒绝', badId.ok === false && badId.error?.kind === 'input', JSON.stringify(badId.error))
  const emptySteps = service.registerChains('w', [{ id: 'empty', steps: [] }])
  assert('空 steps 被拒绝', emptySteps.ok === false && emptySteps.error?.kind === 'input', JSON.stringify(emptySteps.error))
  const badFormula = service.registerChains('w', [{ id: 'badf', steps: [{ formula: 'no_such_formula' }] }])
  assert('★ 无效公式被拒绝', badFormula.ok === false && badFormula.error?.kind === 'input', JSON.stringify(badFormula.error))
  const badFlow = service.registerChains('w', [{ id: 'badflow', steps: [{ formula: 'kinetic_energy' }, { formula: 'power', dataFlow: { W: 3 } }] }])
  assert('★ dataFlow 越界被拒绝', badFlow.ok === false && badFlow.error?.kind === 'input', JSON.stringify(badFlow.error))
  const builtinConflict = service.registerChains('w', [{ id: 'sys-material', steps: [{ formula: 'kinetic_energy' }] }])
  assert('★ 与内置链同名被拒绝', builtinConflict.ok === false && builtinConflict.error?.kind === 'input', JSON.stringify(builtinConflict.error))
  const dup = service.registerChains('w', [{ id: 'mychain', steps: [{ formula: 'kinetic_energy' }] }])
  assert('重复 id 被拒绝', dup.ok === false && dup.error?.kind === 'input', JSON.stringify(dup.error))
}
console.log('-- 4. 列表 / 隔离 / 注销 --')
{
  const list = service.listChains('w')
  assert('listChains 有 1 条', list.ok === true && list.units?.[0]?.units?.length === 1, JSON.stringify(list.units))
  service.registerUnits('w2', [{ name: 'zunit', factor: 1 }])
  const isolated = service.chain('mychain', { namespace: 'w2' })
  assert('隔离：w2 无 mychain（capability）', isolated.ok === false && isolated.error?.kind === 'capability', JSON.stringify(isolated.error))
  const gone = service.unregisterChains('w')
  assert('★ 注销链', gone.ok === true && gone.removed === true, JSON.stringify(gone))
  const after = service.chain('mychain', { namespace: 'w' })
  assert('注销后不可用', after.ok === false && after.error?.kind === 'capability', '')
}
console.log('-- 5. 内置链仍可用 --')
{
  const builtin = service.chain('sys-material')
  assert('内置链缺参时给出可读错误', builtin.ok === false && (builtin.error?.type === 'missing_params' || builtin.error?.type === 'unknown_formula'), JSON.stringify(builtin.error?.type))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
