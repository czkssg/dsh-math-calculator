/**
 * 物理常数的耦合推导。
 *
 * 核心问题：现在 CONSTANTS 里混了两类量 ——
 *   1. **独立常数**（真正的旋钮）：c、G、h、kB、e_charge ...
 *   2. **派生量**：g(由 GM/R²)、hbar(h/2π)、R(kB·NA)、sigma(由 h,c,kB)、
 *      mu0、kCoulomb、alpha_fs、Ry、muB、bWien、me、mp ...
 *
 * 如果改了 c 但 sigma 还是老的，那所有用 sigma 的公式（斯特藩、恒星光度）
 * 都会算出与改动后的 c 不一致的结果 —— 世界就不自洽了。
 *
 * 本模块负责：
 *   1. 定义「哪些是旋钮」和「派生量怎么由旋钮算出来」
 *   2. 修改一个旋钮后，**按依赖顺序重算所有派生量**
 *   3. 报告哪些量变了、变了多少（偏转量）
 *   4. 偏转过大时警告"这个世界已经不是现实物理了"
 *
 * 设计取舍：
 * - 只处理**有明确物理公式**的耦合。经验常数（如普朗克单位、原子质量）
 *   若无法从旋钮精确导出，就标记为"显式设定值"，改旋钮时不自动改。
 * - 不做「弱相互作用常数→恒星寿命」这类需要天体物理模型的长链推导。
 *   那类关系超出简单公式，属于主模型发挥的空间。
 *
 * @module dsh-math-calculator/constants-graph
 */

/** 一个常数节点。 */
export interface ConstantNode {
  /** 常数名。 */
  name: string
  /** 标准值（现实宇宙 SI）。 */
  standard: number
  /** 单位（展示用）。 */
  unit: string
  /** 物理含义。 */
  meaning: string
  /**
   * 是否为基础旋钮。
   * true = 可被直接改写；false = 由其他量导出（改旋钮时自动重算）。
   */
  fundamental: boolean
  /**
   * 派生公式：用常量上下文求值。
   * 仅 fundamental=false 时有意义。
   */
  derive?: (ctx: Record<string, number>) => number
  /** 依赖哪些常数（用于拓扑排序）。 */
  dependsOn?: string[]
}

/**
 * 常数图。
 *
 * 基础旋钮（9 个，物理上真正独立的量纲单位）：
 *   c       光速
 *   G       万有引力常数
 *   h       普朗克常数
 *   kB      玻尔兹曼常数
 *   e_charge 元电荷
 *   me      电子质量
 *   mp      质子质量
 *   NA      阿伏伽德罗常数
 *   epsilon0 真空介电常数
 *
 * 其余都是派生。注意 mu0 在旧 SI 里"独立"，但现代 SI 中由
 * mu0 = 1/(epsilon0 * c²) 导出，所以归为派生 —— 这正是耦合的体现。
 */
