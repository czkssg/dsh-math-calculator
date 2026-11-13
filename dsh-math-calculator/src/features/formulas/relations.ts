/**
 * 公式关系图：通过**共用物理量、共用常数与共性**把 740 条公式连起来。
 *
 * ## 为什么要按「物理量」而不是「符号名」
 *
 * 同名符号不等于同义：`m` 可能是质量，也可能是「阳离子计量数」；
 * `n` 可能是物质的量、项数、折射率、人口……实测 740 条公式里
 * 同名符号最多有 28 种含义。
 *
 * 所以每个参数除 `desc` 外还有一个 **`quantity`（语义标签）**：
 * ```
 *   { "value": 1, "desc": "物质的量 mol", "quantity": "物质的量" }
 * ```
 * 关系图按 quantity 连边——`ideal_gas` 的 `n`（物质的量）会和
 * `isothermal_work` 的 `n`（物质的量）强连，而不会和 `compound_interest`
 * 的 `n`（期数）混在一起；后者会被标成「同名异义」。
 *
 * ## 三类边（权重不同）
 *
 * ```
 *   共用物理量  ×2  ← quantity 相同（跨符号也算，如 m 与 mass）
 *   共用常数    ×1  ← 参数名是常数（k、h、c、G、R…）
 *   同名异义    ×0.5 ← 同一符号、不同含义：连上但标注「别混用」
 *   同类别/标签 ×0.5
 * ```
 *
 * @module dsh-math-calculator/features/formulas/relations
 */

import type { FormulaEntry } from './query.js'

/** 一条相邻关系。 */
export interface RelationHit {
  id: string
  name: string
  cat: string
  score: number
  /** 共用的物理量（语义标签），如「质量」「速度」。 */
  sharedQuantities: string[]
  /** 同符号且同义的符号名，如 m、v。 */
  sharedSymbols: string[]
  /** 同名异义：符号与两种含义。 */
  symbolConflicts: Array<{ symbol: string; meanings: string[] }>
  sharedConstants: string[]
  sameCat: boolean
  sharedKeys: string[]
}

/** 关系索引。 */
export interface RelationIndex {
  neighbors: (id: string, limit?: number) => RelationHit[]
  stats: () => { formulas: number; edges: number; constants: number; quantities: number }
}

/** 分数权重。 */
const WEIGHT = { quantity: 2, constant: 1, conflict: 0.5, sameCat: 0.5, key: 0.5 } as const

/** 一条参数记录。 */
interface ParamRecord {
  formula: number
  symbol: string
  quantity: string | undefined
  isConstant: boolean
}

/**
 * 构建关系索引。
 *
 * @param formulas - 公式库
 * @param constantNames - 常数名集合
 * @returns 关系索引
 */
