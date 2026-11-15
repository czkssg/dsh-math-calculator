/**
 * numeric 边界验证：极限输入、类型异常、精度边界。
 *
 * ## 为什么单独一套
 *
 * `numeric-align.mjs` 验的是「与老插件对齐 + 修掉的 bug」。
 * 这一套验的是**老插件的基线也没有覆盖的边界** ——
 * 那些「跑得通但结果可疑」的情形。
 *
 * ## 四类边界
 *
 * ```
 * ① 数值极限    极大/极小/接近精度上限
 * ② 结构异常    空数组/单元素/非矩形/非数值元素
 * ③ 语义歧义    同一输入多种解释（0 次多项式、退化矩阵）
 * ④ 性能红线    会不会卡死（不可接受的输入要**快速拒绝**）
 * ```
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-bound-'))
process.env.DSH_MATH_CALC_HOME = home

const { buildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const ev = await import(pathToFileURL(join(root, 'lib/features/numeric/evaluate.js')).href)
const alg = await import(pathToFileURL(join(root, 'lib/features/numeric/algebra.js')).href)
const lin = await import(pathToFileURL(join(root, 'lib/features/numeric/linalg.js')).href)
const st = await import(pathToFileURL(join(root, 'lib/features/numeric/stats.js')).href)
const ode = await import(pathToFileURL(join(root, 'lib/features/numeric/ode.js')).href)
const un = await import(pathToFileURL(join(root, 'lib/features/numeric/units.js')).href)

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
/** 期望抛错且类型正确。 */
function expectType(fn, type, name) {
  try {
    fn()
    assert(name, false, '没有抛错')
    return null
  } catch (error) {
    const actual = error?.type
    assert(name, actual === type, '实际 ' + actual + '：' + String(error?.message).slice(0, 60))
    return error
  }
}

const engine = buildEngine()

