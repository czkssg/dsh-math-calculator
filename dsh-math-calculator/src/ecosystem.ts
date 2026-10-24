/**
 * 生态热力学金字塔：从光到文明的能量流。
 *
 * @module dsh-math-calculator/ecosystem
 * @description
 * 方案补丁10 + 目录3.2：计算光化学效率、食物链热力学损耗，输出行星生态承载力。
 * 若文明需求超过底座 → 报「生态崩溃，文明灭绝」。
 *
 * ## 能量是怎么一路损耗到文明的
 *
 * ```
 * 恒星辐射
 *   ↓ 光合作用（约 1—2% 转成生物量）
 * 初级生产量 NPP
 *   ↓ 人类可占用（约 10%）
 * 可用生物量
 *   ↓ 收获/加工（约 10% 转成可食）
 * 食物能量
 *   ↓ 每多一级肉食，再打 10% 折扣
 * 可供养人口
 * ```
 *
 * 每一级都是 10 倍损失——所以「吃素能养活更多人」不是道德说教，是热力学。
 *
 * ## 与文明层的衔接
 *
 * `civilization` 算出文明需要多少能量；这里算出生态能给多少。
 * 两者相除就是「这个文明的可持续性」。
 */

/** 生态系统参数。 */
export interface EcosystemState {
  /** 光合有效辐射（W/m²），由恒星辐射与大气决定。 */
  photosyntheticallyActive: number
  /** 全球初级生产量（kg C / yr）——注意是碳质量，不是食物质量。 */
  netPrimaryProduction: number
  /** 人类可占用的 NPP 比例（0—1）。 */
  humanAppropriation: number
  /** 肉食比例（0—1），每增加一级食物链打 10% 折扣。 */
  meatFraction: number
  /** 可承载人口（人）。 */
  carryingCapacity: number
  /** 人均年能量需求（J）。 */
  perCapitaEnergy: number
}

/** 常量（现实标定）。 */
export const ECO_CONSTANTS = {
  /** 人类可占用 NPP 比例（现实约 10—25%，取 10% 保守值）。 */
  appropriation: 0.1,
  /** 收获到可食的转换率（现实约 10%）。 */
  harvestEfficiency: 0.1,
  /** 每级食物链的传递效率（10% 定律）。 */
  trophicEfficiency: 0.1,
  /** 人均年食物能量（2000 kcal/日）。 */
  perCapitaEnergyJ: 2000 * 4184 * 365,
  /** 光合作用最大转换效率（C3 植物约 1—2%，取 1.5%）。 */
  photosyntheticEfficiency: 0.015,
  /** 全球年总初级生产量参考值（kg C/yr，地球约 1.05e14）。 */
  earthNPP: 1.05e14,
  /** 地球年接收太阳辐射（J/yr）。 */
  earthInsolationJ: 5.5e24,
  /** 干物质热值（J/kg），生物量的能量密度。 */
  biomassEnergyDensity: 1.8e7,
  /** 干有机物含碳率（kg C / kg 干重），约 45%。 */
  carbonFraction: 0.45,
}

/**
 * 计算生态承载力。
 *
 * @param insolationJ - 行星年接收的总辐射能（J/yr）
 * @param options - 覆盖参数
 * @returns 生态系统状态
 */
export function computeEcosystem(
  insolationJ: number,
  options: { appropriation?: number; meatFraction?: number; perCapitaEnergy?: number } = {},
): EcosystemState {
  const appropriation = options.appropriation ?? ECO_CONSTANTS.appropriation
  const meatFraction = Math.max(0, Math.min(1, options.meatFraction ?? 0.2))
  const perCapita = options.perCapitaEnergy ?? ECO_CONSTANTS.perCapitaEnergyJ

  // 初级生产量（kg C/yr）：
  //   ⚠️ 不能直接把「辐射能 × 光合效率」当质量。
  //   光合效率把辐射能转成**生物量化学能**（J），还要除以干物质热值才得到 kg。
  //   曾经漏了这一步，算出 5.7e22 kg C/yr——比地球实际值高 8 个数量级。
  const biomassEnergyJ = insolationJ * ECO_CONSTANTS.photosyntheticEfficiency
  const npp = biomassEnergyJ / ECO_CONSTANTS.biomassEnergyDensity
  // 人类可占用部分（这里还是碳质量 kg C）
  const availableCarbon = npp * appropriation
  // ⚠️ 关键：kg C 不是食物质量。干有机物约含 45% 碳，要先除以含碳率，
  // 再乘以热值得到能量。漏掉这一步会把结果算小 2 个数量级（曾算成 8504 人）。
  const availableMass = availableCarbon / ECO_CONSTANTS.carbonFraction
  const availableEnergy = availableMass * ECO_CONSTANTS.biomassEnergyDensity
  // 转成可食（收获效率）
  const foodBase = availableEnergy * ECO_CONSTANTS.harvestEfficiency
  // 肉食部分再打一级折扣
  const plantFood = foodBase * (1 - meatFraction)
  const meatFood = foodBase * meatFraction * ECO_CONSTANTS.trophicEfficiency
  const totalFood = plantFood + meatFood

  const carryingCapacity = totalFood / Math.max(perCapita, 1)

  // 光合有效辐射（PAR，约总辐射的 45%）
  const par = 0; // 由调用方传入更准确

  return {
    photosyntheticallyActive: par,
    netPrimaryProduction: npp,
    humanAppropriation: appropriation,
    meatFraction: meatFraction,
    carryingCapacity: carryingCapacity,
    perCapitaEnergy: perCapita,
  };
}

