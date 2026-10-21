/**
 * 基础运算扩展：矩阵秩/零空间/奇异值、整数分解、数值求根。
 *
 * 原则：**能纯代码算的就不要让人手算**，而且不引入新依赖（只用 mathjs + 纯 JS）。
 * 这些函数通过 `buildMath` 注册进 mathjs 引擎，所以可以直接写在表达式里：
 *   rank([[1,2],[2,4]])         → 1
 *   nullspace([[1,2],[2,4]])    → 零空间基
 *   svd([[1,2],[3,4]])          → 奇异值
 *   factorize(360)              → [2,2,2,3,3,5]
 *   nsolve("x^2-2", 1)          → 1.4142135623730951
 *
 * @module dsh-math-calculator/numeric
 */

/** 任意矩阵输入（数组 / mathjs Matrix）→ 二维普通数组。 */
export function toMatrix(input: any): number[][] {
  const raw = input && typeof input.toArray === 'function' ? input.toArray() : input
  if (!Array.isArray(raw)) throw new Error('需要矩阵输入')
  const rows = raw.map((row: any) => (Array.isArray(row) ? row.map(Number) : [Number(row)]))
  if (rows.length === 0) return []
  const width = rows[0].length
  for (const row of rows) {
    if (row.length !== width) throw new Error('矩阵每行长度必须一致')
    if (row.some((v: number) => !Number.isFinite(v))) throw new Error('矩阵含非有限数值')
  }
  return rows
}

/** 行最简形（RREF），返回矩阵与主元列。 */
export function rref(input: any): { matrix: number[][]; pivots: number[] } {
  const a = toMatrix(input).map((row) => [...row])
  const rows = a.length
  const cols = rows === 0 ? 0 : a[0].length
  const pivots: number[] = []
  let lead = 0

  for (let r = 0; r < rows && lead < cols; r += 1) {
    let i = r
    while (i < rows && Math.abs(a[i][lead]) < 1e-12) i += 1
    if (i === rows) {
      lead += 1
      r -= 1
      continue
    }
    ;[a[i], a[r]] = [a[r], a[i]]
    const pivot = a[r][lead]
    for (let j = 0; j < cols; j += 1) a[r][j] /= pivot
    for (let k = 0; k < rows; k += 1) {
      if (k === r) continue
      const factor = a[k][lead]
      if (Math.abs(factor) < 1e-15) continue
      for (let j = 0; j < cols; j += 1) a[k][j] -= factor * a[r][j]
    }
    pivots.push(lead)
    lead += 1
  }

  // 清理浮点噪声
  for (const row of a) {
    for (let j = 0; j < row.length; j += 1) {
      if (Math.abs(row[j]) < 1e-12) row[j] = 0
    }
  }
  return { matrix: a, pivots }
}

/** 矩阵的秩。 */
export function rankOf(input: any): number {
  const { pivots } = rref(input)
  return pivots.length
}

/** 零空间的一组基（自由变量取 1，其余解出）。 */
export function nullspaceOf(input: any): number[][] {
  const { matrix, pivots } = rref(input)
  const rows = matrix.length
  const cols = rows === 0 ? 0 : matrix[0].length
  const free: number[] = []
  for (let j = 0; j < cols; j += 1) if (!pivots.includes(j)) free.push(j)

  const basis: number[][] = []
  for (const freeCol of free) {
    const vector = new Array(cols).fill(0)
    vector[freeCol] = 1
    for (let r = 0; r < pivots.length; r += 1) {
      vector[pivots[r]] = -matrix[r][freeCol]
    }
    basis.push(vector)
  }
  return basis
}

/** 对称矩阵的 Jacobi 特征值（只取特征值，用于算奇异值）。 */
function symmetricEigenvalues(matrix: number[][]): number[] {
  const n = matrix.length
  const a = matrix.map((row) => [...row])
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) off += a[i][j] ** 2
    if (off < 1e-20) break
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta ** 2 + 1))
        const c = 1 / Math.sqrt(t ** 2 + 1)
        const s = t * c
        for (let k = 0; k < n; k += 1) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
      }
    }
  }
  return a.map((row, i) => row[i])
}

