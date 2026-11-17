/**
 * 单位处理管道：用统一别名索引（4,764 条）判定现代/非现代，再做换算。
 *
 * ## 索引来源（src/data/unit-aliases.json）
 *
 * - UCUM 全表 767 条（code + name + 全部同义词）→ source: ucum，factor 已折 SI；
 * - 本地收录 1,032 别名（古制/英制/地区）→ source: local，同维度时覆盖或被覆盖均记录；
 * - 合计 4,764 别名。**别名不嫌多**：命中优先，避免「写对了名字却不认识」。
 *
 * ## 换算规则
 *
 * 同一维度内：结果 = 值 × 源 factor ÷ 目标 factor（factor 都折到 SI）。
 * 维度不同直接拒绝。UCUM 仍保留作后备校验（索引没有的单位）。
 *
 * @module dsh-math-calculator/core/unit-pipeline
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateUcumUnit } from './ucum.js'
import { DIMENSION_TO_SI } from './unit-bridge.js'
import { convertViaUcum } from './ucum-registry.js'

/** 复合单位条目（有物理意义）。 */
export interface CompoundEntry {
  symbol: string
  label: string
  dimVec: number[]
  category: string
}

let COMPOUNDS: Record<string, CompoundEntry> | null = null

/**
 * 读复合单位清单（unit-compounds.json）。
 *
 * @returns 归一符号 → 条目
 */
export function loadUnitCompounds(): Record<string, CompoundEntry> {
  if (COMPOUNDS !== null) return COMPOUNDS
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'unit-compounds.json')
    const data = JSON.parse(readFileSync(path, 'utf8')) as { compounds?: CompoundEntry[] }
    const map: Record<string, CompoundEntry> = {}
    for (const item of data.compounds ?? []) {
      /** 归一：`kg/m^3`、`kg/m³`、`kg·m-3` 都映射到 kg/m3。 */
      const normalized = item.symbol.replace(/\s+/g, '').replace(/\./g, '*').replace(/\^/g, '').replace(/[²³]/g, (c) => (c === '²' ? '2' : '3'))
      map[normalized] = item
      map[item.symbol] = item
    }
    COMPOUNDS = map
  } catch {
    COMPOUNDS = {}
  }
  return COMPOUNDS
}

/**
 * 识别复合单位的物理意义。
 *
 * @param unit - 单位写法
 * @returns 条目标签；不识别返回 null
 */
export function identifyCompound(unit: string): string | null {
  const normalized = String(unit).replace(/\s+/g, '').replace(/\./g, '*').replace(/\^/g, '').replace(/[²³]/g, (c) => (c === '²' ? '2' : '3'))
  const entry = loadUnitCompounds()[normalized]
  return entry !== undefined ? entry.label : null
}

/** 别名条目。 */
export interface UnitAliasEntry {
  source: 'ucum' | 'local'
  code: string
  name: string
  factor: number
  si: string
  dimension: string
}

let ALIASES: Record<string, UnitAliasEntry> | null = null

/**
 * 读统一别名索引（懒加载一次）。
 *
 * @returns 别名 → 条目
 */
export function loadUnitAliases(): Record<string, UnitAliasEntry> {
  if (ALIASES !== null) return ALIASES
  let base: Record<string, UnitAliasEntry> = {}
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'unit-aliases.json')
    const data = JSON.parse(readFileSync(path, 'utf8')) as { aliases?: Record<string, UnitAliasEntry> }
    base = data.aliases ?? {}
  } catch {
    base = {}
  }
  ALIASES = mergeUnitsAliases(base)
  return ALIASES
}

/**
 * 把 `units.json` 里的中文别名并进索引（2026-11-17）。
 *
 * ## 为什么必须合并
 *
 * `unit-aliases.json` 是**精选索引**（只收常用），而 `units.json` 是**全量表**
 * （459 条带中文别名）。两者不同步的后果：
 *
 * ```
 *   units.json 有「公尺/分米/公分/海里」 → 但索引里没有
 *   → convertUnits 落到 UCUM → 报语法错
 * ```
 *
 * 压测（R53）里 7 个单位缺失只是冰山一角：按全量扫，**459 条里只有 78 条能通**。
 *
 * 合并策略：
 * - 只补**中文名与中文别名**（ASCII 名交给 UCUM，避免与 mathjs 撞名）；
 * - 已存在的键不覆盖（精选索引优先，它带更准的 source/dimension）；
 * - 条目里的 `name` 是中文时，也把 `name` 本身作为别名。
 *
 * @param base - 精选索引
 * @returns 合并后的索引
 */
