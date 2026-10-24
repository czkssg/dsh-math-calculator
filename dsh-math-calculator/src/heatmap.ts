/**
 * 相图热力图：用 CSS grid 画二维参数扫描。
 *
 * @module dsh-math-calculator/heatmap
 * @description
 * 方案 5.2 要求二维热力图（绿/黄/红）。这里**不用 canvas**——
 * 一个格子就是一个 div，用背景色区分状态，既够用又不需要任何库。
 *
 * canvas 的优势是十万级像素点；而相图通常只有几十×几十的格子，
 * 用 DOM 反而更好：可以 hover、可以加 title、可以无障碍读取。
 *
 * ## 颜色分级
 *
 * 不直接拼红绿黄，而是给出**语义等级**，由界面映射到设计令牌：
 *   · ok      —— 允许
 *   · warn    —— 边缘
 *   · danger  —— 禁止
 *   · unknown —— 没算
 */

/** 一个格子的状态。 */
export type CellLevel = 'ok' | 'warn' | 'danger' | 'unknown'

/** 一个格子。 */
export interface HeatCell {
  /** 行索引（Y 参数）。 */
  row: number
  /** 列索引（X 参数）。 */
  col: number
  /** X 参数取值。 */
  x: number
  /** Y 参数取值。 */
  y: number
  /** 该点的判定。 */
  level: CellLevel
  /** 悬浮说明。 */
  note: string
}

/** 相图结果。 */
export interface Heatmap {
  cells: HeatCell[]
  /** X 轴参数名。 */
  xLabel: string
  /** Y 轴参数名。 */
  yLabel: string
  /** 每列对应取值。 */
  xValues: number[]
  /** 每行对应取值。 */
  yValues: number[]
  /** 各状态统计。 */
  summary: { ok: number; warn: number; danger: number; unknown: number }
}

/**
 * 把「每个格子的判定」组装成热力图。
 *
 * @param xValues - X 轴取值数组
 * @param yValues - Y 轴取值数组
 * @param evaluate - 对每个 (x, y) 求判定
 * @param labels - 轴名
 * @returns 热力图
 */
export function buildHeatmap(
  xValues: number[],
  yValues: number[],
  evaluate: (x: number, y: number) => { level: CellLevel; note: string },
  labels: { x: string; y: string } = { x: 'X', y: 'Y' },
): Heatmap {
  const cells: HeatCell[] = []
  const summary = { ok: 0, warn: 0, danger: 0, unknown: 0 }

  for (let row = 0; row < yValues.length; row += 1) {
    for (let col = 0; col < xValues.length; col += 1) {
      const x = xValues[col]
      const y = yValues[row]
      let result: { level: CellLevel; note: string }
      try {
        result = evaluate(x, y)
      } catch (error: any) {
        result = { level: 'unknown', note: '算不出来：' + String((error && error.message) || error) }
      }
      cells.push({ row: row, col: col, x: x, y: y, level: result.level, note: result.note })
      summary[result.level] += 1
    }
  }

  return {
    cells: cells,
    xLabel: labels.x,
    yLabel: labels.y,
    xValues: xValues,
    yValues: yValues,
    summary: summary,
  }
}

/**
 * 生成线性取值的数组（用于扫参）。
 *
 * @param from - 起点
 * @param to - 终点
 * @param steps - 步数
 * @returns 取值数组
 */
export function linspace(from: number, to: number, steps: number): number[] {
  const count = Math.max(2, Math.floor(steps))
  const out: number[] = []
  for (let index = 0; index < count; index += 1) {
    out.push(from + ((to - from) * index) / (count - 1))
  }
  return out
}

/**
 * 找出「极窄的安全区间」——这是微调警告的依据。
 *
 * @param cells - 所有格子
 * @returns 是否极窄、窄到什么程度
 */
export function detectNarrowWindow(cells: HeatCell[]): {
  narrow: boolean;
  safeRatio: number
  note: string
} {
  const total = cells.length
  if (total === 0) return { narrow: false, safeRatio: 0, note: '没有数据' }
  const safe = cells.filter(function (c) { return c.level === 'ok' }).length
  const ratio = safe / total
  if (ratio > 0 && ratio < 0.05) {
    return {
      narrow: true,
      safeRatio: ratio,
      note: '安全区间只占 ' + (ratio * 100).toFixed(1) + '%（' + safe + '/' + total + '）——' +
        '这个世界处在极窄的可行窗里。可以考虑给它一个备选设定。',
    }
  }
  return { narrow: false, safeRatio: ratio, note: '安全区间占 ' + (ratio * 100).toFixed(1) + '%' }
}
