/**
 * 宏观文明推演：物理规则如何锁死或放开文明极限。
 *
 * @module dsh-math-calculator/civilization
 * @description
 * 目录4 的四小节：
 *   4.1 能量与热力学极限 —— 可用能密度、卡诺极限、散热天花板
 *   4.2 材料与结构极限 —— 建筑高度、太空电梯可行性
 *   4.3 空间与交通尺度 —— 载具速度、Δv、星际航行耗时
 *   4.4 技术树与社会拓扑 —— 被锁死/放开的科技分支、极限人口
 *
 * ## 设计原则（延续用户的定位）
 *
 * 不说「你这个世界不行」，只说「在这个物理下，这些东西的极限分别是多少」。
 * 每条极限都带**依据公式**与**关键参数**，方便作者判断该改哪一项。
 *
 * 全部复用已有模块：`feasibility` 的约束、`formulas` 的公式、
 * `constants` 的常数——不重复实现物理。
 */

import { CONSTRAINTS, deriveConstraintContext } from './feasibility.js'
import { ecosystemFromWorld } from './ecosystem.js'

/** 一条文明极限。 */
export interface CivilLimit {
  /** 分类（能量/材料/交通/社会）。 */
  category: 'energy' | 'material' | 'transport' | 'society'
  /** 极限名。 */
  name: string
  /** 数值。 */
  value: number
  /** 单位。 */
  unit: string
  /** 依据（公式或推理）。 */
  basis: string
  /** 对哪些参数敏感（改了能突破极限）。 */
  sensitiveTo: string[]
  /** 若有限制，说明突破方向。 */
  breakthrough?: string
}

/**
 * 4.1 能量与热力学极限。
 *
 * @param ctx - 环境上下文（重力、大气、材料等）
 * @param stellar - 恒星参数（光度决定能量上限）
 * @returns 能量相关极限
 */