function mergeUnitsAliases(base: Record<string, UnitAliasEntry>): Record<string, UnitAliasEntry> {
  const merged: Record<string, UnitAliasEntry> = { ...base }
  let allUnits: Array<Record<string, unknown>> = []
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'units.json')
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const list = data['ALL_UNITS']
    if (Array.isArray(list)) allUnits = list as Array<Record<string, unknown>>
  } catch {
    return merged
  }
  const isCjk = (text: string): boolean => /[\u4e00-\u9fa5]/.test(text)
  for (const unit of allUnits) {
    const name = typeof unit['name'] === 'string' ? unit['name'] : ''
    const factor = typeof unit['factor'] === 'number' ? unit['factor'] : Number.NaN
    const dimension = typeof unit['dimension'] === 'string' ? unit['dimension'] : ''
    if (name === '' || !Number.isFinite(factor)) continue
    const si = DIMENSION_TO_SI[dimension] ?? ''
    const aliases = Array.isArray(unit['aliases']) ? (unit['aliases'] as unknown[]).map(String) : []
    /** 参与合并的写法：name 是中文就用 name，另加全部中文别名。 */
    const names: string[] = []
    if (isCjk(name)) names.push(name)
    for (const alias of aliases) if (isCjk(alias)) names.push(alias)
    for (const alias of names) {
      if (merged[alias] !== undefined) continue
      merged[alias] = { source: 'local', code: name, name, factor, si, dimension }
    }
  }
  return merged
}

/**
 * 判定单位类别。
 *
 * @param unit - 单位写法
 * @returns modern（UCUM）/ nonmodern（本地桥接）/ unknown
 */
export function classifyUnit(unit: string): 'modern' | 'nonmodern' | 'unknown' {
  if (typeof unit !== 'string' || unit.trim() === '') return 'unknown'
  const entry = loadUnitAliases()[unit]
  if (entry !== undefined) return entry.source === 'ucum' ? 'modern' : 'nonmodern'
  try {
    if (validateUcumUnit(unit).valid) return 'modern'
  } catch {
    /* UCUM 不可用 */
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
  steps: string[]
  message: string
}

/**
 * 单位换算（统一索引 + 维度校验）。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算结果与步骤
 */
export function convertUnits(value: number, from: string, to: string): UnitPipelineResult {
  const aliases = loadUnitAliases()
  const fromDef = aliases[from]
  const toDef = aliases[to]
  const fromKind = classifyUnit(from)
  const toKind = classifyUnit(to)
  const steps: string[] = []

  if (fromDef !== undefined && toDef !== undefined) {
    if (fromDef.dimension !== toDef.dimension && fromDef.dimension !== 'other' && toDef.dimension !== 'other') {
      return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: '量纲不同：' + fromDef.dimension + ' vs ' + toDef.dimension }
    }
    /** 优先借 UCUM 引擎（本地单位已注册进 UnitTables），失败再按索引因子相除。 */
    const viaUcum = convertViaUcum(value, from, to)
    if (viaUcum !== null) {
      steps.push('UCUM 引擎（含注册的本地单位）')
      /** 复合单位附中文物理意义，便于 AI 直接引用。 */
      const labels = [identifyCompound(from), identifyCompound(to)].filter((item): item is string => item !== null)
      const hint = labels.length > 0 ? '（' + [...new Set(labels)].join(' / ') + '）' : ''
      return { ok: true, value: viaUcum, text: String(viaUcum) + ' ' + to + hint, from, to, fromKind, toKind, steps, message: 'UCUM 引擎换算' }
    }
    const converted = (value * fromDef.factor) / toDef.factor
    steps.push(from + '（' + fromDef.source + '，×' + fromDef.factor + '）', to + '（' + toDef.source + '，÷' + toDef.factor + '）')
    const kind = fromDef.source === 'ucum' && toDef.source === 'ucum' ? '现代 → 现代（索引直通）' : fromDef.source === 'ucum' ? '现代 → 非现代（回写）' : toDef.source === 'ucum' ? '非现代 → 现代（桥接）' : '非现代 → 非现代（桥接）'
    return { ok: true, value: converted, text: String(converted) + ' ' + to, from, to, fromKind, toKind, steps, message: kind }
  }

  /** 索引没有（多半是复合单位）：直接交 UCUM 引擎。 */
  {
    const viaUcum = convertViaUcum(value, from, to)
    if (viaUcum !== null) {
      const labels = [identifyCompound(from), identifyCompound(to)].filter((item): item is string => item !== null)
      const hint = labels.length > 0 ? '（' + [...new Set(labels)].join(' / ') + '）' : ''
      steps.push('UCUM 引擎（复合单位）')
      return { ok: true, value: viaUcum, text: String(viaUcum) + ' ' + to + hint, from, to, fromKind, toKind, steps, message: 'UCUM 引擎换算（复合单位）' }
    }
  }

  if (fromKind === 'modern' && toKind === 'modern') {
    return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: '索引未收录这对单位（' + from + ' → ' + to + '），UCUM 也认不出' }
  }
  return { ok: false, value: null, text: '', from, to, fromKind, toKind, steps, message: '无法判定单位：' + (fromDef === undefined ? from : to) }
}

/**
 * 管道入口：纯换算式（数值 + 单位 to 单位）。
 *
 * @param expression - 表达式
 * @returns 命中换算时返回结果；否则 null
 */
export function tryUnitPipeline(expression: string): UnitPipelineResult | null {
  const match = /^\s*([+-]?\d+(?:\.\d+)?)\s+(\S+)\s+to\s+(\S+)\s*$/.exec(expression)
  if (match === null) return null
  return convertUnits(Number(match[1]), match[2], match[3])
}
