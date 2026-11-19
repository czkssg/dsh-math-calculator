/**
 * random：长周期可复现随机数 + 行为映射。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-rand-'))
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
console.log('-- 1. 序列 --')
{
  const out = await run({ operation: 'random', randomSeed: 'world-a', count: 20, min: 0, max: 100, integer: true })
  const values = out.value?.values ?? []
  assert('★ 序列长度正确', out.ok === true && values.length === 20, String(values.length))
  assert('★ 整数且落在范围', values.every((v) => Number.isInteger(v) && v >= 0 && v <= 100), JSON.stringify(values.slice(0, 5)))
  assert('★ 周期声明 2^256', String(out.value?.period).includes('2^256'), String(out.value?.period))
}
console.log('-- 2. 可复现 --')
{
  const a = await run({ operation: 'random', randomSeed: 'world-a', count: 10, integer: true, min: 0, max: 999 })
  const b = await run({ operation: 'random', randomSeed: 'world-a', count: 10, integer: true, min: 0, max: 999 })
  const c = await run({ operation: 'random', randomSeed: 'world-b', count: 10, integer: true, min: 0, max: 999 })
  assert('★ 同种子同结果', JSON.stringify(a.value?.values) === JSON.stringify(b.value?.values), '')
  assert('★ 不同种子不同结果', JSON.stringify(a.value?.values) !== JSON.stringify(c.value?.values), '')
}
console.log('-- 3. 行为映射 --')
{
  const traits = { 勇气: { min: 0, max: 1 }, 出身: { choices: ['商人', '农民', '工匠'] } }
  const out = await run({ operation: 'random', randomSeed: 'world-a', randomActors: ['甲', '乙', '丙'], randomTraits: traits })
  const actors = out.value?.actors ?? {}
  assert('★ 每个实体都有特征', Object.keys(actors).length === 3, JSON.stringify(Object.keys(actors)))
  assert('★ 勇气在 [0,1]', Object.values(actors).every((row) => row.勇气 >= 0 && row.勇气 <= 1), '')
  assert('★ 出身命中选项', Object.values(actors).every((row) => ['商人', '农民', '工匠'].includes(row.出身)), '')
  const order = await run({ operation: 'random', randomSeed: 'world-a', randomActors: ['丙', '乙', '甲'], randomTraits: traits })
  assert('★ 实体顺序无关（子流）', JSON.stringify(actors['甲']) === JSON.stringify(order.value?.actors?.['甲']), '')
}
console.log('-- 4. 兼容与边界 --')
{
  const lcg = await run({ operation: 'random', randomSeed: '7', count: 3, integer: true, min: 0, max: 9, algorithm: 'lcg' })
  assert('★ LCG 序列可用', lcg.ok === true && lcg.value?.period === '2^32', JSON.stringify(lcg.value?.values))
  const lcgMap = await run({ operation: 'random', randomSeed: '7', randomActors: ['甲'], randomTraits: { 勇气: {} }, algorithm: 'lcg' })
  assert('★ LCG 不支持行为映射', lcgMap.ok === false && lcgMap.error?.type === 'invalid_argument', String(lcgMap.error?.type))
  const badRange = await run({ operation: 'random', randomSeed: 'x', min: 10, max: 1 })
  assert('★ min>max 被拒绝', badRange.ok === false && badRange.error?.type === 'invalid_argument', String(badRange.error?.type))
  const noSeed = await run({ operation: 'random', count: 3, integer: true })
  assert('未传种子也有确定结果', noSeed.ok === true && noSeed.value?.values?.length === 3, '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }