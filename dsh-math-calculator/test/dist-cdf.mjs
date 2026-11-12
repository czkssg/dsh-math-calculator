/**
 * 分布 CDF 的正确性测试。
 *
 * ## 为什么要单独一套
 *
 * 2026-11-12 重构时（手写 → jstat）发现 **t 分布的 CDF 一直是错的**：
 * 旧实现用了正则化不完全 Gamma（`regularizedGammaP`），
 * 而 t 分布需要的是**不完全 Beta**。这不是精度问题，是公式用错了函数。
 *
 * 错误幅度大到荒谬：
 *
 * ```
 *   t=0,  df=10   旧给 0.000086   正确 0.5        ← 对称中心居然不是 0.5
 *   t=1,  df=10   旧给 0.999945   正确 0.829553   ← 差 17%
 *   t=2,  df=10   旧给 0.999982   正确 0.963306   ← 差 3.7%
 * ```
 *
 * **反馈包 348 条原始记录里完全没报过这条** —— 说明单靠人工实测，
 * 这类"数学公式本身错了但输出看着合理"的缺陷很难被发现
 * （0.999982 看起来很像个 CDF 值）。
 *
 * ## 本套件守什么
 *
 *   ① 每个分布用**独立真值**核对（不拿实现自己当标准）
 *   ② 关键点用**解析已知值**（t(0)=0.5、normal(0)=0.5、chi² 中位数）
 *   ③ 边界行为（k<0、k>=n、x<=0）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-dist-'))
process.env.DSH_MATH_CALC_HOME = home

const stats = await import(pathToFileURL(join(root, 'lib/stats.js')).href)

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

/** 近似相等（绝对容差）。 */
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ t 分布：修掉「用错函数」的老 bug --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 对称中心必须是 0.5。旧实现给 0.000086 —— 这一条就能抓住那个 bug，
   * 而且不需要任何外部真值，只靠**分布的定义性质**。
   */
  assert('★ t(0, 10) = 0.5（对称中心）', near(stats.studentTCdf(0, 10), 0.5, 1e-12),
    String(stats.studentTCdf(0, 10)))
  /**
   * df 小的时候 jstat 自身有 ~1e-8 的误差（它用不完全 Beta 的连分式，
   * 收敛判据是相对的）。**这不影响用途** —— 统计判定从来不用第 9 位小数。
   * 所以这里容差取 1e-7，而不是追求 1e-15。
   */
  assert('★ t(0, 1) = 0.5', near(stats.studentTCdf(0, 1), 0.5, 1e-7),
    String(stats.studentTCdf(0, 1)))
  assert('★ t(0, 100) = 0.5', near(stats.studentTCdf(0, 100), 0.5, 1e-7),
    String(stats.studentTCdf(0, 100)))

  /** 对称性：CDF(-t) = 1 - CDF(t)。 */
  for (const [t, df] of [[1, 10], [2, 10], [1.96, 100], [3, 30]]) {
    const a = stats.studentTCdf(t, df)
    const b = stats.studentTCdf(-t, df)
    assert(`t 分布对称性 t=${t}, df=${df}`, near(a + b, 1, 1e-12), `${a} + ${b} = ${a + b}`)
  }

  /** 独立真值（用 jstat 之外的方法核对：查表值）。 */
  const TABLE = [
    [1, 10, 0.8295534],
    [2, 10, 0.9633059],
    [2.228, 10, 0.9749941],
    [1.96, 100, 0.9736106],
  ]
  for (const [t, df, expect] of TABLE) {
    const actual = stats.studentTCdf(t, df)
    assert(`t(${t}, ${df}) ≈ ${expect}`, Math.abs(actual - expect) < 1e-6, String(actual))
  }

  /**
   * 大 t 时尾部要准（旧实现的 `1-p` 在这里灾难性相消）。
   * t(10, 10) 的真值约 0.99999882。
   */
  const tail = stats.studentTCdf(10, 10)
  assert('t(10, 10) 尾部仍准', Math.abs(tail - 0.9999988) < 1e-6, String(tail))
  assert('尾部不等于 1（未溢出）', tail < 1, String(tail))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 正态分布精度（旧实现受手写 erf 的 1e-7 限制）--')
