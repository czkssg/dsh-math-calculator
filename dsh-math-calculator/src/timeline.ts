/**
 * 演化时间轴：把静态推演变成动态推演。
 *
 * @module dsh-math-calculator/timeline
 * @description
 * 方案补丁1 + 补丁11。核心是**快慢变量解耦**：
 *
 * | 类型 | 例子 | 处理方式 |
 * |---|---|---|
 * | **快变量** | 大气环流、地表温度、海洋环流 | 每步都按平衡态重算（代数求解） |
 * | **慢变量** | 恒星亮度、地质热流、大气逃逸 | 随时间单调演化（用物理规律外推） |
 *
 * 为什么这样分：快变量的响应时间以年计，慢变量以亿年计。
 * 把两者混在一起算，要么时间步长小到算不完，要么慢变量被平均掉。
 *
 * ## 关键物理依据（都有出处）
 *
 * 1. **恒星亮度随时增长**：主序星约每 10 亿年增亮 10%，
 *    46 亿年后太阳亮 46%（L ∝ (1 + 0.1·t/Gyr)）。
 * 2. **宜居带随亮度外移**：r ∝ √L，所以宜居带也往外挪。
 * 3. **地质热流衰减**：约 30 亿年衰减到 1/e（放射性元素耗尽）。
 * 4. **大气逃逸累积**：快变量平衡态下缓慢流失，亿年尺度显著。
 *
 * ## 历史临界点（补丁11）
 *
 * 某些时刻一旦跨过，后续路径就被锁定——例如：
 *   · 地球约 10 亿年后进入湿润温室失控（海洋蒸发，不可逆）；
 *   · 恒星离开主序（红巨星阶段，宜居带彻底消失）。
 *
 * 跨过临界点后，**再改参数也回不去**。这就是路径依赖。
 */

/** 时间轴上的一个采样点。 */
export interface TimelinePoint {
  /** 时间（十亿年）。 */
  tGyr: number
  /** 恒星亮度（相对当前）。 */
  luminosity: number
  /** 宜居带内边界（AU）。 */
  habitableInner: number
  /** 宜居带外边界（AU）。 */
  habitableOuter: number
  /** 地质热流（相对当前）。 */
  geologicalHeat: number
  /** 是否仍在宜居带内。 */
  habitable: boolean
  /** 是否有大气。 */
  hasAtmosphere: boolean
  /** 该时刻的状态说明。 */
  note: string
}

/** 一个历史临界点。 */
export interface CriticalPoint {
  /** 时间（十亿年）。 */
  tGyr: number
  /** 事件名。 */
  name: string
  /** 为什么不可逆。 */
  irreversible: string
  /** 跨过后的世界状态。 */
  after: string
}

/** 时间轴配置。 */
export interface TimelineConfig {
  /** 起始时间（十亿年，当前=0）。 */
  fromGyr?: number
  /** 结束时间（默认 10 Gyr）。 */
  toGyr?: number
  /** 采样点数（默认 11）。 */
  steps?: number
  /** 恒星质量（太阳质量）。 */
  starMassSun?: number
  /** 轨道距离（AU）。 */
  orbitAU?: number
  /** 行星质量（地球质量）。 */
  planetMass?: number
}

/**
 * 恒星亮度随时间的增长。
 *
 * 主序星的经验规律：约每 10 亿年增亮 10%。
 * 更精确的模型是 L ∝ M^4 且随核心氢消耗而增亮，这里用线性近似
 * （在 10 Gyr 量级内误差可接受）。
 *
 * @param tGyr - 时间（十亿年）
 * @returns 相对当前亮度
 */
export function luminosityAt(tGyr: number): number {
  // t=0 时 1.0；t=10 时约 2.0（太阳 100 亿年后亮度约翻倍）
  return 1 + 0.1 * tGyr
}

/**
 * 宜居带边界（AU），随亮度外移。
 *
 * r ∝ √L。
 *
 * @param luminosity - 相对亮度
 * @returns 内外边界
 */
export function habitableZone(luminosity: number): { inner: number; outer: number } {
  return {
    inner: 0.95 * Math.sqrt(luminosity),
    outer: 1.67 * Math.sqrt(luminosity),
  }
}

