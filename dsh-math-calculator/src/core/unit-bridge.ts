/**
 * 非现代单位桥：把古制/传统/地区单位自动换成现代单位参与计算，再换回去。
 *
 * 输入 `3 里/时辰` → 内部 `(3 × 500 m)/(7200 s)` → 输出 0.2083 m/s；
 * 若写 `to 里/时辰`，算完再换回。
 *
 * @module dsh-math-calculator/core/unit-bridge
 */

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
 * 非现代单位表（古制 + 英制 + 地区）。
 *
 * 因子来源：中国市制与英制标准值。
 * 不收来源不明或随地区大幅波动的；「亩」用 1929 市制 666.7 m²。
 */
export const NON_MODERN_UNITS: Record<string, BridgeUnit> = {
  分: { factor: 0.0032, si: 'm', dimension: 'length' },
  厘: { factor: 0.00032, si: 'm', dimension: 'length' },
  毫: { factor: 0.000032, si: 'm', dimension: 'length' },
  步: { factor: 1.6, si: 'm', dimension: 'length' },
  弓: { factor: 1.6, si: 'm', dimension: 'length' },
  舍: { factor: 14400, si: 'm', dimension: 'length' },
  驿: { factor: 43200, si: 'm', dimension: 'length' },
  英里: { factor: 1609.344, si: 'm', dimension: 'length' },
  英尺: { factor: 0.3048, si: 'm', dimension: 'length' },
  英寸: { factor: 0.0254, si: 'm', dimension: 'length' },
  码: { factor: 0.9144, si: 'm', dimension: 'length' },
  俄里: { factor: 1066.8, si: 'm', dimension: 'length' },
  日里: { factor: 3927.27, si: 'm', dimension: 'length' },
  钱: { factor: 0.005, si: 'kg', dimension: 'mass' },
  担: { factor: 50, si: 'kg', dimension: 'mass' },
  英石: { factor: 6.35029318, si: 'kg', dimension: 'mass' },
  磅: { factor: 0.45359237, si: 'kg', dimension: 'mass' },
  盎司: { factor: 0.028349523125, si: 'kg', dimension: 'mass' },
  短吨: { factor: 907.18474, si: 'kg', dimension: 'mass' },
  长吨: { factor: 1016.0469088, si: 'kg', dimension: 'mass' },
  日程: { factor: 86400, si: 's', dimension: 'time' },
  刻钟: { factor: 900, si: 's', dimension: 'time' },
  更: { factor: 7200, si: 's', dimension: 'time' },
  平方里: { factor: 250000, si: 'm2', dimension: 'area' },
  平方丈: { factor: 10.24, si: 'm2', dimension: 'area' },
  英亩: { factor: 4046.8564224, si: 'm2', dimension: 'area' },
  升: { factor: 0.001, si: 'm3', dimension: 'volume' },
  合: { factor: 0.0001, si: 'm3', dimension: 'volume' },
  勺: { factor: 0.00001, si: 'm3', dimension: 'volume' },
  撮: { factor: 0.000001, si: 'm3', dimension: 'volume' },
  加仑: { factor: 0.003785411784, si: 'm3', dimension: 'volume' },
  品脱: { factor: 0.000473176473, si: 'm3', dimension: 'volume' },
}

/** SI 单位 → 维度桶。 */
/** SI 及常用前缀单位的因子与维度（`t` 不是 1 kg，是 1000 kg——这里必须带因子）。 */
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
}

/**
 * 从 SI 单位取维度桶。
 *
 * @param unit - SI 单位写法
 * @returns 维度或 undefined
 */
export function dimensionOfSiUnit(unit: string): string | undefined {
  return SI_UNITS[unit]?.dimension
}

/** 一个替换结果。 */
export interface BridgeReplacement {
  unit: string
  factor: number
  si: string
  dimension: string
}

/**
 * 把表达式里的非现代单位换成 SI 数值形式。
 *
 * @param expression - 原表达式
 * @returns 替换后的表达式与被替换项
 */
export function toModernExpression(expression: string): { expression: string; replaced: BridgeReplacement[] } {
  let out = expression
  const replaced: BridgeReplacement[] = []
  /** 长的先换（平方丈 先于 丈，日程 先于 日）。 */
  const keys = Object.keys(NON_MODERN_UNITS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const index = out.indexOf(key)
    if (index < 0) continue
    /** 只在前一字符是数字/空格/运算符时替换，避免误伤普通汉字（「分」作为动词）。 */
    const before = index > 0 ? out[index - 1] : ' '
    if (!/[0-9\s(/*^]/.test(before)) continue
    const def = NON_MODERN_UNITS[key]
    out = out.slice(0, index) + '(' + def.factor + ' ' + def.si + ')' + out.slice(index + key.length)
    replaced.push({ unit: key, factor: def.factor, si: def.si, dimension: def.dimension })
  }
  return { expression: out, replaced }
}


/** 反向换算结果（现代 → 非现代）。 */
export interface BridgeExpressionResult {
  value: number
  text: string
  from: string
  to: string
  direction: 'to-modern' | 'from-modern' | 'both-non-modern'
}

/**
 * 识别「数值 + 单位 to 单位」并做桥接换算（含现代 → 非现代的反向）。
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
  const fromDef = NON_MODERN_UNITS[from]
  const toDef = NON_MODERN_UNITS[to]
  const fromSi = SI_UNITS[from]
  const toSi = SI_UNITS[to]

  /** 现代 → 非现代：value / toDef.factor，量纲要对上。 */
  if (fromSi !== undefined && toDef !== undefined) {
    if (fromSi.dimension !== toDef.dimension) {
      return { value, text: '', from, to, direction: 'from-modern' } /** 量纲不对：交给调用方报错 */
    }
    const converted = (value * fromSi.factor) / toDef.factor
    return { value: converted, text: String(converted) + ' ' + to, from, to, direction: 'from-modern' }
  }
  /** 两者都是非现代。 */
  if (fromDef !== undefined && toDef !== undefined) {
    const conversion = convertBridge(value, from, to)
    if (!conversion.ok || conversion.value === null) return null
    return { value: conversion.value, text: String(conversion.value) + ' ' + to, from, to, direction: 'both-non-modern' }
  }
  return null
}

/** 换算结果。 */
export interface BridgeConversion {
  ok: boolean
  value: number | null
  message: string
  from: string
  to: string
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
  const fromDef = NON_MODERN_UNITS[from]
  const toDef = NON_MODERN_UNITS[to]
  if (fromDef !== undefined && toDef !== undefined) {
    if (fromDef.dimension !== toDef.dimension) {
      return { ok: false, value: null, message: '量纲不同：' + from + '（' + fromDef.dimension + '）与 ' + to + '（' + toDef.dimension + '）', from, to }
    }
    return { ok: true, value: (value * fromDef.factor) / toDef.factor, message: '统一换成 SI 再相除', from, to }
  }
  return { ok: false, value: null, message: '桥接表里没有这对单位（' + from + ' → ' + to + '）', from, to }
}