export function buildRelationIndex(
  formulas: FormulaEntry[],
  constantNames: ReadonlySet<string>,
): RelationIndex {
  /** 物理量 → 参数记录。 */
  const byQuantity = new Map<string, ParamRecord[]>()
  /** 符号 → 参数记录（用于发现同名异义）。 */
  const bySymbol = new Map<string, ParamRecord[]>()
  const records: ParamRecord[] = []
  for (let index = 0; index < formulas.length; index += 1) {
    for (const [symbol, spec] of Object.entries(formulas[index].params ?? {})) {
      const quantity = (spec as { quantity?: string }).quantity
      const record: ParamRecord = { formula: index, symbol, quantity, isConstant: constantNames.has(symbol) }
      records.push(record)
      if (record.isConstant) {
        const bucket = bySymbol.get(symbol)
        if (bucket === undefined) bySymbol.set(symbol, [record])
        else bucket.push(record)
        continue
      }
      if (quantity !== undefined) {
        const bucket = byQuantity.get(quantity)
        if (bucket === undefined) byQuantity.set(quantity, [record])
        else bucket.push(record)
      }
      const symBucket = bySymbol.get(symbol)
      if (symBucket === undefined) bySymbol.set(symbol, [record])
      else symBucket.push(record)
    }
  }

  interface PairRecord {
    score: number
    sharedQuantities: Set<string>
    sharedSymbols: Set<string>
    conflicts: Map<string, Set<string>>
    sharedConstants: Set<string>
    sameCat: boolean
    sharedKeys: Set<string>
  }
  const pairs = new Map<string, PairRecord>()
  const pairKey = (a: number, b: number): string => (a < b ? a + ':' + b : b + ':' + a)
  const touch = (a: number, b: number): PairRecord => {
    const key = pairKey(a, b)
    let record = pairs.get(key)
    if (record === undefined) {
      record = {
        score: 0,
        sharedQuantities: new Set(),
        sharedSymbols: new Set(),
        conflicts: new Map(),
        sharedConstants: new Set(),
        sameCat: false,
        sharedKeys: new Set(),
      }
      pairs.set(key, record)
    }
    return record
  }

  /** 共用物理量 + 同符号同义强化。 */
  for (const [quantity, bucket] of byQuantity) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i]
        const b = bucket[j]
        if (a.formula === b.formula) continue
        const record = touch(a.formula, b.formula)
        record.sharedQuantities.add(quantity)
        if (a.symbol === b.symbol) record.sharedSymbols.add(a.symbol)
      }
    }
  }
  /** 共用常数。 */
  for (const [symbol, bucket] of bySymbol) {
    if (!constantNames.has(symbol)) continue
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        if (bucket[i].formula === bucket[j].formula) continue
        touch(bucket[i].formula, bucket[j].formula).sharedConstants.add(symbol)
      }
    }
  }
  /** 同名异义：同一符号在不同公式里有不同含义。 */
  for (const [symbol, bucket] of bySymbol) {
    if (constantNames.has(symbol)) continue
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i]
        const b = bucket[j]
        if (a.formula === b.formula) continue
        if (a.quantity === undefined || b.quantity === undefined) continue
        if (a.quantity === b.quantity) continue
        const record = touch(a.formula, b.formula)
        const meanings = record.conflicts.get(symbol)
        if (meanings === undefined) record.conflicts.set(symbol, new Set([a.quantity, b.quantity]))
        else {
          meanings.add(a.quantity)
          meanings.add(b.quantity)
        }
      }
    }
  }

  /** 同类别与同标签。 */
  const byCat = new Map<string, number[]>()
  const byKey = new Map<string, number[]>()
  for (let index = 0; index < formulas.length; index += 1) {
    const formula = formulas[index]
    const catBucket = byCat.get(formula.cat)
    if (catBucket === undefined) byCat.set(formula.cat, [index])
    else catBucket.push(index)
    for (const key of formula.keys ?? []) {
      const keyBucket = byKey.get(key)
      if (keyBucket === undefined) byKey.set(key, [index])
      else keyBucket.push(index)
    }
  }
  for (const bucket of byCat.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) touch(bucket[i], bucket[j]).sameCat = true
    }
  }
  for (const [key, bucket] of byKey) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) touch(bucket[i], bucket[j]).sharedKeys.add(key)
    }
  }

  /** 算分并建邻接表。 */
  const adjacency = new Map<number, Array<{ other: number; record: PairRecord }>>()
  for (const [key, record] of pairs) {
    record.score =
      record.sharedQuantities.size * WEIGHT.quantity +
      record.sharedConstants.size * WEIGHT.constant +
      record.conflicts.size * WEIGHT.conflict +
      (record.sameCat ? WEIGHT.sameCat : 0) +
      record.sharedKeys.size * WEIGHT.key
    const [aText, bText] = key.split(':')
    const a = Number(aText)
    const b = Number(bText)
    const listA = adjacency.get(a)
    if (listA === undefined) adjacency.set(a, [{ other: b, record }])
    else listA.push({ other: b, record })
    const listB = adjacency.get(b)
    if (listB === undefined) adjacency.set(b, [{ other: a, record }])
    else listB.push({ other: a, record })
  }

  const cache = new Map<string, RelationHit[]>()
  const byId = new Map(formulas.map((formula, index) => [formula.id, index]))

  return {
    neighbors: (id: string, limit = 6): RelationHit[] => {
      const cached = cache.get(id + '@' + limit)
      if (cached !== undefined) return cached
      const index = byId.get(id)
      if (index === undefined) return []
      const hits: RelationHit[] = (adjacency.get(index) ?? [])
        .map(({ other, record }) => ({
          id: formulas[other].id,
          name: formulas[other].name,
          cat: formulas[other].cat,
          score: Number(record.score.toFixed(2)),
          sharedQuantities: [...record.sharedQuantities].sort(),
          sharedSymbols: [...record.sharedSymbols].sort(),
          symbolConflicts: [...record.conflicts].map(([symbol, meanings]) => ({ symbol, meanings: [...meanings].sort() })),
          sharedConstants: [...record.sharedConstants].sort(),
          sameCat: record.sameCat,
          sharedKeys: [...record.sharedKeys].sort(),
        }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, limit)
      cache.set(id + '@' + limit, hits)
      return hits
    },
    stats: () => ({
      formulas: formulas.length,
      edges: pairs.size,
      constants: constantNames.size,
      quantities: byQuantity.size,
    }),
  }
}

/** 把关系渲染成一行理由（给调用方看为什么相邻）。 */
export function relationReason(hit: RelationHit): string {
  const parts: string[] = []
  if (hit.sharedQuantities.length > 0) {
    parts.push('共用物理量 ' + hit.sharedQuantities.slice(0, 4).join('/') + (hit.sharedSymbols.length > 0 ? '（' + hit.sharedSymbols.slice(0, 4).join('/') + '）' : ''))
  }
  if (hit.sharedConstants.length > 0) parts.push('共用常数 ' + hit.sharedConstants.slice(0, 4).join('/'))
  if (hit.symbolConflicts.length > 0) {
    parts.push('同名异义：' + hit.symbolConflicts.slice(0, 2).map((conflict) => conflict.symbol + '（' + conflict.meanings.join(' vs ') + '）').join('、'))
  }
  if (hit.sharedKeys.length > 0) parts.push('同标签 ' + hit.sharedKeys.slice(0, 3).join('/'))
  if (parts.length === 0 && hit.sameCat) parts.push('同类别 ' + hit.cat)
  return parts.join('；')
}