export const CONSTANT_GRAPH: ConstantNode[] = [
  // ═══ 基础旋钮 ═══
  {
    name: 'c',
    standard: 299792458,
    unit: 'm/s',
    meaning: '真空光速。同时决定相对论效应强度与电磁学换算。',
    fundamental: true,
  },
  {
    name: 'G',
    standard: 6.6743e-11,
    unit: 'm³/(kg·s²)',
    meaning: '万有引力常数。决定引力强弱、恒星寿命、行星形成。',
    fundamental: true,
  },
  {
    name: 'h',
    standard: 6.62607015e-34,
    unit: 'J·s',
    meaning: '普朗克常数。决定量子效应的尺度。',
    fundamental: true,
  },
  {
    name: 'kB',
    standard: 1.380649e-23,
    unit: 'J/K',
    meaning: '玻尔兹曼常数。连接温度与能量。',
    fundamental: true,
  },
  {
    name: 'e_charge',
    standard: 1.602176634e-19,
    unit: 'C',
    meaning: '元电荷。决定电磁力强度与化学键能量。',
    fundamental: true,
  },
  {
    name: 'me',
    standard: 9.1093837015e-31,
    unit: 'kg',
    meaning: '电子质量。',
    fundamental: true,
  },
  {
    name: 'mp',
    standard: 1.67262192369e-27,
    unit: 'kg',
    meaning: '质子质量。决定原子核与普通物质的质量尺度。',
    fundamental: true,
  },
  {
    name: 'NA',
    standard: 6.02214076e23,
    unit: '1/mol',
    meaning: '阿伏伽德罗常数。连接微观与摩尔尺度。',
    fundamental: true,
  },
  {
    name: 'epsilon0',
    standard: 8.8541878128e-12,
    unit: 'F/m',
    meaning: '真空介电常数。与 c 共同决定电磁力强度。',
    fundamental: true,
  },

  // ═══ 派生量 ═══
  {
    name: 'hbar',
    standard: 1.054571817e-34,
    unit: 'J·s',
    meaning: '约化普朗克常数 = h/2π。',
    fundamental: false,
    dependsOn: ['h'],
    derive: (ctx) => ctx.h / (2 * Math.PI),
  },
  {
    name: 'R',
    standard: 8.314462618,
    unit: 'J/(mol·K)',
    meaning: '通用气体常数 = kB·NA。',
    fundamental: false,
    dependsOn: ['kB', 'NA'],
    derive: (ctx) => ctx.kB * ctx.NA,
  },
  {
    name: 'mu0',
    standard: 1.25663706212e-6,
    unit: 'H/m',
    meaning: '真空磁导率 = 1/(epsilon0·c²)。现代 SI 中由电磁关系导出。',
    fundamental: false,
    dependsOn: ['epsilon0', 'c'],
    derive: (ctx) => 1 / (ctx.epsilon0 * ctx.c * ctx.c),
  },
  {
    name: 'kCoulomb',
    standard: 8.9875517923e9,
    unit: 'N·m²/C²',
    meaning: '库仑常数 = 1/(4π·epsilon0)。',
    fundamental: false,
    dependsOn: ['epsilon0'],
    derive: (ctx) => 1 / (4 * Math.PI * ctx.epsilon0),
  },
  {
    name: 'sigma',
    standard: 5.670374419e-8,
    unit: 'W/(m²·K⁴)',
    meaning: '斯特藩-玻尔兹曼常数 = 2π⁵kB⁴/(15h³c²)。决定热辐射强度。',
    fundamental: false,
    dependsOn: ['kB', 'h', 'c'],
    derive: (ctx) =>
      (2 * Math.PI ** 5 * ctx.kB ** 4) / (15 * ctx.h ** 3 * ctx.c ** 2),
  },
  {
    name: 'bWien',
    standard: 2.897771955e-3,
    unit: 'm·K',
    meaning: '维恩位移常数 = hc/(kB·x)，x≈4.9651。决定黑体峰值波长。',
    fundamental: false,
    dependsOn: ['h', 'c', 'kB'],
    derive: (ctx) => (ctx.h * ctx.c) / (ctx.kB * 4.965114231744276),
  },
  {
    name: 'alpha_fs',
    standard: 7.2973525693e-3,
    unit: '无量纲',
    meaning: '精细结构常数 = e²/(4π·epsilon0·ħ·c)。决定电磁力相对强弱。',
    fundamental: false,
    dependsOn: ['e_charge', 'epsilon0', 'hbar', 'c'],
    derive: (ctx) =>
      (ctx.e_charge * ctx.e_charge) /
      (4 * Math.PI * ctx.epsilon0 * ctx.hbar * ctx.c),
  },
  {
    name: 'Ry',
    standard: 13.605693122994,
    unit: 'eV',
    meaning: '里德堡能量（单位 eV）。决定原子光谱与化学能标尺。',
    fundamental: false,
    dependsOn: ['me', 'e_charge', 'epsilon0', 'h'],
    // 正确公式（注意用 h，不是 ħ；用 ħ 会差 4π² ≈ 39.5 倍）：
    //   Ry[J] = me·e⁴ / (8·ε₀²·h²)
    //   Ry[eV] = Ry[J] / e = me·e³ / (8·ε₀²·h²)
    // 校验：给出 13.6056931229 eV，与现实一致。
    derive: (ctx) =>
      (ctx.me * ctx.e_charge ** 4) /
      (8 * ctx.epsilon0 ** 2 * ctx.h ** 2 * ctx.e_charge),
  },
  {
    name: 'muB',
    standard: 9.2740100783e-24,
    unit: 'J/T',
    meaning: '玻尔磁子 = e·ħ/(2·me)。',
    fundamental: false,
    dependsOn: ['e_charge', 'hbar', 'me'],
    derive: (ctx) => (ctx.e_charge * ctx.hbar) / (2 * ctx.me),
  },

  // ═══ 天文与地球尺度（第二批补入）═══
  //
  // 这些值是「设定量」而非「基本常数」——真实宇宙里它们是历史偶然，
  // 但在架空世界推演中它们是最常被改的旋钮（"这个世界的地球大一点"）。
  // 所以把它们作为基础旋钮，同时把有明确公式关系的设为派生。
  {
    name: 'year',
    standard: 31557600,
    unit: 's',
    meaning: '儒略年 = 365.25 天。',
    fundamental: false,
    dependsOn: ['day'],
    derive: (ctx) => ctx.day * 365.25,
  },
  {
    name: 'day',
    standard: 86400,
    unit: 's',
    meaning: '标准日（24 小时）。架空世界可改。',
    fundamental: true,
  },
  {
    name: 'AU',
    standard: 149597870700,
    unit: 'm',
    meaning: '天文单位（地球-太阳平均距离）。',
    fundamental: true,
  },
  {
    name: 'ly',
    standard: 9460730472580800,
    unit: 'm',
    meaning: '光年 = c × 儒略年。随 c 与 year 变化。',
    fundamental: false,
    dependsOn: ['c', 'year'],
    derive: (ctx) => ctx.c * ctx.year,
  },
  {
    name: 'pc',
    standard: 30856775814913670,
    unit: 'm',
    meaning: '秒差距 = AU × 648000/π。随 AU 变化。',
    fundamental: false,
    dependsOn: ['AU'],
    derive: (ctx) => (ctx.AU * 648000) / Math.PI,
  },
  {
    name: 'Rearth',
    standard: 6371000,
    unit: 'm',
    meaning: '地球平均半径。架空星球可改。',
    fundamental: true,
  },
  {
    name: 'Mearth',
    standard: 5.9722e24,
    unit: 'kg',
    meaning: '地球质量。',
    fundamental: true,
  },
  {
    name: 'g',
    standard: 9.80665,
    unit: 'm/s²',
    meaning:
      '地表标准重力。注：标准值 9.80665 是纬度 45° 海平面的实测值，' +
      '而 G·M/R²（用平均半径）给 9.820 — 差 0.14%，因地球是扁球。' +
      '这里以「实测标准值」为准，改 G/M/R 时按 GM/R² 重算（会略微偏离原来的 9.80665）。',
    fundamental: false,
    dependsOn: ['G', 'Mearth', 'Rearth'],
    // 加一个 0.99858 的校正因子，让现实参数下正好回到 9.80665
    derive: (ctx) => (ctx.G * ctx.Mearth * 0.99858) / ctx.Rearth ** 2,
  },
  {
    name: 'Rsun',
    standard: 695700000,
    unit: 'm',
    meaning: '太阳半径。',
    fundamental: true,
  },
  {
    name: 'Msun',
    standard: 1.98892e30,
    unit: 'kg',
    meaning: '太阳质量。',
    fundamental: true,
  },
  {
    name: 'Lsun',
    standard: 3.828e26,
    unit: 'W',
    meaning: '太阳光度 = 4πRsun²σT⁴，T 取太阳有效温度 5772K（不是 5778K，后者是彩球温度）。',
    fundamental: false,
    dependsOn: ['Rsun', 'sigma'],
    derive: (ctx) => 4 * Math.PI * ctx.Rsun ** 2 * ctx.sigma * 5772 ** 4,
  },
  {
    name: 'atm',
    standard: 101325,
    unit: 'Pa',
    meaning: '标准大气压（地球海平面）。架空世界可改。',
    fundamental: true,
  },

  // ═══ 纯数学常数（不随物理变化，仅列出便于引用）═══
  //
  // 这些是数学恒等式，不是物理量。放进图里但标记为 fundamental，
  // 作用是让 resolveParams 能正确处理公式里对它们的引用。
  {
    name: 'phi',
    standard: 1.618033988749895,
    unit: '无量纲',
    meaning: '黄金比例 = (1+√5)/2。数学常数，不随物理改变。',
    fundamental: true,
  },
  {
    name: 'ln2',
    standard: 0.6931471805599453,
    unit: '无量纲',
    meaning: '自然对数 2。数学常数。',
    fundamental: true,
  },
  {
    name: 'ln10',
    standard: 2.302585092994046,
    unit: '无量纲',
    meaning: '自然对数 10。数学常数。',
    fundamental: true,
  },
  {
    name: 'eulerGamma',
    standard: 0.5772156649015329,
    unit: '无量纲',
    meaning: '欧拉-马歇罗尼常数。数学常数。',
    fundamental: true,
  },
]

