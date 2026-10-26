/**
 * 天体量的常数传导：改了基础物理常数之后，天体数据里**哪些必须重算、哪些绝不能动**。
 *
 * ## 这是本模块存在的唯一理由
 *
 * 「把宇宙所有星体的数据都补上」听起来是填表，但一旦作者改了 α、G 或 c，
 * 这张表立刻分裂成两类：
 *
 * | 类别 | 例 | 改 α 之后 |
 * |---|---|---|
 * | **不变** | 行星质量、半径、轨道半长轴 | 完全不动。它们由引力与初始条件决定，与电磁力几乎无关 |
 * | **必变** | 恒星光度、寿命、有效温度、平衡温度 | 跟着 α 走，公式自己会算 |
 * | **不可推导** | 大气成分、云量、反照率、磁场、板块 | 没有公式，是历史偶然。只能提示作者「这条要你自己定」 |
 *
 * 最容易犯的错有两个，都是**静默**的：
 *   1. 改了 α 之后把行星质量也跟着改 —— 那是篡改设定（本模块明确拒绝）
 *   2. 改了 α 之后忘了恒星光度要变 —— 于是气候结论还是旧的
 *
 * ## 传导链（α 为例）
 *
 * ```
 * α ↑
 *  ├→ 库仑势垒 ↑ → 核聚变点火温度 ↑ → 同质量恒星光度 ↓、寿命 ↑
 *  ├→ 电子散射不透明度 ↑ → 辐射压 ↑ → 恒星光度 ↓
 *  ├→ 化学键能 ∝ α² → 材料强度、生物体型上限 ↑
 *  └→ 玻尔半径 ∝ 1/α → 原子尺度 ↓ → 物质密度 ↑
 *
 * 行星质量、半径、轨道：**不动**（它们的定义式里没有 α）
 * 平衡温度：随恒星光度变（因为辐照变了）
 * 反照率：不动，但它的数值本身只是地球标定
 * ```
 *
 * @module dsh-math-calculator/body-scaling
 */

import type { ConstantDependence, MeasuredValue } from './body-catalog.js'

/** 一条传导结论。 */
export interface ScalingRule {
  /** 受影响的天体量（中文名）。 */
  quantity: string
  /** 依赖哪个常数。 */
  constant: string
  /** 随常数变化的幂次（相对变化 = 常数相对变化 ^ exponent）。0 表示无关。 */
  exponent: number
  /** 可信度。 */
  confidence: 'exact' | 'empirical' | 'order-of-magnitude' | 'direction-only'
  /** 一句话说明机制。 */
  mechanism: string
  /** 适用域；超出只降级不拒绝。 */
  domain: string
}

/**
 * 常数 → 天体量的传导规则表。
 *
 * `exponent` 是这个表的核心：它回答「α 变 1%，这个量变百分之几」。
 * 0 表示无关 —— 此时让它变才是错的。
 */
