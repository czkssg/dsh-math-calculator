/**
 * 非现代单位桥：把单位体系里**全部**非 SI 单位自动换成 SI 参与计算，再换回去。
 *
 * ## 数据来源（不再手写 32 个）
 *
 * `src/data/units.json` 的 `ALL_UNITS`：465 个单位、587 个别名、32 个维度。
 * 每个条目带 `factor`（到基准单位的倍数）、`dimension`、`aliases`（中文/历史/地区写法）。
 *
 * 手写的 `EXTRA_BRIDGE` 只补数据表**没有**的架空常用单位（舍/驿/日程/更…）。
 *
 * ## 维度 → SI 基准
 *
 * units.json 的 dimension 是 32 种字符串；每一种映射到一个 SI 基准单位
 * （见 `DIMENSION_TO_SI`）。桥接换算 = 值 × 源 factor ÷ 目标 factor。
 *
 * @module dsh-math-calculator/core/unit-bridge
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 桥接单位定义。 */
export interface BridgeUnit {
  /** 换算到 SI 的因子。 */
  factor: number
  /** SI 单位写法（mathjs/UCUM 都认）。 */
  si: string
  /** 量纲桶。 */
  dimension: string
}

/**
 * 维度 → SI 基准单位。
 *
 * 覆盖 units.json 里出现的全部 32 个 dimension。
 */
export const DIMENSION_TO_SI: Record<string, string> = {
  length: 'm',
  mass: 'kg',
  time: 's',
  area: 'm2',
  volume: 'm3',
  energy: 'J',
  power: 'W',
  temperature: 'K',
  speed: 'm/s',
  pressure: 'Pa',
  data: 'byte',
  angle: 'rad',
  force: 'N',
  frequency: 'Hz',
  current: 'A',
  amount_of_substance: 'mol',
  luminous_intensity: 'cd',
  solid_angle: 'sr',
  charge: 'C',
  voltage: 'V',
  capacitance: 'F',
  resistance: 'Ohm',
  conductance: 'S',
  magnetic_flux: 'Wb',
  magnetic_flux_density: 'T',
  inductance: 'H',
  luminous_flux: 'lm',
  illuminance: 'lux',
  activity: 'Bq',
  absorbed_dose: 'Gy',
  dose_equivalent: 'Sv',
  catalytic_activity: 'kat',
}

/** units.json 里的一条单位。 */
interface UnitEntry {
  name: string
  aliases?: string[]
  dimension: string
  factor: number
}

/**
 * 手写补充：units.json 没收录、但架空设定常见的单位。
 *
 * 只补「确实没有」的；已有的不重复（合并时以数据表为准）。
 */
const EXTRA_BRIDGE: Record<string, BridgeUnit> = {
  舍: { factor: 14400, si: 'm', dimension: 'length' },
  驿: { factor: 43200, si: 'm', dimension: 'length' },
  日程: { factor: 86400, si: 's', dimension: 'time' },
  更: { factor: 7200, si: 's', dimension: 'time' },
  刻钟: { factor: 900, si: 's', dimension: 'time' },
  俄里: { factor: 1066.8, si: 'm', dimension: 'length' },
  日里: { factor: 3927.27, si: 'm', dimension: 'length' },
  平方里: { factor: 250000, si: 'm2', dimension: 'area' },
  平方丈: { factor: 10.24, si: 'm2', dimension: 'area' },
  撮: { factor: 0.000001, si: 'm3', dimension: 'volume' },
}

/** 后加载的完整桥接表（首次使用时构建）。 */
let ALL_BRIDGE: Record<string, BridgeUnit> | null = null

/**
 * 构建完整桥接表（全部单位 + 全部别名）。
 *
 * @returns 别名/名称 → 桥接定义
 */
