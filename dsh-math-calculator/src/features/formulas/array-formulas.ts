/**
 * 数组型公式的内置算法。
 *
 * ## 为什么单独一个模块
 *
 * 有 4 条公式要**遍历数组**：`gini` / `hhi` / `shannon_entropy` / `simpson_diversity`。
 * 它们此前标 `executable: false`，因为表达式含 `Σᵢ`、`log_base` 这类排版符号，
 * mathjs 无法解析——但数学定义完全明确，属于**能算却没算**。
 *
 * 2026-11-27 能力体检发现这是 859 条公式里唯一的 4 条空白，于是补上。
 *
 * ## 为什么抽出来
 *
 * 求值有两条独立路径（`evaluate.ts` 的 evaluateFormula 与 `function.ts` 的
 * compileFormula().call()）。只改一条会漏——本项目踩过「只修一条显示路径」的坑。
 * 所以算法放这里，两处共用。
 *
 * @module dsh-math-calculator/features/formulas/array-formulas
 */

/** 支持数组遍历的公式 id。 */
export const ARRAY_FORMULA_IDS = new Set(['gini', 'hhi', 'shannon_entropy', 'simpson_diversity'])

/**
 * 按 id 计算数组型公式。
 *
 * @param id - 公式 id
 * @param values - 参数（含数组）
 * @returns 数值结果；不是数组型公式或条件不满足时 null
 */
export function evaluateArrayFormulaById(id: string, values: Record<string, unknown>): number | null {
  /** 取数值数组；不合法返回 null。 */
  const readArray = (key: string): number[] | null => {
    const raw = values[key]
    if (!Array.isArray(raw)) return null
    const nums = raw.map((x) => Number(x))
    if (nums.length === 0) return null
    if (nums.some((n) => !Number.isFinite(n))) return null
    return nums
  }

  if (id === 'hhi') {
    /** HHI = Σ sᵢ²（份额平方和） */
    const s = readArray('s')
    if (s === null) return null
    return s.reduce((sum, v) => sum + v * v, 0)
  }

  if (id === 'shannon_entropy') {
    /** H = -Σ pᵢ·log_base(pᵢ)；pᵢ = 0 的项按极限取 0。 */
    const p = readArray('p')
    if (p === null) return null
    const base = Number(values['base'] ?? 2)
    if (!Number.isFinite(base) || base <= 0 || base === 1) return null
    const lnBase = Math.log(base)
    let h = 0
    for (const pi of p) {
      if (pi <= 0) continue
      h -= pi * (Math.log(pi) / lnBase)
    }
    return h
  }

  if (id === 'simpson_diversity') {
    /** D = 1 - Σ pᵢ² */
    const p = readArray('p')
    if (p === null) return null
    return 1 - p.reduce((sum, v) => sum + v * v, 0)
  }

  if (id === 'gini') {
    /**
     * 基尼系数（分组梯形近似）：
     * `G = 1 - (1/n)·Σ(yᵢ + yᵢ₋₁)`，y 为按收入升序的**累计份额**。
     * 若传入各组的**原始份额**（和为 1），先转成累计份额。
     */
    const y = readArray('y')
    if (y === null) return null
    const n = y.length
    /** 判断是否已是累计份额：末项接近 1 且单调不减。 */
    const looksCumulative = Math.abs(y[n - 1] - 1) < 1e-6 && y.every((v, i) => i === 0 || v >= y[i - 1] - 1e-9)
    let cum = y
    if (!looksCumulative) {
      const total = y.reduce((s, v) => s + v, 0)
      if (total <= 0) return null
      let run = 0
      cum = y.map((v) => (run += v / total))
    }
    /** 梯形法 */
    let sum = 0
    for (let i = 0; i < n; i += 1) {
      const prev = i === 0 ? 0 : cum[i - 1]
      sum += cum[i] + prev
    }
    return 1 - sum / n
  }

  return null
}