export const SCALING_RULES: ScalingRule[] = [
  // ── α（精细结构常数）──
  {
    quantity: '化学键能',
    constant: 'alpha_fs',
    exponent: 2,
    confidence: 'exact',
    mechanism: '里德伯能量 E ∝ α²（库仑势 ∝ α），化学键能同量级',
    domain: 'α 偏离现实 < 50%',
  },
  {
    quantity: '原子尺度（玻尔半径）',
    constant: 'alpha_fs',
    exponent: -1,
    confidence: 'exact',
    mechanism: 'a₀ = ħ/(mₑcα)，严格 ∝ 1/α',
    domain: '任意 α（但 α > 1 时该式失效）',
  },
  {
    quantity: '材料抗压强度',
    constant: 'alpha_fs',
    exponent: 5,
    confidence: 'order-of-magnitude',
    mechanism: '强度 ∝ 键能/原子体积² ∝ α²/α⁻² ≈ α⁵（体积由 a₀³ 缩放）',
    domain: 'α 偏离现实 < 30%；超出后晶体结构本身会变',
  },
  {
    quantity: '恒星核聚变点火温度',
    constant: 'alpha_fs',
    exponent: 2,
    confidence: 'order-of-magnitude',
    mechanism: '库仑势垒 ∝ α²，隧道穿透率对势垒指数敏感',
    domain: '量级估计，实际还依赖强相互作用强度',
  },
  {
    quantity: '恒星寿命',
    constant: 'alpha_fs',
    exponent: 0.5,
    confidence: 'order-of-magnitude',
    mechanism:
      'α↑ → 不透明度↑ → 辐射压↑ → 光度↓ → 燃烧更慢。低质量星 τ∝α²，' +
      '大质量星 τ∝α⁰（不透明度已是电子散射主导，与 α 弱相关）',
    domain: '低质量星取指数 2，大质量星取 0',
  },
  // ── 行星（受恒星间接影响）──
  {
    quantity: '行星平衡温度',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      'T_eq = 278.6/√a · (1−A)^0.25 · (L/L☉)^0.25。α 不直接出现在式子里，' +
      '但它改变 L：α↑ → 不透明度↑ → L↓ → T_eq↓。这是间接依赖，不是幂律，' +
      '所以不能标「不变」——要按新 L 重算。',
    domain: '只看方向；具体数值请改 α 后用 world 重算',
  },
  {
    quantity: '行星质量、半径、轨道半长轴',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      '这些由引力与初始角动量决定，定义式里没有 α —— ' +
      '同一天体在 α 更大的宇宙里质量不变，只是化学与材料性质变了',
    domain: '严格为零：改 α 绝不该改动这些数',
  },
  {
    quantity: '行星反照率',
    constant: 'alpha_fs',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      '反照率取决于云、冰、海、植被的分布——那是历史与气候的结果，不是 α 的函数。' +
      '但注意：α 变了会改变云滴尺度与散射效率，所以「数值不变」指的是「没有公式可依」，' +
      '不等于「物理上真的不变」。要精确就得重新做气候模拟，本模型不做。',
    domain: '无公式可依；只能由作者重新设定',
  },

  // ── G（引力常数）──
  {
    quantity: '行星质量、半径、轨道半长轴',
    constant: 'G',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      '这些量由引力与初始角动量决定，但它们**不是** G 的函数 —— ' +
      '同一天体在 G 更大的宇宙里质量不变，只是「同样的质量产生了更大的重力」',
    domain: '严格为零：改 G 绝不该改动这些数',
  },
  {
    quantity: '表面重力',
    constant: 'G',
    exponent: 1,
    confidence: 'exact',
    mechanism: 'g = GM/R²，严格 ∝ G',
    domain: '任意',
  },
  {
    quantity: '逃逸速度',
    constant: 'G',
    exponent: 0.5,
    confidence: 'exact',
    mechanism: 'v = √(2GM/R)，∝ √G',
    domain: '任意',
  },
  {
    quantity: '轨道周期',
    constant: 'G',
    exponent: -0.5,
    confidence: 'exact',
    mechanism: '开普勒第三定律 P = 2π√(a³/GM)，∝ G^(-1/2)',
    domain: '任意',
  },
  {
    quantity: '恒星最小点火质量',
    constant: 'G',
    exponent: -1.5,
    confidence: 'order-of-magnitude',
    mechanism: 'G↑ → 引力压缩更强 → 更小的质量也能点燃核心',
    domain: '量级估计',
  },

  // ── c（光速）──
  {
    quantity: 'α（精细结构常数）',
    constant: 'c',
    exponent: -1,
    confidence: 'exact',
    mechanism: 'α = e²/(4πε₀ħc)，严格 ∝ 1/c',
    domain: '任意',
  },
  {
    quantity: '原子尺度（玻尔半径）',
    constant: 'c',
    exponent: 1,
    confidence: 'exact',
    mechanism: '由 α ∝ 1/c 且 a₀ ∝ 1/α 得 a₀ ∝ c',
    domain: '任意',
  },
  {
    quantity: '化学键能',
    constant: 'c',
    exponent: -2,
    confidence: 'exact',
    mechanism: '由 E ∝ α² 且 α ∝ 1/c 得 E ∝ c⁻²',
    domain: '任意',
  },

  // ── 不可推导类（exponent 无意义，单独列出提醒）──
  {
    quantity: '大气成分、云量、反照率、磁场、板块构造',
    constant: '(任意)',
    exponent: 0,
    confidence: 'direction-only',
    mechanism:
      '这些是**历史偶然**的结果，不是物理定律的推论：' +
      '地球有大气的样子取决于挥发物如何被吸积、何时被撞击、生命何时出现',
    domain: '永远不可推导：只能由作者设定，或引用同类天体的观测值',
  },
]

/**
 * 查某个天体量依赖哪个常数、怎么变。
 *
 * @param quantity - 量名（中文，如「恒星寿命」）
 * @returns 匹配的规则（可能多条）；没找到返回空数组
 */
export function rulesFor(quantity: string): ScalingRule[] {
  return SCALING_RULES.filter(function (rule) { return rule.quantity.includes(quantity) })
}

