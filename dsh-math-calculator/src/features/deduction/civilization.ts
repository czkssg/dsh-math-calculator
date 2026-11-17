/**
 * 宏观文明推演：物理规则如何锁死或放开文明极限。
 *
 * ## 四个小节
 *
 * ```
 *   4.1 能量与热力学  可用能密度、卡诺极限、散热天花板、卡尔达肖夫指数
 *   4.2 材料与结构    建筑高度、太空电梯材料缺口
 *   4.3 空间与交通    第一宇宙速度、逃逸速度、化学火箭 Δv、星际航行耗时
 *   4.4 技术树        被物理锁死/放开的分支、生态承载力
 * ```
 *
 * 不说「你这个世界不行」，只说「在这个物理下，这些东西的极限分别是多少」。
 * 每条极限都带依据公式与敏感参数，方便作者判断该改哪一项。
 *
 * ## 复用而非重写
 *
 * 材料/结构极限直接取 feasibility 的约束；生态承载力用**地球实测 NPP 标定**的
 * 能量流模型（`ecosystem.ts`，标【标度】——真实生态还受营养盐、水循环、纬度分布影响）。
 *
 * @module dsh-math-calculator/features/deduction/civilization
 */

import { CONSTRAINTS, deriveConstraintContext, type ConstraintContext } from './feasibility.js'
import { BASE_PHYSICS } from './constants.js'
import { computeEcosystem } from './ecosystem.js'

/** 一条文明极限。 */
export interface CivilLimit {
  category: 'energy' | 'material' | 'transport' | 'society'
  name: string
  value: number
  unit: string
  basis: string
  sensitiveTo: string[]
  breakthrough?: string
}

/** 技术分支状态。 */
export interface TechBranch {
  branch: string
  status: 'open' | 'locked' | 'conditional'
  reason: string
  requirement?: string
}

/** 文明推演结果。 */
export interface CivilizationResult {
  limits: CivilLimit[]
  tech: TechBranch[]
  summary: { locked: number; open: number; conditional: number }
}