/**
 * 奇异值（从大到小）。
 * 做法：SVD 的奇异值是 AᵀA 特征值的平方根（对称矩阵，Jacobi 求解）。
 */
export function singularValuesOf(input: any): number[] {
  const a = toMatrix(input)
  const rows = a.length
  const cols = rows === 0 ? 0 : a[0].length
  const ata: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0))
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0
      for (let r = 0; r < rows; r += 1) sum += a[r][i] * a[r][j]
      ata[i][j] = sum
    }
  }
  return symmetricEigenvalues(ata)
    .map((value) => Math.sqrt(Math.max(0, value)))
    .sort((x, y) => y - x)
}

/** 整数质因数分解（试除到 √n，适合 n < 1e12）。 */
export function factorizeInt(value: number): number[] {
  let n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n < 2) throw new Error('质因数分解需要 ≥ 2 的整数')
  const factors: number[] = []
  for (let p = 2; p * p <= n; p += 1) {
    while (n % p === 0) {
      factors.push(p)
      n /= p
    }
  }
  if (n > 1) factors.push(n)
  return factors
}

/**
 * 数值求根：牛顿法 + 失败时扫描区间二分兜底。
 * @param parse - mathjs 的 parse（由引擎注入）。
 */
export function makeNsolve(parse: (text: string) => any) {
  /** 收敛到 15 位有效数字：BigNumber 引擎拒绝隐式转换更高精度的普通 number。 */
  const trim15 = (value: number): number => Number(value.toPrecision(15))

  return (expression: any, guess: any = 0): number => {
    const node = parse(String(expression))
    // BigNumber 引擎不接受 >15 位有效数字的普通 number，传入前先收敛
    const f = (x: number): number => Number(node.evaluate({ x: trim15(x) }))
    let x = Number(guess)
    if (!Number.isFinite(x)) x = 0

    for (let i = 0; i < 80; i += 1) {
      const fx = f(x)
      if (!Number.isFinite(fx)) break
      if (Math.abs(fx) < 1e-13) return trim15(x)
      const h = Math.max(1e-8, Math.abs(x) * 1e-7)
      const derivative = (f(x + h) - f(x - h)) / (2 * h)
      if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-14) break
      const next = x - fx / derivative
      if (!Number.isFinite(next)) break
      if (Math.abs(next - x) < 1e-13) return trim15(next)
      x = next
    }

    // 兜底：在 [-1e6, 1e6] 上找变号区间再二分
    let previous = f(-1e6)
    for (let x0 = -1e6; x0 <= 1e6; x0 += 1e-2) {
      const current = f(x0)
      if (Number.isFinite(previous) && Number.isFinite(current) && previous * current <= 0) {
        let lo = x0 - 1e-2
        let hi = x0
        for (let k = 0; k < 200; k += 1) {
          const mid = (lo + hi) / 2
          const fm = f(mid)
          if (Math.abs(fm) < 1e-14) return trim15(mid)
          if (f(lo) * fm <= 0) hi = mid
          else lo = mid
        }
        return trim15((lo + hi) / 2)
      }
      previous = current
    }
    throw new Error('在 [-1e6, 1e6] 内未找到变号区间，无法数值求根')
  }
}

/** mathjs 工厂：合并进 buildMath 的 create()。 */
export const NUMERIC_FACTORIES = {
  rank: () => (matrix: any) => rankOf(matrix),
  nullspace: () => (matrix: any) => nullspaceOf(matrix),
  svd: () => (matrix: any) => singularValuesOf(matrix),
  singularvalues: () => (matrix: any) => singularValuesOf(matrix),
  factorize: () => (value: any) => factorizeInt(Number(value)),
  nsolve: ({ parse }: any) => makeNsolve(parse),
}
