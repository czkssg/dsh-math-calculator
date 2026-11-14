/**
 * UCUM 复合单位：复用美国国立医学图书馆（NLM）的成熟实现。
 *
 * ## 为什么接它
 *
 * 自建单位表（`units.json`）是**扁平标量表**，复合单位靠手写判定，已经三次补丁失败：
 * 上标 `kg/m³` 不认、`mol/L` 不认、任意幂 `m^4` 不认。复合单位需要的是
 * **量纲代数 + 词法解析**，这正是 UCUM 标准与 `@lhncbc/ucum-lhc` 的能力。
 *
 * ## 中文注释在哪
 *
 * 1. `CJK_TO_UCUM`：中文单位 → UCUM 码（吨→t、年→a、桶→[bbl_us]、千克→kg…）；
 * 2. `SUPERSCRIPT`：`²³⁴⁰⁻¹` → `2 3 4 0 -1`（UCUM 的幂写法是 `m3`）；
 * 3. 每个常量/函数上方都有一句「它解决什么」。
 *
 * ## 边界（照实说）
 *
 * - UCUM 是国际科学标准，**不含中国古制单位**（里/丈/亩/时辰/石）——
 *   这些只在扁平表里，复合式里出现古制单位仍由 mathjs 处理；
 * - `@lhncbc/ucum-lhc` 的许可要求遵守 `ucum.org/license`（学术/个人免费），
 *   商用前需自行确认；
 * - 本模块只做**校验与换算**，不替代 mathjs 的算术（表达式求值仍走 mathjs）。
 *
 * @module dsh-math-calculator/core/ucum
 */

import { createRequire } from 'node:module'

/**
 * 中文单位 → UCUM 码。
 *
 * 只收「确定性映射」：一个中文名在 UCUM 里有唯一码的才收。
 * 古制单位（里/丈/尺/寸/斤/两）**不收**——UCUM 没有，硬映射会静默造错值。
 */
export const CJK_TO_UCUM: Record<string, string> = {
  吨: 't',
  公吨: 't',
  年: 'a',
  月: 'mo',
  天: 'd',
  日: 'd',
  小时: 'h',
  分钟: 'min',
  秒: 's',
  千克: 'kg',
  克: 'g',
  毫克: 'mg',
  米: 'm',
  千米: 'km',
  厘米: 'cm',
  毫米: 'mm',
  升: 'L',
  毫升: 'mL',
  桶: '[bbl_us]',
  石油桶: '[bbl_us]',
  摩尔: 'mol',
  开尔文: 'K',
  摄氏度: 'Cel',
  瓦: 'W',
  千瓦: 'kW',
  焦耳: 'J',
  千焦: 'kJ',
  帕: 'Pa',
  千帕: 'kPa',
  兆帕: 'MPa',
  赫兹: 'Hz',
  伏: 'V',
  安: 'A',
  欧姆: 'Ohm',
  帕斯卡秒: 'Pa.s',
};

/** 上标 → UCUM 幂写法。 */
const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

/**
 * 把中文/上标复合单位归一成 UCUM 写法。
 *
 * @param unit - 原始写法（如 `kg/m³`、`吨/年`）
 * @returns UCUM 写法（如 `kg/m3`、`t/a`）
 */
export function toUcum(unit: string): string {
  if (typeof unit !== 'string') return ''
  let out = unit.replace(/\s+/g, '')
  /** 上标去位（³ → 3）。 */
  for (const [sup, digit] of Object.entries(SUPERSCRIPT)) out = out.split(sup).join(digit)
  /** 中文单位替换（长的先换，避免「吨」吃掉「公吨」）。 */
  const keys = Object.keys(CJK_TO_UCUM).sort((a, b) => b.length - a.length)
  for (const key of keys) out = out.split(key).join(CJK_TO_UCUM[key])
  return out
}

