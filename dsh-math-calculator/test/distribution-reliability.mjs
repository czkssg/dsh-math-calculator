/**
 * 分布矩与可靠性（第五批）11 条。
 *
 * ## 为什么这批值得单独成批
 *
 * `dist` operation 只支持 normal / binomial / poisson / exponential 四种，
 * 而工程上最常用的 Weibull、对数正态、卡方**连基本矩都算不出来**。
 * 这批补的正是「这个分布长什么样」（均值/方差/失效率），
 * 与 dist 的「某点上的概率」形成分工：先判分布，再算点值。
 *
 * ## 本套的核心断言：Weibull 的 k 必须真的改变方向
 *
 * 这是本批唯一有「物理意义」的地方 —— 失效率 h(t) 的增减方向完全由 k 决定。
 * 如果实现把 (t/λ)^(k−1) 写成 (t/λ)^k 或漏掉，方向性会立刻破。
 * 所以断言不验单个数值，而是**验三种 k 下的方向各不相同**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-dist-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-6)
const rel = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol

console.log('-- 1. Weibull：λ 时恰好 36.8% 存活（定义）--')
{
  /**
   * ★ 这是 Weibull 的**定义性断言**：t=λ 时 R=e⁻¹=0.367879，与 k 无关。
   * 若不成立，说明 (t/λ)^k 的形式写错了。
   */
  for (const k of [1, 2, 3, 5]) {
    const r = await num('weibull_reliability', { shape: k, scale: 1000, time: 1000 })
    assert(`k=${k} 时 t=λ → 36.79%`, close(r, 0.367879, 1e-5), String(r))
  }
  /** 具体点：k=2、t=500 → 77.88%；t=1500 → 10.54% */
  assert('k=2,t=500h → 77.9%', close(await num('weibull_reliability', { shape: 2, scale: 1000, time: 500 }), 0.778801, 1e-5))
  assert('k=2,t=1500h → 10.5%', close(await num('weibull_reliability', { shape: 2, scale: 1000, time: 1500 }), 0.105399, 1e-5))
  /** ★ 单调递减：时间越久，存活越少。 */
  const t1 = await num('weibull_reliability', { shape: 2, scale: 1000, time: 300 })
  const t2 = await num('weibull_reliability', { shape: 2, scale: 1000, time: 900 })
  assert('时间越久存活越少', t2 < t1, t2.toFixed(3) + ' < ' + t1.toFixed(3))
}

console.log('-- 2. Weibull 失效率：k 决定「越用越坏」还是「越用越好」--')
{
  /**
   * ★★ 本套最重要的一条：三种 k 下 h(t) 随时间的方向必须各不相同。
   *
   *   k<1  → 递减（早期失效，磨合后稳定）
   *   k=1  → 恒定（随机失效，无记忆）
   *   k>1  → 递增（磨损失效，越老越脆）
   *
   * 这条断言同时守住三件事：指数是 k−1、分母是 λ、方向没写反。
   */
  const hEarly1 = await num('weibull_failure_rate', { shape: 0.5, scale: 1000, time: 100 })
  const hEarly2 = await num('weibull_failure_rate', { shape: 0.5, scale: 1000, time: 1000 })
  assert('k=0.5 → 失效率递减（早期失效）', hEarly2 < hEarly1, hEarly2.toExponential(2) + ' < ' + hEarly1.toExponential(2))

  const hRand1 = await num('weibull_failure_rate', { shape: 1, scale: 1000, time: 100 })
  const hRand2 = await num('weibull_failure_rate', { shape: 1, scale: 1000, time: 10000 })
  assert('k=1 → 失效率恒定（无记忆）', close(hRand1, hRand2), hRand1.toExponential(3) + ' = ' + hRand2.toExponential(3))
  /** k=1 时失效率应恰好 = 1/λ = 0.001 */
  assert('k=1 → h = 1/λ', close(hRand1, 0.001, 1e-9), String(hRand1))

  const hWear1 = await num('weibull_failure_rate', { shape: 2, scale: 1000, time: 500 })
  const hWear2 = await num('weibull_failure_rate', { shape: 2, scale: 1000, time: 2000 })
  assert('k=2 → 失效率递增（磨损）', hWear2 > hWear1, hWear2 + ' > ' + hWear1)
  /** 具体值：k=2、λ=1000、t=1000 → h=2/1000=0.002 */
  assert('k=2,t=λ → h=0.002', close(await num('weibull_failure_rate', { shape: 2, scale: 1000, time: 1000 }), 0.002))
}