/**
 * 地质热流随时间的衰减。
 *
 * 放射性元素衰变，约 30 亿年衰减到 1/e。
 *
 * @param tGyr - 时间（十亿年）
 * @returns 相对当前热流
 */
export function geologicalHeatAt(tGyr: number): number {
  return Math.exp(-tGyr / 3.0)
}

/**
 * 找出这个世界的时间轴临界点。
 *
 * @param config - 时间轴配置
 * @returns 临界点列表（按时间排序）
 */
export function findCriticalPoints(config: TimelineConfig = {}): CriticalPoint[] {
  const starMass = config.starMassSun ?? 1
  const orbitAU = config.orbitAU ?? 1
  const points: CriticalPoint[] = []

  // ① 恒星寿命终点（主序结束）
  const lifetimeGyr = 10 * Math.pow(starMass, -2.5)
  points.push({
    tGyr: lifetimeGyr,
    name: '恒星离开主序',
    irreversible: '核心氢耗尽，进入红巨星阶段，亮度暴涨数十倍',
    after: '宜居带彻底外移到原轨道之外，行星被烤干或吞没',
  })

  // ② 湿润温室失控（如果行星在宜居带内）
  // 当恒星亮度增长使行星接收辐射超过临界值（约 1.4 倍当前）时，海洋蒸发不可逆
  // 1 + 0.1·t = 1.4 → t = 4 Gyr（对地球轨道）
  const runawayT = (1.4 - 1) / 0.1
  if (orbitAU <= 1.5) {
    points.push({
      tGyr: runawayT,
      name: '湿润温室失控',
      irreversible: '海洋蒸发进入平流层，被紫外线分解，氢逃逸到太空——水永久失去',
      after: '地表温度 > 400 K，海洋消失，行星变成干燥的温室世界',
    })
  }

  // ③ 地质死寂（热流衰减到 10%）
  const deadGeologyT = 3.0 * Math.log(10)
  points.push({
    tGyr: deadGeologyT,
    name: '地质死寂',
    irreversible: '放射性元素耗尽，地幔对流停止，板块运动与火山活动终止',
    after: '碳循环停止，大气 CO₂ 无法补充，光合作用逐渐停滞',
  })

  return points.sort(function (a, b) { return a.tGyr - b.tGyr })
}

/**
 * 生成时间轴。
 *
 * @param config - 配置
 * @returns 各时间点的状态
 */
export function buildTimeline(config: TimelineConfig = {}): {
  points: TimelinePoint[]
  critical: CriticalPoint[]
  /** 这个方法适用的边界。 */
  domain: string
} {
  const fromGyr = config.fromGyr ?? 0
  const toGyr = config.toGyr ?? 10
  const steps = Math.max(2, config.steps ?? 11)
  const starMass = config.starMassSun ?? 1
  const orbitAU = config.orbitAU ?? 1

  const critical = findCriticalPoints(config)
  const points: TimelinePoint[] = []

  for (let index = 0; index < steps; index += 1) {
    const tGyr = fromGyr + ((toGyr - fromGyr) * index) / (steps - 1)
    const luminosity = luminosityAt(tGyr) * Math.pow(starMass, 4)
    const hz = habitableZone(luminosity)
    const geologicalHeat = geologicalHeatAt(tGyr)

    // 是否在宜居带
    // ⚠️ 宜居带要区分「保守」与「乐观」边界。
  // 保守内边界（0.95 AU 基准）外移后，行星会先进入「乐观宜居区」
  // （温度偏高但可能仍宜居），而不是立刻判死。
  const conservativeInner = hz.inner
  const optimisticInner = hz.inner * 0.75  // 乐观内边界约窄 25%
  const inConservative = orbitAU >= conservativeInner && orbitAU <= hz.outer
  const inOptimistic = orbitAU >= optimisticInner && orbitAU <= hz.outer * 1.2
  const habitable = inOptimistic

    // 大气：湿润温室失控后失去，或恒星寿命结束后失去
    const runawayLimit = 1 + 0.1 * ((1.4 - 1) / 0.1)
    const lostAtmosphere = luminosity > runawayLimit || tGyr > 10 * Math.pow(starMass, -2.5)
    const hasAtmosphere = !lostAtmosphere

    let note = ''
    if (tGyr === 0) {
      note = '现在：宜居带 ' + hz.inner.toFixed(2) + '—' + hz.outer.toFixed(2) + ' AU'
    } else if (!hasAtmosphere) {
      note = '已失去大气' + (tGyr > 10 * Math.pow(starMass, -2.5) ? '（恒星已离开主序）' : '（温室失控）')
    } else if (!inConservative && inOptimistic) {
      note = '进入乐观宜居区（温度偏高，但可能仍宜居）'
    } else if (!habitable) {
      note = '已离开宜居带'
    } else {
      note = '宜居带 ' + hz.inner.toFixed(2) + '—' + hz.outer.toFixed(2) + ' AU，地质热流剩 ' +
        (geologicalHeat * 100).toFixed(0) + '%'
    }

    points.push({
      tGyr: tGyr,
      luminosity: luminosity,
      habitableInner: hz.inner,
      habitableOuter: hz.outer,
      geologicalHeat: geologicalHeat,
      habitable: habitable,
      hasAtmosphere: hasAtmosphere,
      note: note,
    })
  }

  return {
    points: points,
    critical: critical,
    domain: '适用域：主序星 0.1—10 M☉，时间跨度 < 恒星寿命。超出后需重新标定。',
  }
}

