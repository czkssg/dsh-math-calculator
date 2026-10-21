/**
 * 需要 JS 实现的公式。
 *
 * 为什么需要这一层：mathjs 表达式在「数组逐元素运算」上有硬伤 ——
 * - `log([0.5,0.5])` 报 "Too few arguments"（不收数组）
 * - `[0.5,0.5]^2` 被当成矩阵幂（"A must be 2 dimensional"）
 * - `square(...)` 不接受矩阵
 * - `map(p, x, ...)` 的 lambda 语法在 evaluate 里不通（Undefined symbol x）
 * 这些用表达式硬凑既不可读也容易出错，不如在 JS 里写清楚。
 *
 * @module dsh-math-calculator/formula-builtins
 */

/** 把参数值转成数字数组。支持数组、数组表达式字符串、单个数字。 */
export function toNumberArray(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const numbers = value.map((item) => Number(item))
    return numbers.every((n) => Number.isFinite(n)) ? numbers : undefined
  }
  if (typeof value === 'string') {
    const text = value.trim()
    // "[0.5, 0.5]" 或 "0.5,0.5"
    const inner = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text
    if (inner.trim() === '') return []
    const numbers = inner.split(',').map((piece) => Number(piece.trim()))
    return numbers.every((n) => Number.isFinite(n)) ? numbers : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [value]
  return undefined
}

/** 取标量数字。 */
function toScalar(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/** 香农熵：H = -Σ p·log_base(p)。 */
export function shannonEntropy(values: Record<string, unknown>): number {
  const probabilities = toNumberArray(values.p)
  if (!probabilities) throw new Error('参数 p 必须是数字数组，例如 [0.5,0.5]')
  const base = toScalar(values.base, 2)
  if (base <= 0 || base === 1) throw new Error('对数的底必须是正数且不等于 1')
  const logBase = Math.log(base)
  let total = 0
  for (const probability of probabilities) {
    if (probability > 0) total -= probability * (Math.log(probability) / logBase)
  }
  return total
}

/** 赫芬达尔-赫希曼指数：HHI = Σ s²。 */
export function hhi(values: Record<string, unknown>): number {
  const shares = toNumberArray(values.s)
  if (!shares) throw new Error('参数 s 必须是数字数组，例如 [0.4,0.3,0.3]')
  return shares.reduce((total, share) => total + share * share, 0)
}

/** 辛普森多样性：D = 1 - Σ p²。 */
export function simpsonDiversity(values: Record<string, unknown>): number {
  const proportions = toNumberArray(values.p)
  if (!proportions) throw new Error('参数 p 必须是数字数组，例如 [0.5,0.3,0.2]')
  const sumSquares = proportions.reduce((total, proportion) => total + proportion * proportion, 0)
  return 1 - sumSquares
}

/**
 * 基尼系数（梯形法）。
 * 输入为各组收入份额；内部按升序排列后做洛伦兹曲线积分。
 */
export function gini(values: Record<string, unknown>): number {
  const raw = toNumberArray(values.y)
  if (!raw || raw.length === 0) throw new Error('参数 y 必须是收入份额数字数组')
  const shares = [...raw].sort((a, b) => a - b)
  const n = shares.length
  const total = shares.reduce((sum, share) => sum + share, 0)
  if (total <= 0) throw new Error('收入份额总和必须为正')

  // 归一化后按梯形法算洛伦兹曲线下面积
  const normalized = shares.map((share) => share / total)
  let area = 0
  let cumulative = 0
  for (let index = 0; index < n; index += 1) {
    const previous = cumulative
    cumulative += normalized[index]
    area += ((previous + cumulative) / 2) * (1 / n)
  }
  // 完全平等线面积 0.5
  return 1 - area / 0.5
}

/** 有效政党数（拉阿克-塔格佩拉指数）：N = 1/Σp²。 */
export function effectiveParties(values: Record<string, unknown>): number {
  const shares = toNumberArray(values.s)
  if (!shares || shares.length === 0) throw new Error('参数 s 必须是份额数字数组')
  const sumSquares = shares.reduce((total, share) => total + share * share, 0)
  if (sumSquares <= 0) throw new Error('份额平方和必须为正')
  return 1 / sumSquares
}

/** builtin 名 → 实现。 */
export const BUILTINS: Record<string, (values: Record<string, unknown>) => number> = {
  shannonEntropy,
  hhi,
  simpsonDiversity,
  gini,
  effectiveParties,
}