console.log('-- 3. Weibull 均值：λ 不是均值 --')
{
  /** k=1 时 Γ(1+1)=1，均值才等于 λ */
  assert('k=1 → 均值 = λ', close(await num('weibull_mean_life', { scale: 1000, gamma_factor: 1 }), 1000))
  /** k=2 时 Γ(1.5)=0.8862 → 均值 886h（比 λ 小） */
  assert('k=2 → 均值 886h（< λ）', close(await num('weibull_mean_life', { scale: 1000, gamma_factor: 0.8862 }), 886.2, 0.05))
  /**
   * ★ 核心概念：**均值永远 < 特征寿命 λ**（因为 Γ(1+1/k) < 1 对所有 k>0 成立）。
   * 这是最容易被混的一处 —— 「λ 是 63.2% 失效时的寿命」不是平均值。
   */
  const meanK5 = await num('weibull_mean_life', { scale: 1000, gamma_factor: 0.9182 })
  assert('k=5 均值仍 < λ', meanK5 < 1000, meanK5 + ' < 1000')
}

console.log('-- 4. 对数正态：均值被 σ² 放大 --')
{
  assert('μ=0,σ=1 → 均值 1.6487', close(await num('lognormal_mean', { mu: 0, sigma: 1 }), 1.648721, 1e-5))
  assert('μ=0,σ=2 → 均值 7.389', close(await num('lognormal_mean', { mu: 0, sigma: 2 }), 7.389056, 1e-5))
  /** ★ σ→0 时退化为常数 exp(μ)（无离散度）。 */
  assert('σ=0 → 均值 = exp(μ)', close(await num('lognormal_mean', { mu: 1, sigma: 0 }), Math.E, 1e-6))

  /**
   * ★★ 均值/中位比 = exp(σ²/2)，且**必然 ≥ 1** —— 这就是右偏的定义。
   * 若写成 exp(−σ²/2) 会得到 <1（左偏），断言立刻红。
   */
  assert('σ=1 → 均值是中位的 1.65 倍', close(await num('lognormal_median_vs_mean', { sigma: 1 }), 1.648721, 1e-5))
  assert('σ=1.5 → 3.08 倍', close(await num('lognormal_median_vs_mean', { sigma: 1.5 }), 3.080217, 1e-5))
  const r05 = await num('lognormal_median_vs_mean', { sigma: 0.5 })
  const r20 = await num('lognormal_median_vs_mean', { sigma: 2 })
  assert('σ 越大越右偏（比值 >1 且递增）', r05 > 1 && r20 > r05, r05.toFixed(3) + ' → ' + r20.toFixed(2))

  /** 方差：σ=1 → 4.671；σ=2 → 2926.4（涨 627 倍，而均值只涨 4.5 倍） */
  assert('μ=0,σ=1 → Var 4.671', close(await num('lognormal_variance', { mu: 0, sigma: 1 }), 4.670774, 1e-5))
  assert('μ=0,σ=2 → Var 2926.4', close(await num('lognormal_variance', { mu: 0, sigma: 2 }), 2926.36, 0.01))
  /** ★ 方差比均值敏感得多：σ 1→2，均值 ×4.48，方差 ×627。 */
  const meanRatio = (await num('lognormal_mean', { mu: 0, sigma: 2 })) / (await num('lognormal_mean', { mu: 0, sigma: 1 }))
  const varRatio = (await num('lognormal_variance', { mu: 0, sigma: 2 })) / (await num('lognormal_variance', { mu: 0, sigma: 1 }))
  assert('方差比均值敏感得多', varRatio > meanRatio * 100, '方差 ×' + varRatio.toFixed(0) + ' vs 均值 ×' + meanRatio.toFixed(2))
}

