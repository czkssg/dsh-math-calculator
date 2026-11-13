/**
 * 公式关系图：通过**共用物理量、共用常数与共性**把 740 条公式连起来。
 *
 * ## 为什么需要
 *
 * 公式库是一条条孤立的式子。作者真正要问的往往是「这条公式算出来的东西，
 * 下一步还能喂给谁」——比如 `ideal_gas` 的压强，可以进 `pressure_depth`、
 * `bernoulli`、`sound_speed`。没有关系图，AI 只能靠检索词碰运气。
 *
 * ## 三类边（权重不同）
 *
 * ```
 *   共用参数     ×2   ← 同名参数，如 m、T、v、rho
 *   共用常数     ×1   ← 参数名本身就是常数，如 k、h、c、G、R
 *   同类别/同标签 ×0.5 ← 同 cat 或 keys 有交集
 * ```
 *
 * **同名参数不等于同义**（`m` 可能是质量，也可能是摩尔浓度）。所以边只说明
 * 「这两条公式用了同一个符号」，理由里把符号名写出来，由调用方判断语义。
 * 这是有意保守：宁可少连，不可乱连。
 *
 * ## 性能
 *
 * 用倒排索引（参数名 → 公式集合）累积分数，构建一次 O(参数总数 × 平均度数)，
 * 远小于 740×740 的两两比较。结果按公式 id 缓存。
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
  /** 共用的参数名。 */
  sharedParams: string[]
  /** 共用的常数名。 */
  sharedConstants: string[]
  /** 是否同类别。 */
  sameCat: boolean
  /** 共用的标签。 */
  sharedKeys: string[]
}

/** 关系索引。 */
export interface RelationIndex {
  /** 取某条公式的相邻公式（按分数降序）。 */
  neighbors: (id: string, limit?: number) => RelationHit[]
  /** 图规模（调试/展示用）。 */
  stats: () => { formulas: number; edges: number; constants: number }
}

/** 分数权重。 */
const WEIGHT = { param: 2, constant: 1, sameCat: 0.5, key: 0.5 } as const

/**
 * 构建关系索引。
 *
 * @param formulas - 公式库
 * @param constantNames - 常数名集合（来自 constants-graph）
 * @returns 关系索引
 */
export function buildRelationIndex(
  formulas: FormulaEntry[],
  constantNames: ReadonlySet<string>,
): RelationIndex {
  /** 参数名 → 公式下标集合（倒排）。 */
  const inverted = new Map<string, number[]>()
  for (let index = 0; index < formulas.length; index += 1) {
    for (const name of Object.keys(formulas[index].params ?? {})) {
      const bucket = inverted.get(name)
      if (bucket === undefined) inverted.set(name, [index])
      else bucket.push(index)
    }
  }

  /** 成对累积分数与共用项。 */
  const pairs = new Map<string, { score: number; sharedParams: string[]; sharedConstants: string[]; sameCat: boolean; sharedKeys: string[] }>()
  const pairKey = (a: number, b: number): string => (a < b ? a + ':' + b : b + ':' + a)
  const touch = (a: number, b: number) => {
    const key = pairKey(a, b)
    let record = pairs.get(key)
    if (record === undefined) {
      record = { score: 0, sharedParams: [], sharedConstants: [], sameCat: false, sharedKeys: [] }
      pairs.set(key, record)
    }
    return record
  }

  for (const [name, bucket] of inverted) {
    const isConstant = constantNames.has(name)
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const record = touch(bucket[i], bucket[j])
        if (isConstant) {
          record.sharedConstants.push(name)
          record.score += WEIGHT.constant
        } else {
          record.sharedParams.push(name)
          record.score += WEIGHT.param
        }
      }
    }
  }

  for (let index = 0; index < formulas.length; index += 1) {
    const formula = formulas[index]
    /** 同类别：只看分数够不够高，不在两两循环里重复遍历（用桶做）。 */
    void formula
  }
  /** 同类别与同标签：按 cat / key 分组，组内两两加边。 */
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
    /** 同类别组合可能很大（physics/mechanics 45 条 → 990 对），只在有共用参数时才有意义；这里仍加边但权重低。 */
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const record = touch(bucket[i], bucket[j])
        record.sameCat = true
        record.score += WEIGHT.sameCat
      }
    }
  }
  for (const [key, bucket] of byKey) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const record = touch(bucket[i], bucket[j])
        if (!record.sharedKeys.includes(key)) {
          record.sharedKeys.push(key)
          record.score += WEIGHT.key
        }
      }
    }
  }

  /** 邻接表。 */
  const adjacency = new Map<number, Array<{ other: number; record: { score: number; sharedParams: string[]; sharedConstants: string[]; sameCat: boolean; sharedKeys: string[] } }>>()
  for (const [key, record] of pairs) {
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

  /** 缓存。 */
  const cache = new Map<string, RelationHit[]>()
  const byId = new Map(formulas.map((formula, index) => [formula.id, index]))

  return {
    neighbors: (id: string, limit = 6): RelationHit[] => {
      const cached = cache.get(id + '@' + limit)
      if (cached !== undefined) return cached
      const index = byId.get(id)
      if (index === undefined) return []
      const list = adjacency.get(index) ?? []
      const hits: RelationHit[] = list
        .map(({ other, record }) => ({
          id: formulas[other].id,
          name: formulas[other].name,
          cat: formulas[other].cat,
          score: Number(record.score.toFixed(2)),
          sharedParams: [...record.sharedParams].sort(),
          sharedConstants: [...record.sharedConstants].sort(),
          sameCat: record.sameCat,
          sharedKeys: [...record.sharedKeys].sort(),
        }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, limit)
      cache.set(id + '@' + limit, hits)
      return hits
    },
    stats: () => ({ formulas: formulas.length, edges: pairs.size, constants: constantNames.size }),
  }
}

/** 把关系渲染成一行理由（给调用方看为什么相邻）。 */
export function relationReason(hit: RelationHit): string {
  const parts: string[] = []
  if (hit.sharedParams.length > 0) parts.push('共用参数 ' + hit.sharedParams.join('/'))
  if (hit.sharedConstants.length > 0) parts.push('共用常数 ' + hit.sharedConstants.join('/'))
  if (hit.sharedKeys.length > 0) parts.push('同标签 ' + hit.sharedKeys.slice(0, 3).join('/'))
  if (parts.length === 0 && hit.sameCat) parts.push('同类别 ' + hit.cat)
  return parts.join('；')
}
