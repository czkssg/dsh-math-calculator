/**
 * 相图热力图：二维参数扫描的格子判定。
 *
 * 不用 canvas：相图通常只有几十×几十的格子，用语义等级（ok/warn/danger/unknown）
 * 交给界面映射颜色即可，还能 hover 与无障碍读取。
 *
 * @module dsh-math-calculator/features/deduction/heatmap
 */

/** 一个格子的状态。 */
export type CellLevel = 'ok' | 'warn' | 'danger' | 'unknown'

/** 一个格子。 */
export interface HeatCell {
  row: number
  col: number
  x: number
  y: number
  level: CellLevel
  note: string
}

/** 相图结果。 */
export interface Heatmap {
  cells: HeatCell[]
  xLabel: string
  yLabel: string
  xValues: number[]
  yValues: number[]
  summary: { ok: number; warn: number; danger: number; unknown: number }
}

/**
 * 组装热力图。
 *
 * @param xValues - X 轴取值
 * @param yValues - Y 轴取值
 * @param evaluate - 每格判定
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
      } catch (error) {
        result = { level: 'unknown', note: '算不出来：' + String(error instanceof Error ? error.message : error) }
      }
      cells.push({ row, col, x, y, level: result.level, note: result.note })
      summary[result.level] += 1
    }
  }
  return { cells, xLabel: labels.x, yLabel: labels.y, xValues, yValues, summary }
}

/**
 * 线性取值。
 *
 * @param from - 起点
 * @param to - 终点
 * @param steps - 步数
 * @returns 取值数组
 */
export function linspace(from: number, to: number, steps: number): number[] {
  const count = Math.max(2, Math.floor(steps))
  const out: number[] = []
  for (let index = 0; index < count; index += 1) out.push(from + ((to - from) * index) / (count - 1))
  return out
}

/**
 * 找出「极窄的安全区间」。
 *
 * @param cells - 所有格子
 * @returns 是否极窄与说明
 */
export function detectNarrowWindow(cells: HeatCell[]): { narrow: boolean; safeRatio: number; note: string } {
  const total = cells.length
  if (total === 0) return { narrow: false, safeRatio: 0, note: '没有数据' }
  const safe = cells.filter((cell) => cell.level === 'ok').length
  const ratio = safe / total
  if (ratio > 0 && ratio < 0.05) {
    return {
      narrow: true,
      safeRatio: ratio,
      note: '安全区间只占 ' + (ratio * 100).toFixed(1) + '%（' + safe + '/' + total + '）——这个世界处在极窄的可行窗里。',
    }
  }
  return { narrow: false, safeRatio: ratio, note: '安全区间占 ' + (ratio * 100).toFixed(1) + '%' }
}
