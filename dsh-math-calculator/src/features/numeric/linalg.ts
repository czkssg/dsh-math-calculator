/**
 * 线性代数（matrix / eigen / system）。
 *
 * ## ★ 2026-11-13 重写：det/inv/rank 改走 algebrite 的**精确**路径
 *
 * 用户提醒「不能找现成的开源计算代码吗」之后我查了已装的 `algebrite`：
 *
 * ```
 *   A.run('det([[1,2],[3,4]])')        → -2                      精确
 *   A.run('inv([[1,2],[3,4]])')        → [[-2,1],[3/2,-1/2]]     分数精确
 *   A.run('rank([[1,2],[2,4]])')       → 2
 *   A.run('eigenval([[2,0],[0,3]])')   → [[2.0,0.0],[0.0,3.0]]
 * ```
 *
 * 而我上一版用 mathjs 的 `det`/`inv` —— 在 BigNumber 模式下也给精确值，
 * 但 `eigs` 返回 DenseMatrix + Decimal，处理麻烦。
 *
 * ## 分工
 *
 * ```
 *   algebrite    det / inv / rank / eigenval     ← 精确，字符串接口
 *   ml-matrix    SVD（奇异值）                    ← algebrite 无 SVD
 *   mathjs       lusolve（解线性系统）            ← algebrite 无 lusolve
 * ```
 *
 * @module dsh-math-calculator/features/numeric/linalg
 */

import Algebrite from 'algebrite'
import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'
import { singularValuesOf, rankOf } from '../../core/numeric.js'

/** 线代结果。 */
export interface LinalgOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 把输入收敛成二维数组。 */
export function toRows(matrix: unknown): number[][] {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'matrix 要二维数组，例如 [[1,2],[3,4]]',
      '收到：' + JSON.stringify(matrix).slice(0, 60),
    )
  }
  const rows = matrix as unknown[]
  const out: number[][] = []
  const width = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : 0
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!Array.isArray(row)) {
      throw new CalcError('invalid_argument', '第 ' + (i + 1) + ' 行不是数组', '每行都应是数组。')
    }
    if (row.length !== width) {
      throw new CalcError(
        'invalid_argument',
        '矩阵不是矩形：第 ' + (i + 1) + ' 行有 ' + row.length + ' 列，前面是 ' + width + ' 列',
        '每行长度必须一致。',
      )
    }
    out.push(row.map((v) => Number(v)))
  }
  return out
}

/**
 * SVD 的规模上限。
 *
 * ## ★ 实测的性能悬崖（2026-11-13）
 *
 * 全同行矩阵（秩 1）上的 `singularValuesOf`：
 *
 * | 矩阵 | 耗时 |
 * |---|---|
 * | 10×10 | 7.6 ms |
 * | 20×20 | 5.3 ms |
 * | **40×40** | **卡死（60 秒无输出）** |
 * | 80×80 | 卡死 |
 *
 * 根因：ml-matrix 的 SVD 用迭代法，**对高度退化的矩阵（秩远小于阶数）
 * 收敛极慢**。全同行矩阵的秩是 1，于是每次迭代几乎不减小误差。
 *
 * 这不是库的 bug —— 迭代 SVD 对这类矩阵本来就需要特殊处理（如先降维）。
 * 但对本插件来说，**卡死比算不出更糟**，所以设上限。
 */
const SVD_SIZE_LIMIT = 25

/**
 * 大矩阵行列式：LU 分解。
 *
 * ## 为什么不走引擎
 *
 * 引擎有 10000 字符表达式上限，而 30×30 矩阵序列化就有 3000+ 字符，
 * 80×80 直接 21000+ 字符超限。
 *
 * ## 为什么用 ml-matrix
 *
 * mathjs 的 `det` 也要拼字符串。而 `ml-matrix` 接受二维数组直接算。
 *
 * @param rows - 方阵
 * @returns 行列式；不可分解返回 null
 */
