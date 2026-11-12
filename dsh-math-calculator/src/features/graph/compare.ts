/**
 * 方案对比（`compare`）。
 *
 * ## ★ 不给权重就不给综合分
 *
 * 这是本项目的核心取向之一。反馈包的实测：
 *
 * ```
 *   「A 方案和 B 方案哪个好」  →  工具应当拒绝回答「哪个好」
 *   →  只给「各指标最强是谁」+ 差异表
 * ```
 *
 * 因为**哪个指标更重要只有作者知道**。工具给一个「综合分」
 * 就等于替作者做了价值判断 —— 而那会误导。
 *
 * ## 三个能力
 *
 * ```
 *   ① 差异表       每行一个方案，每列一个指标
 *   ② 各指标最强   逐列指出最优（带方向：越大越好 / 越小越好）
 *   ③ 综合排序     仅在给了 weights 时才给
 * ```
 *
 * @module dsh-math-calculator/features/graph/compare
 */

import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'

/** 输入。 */
export interface CompareInput {
  /** 方案名列表。 */
  rows: string[]
  /** 指标名列表。 */
  cols: string[]
  /** 二维数据（`data[i][j]` = 方案 i 的指标 j）。 */
  data: number[][]
  /** 权重（可选）。不给就不算综合分。 */
  weights?: number[]
  /**
   * 每个指标的方向：`max`（越大越好，默认）/ `min`（越小越好）。
   */
  directions?: Array<'max' | 'min'>
}

/** 结果。 */
export interface CompareOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 方案对比。
 *
 * @param input - 输入
 * @returns 结果
 */
