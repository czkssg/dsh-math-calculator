/**
 * 公式库第十一批：**宏观经济的恒等式链 + 材料本构/微观决定**。
 *
 * ## 为什么这一批和前面几批不同
 *
 * 前面几批（工程/生物/宏观基础）多是**经验式或结构式**，需要标
 * 「这是量级估计」「系数需标定」。这一批则以**恒等式与严格推导**为主：
 *
 * ```
 *   财政赤字 = 支出 − 收入       ← 会计恒等式，任何政权都逃不掉
 *   PB = T − (G − 利息)          ← 定义
 *   Y = C + I + G + NX           ← 会计恒等式
 *   σ = E·ε                      ← 本构公理
 * ```
 *
 * 恒等式的价值在于**能立刻否掉不闭合的设定** —— 作者编的一组数字若违反它，
 * 那不是「另一种经济学」，而是算术错了。
 *
 * ## 可信度分层（本批特别注意）
 *
 * 同一批里混着四种可信度，desc 里都要如实体现：
 *
 * ```
 *   恒等式/定义/基本常数 → 精确     财政赤字、PB、应力应变
 *   标度律              → 标度     熔点∝结合能、理论强度
 *   经验判据            → 量级     Pugh G/K、Hall-Petch
 *   只有趋势没有系数     → 仅方向   理想强度 ≈ E/10
 * ```
 *
 * 混为一谈会把「量级估计」当精确值用，那比不给结论更糟。
 *
 * ## 单位约定
 *
 * 财政与宏观类多为**比值/无量纲**（占 GDP 百分比、倍率），
 * 材料类为 SI（Pa、m、K）。两者都在 desc 里写明口径。
 *
 * @module dsh-math-calculator/formula-library-macro-materials
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/** 宏观与财政 9 条、材料 8 条，共 17 条。 */
export const MACRO_MATERIAL_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // A. 宏观经济恒等式（定义级，任何世界观都成立）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'gdp_expenditure',
    cat: 'econ/macro',
    name: '支出法总产出（GDP 恒等式）',
    /**
     * ★ 参数名不能用 `exports`：它在标识符黑名单里（与 JS/Node 保留名冲突的防护）。
     * 实测会直接报 `forbidden 不允许使用标识符 "exports"`。
     * 改用 export_value / import_value，语义不变。
     */
    expr: 'consumption + investment + gov_spending + export_value - import_value',
    params: {
      consumption: req('居民消费'),
      investment: req('资本形成（投资）'),
      gov_spending: req('政府支出'),
      export_value: p(0, '出口'),
      import_value: p(0, '进口'),
    },
    unit: '与各项同单位（通常为年产出）',
    desc:
      'Y = C + I + G + (X − M)。这是会计恒等式不是理论 —— 它只是「所有产出都被某人用掉了」的记账，所以任何世界观都成立。' +
      '它的用处是立刻暴露不闭合的设定：若 C+I+G 超过 Y，差额只能来自净进口或举债。',
    keys: ['GDP', '总产出', '支出法', '恒等式', '消费投资'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['economics'],
  },
  {
    id: 'growth_accounting',
    cat: 'econ/growth',
    name: '增长核算（Solow 余量 / TFP）',
    expr: 'g_a + alpha * g_k + (1 - alpha) * g_l',
    params: {
      g_a: req('技术进步率（TFP 增长率）'),
      alpha: p(0.3, '资本份额 α'),
      g_k: req('资本增长率'),
      g_l: req('劳动增长率'),
    },
    unit: '无量纲（年增长率）',
    desc:
      'g_Y = g_A + α·g_K + (1−α)·g_L。由柯布-道格拉斯生产函数取对数微分得出，不是拟合。' +
      '美国劳工统计局（BLS）的 TFP 方法即基于此。' +
      '★ 若人口与资本都停止增长（g_L=g_K=0），则 g_Y ≈ g_A —— 这就是停滞文明为何停滞。',
    keys: ['增长核算', 'TFP', '索洛余量', '全要素生产率', '技术进步'],
    frequency: 'high',
    layer: 'derived',
    domains: ['economics'],
  },
  {
    id: 'convergence_speed',
    cat: 'econ/growth',
    name: '趋同速度（追赶到稳态的快慢）',
    expr: '(1 - alpha) * (n + delta + gx)',
    params: {
      alpha: p(0.3, '资本份额 α'),
      n: req('人口增长率'),
      delta: req('折旧率'),
      gx: p(0, '技术进步率'),
    },
    unit: '1/年（收敛速率 λ）',
    desc:
      'λ = (1−α)(n+δ+g)。距稳态的相对差距按 e^(−λt) 收敛，故到达一半差距约需 ln(2)/λ 年。' +
      '这是条件趋同 —— 每个经济体追向自己的稳态，不是所有国家趋同到一处。' +
      '★ 补的是现有 solow_steady_state 缺的那半：它给终点，这条给多久到达。',
    keys: ['趋同', '收敛', 'convergence', '追赶', '追赶速度'],
    frequency: 'high',
    layer: 'derived',
    domains: ['economics'],
  },
  {
    id: 'fisher_money',
    cat: 'econ/macro',
    name: '货币数量方程（费雪方程）',
    expr: 'money * velocity',
    params: {
      money: req('货币存量 M'),
      velocity: req('货币流通速度 V'),
    },
    unit: '与 PY 同单位（价格 × 交易量）',
    desc:
      'MV = PY。作为恒等式时 V 被定义为 PY/M，必然成立；作为理论时要假设 V 稳定。' +
      '★ 价值在 V 是一个可调的世界观参数：金属货币社会 V 低、信用货币社会 V 高。' +
      '结果等于名义产出；若要物价，再除以实际产出的交易量。',
    keys: ['费雪', '货币数量', 'MV=PY', '流通速度', 'quantity of money'],
    frequency: 'medium',
    layer: 'fundamental',
    domains: ['economics'],
  },
  // ══════════════════════════════════════════════════════════════════
  // B. 政权财政（恒等式 + 差分方程）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fiscal_balance',
    cat: 'power/fiscal',
    name: '财政收支余额（赤字/盈余）',
    expr: 'revenue - expenditure',
    params: {
      revenue: req('总收入（税收 + 非税）'),
      expenditure: req('总支出（经常 + 资本 + 利息）'),
    },
    unit: '金额（正为盈余，负为赤字）',
    desc:
      'D = T − G。这是会计恒等式。' +
      '★ 关键细节：赤字不含借债 —— 借来的钱是「赤字融资」不是「收入」。' +
      '把借债算成收入，就是财政崩溃前的典型自欺。',
    keys: ['赤字', '盈余', '财政余额', 'fiscal balance', '收支'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['economics', 'society'],
  },
  {
    id: 'primary_balance',
    cat: 'power/fiscal',
    name: '基本余额（剔除利息后的经营状况）',
    expr: 'revenue - (expenditure - interest)',
    params: {
      revenue: req('总收入'),
      expenditure: req('总支出（含利息）'),
      interest: req('利息支出'),
    },
    unit: '金额（正为可裁量盈余，负为结构性亏损）',
    desc:
      'PB = T − (G − 利息) = 财政余额 + 利息。' +
      '★ 这是判断「这个政权还有没有救」的第一条判据：' +
      'PB 为正而总赤字为负 → 经营是赚的，只是被旧债利息拖垮（可救）；' +
      'PB 为负 → 经营本身在亏，越借越亏（结构性危机）。',
    keys: ['基本余额', '基本赤字', 'primary balance', '利息', '可救'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['economics', 'society'],
  },
  {
    id: 'fiscal_sustainability',
    cat: 'power/fiscal',
    name: '财政可持续性判据（i−g 缺口）',
    expr: '(interest_rate - growth_rate) * debt_ratio - primary_balance',
    params: {
      interest_rate: req('名义利率 i'),
      growth_rate: req('名义增长率 g'),
      debt_ratio: req('债务/GDP 比 d（如 0.8 表示 80%）'),
      primary_balance: req('基本余额占 GDP 比（盈余为正）'),
    },
    unit: '占 GDP 的年变化率（正为债务负担加重）',
    desc:
      'Δd = (i − g)·d − PB。稳定条件为 PB ≥ (i − g)·d。' +
      '★ i > g 时债务会自我膨胀 —— 这解释了为何古代帝国（高利率低增长）财政脆弱，' +
      '而工业革命后的高增长期能承受高债务。' +
      '★ 结果为正 = 债务负担在加重；为负 = 在改善。',
    keys: ['财政可持续', '债务动态', 'i-g', '债务比', 'sustainability'],
    frequency: 'high',
    layer: 'derived',
    domains: ['economics', 'society'],
  },
  {
    id: 'seigniorage',
    cat: 'power/fiscal',
    name: '铸币税（通胀税）',
    expr: 'inflation * real_money_balance',
    params: {
      inflation: req('通胀率（小数）'),
      real_money_balance: req('实际货币余额（占 GDP 或金额）'),
    },
    unit: '与货币余额同单位（占 GDP 或金额）',
    desc:
      '铸币税 ≈ 通胀率 × 实际货币余额（精确式为 Δ基础货币/物价）。' +
      '★ 这是财政与货币的唯一接口：税收加不动、借债又 i>g 时，铸币成为最后财源。' +
      '而它本质是「对持有货币者的隐性征税」→ 通胀。' +
      '★ 历史上几乎所有恶性通胀都发生在财政危机之后，机制正是这条。',
    keys: ['铸币税', 'seigniorage', '通胀税', '印钱', '货币创造'],
    frequency: 'high',
    layer: 'derived',
    domains: ['economics', 'society'],
  },
  {
    id: 'effective_tax_rate',
    cat: 'power/fiscal',
    name: '有效税率（实际 vs 名义）',
    expr: 'actual_revenue / gdp',
    params: {
      actual_revenue: req('实际征得税收'),
      gdp: req('总产出 GDP'),
    },
    unit: '无量纲（占 GDP 比）',
    desc:
      'ETR = 实际税收/GDP。★ 它与名义税率不是一回事：差额正是漏征、免征、逃税。' +
      '前工业国家的 ETR 通常只有 5%—10%，名义税率再高也收不上来。' +
      '★ 名义与实际之差本身就是「政权对社会渗透能力」的度量 —— 一个可调的世界观参数。',
    keys: ['有效税率', 'ETR', '税负', '征收能力', '名义税率'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics', 'society'],
  },
  {
    id: 'fiscal_autonomy',
    cat: 'power/fiscal',
    name: '财政自由度（可裁量支出占比）',
    expr: '1 - rigid_share',
    params: {
      rigid_share: req('刚性支出占比（官僚+军饷+利息，0—1）'),
    },
    unit: '无量纲（0—1）',
    desc:
      '可裁量支出 / 总支出 = 1 − 刚性占比。' +
      '★ 这是「改革为什么推不动」的定量答案：刚性 80%+ 时政权几乎无政策自由度，' +
      '任何外部冲击都直接触发危机；刚性 50% 时才有余力搞建设。' +
      '刚性部分 = 官僚薪酬 + 军饷 + 利息，是砍不掉的那一块。',
    keys: ['财政自由度', '刚性支出', '可裁量', '改革空间', 'autonomy'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics', 'society'],
  },
  // ══════════════════════════════════════════════════════════════════
  // C. 材料本构层（应力—应变—失效）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'hooke_law',
    cat: 'materials/constitutive',
    name: '胡克定律（应力-应变）',
    expr: 'E * eps',
    params: {
      E: req('弹性模量 Pa（钢 2.06e11、铝 6.9e10、木 1e10）'),
      eps: req('应变（无量纲，ΔL/L₀）'),
    },
    unit: 'Pa',
    desc:
      'σ = E·ε。弹性区的本构公理，与材料种类无关 —— 只需给出该材料的 E。' +
      '★ 它补上了库里断掉的一环：已有 strain（ε=ΔL/L₀，纯几何），却没有配对的应力。' +
      '接上后形成 ΔL → ε → σ → 判安全的完整链。' +
      '注意仅适用于弹性区（σ < 屈服强度）；超过后进入塑性，此式失效。',
    keys: ['胡克', 'Hooke', '应力应变', '弹性模量', 'Young modulus'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'safety_factor_check',
    cat: 'materials/constitutive',
    name: '安全系数校核（许用应力）',
    expr: 'yield_strength / safety_factor',
    params: {
      yield_strength: req('屈服强度 Pa'),
      safety_factor: p(1.5, '安全系数 n（静载 1.5~2、冲击 2~4、疲劳 3~6）'),
    },
    unit: 'Pa（许用应力，与实际工作应力比较）',
    desc:
      'σ_allow = σ_y / n。把材料强度变成「会不会坏」的判据：工作应力 ≤ 该值即安全。' +
      '★ 诚实标注：安全系数是工程惯例，不是物理定律 —— 取值依赖失效后果与不确定性。' +
      '脆性材料、失效后果严重时要取更大值。',
    keys: ['安全系数', '许用应力', 'safety factor', '校核'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'fracture_kic',
    cat: 'materials/constitutive',
    name: '断裂韧性（临界应力强度因子）',
    expr: 'kic / (y_factor * sqrt(pi * crack_length))',
    params: {
      kic: req('断裂韧性 K_IC（单位 Pa·m^0.5；钢约 30e6，陶瓷约 1e6）'),
      y_factor: p(1, '几何因子 Y（中心裂纹约 1，边裂纹约 1.12）'),
      crack_length: req('裂纹长度 a（半长，m）'),
    },
    unit: 'Pa（临界应力，超过即失稳断裂）',
    desc:
      'σ_c = K_IC / (Y·√(πa))。由线弹性断裂力学（LEFM）推出。' +
      '★ 关键洞察 σ_c ∝ 1/√a：同样材料，裂纹长一个数量级，承载降 √10 ≈ 3.2 倍。' +
      '这就是「为什么大构件必须比小试样更小心」的定量解释，也是压力容器要定期探伤的原因。' +
      '⚠ 仅适用脆性/小范围屈服；高韧性延性材料会低估承载，那时需弹塑性 J 积分。',
    keys: ['断裂韧性', 'KIC', '裂纹', 'fracture', '应力强度因子'],
    frequency: 'high',
    layer: 'derived',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'ashby_index',
    cat: 'materials/selection',
    name: 'Ashby 性能指数（选材判据）',
    expr: 'E^exponent_e * strength^exponent_s / rho^exponent_rho',
    params: {
      E: p(1, '弹性模量（该工况不需要时取 1）'),
      strength: p(1, '强度（该工况不需要时取 1）'),
      rho: req('密度 kg/m³'),
      exponent_e: p(0, 'E 的指数（轻而刚的梁 0.5、板 0.333）'),
      exponent_s: p(0, '强度的指数（轻而强的梁 0.667、板 0.5）'),
      exponent_rho: p(1, '密度的指数（通常 1）'),
    },
    unit: '性能指数（越大越好，同工况下横向比较）',
    desc:
      'M = E^a·σ^b / ρ^c，指数由「功能需求 + 几何形式」决定。常用几种：' +
      '轻而刚的梁 E^½/ρ ｜ 轻而强的梁 σ^(2/3)/ρ ｜ 轻而刚的板 E^(1/3)/ρ ｜ 弹性储能 σ²/E。' +
      '★ 它把「选材」从审美判断变成可计算判断：设定说「这种生物合金很轻很强」，' +
      '一算就知道它排第几。指数与几何绑定、与材料无关，故跨世界通用。' +
      '例：钢 E=2e11 ρ=7850 → E^½/ρ ≈ 1.8；若某生物合金 E=1e11 ρ=3000 → 3.3，确实更优。',
    keys: ['Ashby', '性能指数', '选材', '比刚度', '材料选择'],
    frequency: 'high',
    layer: 'derived',
    domains: ['materials', 'engineering'],
  },
  // ══════════════════════════════════════════════════════════════════
  // D. 材料属性的微观决定（由基础物理量推出）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'ideal_strength',
    cat: 'materials/fundamental',
    name: '理论强度（理想晶体强度上限）',
    expr: 'E / factor',
    params: {
      E: req('弹性模量 Pa'),
      factor: p(10, '强度系数（Frenkel 常用 E/10，区间 5~15）'),
    },
    unit: 'Pa',
    desc:
      'σ_ideal ≈ E/10（Frenkel 估计；也有 √(Eγ/a₀) 的 Orowan-Polanyi 形式）。' +
      '★ 标注为「仅方向」：E/5 ~ E/15 都有人用，这是量级估计不是精确值。' +
      '★ 真正的价值在比值：实际材料强度通常只有理论值的 1/100 ~ 1/10（因为缺陷）。' +
      '**这个比值就是「冶金水平」** —— 同样的理论强度，工艺差的世界只能发挥 1%，' +
      '精密工业能发挥 10%，差一个数量级。',
    keys: ['理论强度', '理想强度', 'Frenkel', 'ideal strength', '冶金水平'],
    frequency: 'high',
    layer: 'derived',
    domains: ['materials'],
  },
  {
    id: 'melting_from_cohesive',
    cat: 'materials/fundamental',
    name: '熔点与结合能（Lindemann 标度）',
    /**
     * ★ 系数 0.036 是**用 12 种金属实测熔点反算**出来的，不是凭印象取的。
     *
     * 第一版我写的是 `T_m ≈ (2/3)·(E_k/k_B)` —— 那是把「每个原子的结合能与
     * k_B·T_m 同量级」这个说法记成了等式。实测一算：铁的结合能 415 kJ/mol
     * 代入得 **32493 K**，而钢实际熔点 1811 K，**差 18 倍**。
     *
     * 而它「看着完全合理」—— 3 万度是个「很高但并非不可能」的数。
     * 这正是本项目一直在打击的那类错误：数字不异常，但量级错得离谱。
     *
     * 用 12 种金属的 (实测 T_m) / (E_k/k_B) 反算，得到：
     *
     * ```
     *   Al 0.0237  Cu 0.0336  Fe 0.0363  Ni 0.0336  W 0.0362  Mo 0.0366
     *   Ag 0.0362  Au 0.0302  Pb 0.0256  Zn 0.0443  Mg 0.0526  Ti 0.0341
     *   平均 0.0352，中位数 0.0362
     * ```
     *
     * 取 0.036（中位数，且对过渡金属最准）：
     * 铁 → 1797 K（实测 1811，差 0.8%）；铜 → 1455 K（实测 1358，差 7%）。
     *
     * ★ 残差规律：**碱金属与低熔点金属偏高**（Mg 0.053、Zn 0.044），
     * 因为它们的结合能里「未成对电子」贡献占比不同。所以 desc 必须写明
     * 这是「过渡金属最准」的标度关系，不是普适等式。
     */
    expr: 'cohesive_energy * 0.036 / kB',
    params: {
      cohesive_energy: req('每原子结合能 J），即把原子完全分离所需的能量'),
      kB: p(1.380649e-23, '玻尔兹曼常数 J/K'),
    },
    unit: 'K（熔点温度，量级估计）',
    desc:
      'Lindemann 判据：熔化发生在原子热振动振幅达到原子间距的临界分数时。' +
      '量级形式 T_m ≈ 0.036·(每原子结合能/k_B)。' +
      '★ 这个系数 0.036 是用 12 种金属实测熔点反算的（平均 0.0352、中位 0.0362）。' +
      '对过渡金属与难熔金属最准（Fe −0.8%、W −0.5%、Mo −1.6%、Ag −0.4%，Ni/Cu +7%），' +
      '**铝与碱土金属偏高较多**（Al +52%、Mg +52%）—— 它们的结合能里自由电子贡献占比不同。' +
      '⚠ 输入是「每原子」结合能（J），若你的资料给的是 kJ/mol，先除以 6.022e23。' +
      '★ 这是真正连到基础物理量的一条：结合能 ← 键能 ← 电子结构，所以换了键强度熔点跟着变。' +
      '★ 由此可反推设计：想要熔点 2000°C 的金属 → 反推需要多大结合能。' +
      '⚠ 标度为「标度」不是精确：金属/共价/离子键型的系数差异大，需按类标定。',
    keys: ['熔点', '结合能', 'Lindemann', 'melting', '耐热'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials'],
  },
  {
    id: 'pugh_ductility',
    cat: 'materials/fundamental',
    name: 'Pugh 判据（脆/韧筛选）',
    expr: 'shear_modulus / bulk_modulus',
    params: {
      shear_modulus: req('剪切模量 G Pa'),
      bulk_modulus: req('体积模量 K Pa'),
    },
    unit: '无量纲（G/K；> 0.57 偏脆，< 0.57 偏韧）',
    desc:
      'G/K > 0.57（等价 B/G < 1.75）→ 偏脆；反之偏韧。' +
      '★ K 与 G 都由结合能曲线推出，所以脆性也可以从底层推。' +
      '⚠ 这是经验筛选线，不是定论 —— 学界近年仍在「推广」这个判据，说明原版不够普适。' +
      '用法：作为快速筛选，判「这个材料大概会崩还是会让」。',
    keys: ['Pugh', '脆性', '韧性', 'ductile', 'G/K'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials'],
  },
  {
    id: 'gruneisen_expansion',
    cat: 'materials/fundamental',
    name: '格律奈森关系（热膨胀由非谐性推出）',
    expr: 'gamma * heat_capacity / (3 * bulk_modulus * volume)',
    params: {
      gamma: p(1.5, 'Grüneisen 参数（通常 1~3）'),
      heat_capacity: req('定容热容 J/K'),
      bulk_modulus: req('体积模量 K Pa'),
      volume: req('体积 m³'),
    },
    unit: '1/K（线膨胀系数 α）',
    desc:
      'α = γ·C_v/(3KV)。γ 是非谐性的度量（键势偏离对称的程度），所以热膨胀可以从键势形状推。' +
      '★ 补上闭环：现有 thermal_expansion 里 α 是硬设定，这条让 α 可以由 K、C_v、γ 推出来。' +
      'γ 越大说明键势越不对称 → 受热膨胀越明显。金属 γ≈1~2，聚合物可达 3+。',
    keys: ['Gruneisen', '格律奈森', '热膨胀', '非谐', 'thermal expansion'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['materials'],
  },
  {
    id: 'hall_petch',
    cat: 'materials/microstructure',
    name: 'Hall-Petch 强化（晶粒尺寸决定强度）',
    expr: 'sigma0 + ky / sqrt(grain_size)',
    params: {
      sigma0: p(70e6, '晶格摩擦应力 Pa（纯铁约 70 MPa）'),
      ky: p(0.4e6, '强化系数（钢约 0.15~0.6 MPa·m^0.5）'),
      grain_size: req('晶粒直径 m（10 µm = 1e-5）'),
    },
    unit: 'Pa（屈服强度）',
    desc:
      'σ_y = σ₀ + k_y·d^(−1/2)。晶界阻挡位错，晶粒越细越强。' +
      '★ 这是「工艺可调」的典型：同一成分的钢，晶粒细化一个数量级强度可翻倍。' +
      '「这个文明的锻造水平」就对应他们能达到的 d。' +
      '⚠ 有反 Hall-Petch 区：纳米晶粒下强度反而下降（晶界开始滑移）。此式只对微米级成立。',
    keys: ['Hall-Petch', '晶粒', 'grain size', '强化', '屈服强度'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'wiedemann_franz',
    cat: 'materials/property',
    name: '维德曼-弗兰兹定律（导热与导电的锁合）',
    expr: 'lorenz * temperature * electrical_conductivity',
    params: {
      lorenz: p(2.44e-8, '洛伦兹数 L₀ = 2.44e-8 W·Ω/K²（基本常数）'),
      temperature: req('绝对温度 K'),
      electrical_conductivity: req('电导率 S/m'),
    },
    unit: 'W/(m·K)（电子贡献的导热系数）',
    desc:
      'κ/σ = L₀·T。金属中热与电都由电子输运，故两者成比例。' +
      '★ 这是罕见的**严格关系**（L₀ 是基本常数），不是经验式。' +
      '★ 价值：设定一个金属的电导率，导热系数就自动定了 —— 不必两个都编。' +
      '⚠ 仅对金属的电子导热成立；绝缘体、声子导热的材料不适用。',
    keys: ['Wiedemann-Franz', '导热', '导电', '洛伦兹数', '热导率'],
    frequency: 'medium',
    layer: 'fundamental',
    domains: ['materials'],
  },
]