/** 常数图索引。 */
export const CONSTANT_INDEX: Map<string, ConstantNode> = new Map(
  CONSTANT_GRAPH.map((node) => [node.name, node]),
)

/** 基础旋钮名。 */
export const FUNDAMENTAL_NAMES: string[] = CONSTANT_GRAPH.filter((n) => n.fundamental).map((n) => n.name)

/**
 * 当前生效的常数覆盖（世界级）。
 *
 * 为什么需要这个：只做"推演并展示"是不够的 —— 用户改完 c 之后，
 * 再调用 formula("mass_energy") 必须用**新** c，否则"牵一发动全身"就是假的。
 *
 * **隔离设计**：这个覆盖不是全局单例，而是**跟着活动工作区走**。
 * 切换工作区时由 workspace 层调用 setActiveConstants 换成那个工作区的常数表。
 * 这样 A 世界的引力绝不会泄漏到 B 世界。
 */
let activeOverrides: Record<string, number> = {}

/** 设置生效的常数覆盖（由 workspace 切换或 operation=constants 调用）。 */
export function setActiveConstants(values: Record<string, number>): void {
  activeOverrides = { ...values }
}

/** 取当前生效的常数覆盖。 */
export function getActiveConstants(): Record<string, number> {
  return activeOverrides
}

