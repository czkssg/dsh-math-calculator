/**
 * 批量调用测试（`calls`）。
 *
 * ## 为什么需要这一套
 *
 * 用户要求「批量调用的都改成批量调用，别让 AI 一个一个调用功能」。
 * 在工具参数层加 `calls` 后，证明四件事：
 *   1. 批量内每条的结果与单条**逐字等价**（不是另一条实现路径）；
 *   2. 一条失败不中断其它（JSON-RPC batch 语义），计数与 partial 正确；
 *   3. 非法条目（未知 op / 嵌套 / 超限 / 空）被拦下且不影响合法条目；
 *   4. 渲染在「部分失败」时仍给出逐条结果，而不是只剩一行错误。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-batch-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
function json(value) { return String(value === undefined ? 'ok' : JSON.stringify(value)) }
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. schema --')
{
  const params = tool.parameters.properties ?? tool.parameters
  assert('参数 schema 有 calls', params.calls !== undefined, json(Object.keys(params).filter((key) => key === 'calls')))
  assert('calls 是数组', params.calls?.type === 'array', json(params.calls?.type))
  assert('描述写明上限 50', String(params.calls?.description ?? '').includes('50'), String(params.calls?.description).slice(0, 60))
}

console.log('-- 2. 与单条逐字等价 --')
{
  const single = await run({ operation: 'units', unitValue: 100, unitFrom: '摄氏度', unitTo: 'degF' })
  const batched = await run({ calls: [{ operation: 'units', unitValue: 100, unitFrom: '摄氏度', unitTo: 'degF' }] })
  assert('单条成功且 212', single.ok === true && single.result.includes('212'), single.result.slice(0, 60))
  assert('批量顶层 operation=batch', batched.ok === true && batched.operation === 'batch', json({ ok: batched.ok, op: batched.operation }))
  assert('★ 批量内 result 与单条逐字一致', batched.value.results[0].result === single.result, '')
  assert('批量文本含 212', batched.result.includes('212'), '')
  assert('计数 1 成功 0 失败', batched.succeeded === 1 && batched.failed === 0, json([batched.succeeded, batched.failed]))
}

console.log('-- 3. 多条混合按序 --')
{
  const r = await run({ calls: [
    { operation: 'units', unitValue: 1, unitFrom: '担', unitTo: 'kg' },
    { operation: 'evaluate', expression: '2+2' },
    { operation: 'world', brief: true },
  ] })
  assert('★ 三条全部成功', r.ok === true && r.succeeded === 3, json({ ok: r.ok, s: r.succeeded }))
  assert('结果顺序 = 提交顺序', Array.isArray(r.value.results) && r.value.results.length === 3 && r.value.results.map((x) => x.operation).join(',') === 'units,evaluate,world', json(r.value.results.map((x) => x.operation)))
  assert('担 = 50 kg 在批量里成立', r.value.results[0].result.includes('50 kg'), r.value.results[0].result.slice(0, 40))
  assert('evaluate 2+2', r.value.results[1].result.includes('4'), r.value.results[1].result.slice(0, 30))
  assert('world 有内容', r.value.results[2].ok === true && r.value.results[2].result.length > 50, String(r.value.results[2].result).slice(0, 40))
  assert('文本有编号', r.result.includes('[1] units') && r.result.includes('[3] world'), r.result.slice(0, 40))
  assert('每条带 index', r.value.results.map((x) => x.index).join(',') === '1,2,3', json(r.value.results.map((x) => x.index)))
}

console.log('-- 4. 部分失败不中断 --')
{
  const r = await run({ calls: [
    { operation: 'evaluate', expression: '1+1' },
    { operation: 'evaluate', expression: '' },
    { operation: 'evaluate', expression: '3*3' },
  ] })
  assert('顶层 ok=false（有失败）', r.ok === false, json(r.ok))
  assert('★ partial 标记', r.partial === true, json(r.partial))
  assert('计数 2 成功 1 失败', r.succeeded === 2 && r.failed === 1, json([r.succeeded, r.failed]))
  assert('★ 第一条仍成功', r.value.results[0].ok === true && r.value.results[0].result.includes('2'), json(r.value.results[0].result).slice(0, 40))
  assert('★ 第二条错误是 missing_params', r.value.results[1].error?.type === 'missing_params', json(r.value.results[1].error))
  assert('★ 第三条仍执行', r.value.results[2].ok === true && r.value.results[2].result.includes('9'), json(r.value.results[2].result).slice(0, 40))
  assert('文本标出失败条目', r.result.includes('[2] evaluate ✗ missing_params'), r.result.slice(0, 160))
}

console.log('-- 5. 未知 operation / 嵌套 calls --')
{
  const r = await run({ calls: [
    { operation: 'no_such_op' },
    { operation: 'evaluate', expression: '1+1' },
    { operation: 'evaluate', calls: [{ expression: '2+2' }] },
  ] })
  assert('未知 op 该条 invalid_argument', r.value.results[0].error?.type === 'invalid_argument', json(r.value.results[0].error))
  assert('嵌套 calls 该条被拒', r.value.results[2].error?.type === 'invalid_argument', json(r.value.results[2].error))
  assert('中间的仍然成功', r.value.results[1].ok === true, json(r.value.results[1].ok))
  assert('计数 1 成功 2 失败', r.succeeded === 1 && r.failed === 2, json([r.succeeded, r.failed]))
}

console.log('-- 6. 空与超限 --')
{
  const empty = await run({ calls: [] })
  assert('空 calls → invalid_argument', empty.ok === false && empty.error?.type === 'invalid_argument', json(empty.error))
  const many = await run({ calls: Array.from({ length: 51 }, () => ({ operation: 'evaluate', expression: '1' })) })
  assert('51 条 → invalid_argument', many.ok === false && many.error?.type === 'invalid_argument', json(many.error))
  assert('提示拆批', String(many.error?.hint ?? '').includes('拆'), String(many.error?.hint))
  const fifty = await run({ calls: Array.from({ length: 50 }, () => ({ operation: 'evaluate', expression: '1' })) })
  assert('50 条在上限内可用', fifty.ok === true && fifty.succeeded === 50, json([fifty.ok, fifty.succeeded]))
}

console.log('-- 7. 参数继承与覆盖 --')
{
  const r = await run({ displayPrecision: 2, calls: [
    { operation: 'evaluate', expression: '1/3' },
    { operation: 'evaluate', expression: '1/3', displayPrecision: 4 },
  ] })
  assert('外层 displayPrecision 继承', r.value.results[0].result.includes('0.33'), json(r.value.results[0].result).slice(0, 40))
  assert('条目显式值覆盖外层', r.value.results[1].result.includes('0.3333'), json(r.value.results[1].result).slice(0, 40))
  const c = await run({ precision: 12, calls: [{ operation: 'evaluate', expression: '2+2' }] })
  assert('外层 precision 继承到条目', c.value.results[0].precision === 12, json(c.value.results[0].precision))
}

console.log('-- 8. saveAs 外层忽略 --')
{
  const r = await run({ saveAs: '整批', calls: [{ operation: 'evaluate', expression: '1+1' }] })
  assert('外层 saveAs 被忽略并提示', String(r.notice ?? '').includes('外层 saveAs 已忽略'), String(r.notice))
  const op = await run({ operation: 'units', calls: [{ operation: 'evaluate', expression: '1+1' }] })
  assert('外层 operation 被忽略并提示', String(op.notice ?? '').includes('外层 operation'), String(op.notice))
  assert('条目仍按自己的 operation 执行', op.ok === true && op.value.results[0].operation === 'evaluate', json(op.value.results[0].operation))
}

console.log('-- 9. 渲染 --')
{
  const r = await run({ calls: [{ operation: 'units', unitValue: 1, unitFrom: '担', unitTo: 'kg' }] })
  const rendered = tool.output.render({}, r)
  assert('render 返回 text', Array.isArray(rendered) && rendered[0]?.type === 'text', json(rendered?.[0]?.type))
  assert('★ 渲染含 50 kg（不是只剩 error）', rendered[0].text.includes('50 kg'), rendered[0].text.slice(0, 60))
  const bad = await run({ calls: [{ operation: 'evaluate', expression: '' }] })
  const renderedBad = tool.output.render({}, bad)
  assert('全失败也渲染分段文本', renderedBad[0].text.includes('[1] evaluate ✗'), renderedBad[0].text.slice(0, 80))
}

console.log('-- 10. 条目 notice 保留 --')
{
  const r = await run({ calls: [{ operation: 'world', brief: true }] })
  assert('批量文本含地球标定 notice', r.result.includes('地球标定'), r.result.slice(-200))
  assert('results 里也带 notice', typeof r.value.results[0].notice === 'string', json(r.value.results[0].notice).slice(0, 50))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const item of fails) console.log('  - ' + item)
  process.exitCode = 1
}
