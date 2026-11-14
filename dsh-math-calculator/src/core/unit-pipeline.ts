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
import { convertViaUcum } from './ucum-registry.js'

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
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'unit-aliases.json')
    const data = JSON.parse(readFileSync(path, 'utf8')) as { aliases?: Record<string, UnitAliasEntry> }
    ALIASES = data.aliases ?? {}
  } catch {
    ALIASES = {}
  }
  return ALIASES
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
      return { ok: true, value: viaUcum, text: String(viaUcum) + ' ' + to, from, to, fromKind, toKind, steps, message: 'UCUM 引擎换算' }
    }
    const converted = (value * fromDef.factor) / toDef.factor
    steps.push(from + '（' + fromDef.source + '，×' + fromDef.factor + '）', to + '（' + toDef.source + '，÷' + toDef.factor + '）')
    const kind = fromDef.source === 'ucum' && toDef.source === 'ucum' ? '现代 → 现代（索引直通）' : fromDef.source === 'ucum' ? '现代 → 非现代（回写）' : toDef.source === 'ucum' ? '非现代 → 现代（桥接）' : '非现代 → 非现代（桥接）'
    return { ok: true, value: converted, text: String(converted) + ' ' + to, from, to, fromKind, toKind, steps, message: kind }
  }

  /** 索引没有：交 UCUM 校验/换算。 */
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
