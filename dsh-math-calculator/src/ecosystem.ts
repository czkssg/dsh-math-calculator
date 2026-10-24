/**
 * 生态热力学金字塔：从光到文明的能量流（重写版）。
 *
 * @module dsh-math-calculator/ecosystem
 * @description
 * ## 旧版错在哪（必须记住）
 *
 * 旧版用 `photosyntheticEfficiency = 0.015`（1.5%）——那是**叶片峰值效率**。
 * 全球实际值只有约 **0.11%**，因为要乘上一堆折扣：
 *
 * | 折扣项 | 系数 | 说明 |
 * |---|---|---|
 * | 光合有效辐射 PAR | 0.45 | 只有 400—700nm 能被利用 |
 * | 陆地+海洋覆盖 | 0.30 | 沙漠、冰盖、深海透光层以下不产 |
 * | 季节与昼夜 | 0.50 | 夜半、冬季近乎为零 |
 * | 云层与反射 | 0.70 | 云遮挡与叶面反射 |
 * | 光呼吸与呼吸消耗 | 0.50 | 植物自己也要呼吸 |
 * | 叶片饱和与光抑制 | 0.60 | 强光下效率反而下降 |
 *
 * 实测反推：地球 NPP = 1.05e14 kg C/yr，对应全球效率 **0.11%**。
 * 旧版因此算出 3400 亿人口，实况 80 亿——**高了 42 倍**。
 *
 * ## 正确做法
 *
 * 用「地球实测 NPP」作标定锚点，按行星接收的能量**按比例缩放**。
 * 不需要猜一堆折扣系数，量级天然正确。
 */

/** 生态常量（以地球实测值标定）。 */
export const ECO_CONSTANTS = {
  /** 地球实测净初级生产量（kg C / yr）。约 105 Pg C/yr。 */
  earthNPP: 1.05e14,
  /** 地球年吸收的太阳能量（J/yr），由 L☉、轨道、反照率算出。 */
  earthAbsorbedJ: 3.8e24,
  /** 干有机物含碳率（kg C / kg 干重）。 */
  carbonFraction: 0.45,
  /** 干物质热值（J/kg）。 */
  biomassEnergyDensity: 1.8e7,
  /** 人类实际占用 NPP 的比例（全球约 10%，陆地约 25%）。 */
  appropriation: 0.1,
  /** 收获→可食的转换率（现实约 10%，含加工与饲料损失）。 */
  harvestEfficiency: 0.1,
  /** 每级食物链传递效率（10% 定律）。 */
  trophicEfficiency: 0.1,
  /** 人均年食物能量（2000 kcal/日）。 */
  perCapitaEnergyJ: 2000 * 4184 * 365,
  /** 地球实际人口（标定用）。 */
  earthPopulation: 8e9,
  /**
   * 现实折扣：从「理论可食能量」到「实际能养活的人」。
   *
   * 包含浪费（约 1/3）、非食物用途（生物燃料、饲料）、分配不均、储存损耗。
   * 由地球实况反推：理论 1.38e10 人 vs 实际 8e9 人 → 约 0.58。
   */
  realWorldDiscount: 0.58,
}

/** 生态系统状态。 */
export interface EcosystemState {
  /** 全球净初级生产量（kg C / yr）。 */
  netPrimaryProduction: number
  /** 人类可占用的能量（J / yr）。 */
  availableEnergy: number
  /** 理论可食能量（J / yr）。 */
  foodEnergy: number
  /** 肉食比例。 */
  meatFraction: number
  /** 理论承载力（人，未扣现实折扣）。 */
  theoreticalCapacity: number
  /** 现实承载力（人，已扣浪费与分配损耗）。 */
  carryingCapacity: number
  /** 人均年能量需求（J）。 */
  perCapitaEnergy: number
}

/**
 * 计算生态承载力。
 *
 * 用「能量比例缩放」而不是「逐项折扣相乘」——后者每项都要猜系数，误差会累积。
 *
 * @param insolationJ - 行星年吸收的能量（J/yr）
 * @param options - 覆盖参数
 * @returns 生态系统状态
 */
