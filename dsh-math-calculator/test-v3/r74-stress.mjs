/**
 * 压力回归：批量上限、表达式上限、NaN/Infinity、极端常数、大数据性能。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-stress-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 批量上限 --')
{
  const make = (n) => Array.from({ length: n }, (_, i) => ({ operation: 'evaluate', expression: String(i) + '+1' }))
  const start = Date.now()
  const ok = await run({ calls: make(50) })
  const over = await run({ calls: make(51) })
  assert('★ calls 50 条成功', ok.ok === true, String(ok.error?.type))
  assert('★ calls 51 条被拒绝', over.ok === false && over.error?.type === 'invalid_argument', String(over.error?.type))
  assert('calls 50 在 5s 内', Date.now() - start < 5000, (Date.now() - start) + 'ms')
}
console.log('-- 2. expressions 上限（不再静默截断）--')
{
  const over = await run({ operation: 'evaluate', expressions: Array.from({ length: 300 }, (_, i) => String(i)) })
  assert('★ expressions 300 被拒绝', over.ok === false && over.error?.type === 'invalid_argument', String(over.error?.type))
  const ok = await run({ operation: 'evaluate', expressions: Array.from({ length: 100 }, (_, i) => String(i)) })
  assert('expressions 100 条正常', ok.ok === true, String(ok.error?.type))
}
console.log('-- 3. NaN/Infinity 必须报错 --')
{
  for (const text of ['NaN', 'Infinity', '-Infinity']) {
    const out = await run({ operation: 'evaluate', expression: text })
    assert('★ 「' + text + '」→ non_finite', out.ok === false && out.error?.type === 'non_finite', String(out.error?.type))
  }
  const zero = await run({ operation: 'evaluate', expression: '0/0' })
  assert('0/0 仍报 non_finite', zero.ok === false && zero.error?.type === 'non_finite', '')
}
console.log('-- 4. 极端常数溢出 --')
{
  const out = await run({ operation: 'constants', constants: { c: 1e-300 } })
  assert('★ c=1e-300 → non_finite（不再静默 null）', out.ok === false && out.error?.type === 'non_finite', String(out.error?.type))
  const normal = await run({ operation: 'constants', constants: { c: 1.5e8 } })
  assert('正常改 c 仍可用', normal.ok === true, String(normal.error?.type))
}
console.log('-- 5. data 检索别名 --')
{
  await run({ operation: 'data', dataAction: 'put', kind: 'note', name: '压力记录', payload: { a: 1 } })
  const byName = await run({ operation: 'data', dataAction: 'search', nameContains: '压力' })
  assert('★ nameContains 可检索', byName.ok === true && byName.value?.hits?.length >= 1, JSON.stringify(byName.value?.hits))
}
console.log('-- 6. 大数据性能 --')
{
  const start = Date.now()
  const stats = await run({ operation: 'stats', data: Array.from({ length: 1000000 }, (_, i) => (i % 997) / 997) })
  /** 单独跑约 2s；全量并行（多进程）会抖动，阈值放 10s。 */
  assert('★ stats 100 万点成功且 ≤10s', stats.ok === true && Date.now() - start < 10000, (Date.now() - start) + 'ms')
  const mapStart = Date.now()
  const map = await run({ operation: 'world-map', mapWidth: 1440, mapHeight: 720, ascii: false })
  assert('★ world-map 1440×720 成功且 ≤20s', map.ok === true && Date.now() - mapStart < 20000, (Date.now() - mapStart) + 'ms')
}
console.log('-- 7. 输入边界 --')
{
  const empty = await run({ operation: 'evaluate', expression: '' })
  assert('空表达式 → missing_params', empty.ok === false && empty.error?.type === 'missing_params', String(empty.error?.type))
  const long = await run({ operation: 'evaluate', expression: Array.from({ length: 10000 }, (_, i) => String(i)).join('+') })
  assert('超长表达式被拒绝', long.ok === false && String(long.error?.message).includes('上限'), String(long.error?.message).slice(0, 60))
  const poise = await run({ operation: 'evaluate', expression: '1 kg/m/s' })
  assert('多斜杠单位可算（kg/m/s → poise）', poise.ok === true, String(poise.error?.type))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }