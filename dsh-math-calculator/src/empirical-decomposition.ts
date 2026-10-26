/**
 * 经验公式的拆解与泛化：哪些能脱离地球域，哪些不能。
 *
 * ## 为什么要做这件事
 *
 * 公式库里有一批「把常数烘焙进系数」的经验式，例如：
 *
 *   宜居带内边界 = sqrt(L / 1.1)     ← 1.1 从哪来？是「太阳辐射 1.1 S☉ 时的位置」
 *   船舶极限航速 = 1.34 × sqrt(L)    ← 1.34 是「地球海水密度 + 重力」的合力
 *   人体表面积  = 0.007184 m^0.425 h^0.725  ← 系数与指数来自人类样本拟合
 *
 * 这些式子在**地球**上没问题，但作者的宇宙可能：
 *   · 重力是 1.5 倍 → 船的极限航速要变
 *   · 恒星光度不同 → 宜居带的内边界 1.1 这个数失效
 *   · 大气密度不同 → 代谢、散热、飞行全变
 *
 * 而作者拿到 `sqrt(L/1.1)` 根本看不出 1.1 依赖什么，只能照抄 —— 于是
 * 「1.5 倍重力的星球上船的极限航速」算出来是错的，而且错得很隐蔽
 * （数字看着正常，只是用了地球的常数）。
 *
 * ## 三种拆解结论
 *
 * | 类型 | 含义 | 处置 |
 * |---|---|---|
 * | `noscalable` | 纯拟合，没有物理内核（如 Mifflin 代谢式） | 只能在地球域用；换世界需重新拟合 |
 * | `scalable` | 有物理内核，系数可分解成已知量 | **换成显式形式**，让系数随常数变 |
 * | `dimensionless` | 本质无量纲，跨世界通用（如克莱伯 0.75 指数） | 直接可用，只需注明适用域 |
 *
 * 这个分类是本模块的全部价值：它告诉作者「这条式子在你的世界里还能不能用」。
 *
 * @module dsh-math-calculator/empirical-decomposition
 */

/** 拆解类型。 */
export type DecompositionKind = 'scalable' | 'noscalable' | 'dimensionless'

/** 一条经验公式的拆解。 */
export interface EmpiricalNote {
  /** 公式 id。 */
  id: string
  /** 中文名。 */
  name: string
  /** 原表达式。 */
  expr: string
  /** 拆解类型。 */
  kind: DecompositionKind
  /** 被烘焙的常数（原本藏起来的量）。 */
  bakedIn?: string
  /**
   * 普适形式（若有）。
   *
   * 用可替换的参数写出来，让系数能被 world/constants 算出的实际值代入。
   */
  genericForm?: string
  /** 泛化后需要哪些物理量（作者可从这里看出该改哪个参数）。 */
  needsFrom?: string[]
  /** 什么情况下它会失效。 */
  breaksWhen?: string
  /** 一句话给作者。 */
  advice: string
}

/**
 * 经验公式拆解表。
 *
 * 每条都回答同一个问题：**这条式子在「不是地球」的世界里还成立吗？**
 */