/** 清空覆盖，回到现实宇宙。 */
export function resetActiveConstants(): void {
  activeOverrides = {}
}

/** 合并一批覆盖（增量更新，不清掉已有的）。 */
export function mergeActiveConstants(values: Record<string, number>): void {
  activeOverrides = { ...activeOverrides, ...values }
}

/** 修改记录。 */
export interface ConstantChange {
  name: string
  from: number
  to: number
  /** 相对变化量（to/from - 1）。 */
  relativeDelta: number
  fundamental: boolean
}

/** 一次推演的结果。 */
export interface ConstantRecalculation {
  /** 最终的全部常数取值。 */
  values: Record<string, number>
  /** 用户显式改动的旋钮。 */
  changed: ConstantChange[]
  /** 因耦合而被动变化的派生量。 */
  derived: ConstantChange[]
  /** 警告。 */
  warnings: string[]
  /** 世界偏离现实的程度（0=完全现实，1=完全陌生）。 */
  deviationScore: number
  /** 偏离等级描述。 */
  deviationLevel: string
  /** 哪些公式会受影响的统计。 */
  affectedFormulaCategories: string[]
}

/**
 * 计算现实基线。
 */
export function standardValues(): Record<string, number> {
  const values: Record<string, number> = {}
  for (const node of CONSTANT_GRAPH) {
    if (node.fundamental) values[node.name] = node.standard
  }
  // 按依赖层级反复求值直到收敛（图很浅，几轮就够）
  for (let round = 0; round < 10; round += 1) {
    let progress = false
    for (const node of CONSTANT_GRAPH) {
      if (node.fundamental) continue
      if (values[node.name] !== undefined) continue
      const deps = node.dependsOn ?? []
      if (deps.every((dep) => values[dep] !== undefined)) {
        values[node.name] = node.derive!(values)
        progress = true
      }
    }
    if (!progress) break
  }
  return values
}

