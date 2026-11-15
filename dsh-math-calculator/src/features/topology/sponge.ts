/**
 * 海绵状庇护所：由一个个**小空腔**构成，不是巨型空腔。
 *
 * 用户判断（2026-11-16）：无论新建超级建筑，还是在山体里掏洞，
 * 大概率都不存在巨大空腔，而是小空腔连成海绵。这引入两条**相反的硬限制**：
 *
 * 1. 空腔太大 → 跨度失效（岩石/结构撑不住）；
 * 2. 空腔太小 → 表面积/体积比暴增（支护、密封、泄漏、通风成本按表面积涨）。
 *
 * 所以「最优空腔尺寸」由这两条夹出来，本模块算的是**给定尺寸下的总量**与比值。
 *
 * ## 公式
 *
 * - 空腔近似立方：边长 = V^(1/3)，表面积 = 6·边²；
 * - 每室人数 = 容积 ÷ 人均容积；
 * - 支护/密封面积 = 空腔数 × 单室表面积；
 * - 开挖岩体 = 空腔总容积 ÷ 开挖率（山体）；
 * - 跨度判据：边长 > 允许跨度 → 警告。
 *
 * @module dsh-math-calculator/features/topology/sponge
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface SpongeInput {
  /** 目标人口。 */
  targetPeople: number
  /** 单室容积 m³（默认 60，约 2 人）。 */
  cavityVolumeM3?: number
  /** 人均容积 m³（默认 30）。 */
  volumePerPersonM3?: number
  /** 允许跨度 m（岩石 10–20、钢结构 30–60；默认 15）。 */
  maxSpanM?: number
  /** 开挖率（空腔/岩体体积，0–1，默认 0.3）。 */
  excavationRatio?: number
  /** 介质密度 kg/m³（岩石 2700；太空为 0——不算排土）。 */
  mediumDensityKgM3?: number
}

/** 结果。 */
export interface SpongeResult {
  /** 每室人数。 */
  peoplePerCavity: number
  /** 空腔数量。 */
  cavityCount: number
  /** 空腔总容积 m³。 */
  totalCavityVolumeM3: number
  /** 单室表面积 m²。 */
  cavitySurfaceM2: number
  /** 总表面积 m²（= 支护/密封面积）。 */
  totalSurfaceM2: number
  /** 表面积/体积比（1/m）——越小越省。 */
  surfaceToVolume: number
  /** 单室边长 m。 */
  edgeM: number
  /** 跨度是否超限。 */
  spanOk: boolean
  /** 开挖岩体体积 m³。 */
  excavatedVolumeM3: number
  /** 排土质量 t。 */
  spoilMassT: number
  /** 每 m² 支护面积对应的空腔容积（m³/m²）。 */
  volumePerSurfaceM3: number
}

/**
 * 计算海绵状庇护所的总量。
 *
 * @param input - 人口与空腔参数
 * @returns 结果
 * @throws {CalcError} 参数非法
 */
export function designSpongeHabitat(input: SpongeInput): SpongeResult {
  const people = input.targetPeople
  if (!(people >= 1)) throw new CalcError('invalid_argument', 'targetPeople 必须 ≥ 1', '')
  const cavityVolume = input.cavityVolumeM3 ?? 60
  const volumePerPerson = input.volumePerPersonM3 ?? 30
  const maxSpan = input.maxSpanM ?? 15
  const excavationRatio = input.excavationRatio ?? 0.3
  const mediumDensity = input.mediumDensityKgM3 ?? 2700
  if (!(cavityVolume > 0)) throw new CalcError('invalid_argument', 'cavityVolumeM3 必须为正', '')
  if (!(volumePerPerson > 0)) throw new CalcError('invalid_argument', 'volumePerPersonM3 必须为正', '')
  const peoplePerCavity = Math.max(1, cavityVolume / volumePerPerson)
  const cavityCount = Math.ceil(people / peoplePerCavity)
  const totalCavityVolume = cavityCount * cavityVolume
  const edge = Math.cbrt(cavityVolume)
  const cavitySurface = 6 * edge * edge
  const totalSurface = cavityCount * cavitySurface
  const surfaceToVolume = totalSurface / totalCavityVolume
  const volumePerSurface = totalCavityVolume / totalSurface
  const excavatedVolume = excavationRatio > 0 ? totalCavityVolume / excavationRatio : 0
  return {
    peoplePerCavity,
    cavityCount,
    totalCavityVolumeM3: totalCavityVolume,
    cavitySurfaceM2: cavitySurface,
    totalSurfaceM2: totalSurface,
    surfaceToVolume,
    edgeM: edge,
    spanOk: edge <= maxSpan,
    excavatedVolumeM3: excavatedVolume,
    spoilMassT: (excavatedVolume * mediumDensity) / 1000,
    volumePerSurfaceM3: volumePerSurface,
  }
}