/** 从世界参数取数值。 */
function num(world: Record<string, unknown>, key: string, fallback: number): number {
  const value = world[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 4.1 能量与热力学极限。
 *
 * @param ctx - 约束环境
 * @param world - 世界参数
 * @returns 能量极限
 */
export function energyLimits(ctx: ConstraintContext, world: Record<string, unknown>): CivilLimit[] {
  const out: CivilLimit[] = []
  const luminositySun = num(world, 'starLuminositySun', 1)
  const totalPower = luminositySun * BASE_PHYSICS.Lsun
  const orbitAU = num(world, 'orbitAU', 1)
  const planetRadius = BASE_PHYSICS.Rearth * num(world, 'planetRadius', 1)
  const intercepted = (totalPower * Math.PI * planetRadius ** 2) / (4 * Math.PI * (orbitAU * BASE_PHYSICS.AU) ** 2)

  out.push({
    category: 'energy',
    name: '行星接收总功率',
    value: intercepted,
    unit: 'W',
    basis: '恒星光度 × 行星截面积 / 轨道球面积；这是文明的能量天花板（除非用核能）',
    sensitiveTo: ['恒星光度', '轨道距离', '行星半径'],
    breakthrough: '核裂变/聚变可绕过日照限制；戴森结构可提升到恒星光度量级',
  })

  const tHot = 373.15
  const tCold = 288.15
  out.push({
    category: 'energy',
    name: '卡诺效率上限',
    value: 1 - tCold / tHot,
    unit: '无量纲',
    basis: 'η = 1 − T_cold/T_hot；取沸水 373 K 与环境 288 K',
    sensitiveTo: ['工质温度', '环境温度'],
    breakthrough: '提高热源温度（更耐热的材料）或降低冷源温度',
  })

  out.push({
    category: 'energy',
    name: '辐射散热上限',
    value: BASE_PHYSICS.sigma * 300 ** 4,
    unit: 'W/m²',
    basis: '斯特藩-玻尔兹曼定律 σT⁴，取表面温度 300 K',
    sensitiveTo: ['表面温度'],
    breakthrough: '提高工作温度可指数级提升散热（但受材料耐热限制）',
  })

  /** 卡尔达肖夫指数必须用「文明实际消耗」，不是「行星截获总功率」。 */
  const population = num(world, 'population', 8e9)
  const powerPerCapita = num(world, 'powerPerCapita', 2000)
  const consumed = population * powerPerCapita
  out.push({
    category: 'energy',
    name: '卡尔达肖夫指数',
    value: (Math.log10(Math.max(consumed, 1)) - 6) / 10,
    unit: '无量纲',
    basis:
      'K = (log10(P_消耗) − 6) / 10；按人口 ' + (population / 1e9).toFixed(1) + ' 亿 × ' +
      (powerPerCapita / 1000).toFixed(1) + ' kW/人 = ' + consumed.toExponential(2) + ' W。地球当前约 0.73',
    sensitiveTo: ['人口', '人均能耗'],
    breakthrough: '从 0.73 到 I 型需提升约 3 个数量级的能源规模（行星级采集）',
  })

  out.push({
    category: 'energy',
    name: '行星日照总量',
    value: intercepted,
    unit: 'W',
    basis: '恒星光度 × 行星截面积 / 轨道球面积；这是「若全部收集」的理论上限',
    sensitiveTo: ['恒星光度', '轨道距离', '行星半径'],
    breakthrough: '达到 I 型文明需要能收集到这个量级的相当一部分',
  })

  return out
}

/**
 * 4.2 材料与结构极限（复用 feasibility）。
 *
 * @param ctx - 约束环境
 * @returns 材料极限
 */
export function materialLimits(ctx: ConstraintContext): CivilLimit[] {
  const pick = (id: string): number => CONSTRAINTS.find((constraint) => constraint.id === id)?.limit(ctx) ?? 0
  const building = pick('buildingHeight')
  const towerRatio = pick('towerAspectRatio')
  const specificStrength = ctx.materialStrength / (ctx.materialDensity * ctx.gravity)
  const spaceElevatorNeeded = 5e7
  const gap = spaceElevatorNeeded / Math.max(specificStrength, 1e-9)

  return [
    {
      category: 'material',
      name: '建筑高度上限',
      value: building,
      unit: 'm',
      basis: '抗压强度 / (材料密度 × 重力)；来自 feasibility 的 buildingHeight 约束',
      sensitiveTo: ['材料强度', '重力'],
      breakthrough: '更高强度材料、更低重力、或改用拱形/悬索结构降低压应力',
    },
    {
      category: 'material',
      name: '塔楼高宽比上限',
      value: towerRatio,
      unit: '无量纲',
      basis: '结构稳定性限制；来自 feasibility 的 towerAspectRatio 约束',
      sensitiveTo: ['材料强度', '风力'],
      breakthrough: '分段收窄、外部支撑、主动阻尼',
    },
    {
      category: 'material',
      name: '太空电梯材料缺口倍数',
      value: gap,
      unit: '倍',
      basis: '比强度等效高度 = 强度/(密度×g)，本世界约 ' + specificStrength.toFixed(0) + ' m；太空电梯需约 5e7 m',
      sensitiveTo: ['材料强度', '材料密度', '重力'],
      breakthrough: gap <= 1 ? '本世界的材料已足够建造太空电梯' : '需要强度再高 ' + gap.toFixed(1) + ' 倍的材料',
    },
  ]
}

/**
 * 4.3 空间与交通尺度。
 *
 * @param ctx - 约束环境
 * @param world - 世界参数
 * @returns 交通极限
 */
export function transportLimits(ctx: ConstraintContext, world: Record<string, unknown>): CivilLimit[] {
  const g = ctx.gravity
  const planetRadius = BASE_PHYSICS.Rearth * num(world, 'planetRadius', 1)
  const vOrbit = Math.sqrt(g * planetRadius)
  const vEscape = Math.sqrt(2 * g * planetRadius)
  const ve = 4500
  const massRatio = 20
  const dvMax = ve * Math.log(massRatio)

  const out: CivilLimit[] = [
    {
      category: 'transport',
      name: '第一宇宙速度',
      value: vOrbit,
      unit: 'm/s',
      basis: 'v = √(gR)；低于此速度无法进入轨道',
      sensitiveTo: ['重力', '行星半径'],
      breakthrough: '低重力小行星最容易进入太空',
    },
    {
      category: 'transport',
      name: '逃逸速度',
      value: vEscape,
      unit: 'm/s',
      basis: 'v = √(2gR)；离开行星的最小速度',
      sensitiveTo: ['重力', '行星半径'],
    },
    {
      category: 'transport',
      name: '化学火箭 Δv 上限',
      value: dvMax,
      unit: 'm/s',
      basis: '齐奥尔科夫斯基公式 Δv = v_e·ln(m0/m1)；取排气速度 4500 m/s、质量比 20',
      sensitiveTo: ['推进剂类型', '结构质量比'],
      breakthrough: dvMax >= vEscape ? '化学火箭足以离开本行星' : '化学火箭不够（需 ' + (vEscape / dvMax).toFixed(1) + ' 倍），必须用核热/聚变/太空电梯',
    },
    {
      category: 'transport',
      name: '星际航行耗时（0.1c）',
      value: 4.2 / 0.1,
      unit: '年',
      basis: '最近恒星系 4.2 光年 / 巡航速度 0.1c',
      sensitiveTo: ['推进技术上限'],
      breakthrough: '更高巡航速度可按比例缩短；但加速与减速的 Δv 是真正的瓶颈',
    },
  ]
  if (typeof ctx.airDensity === 'number' && ctx.airDensity > 0) {
    out.push({
      category: 'transport',
      name: '声速（大气飞行参考）',
      value: Math.sqrt(1.4 * 287 * 288),
      unit: 'm/s',
      basis: '√(γRT/M)；决定亚音速/超音速的分界与飞行器设计',
      sensitiveTo: ['大气成分', '温度'],
    })
  }
  return out
}

/**
 * 4.4 技术树：哪些分支被物理锁死/放开。
 *
 * @param ctx - 约束环境
 * @param limits - 前三个小节的极限
 * @returns 分支状态
 */
export function techTree(ctx: ConstraintContext, limits: CivilLimit[]): TechBranch[] {
  const byName = new Map(limits.map((item) => [item.name, item]))
  const out: TechBranch[] = []
  const escape = byName.get('逃逸速度')
  const dvMax = byName.get('化学火箭 Δv 上限')
  const elevator = byName.get('太空电梯材料缺口倍数')
  const building = byName.get('建筑高度上限')

  if (escape && dvMax) {
    const enough = dvMax.value >= escape.value
    out.push({
      branch: '化学火箭航天',
      status: enough ? 'open' : 'locked',
      reason: enough
        ? '化学火箭 Δv ' + (dvMax.value / 1000).toFixed(1) + ' km/s，足以达到逃逸速度 ' + (escape.value / 1000).toFixed(1) + ' km/s'
        : '化学火箭 Δv 只有逃逸速度的 ' + (dvMax.value / escape.value).toFixed(2) + ' 倍，做不到',
      ...(enough ? {} : { requirement: '需要核热推进、聚变、或太空电梯' }),
    })
  }
  if (elevator) {
    const feasible = elevator.value <= 1
    out.push({
      branch: '太空电梯',
      status: feasible ? 'open' : 'locked',
      reason: feasible ? '材料比强度已达标' : '材料比强度还差 ' + elevator.value.toFixed(1) + ' 倍',
      ...(feasible ? {} : { requirement: '需要更强的材料或更低的重力' }),
    })
  }
  if (building) {
    out.push({
      branch: '摩天建筑',
      status: building.value > 500 ? 'open' : 'locked',
      reason: '建筑高度上限 ' + building.value.toFixed(0) + ' 米',
      ...(building.value > 500 ? {} : { requirement: '需要更强材料或更低重力' }),
    })
  }
  const airDensity = ctx.airDensity
  out.push({
    branch: '大气飞行',
    status: airDensity > 0.1 ? 'open' : airDensity > 0.01 ? 'conditional' : 'locked',
    reason: '大气密度 ' + (airDensity ?? 0).toFixed(3) + ' kg/m³' + (airDensity > 0.5 ? '（足够产生升力）' : airDensity > 0.1 ? '（需高速起飞）' : '（难以产生升力）'),
    ...(airDensity > 0.1 ? {} : { requirement: '需要更高翼载或火箭助推' }),
  })
  out.push({
    branch: '燃烧/冶金',
    status: (ctx.airDensity ?? 0) > 0.05 ? 'open' : 'locked',
    reason: '燃烧需要足够氧气/氧化剂；当前大气密度 ' + (ctx.airDensity ?? 0).toFixed(3),
    ...((ctx.airDensity ?? 0) > 0.05 ? {} : { requirement: '需要化学氧化剂而非大气氧' }),
  })
  return out
}

/**
 * 生态承载力（地球实测 NPP 标定）。
 *
 * ## 为什么不再用「光合效率 × 折扣连乘」
 *
 * 旧版按「日照 × 1% 光合效率 × 10% 占用 × 10% 收获」估算：1% 是**叶片峰值**，
 * 全球实际光能→碳转化只有约 0.11%（地球 NPP 1.05e14 kg C/yr 反推），
 * 两者差近 10 倍；再用固定系数会把误差放大到百万倍（旧版给 1e15 人）。
 *
 * 现在按「行星吸收能量 / 地球吸收能量」比例缩放地球实测 NPP，量级天然正确。
 * 可调项：人类占用比例（默认 10%）、肉食比例（10% 法则）、人均热量。
 *
 * @param world - 世界参数
 * @returns 承载力（人）、判定与依据
 */
export function carryingCapacity(world: Record<string, unknown>): { value: number; verdict: string; basis: string } {
  const luminositySun = num(world, 'starLuminositySun', 1)
  const orbitAU = num(world, 'orbitAU', 1)
  const planetRadiusM = BASE_PHYSICS.Rearth * num(world, 'planetRadius', 1)
  const albedo = Math.min(0.95, Math.max(0, num(world, 'albedo', 0.306)))
  /** 行星截获并吸收的太阳能（W），再折成年能量。 */
  const intercepted = (luminositySun * BASE_PHYSICS.Lsun * Math.PI * planetRadiusM ** 2) /
    (4 * Math.PI * (orbitAU * BASE_PHYSICS.AU) ** 2)
  const insolationJ = intercepted * (1 - albedo) * 365.25 * 86400
  const appropriation = Math.min(0.8, Math.max(0.01, num(world, 'humanUsableNpp', 0.1)))
  const meatFraction = Math.min(1, Math.max(0, num(world, 'meatFraction', 0.2)))
  const caloriesPerDay = Math.min(4000, Math.max(1500, num(world, 'caloriesPerDay', 2000)))
  const state = computeEcosystem(insolationJ, {
    appropriation,
    meatFraction,
    perCapitaEnergy: caloriesPerDay * 4184 * 365,
  })
  const value = state.carryingCapacity
  const verdict = value > 2e10 ? 'ample' : value > 2e9 ? 'tight' : 'scarce'
  const basis = '按地球实测 NPP 标定（光能→碳 0.11% 反推，非逐项折扣）× 人类占用 ' +
    Math.round(appropriation * 100) + '% × 收获 10% × 肉食 ' + Math.round(meatFraction * 100) +
    '%（10% 法则）× 现实折扣 58% / 人均 ' + caloriesPerDay + ' kcal/日（【标度】）'
  return { value, verdict, basis }
}

/**
 * 跑完整文明推演。
 *
 * @param world - 世界参数
 * @returns 极限、技术树与统计
 */
export function runCivilization(world: Record<string, unknown>): CivilizationResult {
  const ctx = deriveConstraintContext(world)
  const limits = [...energyLimits(ctx, world), ...materialLimits(ctx), ...transportLimits(ctx, world)]
  const tech = techTree(ctx, limits)
  const eco = carryingCapacity(world)
  limits.push({
    category: 'society',
    name: '生态承载力',
    value: eco.value,
    unit: '人',
    basis: eco.basis,
    sensitiveTo: ['恒星光度', '轨道距离', '肉食比例', '农业效率'],
    breakthrough: eco.verdict === 'ample' ? '承载力充足，人口瓶颈不在食物' : '承载力紧张，需提高农业效率或降低人口',
  })
  const locked = tech.filter((item) => item.status === 'locked').length
  const open = tech.filter((item) => item.status === 'open').length
  const conditional = tech.filter((item) => item.status === 'conditional').length
  return { limits, tech, summary: { locked, open, conditional } }
}