/** 校验结果。 */
export interface UcumValidation {
  valid: boolean
  message: string
  original: string
  ucum: string
}

/** UCUM 实例（懒加载，避免常驻开销）。 */
let utils: { validateUnitString: (unit: string, suggest?: boolean) => { status: string; msg?: string[]; suggestions?: string[] }; convertUnitTo: (from: string, value: number, to: string) => { status: string; toVal?: number; msg?: string[] } } | null = null

/** 取 UCUM 工具实例（首次调用时加载）。 */
function getUtils(): NonNullable<typeof utils> {
  if (utils !== null) return utils
  /**
   * 用 createRequire 而不是裸 `require`：
   * lib 是 ESM（module: esnext），裸 require 在 ESM 下不存在，
   * 结果 UCUM 永远返回 null（探针实测：CJS 下能过、ESM 下静默失败）。
   */
  const requireLocal = createRequire(import.meta.url)
  const { UcumLhcUtils } = requireLocal('@lhncbc/ucum-lhc') as { UcumLhcUtils: { getInstance: () => NonNullable<typeof utils> } }
  utils = UcumLhcUtils.getInstance()
  return utils
}

/**
 * 校验一个复合单位。
 *
 * @param unit - 单位写法
 * @returns 校验结果（含 UCUM 写法与建议）
 */
export function validateUcumUnit(unit: string): UcumValidation {
  const ucum = toUcum(unit)
  try {
    const result = getUtils().validateUnitString(ucum, true)
    return {
      valid: result.status === 'valid',
      message: result.status === 'valid' ? '合法' : (result.msg ?? []).join('；') || 'UCUM 不认这个单位',
      original: unit,
      ucum,
    }
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error), original: unit, ucum }
  }
}

/** 换算结果。 */
export interface UcumConversion {
  ok: boolean
  value: number | null
  message: string
  from: string
  to: string
}

/**
 * 用 UCUM 做复合单位换算（`kg/m³ → g/cm³` 这类）。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算结果
 */

/** 换算式的解析结果。 */
export interface UcumExpressionResult {
  value: number
  text: string
  from: string
  to: string
}

/**
 * 识别「数值 + 源单位 to 目标单位」的纯换算式。
 *
 * @param expression - 表达式
 * @returns 换算结果；不像换算式或 UCUM 不认时返回 null
 */
export function tryUcumExpression(expression: string): UcumExpressionResult | null {
  /** 先把上标统一成普通数字（³→3），再按空白切三段——比在正则里枚举字符稳。 */
  const flattened = expression.replace(/[²³⁴⁰⁵⁶⁷⁸⁹⁻¹]/g, (char) => ({ '²': '2', '³': '3', '⁴': '4', '⁰': '0', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '¹': '1' } as Record<string, string>)[char] ?? char)
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s+(\S+)\s+to\s+(\S+)\s*$/.exec(flattened)
  if (match === null) return null
  const conversion = convertUcum(Number(match[1]), match[2], match[3])
  if (!conversion.ok || conversion.value === null) return null
  return { value: conversion.value, text: String(conversion.value) + ' ' + match[3], from: match[2], to: match[3] }
}

/**
 * 换算结果。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算结果（ok/value/message）
 */
export function convertUcum(value: number, from: string, to: string): UcumConversion {
  const fromUcum = toUcum(from)
  const toUcumText = toUcum(to)
  try {
    const result = getUtils().convertUnitTo(fromUcum, value, toUcumText)
    if (result.status === 'succeeded' && typeof result.toVal === 'number') {
      return { ok: true, value: result.toVal, message: 'UCUM 换算', from: fromUcum, to: toUcumText }
    }
    return { ok: false, value: null, message: (result.msg ?? []).join('；') || 'UCUM 换算失败', from: fromUcum, to: toUcumText }
  } catch (error) {
    return { ok: false, value: null, message: error instanceof Error ? error.message : String(error), from: fromUcum, to: toUcumText }
  }
}
