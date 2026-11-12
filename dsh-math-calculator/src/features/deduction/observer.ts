/**
 * 观测者物理过滤：不同观测者看到不同的世界。
 *
 * 「这个星球重力太大」这句话本身没有意义——对一个 2 米的人类是太重，
 * 对一个 20 厘米的生物可能刚好。观测者决定了什么叫「重」。
 *
 * ## 做法
 *
 * 1. 每个观测者有一组尺度参数（体型、代谢率、寿命、感知波段、神经速度）；
 * 2. 用这组参数重算 P3 层的三个无量纲比值；
 * 3. 判定哪些科技/文明路径对该观测者不适用；
 * 4. 输出「同一个世界，不同观测者看到什么」。
 *
 * 不说「这个观测者不合理」，只说「按它的尺度，这些结论会变」。
 *
 * @module dsh-math-calculator/features/deduction/observer
 */

/** 观测者类型。 */
export type ObserverKind = 'human' | 'native' | 'tiny' | 'giant' | '2d' | 'aquatic' | 'aerial' | 'custom'

/** 一个观测者的尺度参数。 */
export interface Observer {
  kind: ObserverKind
  label: string
  bodyLength: number
  bodyArea: number
  bodyMass: number
  metabolicPower: number
  nerveSpeed: number
  visionRange: [number, number]
  lifespanYears: number
  constraints: string[]
}

/** 内置观测者档案。 */
export const OBSERVERS: Observer[] = [
  {
    kind: 'human', label: '人类标准',
    bodyLength: 1.7, bodyArea: 1.8, bodyMass: 70, metabolicPower: 100,
    nerveSpeed: 100, visionRange: [380, 750], lifespanYears: 80, constraints: [],
  },
  {
    kind: 'tiny', label: '小型生物（20 cm）',
    bodyLength: 0.2, bodyArea: 0.04, bodyMass: 0.05, metabolicPower: 0.5,
    nerveSpeed: 10, visionRange: [300, 700], lifespanYears: 2,
    constraints: ['无法建造大型结构', '表面积相对更大，散热更快', '雷诺数低，流体感受不同'],
  },
  {
    kind: 'giant', label: '巨型生物（10 m）',
    bodyLength: 10, bodyArea: 60, bodyMass: 8000, metabolicPower: 12000,
    nerveSpeed: 100, visionRange: [380, 750], lifespanYears: 200,
    constraints: ['散热困难（体积/表面比恶化）', '神经延迟明显'],
  },
  {
    kind: 'aquatic', label: '水生智慧',
    bodyLength: 2.5, bodyArea: 3.5, bodyMass: 150, metabolicPower: 200,
    nerveSpeed: 100, visionRange: [400, 700], lifespanYears: 120,
    constraints: ['无法用火（冶金受限）', '结构受浮力支撑，可长得更大', '声音传播更远'],
  },
  {
    kind: 'aerial', label: '飞行智慧',
    bodyLength: 0.6, bodyArea: 0.3, bodyMass: 2, metabolicPower: 40,
    nerveSpeed: 150, visionRange: [300, 700], lifespanYears: 30,
    constraints: ['质量严格受限', '能耗高', '地面活动能力弱'],
  },
  {
    kind: '2d', label: '二维生物',
    bodyLength: 0.3, bodyArea: 0.09, bodyMass: 0.1, metabolicPower: 1,
    nerveSpeed: 20, visionRange: [400, 700], lifespanYears: 10,
    constraints: ['无法理解三维结构', '三维建筑/容器不可用', '消化道必须是平面通路'],
  },
]

/** 体感重算结果。 */
export interface PerceivedMetrics {
  boneRatio: number
  heightScaleRatio: number
  reactionRatio: number
  heatBalance: number
  versusHuman: { bone: number; height: number; reaction: number }
}

/**
 * 按某个观测者重算体感。
 *
 * @param observer - 观测者
 * @param gravity - 世界重力 m/s²
 * @param scaleHeight - 大气标高 m
 * @returns 重算后的体感指标
 */
