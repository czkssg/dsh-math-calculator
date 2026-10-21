/**
 * 设定一致性校验。
 *
 * 这是插件此前缺的一环：
 *   quantities 告诉你「物理上限是多少」
 *   feasibility 检查「你写的设定有没有超过上限」
 *
 * 为什么这一环最重要：
 *   架空创作最常见的硬伤不是算错，而是**设定之间互相矛盾**——
 *   2g 重力星球上写 50 米高的巨兽、没有大气的世界写声音传播、
 *   铁器时代写百万人口的城市。这些读者察觉不到具体数字，
 *   但会感到「不对劲」。校验器把这种感觉量化成具体警告。
 *
 * 设计原则：
 *   1. 每条约束都给出**公式与依据**，不拍脑袋
 *   2. 区分「精确」与「经验」——有些界限是物理硬约束，有些只是经验值
 *   3. 不只报错，还给出**可行区间**与**调整建议**
 *   4. 承认文学的弹性：轻微超限不算错，只是要作者知道自己超了
 *
 * @module dsh-math-calculator/feasibility
 */

/** 置信度。 */
export type ConstraintConfidence = 'exact' | 'empirical' | 'convention'

/** 一条物理约束的定义。 */
export interface ConstraintDef {
  /** 标识（claims 里用这个键）。 */
  id: string
  /** 中文名。 */
  name: string
  /** 分类。 */
  category: string
  /** 单位。 */
  unit: string
  /** 计算公式（展示用）。 */
  formula: string
  /** 依据说明。 */
  basis: string
  /** 置信度。 */
  confidence: ConstraintConfidence
  /**
   * 计算本世界的上限。
   * @param ctx - 世界参数导出的环境量
   */
  limit: (ctx: ConstraintContext) => number
  /** 超限时的解释。 */
  explain: (value: number, limit: number, ratio: number) => string
  /** 这个约束在现实中的参考值（帮助作者校准）。 */
  realWorldReference: string
}

/** 由世界参数导出的环境量 —— 约束计算的输入。 */
export interface ConstraintContext {
  /** 表面重力 m/s²。 */
  gravity: number
  /** 相对地球的重力倍数。 */
  gravityRatio: number
  /** 地表大气密度 kg/m³（由气压与温度估）。 */
  airDensity: number
  /** 材料抗压强度 Pa。 */
  materialStrength: number
  /** 材料密度 kg/m³。 */
  materialDensity: number
  /** 自转周期 小时。 */
  rotationHours: number
  /** 轴倾角 度。 */
  obliquityDeg: number
  /** 一天多少地球日。 */
  dayLengthEarthDays: number
  /** 一年多少地球日。 */
  yearLengthEarthDays: number
  /** 逃逸速度 m/s。 */
  escapeVelocity: number
}

/** 一条校验结果。 */
export interface ConstraintResult {
  id: string
  name: string
  category: string
  unit: string
  /** 你设定的值。 */
  claimed: number
  /** 物理上限。 */
  limit: number
  /** 比值（claimed / limit）。>1 即超限。 */
  ratio: number
  /** 判定。 */
  verdict: 'safe' | 'marginal' | 'violated'
  /** 公式。 */
  formula: string
  /** 依据。 */
  basis: string
  /** 置信度。 */
  confidence: ConstraintConfidence
  /** 解释。 */
  explanation: string
  /** 建议。 */
  suggestion?: string
}

/** 校验报告。 */
export interface FeasibilityReport {
  /** 世界环境摘要。 */
  environment: ConstraintContext
  /** 每条校验结果。 */
  results: ConstraintResult[]
  /** 违规项。 */
  violations: ConstraintResult[]
  /** 边缘项（0.8~1.0 区间）。 */
  marginal: ConstraintResult[]
  /** 总判定。 */
  overall: 'consistent' | 'stretched' | 'inconsistent'
  /** 一句话总结。 */
  summary: string
}

/** 地球基准值。 */
const EARTH = {
  gravity: 9.80665,
  airDensity: 1.225,
  materialStrength: 1.3e8,
  materialDensity: 2700,
}

/**
 * 判定阈值。
 *
 * 为什么 marginal 要到 1.1 而不是 1.0：
 * 经验值类约束本身有 2~3 倍不确定性，作者设定"刚好卡在上限"
 * 时纠结 1% 毫无意义。给 10% 容差，让"略微超出"归入边缘而非违规，
 * 这样警告才聚焦在真正的矛盾上。
 */