export function buildBridgeTable(): Record<string, BridgeUnit> {
  if (ALL_BRIDGE !== null) return ALL_BRIDGE
  const table: Record<string, BridgeUnit> = { ...EXTRA_BRIDGE }
  try {
    /** 穷举映射（1032 个别名，32 个维度）由 scripts 生成，构建时直接读，不再现场推导。 */
    const bridgePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'unit-bridge.json')
    const data = JSON.parse(readFileSync(bridgePath, 'utf8')) as { entries?: Array<{ alias: string; factor: number; si: string; dimension: string }> }
    if (Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        if (SI_UNITS[entry.alias] !== undefined) continue
        table[entry.alias] = { factor: entry.factor, si: entry.si, dimension: entry.dimension }
      }
      ALL_BRIDGE = table
      return table
    }
    const unitsPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'units.json')
    const units = JSON.parse(readFileSync(unitsPath, 'utf8')) as { ALL_UNITS?: UnitEntry[] }
    for (const unit of units.ALL_UNITS ?? []) {
      const si = DIMENSION_TO_SI[unit.dimension]
      if (si === undefined) continue
      /** SI 本身与常用前缀（m/s/kg/…）不进桥接表——否则会替换掉自己刚插入的 SI 单位。 */
      if (SI_UNITS[unit.name] !== undefined) continue
      /** 语法关键字（to/in/as）与含斜杠的复合单位（km/h、m/s）不进表：桥接只管原子单位。 */
      if (['to', 'in', 'as', 'and', 'per'].includes(unit.name) || unit.name.includes('/')) continue
      const def: BridgeUnit = { factor: unit.factor, si, dimension: unit.dimension }
      /** 名称与全部别名都进表（别名是中文/历史/地区写法）。 */
      table[unit.name] = def
      for (const alias of unit.aliases ?? []) {
        if (SI_UNITS[alias] !== undefined) continue
        table[alias] = def
      }
    }
  } catch {
    /* 数据文件读不到：只用手写补充，不至于整个功能挂掉 */
  }
  ALL_BRIDGE = table
  return table
}

