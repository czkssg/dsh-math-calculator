/**
 * 符号表：每个符号在不同公式里代表什么物理量。
 *
 * 为什么需要（用户要求）：
 *   1. 公式库要能被后来的人或 AI 读懂 —— 光有 id 和表达式不够，
 *      还得知道 m 是质量还是米、T 是温度还是周期；
 *   2. 同一个字母不可避免会被复用（m 可以是质量/米/分钟），
 *      所以要用「符号 + 语境」区分，而不是假装没有冲突。
 *
 * 做法：**从公式本身自动生成**符号索引，而不是手工维护第二份表——
 * 手工表一定会和公式脱节。参数名就是表达式里的符号（m1、r、T…），
 * 单位与概念从参数描述里解析（例如 "质量1 kg" → 概念=质量1，单位=kg）。
 *
 * 消歧语法：`symbol@提示`，例如 `m@质量`、`r@半径`。
 *
 * @module dsh-math-calculator/symbols
 */

import { FORMULAS, type FormulaDef } from './formulas.js'

/** 一个符号在某条公式里的含义。 */
export interface SymbolMeaning {
  /** 符号本身（表达式里怎么写的）。 */
  symbol: string
  /** 物理概念（从参数描述解析）。 */
  concept: string
  /** 单位（从参数描述解析，可能为空）。 */
  unit: string
  /** 所属公式 id。 */
  formulaId: string
  formulaName: string
  category: string
}

/** 常见多义符号的人工提示（自动索引之外的补充说明）。 */
const SYMBOL_NOTES: Record<string, string> = {
  m: '质量（kg）、米（m）、分钟（min）都可能写作 m —— 看所属公式与单位',
  r: '半径、距离、速率都可能写作 r —— 看单位与公式语境',
  T: '温度（K）、周期（s）、张力（N）都可能写作 T',
  A: '面积（m²）、振幅、安培（A）都可能写作 A',
  V: '体积（m³）、电压（V）、速度都可能写作 V',
  E: '能量（J）、电场强度（V/m）、弹性模量（Pa）都可能写作 E',
  P: '功率（W）、压强（Pa）、周期都可能写作 P',
  L: '长度、角动量、光度（L☉）都可能写作 L',
  R: '半径、电阻（Ω）、气体常数都可能写作 R',
  C: '电容（F）、浓度、热容都可能写作 C',
  N: '力（N）、数量、匝数都可能写作 N',
  K: '开尔文（K）、体积模量、平衡常数都可能写作 K',
  d: '距离、直径、厚度都可能写作 d',
  t: '时间（s）、厚度、温度（口语）都可能写作 t',
  v: '速度（m/s）、比容都可能写作 v',
  a: '加速度（m/s²）、半长轴（m）、面积都可能写作 a',
}

/**
 * 单位白名单（从参数描述尾部识别）。
 *
 * 用「按长度倒序的字符串后缀匹配」而不是正则：
 * 单位里有 `/`、`^`、`(` 这些正则元字符，手写正则会不断被转义问题咬到。
 */
const UNIT_ALIASES: string[] = [
  'J/(kg·K)',
  'J/(mol·K)',
  'W/(m·K)',
  'kg/m^3',
  'W/m^2',
  'm/s^2',
  'kg·m/s',
  'N·m',
  'K/km',
  'm/s',
  'm^2',
  'm^3',
  'GPa',
  'MPa',
  'kPa',
  'eV',
  'kg',
  'km',
  'cm',
  'mm',
  'AU',
  'ly',
  'pc',
  'mol',
  'Pa',
  'Hz',
  'rad',
  'dB',
  'm',
  's',
  'N',
  'J',
  'W',
  'K',
  'A',
  'V',
  'F',
  'H',
  'S',
  'T',
  'C',
  'Ω',
  '°',
  '%',
]

/** 按长度倒序（长单位优先，避免 "m/s" 被 "s" 截断）。 */
const UNIT_BY_LENGTH = [...UNIT_ALIASES].sort((a, b) => b.length - a.length)

/**
 * 从参数描述里解析「概念 + 单位」。
 * 例："质量1 kg" → { concept: '质量1', unit: 'kg' }
 *     "距离 m"   → { concept: '距离', unit: 'm' }
 *     "数组"     → { concept: '数组', unit: '' }
 */
