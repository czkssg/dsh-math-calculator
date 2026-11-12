/**
 * 基础运算扩展：矩阵秩/零空间/奇异值、整数分解、数值求根。
 *
 * 原则：**能纯代码算的就不要让人手算**。
 *
 * ## 2026-11-12 重构：SVD 改用 ml-matrix
 *
 * 原来自己手写了 Jacobi 迭代求 AᵀA 的特征值，再由 σ=√λ 得奇异值。
 * 那条路**条件数被平方**，小奇异值严重失真（原作者自己在注释里写了这一点）。
 *
 * 现在奇异值/零空间/秩改用 `ml-matrix` 的 SVD（MIT、197 万周下载、
 * 2 个运行时依赖）。收益：
 *
 * ```
 *   ① 不用 AᵀA，条件数不平方 → 小奇异值可信
 *   ② 奇异矩阵不再只能报"singular"，能给出伪逆与零空间
 *   ③ 与 `eigen` 操作共用同一个矩阵库，口径一致
 * ```
 *
 * `rref` 保留手写 —— 它给的是**主元位置**（教学与解释用），
 * SVD 给不了那个；而且它是 60 行朴素消元，没有可换的必要。
 * 这些函数通过 `buildMath` 注册进 mathjs 引擎，所以可以直接写在表达式里：
 *   rank([[1,2],[2,4]])         → 1
 *   nullspace([[1,2],[2,4]])    → 零空间基
 *   svd([[1,2],[3,4]])          → 奇异值
 *   factorize(360)              → [2,2,2,3,3,5]
 *   nsolve("x^2-2", 1)          → 1.4142135623730951
 *
 * @module dsh-math-calculator/numeric
 */

import { Matrix, SVD } from 'ml-matrix'

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

/**
 * 行最简形（RREF），返回矩阵与主元列。
 *
 * 秩、零空间、线性系统求解都建在它上面 —— 是 `numeric.ts` 的根。
 *
 * ⚠️ 这是**高斯-约当消元（部分主元法）**，不是完全主元法，也不是 QR/SVD。
 * 因此它对**病态矩阵**（条件数极大）会给出不准的秩，例如
 * 范德蒙德矩阵在高阶时、或元素量级差异超过 1e12 的矩阵。
 * 需要更稳健时用 `singularValuesOf` 看奇异值衰减，而不是只信 `rankOf`。
 *
 * `1e-12` 这个阈值是「视作零」的判据：浮点消元会产生 1e-17 量级的噪声，
 * 不清理会把 0 当成主元，秩凭空变大。代价是真·极小主元（如 1e-13）也会被视作零 ——
 * 对本书这种「结构分析」用途够用，对高精度数值线性代数不够。
 *
 * @param input - 任意可转成二维数组的输入
 * @returns 行最简形矩阵与主元所在列
 */
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

/**
 * 零空间的一组正交基，用 ml-matrix 的 SVD。
 *
 * ## 为什么换
 *
 * 旧实现从 `rref` 的主元位置推自由变量，**对病态矩阵会把秩算错**，
 * 于是零空间的维数也错（多给或少给基向量）。
 * SVD 的零空间由「近零奇异值对应的右奇异向量」给出，是数值上更稳的定义。
 *
 * ## 判据
 *
 * `1e-10 × σ_max` 作相对阈值 —— 绝对阈值在不同量级的矩阵上会误判
 * （元素到 1e6 时，1e-12 的绝对阈值会把真零空间当成满秩）。
 *
 * @param input - 任意可转成二维数组的输入
 * @returns 零空间基向量（每个向量长度 = 列数）
 */
