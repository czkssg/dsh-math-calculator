/**
 * 观测者物理过滤：不同观测者看到不同的世界。
 *
 * @module dsh-math-calculator/observer
 * @description
 * 方案补丁7：切换观测者（人类/本地智慧生物/二维生物…）不仅改变标签，
 * 更自动禁用不适用的公式与文明拓扑选项，并重算体感参数（人择选择效应）。
 *
 * ## 为什么这很重要
 *
 * 「这个星球重力太大」这句话本身没有意义——
 * 对一个 2 米的人类是太重，对一个 20 厘米的生物可能刚好。
 * 观测者决定了**什么叫「重」**。
 *
 * ## 做法
 *
 * 1. 每个观测者有一组**尺度参数**（体型、代谢率、寿命、感知波段、神经速度）；
 * 2. 用这组参数**重算** P3 层的三个无量纲比值；
 * 3. 判定哪些科技/文明路径对该观测者不适用（如二维生物无法用三维建筑）；
 * 4. 输出「同一个世界，不同观测者看到什么」。
 *
 * ## 定位延续
 *
 * 不说「这个观测者不合理」，只说「按它的尺度，这些结论会变」。
 */

/** 观测者类型。 */
export type ObserverKind = 'human' | 'native' | 'tiny' | 'giant' | '2d' | 'aquatic' | 'aerial' | 'custom'

/**
 * 一个观测者的尺度参数。
 *
 * 这些数字决定「什么叫大、什么叫快、什么叫热」。
 */
export interface Observer {
  /** 类型。 */
  kind: ObserverKind
  /** 中文名。 */
  label: string
  /** 体型（米）。 */
  bodyLength: number
  /** 体表面积（m²），用于散热核算。 */
  bodyArea: number
  /** 质量（kg）。 */
  bodyMass: number
  /** 基础代谢率（W）。 */
  metabolicPower: number
  /** 神经传导速度（m/s），决定反应时间上限。 */
  nerveSpeed: number
  /** 视觉感知波段（nm 区间）。 */
  visionRange: [number, number]
  /** 预期寿命（年）。 */
  lifespanYears: number
  /** 生活环境限制（如二维、水生、飞行）。 */
  constraints: string[]
}

