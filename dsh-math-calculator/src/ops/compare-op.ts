/**
 * operation="compare" 的实现：多方案对比。
 *
 * ## 与 derivation="compare" 的区别
 *
 * ```
 *   derivation="compare"   版本对比（同一世界的 v1 vs v2，读归档记录）
 *   operation="compare"     方案对比（几个互斥选项，比指标）
 * ```
 *
 * 前者回答「我改了什么」，后者回答「我该选哪个」。
 *
 * ## 它解决什么
 *
 * 反馈包 15 号的动作 4 是「方案对比」，原文例子：
 *
 * > 第 43 轮列强国力表：rows=['维多利亚','高卢','条顿'],
 * > cols=['综合国力','工业产能','金融航运','军事']
 *
 * 这种表 AI 只能手工排，然后自己判断「哪个好」。问题是：
 * **判断标准没写下来，所以每次结论可能不一样**。
 *
 * 这个 operation 把三件事做实：
 *   ① 表本身（每个方案在每个指标上的值）
 *   ② 每列的胜者（谁在这个指标上最强）
 *   ③ 综合排序（按权重加权，权重由调用方给）
 *
 * ## 关键设计约束：权重必须由调用方给
 *
 * 工具不猜「工业产能和军事哪个更重要」—— 那是世界观设定，
 * 不是物理事实。不给权重就只给逐列胜者，**不给综合分**。
 *
 * @module dsh-math-calculator/ops/compare-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个方案的对比结果。 */
interface SchemeScore {
  /** 方案名。 */
  name: string
  /** 各指标原始值。 */
  values: number[]
  /** 各指标归一化后的 0–1 分（越大越好）。 */
  normalized: number[]
  /** 加权综合分（没有权重时为 null）。 */
  score: number | null
  /** 综合排名（1 最好）。 */
  rank: number | null
}

