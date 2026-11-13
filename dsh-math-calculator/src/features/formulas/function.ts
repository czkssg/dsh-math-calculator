/**
 * 公式即函数：把每条公式编译成**带参数契约的可调用函数**。
 *
 * ## 为什么需要
 *
 * 数据里的公式是 `{expr, params}`；调用方要自己知道「哪些参数必填、单位是什么、
 * 缺参数怎么补」。编译后每个公式是一个函数对象：
 *
 * ```
 *   formulaFunction = {
 *     id, name, unit,
 *     params: [{ name, required, default, desc }],
 *     call(values, options) → { result, value, substituted, missing, neighbors }
 *   }
 * ```
 *
 * 调用时**自动带出相邻公式**（共用参数/常数/标签），这样「算完这条，
 * 下一步还能喂给谁」不需要再查一次。
 *
 * ## 与 evaluateFormula 的关系
 *
 * 本模块不重复实现计算：`call` 把参数整理成交给 `evaluateFormula` 的 overrides，
 * 再补上参数契约校验与相邻关系。计算逻辑只有一份。
 *
 * @module dsh-math-calculator/features/formulas/function
 */

import { CalcError } from '../../core/errors.js'
import type { Engine } from '../../core/engine.js'
import { evaluateFormula } from './evaluate.js'
import type { FormulaEntry } from './query.js'
import type { RelationIndex } from './relations.js'
import { relationReason } from './relations.js'

/** 参数契约。 */
export interface FormulaParamSpec {
  name: string
  /** 必填（没有默认值）。 */
  required: boolean
  /** 默认值；必填时为 null。 */
  default: number | null
  desc: string
}

/** 调用结果。 */
export interface FormulaCallResult {
  result: string
  value: unknown
  notice?: string
  /** 本次实际代入的参数。 */
  substituted: Record<string, number>
  /** 没给又没有默认值的参数（正常调用不应出现；出现即报错）。 */
  missing: string[]
  /** 相邻公式（共用物理量/常数/标签）。 */
  neighbors: Array<{
    id: string
    name: string
    score: number
    reason: string
    sharedQuantities: string[]
    sharedSymbols: string[]
    sharedConstants: string[]
    symbolConflicts: Array<{ symbol: string; meanings: string[] }>
  }>
}

/** 公式函数。 */
export interface FormulaFunction {
  id: string
  name: string
  cat: string
  unit: string
  /** 参数契约。 */
  params: FormulaParamSpec[]
  /** 调用。 */
  call: (values?: Record<string, unknown>, options?: { displayPrecision?: number; terse?: boolean }) => FormulaCallResult
}

/**
 * 编译一条公式。
 *
 * @param entry - 公式定义
 * @param engine - 引擎
 * @param index - 关系索引（可空；给了就带相邻公式）
 * @returns 公式函数
 */
export function compileFormula(entry: FormulaEntry, engine: Engine, index?: RelationIndex): FormulaFunction {
  const params: FormulaParamSpec[] = Object.entries(entry.params ?? {}).map(([name, spec]) => ({
    name,
    required: spec.value === null,
    default: spec.value,
    desc: spec.desc,
  }))

  return {
    id: entry.id,
    name: entry.name,
    cat: entry.cat,
    unit: entry.unit,
    params,
    call: (values = {}, options = {}): FormulaCallResult => {
      /**
       * 未知参数名必须点名（T4-15）。
       *
       * 旧实现只把 params 名收进 substituted，拼错的 key 在**校验之前**就被
       * 过滤掉了——单条会报，批量却静默。这里先校验。
       */
      const known = new Set(params.map((spec) => spec.name))
      const unknown = Object.keys(values).filter((key) => !known.has(key))
      if (unknown.length > 0) {
        throw new CalcError(
          'unknown_argument',
          '这些参数名认不出来，已被忽略：' + unknown.join(', '),
          '这条公式的参数是：' + [...known].join(', ') + '。检查是否拼错（大小写敏感）。',
        )
      }
      /** 参数契约：显式值 > 默认值；必填缺了直接报，不猜。 */
      const substituted: Record<string, number> = {}
      const missing: string[] = []
      for (const spec of params) {
        const provided = values[spec.name]
        if (typeof provided === 'number' && Number.isFinite(provided)) {
          substituted[spec.name] = provided
        } else if (spec.default !== null) {
          substituted[spec.name] = spec.default
        } else {
          missing.push(spec.name)
        }
      }
      if (missing.length > 0) {
        throw new CalcError(
          'missing_params',
          '公式 ' + entry.id + ' 缺必填参数：' + missing.join('、'),
          '必填：' + params.filter((spec) => spec.required).map((spec) => spec.name).join('、') +
            '；可选：' + params.filter((spec) => !spec.required).map((spec) => spec.name + '=' + spec.default).join('、') +
            '。调用示例：{formula:"' + entry.id + '", params:{' + missing.map((name) => name + ':1').join(',') + '}}。',
        )
      }

      const evaluated = evaluateFormula(engine, entry, substituted, options.displayPrecision ?? 8, options.terse === true)
      /** 相邻公式：共用参数优先，其次共用常数与同标签。 */
      const neighbors = (index?.neighbors(entry.id, 6) ?? []).map((hit) => ({
        id: hit.id,
        name: hit.name,
        score: hit.score,
        reason: relationReason(hit),
        sharedQuantities: hit.sharedQuantities,
        sharedSymbols: hit.sharedSymbols,
        sharedConstants: hit.sharedConstants,
        symbolConflicts: hit.symbolConflicts,
      }))

      return {
        result: evaluated.result,
        value: evaluated.value,
        ...(evaluated.notice !== undefined ? { notice: evaluated.notice } : {}),
        substituted,
        missing,
        neighbors,
      }
    },
  }
}

/** 编译全部（按 id 索引）。 */
export function compileAll(
  formulas: FormulaEntry[],
  engine: Engine,
  index?: RelationIndex,
): Map<string, FormulaFunction> {
  const map = new Map<string, FormulaFunction>()
  for (const entry of formulas) {
    if (entry.executable === false) continue
    map.set(entry.id, compileFormula(entry, engine, index))
  }
  return map
}

/**
 * 调用一条公式（按 id 或名称查找）。
 *
 * @param formulas - 公式库
 * @param idOrName - 公式 id 或名称
 * @param engine - 引擎
 * @param values - 参数
 * @param index - 关系索引
 * @param options - 显示选项
 * @returns 调用结果
 * @throws {CalcError} 公式不存在 / 缺参
 */
export function callFormula(
  formulas: FormulaEntry[],
  idOrName: string,
  engine: Engine,
  values: Record<string, unknown> = {},
  index?: RelationIndex,
  options: { displayPrecision?: number; terse?: boolean } = {},
): FormulaCallResult {
  const entry = formulas.find((formula) => formula.id === idOrName || formula.name === idOrName)
  if (entry === undefined) {
    throw new CalcError('unknown_formula', '没有 id 为 "' + idOrName + '" 的公式', '用 formulas query 查可用的公式 id。')
  }
  return compileFormula(entry, engine, index).call(values, options)
}

/** 列出全部公式函数的参数契约（给 help / schema 用）。 */
export function describeFunctions(functions: Map<string, FormulaFunction>): Array<{ id: string; name: string; unit: string; params: FormulaParamSpec[] }> {
  return [...functions.values()].map((fn) => ({ id: fn.id, name: fn.name, unit: fn.unit, params: fn.params }))
}