export function parseParamDesc(desc: string): { concept: string; unit: string } {
  const text = String(desc ?? '').trim()
  for (const unit of UNIT_BY_LENGTH) {
    if (text.endsWith(unit)) {
      const concept = text
        .slice(0, text.length - unit.length)
        .replace(/[\s，,．.、:：;；\-]+$/g, '')
        .trim()
      return { concept: concept || text, unit }
    }
  }
  return { concept: text, unit: '' }
}

/** 构建符号索引：符号 → 全部含义。 */
export function buildSymbolIndex(): Map<string, SymbolMeaning[]> {
  const index = new Map<string, SymbolMeaning[]>()
  for (const formula of FORMULAS) {
    for (const [symbol, spec] of Object.entries(formula.params)) {
      const { concept, unit } = parseParamDesc(spec.desc)
      const meaning: SymbolMeaning = {
        symbol,
        concept,
        unit,
        formulaId: formula.id,
        formulaName: formula.name,
        category: formula.cat,
      }
      const list = index.get(symbol) ?? []
      if (!list.some((item) => item.formulaId === formula.id)) list.push(meaning)
      index.set(symbol, list)
    }
  }
  return index
}

/** 某个符号的全部含义。 */
export function symbolMeanings(symbol: string): SymbolMeaning[] {
  return buildSymbolIndex().get(symbol.trim()) ?? []
}

/**
 * 消歧：按提示过滤含义。提示可以是概念、公式 id、分类或公式名的子串。
 * @param symbol - 符号，如 "m"。
 * @param hint - 语境提示，如 "质量" / "gravitation" / "physics/gravity"。
 */
export function resolveSymbol(symbol: string, hint?: string): SymbolMeaning[] {
  const all = symbolMeanings(symbol)
  if (!hint || hint.trim() === '') return all
  const text = hint.trim().toLowerCase()
  return all.filter(
    (item) =>
      item.concept.toLowerCase().includes(text) ||
      item.formulaId.toLowerCase().includes(text) ||
      item.formulaName.toLowerCase().includes(text) ||
      item.category.toLowerCase().includes(text) ||
      item.unit.toLowerCase().includes(text),
  )
}

/** 多义符号列表：同一符号在不同公式里概念不同。 */
export function ambiguousSymbols(limit = 40): Array<{ symbol: string; count: number; concepts: string[]; note?: string }> {
  const out: Array<{ symbol: string; count: number; concepts: string[]; note?: string }> = []
  for (const [symbol, meanings] of buildSymbolIndex()) {
    const concepts = [...new Set(meanings.map((item) => item.concept))]
    if (concepts.length > 1) {
      out.push({ symbol, count: meanings.length, concepts: concepts.slice(0, 6), note: SYMBOL_NOTES[symbol] })
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit)
}

/** 生成给 AI/人看的符号说明（逐行）。 */
export function explainSymbol(symbol: string, hint?: string): string[] {
  const matches = resolveSymbol(symbol, hint)
  const note = SYMBOL_NOTES[symbol]
  const lines: string[] = []
  if (matches.length === 0) {
    lines.push(`没有找到符号 "${symbol}"${hint ? `（提示：${hint}）` : ''}。`)
    return lines
  }
  lines.push(`符号 "${symbol}" 在 ${matches.length} 条公式里出现${hint ? `（已按 "${hint}" 过滤）` : ''}：`)
  for (const item of matches.slice(0, 20)) {
    lines.push(
      `  · ${item.formulaId}（${item.formulaName}）：${item.concept}${item.unit ? ` [${item.unit}]` : ''}`,
    )
  }
  if (matches.length > 20) lines.push(`  …还有 ${matches.length - 20} 条`)
  if (note) lines.push(`提示：${note}`)
  lines.push('用法：query="symbol:m@质量" 可缩到具体含义。')
  return lines
}

/** 给公式参数补上符号元数据（供展示/JSON 用）。 */
export function annotateFormula(formula: FormulaDef): Array<{ symbol: string; concept: string; unit: string; defaultValue: number | null }> {
  return Object.entries(formula.params).map(([symbol, spec]) => {
    const { concept, unit } = parseParamDesc(spec.desc)
    return { symbol, concept, unit, defaultValue: spec.value }
  })
}