/**
 * 数字显示。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * `compare`：多方案对比。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opCompare(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).compare

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'compare 需要给一个对象：{ rows, cols, data }',
      '例如 {compare:{rows:["甲","乙"], cols:["产能","军力"], data:[[100,50],[80,90]]}}。' +
        '每一行是一个方案，每一列是一个指标。权重可选：weights:[2,1]（列数相同）。' +
        '版本对比请用 derivation="compare"（那是比同一个世界的两个版本）。',
    )
  }

  const obj = raw as Record<string, unknown>
  const rows = Array.isArray(obj.rows) ? obj.rows.map((item) => String(item)) : []
  const cols = Array.isArray(obj.cols) ? obj.cols.map((item) => String(item)) : []
  const matrix = Array.isArray(obj.data) ? obj.data : []

  if (rows.length === 0 || cols.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'compare 需要 rows（方案名）与 cols（指标名）',
      '例如 {compare:{rows:["甲","乙"], cols:["产能","军力"], data:[[100,50],[80,90]]}}。',
    )
  }
  if (matrix.length !== rows.length) {
    throw new CalcError(
      'invalid_argument',
      'data 的行数必须等于 rows（' + rows.length + '），收到 ' + matrix.length,
      '每一行对应一个方案，每一列对应一个指标。',
    )
  }

  /** 校验并转成数字矩阵。 */
  const values: number[][] = []
  for (let i = 0; i < matrix.length; i += 1) {
    const row = matrix[i]
    if (!Array.isArray(row) || row.length !== cols.length) {
      throw new CalcError(
        'invalid_argument',
        '第 ' + (i + 1) + ' 行（' + rows[i] + '）必须有 ' + cols.length + ' 个数值，收到 ' +
          (Array.isArray(row) ? row.length : '非数组'),
        'data 的每一行长度必须等于 cols 的长度。',
      )
    }
    const nums = row.map((cell) => Number(cell))
    for (let j = 0; j < nums.length; j += 1) {
      if (!Number.isFinite(nums[j])) {
        throw new CalcError(
          'invalid_argument',
          '第 ' + (i + 1) + ' 行第 ' + (j + 1) + ' 列不是有限数：' + JSON.stringify(row[j]),
          '每个格子必须是数字。缺失就填 0 或先估算 —— 但别填字符串。',
        )
      }
    }
    values.push(nums)
  }

  /** 权重（可选）。没有权重就不给综合分。 */
  const rawWeights = Array.isArray(obj.weights) ? obj.weights : null
  let weights: number[] | null = null
  if (rawWeights) {
    if (rawWeights.length !== cols.length) {
      throw new CalcError(
        'invalid_argument',
        'weights 的长度必须等于 cols（' + cols.length + '），收到 ' + rawWeights.length,
        '每个指标一个权重。不想加权就别传 weights —— 那时只给逐列胜者，不给综合分。',
      )
    }
    weights = rawWeights.map((item) => Number(item))
    if (weights.some((item) => !Number.isFinite(item) || item < 0)) {
      throw new CalcError('invalid_argument', 'weights 必须是非负数', '权重的绝对值不重要，只影响相对比例。')
    }
    if (weights.every((item) => item === 0)) {
      throw new CalcError(
        'invalid_argument',
        'weights 全是 0，加权结果没有意义',
        '至少给一个正权重；不想加权就别传 weights。',
      )
    }
  }

  /**
   * 归一化：每列按最大值缩放到 0–1。
   *
   * ## 为什么用「除以最大值」而不是 min-max
   *
   * 这几个指标通常都是「越大越好」且从 0 起算（产能、军力、人口）。
   * 用 min-max 会让「最差的那个」变成 0 分，把差距夸大成 100%；
   * 除以最大值则保留「它的绝对值占最强者的多少」这个直观含义。
   *
   * 若某列全为 0，则这一列所有方案都记 0 分（没有可比性）。
   */
  const normalized: number[][] = rows.map(() => cols.map(() => 0))
  for (let j = 0; j < cols.length; j += 1) {
    let max = Number.NEGATIVE_INFINITY
    for (let i = 0; i < rows.length; i += 1) max = Math.max(max, values[i][j])
    if (max === 0 || !Number.isFinite(max)) continue
    for (let i = 0; i < rows.length; i += 1) {
      normalized[i][j] = values[i][j] / max
    }
  }

  /** 逐列胜者。 */
  const columnBest: Array<{ col: string; winner: string; value: number; tie: boolean }> = []
  for (let j = 0; j < cols.length; j += 1) {
    let max = Number.NEGATIVE_INFINITY
    for (let i = 0; i < rows.length; i += 1) max = Math.max(max, values[i][j])
    const winners = rows.filter((_, i) => values[i][j] === max)
    columnBest.push({
      col: cols[j],
      winner: winners.join(' / '),
      value: max,
      tie: winners.length > 1,
    })
  }

  /** 综合分（有权重才有）。 */
  const scores: SchemeScore[] = rows.map((name, i) => ({
    name,
    values: values[i],
    normalized: normalized[i],
    score: weights
      ? normalized[i].reduce((acc, value, j) => acc + value * weights[j], 0) /
        weights.reduce((acc, weight) => acc + weight, 0)
      : null,
    rank: null,
  }))

  if (weights) {
    const sorted = [...scores].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    sorted.forEach((item, index) => {
      const target = scores.find((one) => one.name === item.name)
      if (target) target.rank = index + 1
    })
  }

  // ── 渲染 ──
  const lines: string[] = []
  lines.push('═══ 方案对比 ═══')
  lines.push('')

  /** 表头。第一列是方案名，宽度按最长的名字算。 */
  const nameWidth = Math.max(6, ...rows.map((name) => name.length)) + 2
  const cellWidth = 10
  const header = '  ' + '方案'.padEnd(nameWidth, ' ') + cols.map((col) => col.padStart(cellWidth, ' ')).join('')
  lines.push(header)
  lines.push('  ' + '─'.repeat(nameWidth + cols.length * cellWidth))

  for (const score of scores) {
    lines.push(
      '  ' + score.name.padEnd(nameWidth, ' ') +
      score.values.map((value) => show(value).padStart(cellWidth, ' ')).join(''),
    )
  }
  lines.push('')

  /** 逐列胜者。 */
  lines.push('  各指标最强：')
  for (const best of columnBest) {
    lines.push('   · ' + best.col + '：' + best.winner + '（' + show(best.value) + '）' +
      (best.tie ? '　⚠ 并列' : ''))
  }

  if (weights) {
    lines.push('')
    lines.push('  加权综合（权重 ' + weights.join(' : ') + '）：')
    const ranked = [...scores].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    for (const item of ranked) {
      lines.push('   ' + (item.rank === 1 ? '①' : item.rank === 2 ? '②' : item.rank === 3 ? '③' : '④') +
        ' ' + item.name.padEnd(nameWidth - 2, ' ') + ' ' + ((item.score ?? 0) * 100).toFixed(1) + ' 分')
    }
    lines.push('')
    lines.push('  ⚠ 综合分只是「按你给的权重加权」，不是客观优劣。')
    lines.push('    权重换了排序就换 —— 哪个指标更重要是**世界观设定**，不是物理事实。')
  } else {
    lines.push('')
    lines.push('  没有给 weights，所以**不给综合分** —— 工具不猜「哪个指标更重要」。')
    lines.push('  要综合排序请传 weights（每个指标一个非负数）：' +
      '{weights:[' + cols.map(() => '1').join(',') + ']}')
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      rows,
      cols,
      data: values,
      weights,
      normalized,
      columnBest,
      scores: scores.map((item) => ({
        name: item.name,
        score: item.score,
        rank: item.rank,
      })),
      /** 有综合分时的胜者；没有权重时为 null。 */
      winner: weights ? [...scores].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]?.name ?? null : null,
    }),
  }
}
