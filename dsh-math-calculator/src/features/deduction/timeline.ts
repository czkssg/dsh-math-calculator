/**
 * 演化时间轴：把静态推演变成动态推演。
 *
 * ## 快慢变量解耦
 *
 * ```
 *   快变量（大气环流、地表温度）  每步按平衡态重算
 *   慢变量（恒星亮度、地质热流）  随时间单调演化
 * ```
 *
 * 为什么这样分：快变量响应以年计、慢变量以亿年计。混在一起算，
 * 要么步长小到算不完，要么慢变量被平均掉。
 *
 * ## 物理依据
 *
 * 主序星约每 10 亿年增亮 10%（L ∝ 1 + 0.1·t/Gyr）；
 * 宜居带 r ∝ √L 外移；地质热流约 30 亿年衰减到 1/e。
 *
 * ## 历史临界点
 *
 * 跨过后再改参数也回不去：湿润温室失控（海洋蒸发，水永久失去）、
 * 恒星离开主序、地质死寂。这是路径依赖。
 *
 * @module dsh-math-calculator/features/deduction/timeline
 */

/** 时间轴采样点。 */
export interface TimelinePoint {
  tGyr: number
  luminosity: number
  habitableInner: number
  habitableOuter: number
  geologicalHeat: number
  habitable: boolean
  hasAtmosphere: boolean
  note: string
}

/** 历史临界点。 */
export interface CriticalPoint {
  tGyr: number
  name: string
  irreversible: string
  after: string
}

/** 配置。 */
export interface TimelineConfig {
  fromGyr?: number
  toGyr?: number
  steps?: number
  starMassSun?: number
  orbitAU?: number
  planetMass?: number
}

/** 亮度随时间。 */
export function luminosityAt(tGyr: number): number {
  return 1 + 0.1 * tGyr
}

/** 宜居带边界。 */
export function habitableZone(luminosity: number): { inner: number; outer: number } {
  return { inner: 0.95 * Math.sqrt(luminosity), outer: 1.67 * Math.sqrt(luminosity) }
}

/** 地质热流随时间。 */
export function geologicalHeatAt(tGyr: number): number {
  return Math.exp(-tGyr / 3.0)
}

/** 找临界点。 */
export function findCriticalPoints(config: TimelineConfig = {}): CriticalPoint[] {
  const starMass = config.starMassSun ?? 1
  const orbitAU = config.orbitAU ?? 1
  const points: CriticalPoint[] = []
  const lifetimeGyr = 10 * starMass ** -2.5
  points.push({
    tGyr: lifetimeGyr,
    name: '恒星离开主序',
    irreversible: '核心氢耗尽，进入红巨星阶段，亮度暴涨数十倍',
    after: '宜居带彻底外移到原轨道之外，行星被烤干或吞没',
  })
  const runawayT = (1.4 - 1) / 0.1
  if (orbitAU <= 1.5) {
    points.push({
      tGyr: runawayT,
      name: '湿润温室失控',
      irreversible: '海洋蒸发进入平流层，被紫外线分解，氢逃逸到太空——水永久失去',
      after: '地表温度 > 400 K，海洋消失，行星变成干燥的温室世界',
    })
  }
  points.push({
    tGyr: 3.0 * Math.log(10),
    name: '地质死寂',
    irreversible: '放射性元素耗尽，地幔对流停止，板块运动与火山活动终止',
    after: '碳循环停止，大气 CO₂ 无法补充，光合作用逐渐停滞',
  })
  return points.sort((a, b) => a.tGyr - b.tGyr)
}

