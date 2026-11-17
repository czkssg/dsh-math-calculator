/**
 * R66 最终验收：问题集成文档「未修 9 类」的收口条件。
 *
 * 验收项（文档第五节）：
 *   consistency 三形态 / 多步链 / 性能（>2s 有提示、100 万点 ≤3s）/ 上限（文档与实测一致）/
 *   哈温三项 / backtrace 窑命中炉膛链。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r66-'))
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

console.log('-- 1. consistency 三形态 --')
{
  const sci = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '储量 1e12 吨' }, { number: 2, text: '储量 1e13 吨' }] } })
  assert('科学计数：抽 2 条且报 10 倍', sci.value.claimCount === 2 && String(sci.result).includes('差 10'), String(sci.result).slice(0, 110))
  const range = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '产能 50-60 吨' }, { number: 2, text: '产能 55 吨' }] } })
  assert('区间：抽 2 条且判相容', range.value.claimCount === 2 && !String(range.result).includes('口径冲突'), String(range.result).slice(0, 110))
  const pct = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '效率 50%' }, { number: 2, text: '效率 0.5' }] } })
  assert('百分比：50% 与 0.5 判同量', pct.value.claimCount === 2 && !String(pct.result).includes('口径冲突'), String(pct.result).slice(0, 110))
}

console.log('-- 2. 多步链 --')
{
  const chain = await run({ operation: 'evaluate', expressions: [{ label: 'u', expr: 'u=5' }, { label: '小计', expr: 'u*3' }] })
  assert('u=5 → u*3 = 15', chain.result.includes('= 15'), chain.result.slice(0, 130))
}

console.log('-- 3. 性能 --')
{
  const started = Date.now()
  const stats = await run({ operation: 'stats', data: Array.from({ length: 1000000 }, (_, index) => index % 1000) })
  const statsMs = Date.now() - started
  assert('stats 100 万点 ≤3s 且成功', stats.ok === true && statsMs <= 3000, statsMs + 'ms')

  const recStarted = Date.now()
  const rec = await run({ operation: 'recurrence', recurrence: 'P*1.02', initial: { P: 100 }, periods: 5000 })
  const recMs = Date.now() - recStarted
  assert('recurrence 5000 期成功', rec.ok === true, String(rec.error?.message).slice(0, 80))
  if (recMs >= 2000) {
    assert('★ >2s 有耗时提示', String(rec.notice).includes('本次耗时'), String(rec.notice).slice(-90))
  } else {
    assert('★ >2s 有耗时提示（本机未达 2s，跳过）', true, '')
  }
}

console.log('-- 4. 表达式上限：文档与实测一致 --')
{
  const long = Array.from({ length: 4950 }, () => '1').join('+')
  const flat = await run({ operation: 'evaluate', expression: long })
  assert('9899 字符平铺 → 明确报「运算符过多」', flat.ok === false && String(flat.error?.message).includes('运算符'), JSON.stringify(flat.error?.message).slice(0, 90))
  assert('上限错误不是 internal', flat.error?.type === 'invalid_argument', String(flat.error?.type))

  const nested = '('.repeat(1000) + '1' + ')'.repeat(1000)
  const deep = await run({ operation: 'evaluate', expression: nested })
  assert('1000 层括号 → 明确报「嵌套过深」', deep.ok === false && String(deep.error?.message).includes('嵌套'), JSON.stringify(deep.error?.message).slice(0, 90))

  const huge = Array.from({ length: 20000 }, () => '1').join('+')
  const over = await run({ operation: 'evaluate', expression: huge })
  assert('超 10000 字符 → 字符上限（第一道闸）', over.ok === false && String(over.error?.message).includes('字符上限'), JSON.stringify(over.error?.message).slice(0, 90))
}

console.log('-- 5. 哈温三项 --')
{
  const hw = await run({ operation: 'formula', formula: 'hardy_weinberg', params: { p: 0.9, q: 0.1 } })
  assert('总和 = 1', hw.ok === true && String(hw.result).includes('结果: 1'), String(hw.result).slice(-80))
  assert('★ 输出 p²=0.81 / 2pq=0.18 / q²=0.01', String(hw.result).includes('p²=0.81') && String(hw.result).includes('2pq=0.18') && String(hw.result).includes('q²=0.01'), String(hw.result).slice(-100))
  assert('value.parts 三项', Array.isArray(hw.value?.parts) && hw.value.parts.length === 3, JSON.stringify(hw.value?.parts))
}

console.log('-- 6. backtrace 窑命中炉膛/窑炉链 --')
{
  const bt = await run({ operation: 'backtrace', target: '这座窑一天烧多少煤' })
  assert('第一命中为窑炉热平衡', bt.value.matches[0].id === 'kiln_heat_balance', JSON.stringify(bt.value.matches.slice(0, 2).map((m) => m.id)))
  assert('推荐链含窑炉', String(bt.result).includes('窑炉热平衡'), String(bt.result).slice(0, 110))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
