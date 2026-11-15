/**
 * 分支推演（DIVERGE）——原料来自 Project_Psychohistory 的 DIVERGE 阶段。
 *
 * ## 原版做什么
 *
 * 危机命中后，协议要求「反转危机假设、生成悖论」——即换一个前提再看历史。
 * 它是**叙事技巧**，没有数值机制。
 *
 * ## 二次加工
 *
 * 把「反转假设」变成**可对照的两条时间线**：
 * - base 与 variant 各跑一次冲突模拟（同一步数）；
 * - 找**分歧年**（份额差首次超过阈值）；
 * - 输出两线的最强势力、最终份额差、战争数差；
 * - 不编叙事，只给「从哪一年开始不一样」。
 *
 * @module dsh-math-calculator/features/deduction/diverge
 */

import { CalcError } from '../../core/errors.js'
import { runConflictSeries, type ConflictInput } from './conflict.js'

/** 输入。 */
export interface DivergeInput {
  /** 基线。 */
  base: ConflictInput
  /** 变体：可换 seed，或覆盖 actors/edges（改一个前提）。 */
  variant?: Partial<ConflictInput>
  /** 分歧阈值（份额差，默认 0.02）。 */
  threshold?: number
}

/** 结果。 */
export interface DivergeResult {
  /** 首次分歧年（null = 无分歧）。 */
  divergingYear: number | null
  /** 两线最强势力。 */
  baseLeader: string
  variantLeader: string
  /** 末日份额差。 */
  finalShareGap: number
  /** 最大差异年与数值。 */
  maxGapYear: number | null
  maxGap: number
  /** 战争数差（variant − base）。 */
  warGap: number
  /** 点数。 */
  points: number
  /** 说明。 */
  notes: string[]
}

/**
 * 跑两条时间线并找分歧点。
 *
 * @param input - 基线与变体
 * @returns 分歧结果
 * @throws {CalcError} 数据非法
 */
export function runDiverge(input: DivergeInput): DivergeResult {
  if (input.base === undefined || input.base === null) throw new CalcError('invalid_argument', '需要 base（基线参数）', '')
  const variant = { ...input.base, ...(input.variant ?? {}) }
  const baseRun = runConflictSeries(input.base)
  const variantRun = runConflictSeries(variant)
  const threshold = typeof input.threshold === 'number' ? input.threshold : 0.02
  const points = Math.min(baseRun.leaderShare.length, variantRun.leaderShare.length)
  let divergingYear: number | null = null
  let maxGap = 0
  let maxGapYear: number | null = null
  for (let i = 0; i < points; i += 1) {
    const gap = Math.abs(baseRun.leaderShare[i].value - variantRun.leaderShare[i].value)
    if (gap > maxGap) { maxGap = gap; maxGapYear = baseRun.leaderShare[i].year }
    if (divergingYear === null && gap >= threshold) divergingYear = baseRun.leaderShare[i].year
  }
  const baseLeader = baseRun.leaders[baseRun.leaders.length - 1].id
  const variantLeader = variantRun.leaders[variantRun.leaders.length - 1].id
  const finalShareGap = Math.abs(baseRun.leaderShare[points - 1].value - variantRun.leaderShare[points - 1].value)
  return {
    divergingYear,
    baseLeader,
    variantLeader,
    finalShareGap,
    maxGapYear,
    maxGap,
    warGap: variantRun.events.length - baseRun.events.length,
    points,
    notes: [
      '分歧阈值 ' + threshold + '（最强份额差）',
      divergingYear === null ? '两条时间线未出现明显分歧（改动不足以改变走向）' : '从第 ' + divergingYear + ' 年起走向不同',
      '输出只给「从哪年不一样」与终局差异；叙事由 AI 写',
    ],
  }
}
