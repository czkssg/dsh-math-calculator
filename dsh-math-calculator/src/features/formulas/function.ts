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
  /** 量纲向量（7 基量：L M T Theta I N J）；没有标注就是 undefined（不校验）。 */
  dimension?: Record<string, number>
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
    ...(spec.dimension !== undefined ? { dimension: spec.dimension } : {}),
  }))

  return {
    id: entry.id,
    name: entry.name,
    cat: entry.cat,
    unit: entry.unit,
    params,
    call: (values = {}, options = {}): FormulaCallResult => {
      /** 展示式不能调用（先于参数检查，否则会先报「缺参数」误导）。 */
      if (entry.executable === false) {
        throw new CalcError(
          'invalid_argument',
          '这条公式是展示式，不能直接求值：' + entry.id + '（' + entry.name + '）',
          '表达式含 Σᵢ / log_base 这类排版符号，mathjs 无法解析。要看含义用公式检索；要算同类量请用可执行版本。',
        )
      }
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
      /**
       * 带单位参数（阶段 3.2）。
       *
       * 允许 `{m: '5 kg'}` 这种写法：解析成 SI 数值，并核对量纲是否与参数标注一致。
       * mathjs 的 Unit.dimensions 是 9 位数组，顺序 [M,L,T,I,Theta,N,J,…]。
       */
      /** mathjs 的 dimensions 顺序：M, L, T, I, Theta, J（发光强度）, N（物质的量）… */
      const UNIT_ORDER = ['M', 'L', 'T', 'I', 'Theta', 'J', 'N']
      /** 七个基量的 SI 基准单位，用于把「1 atm」这类换算成 SI 数值。 */
      const BASE_UNITS: Record<string, string> = { M: 'kg', L: 'm', T: 's', I: 'A', Theta: 'K', J: 'cd', N: 'mol' }
      const numericOf = (spec: FormulaParamSpec, raw: unknown): number => {
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw
        if (typeof raw !== 'string') {
          throw new CalcError('invalid_argument', '参数 ' + spec.name + ' 需要数字或带单位的字符串（收到 ' + JSON.stringify(raw) + '）', '例如 {m:"5 kg"} 或 {m:5}。')
        }
        let parsed: unknown
        try {
          parsed = engine.evaluate(raw.trim())
        } catch (error) {
          throw new CalcError('invalid_argument', '参数 ' + spec.name + ' 的单位串解析失败：' + raw + '（' + (error instanceof Error ? error.message : String(error)) + '）', '写法：数值在前、单位在后，如 "5 kg"、"300 K"。')
        }
        const unit = parsed as { isUnit?: boolean; toNumber?: () => number; to?: (target: string) => { toNumber: () => number }; dimensions?: number[] }
        if (unit?.isUnit !== true || typeof unit.toNumber !== 'function') {
          throw new CalcError('invalid_argument', '参数 ' + spec.name + ' 的 "' + raw + '" 没解析成「数值 + 单位」', '要纯数值请直接给数字；要带单位请写 "5 kg"。')
        }
        if (spec.dimension !== undefined) {
          const actual: Record<string, number> = {}
          const dims = unit.dimensions ?? []
          for (let index = 0; index < Math.min(UNIT_ORDER.length, dims.length); index += 1) {
            if (dims[index] !== 0) actual[UNIT_ORDER[index]] = dims[index]
          }
          const expected = spec.dimension
          const mismatch =
            Object.keys(actual).some((key) => (expected[key] ?? 0) !== actual[key]) ||
            Object.keys(expected).some((key) => (actual[key] ?? 0) !== expected[key])
          if (mismatch) {
            const show = (dim: Record<string, number>): string => {
              const parts = Object.entries(dim).filter(([, power]) => power !== 0).map(([key, power]) => key + (power === 1 ? '' : '^' + power))
              return parts.length > 0 ? parts.join('·') : '无量纲'
            }
            throw new CalcError(
              'unit_mismatch',
              '参数 ' + spec.name + ' 的量纲不符：期望 ' + show(expected) + '，收到 ' + show(actual) + '（"' + raw + '"）',
              '这条参数的含义是「' + spec.desc + '」。换一个同量纲的单位，或直接给数字（按 SI 基准单位）。',
            )
          }
        }
        /**
         * Unit.toNumber() 返回的是**以自身单位表示**的值（"1 atm" → 1），
         * 不是 SI 基准值。要按量纲构造目标单位再换算，否则公式会拿 1 当 101325 用。
         */
        let value: number
        try {
          const dims = unit.dimensions ?? []
          const parts: string[] = []
          for (let index = 0; index < Math.min(UNIT_ORDER.length, dims.length); index += 1) {
            const power = dims[index]
            if (power === 0) continue
            const base = BASE_UNITS[UNIT_ORDER[index]]
            if (base === undefined) continue
            parts.push(base + (power === 1 ? '' : '^' + power))
          }
          value = parts.length > 0 && typeof unit.to === 'function' ? Number(unit.to(parts.join('*')).toNumber()) : Number(unit.toNumber())
        } catch {
          throw new CalcError(
            'invalid_argument',
            '参数 ' + spec.name + ' 的单位无法换算成 SI 基准（"' + raw + '"）',
            '尽量用 SI 或常见单位（kg、m、s、K、mol、Pa、J、W…）；复合单位请检查写法。',
          )
        }
        if (!Number.isFinite(value)) throw new CalcError('invalid_argument', '参数 ' + spec.name + ' 的数值不是有限数：' + raw, '')
        return value
      }

      /** 参数契约：显式值 > 默认值；必填缺了直接报，不猜。 */
      const substituted: Record<string, number> = {}
      const missing: string[] = []
      for (const spec of params) {
        const provided = values[spec.name]
        if (provided !== undefined && provided !== null) {
          substituted[spec.name] = numericOf(spec, provided)
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