// ───────────────────────────────────────────────────────────
{
  assert('normalCdf(0) = 0.5', near(stats.normalCdf(0), 0.5, 1e-15), String(stats.normalCdf(0)))
  /** 1.96 是 95% 双侧的临界值，CDF 应为 0.9750021048517795。 */
  assert('normalCdf(1.96) 精确到 1e-15', near(stats.normalCdf(1.96), 0.9750021048517795, 1e-15),
    String(stats.normalCdf(1.96)))
  assert('normalCdf(3) 精确', near(stats.normalCdf(3), 0.9986501019683699, 1e-15),
    String(stats.normalCdf(3)))
  /** 对称性。 */
  for (const z of [0.5, 1, 1.96, 3]) {
    assert(`正态对称性 z=${z}`, near(stats.normalCdf(z) + stats.normalCdf(-z), 1, 1e-15), '')
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 其余分布 --')
// ───────────────────────────────────────────────────────────
{
  /** 卡方 df=1 的 CDF(3.8415) ≈ 0.95。 */
  assert('chi2(3.8415, 1) ≈ 0.95', Math.abs(stats.chiSquareCdf(3.8415, 1) - 0.95) < 1e-4,
    String(stats.chiSquareCdf(3.8415, 1)))
  assert('chi2(0, k) = 0', stats.chiSquareCdf(0, 3) === 0, String(stats.chiSquareCdf(0, 3)))

  /** 泊松 λ=3 的 CDF(2) ≈ 0.42319008。 */
  assert('poisson(2, 3) ≈ 0.42319008', near(stats.poissonCdf(2, 3), 0.4231900811268435, 1e-14),
    String(stats.poissonCdf(2, 3)))

  /** 二项 n=10 p=0.5 的 CDF(3) = (1+10+45+120)/1024 = 0.171875（精确有理数）。 */
  assert('binomial(3, 10, 0.5) = 0.171875（精确）', near(stats.binomialCdf(3, 10, 0.5), 0.171875, 1e-15),
    String(stats.binomialCdf(3, 10, 0.5)))

  /** 指数分布 CDF(x) = 1-e^(-λx)，λ=1 时 CDF(1) = 1-e^-1。 */
  assert('exponential(1, 1) = 1-e^-1', near(stats.exponentialCdf(1, 1), 1 - Math.exp(-1), 1e-15),
    String(stats.exponentialCdf(1, 1)))
  assert('exponential 负 x 为 0', stats.exponentialCdf(-1, 1) === 0, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 边界行为（不许崩、不许给荒谬值）--')
// ───────────────────────────────────────────────────────────
{
  /** t 分布 df 很小时尾部极厚，仍要给出 (0,1) 内的值。 */
  for (const df of [1, 2, 3]) {
    const v = stats.studentTCdf(5, df)
    assert(`t(5, ${df}) 在 (0,1) 内`, v > 0 && v < 1, String(v))
  }
  /** 负 k 的二项/泊松 CDF 必须是 0。 */
  assert('binomialCdf(-1, 10, 0.5) = 0', stats.binomialCdf(-1, 10, 0.5) === 0, '')
  assert('poissonCdf(-1, 3) = 0', stats.poissonCdf(-1, 3) === 0, '')
  /** k >= n 的二项 CDF 必须是 1。 */
  assert('binomialCdf(10, 10, 0.5) = 1', stats.binomialCdf(10, 10, 0.5) === 1,
    String(stats.binomialCdf(10, 10, 0.5)))
  assert('binomialCdf(20, 10, 0.5) = 1', stats.binomialCdf(20, 10, 0.5) === 1, '')
  /** 所有 CDF 都该单调不减。 */
  let monotone = true
  let prev = -1
  for (let x = -4; x <= 4; x += 0.25) {
    const v = stats.normalCdf(x)
    if (v < prev - 1e-15) monotone = false
    prev = v
  }
  assert('normalCdf 单调不减', monotone, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 保留手写的部分仍然正确 --')
// ───────────────────────────────────────────────────────────
{
  /** logGamma：Γ(5)=24 → ln(24)。 */
  assert('logGamma(5) = ln(24)', near(stats.logGamma(5), Math.log(24), 1e-12),
    String(stats.logGamma(5)))
  assert('logGamma(1) = 0', near(stats.logGamma(1), 0, 1e-12), String(stats.logGamma(1)))
  /**
   * erf 仍是手写的 Abramowitz-Stegun 7.1.26 近似，**精度只有 ~1e-7**。
   *
   * 为什么不换成 jstat：jstat 不导出 erf。而它现在**只被 `normalPdf` 之外
   * 的地方用到**（CDF 已全走 jstat），所以 1e-7 够用。
   * 若将来有地方需要高精度 erf，该引 `@stdlib/math-base-special-erf`。
   */
  assert('erf(0) ≈ 0（手写近似，容差 1e-7）', Math.abs(stats.erf(0)) < 1e-7, String(stats.erf(0)))
  /**
   * ⚠ 参考值要用**真值 erf(3) = 0.9999779095030014**，不是 1。
   * 我第一版写成「≈1」结果断言失败 —— 那不是实现的错，是我把极限值当成了函数值。
   * erf(x)→1 只在 x→∞ 时成立，x=3 时还差 2.2e-5。
   */
  assert('erf(3) ≈ 0.9999779095（手写近似，容差 1e-6）',
    Math.abs(stats.erf(3) - 0.9999779095030014) < 1e-6, String(stats.erf(3)))
  /** 二项系数是精确整数，不能走浮点。 */
  assert('binomialCoefficient(10,3) = 120', stats.binomialCoefficient(10, 3) === 120,
    String(stats.binomialCoefficient(10, 3)))
  assert('binomialCoefficient(20,10) = 184756', stats.binomialCoefficient(20, 10) === 184756,
    String(stats.binomialCoefficient(20, 10)))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