export function energyLimits(ctx: any, stellar: any = {}): CivilLimit[] {
  const out: CivilLimit[] = []
  const luminositySun = typeof stellar.luminositySun === 'number' ? stellar.luminositySun : 1
  const Lsun = 3.828e26
  const totalPower = luminositySun * Lsun

  // 行星接收到的总功率（决定文明能量天花板）
  const orbitAU = typeof stellar.orbitAU === 'number' ? stellar.orbitAU : 1
  const intercepted = totalPower * Math.PI * (ctx.planetRadius || 6.371e6) ** 2 / (4 * Math.PI * (orbitAU * 1.496e11) ** 2)
  out.push({
    category: 'energy',
    name: '行星接收总功率',
    value: intercepted,
    unit: 'W',
    basis: '恒星光度 × 行星截面积 / 轨道球面积；这是文明的能量天花板（除非用核能）',
    sensitiveTo: ['恒星光度', '轨道距离', '行星半径'],
    breakthrough: '核裂变/聚变可绕过日照限制；戴森结构可提升到恒星光度量级',
  })

  // 卡诺极限：热机效率上限
  const tHot = 373.15  // 沸水，最常见的工质温度
  const tCold = 288.15  // 环境温度
  const carnot = 1 - tCold / tHot
  out.push({
    category: 'energy',
    name: '卡诺效率上限',
    value: carnot,
    unit: '无量纲',
    basis: 'η = 1 − T_cold/T_hot；取沸水 373 K 与环境 288 K',
    sensitiveTo: ['工质温度', '环境温度'],
    breakthrough: '提高热源温度（更耐热的材料）或降低冷源温度',
  })

  // 散热天花板：单位面积辐射散热
  const sigma = 5.670374419e-8
  const tSurface = 300
  const coolingPerM2 = sigma * tSurface ** 4
  out.push({
    category: 'energy',
    name: '辐射散热上限',
    value: coolingPerM2,
    unit: 'W/m²',
    basis: '斯特藩-玻尔兹曼定律 σT⁴，取表面温度 300 K',
    sensitiveTo: ['表面温度'],
    breakthrough: '提高工作温度可指数级提升散热（但受材料耐热限制）',
  })

  // 文明等级（卡尔达肖夫）
  // ⚠️ 必须用「文明实际消耗的功率」，不是「行星截获的总功率」。
  // 用后者会把地球算成 1.12（应为 0.73）——那等于说地球已是 I 型文明，明显错。
  // 这里按「工业文明人均 2 kW × 人口」估算实际消耗。
  const population = typeof stellar.population === 'number' ? stellar.population : 8e9
  const powerPerCapita = typeof stellar.powerPerCapita === 'number' ? stellar.powerPerCapita : 2000
  const consumed = population * powerPerCapita
  const kardashev = (Math.log10(Math.max(consumed, 1)) - 6) / 10
  out.push({
    category: 'energy',
    name: '卡尔达肖夫指数',
    value: kardashev,
    unit: '无量纲',
    basis: 'K = (log10(P_消耗) − 6) / 10；按人口 ' + (population / 1e9).toFixed(1) + ' 亿 × ' +
      (powerPerCapita / 1000).toFixed(1) + ' kW/人 = ' + consumed.toExponential(2) + ' W。' +
      '地球当前约 0.73（对应约 2e13 W）',
    sensitiveTo: ['人口', '人均能耗'],
    breakthrough: '从 0.73 到 I 型需提升约 3 个数量级的能源规模（行星级采集）',
  })

  // 行星可采集上限（对照用）
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
 * 4.2 材料与结构极限。
 *
 * 复用 feasibility 的 buildingHeight / towerAspectRatio 约束。
 *
 * @param ctx - 环境上下文
 * @returns 材料相关极限
 */
export function materialLimits(ctx: any): CivilLimit[] {
  const out: CivilLimit[] = []
  const pick = function (id: string): number {
    const constraint = CONSTRAINTS.find(function (item) { return item.id === id })
    return constraint ? constraint.limit(ctx) : 0
  }

  const building = pick('buildingHeight')
  out.push({
    category: 'material',
    name: '建筑高度上限',
    value: building,
    unit: 'm',
    basis: '抗压强度 / (材料密度 × 重力)；来自 feasibility 的 buildingHeight 约束',
    sensitiveTo: ['材料强度', '重力'],
    breakthrough: '更高强度材料、更低重力、或改用拱形/悬索结构降低压应力',
  })

  const towerRatio = pick('towerAspectRatio')
  out.push({
    category: 'material',
    name: '塔楼高宽比上限',
    value: towerRatio,
    unit: '无量纲',
    basis: '结构稳定性限制；来自 feasibility 的 towerAspectRatio 约束',
    sensitiveTo: ['材料强度', '风力'],
    breakthrough: '分段收窄、外部支撑、主动阻尼',
  })

  // 太空电梯可行性：需要比强度 > 某阈值（现实需要约 50 GPa/(g/cm³)）
  const specificStrength = ctx.materialStrength / (ctx.materialDensity * ctx.gravity)
  const spaceElevatorNeeded = 5e7  // 经验阈值（m），现实中碳纳米管勉强够
  out.push({
    category: 'material',
    name: '太空电梯材料缺口倍数',
    value: spaceElevatorNeeded / Math.max(specificStrength, 1e-9),
    unit: '倍',
    basis: '比的「比强度等效高度」= 强度/(密度×g)，本世界约 ' + specificStrength.toFixed(0) +
      ' m；太空电梯需约 5e7 m。倍数 = 5e7 / 本世界值',
    sensitiveTo: ['材料强度', '材料密度', '重力'],
    breakthrough: spaceElevatorNeeded / Math.max(specificStrength, 1e-9) <= 1
      ? '本世界的材料已足够建造太空电梯'
      : '需要强度再高 ' + (spaceElevatorNeeded / Math.max(specificStrength, 1e-9)).toFixed(1) + ' 倍的材料',
  })

  return out
}

/**
 * 4.3 空间与交通尺度。
 *
 * @param ctx - 环境上下文
 * @param stellar - 恒星参数
 * @returns 交通相关极限
 */
export function transportLimits(ctx: any, stellar: any = {}): CivilLimit[] {
  const out: CivilLimit[] = []
  const g = ctx.gravity
  const planetRadius = typeof ctx.planetRadius === 'number' ? ctx.planetRadius : 6.371e6

  // 第一宇宙速度（环绕速度）
  const vOrbit = Math.sqrt(g * planetRadius)
  out.push({
    category: 'transport',
    name: '第一宇宙速度',
    value: vOrbit,
    unit: 'm/s',
    basis: 'v = √(gR)；低于此速度无法进入轨道',
    sensitiveTo: ['重力', '行星半径'],
    breakthrough: '低重力小行星最容易进入太空',
  })

  // 逃逸速度
  const vEscape = Math.sqrt(2 * g * planetRadius)
  out.push({
    category: 'transport',
    name: '逃逸速度',
    value: vEscape,
    unit: 'm/s',
    basis: 'v = √(2gR)；离开行星的最小速度',
    sensitiveTo: ['重力', '行星半径'],
  })

  // 化学火箭 Δv 上限（齐奥尔科夫斯基，取现实最优值）
  const ve = 4500  // 液氢液氧的排气速度 m/s
  const massRatio = 20  // 现实可达到的质量比上限
  const dvMax = ve * Math.log(massRatio)
  out.push({
    category: 'transport',
    name: '化学火箭 Δv 上限',
    value: dvMax,
    unit: 'm/s',
    basis: '齐奥尔科夫斯基公式 Δv = v_e·ln(m0/m1)；取排气速度 4500 m/s、质量比 20',
    sensitiveTo: ['推进剂类型', '结构质量比'],
    breakthrough: dvMax >= vEscape
      ? '化学火箭足以离开本行星'
      : '化学火箭不够（需 ' + (vEscape / dvMax).toFixed(1) + ' 倍），必须用核热/聚变/太空电梯',
  })

  // 星际航行耗时（到最近恒星系，按 0.1c 巡航）
  const distanceLy = 4.2  // 比邻星
  const cruiseC = 0.1
  const years = distanceLy / cruiseC
  out.push({
    category: 'transport',
    name: '星际航行耗时（0.1c）',
    value: years,
    unit: '年',
    basis: '最近恒星系 4.2 光年 / 巡航速度 0.1c',
    sensitiveTo: ['推进技术上限'],
    breakthrough: '更高巡航速度可按比例缩短；但加速与减速的 Δv 是真正的瓶颈',
  })

  // 大气飞行速度上限（若大气够厚）
  if (typeof ctx.airDensity === 'number' && ctx.airDensity > 0) {
    const vSound = Math.sqrt(1.4 * 287 * 288)  // 空气声速
    out.push({
      category: 'transport',
      name: '声速（大气飞行参考）',
      value: vSound,
      unit: 'm/s',
      basis: '√(γRT/M)；决定亚音速/超音速的分界与飞行器设计',
      sensitiveTo: ['大气成分', '温度'],
    })
  }

  return out
}

/**
 * 4.4 技术树与社会拓扑。
 *
 * 判断哪些科技分支被物理**锁死**、哪些被**放开**。
 *
 * 这就是方案里「红色标出破产的科技树，绿色标出新生现象」的量化实现。
 *
 * @param ctx - 环境上下文
 * @param limits - 前三个小节的极限结果
 * @returns 技术分支状态
 */
export function techTree(ctx: any, limits: CivilLimit[]): Array<{
  branch: string
  status: 'open' | 'locked' | 'conditional'
  reason: string
  requirement?: string
}> {
  const byName = new Map(limits.map(function (item) { return [item.name, item] }))
  const out: Array<{ branch: string; status: 'open' | 'locked' | 'conditional'; reason: string; requirement?: string }> = []

  const escape = byName.get('逃逸速度')
  const dvMax = byName.get('化学火箭 Δv 上限')
  // ⚠️ 这里的名字必须与 energyLimits/materialLimits 里登记的完全一致。
  // 曾经改过 limit 的 name 却忘了改这里，导致「太空电梯」分支从技术树里消失。
  const elevator = byName.get('太空电梯材料缺口倍数')
  const building = byName.get('建筑高度上限')

  // 航天
  if (escape && dvMax) {
    const enough = dvMax.value >= escape.value
    out.push({
      branch: '化学火箭航天',
      status: enough ? 'open' : 'locked',
      reason: enough
        ? '化学火箭 Δv ' + (dvMax.value / 1000).toFixed(1) + ' km/s，足以达到逃逸速度 ' + (escape.value / 1000).toFixed(1) + ' km/s'
        : '化学火箭 Δv 只有逃逸速度的 ' + (dvMax.value / escape.value).toFixed(2) + ' 倍，做不到',
      requirement: enough ? undefined : '需要核热推进、聚变、或太空电梯',
    })
  }

  // 太空电梯
  if (elevator) {
    const feasible = elevator.value <= 1
    out.push({
      branch: '太空电梯',
      status: feasible ? 'open' : 'locked',
      reason: feasible
        ? '材料比强度已达标'
        : '材料比强度还差 ' + elevator.value.toFixed(1) + ' 倍',
      requirement: feasible ? undefined : '需要更强的材料或更低的重力',
    })
  }

  // 高层建筑
  if (building) {
    out.push({
      branch: '摩天建筑',
      status: building.value > 500 ? 'open' : 'locked',
      reason: '建筑高度上限 ' + building.value.toFixed(0) + ' 米',
      requirement: building.value > 500 ? undefined : '需要更强材料或更低重力',
    })
  }

  // 飞行
  const airDensity = ctx.airDensity
  out.push({
    branch: '大气飞行',
    status: airDensity > 0.1 ? 'open' : airDensity > 0.01 ? 'conditional' : 'locked',
    reason: '大气密度 ' + (airDensity ?? 0).toFixed(3) + ' kg/m³' +
      (airDensity > 0.5 ? '（足够产生升力）' : airDensity > 0.1 ? '（需高速起飞）' : '（难以产生升力）'),
    requirement: airDensity > 0.1 ? undefined : '需要更高翼载或火箭助推',
  })

  // 火
  out.push({
    branch: '燃烧/冶金',
    status: (ctx.airDensity ?? 0) > 0.05 ? 'open' : 'locked',
    reason: '燃烧需要足够氧气/氧化剂；当前大气密度 ' + (ctx.airDensity ?? 0).toFixed(3),
    requirement: (ctx.airDensity ?? 0) > 0.05 ? undefined : '需要化学氧化剂而非大气氧',
  })

  return out
}

/**
 * 跑完整的文明推演（四个小节串起来）。
 *
 * @param world - 世界参数
 * @returns 全部极限与技术树
 */
export function runCivilization(world: Record<string, unknown>): {
  limits: CivilLimit[]
  tech: Array<{ branch: string; status: string; reason: string; requirement?: string }>
  summary: { locked: number; open: number; conditional: number }
} {
  const ctx = deriveConstraintContext(world)
  const energy = energyLimits(ctx, world)
  const material = materialLimits(ctx)
  const transport = transportLimits(ctx, world)
  const limits = energy.concat(material, transport)
  const tech = techTree(ctx, limits)
  // 生态承载力：把生命基质层与文明层用能量流串起来
  const eco = ecosystemFromWorld(world)
  limits.push({
    category: 'society',
    name: '生态承载力',
    value: eco.carryingCapacity,
    unit: '人',
    basis: '初级生产量 × 人类可占用 10% × 收获效率 10%，肉食部分再打 10% 折扣',
    sensitiveTo: ['恒星光度', '轨道距离', '肉食比例', '农业效率'],
    breakthrough: eco.verdict === 'ample'
      ? '承载力充足，人口瓶颈不在食物'
      : '承载力紧张，需提高农业效率或降低人口',
  })
  const locked = tech.filter(function (item) { return item.status === 'locked' }).length
  const open = tech.filter(function (item) { return item.status === 'open' }).length
  const conditional = tech.filter(function (item) { return item.status === 'conditional' }).length
  return { limits: limits, tech: tech, summary: { locked: locked, open: open, conditional: conditional } }
}