/** 非现代单位表（构建后的别名全表）。 */
export const NON_MODERN_UNITS: Record<string, BridgeUnit> = new Proxy({} as Record<string, BridgeUnit>, {
  get: (_target, key) => (typeof key === 'string' ? buildBridgeTable()[key] : undefined),
  ownKeys: () => Object.keys(buildBridgeTable()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
})

/** 一个替换结果。 */
export interface BridgeReplacement {
  unit: string
  factor: number
  si: string
  dimension: string
}

/**
 * 把表达式里的非 SI 单位换成 SI 数值形式。
 *
 * @param expression - 原表达式
 * @returns 替换后的表达式与被替换项
 */
export function toModernExpression(expression: string): { expression: string; replaced: BridgeReplacement[] } {
  let out = expression
  const replaced: BridgeReplacement[] = []
  const table = buildBridgeTable()
  /** 长的先换（平方丈 先于 丈，日程 先于 日）。 */
  const keys = Object.keys(table)
    .filter((key) => !key.includes('/') && !['to', 'in', 'as', 'and', 'per'].includes(key))
    .sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const index = out.indexOf(key)
    if (index < 0) continue
    /** 只在前一字符是数字/空格/运算符时替换，避免误伤普通汉字。 */
    const before = index > 0 ? out[index - 1] : ' '
    if (!/[0-9\s(/*^]/.test(before)) continue
    const def = table[key]
    out = out.slice(0, index) + '(' + def.factor + ' ' + def.si + ')' + out.slice(index + key.length)
    replaced.push({ unit: key, factor: def.factor, si: def.si, dimension: def.dimension })
  }
  return { expression: out, replaced }
}

/** 换算结果。 */
export interface BridgeConversion {
  ok: boolean
  value: number | null
  message: string
  from: string
  to: string
}

/** SI 及常用前缀单位（带因子：t 是 1000 kg）。 */
const SI_UNITS: Record<string, { factor: number; dimension: string }> = {
  m: { factor: 1, dimension: 'length' },
  km: { factor: 1000, dimension: 'length' },
  cm: { factor: 0.01, dimension: 'length' },
  mm: { factor: 0.001, dimension: 'length' },
  um: { factor: 1e-6, dimension: 'length' },
  nm: { factor: 1e-9, dimension: 'length' },
  kg: { factor: 1, dimension: 'mass' },
  g: { factor: 0.001, dimension: 'mass' },
  mg: { factor: 1e-6, dimension: 'mass' },
  t: { factor: 1000, dimension: 'mass' },
  tonne: { factor: 1000, dimension: 'mass' },
  s: { factor: 1, dimension: 'time' },
  min: { factor: 60, dimension: 'time' },
  h: { factor: 3600, dimension: 'time' },
  d: { factor: 86400, dimension: 'time' },
  day: { factor: 86400, dimension: 'time' },
  m2: { factor: 1, dimension: 'area' },
  km2: { factor: 1e6, dimension: 'area' },
  cm2: { factor: 1e-4, dimension: 'area' },
  m3: { factor: 1, dimension: 'volume' },
  L: { factor: 0.001, dimension: 'volume' },
  l: { factor: 0.001, dimension: 'volume' },
  mL: { factor: 1e-6, dimension: 'volume' },
  J: { factor: 1, dimension: 'energy' },
  kW: { factor: 1000, dimension: 'power' },
  W: { factor: 1, dimension: 'power' },
  Pa: { factor: 1, dimension: 'pressure' },
  N: { factor: 1, dimension: 'force' },
  K: { factor: 1, dimension: 'temperature' },
  Hz: { factor: 1, dimension: 'frequency' },
  rad: { factor: 1, dimension: 'angle' },
}

/**
 * 从 SI 单位取维度。
 *
 * @param unit - SI 单位写法
 * @returns 维度或 undefined
 */
export function dimensionOfSiUnit(unit: string): string | undefined {
  return SI_UNITS[unit]?.dimension
}

/**
 * 非现代单位之间（含非现代 ↔ 现代）的换算。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算结果
 */
export function convertBridge(value: number, from: string, to: string): BridgeConversion {
  const table = buildBridgeTable()
  const fromDef = table[from]
  const toDef = table[to]
  if (fromDef !== undefined && toDef !== undefined) {
    if (fromDef.dimension !== toDef.dimension) {
      return { ok: false, value: null, message: '量纲不同：' + from + '（' + fromDef.dimension + '）与 ' + to + '（' + toDef.dimension + '）', from, to }
    }
    return { ok: true, value: (value * fromDef.factor) / toDef.factor, message: '统一换成 SI 再相除', from, to }
  }
  return { ok: false, value: null, message: '桥接表里没有这对单位（' + from + ' → ' + to + '）', from, to }
}

/** 反向换算结果。 */
export interface BridgeExpressionResult {
  value: number
  text: string
  from: string
  to: string
  direction: 'to-modern' | 'from-modern' | 'both-non-modern'
}

/**
 * 识别「数值 + 单位 to 单位」并做桥接换算（含现代 → 非现代）。
 *
 * @param expression - 表达式
 * @returns 换算结果；不是纯换算式时返回 null
 */
export function tryBridgeConversion(expression: string): BridgeExpressionResult | null {
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s+(\S+)\s+to\s+(\S+)\s*$/.exec(expression)
  if (match === null) return null
  const value = Number(match[1])
  const from = match[2]
  const to = match[3]
  const table = buildBridgeTable()
  const fromDef = table[from]
  const toDef = table[to]
  const fromSi = SI_UNITS[from]
  const toSi = SI_UNITS[to]

  if (fromSi !== undefined && toDef !== undefined) {
    if (fromSi.dimension !== toDef.dimension) {
      return { value, text: '', from, to, direction: 'from-modern' }
    }
    const converted = (value * fromSi.factor) / toDef.factor
    return { value: converted, text: String(converted) + ' ' + to, from, to, direction: 'from-modern' }
  }
  if (fromDef !== undefined && toSi !== undefined) {
    if (fromDef.dimension !== toSi.dimension) {
      return { value, text: '', from, to, direction: 'to-modern' }
    }
    const converted = (value * fromDef.factor) / toSi.factor
    return { value: converted, text: String(converted) + ' ' + to, from, to, direction: 'to-modern' }
  }
  if (fromDef !== undefined && toDef !== undefined) {
    const conversion = convertBridge(value, from, to)
    if (!conversion.ok || conversion.value === null) return null
    return { value: conversion.value, text: String(conversion.value) + ' ' + to, from, to, direction: 'both-non-modern' }
  }
  return null
}