/**
 * 判定某个变化是否跨越了临界点。
 *
 * 这是补丁11「蝴蝶效应锁」的实现：早期微扰跨过临界点后，
 * 后续路径被锁定，再改参数也回不去。
 *
 * @param before - 变化前的（关键参数值, 时间）
 * @param after - 变化后的（关键参数值, 时间）
 * @param critical - 临界点列表
 * @returns 是否跨过、跨过哪个
 */
export function detectPathLock(
  before: { parameter: number; tGyr: number },
  after: { parameter: number; tGyr: number },
  critical: CriticalPoint[],
): { locked: boolean; crossed?: CriticalPoint; explanation: string } {
  for (const point of critical) {
    const crossedBefore = before.parameter >= point.tGyr
    const crossedAfter = after.parameter >= point.tGyr
    if (before.tGyr <= point.tGyr && after.tGyr > point.tGyr) {
      return {
        locked: true,
        crossed: point,
        explanation: '跨越了「' + point.name + '」：' + point.irreversible +
          '。之后' + point.after + '，参数再改也回不去。',
      }
    }
    if (crossedBefore !== crossedAfter) {
      return {
        locked: true,
        crossed: point,
        explanation: '跨越了「' + point.name + '」：' + point.irreversible,
      }
    }
  }
  return { locked: false, explanation: '没有跨越临界点，路径仍可调整。' }
}

/**
 * 渲染时间轴报告。
 *
 * @param timeline - buildTimeline 的结果
 * @returns 可读文本
 */
export function renderTimeline(timeline: ReturnType<typeof buildTimeline>): string {
  const out: string[] = []
  out.push('═══ 演化时间轴 ═══')
  out.push('')
  out.push('【快慢变量解耦】')
  out.push('  快变量（大气、温度）：每步按平衡态重算')
  out.push('  慢变量（恒星亮度、地质热流）：随时间单调演化')
  out.push('')
  out.push('【时间序列】')
  out.push('  时间(Gyr)  亮度    宜居带(AU)        地质热流  状态')
  for (const point of timeline.points) {
    const hz = point.habitableInner.toFixed(2) + '—' + point.habitableOuter.toFixed(2)
    out.push('  ' + point.tGyr.toFixed(1).padStart(8) +
      point.luminosity.toFixed(2).padStart(7) +
      hz.padStart(16) +
      (point.geologicalHeat * 100).toFixed(0).padStart(9) + '%  ' +
      (point.hasAtmosphere ? (point.habitable ? '宜居' : '离开宜居带') : '无大气'))
  }
  out.push('')
  out.push('【历史临界点】跨过后不可逆')
  for (const point of timeline.critical) {
    out.push('  ' + point.tGyr.toFixed(1) + ' Gyr — ' + point.name)
    out.push('    为什么不可逆：' + point.irreversible)
    out.push('    之后：' + point.after)
  }
  out.push('')
  out.push(timeline.domain)
  return out.join(String.fromCharCode(10))
}
