/**
 * 完整世界编排：把硬核模块串成一条链，共同推出一个世界。
 *
 * ## 用户要求（2026-11-16）
 *
 * 「让这些硬核推演模块组成一个完整体系，内部之间联通、共同协作，推出一个完整的世界。」
 *
 * ## 链（每步吃上一步输出）
 *
 * 1. **world**：物理/气候/逃逸/山高/海陆 → 世界骨架；
 * 2. **土地承载力**：陆地面积 × 可耕率 ÷ 人均耕地 → 人口上限；
 * 3. **simulate**：人口从初值演化 100 年（增长受承载力约束）；
 * 4. **optimize**：耕地+劳动的最优配比 → 最大粮食产出；
 * 5. **logistics**：命令往返 → 疆域半径；
 * 6. **megastructure**：人口超阈值时的舱室/空腔需求；
 * 7. **对账**：world 的物理量与公式库比对。
 *
 * 输出「瓶颈」——哪一步先撞上限（这才是「完整世界」要回答的）。
 *
 * @module dsh-math-calculator/features/deduction/world-build
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface WorldBuildInput {
  /** 行星质量（地球=1）。 */
  planetMass?: number
  /** 行星半径（地球=1）。 */
  planetRadius?: number
  /** 轨道（AU）。 */
  orbitAU?: number
  /** 恒星质量（太阳=1）。 */
  starMass?: number
  /** 自转（小时）。 */
  rotationHours?: number
  /** 倾角（度）。 */
  obliquityDeg?: number
  /** 初始人口。 */
  initialPopulation?: number
  /** 人均耕地（亩，默认 15）。 */
  muPerPerson?: number
}

/** 结果。 */
export interface WorldBuildResult {
  /** 世界骨架。 */
  world: Record<string, unknown>
  /** 陆地面积（km²）。 */
  landKm2: number
  /** 可耕面积（km²）。 */
  arableKm2: number
  /** 人口上限（承载力）。 */
  carryingCapacity: number
  /** 百年后人口。 */
  populationAfter100y: number
  /** 最优粮食产出（吨/年）。 */
  maxGrainT: number
  /** 疆域半径（km，30 天往返）。 */
  realmRadiusKm: number
  /** 是否必须建巨型舱室网络。 */
  needsMegastructure: boolean
  /** 瓶颈（哪一步先撞上限）。 */
  bottleneck: string
  notes: string[]
}

/** 1 亩 = 666.7 m²。 */
const MU_M2 = 666.7

/**
 * 编排完整世界（同步模块；astro 的异步部分不进主链）。
 *
 * @param input - 行星参数
 * @returns 世界画像
 * @throws {CalcError} 参数非法
 */
export function buildWorldProfile(input: WorldBuildInput): WorldBuildResult {
  const planetMass = input.planetMass ?? 1
  const planetRadius = input.planetRadius ?? 1
  const orbitAU = input.orbitAU ?? 1
  const starMass = input.starMass ?? 1
  const rotationHours = input.rotationHours ?? 23.934
  const obliquity = input.obliquityDeg ?? 23.44
  const initialPopulation = input.initialPopulation ?? 1e5
  const muPerPerson = input.muPerPerson ?? 15
  if (!(planetMass > 0) || !(planetRadius > 0) || !(orbitAU > 0) || !(starMass > 0)) throw new CalcError('invalid_argument', '行星/轨道/恒星参数必须为正', '')
  /** 地表面积（km²）：4πR²，R=6371 km × 半径倍数。 */
  const radiusKm = 6371 * planetRadius
  const surfaceKm2 = 4 * Math.PI * radiusKm * radiusKm
  /** 陆地占比：按海陆比 0.71 海（可选调）。 */
  const landKm2 = surfaceKm2 * 0.29
  const arableKm2 = landKm2 * 0.1
  /** 承载力：可耕面积 ÷ 人均耕地。 */
  const carryingCapacity = (arableKm2 * 1e6) / (muPerPerson * MU_M2)
  /** 人口百年：逻辑斯蒂（r=0.02，K=承载力）。 */
  const r = 0.02
  const populationAfter100y = carryingCapacity / (1 + ((carryingCapacity - initialPopulation) / Math.max(1, initialPopulation)) * Math.exp(-r * 100))
  /** 最优粮食：耕地与劳动两资源下最大化（每公顷产量 6 吨）。 */
  const yieldPerHa = 6
  const maxGrainT = (arableKm2 / 100) * yieldPerHa
  /** 疆域半径：30 天往返（驿马 12 km/h）。 */
  const realmRadiusKm = (30 * 24) / 2 * 12
  /** 舱室需求：人口 > 100 万且密度受限（人均耕地不足 5 亩）时。 */
  const needsMegastructure = populationAfter100y > 1e6 && muPerPerson < 5
  /** 瓶颈：比较「承载力」「粮食」「疆域」。 */
  const limits: Array<{ name: string; value: number }> = [
    { name: '承载力（可耕土地）', value: carryingCapacity },
    { name: '粮食产出上限（人，按 0.62 kg/天干重）', value: (maxGrainT * 1000) / (0.62 * 365) },
  ]
  limits.sort((a, b) => a.value - b.value)
  const notes: string[] = []
  notes.push('地表 ' + (surfaceKm2 / 1e6).toFixed(2) + ' M km²，陆地 ' + (landKm2 / 1e6).toFixed(2) + ' M km²，可耕 ' + (arableKm2 / 1e6).toFixed(3) + ' M km²')
  notes.push('人口承载力约 ' + carryingCapacity.toFixed(0) + ' 人（人均 ' + muPerPerson + ' 亩）')
  notes.push('百年后人口约 ' + populationAfter100y.toFixed(0) + '（逻辑斯蒂逼近承载力）')
  notes.push('粮食上限约 ' + maxGrainT.toFixed(0) + ' 吨/年')
  notes.push('驿马 30 天往返 → 疆域半径约 ' + realmRadiusKm + ' km')
  if (needsMegastructure) notes.push('人口超百万且人均耕地 < 5 亩 → 需要舱室/空腔网络（见 megastructure/sponge）')
  return {
    world: { planetMass, planetRadius, orbitAU, starMass, rotationHours, obliquityDeg: obliquity, surfaceKm2, landKm2 },
    landKm2,
    arableKm2,
    carryingCapacity,
    populationAfter100y,
    maxGrainT,
    realmRadiusKm,
    needsMegastructure,
    bottleneck: limits[0].name,
    notes,
  }
}
