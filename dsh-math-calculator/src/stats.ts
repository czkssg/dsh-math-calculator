/**
 * 数值统计、概率分布与回归。
 *
 * mathjs 没有分布对象（`normalDist` 是 undefined），也没有回归函数，
 * 所以这三块自己实现。全部用 BigNumber 友好的方式：内部用 Number 计算概率，
 * 需要精确累加时不走这条路。
 *
 * @module dsh-math-calculator/stats
 */

/** 用 Lanczos 近似算 log Γ(x)，用于大阶乘与分布归一化。 */
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** log Γ(x)：Lanczos 近似，x<0.5 时用反射公式避免精度损失。 */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // 反射公式
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  }
  const z = x - 1
  let a = 0.99999999999980993
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1)
  const t = z + LANCZOS.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** 误差函数 erf(x)，Abramowitz-Stegun 7.1.26（精度 ~1e-7）。 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** 标准正态分布 CDF。 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

/** 标准正态分布 PDF。 */
export function normalPdf(z: number): number {
  return Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)
}

/**
 * 正态分布分位数的反函数（Acklam 有理逼近）。
 * 用于给定置信水平求临界值，例如 95% → 1.959963984540054。
 */
export function normalInv(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity
    if (p === 1) return Infinity
    return Number.NaN
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** 组合数 C(n, k)，用对数避免溢出后转回。 */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  const kk = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= kk; i += 1) {
    result = (result * (n - kk + i)) / i
  }
  return Math.round(result)
}

/** 二项分布 PMF。 */
export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0
  return binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k)
}

/** 二项分布 CDF。 */
export function binomialCdf(k: number, n: number, p: number): number {
  let total = 0
  for (let i = 0; i <= Math.floor(k); i += 1) total += binomialPmf(i, n, p)
  return total
}

/** 泊松分布 PMF。 */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0) return 0
  return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1))
}

/** 泊松分布 CDF。 */
export function poissonCdf(k: number, lambda: number): number {
  let total = 0
  for (let i = 0; i <= Math.floor(k); i += 1) total += poissonPmf(i, lambda)
  return total
}

/** 指数分布 CDF / PDF。 */
export function exponentialCdf(x: number, rate: number): number {
  if (x < 0) return 0
  return 1 - Math.exp(-rate * x)
}
/** 指数分布密度 f(x)=λe^{-λx}（x<0 时为 0）；λ 是单位时间发生率。 */
export function exponentialPdf(x: number, rate: number): number {
  if (x < 0) return 0
  return rate * Math.exp(-rate * x)
}

/** 卡方分布 CDF（用正则化下不完全 Gamma，级数展开）。 */
export function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0
  return regularizedGammaP(df / 2, x / 2)
}

/** 正则化下不完全 Gamma P(a, x)。 */
export function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return Number.NaN
  if (x === 0) return 0
  if (x < a + 1) {
    // 级数展开
    let sum = 1 / a
    let term = sum
    let n = a
    for (let i = 0; i < 500; i += 1) {
      n += 1
      term *= x / n
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
  }
  // 连分式
  const FPMIN = 1e-300
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 500; i += 1) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
}

/** 学生 t 分布 CDF。 */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const p = 0.5 * regularizedGammaP(df / 2, x / 2)
  return t > 0 ? 1 - p : p
}

/** 描述性统计。 */
export interface DescriptiveStats {
  count: number
  sum: number
  mean: number
  median: number
  mode: number[]
  variance: number
  std: number
  variancePopulation: number
  stdPopulation: number
  min: number
  max: number
  range: number
  q1: number
  q3: number
  iqr: number
  skewness: number
  kurtosis: number
}

/** 分位数（线性插值，与 numpy 默认一致）。 */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

