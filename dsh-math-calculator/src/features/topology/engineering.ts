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
import { solveClosure } from './closure.js'
import { designMegastructure } from './megastructure.js'
import { designSpongeHabitat } from './sponge.js'

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

// ───────────────────────────── 数据驱动耦合（2026-11-16） ─────────────────────────────

/**
 * 耦合规则（从 src/data/topology-assessments.json 注入）。
 *
 * 为什么改成规则表：用户明确「这种耦合必须有自由性，因为未来可能会推倒」（太空舰筑/太空舰船）。
 * 硬编码 if (kind==='building') 会把新增类型绑死在 ops.ts；规则表让新增类型只改数据 + 加 calculator。
 */
export interface AssessmentRule {
  id: string
  match: { action: string; kind?: string; requires?: string[] }
  calculator: string
  output: string
}

/** 太空舰船输入。 */
export interface SpaceVesselInput {
  /** 干质量 kg。 */
  massKg: number
  /** 目标 Δv（km/s）。 */
  deltaVKms: number
  /** 比冲 s（默认 3000，核电推进量级）。 */
  ispS?: number
  /** 推进功率 W（可选，用于推重比）。 */
  powerW?: number
}

/** 太空舰船结果。 */
export interface SpaceVesselAssess {
  /** 齐奥尔科夫斯基质量比。 */
  massRatio: number
  /** 推进剂质量 kg（m0−mf）。 */
  propellantKg: number
  /** 推重比（给推力时）。 */
  thrustToWeight: number | null
  /** 排气速度 m/s。 */
  exhaustVelocity: number
}

/**
 * 太空舰船：齐奥尔科夫斯基方程。
 *
 * Δv = Isp·g·ln(m0/mf)；推重比 = F/(m0·g)。
 *
 * @param input - 干质量/Δv/比冲
 * @returns 校核
 */
export function assessSpaceVessel(input: SpaceVesselInput): SpaceVesselAssess {
  if (!(input.massKg > 0)) throw new CalcError('invalid_argument', 'massKg 必须为正', '')
  if (!(input.deltaVKms > 0)) throw new CalcError('invalid_argument', 'deltaVKms 必须为正', '')
  const isp = input.ispS ?? 3000
  const ve = isp * 9.80665
  const dv = input.deltaVKms * 1000
  const massRatio = Math.exp(dv / ve)
  const m0 = input.massKg * massRatio
  const propellantKg = m0 - input.massKg
  const thrustToWeight = typeof input.powerW === 'number' && input.powerW > 0 ? (2 * input.powerW) / ve / (m0 * 9.80665) : null
  return { massRatio, propellantKg, thrustToWeight, exhaustVelocity: ve }
}

/** 太空建筑输入。 */
export interface SpaceHabitatInput {
  /** 层数。 */
  floors: number
  /** 单层面积 m²。 */
  footprintM2: number
  /** 是否旋转造重力。 */
  spinning?: boolean
  /** 目标重力（g，旋转时用）。 */
  targetG?: number
}

/** 太空建筑结果。 */
export interface SpaceHabitatAssess {
  /** 人数（10 m²/人）。 */
  people: number
  /** 总屏蔽质量 kg（5 t/m² 辐射屏蔽，按外表面积估算）。 */
  shieldingKg: number
  /** 旋转半径 m（造 1 g 所需，若 spinning）。 */
  spinRadiusM: number | null
  /** 自转速度 m/s（轮缘）。 */
  rimSpeedMps: number | null
}

/**
 * 太空建筑：辐射屏蔽质量 + 旋转重力半径。
 *
 * @param input - 层数/面积
 * @returns 校核
 */
export function assessSpaceHabitat(input: SpaceHabitatInput): SpaceHabitatAssess {
  if (!(input.floors > 0) || !(input.footprintM2 > 0)) throw new CalcError('invalid_argument', 'floors/footprintM2 必须为正', '')
  const people = Math.round((input.floors * input.footprintM2) / 10)
  const side = Math.sqrt(input.footprintM2)
  const area = 2 * (input.floors * input.footprintM2) + 4 * side * input.floors * 3
  const shieldingKg = area * 5000
  const targetG = input.targetG ?? 1
  const spinRadiusM = input.spinning === true ? (9.80665 * targetG) / ((2 * Math.PI) / 60) ** 2 : null
  const rimSpeedMps = spinRadiusM !== null ? ((2 * Math.PI) / 60) * spinRadiusM : null
  return { people, shieldingKg, spinRadiusM, rimSpeedMps }
}