export function computeEcosystem(
  insolationJ: number,
  options: { appropriation?: number; meatFraction?: number; perCapitaEnergy?: number; discount?: number } = {},
): EcosystemState {
  const appropriation = options.appropriation ?? ECO_CONSTANTS.appropriation
  const meatFraction = Math.max(0, Math.min(1, options.meatFraction ?? 0.2))
  const perCapita = options.perCapitaEnergy ?? ECO_CONSTANTS.perCapitaEnergyJ
  const discount = options.discount ?? ECO_CONSTANTS.realWorldDiscount

  // 关键：按「地球接收能量」的比例缩放地球实测 NPP。
  const npp = ECO_CONSTANTS.earthNPP * (insolationJ / ECO_CONSTANTS.earthAbsorbedJ)

  // NPP（碳质量）→ 化学能
  const nppEnergyJ = (npp / ECO_CONSTANTS.carbonFraction) * ECO_CONSTANTS.biomassEnergyDensity
  const availableEnergy = nppEnergyJ * appropriation
  const harvestable = availableEnergy * ECO_CONSTANTS.harvestEfficiency
  const plantFood = harvestable * (1 - meatFraction)
  const meatFood = harvestable * meatFraction * ECO_CONSTANTS.trophicEfficiency
  const foodEnergy = plantFood + meatFood

  const theoreticalCapacity = foodEnergy / Math.max(perCapita, 1)
  const carryingCapacity = theoreticalCapacity * discount

  return {
    netPrimaryProduction: npp,
    availableEnergy: availableEnergy,
    foodEnergy: foodEnergy,
    meatFraction: meatFraction,
    theoreticalCapacity: theoreticalCapacity,
    carryingCapacity: carryingCapacity,
    perCapitaEnergy: perCapita,
  }
}

/**
 * 从 world 的输出算出生态承载力。
 *
 * @param world - world 的输出值
 * @param options - 覆盖参数
 * @returns 生态系统状态 + 判定
 */
export function ecosystemFromWorld(
  world: any,
  options: { appropriation?: number; meatFraction?: number; perCapitaEnergy?: number; discount?: number } = {},
): EcosystemState & { verdict: 'ample' | 'tight' | 'overdrawn'; note: string } {
  const stellar = world?.stellar || {}
  const luminositySun = typeof stellar.luminositySun === 'number' ? stellar.luminositySun : 1
  // world 输出的字段名是 semiMajorAxisAU
  const orbitAU = typeof world?.orbit?.semiMajorAxisAU === 'number'
    ? world.orbit.semiMajorAxisAU
    : 1
  const planetRadius = world?.planet?.radiusM ?? 6.371e6
  const albedo = world?.planet?.albedo ?? 0.306

  const Lsun = 3.828e26
  const intercepted = luminositySun * Lsun * Math.PI * planetRadius ** 2 /
    (4 * Math.PI * (orbitAU * 1.496e11) ** 2)
  const absorbed = intercepted * (1 - albedo)
  const insolationJ = absorbed * 365.25 * 86400

  const state = computeEcosystem(insolationJ, options)

  // 与地球实际人口对比
  const ratio = state.carryingCapacity / ECO_CONSTANTS.earthPopulation

  let verdict: 'ample' | 'tight' | 'overdrawn' = 'ample'
  let note = ''
  if (ratio >= 0.8) {
    verdict = 'ample'
    note = '承载力约 ' + (state.carryingCapacity / 1e8).toFixed(0) + ' 亿人，与地球同量级'
  } else if (ratio >= 0.1) {
    verdict = 'tight'
    note = '承载力约 ' + (state.carryingCapacity / 1e8).toFixed(1) + ' 亿人，只有地球的 ' +
      (ratio * 100).toFixed(0) + '%，人口会受严格限制'
  } else {
    verdict = 'overdrawn'
    note = '承载力仅 ' + (state.carryingCapacity / 1e8).toFixed(2) + ' 亿人（地球的 ' +
      (ratio * 100).toFixed(1) + '%），难以支撑大人口'
  }

  return { ...state, verdict: verdict, note: note }
}

/**
 * 文明需求 vs 生态供给：判定是否过载。
 *
 * 措辞延续用户定位——说清后果，不替用户否决设定。
 *
 * @param capacity - 生态承载力（人）
 * @param demand - 文明实际人口
 * @returns 过载判定
 */
