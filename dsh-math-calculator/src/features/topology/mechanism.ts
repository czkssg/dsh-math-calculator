/**
 * 机械系统校核：齿轮箱 / 轴系 / 轴承。
 *
 * 公式来自批次 9（齿轮传动/圆周力/Lewis/赫兹、轴承 L10/当量载荷、轴扭转/临界转速）。
 * 与建筑/舰船一样走**规则表**（src/data/topology-assessments.json），新增类型只改数据。
 *
 * @module dsh-math-calculator/features/topology/mechanism
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface MechanismInput {
  /** 传递功率 W。 */
  powerW: number
  /** 输入转速 r/min。 */
  rpm: number
  /** 传动比（从动/主动）。 */
  ratio?: number
  /** 主动轮齿数。 */
  teethDriver?: number
  /** 模数 mm。 */
  moduleMm?: number
  /** 齿宽 mm。 */
  faceWidthMm?: number
  /** 轴径 mm。 */
  shaftDmm?: number
  /** 轴承额定动载荷 N。 */
  bearingC?: number
  /** 轴承当量动载荷 N。 */
  bearingP?: number
  /** 设计寿命 h（默认 10000）。 */
  lifeH?: number
}

/** 结果。 */
export interface MechanismAssess {
  /** 扭矩 N·m。 */
  torqueNm: number
  /** 输出转速 r/min。 */
  outputRpm: number
  /** 齿数比。 */
  teethRatio: number | null
  /** 圆周力 N。 */
  tangentialN: number | null
  /** Lewis 齿根应力 Pa。 */
  lewisStressPa: number | null
  /** 轴向所需轴承寿命（按给定 P/C）。 */
  bearingLifeH: number | null
  /** 轴扭转切应力 Pa。 */
  shaftTorsionPa: number | null
  /** 轴临界转速 r/min（静挠度 0.5 mm 假定）。 */
  criticalRpm: number | null
  /** 判定：应力/寿命是否在常见范围。 */
  verdict: string[]
}

/**
 * 机械系统校核。
 *
 * @param input - 功率/转速/尺寸
 * @returns 校核
 * @throws {CalcError} 参数非法
 */
export function assessMechanism(input: MechanismInput): MechanismAssess {
  if (!(input.powerW > 0)) throw new CalcError('invalid_argument', 'powerW 必须为正', '')
  if (!(input.rpm > 0)) throw new CalcError('invalid_argument', 'rpm 必须为正', '')
  const ratio = input.ratio ?? 1
  const torque = (input.powerW * 60) / (2 * Math.PI * input.rpm)
  const outputRpm = input.rpm / ratio
  const verdict: string[] = []
  /** 齿数比与圆周力（需要模数、齿数）。 */
  let teethRatio: number | null = null
  let tangential: number | null = null
  let lewis: number | null = null
  if (typeof input.teethDriver === 'number' && typeof input.moduleMm === 'number' && typeof input.faceWidthMm === 'number') {
    const teethDriven = Math.round(input.teethDriver * ratio)
    teethRatio = teethDriven / input.teethDriver
    const pitchD = (input.moduleMm * input.teethDriver) / 1000
    tangential = (2 * torque) / pitchD
    const bM = input.faceWidthMm / 1000
    const mM = input.moduleMm / 1000
    /** Lewis：σ = Ft/(b·m·Y)，Y 取 0.3。 */
    lewis = tangential / (bM * mM * 0.3)
    if (lewis > 4e8) verdict.push('齿根弯曲应力 ' + (lewis / 1e6).toFixed(0) + ' MPa：接近合金钢许用上限')
    else verdict.push('齿根弯曲应力 ' + (lewis / 1e6).toFixed(0) + ' MPa：常规范围')
  }
  /** 轴承寿命。 */
  let bearingLife: number | null = null
  if (typeof input.bearingC === 'number' && typeof input.bearingP === 'number' && input.bearingP > 0) {
    bearingLife = ((input.bearingC / input.bearingP) ** 3 * 1e6) / (60 * input.rpm)
    const want = input.lifeH ?? 10000
    verdict.push('轴承 L10 ' + bearingLife.toFixed(0) + ' h（目标 ' + want + ' h）' + (bearingLife >= want ? ' ✓' : ' ✗ 需换大一号'))
  }
  /** 轴扭转。 */
  let torsion: number | null = null
  if (typeof input.shaftDmm === 'number' && input.shaftDmm > 0) {
    const Wt = (Math.PI * (input.shaftDmm / 1000) ** 3) / 16
    torsion = torque / Wt
    verdict.push('轴扭转切应力 ' + (torsion / 1e6).toFixed(1) + ' MPa' + (torsion > 60e6 ? '（超过 45 钢许用 ~40 MPa）' : '（常规范围）'))
  }
  /** 临界转速：n_cr = 30/π·√(g/δ)，δ=0.5 mm。 */
  const criticalRpm = (30 / Math.PI) * Math.sqrt(9.80665 / 0.0005)
  if (input.rpm > criticalRpm * 0.8) verdict.push('工作转速接近临界转速（' + criticalRpm.toFixed(0) + ' r/min），需避开 ±20%')
  return { torqueNm: torque, outputRpm, teethRatio, tangentialN: tangential, lewisStressPa: lewis, bearingLifeH: bearingLife, shaftTorsionPa: torsion, criticalRpm, verdict }
}

