/**
 * 显示精度：让 AI 自己选一个够用的位数，并能在对话里固化。
 *
 * ## 为什么需要这个机制
 *
 * 底座按 64 位算（中间运算需要），但全都原样吐出来时：
 *   · 一行六十个数字，AI 读起来费 token，人也读不下去
 *   · AI 每次都得自己截断，既慢又容易截错
 *
 * ## 关键：不能靠调低 precision 来解决
 *
 * `precision` 是**计算**精度，调低会真的算错大数。实测：
 *
 *   (10^20+1)-(10^20)   precision=64 → 1（正确）
 *   (10^20+1)-(10^20)   precision=20 → 0（算错了！）
 *
 * 所以新增 displayPrecision：只截输出，计算仍按 64 位。
 *
 * ## 这套测试守的三条不变量
 *
 * 1. **显示精度绝不改变计算结果** —— 这是最重要的，一旦破了就是静默错
 * 2. **整数永不截断** —— 10^20+5、50! 必须一位不少
 * 3. **固化生效且可临时覆盖** —— 定一次全局变短，需要时单次调高
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** 每个测试段用独立 HOME，避免工作区状态互相污染。 */
function freshHome(label) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-disp-' + label + '-'))
  process.env.DSH_MATH_CALC_HOME = home
  return home
}

freshHome('main')
const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次，返回文本。 */
async function text(args) {
  const r = await run(args)
  return String(r.result || '')
}

/** 数字串里的小数位数。 */
function decimalsOf(s) {
  const m = String(s).match(/\.(\d+)/)
  return m ? m[1].length : 0
}

console.log('-- 1. 核心不变量：显示精度不改变计算 --')
{
  // 这是整套机制的地基。若这条破了，就是静默算错。
  const BIG = '(10^20+1)-(10^20)'
  for (const d of [64, 16, 12, 8, 6, 4]) {
    const got = (await text({ operation: 'evaluate', expression: BIG, displayPrecision: d })).trim()
    assert('显示精度 ' + d + ' 时大数减法仍得 1', got === '1', got)
  }

  // 对照：真调低计算精度会算错（证明两层确实分开）
  const bad = (await text({ operation: 'evaluate', expression: BIG, precision: 20 })).trim()
  assert('对照：把计算精度降到 20 会得 0（说明两层不同）', bad === '0', bad)
}

console.log('-- 2. 整数永不截断 --')
{
  const cases = [
    ['10^20+5', '100000000000000000005'],
    ['2+2', '4'],
    ['factorial(20)', '2432902008176640000'],
  ]
  for (const [expr, expected] of cases) {
    for (const d of [4, 6, 64]) {
      const got = (await text({ operation: 'evaluate', expression: expr, displayPrecision: d })).trim()
      assert(expr + ' 在显示精度 ' + d + ' 下完整', got === expected,
        got === expected ? '' : got.slice(0, 40))
    }
  }
  // 50! 也要完整（65 位）
  const f50 = (await text({ operation: 'evaluate', expression: 'factorial(50)', displayPrecision: 4 })).trim()
  assert('50! 完整 65 位', f50.length === 65 && f50.startsWith('30414093'), f50.length + ' 位')
}

console.log('-- 3. 小数按显示精度截断 --')
{
  /**
   * 注意 displayPrecision 是**有效数字**不是小数位。
   * `0.142857` 是 6 位有效数字 → 6 位小数（整数部分为 0 时不占位）。
   * `1.41421` 也是 6 位有效数字，但只有 5 位小数。
   */
  for (const d of [4, 6, 8]) {
    const got = (await text({ operation: 'evaluate', expression: '1/7', displayPrecision: d })).trim()
    // 1/7 = 0.142857...，有效数字位数应约等于 d
    const sigDigits = got.replace(/^0\./, '').replace(/0+$/, '').length
    assert('1/7 在显示精度 ' + d + ' 下约 ' + d + ' 位有效数字',
      Math.abs(sigDigits - d) <= 1, got + ' → ' + sigDigits + ' 位')
    // 不能截得只剩一两位（那样没用了）
    assert('1/7 在显示精度 ' + d + ' 下仍有意义', sigDigits >= Math.min(d, 3), got)
  }

  // 完整模式（不传）应该很长
  const full = (await text({ operation: 'evaluate', expression: '1/7' })).trim()
  assert('不传 displayPrecision 时输出完整', decimalsOf(full) > 20, decimalsOf(full) + ' 位小数')
}

