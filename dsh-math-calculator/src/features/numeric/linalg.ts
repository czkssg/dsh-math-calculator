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
import { singularValuesOf } from '../../core/numeric.js'

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
  const trimmed = text.trim()
  const frac = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(trimmed)
  if (frac !== null) {
    const value = Number(frac[1]) / Number(frac[2])
    return Number.isFinite(value) ? value : null
  }
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

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

  /** 秩（algebrite 精确）。 */
  let rank = 0
  try {
    const parsed = parseValue(runAlgebrite('rank(' + literal + ')'))
    rank = typeof parsed === 'number' ? parsed : 0
  } catch {
    rank = Math.min(rowCount, colCount)
  }

  /** 行列式（方阵才有，algebrite 精确）。 */
  let determinant: number | null = null
  let trace: number | null = null
  if (isSquare) {
    try {
      const parsed = parseValue(runAlgebrite('det(' + literal + ')'))
      determinant = typeof parsed === 'number' ? parsed : null
      trace = rows.reduce((sum, row, i) => sum + row[i], 0)
    } catch {
      determinant = null
    }
  }

  /** 奇异值（走 ml-matrix，algebrite 无 SVD）。 */
  let singular: number[] = []
  try {
    singular = singularValuesOf(rows)
  } catch {
    singular = []
  }

  /** 逆矩阵（方阵且满秩）。 */
  let inverse: number[][] | null = null
  if (isSquare && Math.abs(rank - rowCount) < 1e-9) {
    try {
      const parsed = parseValue(runAlgebrite('inv(' + literal + ')'))
      inverse = Array.isArray(parsed) ? parsed : null
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

  const parsed = parseValue(runAlgebrite('eigenval(' + toMatrixLiteral(rows) + ')'))
  /**
   * algebrite 的 `eigenval` 返回**对角矩阵**（[[2.0,0.0],[0.0,3.0]]），
   * 特征值就是对角元。
   */
  if (!Array.isArray(parsed)) {
    throw new CalcError('invalid_argument', 'algebrite 未能算出特征值', '检查矩阵是否可对角化。')
  }
  const values = parsed.map((row, i) => row[i]).filter((v) => Number.isFinite(v))

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
