/**
 * 热工 / 电气 / 流体 校核（与建筑/舰船/机械同一套规则表）。
 *
 * 三条都是「给几个工程参数，算出硬边界 + 一句判定」，不写正文。
 *
 * @module dsh-math-calculator/features/topology/physical-systems
 */

import { CalcError } from '../../core/errors.js'

// ───────────────────────────── 热工 ─────────────────────────────

/** 热工输入。 */
export interface ThermalInput {
  /** 热源温度 K。 */
  hotK: number
  /** 冷源温度 K。 */
  coldK: number
  /** 换热面积 m²（可选）。 */
  areaM2?: number
  /** 传热系数 W/(m²·K)（可选）。 */
  uValueWm2K?: number
  /** 实际输出热功率 W（可选，用于实际效率）。 */
  outputW?: number
  /** 热输入 W（可选）。 */
  inputW?: number
}

/** 热工结果。 */
export interface ThermalAssess {
  /** 卡诺效率（0–1）。 */
  carnot: number
  /** 实际效率（给 inputW/outputW 时）。 */
  actualEfficiency: number | null
  /** 距卡诺的百分比（给实际效率时）。 */
  carnotFractionPct: number | null
  /** 换热功率 W（给面积与 U 时）。 */
  heatTransferW: number | null
  /** 判定。 */
  verdict: string[]
}

/**
 * 热工校核：卡诺上限 + 换热功率。
 *
 * @param input - 温度与换热参数
 * @returns 校核
 */
export function assessThermal(input: ThermalInput): ThermalAssess {
  if (!(input.hotK > input.coldK)) throw new CalcError('invalid_argument', '热源温度必须高于冷源（hotK > coldK）', '')
  if (!(input.coldK > 0)) throw new CalcError('invalid_argument', 'coldK 必须为正（K）', '')
  const carnot = 1 - input.coldK / input.hotK
  const actual = typeof input.outputW === 'number' && typeof input.inputW === 'number' && input.inputW > 0 ? input.outputW / input.inputW : null
  const fraction = actual !== null && carnot > 0 ? (actual / carnot) * 100 : null
  const heat = typeof input.areaM2 === 'number' && typeof input.uValueWm2K === 'number' ? input.areaM2 * input.uValueWm2K * (input.hotK - input.coldK) : null
  const verdict: string[] = ['卡诺上限 ' + (carnot * 100).toFixed(1) + '%']
  if (fraction !== null) verdict.push('实际 ' + (actual! * 100).toFixed(1) + '% = 卡诺的 ' + fraction.toFixed(0) + '%' + (fraction > 100 ? '（超过卡诺，数据有误）' : fraction > 85 ? '（已接近理论上限，再提只能改温度）' : '（还有余量）'))
  if (heat !== null) verdict.push('换热功率 ' + (heat / 1000).toFixed(1) + ' kW（' + input.areaM2 + ' m² × ' + input.uValueWm2K + ' W/m²K）')
  return { carnot, actualEfficiency: actual, carnotFractionPct: fraction, heatTransferW: heat, verdict }
}

// ───────────────────────────── 电气 ─────────────────────────────

/** 电气输入。 */
export interface ElectricInput {
  /** 电压 V。 */
  voltageV: number
  /** 电流 A（与功率二选一）。 */
  currentA?: number
  /** 功率 W（可选）。 */
  powerW?: number
  /** 线长 m（单程）。 */
  lengthM?: number
  /** 导体截面 mm²。 */
  crossSectionMm2?: number
  /** 导体电阻率 Ω·mm²/m（铜 0.0172）。 */
  resistivity?: number
}

/** 电气结果。 */
export interface ElectricAssess {
  /** 电流 A。 */
  currentA: number
  /** 功率 W。 */
  powerW: number
  /** 导线电阻 Ω（给长度/截面时）。 */
  resistanceOhm: number | null
  /** 压降 V。 */
  voltageDropV: number | null
  /** 压降百分比。 */
  dropPct: number | null
  /** 线损 W。 */
  lossW: number | null
  /** 判定。 */
  verdict: string[]
}

/**
 * 电气校核：压降、线损、载流。
 *
 * @param input - 电压/电流/线路
 * @returns 校核
 */