/** 一次性算出全套描述统计。 */
export function describe(values: number[]): DescriptiveStats {
  const data = values.filter((value) => Number.isFinite(value))
  if (data.length === 0) {
    throw new Error('describe: 需要至少一个有限数值')
  }
  const sorted = [...data].sort((a, b) => a - b)
  const count = data.length
  const sum = data.reduce((acc, value) => acc + value, 0)
  const mean = sum / count

  const squaredDeviations = data.reduce((acc, value) => acc + (value - mean) ** 2, 0)
  const variance = count > 1 ? squaredDeviations / (count - 1) : 0
  const variancePopulation = squaredDeviations / count

  const frequencies = new Map<number, number>()
  for (const value of data) frequencies.set(value, (frequencies.get(value) ?? 0) + 1)
  const highest = Math.max(...frequencies.values())
  const mode = [...frequencies.entries()].filter(([, n]) => n === highest).map(([value]) => value)

  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const std = Math.sqrt(variance)

  const m3 = data.reduce((acc, value) => acc + (value - mean) ** 3, 0) / count
  const m4 = data.reduce((acc, value) => acc + (value - mean) ** 4, 0) / count

  return {
    count,
    sum,
    mean,
    median: quantile(sorted, 0.5),
    mode,
    variance,
    std,
    variancePopulation,
    stdPopulation: Math.sqrt(variancePopulation),
    min: sorted[0],
    max: sorted[count - 1],
    range: sorted[count - 1] - sorted[0],
    q1,
    q3,
    iqr: q3 - q1,
    skewness: std > 0 ? m3 / std ** 3 : 0,
    kurtosis: variancePopulation > 0 ? m4 / variancePopulation ** 2 - 3 : 0,
  }
}

/** 线性回归结果：y = slope * x + intercept。 */
export interface LinearRegression {
  slope: number
  intercept: number
  r: number
  rSquared: number
  n: number
  predict: (x: number) => number
}

/** 最小二乘线性回归。 */
export function linearRegression(xs: number[], ys: number[]): LinearRegression {
  if (xs.length !== ys.length) throw new Error('linearRegression: x 与 y 长度必须一致')
  const n = xs.length
  if (n < 2) throw new Error('linearRegression: 至少需要两个数据点')

  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) throw new Error('linearRegression: x 全部相同，无法拟合')

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
  return {
    slope,
    intercept,
    r,
    rSquared: r * r,
    n,
    predict: (x: number) => slope * x + intercept,
  }
}

/** 多项式回归（最小二乘，正规方程 + 高斯消元）。 */
export function polynomialRegression(xs: number[], ys: number[], degree: number): {
  coefficients: number[]
  predict: (x: number) => number
  rSquared: number
} {
  if (xs.length !== ys.length) throw new Error('polynomialRegression: x 与 y 长度必须一致')
  const n = xs.length
  if (n < degree + 1) throw new Error(`polynomialRegression: ${degree} 次拟合至少需要 ${degree + 1} 个点`)

  const size = degree + 1
  // 构造正规方程 X^T X c = X^T y
  const matrix: number[][] = []
  const vector: number[] = []
  for (let i = 0; i < size; i += 1) {
    const row: number[] = []
    for (let j = 0; j < size; j += 1) {
      let sum = 0
      for (let k = 0; k < n; k += 1) sum += xs[k] ** (i + j)
      row.push(sum)
    }
    matrix.push(row)
    let rhs = 0
    for (let k = 0; k < n; k += 1) rhs += ys[k] * xs[k] ** i
    vector.push(rhs)
  }

  const coefficients = solveLinearSystem(matrix, vector)
  const predict = (x: number): number => {
    let total = 0
    for (let i = 0; i < coefficients.length; i += 1) total += coefficients[i] * x ** i
    return total
  }

  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i += 1) {
    ssRes += (ys[i] - predict(xs[i])) ** 2
    ssTot += (ys[i] - meanY) ** 2
  }

  return { coefficients, predict, rSquared: ssTot === 0 ? 1 : 1 - ssRes / ssTot }
}

/** 带部分主元的高斯消元解线性方程组。 */
export function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length
  const a = matrix.map((row, i) => [...row, vector[i]])

  for (let col = 0; col < n; col += 1) {
    // 部分主元
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-14) {
      throw new Error('solveLinearSystem: 矩阵奇异或接近奇异，无唯一解')
    }
    if (pivot !== col) {
      const temporary = a[col]
      a[col] = a[pivot]
      a[pivot] = temporary
    }
    const pivotValue = a[col][col]
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / pivotValue
      if (factor === 0) continue
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k]
    }
  }

  const solution = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row][n]
    for (let col = row + 1; col < n; col += 1) sum -= a[row][col] * solution[col]
    solution[row] = sum / a[row][row]
  }
  return solution
}