/** 内置观测者档案。 */
export const OBSERVERS: Observer[] = [
  {
    kind: 'human', label: '人类标准',
    bodyLength: 1.7, bodyArea: 1.8, bodyMass: 70, metabolicPower: 100,
    nerveSpeed: 100, visionRange: [380, 750], lifespanYears: 80,
    constraints: [],
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
];

/** 体感重算结果。 */
export interface PerceivedMetrics {
  /** 骨骼强度体重比（按该观测者尺度）。 */
  boneRatio: number
  /** 身高大气标高比。 */
  heightScaleRatio: number
  /** 反应时间重力比。 */
  reactionRatio: number
  /** 散热余量（产热 / 散热能力，>1 表示过热）。 */
  heatBalance: number
  /** 它与人类标准的倍数差异。 */
  versusHuman: { bone: number; height: number; reaction: number }
}

/**
 * 按某个观测者重算体感。
 *
 * 同样的世界，换个观测者，「重不重、高不高、快不快」全变。
 *
 * @param observer - 观测者
 * @param gravity - 世界重力 m/s²
 * @param scaleHeight - 大气标高 m
 * @returns 重算后的体感指标
 */
export function perceive(observer: Observer, gravity: number, scaleHeight: number): PerceivedMetrics {
  // 骨骼强度体重比：正比于（支撑截面/体重），体重 ∝ L³，截面 ∝ L²
  // 所以 ∝ 1/(g × L)。以人类为基准缩放。
  const humanRef = 5
  const gravityRatio = gravity / 9.80665
  const sizeRatio = observer.bodyLength / 1.7
  const boneRatio = humanRef / (gravityRatio * sizeRatio)

  // 身高大气标高比：个体高度占标高的比例
  const heightScaleRatio = observer.bodyLength / Math.max(scaleHeight, 1)

  // 反应时间重力比：神经延迟 / 自由落体特征时间
  // 反应时间 ≈ 体长 / 神经速度
  const reactionTime = observer.bodyLength / Math.max(observer.nerveSpeed, 1)
  const fallTime = Math.sqrt((2 * observer.bodyLength) / Math.max(gravity, 1e-6))
  const reactionRatio = reactionTime / Math.max(fallTime, 1e-9)

  // 散热余量：产热 / 靠体表辐射能散掉的热
  const coolingCapacity = observer.bodyArea * 459  // W/m²（300K 黑体）
  const heatBalance = observer.metabolicPower / Math.max(coolingCapacity, 1e-9)

  // 与人类对比
  const humanBone = humanRef / gravityRatio
  const humanHeight = 1.7 / Math.max(scaleHeight, 1)
  const humanReaction = (1.7 / 100) / Math.sqrt((2 * 1.7) / Math.max(gravity, 1e-6))

  return {
    boneRatio: boneRatio,
    heightScaleRatio: heightScaleRatio,
    reactionRatio: reactionRatio,
    heatBalance: heatBalance,
    versusHuman: {
      bone: boneRatio / Math.max(humanBone, 1e-9),
      height: heightScaleRatio / Math.max(humanHeight, 1e-9),
      reaction: reactionRatio / Math.max(humanReaction, 1e-9),
    },
  };
}

/**
 * 观测者过滤：哪些文明路径对这个观测者不适用。
 *
 * @param observer - 观测者
 * @returns 不适用的能力与原因
 */
export function filterCapabilities(observer: Observer): Array<{ capability: string; available: boolean; reason: string }> {
  const out: Array<{ capability: string; available: boolean; reason: string }> = []
  const has = function (keyword: string): boolean {
    return observer.constraints.some(function (c) { return c.includes(keyword) })
  }

  out.push({
    capability: '用火 / 冶金',
    available: !has('无法用火'),
    reason: has('无法用火')
      ? '水下没有火，冶金只能靠化学或生物沉积'
      : '可以在空气中燃烧，冶金路径完整',
  });

  out.push({
    capability: '三维建筑',
    available: !has('三维'),
    reason: has('三维') ? '二维观测者没有高度概念，建筑只能在平面内展开' : '三维结构可用',
  });

  out.push({
    capability: '大型结构',
    available: !has('无法建造大型结构'),
    reason: has('无法建造大型结构') ? '体型太小，个体无法施加大力，只能靠群体或生物建造' : '可以组织大型工程',
  });

  out.push({
    capability: '飞行器',
    available: !has('质量严格受限'),
    reason: has('质量严格受限') ? '自身质量已到极限，携带飞行器更困难' : '可以发展航空',
  });

  out.push({
    capability: '长距离航行',
    available: observer.lifespanYears >= 20,
    reason: observer.lifespanYears >= 20
      ? '寿命 ' + observer.lifespanYears + ' 年，足以完成跨洲航行'
      : '寿命仅 ' + observer.lifespanYears + ' 年，长途航行需靠代际传承',
  });

  return out;
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
  const out: string[] = []
  const m = perceive(observer, gravity, scaleHeight)
  const num = function (v: number): string {
    if (!Number.isFinite(v)) return '—'
    const abs = Math.abs(v)
    if (abs >= 1e4 || (abs < 1e-2 && abs > 0)) return v.toExponential(2)
    return Number(v.toPrecision(4)).toString()
  }
  out.push('═══ 观测者：' + observer.label + ' ═══')
  out.push('')
  out.push('  体型 ' + observer.bodyLength + ' m   质量 ' + observer.bodyMass + ' kg');
  out.push('  代谢 ' + observer.metabolicPower + ' W   寿命 ' + observer.lifespanYears + ' 年');
  out.push('  神经速度 ' + observer.nerveSpeed + ' m/s   视觉 ' + observer.visionRange[0] + '—' + observer.visionRange[1] + ' nm');
  out.push('')
  out.push('【它的体感】同一个世界，它的尺度下的感受');
  out.push('  骨骼强度体重比    ' + num(m.boneRatio) + '  （人类的 ' + m.versusHuman.bone.toFixed(2) + ' 倍）');
  out.push('  身高大气标高比    ' + num(m.heightScaleRatio) + '  （人类的 ' + m.versusHuman.height.toFixed(2) + ' 倍）');
  out.push('  反应时间重力比    ' + num(m.reactionRatio) + '  （人类的 ' + m.versusHuman.reaction.toFixed(2) + ' 倍）');
  out.push('  散热余量          ' + m.heatBalance.toFixed(3) + (m.heatBalance > 1 ? '（过热）' : '（正常）'));
  out.push('')
  const caps = filterCapabilities(observer)
  out.push('【能做什么 / 不能做什么】');
  for (const cap of caps) {
    out.push('  ' + (cap.available ? '可用' : '受限').padEnd(6) + cap.capability.padEnd(16) + cap.reason);
  }
  return out.join(String.fromCharCode(10));
}