/**
 * 一次改常数后的传导结果。
 */
export interface ScalingOutcome {
  /** 改了哪个常数。 */
  constant: string
  /** 变化率（如 1.5 表示变成原来的 1.5 倍，即 +50%）。 */
  factor: number
  /** 有明确幂次的量：按指数重算。 */
  effects: Array<{
    quantity: string
    /** 该量的变化倍数。 */
    multiplier: number
    /** 一句话结论。 */
    text: string
    confidence: ScalingRule['confidence']
  }>
  /**
   * **间接依赖**的量：要重算，但不能用幂次算。
   *
   * 例：行星平衡温度 T ∝ L^0.25，而 α 通过恒星结构改变 L。
   * 这不是幂律关系，所以不能给出倍数 —— 只能提示「改完必须用 world 重跑」。
   *
   * ⚠️ 必须与 `unchanged` 严格分开：把这类量误列进「不该动」，
   * 作者就会拿着旧温度去写新宇宙，那是这个功能最要命的失败模式。
   */
  indirect: Array<{ quantity: string; reason: string }>
  /** 真正不该动的量（幂次严格为 0 且无间接依赖）。 */
  unchanged: string[]
}

/**
 * 计算某个常数变化后，各天体量的变化倍数。
 *
 * @param constant - 常数名（如 'alpha_fs'、'G'、'c'）
 * @param factor - 该常数变成原来的几倍
 * @returns 传导结果
 */
export function propagateConstantChange(constant: string, factor: number): ScalingOutcome {
  const rules = SCALING_RULES.filter(function (rule) { return rule.constant === constant })
  const effects: ScalingOutcome['effects'] = []
  const indirect: ScalingOutcome['indirect'] = []
  const unchanged: string[] = []

  for (const rule of rules) {
    if (rule.exponent !== 0) {
      const multiplier = factor ** rule.exponent
      const direction = multiplier > 1.0001 ? '升高' : multiplier < 0.9999 ? '降低' : '不变'
      effects.push({
        quantity: rule.quantity,
        multiplier: multiplier,
        text:
          rule.quantity + ' ' + direction + '到原来的 ' + multiplier.toPrecision(4) + ' 倍' +
          '（' + rule.mechanism + '）',
        confidence: rule.confidence,
      })
      continue
    }
    /**
     * exponent = 0 的两种可能，必须区分：
     *   · mechanism 里明确说「无关 / 不该变」→ 真的不动
     *   · mechanism 里提到「间接依赖 / 按新值重算」→ 要重算，但没有幂次
     */
    const isIndirect = /间接|重算|不能标|通过|新值/.test(rule.mechanism)
    if (isIndirect) {
      indirect.push({ quantity: rule.quantity, reason: rule.mechanism })
    } else {
      unchanged.push(rule.quantity)
    }
  }

  return { constant: constant, factor: factor, effects: effects, indirect: indirect, unchanged: unchanged }
}

/**
 * 检查一条天体数据在改常数后是否应重算。
 *
 * @param value - 一条带依赖标记的数值
 * @param constant - 改动的常数名
 * @returns 是否应重算；以及原因
 */
export function howToTreatValue(
  value: MeasuredValue,
  constant: string,
): { rescale: boolean; reason: string } {
  switch (value.dependence) {
    case 'scaled':
      return { rescale: true, reason: '由公式决定，改常数后必须重算' }
    case 'first-principles':
      return {
        rescale: false,
        reason: '由引力/初始条件决定，与 ' + constant + ' 无关——改了就是篡改设定',
      }
    case 'calibrated':
      return {
        rescale: false,
        reason:
          '只是地球标定值（' + (value.domain || '未注明适用域') + '），' +
          '改常数后它不会「自动跟着变」，而是整个失去可信度',
      }
    case 'contingent':
      return { rescale: false, reason: '历史偶然的结果，没有公式可依——只能由作者重新设定' }
    default:
      return { rescale: false, reason: '未标注依赖类别' }
  }
}

/**
 * 依赖类别的人话说明（给输出用）。
 *
 * @param dependence - 依赖类别
 * @returns 说明
 */
export function describeDependence(dependence: ConstantDependence): string {
  switch (dependence) {
    case 'first-principles':
      return '物理必然（改常数不该动）'
    case 'scaled':
      return '随常数变（公式决定）'
    case 'calibrated':
      return '地球标定（超域失真）'
    case 'contingent':
      return '历史偶然（不可推导）'
    default:
      return '未标注'
  }
}
