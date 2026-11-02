/**
 * 批量求值：`label` 标注与 `terse` 精简输出。
 *
 * ## label 解决什么
 *
 * 实测反馈：同批算两个口径时
 *
 *     expressions: ['139e8/1743500', '139e8/152e4']  → 7972.47 / 9144.74
 *
 * 输出里**只有顺序号区分**。7972 是「百列赤字口径」、9144 是「中值口径」，
 * 后续引用时要回翻表达式原文 —— 报告里「一次差点引错」。
 * 单批十几条时，纯靠位置对齐的心智负担很大。
 *
 * 现在可以写 `{label:'储耗比-中值', expr:'139e8/152e4'}`，输出直接带名字。
 *
 * ## terse 解决什么
 *
 * 报告估算：批量 8—14 条时，标题与「成功 N，失败 M」这些固定行本身也是开销，
 * 全程 terse 可省 40%+ 输出 token。
 *
 * ## 一条底线
 *
 * **失败信息不能省。** terse 只砍格式，不砍「哪条失败了」——
 * 省掉会让调用方以为全成功了，那是最危险的静默漏报。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-batch-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function batch(args) {
  const r = await run({ operation: 'evaluate', ...args })
  return { ok: r.ok, text: String(r.result || ''), value: r.value }
}

console.log('-- 1. label 让结果可认 --')
{
  const r = await batch({
    expressions: [
      { label: '储耗比-中值', expr: '139e8/152e4' },
      { label: '储耗比-百列', expr: '139e8/1743500' },
    ],
  })
  assert('成功', r.ok, '')
  assert('输出含中值标签', /储耗比-中值/.test(r.text), r.text.split('\n').slice(2, 4).join(' | '))
  assert('输出含百列标签', /储耗比-百列/.test(r.text), '')
  assert('两个数值都在', /9144/.test(r.text) && /7972/.test(r.text), '')
  assert('标签旁附原文便于核对', /139e8\/152e4/.test(r.text), '')
  // 结构化值里也带 label
  const items = (r.value && r.value.items) || []
  assert('value.items 带 label', items.some((it) => it.label === '储耗比-中值'), JSON.stringify(items).slice(0, 60))
}

console.log('-- 2. 不带 label 时行为不变（兼容旧用法）--')
{
  const r = await batch({ expressions: ['1/7', '2^0.5'] })
  assert('纯字符串仍可用', r.ok && /1\/7 = 0\.1428/.test(r.text), r.text.split('\n').slice(2, 3).join(''))
  assert('无标签时不会凭空插入括号', !/（1\/7）/.test(r.text), '')
}

console.log('-- 3. terse 去掉标题与统计 --')
{
  const full = await batch({ expressions: ['1/7', '2^0.5', 'log(10)'] })
  const terse = await batch({ expressions: ['1/7', '2^0.5', 'log(10)'], terse: true })
  assert('terse 更短', terse.text.length < full.text.length,
    terse.text.length + ' < ' + full.text.length)
  assert('terse 无标题行', !/═══/.test(terse.text), terse.text.slice(0, 30))
  assert('terse 无统计行', !/成功 \d+，失败/.test(terse.text), '')
  assert('terse 每行是「表达式 = 结果」', terse.text.split('\n').every((l) => l.includes(' = ')),
    terse.text)
  assert('terse 结果值与完整模式一致',
    terse.text.includes('0.14285714') && terse.text.includes('1.41421356'),
    terse.text)
  // 行数应等于条目数
  assert('terse 行数 = 条目数', terse.text.split('\n').length === 3, String(terse.text.split('\n').length))
}

console.log('-- 4. terse 绝不隐藏失败（最重要的底线）--')
{
  const r = await batch({ expressions: ['1+1', '不存在xyz(1)', '3*3'], terse: true })
  assert('失败行仍在', /失败\[/.test(r.text), r.text)
  assert('点名了那条失败', /不存在xyz/.test(r.text), r.text)
  assert('成功条也在', /1\+1 = 2/.test(r.text) && /3\*3 = 9/.test(r.text), r.text)
  assert('结构化统计仍给出失败数', r.value && r.value.failed === 1, String(r.value && r.value.failed))
}

console.log('-- 5. 批量错误类型与单条一致 --')
{
  /**
   * 实测踩到：单条 `不存在xyz(1)` 报 syntax，批量却报 internal ——
   * 因为批量那层调用 `translateError(error)` 没传兜底类型，默认成了 internal。
   * `internal` 读作「工具自己坏了」，会误导人去重试同一个错。
   */
  const single = await run({ operation: 'evaluate', expression: '不存在xyz(1)' })
  const batched = await batch({ expressions: ['不存在xyz(1)'], terse: true })
  assert('单条报 syntax', single.error?.type === 'syntax', String(single.error?.type))
  assert('批量也报 syntax', /失败\[syntax\]/.test(batched.text), batched.text)
  assert('批量不再报 internal', !/失败\[internal\]/.test(batched.text), '')
}

console.log('-- 6. label 与失败组合 --')
{
  const r = await batch({
    expressions: [
      { label: '好的', expr: '1+1' },
      { label: '坏的', expr: '不存在xyz(1)' },
    ],
  })
  assert('失败行也带 label', /坏的/.test(r.text), r.text.split('\n').slice(2, 5).join(' | '))
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)