/** 生成时间轴。 */
export function buildTimeline(config: TimelineConfig = {}): { points: TimelinePoint[]; critical: CriticalPoint[]; domain: string } {
  const fromGyr = config.fromGyr ?? 0
  const toGyr = config.toGyr ?? 10
  const steps = Math.max(2, config.steps ?? 11)
  const starMass = config.starMassSun ?? 1
  const orbitAU = config.orbitAU ?? 1
  const critical = findCriticalPoints(config)
  const points: TimelinePoint[] = []

  for (let index = 0; index < steps; index += 1) {
    const tGyr = fromGyr + ((toGyr - fromGyr) * index) / (steps - 1)
    const luminosity = luminosityAt(tGyr) * starMass ** 4
    const hz = habitableZone(luminosity)
    const geologicalHeat = geologicalHeatAt(tGyr)
    const optimisticInner = hz.inner * 0.75
    const inConservative = orbitAU >= hz.inner && orbitAU <= hz.outer
    const inOptimistic = orbitAU >= optimisticInner && orbitAU <= hz.outer * 1.2
    const habitable = inOptimistic
    const runawayLimit = 1.4
    const lostAtmosphere = luminosity > runawayLimit || tGyr > 10 * starMass ** -2.5
    const hasAtmosphere = !lostAtmosphere

    let note = ''
    if (tGyr === 0) note = '现在：宜居带 ' + hz.inner.toFixed(2) + '—' + hz.outer.toFixed(2) + ' AU'
    else if (!hasAtmosphere) note = '已失去大气' + (tGyr > 10 * starMass ** -2.5 ? '（恒星已离开主序）' : '（温室失控）')
    else if (!inConservative && inOptimistic) note = '进入乐观宜居区（温度偏高，但可能仍宜居）'
    else if (!habitable) note = '已离开宜居带'
    else note = '宜居带 ' + hz.inner.toFixed(2) + '—' + hz.outer.toFixed(2) + ' AU，地质热流剩 ' + (geologicalHeat * 100).toFixed(0) + '%'

    points.push({ tGyr, luminosity, habitableInner: hz.inner, habitableOuter: hz.outer, geologicalHeat, habitable, hasAtmosphere, note })
  }

  return {
    points,
    critical,
    domain: '适用域：主序星 0.1—10 M☉，时间跨度 < 恒星寿命。超出后需重新标定。',
  }
}

/** 判定是否跨越临界点。 */
export function detectPathLock(
  before: { parameter: number; tGyr: number },
  after: { parameter: number; tGyr: number },
  critical: CriticalPoint[],
): { locked: boolean; crossed?: CriticalPoint; explanation: string } {
  for (const point of critical) {
    if (before.tGyr <= point.tGyr && after.tGyr > point.tGyr) {
      return {
        locked: true,
        crossed: point,
        explanation: '跨越了「' + point.name + '」：' + point.irreversible + '。之后' + point.after + '，参数再改也回不去。',
      }
    }
  }
  return { locked: false, explanation: '没有跨越临界点，路径仍可调整。' }
}

/** 渲染时间轴。 */
export function renderTimeline(timeline: ReturnType<typeof buildTimeline>): string {
  const out: string[] = ['═══ 演化时间轴 ═══', '', '【快慢变量解耦】', '  快变量（大气、温度）：每步按平衡态重算', '  慢变量（恒星亮度、地质热流）：随时间单调演化', '', '【时间序列】']
  out.push('  时间(Gyr)  亮度    宜居带(AU)        地质热流  状态')
  for (const point of timeline.points) {
    const hz = point.habitableInner.toFixed(2) + '—' + point.habitableOuter.toFixed(2)
    out.push(
      '  ' + point.tGyr.toFixed(1).padStart(8) + point.luminosity.toFixed(2).padStart(7) + hz.padStart(16) +
        (point.geologicalHeat * 100).toFixed(0).padStart(9) + '%  ' +
        (point.hasAtmosphere ? (point.habitable ? '宜居' : '离开宜居带') : '无大气'),
    )
  }
  out.push('', '【历史临界点】跨过后不可逆')
  for (const point of timeline.critical) {
    out.push('  ' + point.tGyr.toFixed(1) + ' Gyr — ' + point.name)
    out.push('    为什么不可逆：' + point.irreversible)
    out.push('    之后：' + point.after)
  }
  out.push('', timeline.domain)
  return out.join('\n')
}