/**
 * 从 world 的输出算出生态承载力。
 *
 * 用恒星辐射、行星反照率、轨道距离推算年接收能量，
 * 再走一遍金字塔。
 *
 * @param world - world 的输出值
 * @param options - 覆盖参数
 * @returns 生态系统状态
 */
export function ecosystemFromWorld(
  world: any,
  options: { appropriation?: number; meatFraction?: number; perCapitaEnergy?: number } = {},
): EcosystemState & { verdict: 'ample' | 'tight' | 'overdrawn'; note: string } {
  const stellar = world?.stellar || {}
  const luminositySun = typeof stellar.luminositySun === 'number' ? stellar.luminositySun : 1
  const orbitAU = typeof world?.orbit?.semiMajorAxisAU === 'number'
    ? world.orbit.semiMajorAxisAU
    : (typeof stellar.orbitAU === 'number' ? stellar.orbitAU : 1)
  const planetRadius = world?.planet?.radiusM ?? 6.371e6
  const albedo = world?.planet?.albedo ?? 0.306

  // 年接收能量：恒星光度 × (行星截面积 / 轨道球面积) × (1 - 反照率)
  const Lsun = 3.828e26
  const totalPower = luminositySun * Lsun
  const intercepted = totalPower * Math.PI * planetRadius ** 2 / (4 * Math.PI * (orbitAU * 1.496e11) ** 2)
  const absorbed = intercepted * (1 - albedo)
  const insolationJ = absorbed * 365.25 * 86400

  const state = computeEcosystem(insolationJ, options)

  // 判定：与地球对比
  const earthCapacity = computeEcosystem(ECO_CONSTANTS.earthInsolationJ * (1 - 0.306), options).carryingCapacity
  const ratio = state.carryingCapacity / Math.max(earthCapacity, 1)

  let verdict: 'ample' | 'tight' | 'overdrawn' = 'ample'
  let note = ''
  if (ratio >= 0.8) {
    verdict = 'ample'
    note = '生态承载力与地球相当或更好（约 ' + (state.carryingCapacity / 1e8).toFixed(0) + ' 亿人）'
  } else if (ratio >= 0.1) {
    verdict = 'tight'
    note = '生态承载力只有地球的 ' + (ratio * 100).toFixed(0) + '%（约 ' + (state.carryingCapacity / 1e8).toFixed(1) + ' 亿人），人口会受严格限制'
  } else {
    verdict = 'overdrawn'
    note = '生态承载力仅地球的 ' + (ratio * 100).toFixed(1) + '%，难以支撑大人口'
  }

  return { ...state, verdict: verdict, note: note }
}

/**
 * 文明需求 vs 生态供给：判定是否过载。
 *
 * 这是方案里「若文明需求超过底座，报生态崩溃」的实现。
 * 但措辞延续用户定位——说清后果，不替用户否决设定。
 *
 * @param capacity - 生态承载力（人）
 * @param demand - 文明实际人口或需求
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
      note: '人口 ' + (demand / 1e8).toFixed(1) + ' 亿，生态承载 ' + (capacity / 1e8).toFixed(1) + ' 亿，占用的 ' + (ratio * 100).toFixed(0) + '%',
      options: [],
    }
  }

  if (ratio <= 1.2) {
    options.push('接近上限：任何灾害都会造成饥荒，社会会为食物而紧张——这是很好的故事张力')
    options.push('提高农业效率（灌溉、育种）可把有效承载力拉高 20—50%')
  } else {
    options.push('超出 ' + ratio.toFixed(1) + ' 倍：必须靠外部输入（进口、合成食物、或掠夺其它区域）')
    options.push('或者这个文明本来就建立在「生态已经崩溃」之后——那也是一种设定')
    options.push('降低人口、缩小肉食比例、提高光合效率（如更蓝的恒星）都能缓解')
  }

  return {
    overloaded: ratio > 1.2,
    ratio: ratio,
    verdict: ratio > 1.2 ? '过载' : '临界',
    note: '人口 ' + (demand / 1e8).toFixed(1) + ' 亿，生态承载 ' + (capacity / 1e8).toFixed(1) + ' 亿，超出 ' + ((ratio - 1) * 100).toFixed(0) + '%',
    options: options,
  }
}

/**
 * 食物链级数（决定能量传递损耗）。
 *
 * 每多一级，可用能量减为 10 分之一。
 *
 * @param producers - 生产者数量（如植物种类数）
 * @param levels - 营养级数（2=草→食草，3=草→食草→食肉）
 * @returns 各级可用能量比例
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
  out.push('═══ 生态热力学金字塔 ═══')
  out.push('')
  out.push('【能量流】每一级都是 10 倍损失')
  out.push('  初级生产量        ' + num(state.netPrimaryProduction) + ' kg C/yr')
  out.push('  人类可占用        ' + (state.humanAppropriation * 100).toFixed(0) + '%')
  out.push('  肉食比例          ' + (state.meatFraction * 100).toFixed(0) + '%')
  out.push('  → 可承载人口      ' + num(state.carryingCapacity) + ' 人（' + (state.carryingCapacity / 1e8).toFixed(1) + ' 亿）')
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