export function judgeOverload(
  capacity: number,
  demand: number,
): { overloaded: boolean; ratio: number; verdict: string; note: string; options: string[] } {
  const ratio = demand / Math.max(capacity, 1)
  const options: string[] = []

  if (ratio <= 0.8) {
    return {
      overloaded: false,
      ratio: ratio,
      verdict: '可持续',
      note: '人口 ' + (demand / 1e8).toFixed(1) + ' 亿，生态承载 ' + (capacity / 1e8).toFixed(1) +
        ' 亿，占用 ' + (ratio * 100).toFixed(0) + '%',
      options: [],
    }
  }

  if (ratio <= 1.2) {
    options.push('接近上限：任何灾害都会造成饥荒，社会会为食物而紧张——这是很好的故事张力')
    options.push('提高农业效率（灌溉、育种）可把有效承载力拉高 20—50%')
  } else {
    options.push('超出 ' + ratio.toFixed(1) + ' 倍：必须靠外部输入（进口、合成食物、或掠夺其它区域）')
    options.push('或者这个文明本来就建立在「生态已经崩溃」之后——那也是一种设定')
    options.push('降低人口、缩小肉食比例、提高光合效率（如更亮的恒星）都能缓解')
  }

  return {
    overloaded: ratio > 1.2,
    ratio: ratio,
    verdict: ratio > 1.2 ? '过载' : '临界',
    note: '人口 ' + (demand / 1e8).toFixed(1) + ' 亿，生态承载 ' + (capacity / 1e8).toFixed(1) +
      ' 亿，超出 ' + ((ratio - 1) * 100).toFixed(0) + '%',
    options: options,
  }
}

/**
 * 食物链级数与各级可用能量。
 *
 * @param levels - 营养级数
 * @returns 各级剩余能量比例
 */
export function trophicLevels(levels = 3): Array<{ level: number; name: string; fraction: number }> {
  const names = ['生产者', '初级消费者', '次级消费者', '三级消费者', '顶级掠食者']
  const out: Array<{ level: number; name: string; fraction: number }> = []
  for (let index = 0; index < Math.min(levels, names.length); index += 1) {
    out.push({
      level: index + 1,
      name: names[index],
      fraction: Math.pow(ECO_CONSTANTS.trophicEfficiency, index),
    })
  }
  return out
}

/**
 * 渲染生态系统报告。
 *
 * @param state - 生态系统状态（含判定）
 * @returns 可读文本
 */
export function renderEcosystem(state: EcosystemState & { verdict?: string; note?: string }): string {
  const out: string[] = []
  const num = function (v: number): string {
    if (!Number.isFinite(v)) return '—'
    const abs = Math.abs(v)
    if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return v.toExponential(2)
    return Number(v.toPrecision(4)).toString()
  }
  const yi = function (v: number): string {
    return (v / 1e8).toFixed(v >= 1e10 ? 0 : 1) + ' 亿'
  }
  out.push('═══ 生态热力学金字塔 ═══')
  out.push('')
  out.push('【能量流】每级 10 倍损失')
  out.push('  净初级生产量      ' + num(state.netPrimaryProduction) + ' kg C/yr')
  out.push('  人类可占用能量    ' + num(state.availableEnergy) + ' J/yr')
  out.push('  可食能量          ' + num(state.foodEnergy) + ' J/yr')
  out.push('  肉食比例          ' + (state.meatFraction * 100).toFixed(0) + '%')
  out.push('')
  out.push('【承载力】')
  out.push('  理论值            ' + yi(state.theoreticalCapacity))
  out.push('  现实值            ' + yi(state.carryingCapacity) + '（扣除浪费与分配损耗）')
  out.push('')
  out.push('【营养级】每级只剩上一级的 10%')
  for (const level of trophicLevels(4)) {
    out.push('  ' + String(level.level) + '. ' + level.name.padEnd(12) + (level.fraction * 100).toFixed(2) + '%')
  }
  if (state.verdict) {
    out.push('')
    out.push('【判定】' + state.verdict + '：' + state.note)
  }
  return out.join(String.fromCharCode(10))
}
