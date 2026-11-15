/**
 * 后勤/信息时延：把「疆域上限」算成数字。
 *
 * 用户原则（2026-11-16）：这是唯一能把「帝国能多大」算成硬上限的模型，
 * 不设计具体驿站，只给「命令往返多少天 / 半径多少 km / 要几个中转站」。
 *
 * ## 默认速度硬上限（历史量级）
 *
 * | 方式 | 速度 | 备注 |
 * |---|---|---|
 * | 步马接力（驿传） | 200–300 km/天 | 换马不换人 |
 * | 信鸽 | 100 km/h | 顺风、短程 |
 * | 烽火 | 800 km/h 等效 | 只传信号，不传内容 |
 * | 船（帆船） | 150–200 km/天 | 受风带限制 |
 * | 铁路 | 60–120 km/h | 需轨道 |
 * | 电报/无线电 | 光速 | 硬上限 |
 *
 * @module dsh-math-calculator/features/topology/logistics
 */

import { CalcError } from '../../core/errors.js'

/** 默认速度（km/h）。 */
const SPEEDS: Record<string, number> = {
  horse: 12,      // 驿传等效 12 km/h（一天跑 8–10 小时 ≈ 100–120 km，接力可到 250）
  beacon: 800,    // 烽火（等效信息速度）
  ship: 8,        // 帆船
  rail: 100,      // 铁路
  telegraph: 300000, // 电报/无线电
  pigeon: 100,
}

/** 输入。 */
export interface LogisticsInput {
  /** 方式：horse / beacon / ship / rail / telegraph / pigeon。 */
  mode?: string
  /** 距离 km（给了就算单程/往返）。 */
  distanceKm?: number
  /** 覆盖默认速度（km/h）。 */
  speedKph?: number
  /** 中转站间隔 km（给了就算站数）。 */
  stationKm?: number
  /** 每站延误小时。 */
  stationDelayHours?: number
  /** 允许的最大往返天数（定了就算半径上限）。 */
  maxRoundTripDays?: number
}

/** 结果。 */
export interface LogisticsResult {
  mode: string
  speedKph: number
  /** 单程小时。 */
  oneWayHours: number
  /** 往返天数（含中转）。 */
  roundTripDays: number
  /** 中转站数（给站距时）。 */
  stations: number | null
  /** 往返 ≤ 目标天数时的最大半径 km（给目标时）。 */
  maxRadiusKm: number | null
  /** 说明。 */
  notes: string[]
}

/**
 * 计算后勤/信息时延上限。
 *
 * @param input - 方式与距离
 * @returns 结果
 */
export function analyzeLogistics(input: LogisticsInput): LogisticsResult {
  const mode = input.mode ?? 'horse'
  const speed = input.speedKph ?? SPEEDS[mode]
  if (!(speed > 0)) throw new CalcError('invalid_argument', '速度必须为正（检查 mode）', '可用：horse / beacon / ship / rail / telegraph / pigeon。')
  const distance = typeof input.distanceKm === 'number' && input.distanceKm > 0 ? input.distanceKm : null
  const stationKm = typeof input.stationKm === 'number' && input.stationKm > 0 ? input.stationKm : null
  const stationDelay = typeof input.stationDelayHours === 'number' ? input.stationDelayHours : 0
  const stations = distance !== null && stationKm !== null ? Math.max(0, Math.floor(distance / stationKm)) : null
  const notes: string[] = ['方式 ' + mode + '，速度 ' + speed.toFixed(1) + ' km/h']
  let oneWayHours = 0
  let roundTripDays = 0
  if (distance !== null) {
    oneWayHours = distance / speed + (stations ?? 0) * stationDelay
    roundTripDays = (oneWayHours * 2) / 24
    notes.push('距离 ' + distance + ' km → 单程 ' + oneWayHours.toFixed(1) + ' 小时，往返 ' + roundTripDays.toFixed(1) + ' 天')
  }
  let maxRadiusKm: number | null = null
  if (typeof input.maxRoundTripDays === 'number' && input.maxRoundTripDays > 0) {
    const hoursPerLeg = (input.maxRoundTripDays * 24) / 2
    maxRadiusKm = hoursPerLeg * speed
    notes.push('往返 ≤ ' + input.maxRoundTripDays + ' 天 → 半径上限 ' + maxRadiusKm.toFixed(0) + ' km')
  }
  if (mode === 'telegraph') notes.push('这是硬上限（光速）；内容传输仍有带宽/加密开销')
  if (mode === 'beacon') notes.push('烽火只传「有没有事」，不传内容')
  return { mode, speedKph: speed, oneWayHours, roundTripDays, stations, maxRadiusKm, notes }
}
