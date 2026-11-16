/**
 * 输出无损性守护（宿主 snapshotJsonValue 要求）。
 *
 * 真实缺陷（R48）：ledger 的 parts[i].note 缺省时被赋 undefined →
 * 宿主判「value is not lossless JSON」→ 整个工具崩、错误还读不出。
 * 修法：出口统一 stripUndefined，本测试防止回归。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-lossless-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
/** 复刻宿主的无损 JSON 判定。 */
function findBad(value, path = 'value', seen = new Set(), out = []) {
  if (value === undefined) { out.push(path); return out }
  if (typeof value === 'number' && !Number.isFinite(value)) { out.push(path + '=' + value); return out }
  if (typeof value === 'function') { out.push(path + '=fn'); return out }
  if (value === null || typeof value !== 'object') return out
  if (seen.has(value)) { out.push(path + '=circular'); return out }
  seen.add(value)
  if (Array.isArray(value)) { value.forEach((item, i) => findBad(item, i === 0 ? path + '[' + i + ']' : path + '[' + i + ']', seen, out)); return out }
  for (const key of Object.keys(value)) findBad(value[key], path + '.' + key, seen, out)
  return out
}
console.log('-- 1. ledger（R48 的致命项）--')
{
  const short = await run({ operation: 'ledger', ledger: { 士: 1, 农: 85, 工: 10, 商: 4 } })
  assert('★ 占比简写可算', short.ok === true, String(short.error?.type ?? ''))
  assert('★ value 无 undefined', findBad(short.value).length === 0, findBad(short.value).join(','))
  const explicit = await run({ operation: 'ledger', ledger: { parts: [{ name: '甲', value: 120 }, { name: '乙', value: 80 }], total: 300 } })
  assert('★ 显式 parts（note 缺省）也合法', explicit.ok === true && findBad(explicit.value).length === 0, findBad(explicit.value).join(','))
  assert('★ 不写 note 键（而不是 note:undefined）', !('note' in explicit.value.parts[0]), JSON.stringify(Object.keys(explicit.value.parts[0])))
}
console.log('-- 2. 其它曾出问题的 op --')
{
  const batch = await run({ operation: 'evaluate', expressions: ['1+1', '2*3'] })
  assert('★ 批量求值 value 合法', batch.ok === true && findBad(batch.value).length === 0, findBad(batch.value).join(','))
  const map = await run({ operation: 'world-map', mapWidth: 60, mapHeight: 30, seed: 1, ascii: false })
  assert('★ world-map（不给 ascii）value 合法', map.ok === true && findBad(map.value).length === 0, findBad(map.value).join(','))
  const mapAscii = await run({ operation: 'world-map', mapWidth: 60, mapHeight: 30, seed: 1 })
  assert('★ world-map（给 ascii）value 也不含 undefined', mapAscii.ok === true && findBad(mapAscii.value).length === 0, findBad(mapAscii.value).join(','))
}
console.log('-- 3. 抽样：主流 op 的 value 全部合法 --')
{
  const samples = [
    [{ operation: 'evaluate', expression: '1/3' }, 'evaluate'],
    [{ operation: 'solve', expression: 'x^2-4=0' }, 'solve'],
    [{ operation: 'eigen', matrix: [[2, 1], [1, 2]] }, 'eigen'],
    [{ operation: 'system', matrix: [[1, 1], [1, -1]], vector: [3, 1] }, 'system'],
    [{ operation: 'recurrence', recurrence: 'P*2', initial: { P: 1 }, periods: 3 }, 'recurrence'],
    [{ operation: 'chain', chain: { raw: 100, stages: [{ name: 'a', expr: 'prev*2' }] } }, 'chain'],
    [{ operation: 'stats', data: [1, 2, 3] }, 'stats'],
    [{ operation: 'crosscheck' }, 'crosscheck'],
    [{ operation: 'world-build' }, 'world-build'],
    [{ operation: 'simulate', stocks: { p: { initial: 10 } }, flows: { g: { to: 'p', rate: '0.1*p' } }, simSteps: 3 }, 'simulate'],
  ]
  let badCount = 0
  for (const [args, name] of samples) {
    const r = await run(args)
    if (r.ok === true) {
      const bad = findBad(r.value)
      if (bad.length > 0) { badCount += 1; console.log('    ' + name + ' 非法: ' + bad.slice(0, 3).join(',')) }
    }
  }
  assert('★ 抽样 10 个 op 全部无损', badCount === 0, String(badCount))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
