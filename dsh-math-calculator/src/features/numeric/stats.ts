/**
 * 统计与分布（stats / dist / regression）。
 *
 * ## 用 jstat（阶段 2 已选定）
 *
 * 六个分布 CDF 全走 `jstat`。**这不是可选项** —— 阶段 2 发现老插件
 * 手写的 t 分布 CDF **用错了数学函数**（用 Gamma 代替 Beta）：
 *
 * ```
 *   t=0, df=10   旧实现给 0.000086   正确 0.5      ← 对称中心都不是 0.5
 *   t=2, df=10   旧实现给 0.999982   正确 0.963306  ← 差 3.7%
 * ```
 *
 * ## 描述统计自己算
 *
 * 均值/中位/方差这些不复杂，而 `jstat` 的接口与我们的返回结构不匹配。
 * 但**分位数**必须小心 —— `jstat.percentile` 返回数组，与直觉不同。
 *
 * @module dsh-math-calculator/features/numeric/stats
 */

import jstat from 'jstat'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT, magnitudeOf } from '../../core/format.js'
import { normalCdf, studentTCdf, chiSquareCdf, binomialCdf, poissonCdf, exponentialCdf } from '../../core/stats.js'

/** 统计结果。 */
export interface StatsOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 把一个数格式成「人读」的形式。 */
const show = (v: number): string => fmtNumber(v, FMT.general)

/**
 * 描述统计。
 *
 * @param data - 数值数组
 * @returns 结果
 */