/** calculator 注册表（新增类型只加一项）。 */
const CALCULATORS: Record<string, (input: Record<string, unknown>) => unknown> = {
  building: (input) => assessBuildingEngineering({ floors: Number(input['floors'] ?? 0), footprintM2: Number(input['footprintM2'] ?? 0) }),
  ship: (input) => assessShipEngineering({ lengthM: Number(input['lengthM'] ?? 0), beamM: Number(input['beamM'] ?? 0), draftM: Number(input['draftM'] ?? 0), blockCoef: input['blockCoef'] !== undefined ? Number(input['blockCoef']) : undefined, speedMps: input['speedMps'] !== undefined ? Number(input['speedMps']) : undefined, kgM: input['kgM'] !== undefined ? Number(input['kgM']) : undefined }),
  'space-vessel': (input) => assessSpaceVessel({ massKg: Number(input['massKg'] ?? 0), deltaVKms: Number(input['deltaVKms'] ?? 0), ispS: input['ispS'] !== undefined ? Number(input['ispS']) : undefined, powerW: input['powerW'] !== undefined ? Number(input['powerW']) : undefined }),
  'space-habitat': (input) => assessSpaceHabitat({ floors: Number(input['floors'] ?? 0), footprintM2: Number(input['footprintM2'] ?? 0), spinning: input['spinning'] === true, targetG: input['targetG'] !== undefined ? Number(input['targetG']) : undefined }),
  enclosure: (input) => assessEnclosure({ people: Number(input['people'] ?? 0), volumeM3: Number(input['volumeM3'] ?? 0), days: input['days'] !== undefined ? Number(input['days']) : undefined, cropAreaM2: input['cropAreaM2'] !== undefined ? Number(input['cropAreaM2']) : undefined, algaeM3: input['algaeM3'] !== undefined ? Number(input['algaeM3']) : undefined }),
  sponge: (input) => designSpongeHabitat({ targetPeople: Number(input['targetPeople'] ?? 0), cavityVolumeM3: input['cavityVolumeM3'] !== undefined ? Number(input['cavityVolumeM3']) : undefined, volumePerPersonM3: input['volumePerPersonM3'] !== undefined ? Number(input['volumePerPersonM3']) : undefined, maxSpanM: input['maxSpanM'] !== undefined ? Number(input['maxSpanM']) : undefined, excavationRatio: input['excavationRatio'] !== undefined ? Number(input['excavationRatio']) : undefined, mediumDensityKgM3: input['mediumDensityKgM3'] !== undefined ? Number(input['mediumDensityKgM3']) : undefined }),
  megastructure: (input) => designMegastructure({ targetPeople: Number(input['targetPeople'] ?? 0), compartmentAreaM2: input['compartmentAreaM2'] !== undefined ? Number(input['compartmentAreaM2']) : undefined, compartmentVolumeM3: input['compartmentVolumeM3'] !== undefined ? Number(input['compartmentVolumeM3']) : undefined, areaPerPerson: input['areaPerPerson'] !== undefined ? Number(input['areaPerPerson']) : undefined, selfSufficient: input['selfSufficient'] === true, cropAreaPerPersonM2: input['cropAreaPerPersonM2'] !== undefined ? Number(input['cropAreaPerPersonM2']) : undefined }),
  'closed-loop': (input) => solveClosure({ people: Number(input['people'] ?? 0), cropAreaM2: input['cropAreaM2'] !== undefined ? Number(input['cropAreaM2']) : undefined, algaeM3: input['algaeM3'] !== undefined ? Number(input['algaeM3']) : undefined, waterRecycle: input['waterRecycle'] !== undefined ? Number(input['waterRecycle']) : undefined, bufferO2Kg: input['bufferO2Kg'] !== undefined ? Number(input['bufferO2Kg']) : undefined, volumeM3: input['volumeM3'] !== undefined ? Number(input['volumeM3']) : undefined }),
}

