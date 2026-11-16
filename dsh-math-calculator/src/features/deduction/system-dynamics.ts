/**
 * 系统动力学（存量/流量）：给存量与流量，自己演化出时间序列。
 *
 * ## 与已有模块的分工
 *
 * - `history`：给**时间序列**，切成纪元；
 * - `simulate`（本模块）：给**存量和流量**，演化出时间序列——这是「长期动态」。
 *
 * 经典来源：Forrester / Meadows 的 System Dynamics（World3 用它做《增长的极限》），
 * 这里只做**四类存量**的简化版：人口 / 资源 / 粮食 / 污染。
 *
 * ## 数值方法
 *
 * 显式欧拉积分：`stock(t+dt) = stock(t) + dt × (流入 − 流出)`。
 * 足够回答「50 年会怎样」，不追求高精度（要精度请用 ode）。
 *
 * @module dsh-math-calculator/features/deduction/system-dynamics
 */

import { all, create } from 'mathjs'
import { CalcError } from '../../core/errors.js'

/** 存量定义。 */
export interface StockDef {
  /** 初值。 */
  initial: number
  /** 单位（展示用）。 */
  unit?: string
}

/** 流量定义。 */
export interface FlowDef {
  /** 加到这个存量（负数为流出）。 */
  to: string
  /** 速率表达式（可用其它存量名与 t）。 */
  rate: string
}

/** 输入。 */
export interface SimulateInput {
  /** 存量表。 */
  stocks: Record<string, StockDef>
  /** 流量表。 */
  flows: Record<string, FlowDef>
  /** 步长（年，默认 1）。 */
  dt?: number
  /** 步数（默认 100）。 */
  steps?: number
}

/** 结果。 */
export interface SimulateResult {
  /** 时间序列：每个存量一条。 */
  series: Record<string, Array<{ t: number; value: number }>>
  /** 峰值年与峰值。 */
  peaks: Record<string, { t: number; value: number }>
  /** 判定。 */
  notes: string[]
}

/**
 * 运行系统动力学模拟。
 *
 * @param input - 存量/流量/步长
 * @returns 时间序列与峰值
 * @throws {CalcError} 输入非法
 */
export function simulateSystemDynamics(input: SimulateInput): SimulateResult {
  const stocks = input.stocks ?? {}
  const flows = input.flows ?? {}
  const stockNames = Object.keys(stocks)
  if (stockNames.length === 0) throw new CalcError('invalid_argument', '需要 stocks（至少一个存量）', '')
  if (Object.keys(flows).length === 0) throw new CalcError('invalid_argument', '需要 flows（至少一个流量）', '')
  for (const [name, flow] of Object.entries(flows)) {
    if (!stockNames.includes(flow.to)) throw new CalcError('invalid_argument', '流量「' + name + '」指向未定义的存量「' + flow.to + '」', '')
  }
  /** 独立的普通浮点 mathjs 实例（BigNumber 会拒绝 15 位以上浮点）。 */
  const math = create(all, { number: 'number', precision: 64 })
  /** 用原生 mathjs（普通浮点）；engine.evaluate 走 BigNumber，浮点演化会撞 15 位有效数字上限。 */
  const evaluateRate = (source: string, scope: Record<string, number>): number => Number(math.evaluate(source, scope as Record<string, unknown>))
  const dt = typeof input.dt === 'number' && input.dt > 0 ? input.dt : 1
  const steps = Math.max(1, Math.min(1000, Math.floor(input.steps ?? 100)))
  const current: Record<string, number> = {}
  for (const name of stockNames) current[name] = Number(stocks[name].initial ?? 0)
  const series: Record<string, Array<{ t: number; value: number }>> = {}
  for (const name of stockNames) series[name] = [{ t: 0, value: current[name] }]
  const notes: string[] = ['欧拉积分，dt=' + dt + '，共 ' + steps + ' 步']
  const invalid: string[] = []
  for (let step = 1; step <= steps; step += 1) {
    const t = step * dt
    const deltas: Record<string, number> = {}
    for (const [name, flow] of Object.entries(flows)) {
      let value = 0
      try {
        const scope: Record<string, number> = { ...current, t, dt }
        value = evaluateRate(flow.rate, scope)
      } catch (error) {
        invalid.push('流量「' + name + '」在第 ' + t + ' 步算不出：' + (error instanceof Error ? error.message : String(error)))
        value = 0
      }
      if (!Number.isFinite(value)) {
        invalid.push('流量「' + name + '」在 t=' + t + ' 得到非有限值（检查除零/开方负数）')
        value = 0
      }
      deltas[flow.to] = (deltas[flow.to] ?? 0) + value
    }
    for (const name of stockNames) {
      current[name] = Math.max(0, current[name] + dt * (deltas[name] ?? 0))
      series[name].push({ t, value: current[name] })
    }
  }
  const peaks: SimulateResult['peaks'] = {}
  for (const name of stockNames) {
    let best = series[name][0]
    for (const point of series[name]) if (point.value > best.value) best = point
    peaks[name] = { t: best.t, value: best.value }
    const last = series[name][series[name].length - 1]
    if (best.t > 0 && best.t < (steps * dt) && last.value < best.value * 0.9) {
      notes.push(name + ' 在第 ' + best.t + ' 年达峰（' + best.value.toFixed(1) + '），之后回落——存在拐点')
    }
  }
  for (const message of [...new Set(invalid)].slice(0, 5)) notes.push('⚠ ' + message)
  return { series, peaks, notes }
}