export const EMPIRICAL_NOTES: EmpiricalNote[] = [
  // ══════════════════════════════════════════════════════
  // 可泛化：有物理内核，系数能分解
  // ══════════════════════════════════════════════════════
  {
    id: 'habitable_zone',
    name: '宜居带内边界（简化）',
    expr: 'sqrt(L / 1.1)',
    kind: 'scalable',
    bakedIn:
      '1.1 是「太阳的 1.1 倍辐照」对应的距离倒数平方 —— 即内边界处辐照为 1.1 S☉。' +
      '这里的 1.1 隐含了地球的温室条件（潮湿温室极限）。',
    genericForm:
      'innerAU = sqrt(L / (fluxLimit × S0))，其中 S0 = L☉/(4π·AU²) ≈ 1361 W/m²' +
      '（由常数表算出，不是硬编码），fluxLimit ≈ 1.1 是「维持液态水所需的最小辐照倍数」',
    needsFrom: ['恒星光度 L', '太阳常数 S0（由 L☉ 与 AU 推出）', '温室条件'],
    breaksWhen:
      '大气成分与地球差异大时，fluxLimit 会变 —— 强温室行星可以在更低辐照下保持液态水' +
      '（金星就是反例：辐照只有地球 1.9 倍却 737 K）。本式只给「类似地球大气」下的边界。',
    advice:
      '光子量级下 sqrt(L/1.1) 够用；要精确到「这颗行星能不能有液态水」，' +
      '得用 world 算实际表面温度再和冰点/沸点比，别只信这个边界。',
  },
  {
    id: 'hull_speed',
    name: '船舶理论航速',
    expr: '1.34 * sqrt(L)',
    kind: 'scalable',
    bakedIn:
      '1.34 是 Froude 数 0.4 与地球重力、水密度组合的结果：' +
      'v = Fr·sqrt(g·L)，取 Fr≈0.4、g=9.81 得 v(kn) ≈ 1.34·sqrt(L_ft)。' +
      '**注意 1.34 里藏着 g = 9.81，而且 L 用的是英尺不是米** ——' +
      '重力变了、或单位换成米，这个数就错。',
    genericForm:
      'v(kn) = Fr × sqrt(g × L_m) × 1.944，Fr ≈ 0.4（兴波极限 Froude 数，无量纲）' +
      '—— 显式用米和 g，不用英尺',
    needsFrom: ['地表重力 g（由 world 给出）', '水线长 L（米）'],
    breaksWhen: '重力不是 1 g 时 1.34 失效。1.5 g 世界里同样的船极限航速高约 22%。',
    advice:
      '写「这个星球上的船能开多快」时，用 hull_speed_generic（Fr·sqrt(g·L)，米制），' +
      '别用 1.34（那是地球的重力 + 英尺单位）。',
  },
  {
    id: 'corrosion_rate_weightloss',
    name: '腐蚀速率（失重法）',
    expr: '87.6 * (weight_loss / (area * time * density))',
    kind: 'scalable',
    bakedIn:
      '87.6 是单位换算的合并结果（mm/年 与 g·cm⁻²·h⁻¹ 之间的系数），' +
      '不含物理常数，但它假定**暴露时间与实验条件**是地球式的。',
    genericForm:
      'rate_mm_per_year = weight_loss(g) × 8760 / (area(cm²) × time(h) × density(g/cm³)) × 10，' +
      '显式写清每个换算步骤，避免 87.6 这个黑箱',
    needsFrom: ['材料密度', '暴露面积', '时间'],
    breaksWhen:
      '腐蚀速率本身是化学动力学问题，依赖温度、湿度、氧气分压、pH —— ' +
      '这些换世界就全变。87.6 只是换算系数，不是物理常数，但**速率值本身**必须重新测定。',
    advice:
      '换算系数可以复用，但「这材料在这星球上腐蚀多快」是实验问题，' +
      '不同大气成分下差异可达几个数量级。',
  },
  {
    id: 'reference_evapotranspiration',
    name: '参考蒸散量（简化）',
    expr: '0.408 * delta * (Rn - G) + 0.9 * gamma * (900 / (T + 273)) * u2 * (es - ea)',
    kind: 'scalable',
    bakedIn:
      '0.408 = 1/2.45（潜热与辐射的单位换算）；900 是 Penman-Monteith 的经验系数；' +
      '0.9 是风速修正。这三个数都基于**地球的大气密度与气压**。',
    genericForm:
      'ET0 = (0.408·Δ·(Rn−G) + γ·(900/(T+273))·u2·(es−ea)) / (Δ + γ(1+0.34u2))，' +
      '但 γ（干湿表常数）= cp·P/(0.622·λ)，**随气压 P 变**；' +
      '900 那个系数对气压线性依赖。换星球要重算 γ。',
    needsFrom: ['大气压 P', '比热 cp', '汽化潜热 λ', '地表反照率'],
    breaksWhen:
      '气压不是 1 atm 时 γ 直接按 P/101325 缩放，整个式子偏几倍。' +
      '0.1 atm 的星球上蒸散量会小很多。',
    advice:
      '要算某个星球的水循环，先把大气压代入 γ 再算；直接套 900 那个数是地球专属。',
  },

  // ══════════════════════════════════════════════════════
  // 无量纲通用：跨世界仍成立
  // ══════════════════════════════════════════════════════
  {
    id: 'kleiber',
    name: '克莱伯定律（代谢率）',
    expr: '70 * M^0.75',
    kind: 'dimensionless',
    bakedIn:
      '指数 0.75 是**无量纲的**（分形输运网络的最优标度），跨物种、跨星球都应成立。' +
      '系数 70 是地球生物的平均标定，会因生物化学不同而变化，但**指数不会**。',
    genericForm: 'BMR = k × M^0.75，k 由该世界的生物化学与体温决定（可覆盖）',
    needsFrom: ['k（该世界的代谢标定）'],
    breaksWhen:
      '若生物不是碳基、或输运网络不是分形（如扩散主导的单细胞尺度），指数会偏离 0.75。' +
      '但对「类似地球的多细胞生命」，0.75 是稳健的。',
    advice:
      '指数直接用 0.75；系数 k 可改（异星生物效率不同）。这是少数**跨世界安全**的经验式。',
  },
  {
    id: 'allometric_dose_scale',
    name: '跨物种剂量换算',
    expr: 'D_human * (W_human / W_animal)^0.75',
    kind: 'dimensionless',
    bakedIn: '0.75 与克莱伯同源（代谢率标度）。同样是无量纲的。',
    genericForm: 'D ∝ W^0.75，与克莱伯一致',
    needsFrom: [],
    breaksWhen:
      '药物代谢的路径（肝/肾/其他）不同会改变指数。0.75 是代谢率的标度，' +
      '不是所有药物的吸收/排泄都按它走（有的是 0.67，即体表面积标度）。',
    advice: '作为量级估算可用；具体药物要实测。跨世界时「同样的药物」未必存在。',
  },
  {
    id: 'hardness_to_yield',
    name: '硬度估屈服强度',
    expr: '3 * H * 9.80665e6',
    kind: 'scalable',
    bakedIn:
      '9.80665e6 = 9.80665 × 1e6，是「kgf/mm² → Pa」的换算，**含地球重力**。' +
      '式子的物理内核是 σy ≈ 3·HB（硬度与强度的经验比例，无量纲）',
    genericForm: 'σy(Pa) = 3 × H(kgf/mm²) × g / 1e-6，g 用该世界重力',
    needsFrom: ['该世界重力 g'],
    breaksWhen: '重力不同时换算系数要变（1.5 g 世界里同样的硬度值对应 1.5 倍 Pa）。',
    advice:
      'σy≈3Ha 这个比例是材料学经验，跨世界大致成立；但单位换算里的 9.8 是地球重力，要注意。',
  },

  // ══════════════════════════════════════════════════════
  // 纯拟合：脱离地球域即失效
  // ══════════════════════════════════════════════════════
  {
    id: 'bmr_mifflin',
    name: '基础代谢率（Mifflin-St Jeor）',
    expr: '10 * m + 6.25 * h - 5 * age + 5',
    kind: 'noscalable',
    bakedIn:
      '四个系数（10 / 6.25 / 5 / 5）都是对**人类样本的线性回归**，没有独立物理含义。',
    breaksWhen:
      '换物种、换重力、换体温，这套系数全失效。而且它是线性的 —— ' +
      '真实代谢是 M^0.75 的幂律（见克莱伯），线性只在人类体重范围内近似。',
    advice:
      '只在「人类、地球重力、常温」下用。异星生物用 Kleiber 形式（BMR = k·M^0.75），' +
      'k 自己定。这两条公式的适用域完全不同，别混。',
  },
  {
    id: 'human_body_surface_area',
    name: '人体表面积（Du Bois）',
    expr: '0.007184 * m^0.425 * h^0.725',
    kind: 'noscalable',
    bakedIn: '0.007184 / 0.425 / 0.725 全部来自人类遗体测量拟合。',
    breaksWhen: '换物种就失效。指数 0.425/0.725 只对人类体型的几何形状成立（近似圆柱+四肢）。',
    advice:
      '异星生物的表面积要按它的几何形状重算（球≈4πr²、圆柱≈2πrL）。' +
      '散热、给药都依赖这个值，别照抄人类系数。',
  },
  {
    id: 'wind_chill',
    name: '风寒指数',
    expr: '13.12 + 0.6215*T - 11.37*v^0.16 + 0.3965*T*v^0.16',
    kind: 'noscalable',
    bakedIn:
      '全部系数来自 2001 年加拿大环境部的**人体皮肤散热实验**，' +
      '隐含了人体表面积、皮肤温度、空气密度与对流换热系数。',
    breaksWhen:
      '换物种（不同体表/体温/毛发）、换大气密度（对流传热系数 h ∝ 密度^0.8）、' +
      '换气压，全都失效。0.1 atm 的稀薄大气里「风寒」几乎不存在。',
    advice:
      '写「体感比实际温度冷多少」时，这个数只对人类、地球大气成立。' +
      '异星要用「对流散热系数」自己推：h ≈ 10·sqrt(v) × (ρ/ρ_earth)^0.8。',
  },
  {
    id: 'heat_index',
    name: '酷热指数',
    expr: '42.379 + 2.04901523*T + 10.14333127*RH - ...',
    kind: 'noscalable',
    bakedIn: 'Rothfusz 回归（1979），基于美国的人体热感觉实验。',
    breaksWhen: '换物种、换湿度范围、换气压都会偏。原式只在 T>26°C、RH>40% 内有效。',
    advice: '同上：只对人类、地球大气。但「湿热比干热难受」这个定性结论跨世界成立。',
  },
  {
    id: 'dew_point_magnus',
    name: '露点温度（Magnus）',
    expr: '243.04*(...)',
    kind: 'noscalable',
    bakedIn:
      '243.04 与 17.625 是**水的**饱和蒸气压拟合常数（Magnus 式），' +
      '它们隐含了水的汽化潜热随温度的变化。',
    breaksWhen:
      '换溶剂（氨、甲烷、硫酸）就完全失效 —— 那是另一套汽化潜热。' +
      '但「露点 = 水汽饱和的温度」这个物理定义跨世界成立，只是常数要换。',
    advice:
      '水世界可直接用。非水溶剂（如土卫六的甲烷湖）要用该溶剂的 Clausius-Clapeyron 常数重推。',
  },
  {
    id: 'max_heart_rate',
    name: '最大心率（估算）',
    expr: '220 - age',
    kind: 'noscalable',
    bakedIn: '220 是 1930 年代的经验观察（后来发现误差极大，个体差异 ±10—15 bpm）。',
    breaksWhen: '换物种即失效（不同体型的心率标度不同：小鼠 600 bpm、大象 30 bpm）。',
    advice: '只对人类粗略估算。异星生物的心率按「代谢率 / 每搏输出量」推。',
  },
  {
    id: 'widmark_bac',
    name: '血液酒精浓度（Widmark）',
    expr: 'A / (r * W) - beta * t',
    kind: 'noscalable',
    bakedIn: 'r（分布容积）与 beta（代谢速率）都是人类肝脏酶动力学的经验值。',
    breaksWhen: '换物种（不同肝酶）、换重力（体液分布不同）都失效。',
    advice: '写「喝了酒多久能开车」只用人类数据。异星生物对酒精的代谢可能完全不同。',
  },
]

/** 按拆解类型分组。 */
export function notesByKind(kind: DecompositionKind): EmpiricalNote[] {
  return EMPIRICAL_NOTES.filter(function (note) { return note.kind === kind })
}

/** 拆解类型的中文说明。 */
export const KIND_LABEL: Record<DecompositionKind, string> = {
  scalable: '可泛化（有物理内核，系数能分解）',
  dimensionless: '无量纲通用（跨世界仍成立）',
  noscalable: '纯拟合（脱离地球域即失效）',
}

/**
 * 查一条公式的经验拆解说明。
 *
 * @param id - 公式 id
 * @returns 说明；没有收录返回 undefined
 */
export function empiricalNoteOf(id: string): EmpiricalNote | undefined {
  return EMPIRICAL_NOTES.find(function (note) { return note.id === id })
}