console.log('-- 4. 覆盖到各类 operation（不只 evaluate）--')
{
  // formula
  const formulaFull = await text({
    operation: 'formula', formula: 'escape_velocity', overrides: { M: 5.972e24, r: 6371000 },
  })
  const formulaShort = await text({
    operation: 'formula', formula: 'escape_velocity', overrides: { M: 5.972e24, r: 6371000 },
    displayPrecision: 6,
  })
  const pick = (s) => (s.split('\n').find((l) => l.startsWith('结果')) || '')
  assert('formula 完整时小数很多', decimalsOf(pick(formulaFull)) > 20, decimalsOf(pick(formulaFull)) + '')
  assert('formula 显示精度 6 时变短', decimalsOf(pick(formulaShort)) <= 5,
    pick(formulaShort).slice(0, 40))

  // stats（走 trimNumber 路径）
  const statsShort = await text({ operation: 'stats', data: [2, 4, 4, 4, 5, 5, 7, 9], displayPrecision: 6 })
  // 6 位有效数字 → 小数最多 6 位（如 0.537132）。7 位以上才说明没生效。
  const longs = statsShort.split('\n').filter((l) => /[0-9]\.[0-9]{7,}/.test(l))
  assert('stats 显示精度 6 时无超长小数', longs.length === 0, longs.slice(0, 2).join(' | '))
  // 但仍要保留有用精度（标准差不能变成 2）
  assert('stats 标准差仍保留 2.138', /2\.138/.test(statsShort), '')

  // solve（trimNumber 路径）
  const solveShort = await text({ operation: 'solve', expression: 'x^2=2', variable: 'x', displayPrecision: 6 })
  assert('solve 输出被截断', /1\.4142/.test(solveShort) && !/1\.41421356/.test(solveShort),
    solveShort.slice(0, 60))
}

console.log('-- 5. 工作区固化 --')
{
  const home = freshHome('pin')
  // 先清空状态
  await run({ operation: 'workspace', action2: 'set', displayPrecision: 0 })

  const before = (await text({ operation: 'evaluate', expression: '1/7' })).trim()
  assert('固化前输出完整', decimalsOf(before) > 20, decimalsOf(before) + '')

  const setResult = await text({ operation: 'workspace', action2: 'set', displayPrecision: 6 })
  assert('固化命令成功', /显示精度 6 位/.test(setResult), setResult.slice(0, 60))

  const after = (await text({ operation: 'evaluate', expression: '1/7' })).trim()
  assert('固化后不传参数也变短', after === '0.142857', after)

  // 临时覆盖
  const override = (await text({ operation: 'evaluate', expression: '1/7', displayPrecision: 12 })).trim()
  assert('单次传显示精度可临时调高', decimalsOf(override) > 5, override)

  // 覆盖后回到固化值
  const back = (await text({ operation: 'evaluate', expression: '1/7' })).trim()
  assert('临时覆盖不影响固化值', back === '0.142857', back)

  // 清除
  await run({ operation: 'workspace', action2: 'set', displayPrecision: 0 })
  const cleared = (await text({ operation: 'evaluate', expression: '1/7' })).trim()
  assert('传 0 可清除，恢复完整输出', decimalsOf(cleared) > 20, decimalsOf(cleared) + '')

  rmSync(home, { recursive: true, force: true })
}

console.log('-- 6. 边界与非法输入 --')
{
  freshHome('edge')

  // 超范围
  const tooHigh = await run({ operation: 'evaluate', expression: '1/7', displayPrecision: 999 })
  assert('超上限被钳制而不是报错', tooHigh.ok, '')
  const clamped = String(tooHigh.result).trim()
  assert('钳制到 64 位（仍较完整）', decimalsOf(clamped) >= 8, decimalsOf(clamped) + '')

  // 非法值
  const weird = await run({ operation: 'evaluate', expression: '1/7', displayPrecision: 'abc' })
  assert('非法字符串不崩', weird.ok, '')

  // 工作区设超范围
  const badSet = await run({ operation: 'workspace', action2: 'set', displayPrecision: 999 })
  assert('工作区设超范围时报错并给建议', !badSet.ok && /0—64|建议/.test(String(badSet.error && badSet.error.hint || badSet.result || '')),
    String(badSet.result).slice(0, 80))
}

console.log('-- 7. 提示词与 schema 都写明了用法 --')
{
  freshHome('prompt')
  const awareness = await import(pathToFileURL(join(root, 'lib/awareness.js')).href)
  const desc = awareness.TOOL_DESCRIPTION
  assert('工具描述解释了 precision 是计算精度', /precision（计算/.test(desc), '')
  assert('工具描述解释了 displayPrecision 是显示精度', /displayPrecision（显示/.test(desc), '')
  assert('工具描述提醒不要为好看调低 precision', /不要为好看而动|会算错大数/.test(desc), '')
  assert('工具描述说明整数永远完整', /整数永远完整/.test(desc), '')

  const playbook = await import(pathToFileURL(join(root, 'lib/playbook.js')).href)
  const brief = playbook.buildBriefPlaybook({})
  assert('brief 提示开工定一次显示精度', /定一次显示精度/.test(brief), '')
  assert('brief 提示不要调低计算精度', /precision.*不要调低|一低大数就会算错/.test(brief), '')
  assert('brief 给了具体例子', /displayPrecision/.test(brief), '')
}

try {
  rmSync(process.env.DSH_MATH_CALC_HOME, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