console.log('-- 5. 泊松与二项：均值和方差的关系 --')
{
  assert('λ=0.5/天、t=30 → 15', close(await num('poisson_mean_variance', { rate: 0.5, time_interval: 30 }), 15))
  /** ★ 线性：时间翻倍，期望翻倍。 */
  const d1 = await num('poisson_mean_variance', { rate: 0.5, time_interval: 10 })
  const d2 = await num('poisson_mean_variance', { rate: 0.5, time_interval: 20 })
  assert('区间翻倍 → 期望翻倍', close(d2 / d1, 2, 1e-9), (d2 / d1).toFixed(3))

  assert('n=100,p=0.5 → 50', close(await num('binomial_mean_variance', { trials: 100, probability: 0.5 }), 50))
  /** ★ 线性于 n。 */
  const b1 = await num('binomial_mean_variance', { trials: 100, probability: 0.3 })
  const b2 = await num('binomial_mean_variance', { trials: 300, probability: 0.3 })
  assert('n×3 → 均值×3', close(b2 / b1, 3, 1e-9), (b2 / b1).toFixed(3))

  /** 指数分布：λ=0.001/h → 均值 1000h */
  assert('λ=0.001 → 1000h', close(await num('exponential_mean_life', { rate: 0.001 }), 1000))
  /** ★ 反比：率翻倍，寿命减半。 */
  const e1 = await num('exponential_mean_life', { rate: 0.001 })
  const e2 = await num('exponential_mean_life', { rate: 0.002 })
  assert('率翻倍 → 寿命减半', close(e1 / e2, 2, 1e-9), (e1 / e2).toFixed(3))

  /** 卡方：E = k */
  assert('自由度 10 → 均值 10', close(await num('chi_square_mean_variance', { degrees_of_freedom: 10 }), 10))
  assert('自由度 100 → 均值 100', close(await num('chi_square_mean_variance', { degrees_of_freedom: 100 }), 100))
}

console.log('-- 6. 变异系数：跨单位比较的唯一办法 --')
{
  assert('σ=5,μ=100 → CV=0.05', close(await num('coefficient_of_variation', { standard_deviation: 5, mean: 100 }), 0.05))
  assert('σ=40,μ=100 → CV=0.4', close(await num('coefficient_of_variation', { standard_deviation: 40, mean: 100 }), 0.4, 1e-9))
  /**
   * ★★ 核心性质：**同一相对离散度在不同量级上给出相同 CV**。
   *   50±5 与 500±50 都是 CV=0.1。
   * 这条守的是「除掉了量纲」这件事 —— 若写成 σ·μ 或 σ+μ 会立刻破。
   */
  const small = await num('coefficient_of_variation', { standard_deviation: 5, mean: 50 })
  const big = await num('coefficient_of_variation', { standard_deviation: 50, mean: 500 })
  assert('50±5 与 500±50 的 CV 相同', close(small, big), small + ' vs ' + big)
  assert('两者都等于 0.1', close(small, 0.1), String(small))
}

console.log('-- 7. 元信息与入库完整性 --')
{
  const ids = [
    'weibull_mean_life', 'weibull_failure_rate', 'weibull_reliability',
    'lognormal_mean', 'lognormal_median_vs_mean', 'lognormal_variance',
    'poisson_mean_variance', 'binomial_mean_variance', 'exponential_mean_life',
    'chi_square_mean_variance', 'coefficient_of_variation',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 11 条全部入库', missing.length === 0, missing.join(','))

  let noUnit = [], noKeys = [], noCaveat = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!f.unit) noUnit.push(id)
    if (!Array.isArray(f.keys) || f.keys.length < 3) noKeys.push(id)
    if (!/⚠/.test(f.desc || '')) noCaveat.push(id)
  }
  assert('都有单位', noUnit.length === 0, noUnit.join(','))
  assert('都有 ≥3 关键词', noKeys.length === 0, noKeys.join(','))
  assert('都标了局限（⚠）', noCaveat.length === 0, noCaveat.join(','))

  /** 表达式不用 ln / Γ（本库无这两个函数）。 */
  const badFn = ids.filter((id) => /\bln\s*\(|\bgamma\s*\(/.test(fm.FORMULA_INDEX.get(id)?.expr ?? ''))
  assert('不用 ln / gamma（库内无此函数）', badFn.length === 0, badFn.join(','))

  assert('公式总数 ≥ 596', fm.FORMULAS.length >= 596, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