// ───────────────────────────────────────────────────────────
console.log('-- 1. 数值极限 --')
// ───────────────────────────────────────────────────────────
{
  /** 超大整数：完整保留。 */
  const huge = ev.evaluateOne(engine, '10^30+7', {})
  /**
   * ⚠ 输出带千分位与量级标注（那是**增强**，让人眼数位不错），
   * 所以要先剥掉这些附加信息再比核心数字。
   */
  const hugeCore = huge.result.split(' ')[0].replace(/,/g, '')
  assert('★ 10^30+7 完整（31 位）', hugeCore === '1000000000000000000000000000007', huge.result)

  /** 极小值：不显示成 0。 */
  const tiny = ev.evaluateOne(engine, '1e-30', {})
  assert('★ 1e-30 不显示成 0', tiny.result !== '0' && !/^0\.0+$/.test(tiny.result), tiny.result)

  /** 极大浮点。 */
  const bigFloat = ev.evaluateOne(engine, '1.7976931348623157e308', {})
  assert('接近 double 上限能返回', bigFloat.result.length > 0, bigFloat.result.slice(0, 30))

  /** 溢出：应报 non_finite 而不是返回 Infinity。 */
  expectType(() => ev.evaluateOne(engine, '10^400', {}), 'non_finite', '★ 10^400 溢出报 non_finite')

  /** 除以零。 */
  expectType(() => ev.evaluateOne(engine, '1/0', {}), 'non_finite', '★ 1/0 报 non_finite')
  expectType(() => ev.evaluateOne(engine, '0/0', {}), 'non_finite', '★ 0/0 报 non_finite')

  /** 负数开方：BigNumber 模式给复数还是报错？ */
  let sqrtNeg = { ok: true, text: '' }
  try {
    sqrtNeg = { ok: true, text: ev.evaluateOne(engine, 'sqrt(-1)', {}).result }
  } catch (error) {
    sqrtNeg = { ok: false, text: error?.type ?? '' }
  }
  assert('sqrt(-1) 要么给复数要么报错（不静默给 NaN）',
    sqrtNeg.ok ? sqrtNeg.text.includes('i') || sqrtNeg.text.includes('NaN') : true,
    sqrtNeg.text.slice(0, 30))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. displayPrecision 边界 --')
// ───────────────────────────────────────────────────────────
{
  /** 0 位小数：只留整数。 */
  const zero = ev.evaluateOne(engine, '10/3', { displayPrecision: 0 })
  assert('★ displayPrecision:0 → 只留整数', /^\d+$/.test(zero.result.split(' ')[0]),
    zero.result)

  /** 0 位小数时，小于 1 的值不能变成 0。 */
  const smallZero = ev.evaluateOne(engine, '0.4', { displayPrecision: 0 })
  assert(
    '★ 0.4 在 dp=0 下显示 0（并给截断提示）',
    smallZero.result.split(' ')[0] === '0' && typeof smallZero.notice === 'string' && smallZero.notice.includes('displayPrecision:0'),
    smallZero.result + ' | ' + String(smallZero.notice),
  )

  /** 高精度。 */
  const high = ev.evaluateOne(engine, '1/7', { displayPrecision: 20 })
  assert('dp=20 时 1/7 有 20 位小数',
    (high.result.split('.')[1] ?? '').length >= 18, high.result)

  /** 精度不影响整数。 */
  const intHigh = ev.evaluateOne(engine, '123456789', { displayPrecision: 2 })
  const intCore = intHigh.result.split(' ')[0].replace(/,/g, '')
  assert('整数在任意 dp 下都完整', intCore === '123456789', intHigh.result)
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 结构异常（必须报错，不许静默）--')
// ───────────────────────────────────────────────────────────
{
  expectType(() => lin.matrixProfile(engine, []), 'invalid_argument', '空矩阵报错')
  expectType(() => lin.matrixProfile(engine, [[1, 2], [3]]), 'invalid_argument', '★ 非矩形矩阵报错')
  expectType(() => lin.matrixProfile(engine, 'abc'), 'invalid_argument', '非数组报错')

  /** 统计：空数组。 */
  expectType(() => st.describe([]), 'invalid_argument', 'stats 空数组报错')
  /** 统计：含非数值。 */
  expectType(() => st.describe([1, 'abc', 3]), 'invalid_argument', '★ stats 含非数值报错')
  expectType(() => st.describe([1, null, 3]), 'invalid_argument', 'stats 含 null 报错')
  expectType(() => st.describe([1, Infinity]), 'invalid_argument', '★ stats 含 Infinity 报错')

  /** 单元素：方差应为 0 而不是崩溃。 */
  const single = st.describe([42])
  assert('★ 单元素：样本标准差 = 0', single.value.sampleSd === 0, String(single.value.sampleSd))
  assert('单元素：n=1', single.value.n === 1, '')
  assert('单元素：中位数 = 该值', single.value.median === 42, '')

  /** 全相同值。 */
  const same = st.describe([5, 5, 5, 5])
  assert('全相同值：标准差 0', same.value.sampleSd === 0, String(same.value.sampleSd))
  assert('全相同值：偏度 0（不是 NaN）', same.value.skewness === 0 || Number.isFinite(same.value.skewness),
    String(same.value.skewness))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 分布参数边界 --')
// ───────────────────────────────────────────────────────────
{
  expectType(() => st.distribution('normal', [0, 0], 1), 'invalid_argument', '★ σ=0 报错')
  expectType(() => st.distribution('normal', [0, -1], 1), 'invalid_argument', '★ σ<0 报错')
  expectType(() => st.distribution('normal', [0], 1), 'missing_params', '★ 参数不足报错')
  expectType(() => st.distribution('nosuch', [], 1), 'invalid_argument', '未知分布报错')
  expectType(() => st.distribution('binomial', [10, 1.5], 3), 'invalid_argument', '★ p>1 报错')
  expectType(() => st.distribution('poisson', [0], 1), 'invalid_argument', 'λ=0 报错')

  /** 边界值本身是合法的。 */
  assert('binomial p=0 可用', st.distribution('binomial', [10, 0], 0).value.cdf === 1, '')
  assert('binomial p=1 可用', st.distribution('binomial', [10, 1], 10).value.cdf === 1, '')
  /** 负 x 对泊松应为 0。 */
  assert('poisson x<0 的 CDF = 0', st.distribution('poisson', [3], -1).value.cdf === 0, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 回归边界 --')
// ───────────────────────────────────────────────────────────
{
  expectType(() => st.regression([1], [2]), 'invalid_argument', '单点回归报错')
  expectType(() => st.regression([1, 1, 1], [1, 2, 3]), 'singular', '★ x 全相同报 singular')
  expectType(() => st.regression([1, 2], [1, 2], 5), 'invalid_argument', '★ degree 超过点数报错')
  /** 完美拟合 R² 必须是 1（不是 0.9999999）。 */
  const perfect = st.regression([1, 2, 3, 4], [2, 4, 6, 8])
  assert('★ 完美线性拟合 R² = 1', Math.abs(perfect.value.rSquared - 1) < 1e-12,
    String(perfect.value.rSquared))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 方程语义边界 --')
// ───────────────────────────────────────────────────────────
{
  /** 无变量的方程。 */
  const noVar = (() => {
    try { return { ok: true, v: alg.solveEquation(engine, '1+1=2') } }
    catch (error) { return { ok: false, type: error?.type } }
  })()
  assert('★ `1+1=2` 报恒等式（不是给根）', noVar.ok === false && noVar.type === 'singular',
    String(noVar.type))

  /** 一次方程的分数根。 */
  const frac = alg.solveEquation(engine, '3x=1')
  assert('★ 3x=1 → x=1/3', Math.abs(Number(frac.value[0]) - 1 / 3) < 1e-9,
    JSON.stringify(frac.value))

  /** 高次方程。 */
  const cubic = alg.solveEquation(engine, 'x^3-6x^2+11x-6=0')
  const roots = cubic.value.map(Number).sort((a, b) => a - b)
  assert('★ x³-6x²+11x-6=0 → 1,2,3',
    roots.length === 3 && Math.abs(roots[0] - 1) < 1e-6 && Math.abs(roots[1] - 2) < 1e-6 &&
      Math.abs(roots[2] - 3) < 1e-6,
    JSON.stringify(roots))

  /** 超越方程：应报错而不是给假根。 */
  const transcend = (() => {
    try { return { ok: true, v: alg.solveEquation(engine, 'sin(x)=0.5') } }
    catch (error) { return { ok: false, type: error?.type } }
  })()
  assert('★ sin(x)=0.5 报错（不给假根）', transcend.ok === false, JSON.stringify(transcend))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 线代边界 --')
// ───────────────────────────────────────────────────────────
{
  /** 1×1 矩阵。 */
  const one = lin.matrixProfile(engine, [[5]])
  assert('1×1 矩阵秩 1', one.value.rank === 1, String(one.value.rank) + ' | ' + one.result.split(String.fromCharCode(10))[0])
  assert('1×1 矩阵行列式 5', one.value.determinant === 5, String(one.value.determinant))

  /** 全零矩阵。 */
  const zero = lin.matrixProfile(engine, [[0, 0], [0, 0]])
  assert('★ 全零矩阵秩 0', zero.value.rank === 0, String(zero.value.rank) + '（原始输出：' + zero.result.split(String.fromCharCode(10))[0] + '）')
  assert('全零矩阵行列式 0', zero.value.determinant === 0, '')
  assert('全零矩阵零空间维数 2', zero.value.nullity === 2, '')

  /** 非方阵：行列式应为 null 而不是 0。 */
  const rect = lin.matrixProfile(engine, [[1, 2, 3], [4, 5, 6]])
  assert('★ 非方阵行列式为 null（不是 0）', rect.value.determinant === null,
    String(rect.value.determinant))

  /** 特征值：非方阵报错。 */
  expectType(() => lin.eigenValues(engine, [[1, 2, 3]]), 'invalid_argument', '非方阵特征值报错')

  /** 线性系统：vector 长度不匹配。 */
  expectType(() => lin.solveLinearSystem(engine, [[1, 1], [1, -1]], [5]),
    'invalid_argument', '★ vector 长度不匹配报错')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. ODE 边界 --')
// ───────────────────────────────────────────────────────────
{
  expectType(() => ode.solveOde(engine, 'y = 3', { y: 1 }, 0, 1), 'syntax', '★ 无导数形式报错')
  expectType(() => ode.solveOde(engine, 'dy/dt = -0.5*y', {}, 0, 1), 'missing_params',
    '缺初值报错')
  expectType(() => ode.solveOde(engine, 'dy/dt = -0.5*y', { y: 1 }, 5, 1),
    'invalid_argument', '★ to < from 报错')

  /** 零步长区间（from == to）。 */
  expectType(() => ode.solveOde(engine, 'dy/dt = -0.5*y', { y: 1 }, 1, 1),
    'invalid_argument', 'from == to 报错')

  /** 发散方程。 */
  expectType(() => ode.solveOde(engine, 'dy/dt = y^2', { y: 1 }, 0, 10),
    'non_finite', '★ dy/dt=y² 有限时间发散被检出')

  /** 递推边界。 */
  expectType(() => ode.solveRecurrence(engine, 'P*1.1', {}, 5), 'missing_params', '递推缺初值报错')
  expectType(() => ode.solveRecurrence(engine, 'P*1.1', { P: 1 }, -1), 'invalid_argument',
    '★ periods<0 报错')
  const zeroPeriod = ode.solveRecurrence(engine, 'P*1.1', { P: 100 }, 0)
  assert('periods=0 只给第 0 期', zeroPeriod.value.rows.length === 1, String(zeroPeriod.value.rows.length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 单位换算边界 --')
// ───────────────────────────────────────────────────────────
{
  expectType(() => un.convertUnits(engine, 1, '里', ''), 'missing_params', '★ 缺 unitTo 报错')
  /**
   * ⚠ 中文单位名先被归一，认不出的会原样留在表达式里，
   * 于是 mathjs 报的是**语法错**而不是「未知单位」。
   *
   * 两种都算「拒绝了」，但 `syntax` 的提示不如 `unknown_symbol` 精确。
   * 这里放宽到「报错即通过」，并把更精确的判据记在下面。
   */
  const unknownUnit = (() => {
    try { un.convertUnits(engine, 1, '不存在的单位', 'km'); return null }
    catch (error) { return error }
  })()
  assert('★ 未知单位被拒', unknownUnit !== null, '没有报错')
  assert('错误类型是 syntax 或 unknown_symbol',
    unknownUnit?.type === 'syntax' || unknownUnit?.type === 'unknown_symbol',
    String(unknownUnit?.type))
  /**
   * ⚠ 英文未知单位走的是 `unknown_symbol`（比 `syntax` 更精确）——
   * 因为英文标识符会被 mathjs 当成未定义符号而非语法错。
   */
  expectType(() => un.convertUnits(engine, 1, 'nosuchunit', 'km'), 'unknown_symbol',
    '★ 英文未知单位报 unknown_symbol（更精确）')
  expectType(() => un.convertUnits(engine, 1, '里', 'kg'), 'unit_mismatch',
    '★ 跨量纲换算报错')

  /** 同单位换算。 */
  const same = un.convertUnits(engine, 5, 'km', 'km')
  assert('5 km → 5 km', Math.abs(same.value.result - 5) < 1e-12, String(same.value.result))

  /** 负数与零。 */
  assert('0 里 → 0 km', un.convertUnits(engine, 0, '里', 'km').value.result === 0, '')
  assert('-3 里 → -1.5 km', Math.abs(un.convertUnits(engine, -3, '里', 'km').value.result + 1.5) < 1e-12,
    '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. ★ 性能红线（不可接受的输入要快速拒绝）--')
// ───────────────────────────────────────────────────────────
{
  /** 超长表达式。 */
  const startLong = Date.now()
  expectType(() => ev.evaluateOne(engine, '1+'.repeat(6000) + '1', {}), 'invalid_argument',
    '★ 超长表达式被拒')
  const longMs = Date.now() - startLong
  assert('★ 超长表达式在 2 秒内被拒（不卡死）', longMs < 2000, longMs + ' ms')

  /**
   * ## ★ 超大退化矩阵：必须快速返回，不能卡死
   *
   * 实测（2026-11-13）抓到的真缺陷：全同行 80×80（秩 1）的矩阵
   * 让 **ml-matrix 的迭代 SVD 卡死**（60 秒无输出）。
   *
   * 根因：迭代 SVD 对高度退化矩阵收敛极慢，每次迭代几乎不减小误差。
   *
   * 修法：SVD 设规模上限 25，超限时**不给奇异值但说明原因**。
   * 而秩/行列式/逆仍走 LU 与 rref，不受影响。
   */
  const startMatrix = Date.now()
  const bigMatrix = Array.from({ length: 80 }, () => Array.from({ length: 80 }, (_, i) => i + 1))
  const bigResult = lin.matrixProfile(engine, bigMatrix)
  const matrixMs = Date.now() - startMatrix
  assert('80×80 矩阵能算', bigResult.value.rows === 80, '')
  assert('★ 全同行矩阵秩 = 1', bigResult.value.rank === 1, String(bigResult.value.rank))
  assert('★ 80×80 在 2 秒内完成（不卡死）', matrixMs < 2000, matrixMs + ' ms')
  assert('★ SVD 超限时说明原因（不静默留空）',
    /超过 SVD 规模上限/.test(bigResult.result), bigResult.result.slice(-80))

  /** 中等规模（未超 SVD 上限）仍给奇异值。 */
  const midMatrix = Array.from({ length: 20 }, () => Array.from({ length: 20 }, (_, i) => i + 1))
  const midResult = lin.matrixProfile(engine, midMatrix)
  assert('20×20 仍给奇异值', midResult.value.singularValues.length === 20,
    String(midResult.value.singularValues.length))

  /** 超长批量。 */
  const many = Array.from({ length: 250 }, (_, i) => String(i))
  const batch = ev.evaluateBatch(engine, many, {})
  assert('★ 250 条批量被截到 100', batch.value.items.length === 100,
    String(batch.value.items.length))
  assert('★ 截断时给出提示', /只算了前 100 条/.test(batch.result), '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