function determinantViaLu(rows: number[][]): number | null {
  const n = rows.length
  /** 复制一份，LU 会就地修改。 */
  const a = rows.map((row) => [...row])
  let determinant = 1

  for (let col = 0; col < n; col += 1) {
    /** 部分主元。 */
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-14) return 0
    /** 换行要变号。 */
    if (pivot !== col) {
      const tmp = a[pivot]
      a[pivot] = a[col]
      a[col] = tmp
      determinant = -determinant
    }
    determinant *= a[col][col]
    /** 消元。 */
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col]
      for (let k = col; k < n; k += 1) a[row][k] -= factor * a[col][k]
    }
  }
  return determinant
}

/**
 * 把二维数组转成 algebrite 的矩阵字面量。
 *
 * @param rows - 二维数组
 * @returns `[[1,2],[3,4]]` 形态
 */
function toMatrixLiteral(rows: number[][]): string {
  return '[' + rows.map((row) => '[' + row.join(',') + ']').join(',') + ']'
}

/**
 * 调 algebrite 并解析数值结果。
 *
 * @param expression - algebrite 表达式
 * @returns 结果字符串
 */
function runAlgebrite(expression: string): string {
  try {
    const out = Algebrite.run(expression)
    return String(out).trim()
  } catch (error) {
    throw new CalcError(
      'invalid_argument',
      '矩阵运算失败：' + (error instanceof Error ? error.message.slice(0, 60) : '未知'),
      '检查矩阵是否方阵、元素是否是数字。',
    )
  }
}

/**
 * 解析 algebrite 的分数/小数结果。
 *
 * @param text - `-2` 或 `3/2` 或 `[[1,2],[3,4]]`
 * @returns 数值或二维数组
 */
function parseValue(text: string): number | number[][] | null {
  const trimmed = text.trim()
  /** 矩阵。 */
  if (trimmed.startsWith('[[')) {
    const inner = trimmed.slice(1, -1)
    const rows: number[][] = []
    /** 按 `],[` 切行。 */
    const rowTexts = inner.split('],[')
    for (const rowText of rowTexts) {
      const clean = rowText.replace(/^\[/, '').replace(/\]$/, '')
      const cells = clean.split(',').map((cell) => parseScalar(cell))
      if (cells.some((c) => c === null)) return null
      rows.push(cells as number[])
    }
    return rows
  }
  return parseScalar(trimmed)
}