export function comparePlans(input: CompareInput): CompareOutcome {
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new CalcError('missing_params', 'compare 需要 rows（方案名列表）', '例如 {compare:{rows:["甲","乙"], cols:["成本"], data:[[10],[15]]}}。')
  }
  if (!Array.isArray(input.cols) || input.cols.length === 0) {
    throw new CalcError('missing_params', 'compare 需要 cols（指标名列表）', '')
  }
  if (!Array.isArray(input.data)) {
    throw new CalcError('missing_params', 'compare 需要 data（二维数值）', '')
  }

  const rowCount = input.rows.length
  const colCount = input.cols.length

  /** 校验数据形状。 */
  if (input.data.length !== rowCount) {
    throw new CalcError(
      'invalid_argument',
      'data 有 ' + input.data.length + ' 行，但 rows 有 ' + rowCount + ' 个',
      '每一行对应一个方案。',
    )
  }
  for (let i = 0; i < rowCount; i += 1) {
    const row = input.data[i]
    if (!Array.isArray(row)) {
      throw new CalcError('invalid_argument', 'data 的第 ' + (i + 1) + ' 行不是数组', '')
    }
    if (row.length !== colCount) {
      throw new CalcError(
        'invalid_argument',
        'data 第 ' + (i + 1) + ' 行有 ' + row.length + ' 列，但 cols 有 ' + colCount + ' 个',
        '每个方案对每个指标都要有值。',
      )
    }
    for (let j = 0; j < colCount; j += 1) {
      const value = Number(row[j])
      if (!Number.isFinite(value)) {
        throw new CalcError(
          'invalid_argument',
          '方案「' + input.rows[i] + '」的指标「' + input.cols[j] + '」不是有限数（收到 ' + JSON.stringify(row[j]) + '）',
          '',
        )
      }
    }
  }

  /** 权重校验。 */
  const hasWeights = Array.isArray(input.weights) && input.weights.length > 0
  if (hasWeights) {
    const weights = input.weights as number[]
    if (weights.length !== colCount) {
      throw new CalcError(
        'invalid_argument',
        'weights 有 ' + weights.length + ' 个，但 cols 有 ' + colCount + ' 个',
        '每个指标一个权重。',
      )
    }
    if (weights.some((w) => !Number.isFinite(Number(w)) || Number(w) < 0)) {
      throw new CalcError('invalid_argument', 'weights 必须是非负数', '权重不能为负 —— 负权重等于「越差越好」。')
    }
  }

  /** 方向。 */
  const directions = input.directions ?? []
  const dirOf = (j: number): 'max' | 'min' => directions[j] ?? 'max'

  /** 各指标最强。 */
  const best: Array<{ col: string; row: string; value: number; direction: string }> = []
  for (let j = 0; j < colCount; j += 1) {
    const dir = dirOf(j)
    let bestIndex = 0
    for (let i = 1; i < rowCount; i += 1) {
      const current = Number(input.data[i][j])
      const champion = Number(input.data[bestIndex][j])
      if (dir === 'max' ? current > champion : current < champion) bestIndex = i
    }
    best.push({
      col: input.cols[j],
      row: input.rows[bestIndex],
      value: Number(input.data[bestIndex][j]),
      direction: dir === 'max' ? '越大越好' : '越小越好',
    })
  }

  /** 综合分（仅在有权重时）。 */
  let scores: Array<{ row: string; score: number }> | null = null
  if (hasWeights) {
    const weights = (input.weights as number[]).map((w) => Number(w))
    /**
     * ## 归一化：每列先归一到 [0,1]，再按方向加权
     *
     * 不归一的话，「人口 1e9」会压倒「增长率 0.03」——
     * 量纲不同的指标不能直接相加。
     */
    const normalized: number[][] = Array.from({ length: rowCount }, () => new Array(colCount).fill(0))
    for (let j = 0; j < colCount; j += 1) {
      const column = input.data.map((row) => Number(row[j]))
      const min = Math.min(...column)
      const max = Math.max(...column)
      const range = max - min
      for (let i = 0; i < rowCount; i += 1) {
        const raw = Number(input.data[i][j])
        /** 全列相同时给 0.5（不偏袒）。 */
        const unit = range === 0 ? 0.5 : (raw - min) / range
        /** `min` 方向要倒过来。 */
        normalized[i][j] = dirOf(j) === 'max' ? unit : 1 - unit
      }
    }
    const totalWeight = weights.reduce((s, w) => s + w, 0)
    scores = input.rows.map((row, i) => ({
      row,
      score: totalWeight === 0
        ? 0
        : normalized[i].reduce((s, v, j) => s + v * weights[j], 0) / totalWeight,
    }))
    scores.sort((a, b) => b.score - a.score)
  }

  /** 正文。 */
  const lines: string[] = []
  lines.push('═══ 方案对比 ═══')
  lines.push('')

  /** 表头。 */
  const nameWidth = Math.max(6, ...input.rows.map((r) => r.length)) + 2
  const colWidth = 12
  lines.push('  ' + '方案'.padEnd(nameWidth) + input.cols.map((c) => c.padStart(colWidth)).join(''))
  lines.push('  ' + '─'.repeat(nameWidth + colCount * colWidth))
  for (let i = 0; i < rowCount; i += 1) {
    const cells = input.data[i].map((v) => fmtNumber(Number(v), FMT.general).padStart(colWidth))
    lines.push('  ' + input.rows[i].padEnd(nameWidth) + cells.join(''))
  }

  lines.push('')
  lines.push('  各指标最强：')
  for (const b of best) {
    lines.push('   · ' + b.col + '：' + b.row + '（' + fmtNumber(b.value, FMT.general) + '，' + b.direction + '）')
  }

  lines.push('')
  if (scores === null) {
    /**
     * ★ 这是本模块最重要的一句话。
     */
    lines.push('  **没有给 weights，所以不给综合分** —— 工具不猜「哪个指标更重要」。')
    lines.push('  要综合排序请传 weights（每个指标一个非负数）：{weights:[1,1]}')
  } else {
    lines.push('  综合排序（按 weights 加权）：')
    for (let i = 0; i < scores.length; i += 1) {
      lines.push('   ' + (i + 1) + '. ' + scores[i].row + '　' + (scores[i].score * 100).toFixed(1) + ' 分')
    }
    lines.push('')
    lines.push('  ⚠ 综合分依赖你给的权重 —— 换一组权重可能换一个结论。')
  }

  return {
    result: lines.join('\n'),
    value: {
      rows: input.rows,
      cols: input.cols,
      data: input.data,
      best,
      scores,
      hasWeights,
    },
    notice: scores === null
      ? '未给 weights —— 只做逐指标对比，不给综合分（工具不替你决定哪个指标更重要）。'
      : undefined,
  }
}