/**
 * 应用一组旋钮修改，重新推导全部派生量。
 *
 * @param overrides - 要改的常数（名字 → 新值）
 * @returns 重算结果 + 偏转分析
 */
export function recalculateConstants(overrides: Record<string, number>): ConstantRecalculation {
  const warnings: string[] = []
  const changed: ConstantChange[] = []

  const baseline = standardValues()
  const values: Record<string, number> = {}

  // 1. 先放基础旋钮（含用户覆盖）
  for (const node of CONSTANT_GRAPH) {
    if (!node.fundamental) continue
    if (Object.prototype.hasOwnProperty.call(overrides, node.name)) {
      const next = overrides[node.name]
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error(`常数 ${node.name} 必须是正的有限数，收到 ${next}`)
      }
      values[node.name] = next
      changed.push({
        name: node.name,
        from: node.standard,
        to: next,
        relativeDelta: next / node.standard - 1,
        fundamental: true,
      })
    } else {
      values[node.name] = node.standard
    }
  }

  // 2. 检查用户是否试图直接改派生量
  for (const key of Object.keys(overrides)) {
    const node = CONSTANT_INDEX.get(key)
    if (!node) {
      warnings.push(`未知常数 "${key}"，已忽略。可改的基础旋钮: ${FUNDAMENTAL_NAMES.join(', ')}`)
      continue
    }
    if (!node.fundamental) {
      warnings.push(
        `"${key}" 是**派生量**，不能直接设定 —— 它由 ${(node.dependsOn ?? []).join(', ')} 决定。` +
          `请改这些基础量，${key} 会自动重算。`,
      )
    }
  }

  // 3. 按依赖拓扑求派生量
  const remaining = new Set(CONSTANT_GRAPH.filter((n) => !n.fundamental).map((n) => n.name))
  let guard = 0
  while (remaining.size > 0 && guard < 50) {
    guard += 1
    let progress = false
    for (const name of [...remaining]) {
      const node = CONSTANT_INDEX.get(name)!
      const deps = node.dependsOn ?? []
      if (deps.every((dep) => values[dep] !== undefined)) {
        values[name] = node.derive!(values)
        remaining.delete(name)
        progress = true
      }
    }
    if (!progress) {
      warnings.push(`以下派生量存在循环依赖，已跳过: ${[...remaining].join(', ')}`)
      break
    }
  }

  // 4. 找出被动变化的派生量
  const derived: ConstantChange[] = []
  for (const node of CONSTANT_GRAPH) {
    if (node.fundamental) continue
    const before = baseline[node.name]
    const after = values[node.name]
    if (before === undefined || after === undefined) continue
    const delta = after / before - 1
    if (Math.abs(delta) > 1e-9) {
      derived.push({
        name: node.name,
        from: before,
        to: after,
        relativeDelta: delta,
        fundamental: false,
      })
    }
  }

  // 5. 偏转评分
  //
  // 校准目标（拿真实区间反复调出来的，别随手改）：
  //   0.1% 微调 → 应低于 10 分（读者无感）
  //   1% 调整 → 约 20-30 分（极细心能察觉）
  //   10% 调整 → 约 50 分（明显不同）
  //   50%+ 调整 → 70 分以上（世界已重写）
  //
  // 关键：**只看最大偏转，不让链长抬分**。
  // 早先把"被动变化个数"计入评分，导致改动 0.1% 也让 mu0/sigma/alpha 三个量
  // 微动 → 链长因子拉满 → 误报"显著偏离"。链长只影响提示语，不影响分数。
  const allDeltas = [...changed, ...derived].map((c) => Math.abs(c.relativeDelta))
  const maxDelta = allDeltas.length > 0 ? Math.max(...allDeltas) : 0

  // 分段线性：用最直观的阈值锚点
  const deviationScore = ((): number => {
    const d = maxDelta
    if (d <= 0.0005) return d * 20 // < 0.05%：几乎为 0
    if (d <= 0.005) return 0.01 + ((d - 0.0005) / 0.0045) * 0.09 // 0.05%~0.5% → 0.01~0.10
    if (d <= 0.02) return 0.10 + ((d - 0.005) / 0.015) * 0.15 // 0.5%~2% → 0.10~0.25
    if (d <= 0.1) return 0.25 + ((d - 0.02) / 0.08) * 0.25 // 2%~10% → 0.25~0.50
    if (d <= 0.5) return 0.50 + ((d - 0.1) / 0.4) * 0.28 // 10%~50% → 0.50~0.78
    return Math.min(1, 0.78 + ((d - 0.5) / 0.5) * 0.22) // 50%+ → 0.78~1.0
  })()

  // 6. 偏离等级
  let deviationLevel: string
  if (deviationScore < 0.02) {
    deviationLevel = '几乎无偏离 —— 数值层面接近现实，但细看会不一致'
  } else if (deviationScore < 0.1) {
    deviationLevel = '轻微偏离 —— 大多数读者感知不到，可作为"微调异世界"'
  } else if (deviationScore < 0.35) {
    deviationLevel = '显著偏离 —— 会出现可观测的差异（如恒星颜色、化学反应速率）'
  } else if (deviationScore < 0.7) {
    deviationLevel = '深度偏离 —— 现实物理的许多结论不再成立，需要重建常识'
  } else {
    deviationLevel = '陌生物理 —— 与现实的类比基本失效，只能靠内部自洽推演'
  }

  // 7. 按受影响程度给警告
  for (const change of [...changed, ...derived]) {
    const absDelta = Math.abs(change.relativeDelta)
    if (absDelta < 0.02) continue

    if (change.name === 'c') {
      warnings.push(
        `光速改变了 ${(change.relativeDelta * 100).toFixed(0)}%：` +
          '这会同时改变电磁力强度、精细结构常数、原子尺度，' +
          '不是"只是跑得慢/快一点"那么简单。相对论效应阈值与化学键能都会跟着变。',
      )
    } else if (change.name === 'G') {
      warnings.push(
        `引力常数改变了 ${(change.relativeDelta * 100).toFixed(0)}%：` +
          '恒星燃烧速率 ∝ G³ 量级，恒星寿命与光度都会剧变；行星形成与轨道稳定性也受影响。',
      )
    } else if (change.name === 'alpha_fs') {
      warnings.push(
        `精细结构常数变成现实的 ${(change.to / change.from).toFixed(2)} 倍：` +
          '它决定原子大小与化学键强度。偏离超过约 4% 时，恒星核合成（碳的生成）就不再成立。',
      )
    } else if (change.name === 'sigma' && Math.abs(change.relativeDelta) > 0.2) {
      warnings.push(`斯特藩常数改变了 ${(change.relativeDelta * 100).toFixed(0)}%，热辐射强度随之剧变。`)
    }
  }

  // 8. 哪些公式类别受影响
  const affected = new Set<string>()
  for (const change of [...changed, ...derived]) {
    if (Math.abs(change.relativeDelta) < 0.01) continue
    switch (change.name) {
      case 'c':
        affected.add('physics/relativity')
        affected.add('physics/em')
        affected.add('physics/quantum')
        break
      case 'G':
        affected.add('physics/gravity')
        affected.add('physics/astronomy')
        break
      case 'h':
      case 'hbar':
        affected.add('physics/quantum')
        break
      case 'kB':
      case 'R':
        affected.add('physics/thermo')
        affected.add('chemistry/kinetics')
        break
      case 'sigma':
        affected.add('physics/thermo')
        affected.add('physics/astronomy')
        break
      case 'e_charge':
      case 'epsilon0':
      case 'kCoulomb':
      case 'alpha_fs':
        affected.add('physics/em')
        affected.add('chemistry/electro')
        break
      case 'bWien':
        affected.add('physics/thermo')
        break
      default:
        break
    }
  }

  return {
    values,
    changed,
    derived,
    warnings,
    deviationScore,
    deviationLevel,
    affectedFormulaCategories: [...affected].sort(),
  }
}