export function describe(data: unknown): StatsOutcome {
  if (!Array.isArray(data) || data.length === 0) {
    throw new CalcError('invalid_argument', 'data 要非空数值数组', '例如 [1,2,3,4,5]。')
  }
  const values = (data as unknown[]).map((v) => Number(v))
  const bad = values.findIndex((v) => !Number.isFinite(v))
  if (bad >= 0) {
    throw new CalcError(
      'invalid_argument',
      '第 ' + (bad + 1) + ' 个数不是有限数（收到 ' + String((data as unknown[])[bad]) + '）',
      'data 里每个元素都应是数字。',
    )
  }

  const n = values.length
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((s, v) => s + v, 0)
  const mean = sum / n

  /** 中位数。 */
  const median = n % 2 === 1
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2

  /** 众数（可能多个）。 */
  const freq = new Map<number, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  const maxFreq = Math.max(...freq.values())
  const modes = maxFreq > 1 ? [...freq.entries()].filter(([, c]) => c === maxFreq).map(([v]) => v).sort((a, b) => a - b) : []

  /** 方差：样本用 n-1，总体用 n。 */
  const ss = values.reduce((s, v) => s + (v - mean) ** 2, 0)
  const sampleVariance = n > 1 ? ss / (n - 1) : 0
  const populationVariance = ss / n
  const sampleSd = Math.sqrt(sampleVariance)
  const populationSd = Math.sqrt(populationVariance)

  /** 分位数（线性插值，与 R 的 type 7 一致）。 */
  const quantile = (p: number): number => {
    if (n === 1) return values[0]
    const pos = (n - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
  }

  const q1 = quantile(0.25)
  const q3 = quantile(0.75)
  const iqr = q3 - q1

  /** 偏度与峰度（超额）。 */
  const m2 = populationVariance
  const m3 = values.reduce((s, v) => s + (v - mean) ** 3, 0) / n
  const m4 = values.reduce((s, v) => s + (v - mean) ** 4, 0) / n
  const skewness = m2 > 0 ? m3 / m2 ** 1.5 : 0
  const kurtosis = m2 > 0 ? m4 / m2 ** 2 - 3 : 0

  const lines: string[] = []
  lines.push('样本量 n = ' + n)
  lines.push('均值 = ' + show(mean))
  lines.push('中位数 = ' + show(median))
  lines.push('众数 = ' + (modes.length === 0 ? '（无，各值都只出现一次）' : modes.map(show).join(', ')))
  lines.push('标准差(样本) = ' + show(sampleSd))
  lines.push('方差(样本) = ' + show(sampleVariance))
  lines.push('标准差(总体) = ' + show(populationSd))
  lines.push('极差 = ' + show(sorted[n - 1] - sorted[0]))
  lines.push('Q1 = ' + show(q1) + '，Q3 = ' + show(q3) + '，IQR = ' + show(iqr))
  lines.push('偏度 = ' + show(skewness) + '，峰度(超额) = ' + show(kurtosis))

  /**
   * 小样本提醒 —— 这是实测需求：n=3 时算偏度毫无意义，但工具不提醒的话
   * 用户会把它当真。
   */
  if (n < 8) {
    lines.push('')
    lines.push('⚠ 样本量 ' + n + ' 偏小：偏度/峰度在 n<8 时不稳定，仅供参考。')
  }

  return {
    result: lines.join('\n'),
    value: {
      n, mean, median,
      modes,
      sampleSd, sampleVariance, populationSd, populationVariance,
      range: sorted[n - 1] - sorted[0],
      q1, q3, iqr,
      skewness, kurtosis,
      sum,
    },
  }
}

/** 支持的分布。 */
const DISTRIBUTIONS = new Set(['normal', 'binomial', 'poisson', 'exponential', 'chisquare', 't'])

/**
 * 概率分布。
 *
 * @param distribution - 分布名
 * @param params - 参数
 * @param x - 取值
 * @param displayPrecision - 显示精度
 * @returns 结果
 */
export function distribution(
  distribution: string,
  params: unknown,
  x: number,
  displayPrecision = 8,
): StatsOutcome {
  if (!DISTRIBUTIONS.has(distribution)) {
    throw new CalcError(
      'invalid_argument',
      '不支持的分布「' + distribution + '」',
      '可用：' + [...DISTRIBUTIONS].join(' / '),
    )
  }
  const p = Array.isArray(params) ? (params as unknown[]).map((v) => Number(v)) : []

  /** 每种分布的必需参数个数。 */
  const NEEDED: Record<string, number> = {
    normal: 2, binomial: 2, poisson: 1, exponential: 1, chisquare: 1, t: 1,
  }
  if (p.length < NEEDED[distribution]) {
    throw new CalcError(
      'missing_params',
      distribution + ' 需要 ' + NEEDED[distribution] + ' 个参数，收到 ' + p.length,
      'normal:[μ,σ]、binomial:[n,p]、poisson:[λ]、exponential:[λ]、chisquare:[df]、t:[df]',
    )
  }

  let pdf: number
  let cdf: number
  const lines: string[] = []

  switch (distribution) {
    case 'normal': {
      const [mu, sigma] = p
      if (sigma <= 0) {
        throw new CalcError('invalid_argument', '标准差必须大于 0（收到 ' + sigma + '）', 'normal 参数是 [均值, 标准差]。')
      }
      const z = (x - mu) / sigma
      pdf = Math.exp(-(z * z) / 2) / (sigma * Math.sqrt(2 * Math.PI))
      cdf = normalCdf(z)
      lines.push('z = ' + show(z))
      break
    }
    case 'binomial': {
      const [n, prob] = p
      if (prob < 0 || prob > 1) {
        throw new CalcError('invalid_argument', 'p 必须在 [0,1]（收到 ' + prob + '）', 'binomial 参数是 [试验次数, 成功概率]。')
      }
      pdf = jstat.binomial.pdf(x, n, prob)
      cdf = binomialCdf(x, n, prob)
      break
    }
    case 'poisson': {
      const [lambda] = p
      if (lambda <= 0) {
        throw new CalcError('invalid_argument', 'λ 必须大于 0', 'poisson 参数是 [λ]。')
      }
      pdf = jstat.poisson.pdf(x, lambda)
      cdf = poissonCdf(x, lambda)
      break
    }
    case 'exponential': {
      const [rate] = p
      if (rate <= 0) {
        throw new CalcError('invalid_argument', 'λ 必须大于 0', 'exponential 参数是 [λ]。')
      }
      pdf = x < 0 ? 0 : rate * Math.exp(-rate * x)
      cdf = exponentialCdf(x, rate)
      break
    }
    case 'chisquare': {
      const [df] = p
      pdf = x <= 0 ? 0 : jstat.chisquare.pdf(x, df)
      cdf = chiSquareCdf(x, df)
      break
    }
    case 't': {
      const [df] = p
      pdf = jstat.studentt.pdf(x, df)
      cdf = studentTCdf(x, df)
      break
    }
    default:
      throw new CalcError('invalid_argument', '未实现的分布', '')
  }

  const cut = (v: number): string => {
    const text = Number(v.toFixed(displayPrecision))
    return String(text)
  }

  lines.push('PDF = ' + cut(pdf))
  lines.push('CDF = P(X ≤ ' + show(x) + ') = ' + cut(cdf))
  lines.push('P(X > ' + show(x) + ') = ' + cut(1 - cdf))

  return {
    result: lines.join('\n'),
    value: { distribution, params: p, x, pdf, cdf, upperTail: 1 - cdf },
  }
}

/**
 * 回归。
 *
 * @param data - 自变量 X
 * @param dataY - 因变量 Y
 * @param degree - 次数（1=线性）
 * @returns 结果
 */
export function regression(data: unknown, dataY: unknown, degree = 1): StatsOutcome {
  if (!Array.isArray(data) || !Array.isArray(dataY)) {
    throw new CalcError('invalid_argument', 'data 与 dataY 都要数值数组', '例如 data:[1,2,3], dataY:[2,4,6]。')
  }
  const xs = (data as unknown[]).map((v) => Number(v))
  const ys = (dataY as unknown[]).map((v) => Number(v))

  /**
   * ## ★ 长度必须相等 —— 老插件的缺陷 T7-N3
   *
   * 不等时旧实现静默截断到较短的那个，算出一个**看起来正常**的结果。
   */
  if (xs.length !== ys.length) {
    throw new CalcError(
      'invalid_argument',
      'data 长度 ' + xs.length + ' 与 dataY 长度 ' + ys.length + ' 不一致',
      '回归需要成对的 (x, y)，两组长度必须相同。',
    )
  }
  if (xs.length < 2) {
    throw new CalcError('invalid_argument', '至少需要 2 个点才能回归（收到 ' + xs.length + '）', '')
  }
  /**
   * ## `degree` 必须校验 —— 老插件的缺陷 T7-N6
   *
   * 旧实现把 `degree<=0` 静默当 1，用户写 `degree:0` 会得到线性回归。
   */
  if (!Number.isInteger(degree) || degree < 1) {
    throw new CalcError(
      'invalid_argument',
      'degree 必须是 ≥1 的整数（收到 ' + degree + '）',
      '线性回归用 degree:1，二次用 degree:2。',
    )
  }
  if (degree >= xs.length) {
    throw new CalcError(
      'invalid_argument',
      'degree ' + degree + ' 太大：' + xs.length + ' 个点最多拟合 ' + (xs.length - 1) + ' 次',
      '点数必须严格大于多项式次数。',
    )
  }

  /**
   * 拟合：用最小二乘正规方程（mathjs 已做）。
   *
   * 这里手写而不是调 jstat —— `jstat` 不提供多项式回归。
   */
  const n = xs.length
  /** 构造范德蒙矩阵。 */
  const design: number[][] = xs.map((x) => {
    const row: number[] = []
    for (let d = 0; d <= degree; d += 1) row.push(x ** (degree - d))
    return row
  })

  /** 正规方程： (AᵀA) β = Aᵀy。 */
  const at: number[][] = []
  for (let i = 0; i <= degree; i += 1) {
    at.push(design.map((row) => row[i]))
  }
  const ata: number[][] = at.map((rowA) => {
    const out: number[] = []
    for (let j = 0; j <= degree; j += 1) {
      let sum = 0
      for (let k = 0; k < n; k += 1) sum += rowA[k] * at[j][k]
      out.push(sum)
    }
    return out
  })
  const aty: number[] = at.map((rowA) => rowA.reduce((s, v, k) => s + v * ys[k], 0))

  /** 高斯消元（带部分主元）。 */
  const coeffs = gaussianSolve(ata, aty)
  if (coeffs === null) {
    throw new CalcError('singular', '正规方程奇异，无法拟合（点可能重复或共线）', '检查 data 里是否有重复的 x 值。')
  }

  /** R² 与 R。 */
  const yMean = ys.reduce((s, v) => s + v, 0) / n
  const ssTot = ys.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const predicted = xs.map((x) => coeffs.reduce((s, c, i) => s + c * x ** (degree - i), 0))
  const ssRes = ys.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0)
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1
  const r = Math.sign(coeffs[0] || 1) * Math.sqrt(Math.max(0, rSquared))

  /** 正文。 */
  const lines: string[] = []
  if (degree === 1) {
    lines.push('线性回归：y = ' + show(coeffs[0]) + '·x + (' + show(coeffs[1]) + ')')
  } else {
    const terms = coeffs.map((c, i) => {
      const power = degree - i
      if (power === 0) return '(' + show(c) + ')'
      if (power === 1) return show(c) + '·x'
      return show(c) + '·x^' + power
    })
    lines.push(degree + ' 次回归：y = ' + terms.join(' + '))
  }
  lines.push('R = ' + show(r) + '，R² = ' + show(rSquared) + '，n = ' + n)

  return {
    result: lines.join('\n'),
    value: { coefficients: coeffs, r, rSquared, n, degree },
  }
}

/**
 * 高斯消元解线性系统（带部分主元）。
 *
 * @param a - 系数矩阵（方阵）
 * @param b - 右端向量
 * @returns 解；奇异返回 null
 */
function gaussianSolve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col += 1) {
    /** 部分主元：选该列绝对值最大的行。 */
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      const tmp = m[pivot]
      m[pivot] = m[col]
      m[col] = tmp
    }
    /** 消元。 */
    for (let row = col + 1; row < n; row += 1) {
      const factor = m[row][col] / m[col][col]
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k]
    }
  }

  /** 回代。 */
  const x = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = m[row][n]
    for (let k = row + 1; k < n; k += 1) sum -= m[row][k] * x[k]
    x[row] = sum / m[row][row]
  }
  return x
}

/**
 * 量级参考（供 evaluate 的可信度标注用）。
 *
 * @param value - 数值
 * @returns 量级
 */
export { magnitudeOf }