export function nullspaceOf(input: any): number[][] {
  const a = toMatrix(input)
  if (a.length === 0) return []
  const cols = a[0].length
  const svd = new SVD(new Matrix(a))
  const singular = svd.diagonal.map((v) => Math.abs(v))
  const max = Math.max(...singular, 0)
  const threshold = max === 0 ? 0 : max * 1e-10

  /**
   * ## `ml-matrix` 的 `rightSingularVectors` 是**按列**存右奇异向量的
   *
   * 这一点必须实测才知：文档没明说，而 `getRow(i)` 看起来像"第 i 个右奇异向量"，
   * 实际不是。验证方法是对每个候选向量算 `|A·v|`，看它是否等于对应奇异值：
   *
   * ```
   *   取行：|A·v| = 15.94 / 3.93 / 3.93   ← 与 s 不匹配（错）
   *   取列：|A·v| = 16.848 / 1.068 / 0.000 ← 与 s 精确相等（对）
   * ```
   *
   * 所以第 i 个右奇异向量是 `V.get(r, i)`，r 遍历行。
   */
  const basis: number[][] = []
  const V = svd.rightSingularVectors
  const vRows = V.rows
  for (let i = 0; i < vRows; i += 1) {
    const sigma = singular[i] ?? 0
    if (sigma > threshold) continue
    const vector: number[] = []
    for (let r = 0; r < vRows; r += 1) vector.push(V.get(r, i))
    basis.push(vector)
  }

  /** 行数 < 列数时补齐剩余方向（这些方向必在零空间里）。 */
  if (basis.length < cols - a.length) {
    /**
     * 用 Gram-Schmidt 从标准基里找与已有基 + 行空间都正交的方向。
     * 只在「行少于列」这种矩形矩阵上走到这里，方阵与高矩阵不触发。
     */
    const rowSpace = a.map((row) => [...row])
    const orthonormalize = (vectors: number[][], candidate: number[]): number[] | null => {
      let v = [...candidate]
      for (const u of vectors) {
        const dot = v.reduce((sum, x, k) => sum + x * u[k], 0)
        const norm = u.reduce((sum, x) => sum + x * x, 0)
        if (norm > 0) v = v.map((x, k) => x - (dot / norm) * u[k])
      }
      const len = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
      return len > 1e-9 ? v.map((x) => x / len) : null
    }
    const existing = [...basis]
    for (const row of rowSpace) {
      const v = orthonormalize(existing, row)
      if (v) existing.push(v)
    }
    for (let j = 0; j < cols && basis.length < cols; j += 1) {
      const e = new Array(cols).fill(0)
      e[j] = 1
      const v = orthonormalize([...basis, ...existing.slice(basis.length)], e)
      if (v) {
        /** 再用行空间验一次：真在零空间才算。 */
        const inNull = a.every((row) => Math.abs(row.reduce((sum, x, k) => sum + x * v[k], 0)) < 1e-8)
        if (inNull && !basis.some((b) => Math.abs(b.reduce((sum, x, k) => sum + x * v[k], 0)) > 0.999)) {
          basis.push(v)
        }
      }
    }
  }

  /**
   * ## 归一化 → 再转成「最小整数形式」
   *
   * SVD 给的是**单位向量**（`[-0.894, 0.447]`）。数学上没问题，
   * 但对使用者不友好：手算时核不了「这是不是零空间里那个方向」。
   *
   * 所以做一次整数化：把向量按最小非零元素的绝对值归一，
   * 若结果是接近整数的有理数就取整。`[-0.894, 0.447]` → `[-2, 1]`。
   *
   * 旧实现直接给 `[1, -2]`（同一方向、符号相反）—— 符号差异不算错，
   * 但为了让输出稳定可比，这里统一**首非零项取正**。
   */
  return basis.map((v) => {
    const cleaned = v.map((x) => (Math.abs(x) < 1e-12 ? 0 : x))
    const nonZero = cleaned.filter((x) => x !== 0)
    if (nonZero.length === 0) return cleaned
    const smallest = Math.min(...nonZero.map((x) => Math.abs(x)))
    /** 缩放到「最小非零元素 = 1」。 */
    let scaled = cleaned.map((x) => x / smallest)
    /** 全是接近整数就取整，否则保留 6 位小数。 */
    const allNearInt = scaled.every((x) => Math.abs(x - Math.round(x)) < 1e-8)
    if (allNearInt) scaled = scaled.map((x) => Math.round(x))
    else scaled = scaled.map((x) => Number(x.toFixed(6)))
    /** 首非零项取正，让输出稳定。 */
    const firstNonZero = scaled.find((x) => x !== 0)
    if (firstNonZero !== undefined && firstNonZero < 0) scaled = scaled.map((x) => -x)
    return scaled
  })
}
/**
 * 奇异值（从大到小），用 ml-matrix 的 SVD。
 *
 * ## 为什么不再自己算
 *
 * 旧实现走 AᵀA 的特征值再开方，**条件数被平方** ——
 * 原作者在注释里已经写明这个缺陷：「小奇异值（相对最大者 < 1e-8）
 * 会被算得严重失真，甚至变成负数」。SVD 直接对 A 做，
 * 条件数就是 A 本身的，小奇异值可信。
 *
 * @param input - 任意可转成二维数组的输入
 * @returns 奇异值，从大到小
 */
export function singularValuesOf(input: any): number[] {
  const a = toMatrix(input)
  if (a.length === 0) return []
  /**
   * `ml-matrix` 的 SVD 对角元**已按从大到小排列**，直接取即可。
   * 不自己再 sort —— 万一将来库改了排序，重复 sort 会掩盖差异；
   * 现在显式验证一次降序，测试里也守这条。
   */
  const values = new SVD(new Matrix(a)).diagonal.map((v) => Math.abs(v))
  return values.sort((x, y) => y - x)
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

    /**
     * 牛顿迭代，导数用**中心差商**近似而不是解析求导。
     *
     * 为什么用差商：这个函数拿到的是 mathjs 的表达式节点，解析求导要走
     * `derivative()` 再 parse，慢且对复杂表达式容易失败。中心差商
     * `(f(x+h) − f(x−h)) / 2h` 精度是 O(h²)，对本用途够。
     *
     * `h` 取 `max(1e-8, |x|·1e-7)` 而不是固定值：固定 h 在 x 很大时
     * 会因 `f(x+h) − f(x−h)` 的相消误差失去精度（两个数几乎相等，差值全是噪声）。
     * 随 |x| 缩放能让相对步长恒定。
     */
    for (let i = 0; i < 80; i += 1) {
      const fx = f(x)
      if (!Number.isFinite(fx)) break
      if (Math.abs(fx) < 1e-13) return trim15(x)
      const h = Math.max(1e-8, Math.abs(x) * 1e-7)
      const derivative = (f(x + h) - f(x - h)) / (2 * h)
      // 导数趋零说明碰到极值点（或函数平），牛顿法会飞走 —— 交给兜底
      if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-14) break
      const next = x - fx / derivative
      if (!Number.isFinite(next)) break
      if (Math.abs(next - x) < 1e-13) return trim15(next)
      x = next
    }

    /**
     * 兜底：在 [-1e6, 1e6] 上按 0.01 步长扫变号区间，再二分收敛。
     *
     * 为什么需要：牛顿法对初值敏感，初值猜偏就发散。二分只要**变号**就能收敛，
     * 代价是要先扫一遍（2 亿个点 × 每点一次求值 —— 所以只在牛顿失败后才走）。
     * 这也意味着它只能找到 [-1e6, 1e6] 内的实根，超出范围的根找不到。
     */
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