const VERDICT = {
  /** 低于 80% 上限为安全。 */
  safe: 0.8,
  /** 80%~110% 为边缘（物理允许但很吃力，需要文本解释）。 */
  marginal: 1.1,
}

/**
 * 约束定义表。
 *
 * 每个 limit 都基于明确的物理或经验关系，并标注置信度：
 *   exact      —— 硬物理约束，超了就不可能
 *   empirical  —— 经验标定，有 2~3 倍的不确定性
 *   convention —— 社会/生物学的常见界限，有弹性
 */
export const CONSTRAINTS: ConstraintDef[] = [
  // ════════════════════════════════════════════════
  // 生物
  // ════════════════════════════════════════════════
  {
    id: 'creatureHeight',
    name: '陆生生物最大高度',
    category: 'biology',
    unit: 'm',
    formula: 'L_max = 25 m × (g_地球 / g)',
    basis: '平方-立方定律：体重 ∝ L³，骨骼承重 ∝ L²，所以承压应力 ∝ L·g。地球最大陆生动物（蜥脚类）约 25m。',
    confidence: 'empirical',
    limit: (ctx) => 25 / ctx.gravityRatio,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}m 超过上限 ${limit.toFixed(1)}m 的 ${ratio.toFixed(1)} 倍。` +
          '这个高度下骨骼承受的自身重量会压碎关节，必须靠水浮力或特殊结构（如多柱支撑）才能成立。'
        : `在允许范围内（上限 ${limit.toFixed(1)}m）。`,
    realWorldReference: '地球最大陆生动物约 25m（阿根廷龙），现存最大约 5.5m（非洲象）。',
  },
  {
    id: 'flyingCreatureMass',
    name: '飞行生物最大质量',
    category: 'biology',
    unit: 'kg',
    formula: 'm_max = 250 kg × (ρ_air / 1.225) × (9.8 / g)',
    basis: '翼载荷限制：升力 ∝ ρ_air·v²·S，而所需升力 ∝ m·g。所以可飞质量 ∝ ρ_air/g。地球最大飞行动物（风神翼龙）约 250kg。',
    confidence: 'empirical',
    limit: (ctx) => 250 * (ctx.airDensity / EARTH.airDensity) * (EARTH.gravity / ctx.gravity),
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}kg 是上限 ${limit.toFixed(0)}kg 的 ${ratio.toFixed(1)} 倍。` +
          '要飞起来需要更大的翼展，但翼展受材料强度限制——这是双重约束。' +
          '在低重力或高大气密度世界里这个上限会显著放宽。'
        : `可以飞行（上限 ${limit.toFixed(0)}kg）。`,
    realWorldReference: '地球：风神翼龙约 250kg，现存最大飞鸟约 16kg。大气密度高的世界（如高气压）允许更大飞兽。',
  },
  {
    id: 'swimmingCreatureMass',
    name: '水生生物最大质量',
    category: 'biology',
    unit: 'kg',
    formula: 'm_max = 150000 kg (浮力抵消重力，受食物链与代谢限制)',
    basis: '水中浮力抵消大部分重力，所以体型上限由代谢与食物供给决定，而非承重。地球蓝鲸约 150 吨。',
    confidence: 'convention',
    limit: () => 150000,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}kg 超过地球最大动物（蓝鲸 150 吨）的 ${ratio.toFixed(1)} 倍。` +
          '若该世界海洋生产力更高（如营养盐更丰富），可以成立，但需说明食物来源。'
        : `在合理范围内。`,
    realWorldReference: '地球蓝鲸约 150 吨。水中体型不受重力限制，主要受食物链能量传递效率限制。',
  },

  // ════════════════════════════════════════════════
  // 工程与建筑
  // ════════════════════════════════════════════════
  {
    id: 'buildingHeight',
    name: '建筑高度上限',
    category: 'engineering',
    unit: 'm',
    formula: 'H_max = σ_material / (ρ_material × g)',
    basis: '等截面柱体的自重压应力 ∝ ρ·g·H。当它达到材料抗压强度 σ 时结构坍塌。',
    confidence: 'exact',
    limit: (ctx) => ctx.materialStrength / (ctx.materialDensity * ctx.gravity),
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}m 超过材料上限 ${limit.toFixed(0)}m 的 ${ratio.toFixed(1)} 倍。` +
          '等截面结构在这个高度必然自重压垮。要突破必须用 tapered 结构（下宽上窄）、' +
          '桁架/拱结构，或换更强材料（钢、复合材料）。'
        : `结构上可行（上限 ${limit.toFixed(0)}m）。`,
    realWorldReference:
      '地球：花岗岩约 4.9km，钢筋混凝土按强度可达数十 km（实际受风载与地震限制）。' +
      '现实最高建筑 828m（哈利法塔），最大人工结构高度受限于非承重因素。',
  },
  {
    id: 'mountainHeight',
    name: '山峰高度上限',
    category: 'geology',
    unit: 'm',
    formula: 'h_max = 9000 m × (9.8 / g)',
    basis: '地壳均衡（isostasy）：山体底部岩石承受上方重量，超过抗压强度会流动（塑性变形），山不再长高。地球珠峰 8848m。',
    confidence: 'empirical',
    limit: (ctx) => 9000 / ctx.gravityRatio,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}m 超过地壳可支撑的 ${limit.toFixed(0)}m 的 ${ratio.toFixed(1)} 倍。` +
          '山体会因下部岩石塑性流动而沉降，除非该世界岩石圈特别厚或特别冷。'
        : `地质上可行（上限 ${limit.toFixed(0)}m）。`,
    realWorldReference: '地球珠峰 8848m，太阳系最高峰火星奥林匹斯山约 22km（低重力）。',
  },
  {
    id: 'towerAspectRatio',
    name: '塔楼高宽比上限',
    category: 'engineering',
    unit: '比例',
    formula: 'H/W ≤ 15（受风载与屈曲限制）',
    basis: '细长结构受风载弯矩 ∝ H²，抗弯能力 ∝ W³，所以高宽比有硬上限。地球现代摩天楼极限约 10-15。',
    confidence: 'empirical',
    limit: () => 15,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的高宽比 ${value.toFixed(1)} 超过经验上限 ${limit}。` +
          '需要更强的抗风设计（调谐质量阻尼、束筒结构）或降低高度。'
        : `在常规结构范围内。`,
    realWorldReference: '哈利法塔高宽比约 9.5，威利斯大厦约 7。理论上限约 15（受风载）。',
  },

  // ════════════════════════════════════════════════
  // 社会与经济
  // ════════════════════════════════════════════════
  {
    id: 'cityPopulation',
    name: '前工业时代城市人口上限',
    category: 'society',
    unit: '人',
    formula: 'P_max = (π·R_transport² × 耕地比例) / 人均耕地',
    basis:
      '粮食必须每天运进城，运输半径受畜力速度限制（约 30km/天往返）。' +
      '人均耕地需求约 1150 m²/人（2200 kcal/天、亩产 700 kcal/m²·年）。',
    confidence: 'empirical',
    limit: (ctx) => {
      // 运输半径 30km 的圆面积；扣除 ~40% 非耕地
      const radiusM = 30000
      const areaM2 = Math.PI * radiusM * radiusM
      const arable = areaM2 * 0.4
      const perPersonM2 = 1147
      return arable / perPersonM2
    },
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value.toLocaleString()} 人超过粮运上限约 ${Math.round(limit).toLocaleString()} 人。` +
          '突破口：水运（船运比陆运便宜 10-30 倍，可大幅扩展半径）、' +
          '更肥沃的作物、或该城依赖殖民地的粮食输入。'
        : `在粮运可持续范围内。`,
    realWorldReference:
      '前工业城市：罗马约 100 万（依赖海运粮）、长安约 100 万、中世纪伦敦约 5 万。' +
      '水运城市可比陆运城市大一个数量级。',
  },
  {
    id: 'empireRadius',
    name: '帝国有效控制半径',
    category: 'society',
    unit: 'km',
    formula: 'R_max = v_info × t_max（v_info 为信息传递速度，t_max 约 20 天）',
    basis:
      '帝国必须能在命令失效前收到消息并回传。超过这个半径，边远地区会事实独立。' +
      '快马驿站约 250 km/天，20 天 = 5000 km。',
    confidence: 'convention',
    limit: () => 5000,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value.toLocaleString()}km 超过经典帝国的 ${limit.toLocaleString()}km 上限。` +
          '要成立必须有更快的信息传递（烽火、信鸽、魔法通讯、电报），' +
          '或采用分封制（承认地方自治以换取名义臣服）。'
        : `在可有效治理的范围内。`,
    realWorldReference:
      '罗马帝国约 5000km 半径，蒙古帝国约 6000km（有驿站系统），大英帝国靠海运与电报。' +
      '没有快速通讯时，半径超过 5000km 的帝国通常只是名义统一。',
  },
  {
    id: 'agriculturalSurplus',
    name: '农业剩余率（供养非农人口）',
    category: 'society',
    unit: '%',
    formula: 'surplus = (总产 − 农民自耗) / 总产',
    basis:
      '剩余率决定能养多少工匠、士兵、祭司。前工业社会约 10-20%，' +
      '意味着 80-90% 的人必须务农。',
    confidence: 'convention',
    limit: () => 25,
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}% 剩余率超过前工业上限 ${limit}%。` +
          '需要农业技术突破（铁犁、轮作、水利、化肥）才能支撑，' +
          '否则非农人口过多会导致饥荒。'
        : `在传统农业可支撑范围内。`,
    realWorldReference:
      '前工业农业剩余率约 10-20%；现代发达国家可达 60-70%（机械化+化肥）。',
  },

  // ════════════════════════════════════════════════
  // 天文与地理
  // ════════════════════════════════════════════════
  {
    id: 'flyingVehicleAltitude',
    name: '无动力飞行高度上限（大气稀薄化）',
    category: 'astronomy',
    unit: 'm',
    formula: 'h_max ≈ H_scale × ln(ρ_0 / ρ_min)',
    basis: '升力 ∝ 空气密度，而密度随高度指数衰减。当密度低到无法支撑飞行器重量时即为上限。',
    confidence: 'empirical',
    limit: (ctx) => {
      // 需要约 1/8 地表密度才能维持常规飞行
      const scaleHeight = (8.314462618 * 288) / (0.02896 * ctx.gravity)
      return scaleHeight * Math.log(8)
    },
    explain: (value, limit, ratio) =>
      ratio > 1
        ? `设定的 ${value}m 超过常规飞行上限 ${limit.toFixed(0)}m。` +
          '这个高度空气太稀薄，固定翼与鸟类都无法产生足够升力，' +
          '需要火箭、热气球或魔法手段。'
        : `该高度仍可维持飞行（上限 ${limit.toFixed(0)}m）。`,
    realWorldReference:
      '地球：鸟类的飞行上限约 11km（斑头雁），飞机实用升限约 20km，热气球约 35km。',
  },
  {
    id: 'dayLength',
    name: '昼夜长度合理性',
    category: 'astronomy',
    unit: '小时',
    formula: '合理区间 8~72 小时（离心解体与生态节律的限制）',
    basis:
      '自转太快（<8h）会让赤道离心力接近重力，星球趋扁甚至解体；' +
      '自转过慢（>72h）会让昼夜温差极端化，生物难以调节。',
    confidence: 'empirical',
    limit: () => 72,
    explain: (value, limit, ratio) =>
      value < 8
        ? `一天的 ${value} 小时过短：赤道离心力过大，星球会被拉扁，且生物无足够时间完成觅食-休息周期。`
        : value > limit
          ? `一天的 ${value} 小时过长：向阳面长时间暴晒、背面长时间冰冻，温差可达数十度。` +
            '需要极强的大气环流来输运热量。'
          : `昼夜长度合理（${value} 小时）。`,
    realWorldReference: '地球 24h；火星约 24.6h；金星 5832h（逆行）；木星 9.9h。',
  },
]

/** 按 id 索引。 */
export const CONSTRAINT_INDEX: Map<string, ConstraintDef> = new Map(
  CONSTRAINTS.map((c) => [c.id, c]),
)

/**
 * 从世界参数导出约束计算所需的环境量。
 *
 * @param world - 星球参数（与 world operation 相同的字段）
 */
export function deriveConstraintContext(world: Record<string, unknown>): ConstraintContext {
  const num = (key: string, fallback: number): number => {
    const raw = world[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
  }

  // 与 world.ts 保持一致的基本换算
  const G = 6.6743e-11
  const Mearth = 5.9722e24
  const Rearth = 6.371e6
  const EarthG = 9.80665

  const planetMass = num('planetMass', 1) * Mearth
  const planetRadius = num('planetRadius', 1) * Rearth
  const gravity = (G * planetMass) / planetRadius ** 2
  const gravityRatio = gravity / EarthG

  // 大气密度：ρ = P·M/(R·T)
  const pressure = num('pressure', 101325)
  const molarMass = num('molarMass', 0.02896)
  const temperature = num('temperature', 288)
  const airDensity = (pressure * molarMass) / (8.314462618 * temperature)

  const rotationHours = num('rotationHours', 23.934)
  const obliquityDeg = num('obliquityDeg', 23.44)

  const escapeVelocity = Math.sqrt((2 * G * planetMass) / planetRadius)

  return {
    gravity,
    gravityRatio,
    airDensity,
    materialStrength: num('materialStrength', EARTH.materialStrength),
    materialDensity: num('materialDensity', EARTH.materialDensity),
    rotationHours,
    obliquityDeg,
    dayLengthEarthDays: rotationHours / 24,
    yearLengthEarthDays: num('yearLengthEarthDays', 365.25),
    escapeVelocity,
  }
}

/**
 * 执行一致性校验。
 *
 * @param world - 世界参数
 * @param claims - 待校验的设定（约束 id → 值）
 */
export function checkFeasibility(
  world: Record<string, unknown>,
  claims: Record<string, number>,
): FeasibilityReport {
  const environment = deriveConstraintContext(world)
  const results: ConstraintResult[] = []

  for (const [id, claimed] of Object.entries(claims)) {
    if (typeof claimed !== 'number' || !Number.isFinite(claimed)) continue
    const constraint = CONSTRAINT_INDEX.get(id)
    if (!constraint) continue

    const limit = constraint.limit(environment)
    if (!Number.isFinite(limit) || limit <= 0) continue
    const ratio = claimed / limit

    let verdict: ConstraintResult['verdict']
    if (ratio < VERDICT.safe) verdict = 'safe'
    else if (ratio <= VERDICT.marginal) verdict = 'marginal'
    else verdict = 'violated'

    const explanation = constraint.explain(claimed, limit, ratio)

    // 生成建议
    let suggestion: string | undefined
    if (verdict === 'violated') {
      const reduction = claimed / Math.max(1e-9, limit)
      suggestion =
        `把设定降到 ${limit.toFixed(1).replace(/\.0$/, '')} ${constraint.unit} 以内，` +
        `或调整世界参数让上限提高（当前需要放宽约 ${reduction.toFixed(1)} 倍）。`
      // 针对特定约束给具体的方向
      if (id === 'creatureHeight' || id === 'mountainHeight') {
        suggestion += ' 降低表面重力（减小行星质量或增大半径）是最直接的办法。'
      } else if (id === 'flyingCreatureMass') {
        suggestion += ' 提高大气密度或降低重力都能显著放宽飞行上限。'
      } else if (id === 'cityPopulation') {
        suggestion += ' 引入水运（河运/海运）可把粮运半径扩大 5-10 倍。'
      } else if (id === 'empireRadius') {
        suggestion += ' 引入更快的通讯手段（烽火台、信鸽、或本世界的特殊技术）。'
      }
    } else if (verdict === 'marginal') {
      suggestion = '已接近物理极限，建议在文本中给出解释（特殊材料、魔法、或生物适应），否则细心读者会质疑。'
    }

    results.push({
      id,
      name: constraint.name,
      category: constraint.category,
      unit: constraint.unit,
      claimed,
      limit,
      ratio,
      verdict,
      formula: constraint.formula,
      basis: constraint.basis,
      confidence: constraint.confidence,
      explanation,
      suggestion,
    })
  }

  const violations = results.filter((r) => r.verdict === 'violated')
  const marginal = results.filter((r) => r.verdict === 'marginal')

  let overall: FeasibilityReport['overall']
  let summary: string
  if (violations.length === 0 && marginal.length === 0) {
    overall = 'consistent'
    summary = `全部 ${results.length} 项设定都在物理允许范围内。`
  } else if (violations.length === 0) {
    overall = 'stretched'
    summary =
      `没有硬性违规，但 ${marginal.length} 项接近极限（${marginal.map((m) => m.name).join('、')}）。` +
      '建议在文本中给出合理解释。'
  } else {
    overall = 'inconsistent'
    summary =
      `${violations.length} 项设定超出物理上限（${violations.map((v) => v.name).join('、')}），` +
      `${marginal.length} 项接近极限。这些设定需要调整参数或在文本中解释例外性。`
  }

  return { environment, results, violations, marginal, overall, summary }
}