// ───────────────────────────── 液压/气动 + 多级传动（2026-11-16） ─────────────────────────────

/** 液压/气动输入。 */
export interface FluidPowerInput {
  /** 系统压力 Pa。 */
  pressurePa: number
  /** 流量 m³/s。 */
  flowM3s: number
  /** 总效率（0–1，默认 0.85）。 */
  efficiency?: number
  /** 执行器缸径 mm（给则算推力）。 */
  boreMm?: number
  /** 杆径 mm（给则算回程力）。 */
  rodMm?: number
}

/** 液压/气动结果。 */
export interface FluidPowerAssess {
  /** 液压功率 W（p·Q）。 */
  hydraulicPowerW: number
  /** 有效功率 W（乘效率）。 */
  outputPowerW: number
  /** 缸推力 N（给缸径时）。 */
  thrustN: number | null
  /** 回程推力 N（给杆径时）。 */
  retractN: number | null
  /** 缸速 m/s（给缸径时）。 */
  pistonSpeedMps: number | null
}

/**
 * 液压/气动功率与执行器。
 *
 * @param input - 压力/流量/缸径
 * @returns 校核
 */
export function assessFluidPower(input: FluidPowerInput): FluidPowerAssess {
  if (!(input.pressurePa > 0) || !(input.flowM3s > 0)) throw new CalcError('invalid_argument', '压力与流量必须为正', '')
  const efficiency = input.efficiency ?? 0.85
  const hydraulic = input.pressurePa * input.flowM3s
  const thrust = typeof input.boreMm === 'number' && input.boreMm > 0 ? input.pressurePa * Math.PI * (input.boreMm / 2000) ** 2 : null
  const retract = typeof input.boreMm === 'number' && typeof input.rodMm === 'number' && input.boreMm > input.rodMm
    ? input.pressurePa * Math.PI * (((input.boreMm / 2000) ** 2) - ((input.rodMm / 2000) ** 2))
    : null
  const speed = typeof input.boreMm === 'number' && input.boreMm > 0 ? input.flowM3s / (Math.PI * (input.boreMm / 2000) ** 2) : null
  return { hydraulicPowerW: hydraulic, outputPowerW: hydraulic * efficiency, thrustN: thrust, retractN: retract, pistonSpeedMps: speed }
}

/** 传动链一级。 */
export interface TrainStage {
  /** 传动比（从动/主动）。 */
  ratio: number
  /** 该级效率（0–1，默认 0.97）。 */
  efficiency?: number
}

/** 传动链输入。 */
export interface TrainInput {
  /** 输入功率 W。 */
  powerW: number
  /** 输入转速 r/min。 */
  rpm: number
  /** 各级。 */
  stages: TrainStage[]
}

/** 传动链结果。 */
export interface TrainAssess {
  /** 总传动比。 */
  totalRatio: number
  /** 总效率。 */
  totalEfficiency: number
  /** 末级转速 r/min。 */
  outputRpm: number
  /** 末级扭矩 N·m。 */
  outputTorqueNm: number
  /** 末级功率 W。 */
  outputPowerW: number
  /** 各级累计（比/效率/转速）。 */
  perStage: Array<{ index: number; ratio: number; efficiency: number; rpm: number }>
}

/**
 * 多级传动链（齿轮箱/减速器）。
 *
 * @param input - 功率/转速/各级
 * @returns 校核
 */
export function assessTrain(input: TrainInput): TrainAssess {
  if (!(input.powerW > 0) || !(input.rpm > 0)) throw new CalcError('invalid_argument', '功率与转速必须为正', '')
  if (!Array.isArray(input.stages) || input.stages.length === 0) throw new CalcError('invalid_argument', 'stages 不能为空', '')
  let ratio = 1
  let efficiency = 1
  let rpm = input.rpm
  const perStage: TrainAssess['perStage'] = []
  for (let index = 0; index < input.stages.length; index += 1) {
    const stage = input.stages[index]
    if (!(stage.ratio > 0)) throw new CalcError('invalid_argument', '第 ' + (index + 1) + ' 级传动比必须为正', '')
    ratio *= stage.ratio
    efficiency *= stage.efficiency ?? 0.97
    rpm /= stage.ratio
    perStage.push({ index: index + 1, ratio: stage.ratio, efficiency: stage.efficiency ?? 0.97, rpm })
  }
  const outputPower = input.powerW * efficiency
  const outputTorque = (outputPower * 60) / (2 * Math.PI * rpm)
  return { totalRatio: ratio, totalEfficiency: efficiency, outputRpm: rpm, outputTorqueNm: outputTorque, outputPowerW: outputPower, perStage }
}
