/**
 * 跨模块对账：同一个量由两个模块各算一遍，比对是否一致。
 *
 * ## 为什么需要
 *
 * 硬核模块多了以后，同一物理量可能在多处实现：
 * - 表面重力：world 自算 / 公式库 / astro gravity；
 * - 一年天数：world 的 yearDays / astro orbit 的周期；
 * - 排水量：ship 校核 / 公式库 displacement。
 *
 * 结构上没保证一致（本项目吃过「README 写 404 而代码 442」的亏），所以要**主动对账**。
 *
 * @module dsh-math-calculator/features/graph/crosscheck
 */

import { CalcError } from '../../core/errors.js'

/** 一条对账项。 */
export interface CrosscheckItem {
  id: string
  label: string
  a: { op: string; params: Record<string, unknown> }
  b: { op: string; params: Record<string, unknown> }
  /** 从 a 结果提取的路径（如 'gravityEarth'、'engineering.displacementT'）。 */
  extractA: string
  /** 从 b 结果提取的路径。 */
  extractB: string
  /** 允许相对差（默认 0.05）。 */
  tolerance?: number
  /** 序列取末值。 */
  extractLast?: boolean
  /** a 侧换算系数（如 t→kg 用 1000）。 */
  scaleA?: number
  /** b 侧换算系数。 */
  scaleB?: number
}

/** 一条对账结果。 */
export interface CrosscheckResult {
  id: string
  label: string
  a: number | null
  b: number | null
  diffPercent: number | null
  verdict: 'match' | 'drift' | 'error'
  note: string
}

/**
 * 按路径取值（支持 a.b.c 与数组末值）。
 *
 * @param value - 对象
 * @param path - 路径
 * @returns 数值或 null
 */
export function extractByPath(value: unknown, path: string): number | null {
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[segment]
  }
  if (Array.isArray(current)) {
    const last = current[current.length - 1] as unknown
    const number = typeof last === 'object' && last !== null ? Number((last as Record<string, unknown>)['value']) : Number(last)
    return Number.isFinite(number) ? number : null
  }
  const number = Number(current)
  return Number.isFinite(number) ? number : null
}

/**
 * 执行对账。
 *
 * @param items - 对账项
 * @param run - 执行函数（把 {op,params} 跑成结果）
 * @returns 对账结果
 * @throws {CalcError} 无对账项
 */
export function runCrosschecks(items: CrosscheckItem[], run: (op: string, params: Record<string, unknown>) => unknown): CrosscheckResult[] {
  if (!Array.isArray(items) || items.length === 0) throw new CalcError('invalid_argument', '没有对账项', '')
  const results: CrosscheckResult[] = []
  for (const item of items) {
    const rawA = extractByPath(run(item.a.op, item.a.params), item.extractA)
    const rawB = extractByPath(run(item.b.op, item.b.params), item.extractB)
    /** 单位换算（两边口径不同时用，如 t vs kg）。 */
    const aValue = rawA === null ? null : rawA * (item.scaleA ?? 1)
    const bValue = rawB === null ? null : rawB * (item.scaleB ?? 1)
    const tolerance = typeof item.tolerance === 'number' ? item.tolerance : 0.05
    if (aValue === null || bValue === null) {
      results.push({ id: item.id, label: item.label, a: aValue, b: bValue, diffPercent: null, verdict: 'error', note: '有一侧取不到数值（检查 extract 路径）' })
      continue
    }
    if (bValue === 0) {
      results.push({ id: item.id, label: item.label, a: aValue, b: bValue, diffPercent: null, verdict: 'error', note: 'b 侧为 0，无法算相对差' })
      continue
    }
    const diff = Math.abs(aValue - bValue) / Math.abs(bValue) * 100
    results.push({ id: item.id, label: item.label, a: aValue, b: bValue, diffPercent: diff, verdict: diff <= tolerance * 100 ? 'match' : 'drift', note: diff <= tolerance * 100 ? '一致（差 ' + diff.toFixed(2) + '%）' : '不一致：' + diff.toFixed(2) + '%（容差 ' + (tolerance * 100).toFixed(1) + '%）' })
  }
  return results
}
