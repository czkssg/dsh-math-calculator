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
