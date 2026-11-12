/**
 * extract_numbers 边界测试：极端输入不静默给错值。
 *
 * 老实现的已知失败模式是「静默」——单位丢了、区间拆出负数、噪音混进台账。
 * 这里成对验证：该抽的抽到、该拒的拒掉、该标注的标注。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-graph-extract-boundary-'))

const ext = await import(pathToFileURL(join(root, 'lib/features/graph/extract-numbers.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
function throwsOf(fn) {
  try { fn(); return null } catch (error) { return error }
}

console.log('-- 1. 空与非法输入 --')
// ───────────────────────────────────────────────────────────
{
  assert('空字符串 → missing_params', throwsOf(() => ext.extractNumbers(''))?.type === 'missing_params', '')
  assert('全空白 → missing_params', throwsOf(() => ext.extractNumbers('   \n  '))?.type === 'missing_params', '')
  assert('非字符串 → missing_params', throwsOf(() => ext.extractNumbers(123))?.type === 'missing_params', '')
  assert('undefined → missing_params', throwsOf(() => ext.extractNumbers(undefined))?.type === 'missing_params', '')
}

console.log('-- 2. 没有数字的文本 --')
// ───────────────────────────────────────────────────────────
{
  const out = ext.runExtractNumbers('这段文字里没有任何阿拉伯数字，只有汉字。')
  assert('无数字 → 0 条，不报错', out.value.items.length === 0, String(out.value.items.length))
  assert('render 仍给出台账头', out.result.includes('抽出 0 个数字'), out.result.slice(0, 60))

  const onlyChineseNumber = ext.runExtractNumbers('约一万吨。')
  assert('★ 中文数词「一」不被误当数字（当前不支持中文数词解析）', onlyChineseNumber.value.items.length === 0,
    String(onlyChineseNumber.value.items.length))
}

console.log('-- 3. 负数与符号边界 --')
// ───────────────────────────────────────────────────────────
{
  const neg = ext.runExtractNumbers('温度 -5 度。')
  assert('负号保留', near(neg.value.items[0].value, -5, 1e-9), String(neg.value.items[0].value))

  const rangeNeg = ext.runExtractNumbers('区间 -20 到 -10 度。')
  assert('★ 负区间不拆成正数', near(rangeNeg.value.items[0].value, -20, 1e-9) && near(rangeNeg.value.items[0].high, -10, 1e-9),
    JSON.stringify([rangeNeg.value.items[0].value, rangeNeg.value.items[0].high]))

  const dash = ext.runExtractNumbers('2026-11-13 是日期。')
  assert('★ 日期行被当噪音（不抽成 2026 与 -11）', dash.value.items.length === 0, String(dash.value.items.length))
}

console.log('-- 4. 量级与单位边界 --')
// ───────────────────────────────────────────────────────────
{
  const zero = ext.runExtractNumbers('0 人。')
  assert('0 也抽出（不是缺失）', zero.value.items.length === 1 && zero.value.items[0].value === 0, '')

  const decimal = ext.runExtractNumbers('0.0001 克。')
  assert('小数位不丢', near(decimal.value.items[0].value, 1e-4, 1e-12), String(decimal.value.items[0].value))

  const multiMag = ext.runExtractNumbers('1 千万人。')
  assert('「千万」= 1e7', near(multiMag.value.items[0].value, 1e7, 1), String(multiMag.value.items[0].value))

  const unitOnly = ext.runExtractNumbers('单位：kg 与 m 没有数字。')
  assert('★ 只有单位没有数字 → 不误抽', unitOnly.value.items.length === 0, String(unitOnly.value.items.length))
}

console.log('-- 5. limit 与批量 --')
// ───────────────────────────────────────────────────────────
{
  const text = Array.from({ length: 30 }, () => '甲行 7 人').join('\n')
  const limited = ext.runExtractNumbers(text, { limit: 5 })
  assert('limit 截断到 5', limited.value.items.length === 5, String(limited.value.items.length))

  const zeroLimit = ext.runExtractNumbers(text, { limit: 0 })
  assert('limit=0 → 用默认值而不是空', zeroLimit.value.items.length === 30, String(zeroLimit.value.items.length))

  const negativeLimit = ext.runExtractNumbers(text, { limit: -3 })
  assert('limit 负数 → 用默认值', negativeLimit.value.items.length === 30, String(negativeLimit.value.items.length))

  const floatLimit = ext.runExtractNumbers(text, { limit: 5.9 })
  assert('limit 小数 → 向下取整', floatLimit.value.items.length === 5, String(floatLimit.value.items.length))
}

console.log('-- 6. 上下文边界 --')
// ───────────────────────────────────────────────────────────
{
  const atStart = ext.runExtractNumbers('42 是答案。')
  assert('数字在句首 → 上下文从行首取', atStart.value.items[0].context.includes('42'), atStart.value.items[0].context)

  const atEnd = ext.runExtractNumbers('答案是 42')
  assert('数字在句尾 → 上下文取到行尾', atEnd.value.items[0].context.includes('答案'), atEnd.value.items[0].context)

  const noPunct = ext.runExtractNumbers('一二三四五六七八九十 42 一二三四五六七八九十')
  assert('无标点 → 整行做上下文', noPunct.value.items[0].context.length > 0, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