export function assessElectric(input: ElectricInput): ElectricAssess {
  if (!(input.voltageV > 0)) throw new CalcError('invalid_argument', 'voltageV 必须为正', '')
  const current = typeof input.currentA === 'number' ? input.currentA : typeof input.powerW === 'number' ? input.powerW / input.voltageV : 0
  if (!(current > 0)) throw new CalcError('invalid_argument', '需要 currentA 或 powerW', '')
  const power = typeof input.powerW === 'number' ? input.powerW : input.voltageV * current
  const verdict: string[] = []
  let resistance: number | null = null
  let drop: number | null = null
  let dropPct: number | null = null
  let loss: number | null = null
  if (typeof input.lengthM === 'number' && typeof input.crossSectionMm2 === 'number' && input.crossSectionMm2 > 0) {
    const rho = input.resistivity ?? 0.0172
    /** 往返：2L。 */
    resistance = (rho * 2 * input.lengthM) / input.crossSectionMm2
    drop = resistance * current
    dropPct = (drop / input.voltageV) * 100
    loss = resistance * current * current
    verdict.push('线路电阻 ' + resistance.toFixed(3) + ' Ω，压降 ' + drop.toFixed(2) + ' V（' + dropPct.toFixed(1) + '%）' + (dropPct > 5 ? ' ⚠ 超过 5% 常规限值，需加粗导线或升压' : ' ✓'))
    verdict.push('线损 ' + (loss / 1000).toFixed(2) + ' kW（占 ' + ((loss / power) * 100).toFixed(1) + '%）')
  }
  /** 电流密度判定（默认 6 A/mm²）。 */
  if (typeof input.crossSectionMm2 === 'number' && input.crossSectionMm2 > 0) {
    const density = current / input.crossSectionMm2
    verdict.push('电流密度 ' + density.toFixed(1) + ' A/mm²' + (density > 6 ? ' ⚠ 超过 6 A/mm²（铜芯常规），会过热' : ' ✓'))
  }
  return { currentA: current, powerW: power, resistanceOhm: resistance, voltageDropV: drop, dropPct, lossW: loss, verdict }
}

// ───────────────────────────── 流体 ─────────────────────────────

/** 流体输入。 */
export interface FluidInput {
  /** 管径 m。 */
  diameterM: number
  /** 体积流量 m³/s。 */
  flowM3s: number
  /** 密度 kg/m³（水 1000）。 */
  densityKgM3?: number
  /** 动力粘度 Pa·s（水 0.001）。 */
  viscosityPaS?: number
  /** 管长 m（算沿程损失）。 */
  lengthM?: number
  /** 粗糙度 m（钢管 0.00005）。 */
  roughnessM?: number
}

/** 流体结果。 */
export interface FluidAssess {
  /** 流速 m/s。 */
  velocityMps: number
  /** 雷诺数。 */
  reynolds: number
  /** 流态。 */
  regime: string
  /** 沿程阻力系数（达西）。 */
  frictionFactor: number | null
  /** 沿程损失 Pa。 */
  pressureDropPa: number | null
  /** 水头损失 m。 */
  headLossM: number | null
  /** 判定。 */
  verdict: string[]
}

/**
 * 流体校核：流速/雷诺数/沿程损失。
 *
 * @param input - 管径/流量/物性
 * @returns 校核
 */
export function assessFluid(input: FluidInput): FluidAssess {
  if (!(input.diameterM > 0) || !(input.flowM3s > 0)) throw new CalcError('invalid_argument', '管径与流量必须为正', '')
  const density = input.densityKgM3 ?? 1000
  const viscosity = input.viscosityPaS ?? 0.001
  const area = Math.PI * (input.diameterM / 2) ** 2
  const velocity = input.flowM3s / area
  const reynolds = (density * velocity * input.diameterM) / viscosity
  const regime = reynolds < 2300 ? '层流' : reynolds < 4000 ? '过渡区' : '湍流'
  let friction: number | null = null
  if (reynolds < 2300) friction = 64 / Math.max(1, reynolds)
  else {
    /** Swamee-Jain 近似。 */
    const rough = input.roughnessM ?? 0.00005
    friction = 0.25 / Math.log10(rough / (3.7 * input.diameterM) + 5.74 / Math.pow(reynolds, 0.9)) ** 2
  }
  let dp: number | null = null
  let head: number | null = null
  if (typeof input.lengthM === 'number' && input.lengthM > 0) {
    dp = friction * (input.lengthM / input.diameterM) * ((density * velocity * velocity) / 2)
    head = dp / (density * 9.80665)
  }
  const verdict: string[] = ['流速 ' + velocity.toFixed(3) + ' m/s，Re=' + reynolds.toExponential(2) + '（' + regime + '）']
  if (velocity > 3) verdict.push('⚠ 流速 > 3 m/s（水系统常规上限，磨损与噪声上升）')
  if (dp !== null) verdict.push('沿程损失 ' + (dp / 1000).toFixed(1) + ' kPa（' + (head ?? 0).toFixed(1) + ' m 水头）')
  return { velocityMps: velocity, reynolds, regime, frictionFactor: friction, pressureDropPa: dp, headLossM: head, verdict }
}
