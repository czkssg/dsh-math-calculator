/**
 * 单位处理管道：现代单位直进 UCUM，非现代单位先经手写桥接换成 SI，再进 UCUM，算完换回。
 *
 * 三种路径（文字描述，避免注释里出现代码块标记）：
 *   现代 → 现代        ：UCUM 直接换算（convertUnitTo）
 *   非现代 → 现代      ：桥接 × factor → SI → UCUM（目标不是 SI 基准时再 UCUM 一次）
 *   现代 → 非现代      ：UCUM → SI → ÷ factor
 *   非现代 → 非现代    ：两者都换成 SI 再相除
 *
 * 为什么要有这一层：之前三层各自兜底（evaluateOne / dispatch / tool），
 * 彼此不知道前后，同一个表达式可能被桥接两次、也可能 UCUM 先接走却认不得非现代单位。
 * 现在只有这一层做单位判定，上层只负责挑表达式与输出。
 *
 * @module dsh-math-calculator/core/unit-pipeline
 */

import { buildBridgeTable } from './unit-bridge.js'
import { convertUcum, toUcum, validateUcumUnit } from './ucum.js'

/** SI/UCUM 可识别的现代单位（前缀变体靠 UCUM 校验兜底）。 */
const MODERN_HINTS = new Set([
  'm', 'km', 'cm', 'mm', 'um', 'nm', 'kg', 'g', 'mg', 't', 's', 'min', 'h', 'd',
  'm2', 'km2', 'cm2', 'm3', 'L', 'mL', 'J', 'kJ', 'MJ', 'W', 'kW', 'Pa', 'kPa', 'MPa',
  'N', 'K', 'Hz', 'rad', 'A', 'V', 'C', 'F', 'Ohm', 'S', 'Wb', 'T', 'H', 'Bq', 'Gy', 'Sv',
  'byte', 'kB', 'MB', 'GB', 'TB', 'mol', 'cd', 'sr', 'lm', 'lux', 'kat',
])

/**
 * 判定单位类别。
 *
 * @param unit - 单位写法
 * @returns modern / nonmodern / unknown
 */
export function classifyUnit(unit: string): 'modern' | 'nonmodern' | 'unknown' {
  if (typeof unit !== 'string' || unit.trim() === '') return 'unknown'
  const table = buildBridgeTable()
  if (table[unit] !== undefined) return 'nonmodern'
  if (MODERN_HINTS.has(unit)) return 'modern'
  try {
    if (validateUcumUnit(unit).valid) return 'modern'
  } catch {
    /* UCUM 不可用时按未知 */
  }
  return 'unknown'
}

/** 管道结果。 */
export interface UnitPipelineResult {
  ok: boolean
  value: number | null
  text: string
  from: string
  to: string
  fromKind: 'modern' | 'nonmodern' | 'unknown'
  toKind: 'modern' | 'nonmodern' | 'unknown'
  /** 走了哪几步（给 notice 用）。 */
  steps: string[]
  message: string
}

/**
 * 单位换算管道（源 → 目标）。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算结果与步骤
 */
export function convertUnits(value: number, from: string, to: string): UnitPipelineResult {
  const fromKind = classifyUnit(from)
  const toKind = classifyUnit(to)
  const table = buildBridgeTable()
  const steps: string[] = []
  const fromSi = fromKind === 'nonmodern' ? table[from] : undefined
  const toSi = toKind === 'nonmodern' ? table[to] : undefined

  if (fromKind === 'nonmodern' && toKind === 'nonmodern') {
    if (fromSi === undefined || toSi === undefined) {
      return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: '桥接表缺条目' }
    }
    if (fromSi.dimension !== toSi.dimension) {
      return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps: ['量纲不同'], message: '量纲不同：' + fromSi.dimension + ' vs ' + toSi.dimension }
    }
    steps.push('两者都换成 SI', from + ' × ' + fromSi.factor + ' ' + fromSi.si, to + ' ÷ ' + toSi.factor)
    const converted = (value * fromSi.factor) / toSi.factor
    return { ok: true, value: converted, text: String(converted) + ' ' + to, from, to, fromKind, toKind, steps, message: '非现代 ↔ 非现代' }
  }

  if (fromKind === 'nonmodern' && fromSi !== undefined) {
    const siValue = value * fromSi.factor
    steps.push(from + ' × ' + fromSi.factor + ' = ' + siValue + ' ' + fromSi.si)
    if (fromSi.si === to) {
      return { ok: true, value: siValue, text: String(siValue) + ' ' + to, from, to, fromKind, toKind, steps, message: '非现代 → SI' }
    }
    const ucum = convertUcum(siValue, fromSi.si, to)
    if (ucum.ok && ucum.value !== null) {
      steps.push('UCUM：' + fromSi.si + ' → ' + to)
      return { ok: true, value: ucum.value, text: String(ucum.value) + ' ' + to, from, to, fromKind, toKind, steps, message: '非现代 → SI → UCUM' }
    }
    return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: ucum.message }
  }

  if (toKind === 'nonmodern' && toSi !== undefined) {
    const siValue = convertUcum(value, from, toSi.si)
    if (siValue.ok && siValue.value !== null) {
      steps.push('UCUM：' + from + ' → ' + toSi.si)
      const converted = siValue.value / toSi.factor
      steps.push('÷ ' + toSi.factor + ' 得 ' + to)
      return { ok: true, value: converted, text: String(converted) + ' ' + to, from, to, fromKind, toKind, steps, message: '现代 → SI → 非现代' }
    }
    const converted = value / toSi.factor
    steps.push(from + ' 直接按 ' + toSi.si + ' 处理，÷ ' + toSi.factor)
    return { ok: true, value: converted, text: String(converted) + ' ' + to, from, to, fromKind, toKind, steps, message: '现代 → 非现代（UCUM 未参与）' }
  }

  if (fromKind === 'modern' && toKind === 'modern') {
    const ucum = convertUcum(value, from, to)
    if (ucum.ok && ucum.value !== null) {
      steps.push('UCUM：' + from + ' → ' + to)
      return { ok: true, value: ucum.value, text: String(ucum.value) + ' ' + to, from, to, fromKind, toKind, steps, message: '现代 → 现代（UCUM）' }
    }
    return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: ucum.message }
  }

  return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: '无法判定单位类别：' + from + ' / ' + to }
}

/**
 * 管道入口：纯换算式（数值 + 单位 to 单位）直接走管道。
 *
 * @param expression - 表达式
 * @returns 命中换算时返回结果；否则 null
 */
export function tryUnitPipeline(expression: string): UnitPipelineResult | null {
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s+(\S+)\s+to\s+(\S+)\s*$/.exec(expression)
  if (match === null) return null
  return convertUnits(Number(match[1]), match[2], match[3])
}
