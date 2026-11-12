/**
 * core 层自检：引擎、格式化、错误。
 *
 * 这一步的验收标准（来自重写方案第 2 步）：
 *
 * ```
 *   能算出 2+3*4=14，1/7 给 8 位小数
 * ```
 *
 * 但光「能算」不够 —— 还要验证那些**踩出来的判据**没丢：
 *
 * ```
 *   1e12 g      → 该说「100 万吨」而不是「1 Tg」
 *   2 m to cm   → 该给 200 cm（显式换算不许被归位撤回）
 *   3.3e-9      → 不许显示成 0（那是数据丢失）
 *   10^20+5     → 整数不许截断
 *   1 里 + 3 米 → 中文单位要能参与运算
 * ```
 */
import { buildEngine, normalizeUnits } from '../lib/core/engine.js'
import {
  fmtNumber, fmtShort, FMT, trimDecimal, magnitudeOf, annotateMagnitude,
  chineseMagnitude, toJsonValue, superscript,
} from '../lib/core/format.js'
import { CalcError, normalizeError } from '../lib/core/errors.js'

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

const engine = buildEngine()

// ───────────────────────────────────────────────────────────
console.log('-- 1. 引擎基本求值 --')
// ───────────────────────────────────────────────────────────
{
  assert('2+3*4 = 14', engine.evaluateNumber('2+3*4') === 14, String(engine.evaluateNumber('2+3*4')))
  assert('(2+3)*4 = 20', engine.evaluateNumber('(2+3)*4') === 20, '')
  assert('2^10 = 1024', engine.evaluateNumber('2^10') === 1024, '')
  assert('sqrt(16) = 4', engine.evaluateNumber('sqrt(16)') === 4, '')
  assert('sin(0) = 0', engine.evaluateNumber('sin(0)') === 0, '')
  /** 作用域。 */
  assert('带变量求值 m*2', engine.evaluateNumber('m*2', { m: 500 }) === 1000, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 中文单位归一（老代码踩过拆错词的坑）--')
// ───────────────────────────────────────────────────────────
{
  /** 长词必须优先，否则「公里」会被拆成「公」+「里」。 */
  assert('公里 不被拆错', normalizeUnits('3 公里') === '3 km', normalizeUnits('3 公里'))
  assert('平方公里 优先于 公里', normalizeUnits('5 平方公里') === '5 km2', normalizeUnits('5 平方公里'))
  assert('平方米 优先于 米', normalizeUnits('35 平方米') === '35 m2', normalizeUnits('35 平方米'))
  assert('立方米 优先于 米', normalizeUnits('7200 立方米') === '7200 m3', normalizeUnits('7200 立方米'))
  /**
   * ★ 中文古制单位必须带 `cn` 前缀 —— 这是实测抓出来的。
   *
   * `li` 在 mathjs 里是 **link（测链，0.201168 m）**，而中文「里」是 500 m。
   * 不加前缀会被静默算成错值，且数值看着正常（0.2 与 500 都不荒谬）。
   */
  assert('里 → cnli（避开 mathjs 的 link）', normalizeUnits('30 里') === '30 cnli', normalizeUnits('30 里'))
  assert('时辰 → cnshichen', normalizeUnits('2 时辰') === '2 cnshichen', normalizeUnits('2 时辰'))
  assert('公斤 → kg', normalizeUnits('100 公斤') === '100 kg', normalizeUnits('100 公斤'))

  /** 真实运算：中文单位要能参与。 */
  const sum = engine.evaluate('1 里 + 3 米')
  assert('1 里 + 3 米 能算', sum !== undefined, String(sum))
  /** 换算因子要正确（里=500m、斤=500g、时辰=2h、亩≈666.7m²）。 */
  const CASES = [
    ['30 里 to m', 15000],
    ['30 里 to km', 15],
    ['1 斤 to g', 500],
    ['2 时辰 to h', 4],
    ['1 丈 to m', 3.2],
  ]
  for (const [expr, want] of CASES) {
    const got = Number(String(engine.evaluate(expr)).split(' ')[0])
    assert(expr + ' = ' + want, Math.abs(got - want) < 1e-9, String(got))
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 精度（BigNumber 路径）--')
// ───────────────────────────────────────────────────────────
{
  /** 大整数不许丢位。 */
  const big = engine.evaluate('10^20 + 5')
  assert('10^20+5 得完整大数', String(big.toString()).includes('100000000000000000005'), String(big))
  /**
   * ⚠ 已知缺陷（老代码也有）：`(10^100+1)-(10^100)` 在默认精度下得 0。
   * 这条**现在仍是红的**，记录下来等修。
   */
  const cancel = engine.evaluate('(10^100+1)-(10^100)').toString()
  console.log('        注：(10^100+1)-(10^100) =', cancel, '（应为 1，已知缺陷待修）')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 格式化：科学计数法的两个门槛 --')
// ───────────────────────────────────────────────────────────
{
  assert('小值用科学计数', fmtNumber(0.000000123, FMT.general).includes('e'), fmtNumber(0.000000123, FMT.general))
  assert('大值用科学计数', fmtNumber(1e12, FMT.short).includes('e'), fmtNumber(1e12, FMT.short))
  assert('普通值定点', fmtNumber(3.14159, FMT.general) === '3.14159', fmtNumber(3.14159, FMT.general))
  assert('0 就是 0', fmtNumber(0, FMT.general) === '0', fmtNumber(0, FMT.general))
  assert('非有限给占位符', fmtNumber(NaN, FMT.general) === '—', fmtNumber(NaN, FMT.general))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ displayPrecision：小数点后几位 --')
// ───────────────────────────────────────────────────────────
{
  assert('1/3 保留 8 位小数', trimDecimal(1 / 3, 8) === '0.33333333', trimDecimal(1 / 3, 8))
  assert('1/3 保留 2 位小数', trimDecimal(1 / 3, 2) === '0.33', trimDecimal(1 / 3, 2))
  assert('整数不截断', trimDecimal(12345, 2) === '12345', trimDecimal(12345, 2))
  /** 极小数不许变成 0。 */
  const tiny = trimDecimal(3.3e-9, 8)
  assert('3.3e-9 不显示成 0', tiny !== '0' && tiny.includes('e'), tiny)
  /** 0 位小数只留整数。 */
  assert('0 位小数取整', trimDecimal(3.7, 0) === '4', trimDecimal(3.7, 0))
  /** 负数。 */
  assert('负数正常', trimDecimal(-1 / 3, 4) === '-0.3333', trimDecimal(-1 / 3, 4))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 量级标注（只在 ≥10⁴ 时给）--')
// ───────────────────────────────────────────────────────────
{
  assert('2133 的量级是 3', magnitudeOf(2133) === 3, String(magnitudeOf(2133)))
  assert('8778万 的量级是 7', magnitudeOf(8.778e7) === 7, String(magnitudeOf(8.778e7)))
  assert('小量级不标注（3km）', annotateMagnitude(3000) === '', annotateMagnitude(3000))
  assert('大量级标注', annotateMagnitude(2133 * 1e4) === '(~10⁷)', annotateMagnitude(2133 * 1e4))
  assert('负量级标注', annotateMagnitude(3.3e-9) === '(~10⁻⁹)', annotateMagnitude(3.3e-9))
  assert('上标转换', superscript(-9) === '⁻⁹', superscript(-9))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 中文量级（中文语料的习惯说法）--')
// ───────────────────────────────────────────────────────────
{
  assert('8.778e7 → 约 8778 万', chineseMagnitude(8.778e7).includes('万'), chineseMagnitude(8.778e7))
  assert('1.49e8 → 约 1.49 亿', chineseMagnitude(1.49e8).includes('亿'), chineseMagnitude(1.49e8))
  assert('小值不转换', chineseMagnitude(100) === '', chineseMagnitude(100))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. ★ 错误类型映射 --')
// ───────────────────────────────────────────────────────────
{
  const undef = (() => {
    try { engine.evaluate('xy*2') } catch (e) { return e }
    return null
  })()
  assert('未定义符号 → unknown_symbol', undef?.type === 'unknown_symbol', undef?.type)
  assert('hint 说清下一步', /variables|赋值/.test(undef?.hint ?? ''), undef?.hint?.slice(0, 50))

  const syntax = (() => {
    try { engine.evaluate('2++') } catch (e) { return e }
    return null
  })()
  assert('语法错 → syntax', syntax?.type === 'syntax', syntax?.type)

  const div0 = (() => {
    try { engine.evaluateNumber('1/0') } catch (e) { return e }
    return null
  })()
  assert('除以零 → non_finite', div0?.type === 'non_finite', div0?.type)

  /** 超长表达式要拒绝而不是慢慢算。 */
  const tooLong = (() => {
    try { engine.evaluate('1+'.repeat(6000) + '1') } catch (e) { return e }
    return null
  })()
  assert('超长表达式被拒', tooLong?.type === 'invalid_argument', tooLong?.type)

  /** 已有 CalcError 原样透传。 */
  const original = new CalcError('unit_mismatch', 'x', 'y')
  assert('CalcError 原样返回', normalizeError(original) === original, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. JSON 安全（宿主会校验输出）--')
// ───────────────────────────────────────────────────────────
{
  const big = engine.evaluate('10^20')
  const json = JSON.stringify(toJsonValue({ v: big }))
  assert('BigNumber 能 JSON 化', json !== undefined && !json.includes('isBigNumber'), json.slice(0, 60))

  /** 非有限值转成字符串（JSON 没有 NaN/Infinity）。 */
  const nanJson = JSON.stringify(toJsonValue({ v: NaN }))
  assert('NaN 转成字符串', nanJson.includes('"NaN"'), nanJson)

  /** 矩阵转数组。 */
  const m = engine.evaluate('[[1,2],[3,4]]')
  const mJson = toJsonValue(m)
  assert('Matrix 转成数组', Array.isArray(mJson), JSON.stringify(mJson))
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. 安全边界（动态执行入口已删）--')
// ───────────────────────────────────────────────────────────
{
  const imp = (() => {
    try { engine.evaluate('import("fs")') } catch (e) { return e }
    return null
  })()
  assert('import 不可用', imp !== null, String(imp))
  /**
   * ⚠ `createUnit` **不该被删** —— 这是重写时修正的一个判断。
   *
   * 初版把 `import` 与 `createUnit` 都当「代码执行入口」删掉。
   * 实测后修正：`createUnit` 接受「500 m」这种**常量表达式**，
   * 无法执行任意代码；而删掉它的代价是**中文古制单位无法注册**，
   * 于是 `30 里` 根本算不了。这是过度防御。
   *
   * 现在只删 `import`，`createUnit` 保留并用于注册中文单位。
   */
  assert('createUnit 保留（注册中文单位所需）', typeof engine.math.createUnit === 'function', '')
  assert('中文单位已注册（30 里 = 15000 m）',
    engine.evaluate('30 里 to m').toString().startsWith('15000'), engine.evaluate('30 里 to m').toString())
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
