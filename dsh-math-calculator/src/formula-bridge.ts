/**
 * 公式求值桥：把已有公式库当作「可程序化调用的计算模块」。
 *
 * @module dsh-math-calculator/formula-bridge
 * @description
 * 设计原则（用户明确要求）：**世界观推演是指令集，必须复用基础计算模块
 * 与常数表/公式库，不重复写代码**。
 *
 * 所以推演层不自己实现物理公式，而是把参数喂给已有的 342 条公式库求值。
 * 三个好处：
 * 1. 一处修正，处处生效 —— 公式改了，推演自动跟着变；
 * 2. 常数覆盖自动流入 —— `operation=constants` 改的 c/G/h 会被公式直接读到；
 * 3. 不产生第二份真相 —— 不会出现「pipeline 与 formula 算得不一样」。
 */

import { FORMULA_INDEX, resolveParams, buildFormulaScope, type FormulaDef } from './formulas.js'
import { getActiveConstants, standardValues } from './constants-graph.js'
import { bignum } from './ops/shared.js'

/** 一次公式求值的结果。 */
export interface FormulaResult {
  /** 公式 id。 */
  id: string
  /** 求值结果。 */
  value: number
  /** 单位（来自公式定义）。 */
  unit: string
  /** 公式表达式（作为判定依据展示）。 */
  expr: string
}

/**
 * 用公式库求值。
 *
 * 优先用传入的 overrides；缺失的参数会从**当前生效的常数表**里取
 * （resolveParams 内部就是这么做的），所以改过常数的世界会自动流入。
 *
 * @param id - 公式 id（如 `atmospheric_scale_height`）
 * @param overrides - 参数覆盖
 * @param precision - 计算精度（默认 32 位，够用且快）
 * @returns 求值结果；公式不存在或仍缺参数时返回 null
 */
export function evalFormula(
  id: string,
  overrides: Record<string, number> = {},
  precision = 32,
): FormulaResult | null {
  const formula: FormulaDef | undefined = FORMULA_INDEX.get(id)
  if (!formula) return null
  try {
    const resolved = resolveParams(formula, overrides as never)
    if (resolved.missing.length > 0) return null
    const engine = bignum(precision)
    const scope = buildFormulaScope(engine, resolved.values)
    const value = Number(engine.evaluate(formula.expr, scope))
    if (!Number.isFinite(value)) return null
    return { id: id, value: value, unit: formula.unit || '', expr: formula.expr }
  } catch {
    return null
  }
}

/**
 * 读一个常数当前生效的值（跟着 `operation=constants` 变）。
 *
 * @param name - 常数名
 * @returns 值；没有则 undefined
 */
export function constantValue(name: string): number | undefined {
  // 先看覆盖层（operation=constants 改过的），再退回现实标准值。
  // 只读 getActiveConstants 会拿到空表 —— 那是「本世界的改动」，不含基准值。
  const active = getActiveConstants()
  const overridden = active[name]
  if (typeof overridden === 'number') return overridden
  const standard = standardValues()[name]
  return typeof standard === 'number' ? standard : undefined
}

/**
 * 批量读常数当前生效值。
 *
 * @param names - 常数名列表
 * @returns 只包含取到的那些
 */
export function constantsFor(names: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const name of names) {
    const value = constantValue(name)
    if (typeof value === 'number') out[name] = value
  }
  return out
}
