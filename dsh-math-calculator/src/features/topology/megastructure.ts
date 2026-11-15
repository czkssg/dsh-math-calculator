/**
 * 千万级聚居：由**小舱室网络**拼出的封闭空间（不是矩形大空间）。
 *
 * 用户要求（2026-11-16）：测试千万人级封闭空间，由一个个小舱室连接而成；
 * 人口范围从个位数到亿级。
 *
 * ## 模型
 *
 * - 单舱：给定容积 V（m³）与地面面积 A（m²），按人均居住面积定每舱人数；
 * - 网络：舱室数量 = 人口/每舱人数；温室舱按作物面积需求折算；
 * - 走廊/连接：按舱室数×连接容积附加（不是大空间，所以连接体积不可忽略）；
 * - 泄漏：总容积×空气密度×日泄漏率（舱越多、接缝越多，泄漏按总容积计）。
 *
 * ## 输出的是**上限**
 *
 * 每个数字都是「这个人口规模至少需要多少」，不设计具体布局。
 *
 * @module dsh-math-calculator/features/topology/megastructure
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface MegastructureInput {
  /** 目标人口（1 → 1e8+）。 */
  targetPeople: number
  /** 单舱地面面积 m²（默认 500）。 */
  compartmentAreaM2?: number
  /** 单舱容积 m³（默认 1500）。 */
  compartmentVolumeM3?: number
  /** 人均居住面积 m²（默认 10）。 */
  areaPerPerson?: number
  /** 是否自给（自给则算温室舱；否则只算居住舱 + 补给）。 */
  selfSufficient?: boolean
  /** 每人作物面积 m²（自给时：供氧 28、全食物 200；默认 28）。 */
  cropAreaPerPersonM2?: number
}

/** 结果。 */
export interface MegastructureResult {
  /** 目标人口。 */
  targetPeople: number
  /** 每舱人数。 */
  peoplePerCompartment: number
  /** 居住舱数量。 */
  habitatCompartments: number
  /** 温室舱数量（自给时）。 */
  greenhouseCompartments: number
  /** 走廊/连接容积 m³。 */
  corridorVolumeM3: number
  /** 总容积 m³。 */
  totalVolumeM3: number
  /** 总地面面积 m²。 */
  totalFloorAreaM2: number
  /** 总泄漏 kg/天。 */
  totalLeakKgDay: number
  /** 总耗氧 kg/天。 */
  totalO2KgDay: number
  /** 总 CO₂ kg/天。 */
  totalCo2KgDay: number
  /** 总食物（干重）kg/天。 */
  totalFoodKgDay: number
  /** 总用水 L/天。 */
  totalWaterLDay: number
  /** 温室面积 m²（自给时）。 */
  cropAreaM2: number
  /** 每人所需容积 m³（密度指标）。 */
  volumePerPersonM3: number
}

/**
 * 计算千万级聚居的容量下限。
 *
 * @param input - 目标人口与舱室参数
 * @returns 容量结果
 * @throws {CalcError} 人口或舱室参数非法
 */
export function designMegastructure(input: MegastructureInput): MegastructureResult {
  const people = input.targetPeople
  if (!(people >= 1)) throw new CalcError('invalid_argument', 'targetPeople 必须 ≥ 1', '')
  const areaPerPerson = input.areaPerPerson ?? 10
  const compartmentArea = input.compartmentAreaM2 ?? 500
  const compartmentVolume = input.compartmentVolumeM3 ?? 1500
  if (!(compartmentArea > 0) || !(compartmentVolume > 0)) throw new CalcError('invalid_argument', '舱室面积/容积必须为正', '')
  const selfSufficient = input.selfSufficient === true
  const peoplePerCompartment = Math.max(1, Math.floor(compartmentArea / areaPerPerson))
  const habitatCompartments = Math.ceil(people / peoplePerCompartment)
  const cropAreaPerPerson = input.cropAreaPerPersonM2 ?? 28
  const cropAreaM2 = selfSufficient ? people * cropAreaPerPerson : 0
  const greenhouseCompartments = selfSufficient ? Math.ceil(cropAreaM2 / compartmentArea) : 0
  /** 走廊：每个舱室按 20% 舱容积附加（连通体积，不是大空间）。 */
  const corridorVolumeM3 = (habitatCompartments + greenhouseCompartments) * compartmentVolume * 0.2
  const totalVolumeM3 = (habitatCompartments + greenhouseCompartments) * compartmentVolume + corridorVolumeM3
  const totalFloorAreaM2 = (habitatCompartments + greenhouseCompartments) * compartmentArea
  /** 泄漏：总容积 × 1.2 kg/m³ × 0.1%/天。 */
  const totalLeakKgDay = totalVolumeM3 * 1.2 * 0.001
  return {
    targetPeople: people,
    peoplePerCompartment,
    habitatCompartments,
    greenhouseCompartments,
    corridorVolumeM3,
    totalVolumeM3,
    totalFloorAreaM2,
    totalLeakKgDay,
    totalO2KgDay: people * 0.84,
    totalCo2KgDay: people * 1.0,
    totalFoodKgDay: people * 0.62,
    totalWaterLDay: people * 30,
    cropAreaM2,
    volumePerPersonM3: totalVolumeM3 / people,
  }
}