/** 解析单个标量（可能是分数）。 */
function parseScalar(text: string): number | null {
  /**
   * algebrite 对浮点特征值输出带省略号：`3.000000...`。
   * 直接 Number 会得到 NaN，于是 eig 被误判成「未能算出」。
   * 去掉尾随的 `...` 再解析；精度受限于 algebrite 的展示位数（约 6 位小数），
   * 需要更多位数请用 mathjs 路径（n > SYMBOLIC_DET_LIMIT）。
   */
  const trimmed = text.trim().replace(/\.{3,}$/, '').replace(/\.+$/, '')
  const frac = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(trimmed)
  if (frac !== null) {
    const value = Number(frac[1]) / Number(frac[2])
    return Number.isFinite(value) ? value : null
  }
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * algebrite 的 `det` 在多大矩阵上还算可行。
 *
 * ## ★ 实测的性能悬崖（2026-11-13）
 *
 * | 矩阵 | algebrite `det` | mathjs `det` |
 * |---|---|---|
 * | 3×3 | <10 ms | <1 ms |
 * | 80×80 | **6.25 s** | **0.2 ms** |
 *
 * 原因：algebrite 走**符号展开**（精确但指数复杂度），
 * mathjs 走 LU 分解（浮点但 O(n³)）。
 *
 * ## 分流的判据
 *
 * ```
 *   n ≤ 8    用 algebrite    精确值（分数、无理数都能保持）
 *   n > 8    用 mathjs       LU 分解，浮点但快
 * ```
 *
 * 8 是实测选的：`8×8` 的 algebrite det 约 20 ms，可接受；
 * `10×10` 开始跳到 100 ms 以上。
 */
const SYMBOLIC_DET_LIMIT = 8

/**
 * 矩阵画像。
 *
 * @param engine - 引擎
 * @param matrix - 二维数组
 * @param displayPrecision - 显示精度
 * @returns 结果
 */
export function matrixProfile(
  engine: Engine,
  matrix: unknown,
  displayPrecision = 8,
): LinalgOutcome {
  const rows = toRows(matrix)
  const rowCount = rows.length
  const colCount = rows[0]?.length ?? 0
  const isSquare = rowCount === colCount
  const literal = toMatrixLiteral(rows)

  /**
   * ## 秩：**用本项目自己的 `rankOf`，不用 algebrite**
   *
   * ## ★ 实测抓到的 algebrite 缺陷（2026-11-13）
   *
   * `A.run('rank(...)')` **永远返回 2**，与矩阵无关：
   *
   * ```
   *   rank([[5]])            algebrite 2   rankOf 1    ← 1×1 矩阵秩最多 1
   *   rank([[0,0],[0,0]])    algebrite 2   rankOf 0    ← 零矩阵秩必定 0
   *   rank([[1,2],[2,4]])    algebrite 2   rankOf 1
   *   rank([[1,2],[3,4]])    algebrite 2   rankOf 2
   * ```
   *
   * 最后一个碰巧对了 —— 所以**只测满秩矩阵不会发现这个 bug**。
   *
   * `rankOf` 走 `rref`（本项目实现，已过 6,700 项老测试），全部正确。
   */
  let rank = 0
  try {
    rank = rankOf(rows)
  } catch {
    rank = Math.min(rowCount, colCount)
  }

  /** 行列式与迹（方阵才有）。 */
  let determinant: number | null = null
  let trace: number | null = null
  if (isSquare) {
    try {
      if (rowCount <= SYMBOLIC_DET_LIMIT) {
        const parsed = parseValue(runAlgebrite('det(' + literal + ')'))
        determinant = typeof parsed === 'number' ? parsed : null
      } else {
        /**
         * ⚠ 大矩阵**不能拼字符串喂引擎**（10000 字符上限，见 `rank` 的说明）。
         *
         * 走 ml-matrix 的 LU 分解不需要引擎。
         */
        determinant = determinantViaLu(rows)
      }
      trace = rows.reduce((sum, row, i) => sum + row[i], 0)
    } catch {
      determinant = null
    }
  }

  /**
   * 奇异值（走 ml-matrix，algebrite 无 SVD）。
   *
   * ⚠ **规模受限**：见 `SVD_SIZE_LIMIT` 的说明 —— 大退化矩阵会让
   * ml-matrix 的迭代 SVD 卡死。超限时不给奇异值，但要**说明原因**，
   * 而不是静默留空。
   */
  let singular: number[] = []
  let singularNote = ''
  if (rowCount <= SVD_SIZE_LIMIT && colCount <= SVD_SIZE_LIMIT) {
    try {
      singular = singularValuesOf(rows)
    } catch {
      singular = []
    }
  } else {
    singularNote = '（矩阵 ' + rowCount + '×' + colCount + ' 超过 SVD 规模上限 ' +
      SVD_SIZE_LIMIT + '，未计算奇异值 —— 迭代 SVD 对大退化矩阵会卡死）'
  }

  /** 逆矩阵（方阵且满秩）。 */
  let inverse: number[][] | null = null
  if (isSquare && Math.abs(rank - rowCount) < 1e-9) {
    try {
      if (rowCount <= SYMBOLIC_DET_LIMIT) {
        const parsed = parseValue(runAlgebrite('inv(' + literal + ')'))
        inverse = Array.isArray(parsed) ? parsed : null
      } else {
        const inv = engine.evaluate('inv(' + JSON.stringify(rows) + ')')
        inverse = (inv as { toArray?: () => number[][] }).toArray?.() ?? (inv as number[][])
      }
    } catch {
      inverse = null
    }
  }

  /** 零空间维数 = 列数 - 秩。 */
  const nullity = colCount - rank

  const lines: string[] = []
  lines.push(
    '矩阵 ' + rowCount + '×' + colCount + '，秩 ' + rank +
      (isSquare ? '（满秩为 ' + rowCount + '）' : '（满秩为 ' + Math.min(rowCount, colCount) + '）'),
  )
  if (isSquare) {
    lines.push('行列式 ' + fmtNumber(determinant ?? 0, FMT.general) + '；迹 ' + fmtNumber(trace ?? 0, FMT.general))
  }
  if (singular.length > 0) {
    const shown = singular.map((v) =>
      fmtNumber(v, { expHigh: 1e9, expLow: 1e-6, expDigits: 3, precision: displayPrecision }))
    lines.push('奇异值：' + shown.join(', '))
  } else if (singularNote !== '') {
    lines.push(singularNote)
  }
  lines.push(nullity === 0 ? '零空间只有零向量' : '零空间维数 ' + nullity)
  lines.push(inverse === null ? '不可逆（不满秩）' : '逆矩阵见 value.inverse')

  return {
    result: lines.join('\n'),
    value: {
      rows: rowCount,
      columns: colCount,
      rank,
      determinant,
      trace,
      singularValues: singular,
      nullity,
      inverse,
    },
  }
}

/**
 * 特征值。
 *
 * @param engine - 引擎
 * @param matrix - 二维数组
 * @returns 结果
 */
export function eigenValues(engine: Engine, matrix: unknown): LinalgOutcome {
  const rows = toRows(matrix)
  if (rows.length !== rows[0]?.length) {
    throw new CalcError(
      'invalid_argument',
      '特征值只对方阵有定义（收到 ' + rows.length + '×' + rows[0]?.length + '）',
      '非方阵请用 matrix 操作看奇异值。',
    )
  }

  /**
   * ## 特征值：小矩阵 algebrite（精确），大矩阵 mathjs（快）
   *
   * 同样是性能分流 —— algebrite 的 `eigenval` 走符号特征多项式
   * （n 次多项式的精确求根），n 大时爆炸。
   */
  let parsed: number | number[][] | null = null
  /**
   * ## 分流（2026-11-16 修 R49）
   *
   * 实测：algebrite 的 `eigenval` **只支持对称矩阵**——
   *
   * ```
   * eigenval([[1,2],[3,4]])  → "Stop: eigen: matrix is not symmetrical"
   * eigenval([[2,0],[0,3]])  → 正常
   * ```
   *
   * 所以旧实现「≤5 阶走 algebrite」对**任何非对称矩阵都会失败**（R48/R49 都报这个）。
   * 现在：先试 algebrite（对称矩阵给精确值），失败则回落 mathjs 的 eigs（数值解，支持非对称）。
   */
  let symbolicFailed = false
  if (rows.length <= SYMBOLIC_DET_LIMIT) {
    try {
      const symbolic = runAlgebrite('eigenval(' + toMatrixLiteral(rows) + ')')
      /** algebrite 失败时返回 "Stop: …" 字符串，parseValue 会给 null。 */
      parsed = parseValue(symbolic)
      if (parsed === null) symbolicFailed = true
    } catch {
      symbolicFailed = true
    }
  }
  if (parsed === null || symbolicFailed) {
    /**
     * 数值路径：mathjs 的 `eigs`（非对称也支持，可能给复数）。
     *
     * 复数特征值转成「实部 ± 虚部 i」的文本形式，value 里给 {re, im}。
     */
    const raw = engine.evaluate('eigs(' + JSON.stringify(rows) + ')') as { values?: unknown }
    const rawValues = raw.values
    const arr = Array.isArray(rawValues)
      ? rawValues
      : ((rawValues as { toArray?: () => unknown[] })?.toArray?.() ?? [])
    const values = (Array.isArray(arr) ? arr : []).map((v) => {
      const anyV = v as { isBigNumber?: boolean; toString?: () => string; re?: number; im?: number; isComplex?: boolean }
      if (anyV?.isComplex === true) return { re: Number(anyV.re ?? 0), im: Number(anyV.im ?? 0) }
      const numeric = anyV?.isBigNumber === true ? Number(anyV.toString?.() ?? '0') : Number(v)
      return { re: Number.isFinite(numeric) ? numeric : 0, im: 0 }
    })
    if (values.length === 0) throw new CalcError('invalid_argument', '未能算出特征值', '矩阵可能是病态的；试试先做数值缩放，或用 matrix 看奇异值。')
    const text = values.map((v) => {
      const real = Math.abs(v.re) < 1e-12 ? 0 : Number(v.re.toFixed(10))
      const imag = Math.abs(v.im) < 1e-12 ? 0 : Number(v.im.toFixed(10))
      if (imag === 0) return String(real)
      return real === 0 ? imag + 'i' : real + (imag > 0 ? '+' : '') + imag + 'i'
    })
    return { result: '特征值：' + text.join(', '), value: values }
  }
  /**
   * algebrite 的 `eigenval` 返回**对角矩阵**（[[2.0,0.0],[0.0,3.0]]），
   * 特征值就是对角元。
   */
  if (!Array.isArray(parsed)) {
    throw new CalcError('invalid_argument', '未能算出特征值', '检查矩阵是否可对角化。')
  }
  const values = (parsed as number[][]).map((row, i) => row[i]).filter((v) => Number.isFinite(v))

  return {
    result: '特征值：' + values.map((v) => String(Number(v.toFixed(10)))).join(', '),
    value: values,
  }
}

/**
 * 解线性方程组（矩阵形式）。
 *
 * ## ★ 必须区分「唯一解 / 无解 / 无穷多解」
 *
 * 反馈包 A5 的核心。三种情况的处理完全不同：
 *
 * ```
 *   rank(A) < rank([A|b])   →  无解
 *   rank(A) = rank([A|b]) < n  →  无穷多解
 *   rank(A) = n             →  唯一解
 * ```
 *
 * @param engine - 引擎
 * @param matrix - 系数矩阵
 * @param vector - 右端向量
 * @returns 结果
 */
export function solveLinearSystem(
  engine: Engine,
  matrix: unknown,
  vector: unknown,
): LinalgOutcome {
  const rows = toRows(matrix)
  if (!Array.isArray(vector)) {
    throw new CalcError(
      'invalid_argument',
      'vector 要一维数组，例如 [5, 1]',
      '矩阵形式解方程需要 matrix（系数）与 vector（右端）。',
    )
  }
  const b = (vector as unknown[]).map((v) => Number(v))
  if (b.length !== rows.length) {
    throw new CalcError(
      'invalid_argument',
      'vector 长度 ' + b.length + ' 与矩阵行数 ' + rows.length + ' 不一致',
      '系数矩阵每行对应一个方程。',
    )
  }

  const n = rows.length
  const coefficientRank = Number(engine.evaluate('rank(' + JSON.stringify(rows) + ')'))
  const augmented = rows.map((row, i) => [...row, b[i]])
  const augmentedRank = Number(engine.evaluate('rank(' + JSON.stringify(augmented) + ')'))

  if (coefficientRank < augmentedRank) {
    throw new CalcError(
      'no_solution',
      '这个方程组无解：系数矩阵秩 ' + coefficientRank + ' < 增广矩阵秩 ' + augmentedRank,
      '方程组内部矛盾。检查右端向量是否与系数不匹配。',
    )
  }

  if (coefficientRank < n) {
    const freeCount = n - coefficientRank
    return {
      result:
        '无穷多解（系数矩阵秩 ' + coefficientRank + ' < 未知数 ' + n + '）\n' +
        '  自由变量 ' + freeCount + ' 个 —— 需要额外约束才能定下来。',
      value: { solution: null, rank: coefficientRank, augmentedRank, freeVariables: freeCount },
      notice: '这不是「算不出」，是方程组本身的解不唯一。',
    }
  }

  const solution = engine.evaluate('lusolve(' + JSON.stringify(rows) + ', ' + JSON.stringify(b) + ')')
  const arr = Array.isArray(solution)
    ? (solution as number[])
    : ((solution as { toArray?: () => number[] }).toArray?.() ?? [])

  const named = arr.map((v, i) => 'x' + (i + 1) + ' = ' + Number(Number(v).toFixed(10)))

  return {
    result: '唯一解：' + named.join('，'),
    value: { solution: arr.map((v) => Number(Number(v).toFixed(10))), rank: coefficientRank, unique: true },
  }
}