/**
 * 按规则表解析工程校核（数据驱动，不在 ops.ts 里硬编码类型）。
 *
 * @param rules - 规则表
 * @param action - topology 动作
 * @param input - 扁平输入
 * @returns 命中的 calculator 与结果；未命中返回 null（不瞎编）
 */
export function resolveAssessment(rules: AssessmentRule[], action: string, input: Record<string, unknown>): { rule: AssessmentRule; result: unknown } | null {
  const kind = typeof input['kind'] === 'string' ? input['kind'] : undefined
  for (const rule of rules) {
    if (rule.match.action !== action) continue
    if (rule.match.kind !== undefined && rule.match.kind !== kind) continue
    const requires = rule.match.requires ?? []
    if (!requires.every((key) => typeof input[key] === 'number' && Number(input[key]) > 0)) continue
    const calculator = CALCULATORS[rule.calculator]
    if (calculator === undefined) continue
    try {
      return { rule, result: calculator(input) }
    } catch {
      return null
    }
  }
  return null
}

// ───────────────────────────── 封闭系统（避难所/温室） ─────────────────────────────

/** 封闭系统输入。 */
export interface EnclosureInput {
  /** 人数。 */
  people: number
  /** 舱体积 m³。 */
  volumeM3: number
  /** 设计自持天数（无补给）。 */
  days?: number
  /** 是否有温室（面积 m²，可选）。 */
  cropAreaM2?: number
  /** 是否有藻类反应器（体积 m³，可选）。 */
  algaeM3?: number
}

/** 封闭系统结果。 */
export interface EnclosureAssess {
  /** 日耗氧 kg。 */
  o2KgDay: number
  /** 日产 CO₂ kg。 */
  co2KgDay: number
  /** 无清除时 CO₂ 上升速率 ppm/天。 */
  co2RisePpmDay: number
  /** 无清除达 1000 ppm 的天数。 */
  hoursTo1000Ppm: number
  /** 需要 LiOH kg（按设计天数）。 */
  liohKg: number
  /** 缓冲天数（按 3 天应急储备）。 */
  bufferDays: number
  /** 人体热负荷 W。 */
  heatLoadW: number
  /** 温室供氧覆盖人数（有温室时）。 */
  greenhouseCoverPeople: number | null
  /** 藻类供氧覆盖人数（有藻类时）。 */
  algaeCoverPeople: number | null
  /** 食物自给面积 m²（有温室时）。 */
  foodAreaM2: number | null
}

/**
 * 封闭系统（避难所/生物温室）核算。
 *
 * 参数来自 NASA ECLSS 典型值与 Biosphere 2/BIOS-3 实验量级。
 *
 * @param input - 人数/体积/天数
 * @returns 核算
 */
export function assessEnclosure(input: EnclosureInput): EnclosureAssess {
  if (!(input.people > 0)) throw new CalcError('invalid_argument', 'people 必须为正', '')
  if (!(input.volumeM3 > 0)) throw new CalcError('invalid_argument', 'volumeM3 必须为正', '')
  const days = input.days ?? 7
  const o2KgDay = input.people * 0.84
  const co2KgDay = input.people * 1.0
  const co2RisePpmDay = (co2KgDay / input.volumeM3 / 1.98) * 1e6
  const hoursTo1000Ppm = co2RisePpmDay > 0 ? (1000 / co2RisePpmDay) * 24 : Infinity
  const liohKg = (co2KgDay * days) / 0.88
  const bufferDays = days
  const heatLoadW = input.people * 100
  const greenhouseCoverPeople = typeof input.cropAreaM2 === 'number' && input.cropAreaM2 > 0 ? input.cropAreaM2 * 0.03 / 0.84 : null
  const algaeCoverPeople = typeof input.algaeM3 === 'number' && input.algaeM3 > 0 ? (input.algaeM3 * 1.3) / 0.84 : null
  const foodAreaM2 = typeof input.cropAreaM2 === 'number' && input.cropAreaM2 > 0 ? null : null
  return { o2KgDay, co2KgDay, co2RisePpmDay, hoursTo1000Ppm, liohKg, bufferDays: days, heatLoadW, greenhouseCoverPeople, algaeCoverPeople, foodAreaM2 }
}
