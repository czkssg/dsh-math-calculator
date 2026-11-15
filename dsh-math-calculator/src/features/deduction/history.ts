/**
 * 历史推演（纪元划分）——原料来自 dmasad/WorldBuilding 的 TributeNarrative 与 extrema，
 * 加上 Project_Psychohistory 的五阶段骨架。
 *
 * ## 原实现怎么做的
 *
 * - `extrema.py`：在时间序列里找**局部极大/极小**，并按"重要性"（窗口内是否被更大值超过）排序；
 * - `TributeNarrative.py`：**两个极值之间算一个纪元**，统计其间事件 → 生成该纪元的叙事。
 *
 * ## 二次加工（不直接抄）
 *
 * - 原版用 numpy + 随机名字生成器 + matplotlib；这里只保留**划分算法**；
 * - 输入改为「指标时间序列 + 事件」，输出「纪元列表（起止年 + 转折类型 + 事件）」；
 * - 加最小纪元长度（防止噪声切碎）与重要性阈值；
 * - 事件归入纪元，供叙事层使用（我们只给结构，不写正文）。
 *
 * @module dsh-math-calculator/features/deduction/history
 */

import { CalcError } from '../../core/errors.js'

/** 时间序列点。 */
export interface SeriesPoint {
  /** 年（可负）。 */
  year: number
  /** 指标值。 */
  value: number
}

/** 事件。 */
export interface HistoryEvent {
  year: number
  label: string
  /** 事件类型（可选）。 */
  kind?: string
}

/** 纪元。 */
export interface Epoch {
  startYear: number
  endYear: number
  /** 转折类型：rise / fall / flat。 */
  turn: string
  /** 该纪元内事件。 */
  events: HistoryEvent[]
  /** 该纪元指标起点/终点。 */
  from: number
  to: number
}

/** 输入。 */
export interface HistoryInput {
  /** 指标时间序列。 */
  series: SeriesPoint[]
  /** 事件。 */
  events?: HistoryEvent[]
  /** 最小纪元长度（年，默认 10）。 */
  minEpochYears?: number
  /** 重要性阈值（默认 0.05：相对振幅）。 */
  threshold?: number
  /** 平滑窗口（年，默认 0：不平滑；给 5 表示每 5 年取均值）。 */
  smoothing?: number
}

/** 结果。 */
export interface HistoryResult {
  epochs: Epoch[]
  /** 检测到的转折年。 */
  turningPoints: number[]
  notes: string[]
}

/**
 * 找局部极值（原料：extrema.py 的 get_minima/get_maxima）。
 *
 * @param series - 序列
 * @param threshold - 相对振幅阈值
 * @returns 极值索引
 */
export function findTurningPoints(series: SeriesPoint[], threshold = 0.05): number[] {
  if (series.length < 3) return []
  const values = series.map((p) => p.value)
  const range = Math.max(...values) - Math.min(...values)
  const minAmp = range * threshold
  const points: number[] = []
  for (let i = 1; i < series.length - 1; i += 1) {
    const prev = values[i - 1]
    const cur = values[i]
    const next = values[i + 1]
    const isMax = cur > prev && cur >= next
    const isMin = cur < prev && cur <= next
    if (!isMax && !isMin) continue
    /** 重要性：与前后最远点的振幅超过阈值。 */
    const amp = Math.max(Math.abs(cur - values[0]), Math.abs(cur - values[values.length - 1]))
    if (amp < minAmp) continue
    points.push(i)
  }
  return points
}

/**
 * 把时间序列切成纪元（原料：TributeNarrative 的「极值之间算纪元」）。
 *
 * @param input - 序列与事件
 * @returns 纪元
 */
export function buildEpochs(input: HistoryInput): HistoryResult {
  if (!Array.isArray(input.series) || input.series.length < 2) throw new CalcError('invalid_argument', 'series 至少 2 个点', '')
  const minEpoch = input.minEpochYears ?? 10
  const threshold = input.threshold ?? 0.05
  const smoothing = Math.max(1, Math.floor(input.smoothing ?? 1))
  /** 平滑：窗口均值，减少噪声转折（原料 extrema 没做这一步，是二次加工加的）。 */
  const raw = [...input.series].sort((a, b) => a.year - b.year)
  const sorted = smoothing > 1 ? raw.filter((_, i) => i % smoothing === 0).map((point, index) => {
    const window = raw.slice(index * smoothing, Math.min(raw.length, index * smoothing + smoothing))
    return { year: point.year, value: window.reduce((sum, p) => sum + p.value, 0) / window.length }
  }) : raw
  const indices = findTurningPoints(sorted, threshold)
  /** 起止点也作为分界，再按最小时长过滤。 */
  const boundaries: number[] = [0, ...indices, sorted.length - 1]
  const merged: number[] = []
  for (const index of boundaries) {
    const year = sorted[index].year
    if (merged.length > 0) {
      const lastYear = merged[merged.length - 1]
      if (year - lastYear < minEpoch) continue
    }
    merged.push(year)
  }
  if (merged.length < 2) merged.push(sorted[sorted.length - 1].year)
  const events = input.events ?? []
  const epochs: Epoch[] = []
  for (let i = 0; i + 1 < merged.length; i += 1) {
    const startYear = merged[i]
    const endYear = merged[i + 1]
    const fromPoint = sorted.find((p) => p.year >= startYear) ?? sorted[0]
    const toPoint = [...sorted].reverse().find((p) => p.year <= endYear) ?? sorted[sorted.length - 1]
    const turn = toPoint.value > fromPoint.value * 1.02 ? 'rise' : toPoint.value < fromPoint.value * 0.98 ? 'fall' : 'flat'
    epochs.push({ startYear, endYear, turn, events: events.filter((e) => e.year >= startYear && e.year < endYear), from: fromPoint.value, to: toPoint.value })
  }
  return { epochs, turningPoints: merged.slice(1, -1), notes: ['纪元由局部极值划分（阈值 ' + threshold + '，最小时长 ' + minEpoch + ' 年）', 'turn=rise/fall/flat 按纪元起止值比较'] }
}
/** 危机触发（原料：Psychohistory 的 COINCIDE 阶段）。 */
export interface CrisisRule {
  /** 纪元跌幅阈值（如 0.2 表示跌 20% 算危机）。 */
  dropRatio?: number
  /** 财富集中度阈值（HHI，如 0.4）。 */
  concentrationHhi?: number
}

/** 危机标记。 */
export interface CrisisMark {
  year: number
  kind: string
  detail: string
}

/**
 * 标记危机年（COINCIDE 的可执行版）。
 *
 * @param series - 时间序列
 * @param rule - 规则
 * @returns 危机点
 */
export function detectCrises(series: SeriesPoint[], rule: CrisisRule = {}): CrisisMark[] {
  const dropRatio = rule.dropRatio ?? 0.2
  const marks: CrisisMark[] = []
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].value
    const cur = series[i].value
    if (prev > 0 && (prev - cur) / prev >= dropRatio) {
      marks.push({ year: series[i].year, kind: 'collapse', detail: '总财富较上一年跌 ' + (((prev - cur) / prev) * 100).toFixed(1) + '%' })
    }
  }
  return marks
}
