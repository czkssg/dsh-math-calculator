/**
 * 任务分诊：先认路，再走路（借 ask-matt 的 flow 范式）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-triage-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { triageTask, renderTriage } = await import(pathToFileURL(join(root, 'lib/triage.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. 四条路线各自命中 --')
const CASES = [
  ['这账对不对，收支闭合吗', 'reconcile'],
  ['一战前的国界是哪些', 'lookup'],
  ['这颗星球的气候能养活多少人', 'deduce'],
  ['1 m + 1 ft 等于多少', 'direct'],
]
for (const [text, route] of CASES) {
  const r = triageTask(text)
  assert('★ ' + text.slice(0, 14) + ' → ' + route, r?.route === route, String(r?.route))
}
console.log('-- 2. 对账优先于直答 --')
{
  const r = triageTask('账上还差多少钱')
  assert('★ 含「差多少」走 reconcile 而非 direct', r?.route === 'reconcile', String(r?.route))
}
console.log('-- 3. 跳过步骤数合理 --')
{
  const direct = triageTask('2+3 等于多少')
  assert('★ 直答跳过全部 11 步', direct !== undefined && direct.skip.length === 11, String(direct?.skip.length))
  const deduce = triageTask('这个世界的文明能撑多久')
  assert('★ 推演不跳步（要走完整流程）', deduce !== undefined && deduce.skip.length === 0, String(deduce?.skip.length))
  const rec = triageTask('对账')
  assert('★ 对账跳过大半', rec !== undefined && rec.skip.length >= 8, String(rec?.skip.length))
}
console.log('-- 4. 拿不准不套流程 --')
{
  for (const text of ['嗯', '你好', '看看这个']) {
    assert('★ 静默：' + text, triageTask(text) === undefined, JSON.stringify(triageTask(text)))
  }
}
console.log('-- 5. 渲染可读 --')
{
  const line = renderTriage(triageTask('1+1 等于多少'))
  assert('★ 渲染含路线与入口', line.includes('direct') && line.includes('evaluate'), line)
  assert('★ 渲染说明可跳过', line.includes('跳过'), line)
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
