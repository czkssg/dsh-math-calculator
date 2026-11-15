/**
 * 建筑/舰船工程校核：把 topology 模型接到工程公式。
 *
 * ## 耦合点
 *
 * - `topology structure`（层数/面积）→ 疏散宽度、电梯数、风压、抗震底部剪力；
 * - `topology ship`（舱室/通行）→ 排水量、弗劳德数、稳性、续航。
 *
 * 公式与 `src/data/formulas.json` 批次 8 一致（疏散宽度/采光/电梯/风压/抗震/排水量/弗劳德数/海军系数/稳性/横摇/续航）。
 *
 * @module dsh-math-calculator/features/topology/engineering
 */

import { CalcError } from '../../core/errors.js'

/** 建筑输入。 */
export interface BuildingAssessInput {
  /** 层数。 */
  floors: number
  /** 单层面积 m²。 */
  footprintM2: number
  /** 人均面积 m²（默认 10：办公）。 */
  areaPerPerson?: number
}

/** 建筑校核结果。 */
export interface BuildingAssess {
  /** 估算人数。 */
  people: number
  /** 疏散出口总宽度 m（每人 0.5 cm）。 */
  egressWidthM: number
  /** 电梯台数（单梯 13 人、6 次/小时）。 */
  elevators: number
  /** 顶部风压 kN/m²（基本风压 0.55、α=0.16）。 */
  windPressureKnm2: number
  /** 抗震底部剪力 kN（α₁=0.08、G_eq=0.85、活载 2 kN/m²）。 */
  baseShearKn: number
  /** 建筑总高（按层高 3 m）。 */
  heightM: number
}

/**
 * 建筑工程校核。
 *
 * @param input - 层数与面积
 * @returns 校核
 */
export function assessBuildingEngineering(input: BuildingAssessInput): BuildingAssess {
  if (!(input.floors > 0)) throw new CalcError('invalid_argument', 'floors 必须为正', '')
  if (!(input.footprintM2 > 0)) throw new CalcError('invalid_argument', 'footprintM2 必须为正', '')
  const areaPerPerson = input.areaPerPerson ?? 10
  const totalArea = input.floors * input.footprintM2
  const people = Math.round(totalArea / areaPerPerson)
  const egressWidthM = people * 0.005
  const elevators = Math.ceil(people / (13 * 6))
  const heightM = input.floors * 3
  const windPressureKnm2 = 0.55 * Math.pow(heightM / 10, 2 * 0.16)
  /** 抗震：总重力 ≈ 面积×（恒载 5 + 活载 2）kN/m²。 */
  const totalWeightKn = totalArea * 7
  const baseShearKn = 0.08 * 0.85 * totalWeightKn
  return { people, egressWidthM, elevators, windPressureKnm2, baseShearKn, heightM }
}

/** 舰船输入。 */
export interface ShipAssessInput {
  /** 水线长 m。 */
  lengthM: number
  /** 型宽 m。 */
  beamM: number
  /** 吃水 m。 */
  draftM: number
  /** 方形系数（默认 0.65）。 */
  blockCoef?: number
  /** 航速 m/s。 */
  speedMps?: number
  /** 重心高 m（给稳性用）。 */
  kgM?: number
}

/** 舰船校核结果。 */
export interface ShipAssess {
  /** 排水量 t。 */
  displacementT: number
  /** 弗劳德数。 */
  froude: number
  /** 初稳性高 m（KM ≈ 0.9B + 0.5T 近似）。 */
  metacentricHeightM: number
  /** 横摇周期 s（惯性半径 0.35B）。 */
  rollPeriodS: number
  /** 航速对应（kn）。 */
  speedKn: number
}

/**
 * 舰船工程校核。
 *
 * @param input - 主尺度
 * @returns 校核
 */
export function assessShipEngineering(input: ShipAssessInput): ShipAssess {
  if (!(input.lengthM > 0) || !(input.beamM > 0) || !(input.draftM > 0)) throw new CalcError('invalid_argument', '船长/型宽/吃水必须为正', '')
  const cb = input.blockCoef ?? 0.65
  const displacementT = input.lengthM * input.beamM * input.draftM * cb * 1.025
  const speed = input.speedMps ?? 0
  const froude = speed / Math.sqrt(9.80665 * input.lengthM)
  /**
   * 横稳心高：KM = KB + BM。
   * KB ≈ T/2（浮心在吃水一半）；BM = I_wp/V = B²/(12·T·Cb)（箱型水线面近似）。
   * 之前的 0.9B+0.5T 太粗，100 m 船会算出 GM 13 m（真实 1–3 m）。
   */
  const kb = input.draftM / 2
  const bm = (input.beamM ** 2) / (12 * input.draftM * cb)
  const km = kb + bm
  /** KG 默认 0.62T（商船常见 0.6–0.7D）。 */
  const gm = km - (input.kgM ?? 0.62 * input.draftM)
  const k = 0.35 * input.beamM
  const rollPeriodS = gm > 0 ? (2 * Math.PI * k) / Math.sqrt(9.80665 * gm) : Infinity
  return { displacementT, froude, metacentricHeightM: gm, rollPeriodS, speedKn: speed * 1.943844 }
}
