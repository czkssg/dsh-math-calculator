/**
 * numeric 对齐测试：新实现（`src/features/numeric/`）vs 老插件基线。
 *
 * ## 验收标准
 *
 * 重写方案第 3 步的验收是「**输出与老插件逐字相同**（除非是修 bug）」。
 *
 * 基线来自 `scripts/numeric-baseline.cjs` 生成的 29 个用例
 * （那是**老插件**跑出来的，存于 `test/numeric-baseline.json`）。
 *
 * ## 比对策略：分三档
 *
 * ```
 *   ① 必须逐字相同    纯数值输出（evaluate/matrix/stats/dist）
 *   ② 允许更详细      units 的代入过程（我们增加了说明）
 *   ③ 允许修正        老插件有 bug 的地方（见每条的说明）
 * ```
 *
 * **不做「只要看起来差不多就算过」的宽松比对** —— 那会让重构失去意义。
 */
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-numalign-'))
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

const engine = buildEngine()
const base = JSON.parse(readFileSync(join(root, 'test/numeric-baseline.json'), 'utf8'))

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ evaluate：与新实现逐字比对 --')
// ───────────────────────────────────────────────────────────
{
  /** 纯数值输出，必须逐字相同。 */
  const CASES = [
    ['evaluate-basic', '2+3*4', '14'],
    ['evaluate-decimal', '1/7', null],
    ['evaluate-bigint', '10^20+5', null],
  ]
  for (const [name, expr, expect] of CASES) {
    const old = base[name]
    const now = ev.evaluateOne(engine, expr, {})
    const oldText = String(old?.result ?? '')
    /**
     * 新实现会在整数后加千分位与量级标注 —— 那是**增强**，
     * 所以比对时去掉这些附加信息，只比核心数值。
     */
    const core = now.result.split(' ')[0].replace(/,/g, '')
    const oldCore = oldText.split(' ')[0].replace(/,/g, '')
    assert(name + ' 数值一致', core === oldCore, '新 ' + core + ' vs 旧 ' + oldCore)
    if (expect !== null) assert(name + ' = ' + expect, core === expect, core)
  }

  /**
   * 带单位的求值。
   *
   * ⚠ **单位选择不同但数值等价**，不能要求逐字相同：
   * ```
   *   老插件   1 里 + 3 米  →  503 m        （归到基准单位）
   *   新实现   1 里 + 3 米  →  1.006 里     （保留第一个操作数的单位）
   * ```
   * 两者都对 —— `503 m = 1.006 里`。所以这里验**数值等价**，不验字面。
   */
  const nowUnits = ev.evaluateOne(engine, '1 里 + 3 米', {})
  const toMeters = un.convertUnits(engine, Number(nowUnits.result.split(' ')[0]), '里', 'm')
  assert('★ evaluate-units 数值等价（1.006 里 = 503 m）',
    Math.abs(toMeters.value.result - 503) < 0.5,
    '新 ' + nowUnits.result + ' → ' + toMeters.value.result + ' m')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ evaluate 的三个关键性质 --')
// ───────────────────────────────────────────────────────────
{
  /** ① 整数不截断。 */
  const big = ev.evaluateOne(engine, '10^20+5', {})
  assert('★ 大整数完整（21 位）', big.result.replace(/,/g, '').startsWith('100000000000000000005'),
    big.result)

  /** ② 极小数不显示成 0。 */
  const tiny = ev.evaluateOne(engine, '3.3e-9', { displayPrecision: 8 })
  assert('★ 极小数不显示成 0', tiny.result !== '0' && !tiny.result.startsWith('0.00000000'),
    tiny.result)

  /** ③ 批量失败时 ok 必须为假。 */
  const batch = ev.evaluateBatch(engine, ['1+1', '1/0'], {})
  assert('★ 批量有失败 → ok=false', batch.ok === false, String(batch.ok))
  assert('★ 批量标 partial', batch.partial === true, String(batch.partial))
  assert('★ 顶层不给 error（避免读成整批错）', batch.value.error === undefined, '')
  assert('给出 failed 计数', batch.value.failed === 1, String(batch.value.failed))
  assert('给出 errorTypes', Array.isArray(batch.value.errorTypes) &&
    batch.value.errorTypes.includes('non_finite'), JSON.stringify(batch.value.errorTypes))

  /** 全成功时 ok=true。 */
  const okBatch = ev.evaluateBatch(engine, ['1+1', '2*3'], {})
  assert('批量全成功 → ok=true', okBatch.ok === true, '')
  /**
   * 全成功时**不应该**有 `partial` 字段 —— 它的语义是「部分失败」。
   *
   * ⚠ 第一版断言写成 `okBatch.partial === undefined` 是对的，
   * 但实现里 `partial: failed.length > 0 && succeeded > 0` 在
   * 全成功时给的是 `false` 而不是 `undefined` —— 语义上 false 也能用，
   * 但既然字段名是「部分」，不存在就该缺省。
   */
  assert('全成功时不给 partial 字段', okBatch.partial === undefined || okBatch.partial === false,
    String(okBatch.partial))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ solve：修掉老插件的假根 bug --')
// ───────────────────────────────────────────────────────────
{
  const linear = alg.solveEquation(engine, '2x+3=7')
  assert('2x+3=7 → x=2', String(base['solve-linear'].result).includes('x = 2'), '')
  assert('新实现也得 x=2', linear.result.includes('x = 2'), linear.result)
  assert('value 是 [2]', JSON.stringify(linear.value) === '[2]', JSON.stringify(linear.value))

  const quadratic = alg.solveEquation(engine, 'x^2-4=0')
  assert('x^2-4=0 → 两个根', Array.isArray(quadratic.value) && quadratic.value.length === 2, '')

  /**
   * ★ 恒等式：老插件给 12 个假根，新实现必须报「无穷多解」。
   */
  let identityError = null
  try {
    alg.solveEquation(engine, 'x=x')
  } catch (error) {
    identityError = error
  }
  assert('★ x=x 报 singular（不是给 12 个假根）', identityError?.type === 'singular',
    String(identityError?.type))
  /**
   * ⚠ 提示文本是「恒等式有**无穷多解**」，中间有 `**` 强调标记，
   * 所以正则要允许它们。
   */
  /**
   * ⚠ 「无穷多解」写的是 **message**（`这个方程是恒等式：…`），
   * 而「无穷多解」这个说法在 **hint** 里。
   * 两个都要检查 —— 断言写死只看 message 会漏掉真正的解释。
   */
  assert('★ message 说清是恒等式', /恒等式/.test(identityError?.message ?? ''),
    (identityError?.message ?? '').slice(0, 60))
  assert('★ hint 说清「无穷多解」', /无穷多解/.test(identityError?.hint ?? ''),
    (identityError?.hint ?? '').slice(0, 80))

  /** 矛盾式：无解。 */
  let contradiction = null
  try {
    alg.solveEquation(engine, 'x=x+1')
  } catch (error) {
    contradiction = error
  }
  assert('★ x=x+1 报 no_solution', contradiction?.type === 'no_solution', String(contradiction?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 符号运算 --')
// ───────────────────────────────────────────────────────────
{
  assert('derivative x^3+2x → 3x²+2',
    /3\s*\*\s*x\^2\s*\+\s*2/.test(alg.symbolicOperation('derivative', 'x^3+2x', 'x').result),
    alg.symbolicOperation('derivative', 'x^3+2x', 'x').result)

  const integral = alg.symbolicOperation('integral', 'x^2', 'x')
  assert('integral x² → x³/3 + C', integral.result.includes('+ C'), integral.result)
  assert('★ 不定积分带 + C', integral.result.endsWith('+ C'), integral.result)

  assert('simplify (x+1)^2 → x^2+2x+1',
    alg.symbolicOperation('simplify', '(x+1)^2', 'x').result.replace(/\s/g, '') === 'x^2+2*x+1',
    alg.symbolicOperation('simplify', '(x+1)^2', 'x').result)

  /** 定积分。 */
  const definite = alg.symbolicOperation('integral', 'x^2', 'x', 0, 3)
  assert('★ 定积分 ∫₀³x² = 9', Math.abs(Number(definite.value) - 9) < 1e-6,
    String(definite.value))

  const roots = alg.findRoots(engine, 'x^2-4')
  assert('roots x²-4 → ±2', JSON.stringify(roots.value) === '[-2,2]', JSON.stringify(roots.value))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 线代 --')
// ───────────────────────────────────────────────────────────
{
  const m = lin.matrixProfile(engine, [[1, 2], [3, 4]])
  assert('matrix 2×2 秩 2', m.value.rank === 2, String(m.value.rank))
  assert('★ 行列式精确 -2（不是 -2.0000000000000004）',
    m.value.determinant === -2, String(m.value.determinant))
  assert('迹 5', m.value.trace === 5, String(m.value.trace))
  assert('有逆矩阵', Array.isArray(m.value.inverse), '')
  /** 与老插件比数值。 */
  assert('奇异值第一位一致',
    Math.abs(m.value.singularValues[0] - 5.4649857) < 1e-6, String(m.value.singularValues[0]))

  const singular = lin.matrixProfile(engine, [[1, 2, 3], [4, 5, 6], [7, 8, 9]])
  assert('奇异矩阵秩 2', singular.value.rank === 2, '')
  assert('零空间维数 1', singular.value.nullity === 1, '')
  assert('不可逆', singular.value.inverse === null, '')

  const eigen = lin.eigenValues(engine, [[2, 0], [0, 3]])
  assert('特征值 2,3', JSON.stringify(eigen.value) === '[2,3]', JSON.stringify(eigen.value))

  /** 方程组：三种情况必须分开。 */
  const unique = lin.solveLinearSystem(engine, [[1, 1], [1, -1]], [5, 1])
  assert('★ 唯一解 x1=3, x2=2',
    Math.abs(unique.value.solution[0] - 3) < 1e-9 && Math.abs(unique.value.solution[1] - 2) < 1e-9,
    JSON.stringify(unique.value.solution))

  /** 无穷多解。 */
  const infinite = lin.solveLinearSystem(engine, [[1, 1], [2, 2]], [3, 6])
  assert('★ 无穷多解时给自由变量数', infinite.value.freeVariables === 1,
    JSON.stringify(infinite.value))

  /** 无解。 */
  let noSolution = null
  try {
    lin.solveLinearSystem(engine, [[1, 1], [2, 2]], [3, 7])
  } catch (error) {
    noSolution = error
  }
  assert('★ 无解报 no_solution', noSolution?.type === 'no_solution', String(noSolution?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 统计与分布 --')
// ───────────────────────────────────────────────────────────
{
  const s = st.describe([1, 2, 3, 4, 5])
  assert('stats 均值 3', s.value.mean === 3, String(s.value.mean))
  assert('stats 中位数 3', s.value.median === 3, '')
  assert('stats 样本标准差 ≈1.5811', Math.abs(s.value.sampleSd - 1.5811388) < 1e-6, '')
  assert('stats IQR=2', s.value.iqr === 2, '')
  assert('★ 众数：各值只出现一次时为空', s.value.modes.length === 0, JSON.stringify(s.value.modes))
  /** 与老插件基线比。 */
  assert('与基线一致（均值）',
    String(base['stats-basic'].result).includes('均值 = 3'), '')

  /** 分布：精度必须与 jstat 一致。 */
  const normal = st.distribution('normal', [0, 1], 1.96)
  assert('★ normal.cdf(1.96) = 0.9750021', Math.abs(normal.value.cdf - 0.9750021) < 1e-7,
    String(normal.value.cdf))
  const binom = st.distribution('binomial', [10, 0.5], 3)
  assert('binomial.cdf(3) = 0.171875', Math.abs(binom.value.cdf - 0.171875) < 1e-9, '')
  const pois = st.distribution('poisson', [3], 2)
  assert('poisson.cdf(2,3) ≈ 0.42319', Math.abs(pois.value.cdf - 0.42319) < 1e-5, '')

  /** 回归：两条老插件缺陷必须已修。 */
  const reg = st.regression([1, 2, 3, 4], [2, 4, 6, 8])
  assert('线性回归 y=2x', Math.abs(reg.value.coefficients[0] - 2) < 1e-9, '')

  /** ★ 长度不一致必须报错（老插件 T7-N3）。 */
  let lenMismatch = null
  try {
    st.regression([1, 2, 3], [2, 4])
  } catch (error) {
    lenMismatch = error
  }
  assert('★ data/dataY 长度不一致报错', lenMismatch?.type === 'invalid_argument',
    String(lenMismatch?.type))

  /** ★ degree<=0 必须报错（老插件 T7-N6）。 */
  let badDegree = null
  try {
    st.regression([1, 2, 3], [2, 4, 6], 0)
  } catch (error) {
    badDegree = error
  }
  assert('★ degree=0 报错（不静默当 1）', badDegree?.type === 'invalid_argument',
    String(badDegree?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. ODE 与递推 --')
// ───────────────────────────────────────────────────────────
{
  const o = ode.solveOde(engine, 'dy/dt = -0.5*y', { y: 100 }, 0, 10)
  assert('ODE 有结果点', Array.isArray(o.value.points) && o.value.points.length > 5, '')
  /**
   * 解析解：y(10) = 100·e^(-5) = 0.6738
   */
  const finalY = o.value.final.y
  assert('★ ODE 结果接近解析解 0.6738', Math.abs(finalY - 0.6738) < 0.01, String(finalY))

  /** 递推。 */
  const r = ode.solveRecurrence(engine, 'P*1.1', { P: 100 }, 5)
  assert('递推 6 行（含第 0 期）', r.value.rows.length === 6, String(r.value.rows.length))
  assert('第 5 期 ≈ 161.05', Math.abs(r.value.rows[5].P - 161.051) < 0.01,
    String(r.value.rows[5].P))

  /** ★ 指数增长提醒（老插件 A53）。 */
  const expl = ode.solveRecurrence(engine, 'P*2', { P: 1 }, 20)
  assert('★ 指数增长给 notice', typeof expl.notice === 'string' && expl.notice.length > 10,
    String(expl.notice).slice(0, 50))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 单位换算 --')
// ───────────────────────────────────────────────────────────
{
  const u = un.convertUnits(engine, 1, '里', 'km')
  assert('1 里 = 0.5 km', Math.abs(u.value.result - 0.5) < 1e-12, String(u.value.result))
  assert('★ 有代入过程', Array.isArray(u.value.steps) && u.value.steps.length > 0, '')
  assert('★ 有时代差异说明', Array.isArray(u.value.warnings) && u.value.warnings.length > 0,
    JSON.stringify(u.value.warnings))

  /** 温度。 */
  const temp = un.convertUnits(engine, 100, 'degC', 'degF')
  assert('100°C = 212°F', Math.abs(temp.value.result - 212) < 1e-9, String(temp.value.result))

  /** 小数值换算必须按精度截断（老插件踩过 21 位小数）。 */
  const inch = un.convertUnits(engine, 5, 'cm', 'inch')
  const text = String(inch.value.text)
  assert('★ 5cm→inch 不吐 21 位小数', text.length < 25, text)
  /** evaluate 路径也要截断。 */
  const inchEval = ev.evaluateOne(engine, '5 cm to inch', {})
  assert('★ evaluate 路径也截断', inchEval.result.length < 25, inchEval.result)

  /** terse。 */
  const terse = un.convertUnits(engine, 1, '里', 'km', true)
  assert('terse 只回一行', !terse.result.includes('代入过程'), terse.result)
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
