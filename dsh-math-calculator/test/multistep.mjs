/**
 * 多步计算的两条不变量。
 *
 * ## 为什么要单独测
 *
 * 多步计算的正确性依赖两件事，都是**静默的**（错了不会报错）：
 *
 * 1. **批量内按序执行、前一条赋值对后一条可见**
 *    否则「多步」根本没有发生，只是把几个独立式并列。
 *
 * 2. **失败步骤的下游不能变成「虚成功」**
 *    实测踩过：批量里 `b=oops*2` 失败之后，`d=b*2` 不算失败，
 *    而是被 mathjs 当成「2 b（单位）」算出一个合法结果 ——
 *    批量汇总里它显示为**成功**。这类错比报错难发现得多。
 *
 * 根因是两个独立缺陷叠在一起：
 *   · 单位判据只看「同级有没有数字」，不看**顺序**
 *     （`2 b` 数字在前＝单位；`b*2` 符号在前＝变量）
 *   · 赋值语句右侧挂在 `value` 上，而 AST 遍历只走 args/items/content/object/index
 *     —— 赋值右侧整个不被判据看到
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-multistep-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. 批量内链式：前一条赋值对后一条可见 --')
{
  const t = await text({ operation: 'evaluate', expressions: ['a=5', 'b=a*2', 'c=b+3', 'd=c^2'] })
  /**
   * 全成功时的措辞是分级的：「算式全部求值成功（4 条，只表示算式无语法/符号错，
   * 不含结论正确性判断）」。
   *
   * 刻意不去匹配「成功 4，失败 0」—— 那句话读起来像「对了」，
   * 会让调用者跳过复核。这里同时断言了「不含结论正确性判断」这半句，
   * 因为那才是这次改措辞的真正目的。
   */
  assert('四步链全部求值成功', /算式全部求值成功（4 条/.test(t), t.split('\n').slice(-3).join(' '))
  assert('并声明不含结论正确性判断', /不含结论正确性判断/.test(t), '')
  assert('最后一步得 169', /d\(c\^2\)|c\^2\) = 169|= 169/.test(t), '')
}

console.log('-- 2. 带 label 的多步链，中间值可认 --')
{
  const t = await text({
    operation: 'evaluate',
    expressions: [
      { label: '单价', expr: 'unit=5' },
      { label: '数量', expr: 'qty=3' },
      { label: '小计', expr: 'sub=unit*qty' },
      { label: '税', expr: 'tax=sub*0.13' },
      { label: '总计', expr: 'total=sub+tax' },
    ],
  })
  assert('五步链全部求值成功', /算式全部求值成功（5 条/.test(t), '')
  assert('小计 = 15', /小计.*= 15/.test(t), '')
  assert('总计 = 16.95', /总计.*= 16\.95/.test(t), '')
}

console.log('-- 3. 失败步骤的下游不能变「虚成功」（本轮修的核心）--')
{
  const r = await run({ operation: 'evaluate', expressions: ['a=5', 'b=oops*2', 'd=b*2'] })
  const t = String(r.result || '')
  assert('第二条失败', /b=oops\*2 → 失败/.test(t), '')
  assert('第三条也失败（不是算出 "2 b"）', /d=b\*2 → 失败/.test(t), t.split('\n').slice(-5).join(' '))
  assert('统计为 成功 1，失败 2', /成功 1，失败 2/.test(t), '')
  assert('绝不出现 "2 b" 这种合法单位结果', !/= 2 b/.test(t), '')
}

console.log('-- 4. 顺序判据：符号在前＝变量，数字在前＝单位 --')
{
  const digitFirst = await run({ operation: 'evaluate', expression: '2 b' })
  assert('数字在前仍按单位（2 b）', digitFirst.ok && /2 b/.test(String(digitFirst.result)), '')
  const symbolFirst = await run({ operation: 'evaluate', expression: 'b*2' })
  assert('符号在前按变量（b 未定义 → 报错）', !symbolFirst.ok, String(symbolFirst.error && symbolFirst.error.type))
}

console.log('-- 5. 真单位用法一个都不能坏（这是修复的主要风险面）--')
{
  const cases = [
    ['5 V', /5 V/], ['9.81 m/s^2', /9\.81/], ['s^2', /s\^2/],
    ['2 * 5 V', /10 V/], ['(2+3) V', /5 V/], ['1 m^2', /1 m\^2/],
    ['1.5 m', /1\.5 m/], ['2.5e3 m', /2\.5 km/], ['1/2 h', /0\.5 h/],
  ]
  for (const [expr, re] of cases) {
    const r = await run({ operation: 'evaluate', expression: expr })
    assert('不误伤: ' + expr, r.ok && re.test(String(r.result)), String(r.result || (r.error && r.error.type)))
  }
}

console.log('-- 6. 单字母赋值后可在链中复用 --')
{
  const t = await text({ operation: 'evaluate', expressions: ['m=5', 'v=m*2', 'k=v+3'] })
  assert('单字母链全部求值成功', /算式全部求值成功（3 条/.test(t), '')
  assert('k = 13', /k\(v\+3\)|= 13/.test(t), t.split('\n').slice(-3).join(' '))
}

console.log('-- 7. 跨调用不持久（必须显式传 variables）--')
{
  await text({ operation: 'evaluate', expressions: ['persist_test=42'] })
  const r = await run({ operation: 'evaluate', expression: 'persist_test*2' })
  assert('跨调用拿不到上次的变量', !r.ok, String(r.error && r.error.type))
  const r2 = await run({ operation: 'evaluate', expression: 'persist_test*2', variables: { persist_test: 42 } })
  assert('显式传 variables 则可跨调用', r2.ok && String(r2.result).trim() === '84', String(r2.result))
}

console.log('-- 8. 单行内联与批量结果一致 --')
{
  const inline = String((await run({ operation: 'evaluate', expression: '((5*3)+(5*3*0.13))' })).result).trim()
  const batched = String((await run({ operation: 'evaluate', expressions: ['sub=5*3', 'tax=sub*0.13', 'total=sub+tax'] })).result)
  assert('内联结果是 16.95', inline === '16.95', inline)
  assert('批量链结果同为 16.95', /total\(sub\+tax\) = 16\.95|= 16\.95/.test(batched), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