export function perceive(observer: Observer, gravity: number, scaleHeight: number): PerceivedMetrics {
  const humanRef = 5
  const gravityRatio = gravity / 9.80665
  const sizeRatio = observer.bodyLength / 1.7
  const boneRatio = humanRef / (gravityRatio * sizeRatio)
  const heightScaleRatio = observer.bodyLength / Math.max(scaleHeight, 1)
  const reactionTime = observer.bodyLength / Math.max(observer.nerveSpeed, 1)
  const fallTime = Math.sqrt((2 * observer.bodyLength) / Math.max(gravity, 1e-6))
  const reactionRatio = reactionTime / Math.max(fallTime, 1e-9)
  const coolingCapacity = observer.bodyArea * 459
  const heatBalance = observer.metabolicPower / Math.max(coolingCapacity, 1e-9)

  const humanBone = humanRef / gravityRatio
  const humanHeight = 1.7 / Math.max(scaleHeight, 1)
  const humanReaction = 1.7 / 100 / Math.sqrt((2 * 1.7) / Math.max(gravity, 1e-6))

  return {
    boneRatio,
    heightScaleRatio,
    reactionRatio,
    heatBalance,
    versusHuman: {
      bone: boneRatio / Math.max(humanBone, 1e-9),
      height: heightScaleRatio / Math.max(humanHeight, 1e-9),
      reaction: reactionRatio / Math.max(humanReaction, 1e-9),
    },
  }
}

/**
 * 观测者过滤：哪些文明路径对该观测者不适用。
 *
 * @param observer - 观测者
 * @returns 能力与原因
 */
export function filterCapabilities(observer: Observer): Array<{ capability: string; available: boolean; reason: string }> {
  const has = (keyword: string): boolean => observer.constraints.some((constraint) => constraint.includes(keyword))
  return [
    {
      capability: '用火 / 冶金',
      available: !has('无法用火'),
      reason: has('无法用火') ? '水下没有火，冶金只能靠化学或生物沉积' : '可以在空气中燃烧，冶金路径完整',
    },
    {
      capability: '三维建筑',
      available: !has('三维'),
      reason: has('三维') ? '二维观测者没有高度概念，建筑只能在平面内展开' : '三维结构可用',
    },
    {
      capability: '大型结构',
      available: !has('无法建造大型结构'),
      reason: has('无法建造大型结构') ? '体型太小，个体无法施加大力，只能靠群体或生物建造' : '可以组织大型工程',
    },
    {
      capability: '飞行器',
      available: !has('质量严格受限'),
      reason: has('质量严格受限') ? '自身质量已到极限，携带飞行器更困难' : '可以发展航空',
    },
    {
      capability: '长距离航行',
      available: observer.lifespanYears >= 20,
      reason: observer.lifespanYears >= 20 ? '寿命 ' + observer.lifespanYears + ' 年，足以完成跨洲航行' : '寿命仅 ' + observer.lifespanYears + ' 年，长途航行需靠代际传承',
    },
  ]
}

/**
 * 渲染观测者报告。
 *
 * @param observer - 观测者
 * @param gravity - 世界重力
 * @param scaleHeight - 大气标高
 * @returns 可读文本
 */
export function renderObserver(observer: Observer, gravity: number, scaleHeight: number): string {
  const metrics = perceive(observer, gravity, scaleHeight)
  const num = (value: number): string => {
    if (!Number.isFinite(value)) return '—'
    const abs = Math.abs(value)
    if (abs >= 1e4 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
    return Number(value.toPrecision(4)).toString()
  }
  const out: string[] = [
    '═══ 观测者：' + observer.label + ' ═══',
    '',
    '  体型 ' + observer.bodyLength + ' m   质量 ' + observer.bodyMass + ' kg',
    '  代谢 ' + observer.metabolicPower + ' W   寿命 ' + observer.lifespanYears + ' 年',
    '  神经速度 ' + observer.nerveSpeed + ' m/s   视觉 ' + observer.visionRange[0] + '—' + observer.visionRange[1] + ' nm',
    '',
    '【它的体感】同一个世界，它的尺度下的感受',
    '  骨骼强度体重比    ' + num(metrics.boneRatio) + '  （人类的 ' + metrics.versusHuman.bone.toFixed(2) + ' 倍）',
    '  身高大气标高比    ' + num(metrics.heightScaleRatio) + '  （人类的 ' + metrics.versusHuman.height.toFixed(2) + ' 倍）',
    '  反应时间重力比    ' + num(metrics.reactionRatio) + '  （人类的 ' + metrics.versusHuman.reaction.toFixed(2) + ' 倍）',
    '  散热余量          ' + metrics.heatBalance.toFixed(3) + (metrics.heatBalance > 1 ? '（过热）' : '（正常）'),
    '',
    '【能做什么 / 不能做什么】',
  ]
  for (const cap of filterCapabilities(observer)) {
    out.push('  ' + (cap.available ? '可用' : '受限').padEnd(6) + cap.capability.padEnd(16) + cap.reason)
  }
  return out.join('\n')
}
