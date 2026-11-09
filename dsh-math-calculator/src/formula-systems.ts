/**
 * ## 公式体系（formula systems）
 *
 * 用户要求：「公式也应该搭一个相互联系的逻辑链体系或者因果体系，
 * 不能变成孤立的公式，能连的尽量连。连成一个个体系，
 * 不必强行联成唯一的大体系，而根据需要和必要的类别划分成一个个体系，
 * 体系与体系之间可能因为某一个公式相互连接。」
 *
 * ## 这个模块解决什么问题
 *
 * 513 条公式按 `cat` 分成 73 个分类，但**分类不等于链条**：
 *
 * ```
 *   engineering/thermal  有 boiler_coal_rate、steam_power_output、carnot
 *   但它们之间没有登记「谁的输出喂给谁的输入」
 *   于是使用者拿到 5 条公式，仍然不知道先算哪个、结果怎么往下传
 * ```
 *
 * 所以这里登记三样东西：
 *
 * 1. **体系（system）**：一条推演链，含若干步，每步指定公式与「用什么参数」；
 * 2. **步间的连线（feeds）**：上一步的哪个输出，喂给下一步的哪个参数名；
 * 3. **体系间的连接点（bridges）**：某个公式同时属于两个体系时，登记它把两边接起来。
 *
 * ## 为什么分成多个体系而不是一个大体系
 *
 * 「能连的尽量连」不等于「全部串成一条」。真实推演里：
 *
 * ```
 *   算一座窑 → 能源链（燃料→热量→时间）—— 不需要人口与财政
 *   算一个文明 → 食物链 + 人口链 + 财政链 —— 也不需要窑的具体热损
 * ```
 *
 * 硬串成一条会让每一步都拖上无关参数。所以按**推演目的**分体系，
 * 体系之间只登记真实存在的共用公式（如 `metallurgy_yield` 同时属于
 * 「材料链」与「工业产能链」—— 它既是工艺步骤，也是产能上限的瓶颈项）。
 *
 * ## 数据结构
 *
 * ```ts
 *   { id, name, purpose, steps: [{ id, formula, note, takes?, feeds? }], bridges?: [...] }
 * ```
 *
 * `feeds` 的语义：`{ from: '上一步的公式 id', to: '本步的参数名' }`。
 * 它只是**登记**（供检索与阅读），不自动代算 —— 因为中间值要不要单位换算、
 * 要不要按口径调整，是调用方的事，工具不猜。
 *
 * @module dsh-math-calculator/formula-systems
 */

/** 一步：用哪条公式，产出喂给下一步的谁。 */
export interface ChainStep {
  /** 公式 id。 */
  formula: string;
  /** 这一步做什么（一句话）。 */
  note: string;
  /**
  * 上一步的输出喂进本步的哪个参数。
  *
  * 只登记真实连线 —— 若本步所有参数都由调用方自备，就省略。
  */
  feeds?: Array<{ from: string; to: string }>;
}

/** 一个体系：一条可逐步执行的推演链。 */
export interface FormulaSystem {
  /** 体系 id（检索用）。 */
  id: string;
  /** 中文名。 */
  name: string;
  /** 这个体系回答什么问题 —— 最有用的字段，决定「什么时候想起它」。 */
  purpose: string;
  /** 检索关键词。 */
  keys: string[];
  /** 步骤（按执行顺序）。 */
  steps: ChainStep[];
  /**
  * 与其它体系的连接点。
  *
  * 形如 `{ formula, systems }`：某个公式同时属于哪几个体系。
  * 用于回答「从材料链怎么跳到产能链」。
  */
  bridges?: Array<{ formula: string; toSystem: string; note: string }>;
}

/**
 * 体系登记表。**顺序按「一条推演从物理到社会」排列**，不是按分类字母序。
 *
 * 这个顺序本身有用：读者读到「材料 → 结构 → 能源 → 产能 → 食物 → 人口 → 财政」，
 * 就知道整个世界观可以逐层往外推，而不是面对一堆并列的分类。
 */
export const FORMULA_SYSTEMS: FormulaSystem[] = [
  {
    id: 'sys-material',
    name: '材料链（键强度 → 熔点/模量 → 强度 → 构件）',
    purpose: '「这个世界的材料能做什么」。从键强度出发，一路推到某个构件立不立得住。',
    keys: ['材料链', '键强度', '熔点', '模量', '强度', 'material chain'],
    steps: [
      { formula: 'drying_shrinkage', note: '配料 → 总收缩（决定坯体能不能不裂）' },
      { formula: 'melting_from_cohesive', note: '结合能 → 熔点（耐热上限）' },
      { formula: 'thermal_expansion', note: '热膨胀系数（温差变形与热应力来源，接点自时间链）' },
      { formula: 'ideal_strength', note: '模量 E → 理论强度上限' },
      { formula: 'hall_petch', note: '晶粒尺寸 → 实际屈服强度（理论强度是天花板，这条是工艺能到达的高度）' },
      { formula: 'pugh_ductility', note: 'G/K → 偏脆还是偏韧（决定能不能锻）' },
      { formula: 'ashby_index', note: 'E/强度/密度 → 性能指数（同工况下横向比较，替代「感觉这材料不错」）' },
      { formula: 'hooke_law', note: '给定应力 → 弹性应变' },
      { formula: 'safety_factor_check', note: '屈服强度 → 许用应力（判安全的基准）' },
      { formula: 'beam_bending_stress', note: '弯矩 + 截面 → 实际弯曲应力',
        feeds: [{ from: 'beam_self_weight_moment', to: 'M' }] },
      { formula: 'fracture_kic', note: '裂纹长度 → 临界应力（比屈服更狠的判据）' },
      { formula: 'beam_self_weight_moment', note: '梁自重弯矩（大跨度必须先算）' },
    ],
    bridges: [
      { formula: 'metallurgy_yield', toSystem: 'sys-capacity', note: '材料链算「能不能用」，产能链算「一年能出多少」' },
      { formula: 'hooke_law', toSystem: 'sys-structure', note: '本构参数是结构计算的输入' },
    ],
  },
  {
    id: 'sys-structure',
    name: '结构链（截面 → 惯性矩 → 挠度/屈曲）',
    purpose: '「这根梁/柱要多粗」。算出尺寸，而不是凭经验加厚。',
    keys: ['结构链', '梁', '柱', '挠度', '屈曲', 'structure chain'],
    steps: [
      { formula: 'beam_section_modulus', note: '截面 → 抗弯截面系数 W' },
      { formula: 'hooke_law', note: '材料本构：应变 ↔ 应力（接点自材料链）' },
      { formula: 'rect_inertia', note: '截面 → 惯性矩 I（挠度与屈曲都要它）' },
      { formula: 'beam_self_weight_moment', note: '跨度 + 截面 → 自重弯矩（跨度平方律）' },
      { formula: 'beam_uniform_load_deflection', note: '荷载 + I → 挠度（跨度四次方律）',
        feeds: [{ from: 'rect_inertia', to: 'I' }] },
      { formula: 'buckling_euler', note: 'I + 长度 → 屈曲临界载荷',
        feeds: [{ from: 'rect_inertia', to: 'I' }] },
      { formula: 'bolt_shear_capacity', note: '连接处抗剪（节点常是真正的短板）' },
      { formula: 'beam_center_moment', note: '集中荷载跨中弯矩（与自重弯矩并列）' },
      { formula: 'beam_center_deflection', note: '集中荷载跨中挠度' },
      { formula: 'wood_beam_moment_capacity', note: '木梁按材质强度反算能承受多少弯矩' },
      { formula: 'hoop_stress', note: '环形截面（管/筒）的环向应力' },
      { formula: 'thermal_stress', note: '温差引起的约束应力（与材料线膨胀系数联动）' },
      { formula: 'column_axial_capacity', note: '墙柱轴压承载（接点自建筑链）' },
      { formula: 'impact_speed_freefall', note: '落地冲击速度（抗冲击设计要接住它，接点自交通链）' },
    ],
  },
  {
    id: 'sys-energy',
    name: '能源链（燃料 → 热量 → 时间 → 能耗）',
    purpose: '「这窑/这炉要烧多少料、烧多久」。把工艺参数接到燃料消耗上。',
    keys: ['能源链', '窑炉', '燃料', '热平衡', '煤耗', 'energy chain'],
    steps: [
      { formula: 'combustion_energy', note: '燃料质量 × 热值 → 总放热' },
      { formula: 'furnace_efficiency', note: '烟气/炉壁/不完全燃烧三种损失 → 有效热比例' },
      { formula: 'kiln_heat_balance', note: '坯体热 + 窑体损 → 一次烧成总耗热' },
      { formula: 'kiln_firing_time', note: '升温幅度 → 工期（受热应力限制）' },
      { formula: 'wall_heat_loss', note: '围护面积 + R 值 → 维持热损' },
      { formula: 'boiler_coal_rate', note: '功率 → 每小时耗煤（热机场景）' },
      { formula: 'thermal_efficiency_carnot', note: '温度比 → 效率上限（判断热机天花板）' },
      { formula: 'heat_conduction_slab', note: '板材导热（接点自气候链）' },
      { formula: 'pump_power', note: '泵功耗（灌溉的隐藏能耗，接点自水利链）' },
      { formula: 'fick_diffusion', note: '扩散通量（与燃烧供能同一类输运上限，接点自生物链）' },
      { formula: 'steam_power_output', note: '蒸汽流量 + 焓差 → 输出功率' },
      { formula: 'conduction_wall_loss', note: '平壁导热损失（保温效果的定量）' },
      { formula: 'wind_power_available', note: '风速三次方 → 风功率上限' },
      { formula: 'water_turbine_power', note: '水头 + 流量 → 水电功率' },
    ],
    bridges: [
      { formula: 'wall_heat_loss', toSystem: 'sys-structure', note: '围护结构的 R 值来自结构与保温设计' },
      { formula: 'thermal_efficiency_carnot', toSystem: 'sys-capacity', note: '热机效率决定「有多少功可用」，进而决定产能' },
    ],
  },
  {
    id: 'sys-capacity',
    name: '产能链（矿 → 金属 → 工时 → 年产量）',
    purpose: '「一个人/一群人一年能造出多少」。找那条先撞天花板的链。',
    keys: ['产能链', '产量', '收得率', '工时', '瓶颈', 'capacity chain'],
    steps: [
      { formula: 'metallurgy_yield', note: '矿石 × 品位 × 回收率 → 金属产出' },
      { formula: 'case_depth', note: '渗碳温度/时间 → 硬化层（决定工具耐用度）' },
      { formula: 'quench_hardness', note: '含碳量 → 可达硬度上限（判断「这把刀能不能硬」）' },
      { formula: 'sintering_porosity', note: '烧结温度/时间 → 孔隙率（陶与瓷的分界）' },
      { formula: 'drying_shrinkage', note: '配料 → 总收缩（掺熟料减收缩，控开裂）' },
      { formula: 'distillation_enrichment', note: '单级蒸馏富集倍数（判断要几块塔板）' },
      { formula: 'crystallization_yield', note: '冷却结晶收率（硝石/海盐提纯）' },
      { formula: 'payback_period', note: '投资回本期（这项工艺改造值不值得做）' },
      { formula: 'gear_geometry', note: '模数 + 齿数 → 传动件尺寸' },
      { formula: 'gear_bending_strength', note: '传动件尺寸 → 能不能承受扭矩',
        feeds: [{ from: 'gear_geometry', to: 'gear_module' }] },
      { formula: 'water_turbine_output', note: '水头 + 流量 → 可用动力（产能的动力上限）' },
      { formula: 'thermal_efficiency_carnot', note: '热机效率上限（决定动力产能的天花板，接点自能源链）' },
      { formula: 'labor_force', note: '劳力 = 人口 × 参与率（接点自食物链）' },
      { formula: 'food_surplus_ratio', note: '食物剩余率（决定多少人能脱产做工，接点自食物链）' },
      { formula: 'feed_conversion_ratio', note: '料肉比（养殖的转化效率，决定肉食成本）' },
      { formula: 'livestock_growth_time', note: '出栏周期（养殖产能的时间约束）' },
      { formula: 'gdp_from_labor', note: '劳动力 × 人均产出 → 总产出',
        feeds: [{ from: 'labor_force', to: 'labor' }] },
    ],
    bridges: [
      { formula: 'labor_force', toSystem: 'sys-food', note: '劳力从人口来，人口从食物来' },
      { formula: 'gdp_from_labor', toSystem: 'sys-fiscal', note: '总产出是征税的税基' },
    ],
  },
  {
    id: 'sys-food',
    name: '食物链（积温 → 单产 → 总产 → 能养多少人）',
    purpose: '「这块地能养多少人」。四季节奏与人口上限的定量链。',
    keys: ['食物链', '积温', '单产', '粮食', '人口上限', 'food chain'],
    steps: [
      { formula: 'q10_temperature', note: '温度 → 生长/发酵速率（四季节奏的速率项，积温是它的时间积分）' },
      { formula: 'gdd_accumulated', note: '无霜期 → 一季能攒多少积温（能种什么）' },
      { formula: 'crop_yield_npp', note: 'NPP + 收获指数 → 可收获干物质' },
      { formula: 'grain_yield_total', note: '面积 × 单产 → 粮食总产' },
      { formula: 'population_fed_by_grain', note: '粮食 → 能养多少人',
        feeds: [{ from: 'grain_yield_total', to: 'grain_kg' }] },
      { formula: 'food_surplus_ratio', note: '总产 − 自耗 → 剩余率（决定能不能脱产）' },
      { formula: 'growing_degree_days', note: '单日积温（与累计积温配套：判断某一天够不够长' },
      { formula: 'crop_total_yield', note: '面积 × 单产 → 作物总产（与粮食总产并列的口径）' },
      { formula: 'population_fed', note: '作物总产 → 能养人口（另一种口径的同一判断）' },
      { formula: 'food_energy_supply', note: '食物 → 能量供给（换算成热量口径）' },
      { formula: 'livestock_feed_need', note: '牲畜存栏 → 饲料需求（与人争粮的量化）' },
      { formula: 'harvest_labor_days', note: '收获所需工日（农忙的人力峰值）' },
      { formula: 'basal_metabolic_rate', note: '每人的口粮下限（代谢决定吃多少，接点自生物链）' },
      { formula: 'metabolic_generic', note: '代谢率（可换系数，接点自生理链）' },
      { formula: 'grazing_capacity', note: '副产：草地能载多少畜' },
      { formula: 'irrigation_volume', note: '灌溉需水量（决定单产上限，接点自水利链）' },
      { formula: 'soil_nutrient_balance', note: '连作 N 年后的地力库存（能不能持续）' },
      { formula: 'nutrient_sustainable_input', note: '令地力不降的最低年投入（决定休耕周期）' },
      { formula: 'labor_force', note: '劳力（人口 × 参与率）—— 与产能链共用' },
      { formula: 'trophic_chain_support', note: '副产：营养级能支撑多少肉食量' },
      { formula: 'logistic_growth_rate', note: '剩余空间 → 每年真正多出多少个体（N=K/2 时最快）' },
      { formula: 'sustainable_harvest', note: '年增量峰值 → 长期可拿走的猎获上限（MSY）' },
    ],
    bridges: [
      { formula: 'food_surplus_ratio', toSystem: 'sys-capacity', note: '剩余率决定有多少人可以不种地而做工' },
      { formula: 'population_fed_by_grain', toSystem: 'sys-fiscal', note: '人口既是劳力也是税源' },
    ],
  },
  {
    id: 'sys-body',
    name: '生物链（体型 → 面积 → 供氧 → 代谢上限）',
    purpose: '「这么大的生物能不能活」。从几何约束推到生理瓶颈。',
    keys: ['生物链', '巨兽', '异速生长', '供氧', '扩散', 'body chain'],
    steps: [
      { formula: 'sa_volume_ratio', note: '体重 → 表面积（单位体重散热与摄氧的起点）' },
      { formula: 'basal_metabolic_rate', note: '体重 → 基础代谢（产热与耗氧的总量）' },
      { formula: 'fick_diffusion', note: '面积 + 屏障厚度 → 能透进多少氧',
        feeds: [{ from: 'sa_volume_ratio', to: 'area' }] },
      { formula: 'diffusion_time', note: '尺寸 → 纯扩散够不够快（否掉无循环方案）' },
      { formula: 'peclet_number', note: '流速 → 对流是否必需（决定要不要循环）' },
      { formula: 'michaelis_menten', note: '携氧是饱和式 → 浓度再高也提不上去' },
      { formula: 'gompertz_growth', note: '生长必然饱和 → 有上限体型' },
    ],
    bridges: [
      { formula: 'basal_metabolic_rate', toSystem: 'sys-food', note: '代谢率决定每个个体要吃多少，进而决定能养多少' },
      { formula: 'fick_diffusion', toSystem: 'sys-energy', note: '供氧上限与燃烧供能是同一类「输运上限」问题' },
    ],
  },
  {
    id: 'sys-time',
    name: '时间与精度链（摆长 → 走时 → 校准）',
    purpose: '「这个文明的时间精度到哪一档」。钟表、历法、观测的定量基础。',
    keys: ['时间链', '摆钟', '精度', '走时', '校准', 'time chain'],
    steps: [
      { formula: 'pendulum_period', note: '摆长 → 周期（所有摆钟的基准）' },
      { formula: 'pendulum_clock_drift', note: '热膨胀/重力变化 → 每天快慢多少' },
      { formula: 'thermal_expansion', note: '温差 → 摆长变化（漂移的物理源头）' },
      { formula: 'gear_geometry', note: '齿数组合 → 传动比（把秒送到分针时针）' },
    ],
    bridges: [
      { formula: 'gear_geometry', toSystem: 'sys-capacity', note: '齿轮既是钟表件也是产能件' },
      { formula: 'thermal_expansion', toSystem: 'sys-material', note: '热膨胀系数来自材料，是材料链的外延' },
    ],
  },
  {
    id: 'sys-fiscal',
    name: '财政链（税基 → 征管 → 赤字 → 债务 → 铸币）',
    purpose: '「这个政权还能撑多久」。从税源一路推到崩溃可能。',
    keys: ['财政链', '税收', '赤字', '债务', '崩溃', '铸币', 'fiscal chain'],
    steps: [
      { formula: 'labor_force', note: '劳力 = 人口 × 参与率（接点自食物链/产能链）' },
      { formula: 'gdp_from_labor', note: '劳力 → 总产出（税基）',
        feeds: [{ from: 'labor_force', to: 'labor' }] },
      { formula: 'effective_tax_rate', note: '实际税收/GDP → 政权真实征管能力',
        feeds: [{ from: 'gdp_from_labor', to: 'gdp' }] },
      { formula: 'growth_accounting', note: '增长率（债务可持续判据的 g 参数，接点自增长链）' },
      { formula: 'fiscal_balance', note: '收入 − 支出 → 赤字' },
      { formula: 'primary_balance', note: '剔除利息 → 经营本身盈亏（判「有没有救」）' },
      { formula: 'fiscal_autonomy', note: '刚性支出占比 → 还有多少政策空间' },
      { formula: 'fiscal_sustainability', note: 'i−g 缺口 → 债务负担每年涨多少' },
      { formula: 'seigniorage', note: '税收加不动又借不到 → 只能印钱（死亡螺旋的终点）' },
      { formula: 'population_fed_by_grain', note: '人口规模（税源基础，接点自食物链）' },
      { formula: 'fiscal_burden_ratio', note: '军费/财政收入（历史上最常见的崩溃触发点，接点自军事链）' },
      { formula: 'admin_radius_from_info', note: '行政半径（决定征管成本，接点自信息链）' },
      { formula: 'simple_interest', note: '国债利息（财政刚性支出项，接点自金融链）' },
    ],
    bridges: [
      { formula: 'gdp_from_labor', toSystem: 'sys-growth', note: '产出是增长的起点，也是税基' },
      { formula: 'seigniorage', toSystem: 'sys-growth', note: '铸币引起通胀，直接进入增长核算的实际口径' },
    ],
  },
  {
    id: 'sys-growth',
    name: '增长链（产出 → 储蓄 → 资本 → 增长/趋同）',
    purpose: '「这个文明会变富还是停滞」。增长从哪来、追赶上要多久。',
    keys: ['增长链', 'GDP', '储蓄', '资本', '趋同', 'TFP', 'growth chain'],
    steps: [
      { formula: 'gdp_expenditure', note: 'C+I+G+NX → 总产出（检查设定是否闭合）' },
      { formula: 'macro_savings_rate', note: '产出 × 储蓄率 → 可投资额' },
      { formula: 'capital_output_ratio', note: '储蓄率/增长率 → 所需资本产出比（判目标现不现实）' },
      { formula: 'growth_accounting', note: '技术+资本+劳动 → 增长率拆解（停滞文明为何停滞）' },
      { formula: 'convergence_speed', note: '追赶速度 → 落后文明多久追上' },
      { formula: 'fisher_money', note: 'M·V → 名义产出（检查货币与产出是否匹配）' },
      { formula: 'money_supply_from_base', note: '基础货币 × 乘数 → 广义货币' },
      { formula: 'inflation_from_money_growth', note: '货币增速 − 产出增速 → 通胀压力' },
      { formula: 'seigniorage', note: '铸币税（印钱补赤字，其代价是通胀，接点自财政链）' },
    ],
    bridges: [
      { formula: 'growth_accounting', toSystem: 'sys-fiscal', note: '增长率 g 是债务可持续判据的关键参数' },
    ],
  },
  {
    id: 'sys-building',
    name: '建筑链（荷载 → 构件 → 围护 → 材料用量）',
    purpose: '「这栋房子怎么盖」。从屋顶荷载算到砖要多少块。',
    keys: ['建筑链', '房屋', '砖', '屋顶', '烟囱', 'building chain'],
    steps: [
      { formula: 'roof_load', note: '屋顶面积 + 荷载 → 传到墙的总荷载' },
      { formula: 'column_axial_capacity', note: '墙/柱截面 → 抗压承载' },
      { formula: 'window_heat_loss', note: '窗面积 → 冬季热损' },
      { formula: 'wall_heat_loss', note: '围护总面积 + R 值 → 总热损' },
      { formula: 'chimney_draft', note: '烟囱高 + 温差 → 抽力（决定炉子好不好烧）' },
      { formula: 'brick_count', note: '墙体体积 → 需要多少砖（备料与工期）' },
      { formula: 'water_tower_pressure', note: '水塔高差 → 出水压力' },
    ],
    bridges: [
      { formula: 'wall_heat_loss', toSystem: 'sys-energy', note: '围护热损直接决定取暖燃料消耗' },
      { formula: 'column_axial_capacity', toSystem: 'sys-structure', note: '墙柱承载与梁柱计算同源' },
    ],
  },
  {
    id: 'sys-climate',
    name: '气候链（温湿 → 体感 → 散热 → 结露）',
    purpose: '「这里冷不冷、湿不湿、会不会结露」。',
    keys: ['气候链', '体感', '风寒', '湿度', '结露', '散热', 'climate chain'],
    steps: [
      { formula: 'wind_chill', note: '气温 + 风速 → 体感温度' },
      { formula: 'heat_index', note: '气温 + 湿度 → 湿热体感' },
      { formula: 'dew_point_magnus', note: '温湿 → 露点（低于它就会结露）' },
      { formula: 'cooling_newton', note: '温差 → 物体降温速率' },
      { formula: 'heat_conduction_slab', note: '板材导热 → 通过壁面的热流' },
      { formula: 'thermal_time_constant', note: '热容/热阻 → 温度响应时间（多久能烤热）' },
      { formula: 'inverse_square_flux', note: '恒星辐射通量（地表温度的第一驱动，接点自天文链）' },
    ],
    bridges: [
      { formula: 'heat_conduction_slab', toSystem: 'sys-energy', note: '导热是窑炉与保温的共同物理' },
    ],
  },
  {
    id: 'sys-travel',
    name: '交通与投射链（速度 → 距离 → 命中）',
    purpose: '「走得到吗、打得准吗」。航行、行军、投射物的定量检验。',
    keys: ['交通链', '航速', '射程', '弹道', '刹车', 'travel chain'],
    steps: [
      { formula: 'hull_speed', note: '船长 → 理论航速（Froude 数决定能不能破浪）' },
      { formula: 'mach_number', note: '速度 → 马赫数（判断激波与阻力突变）' },
      { formula: 'projectile_range_vacuum', note: '初速 + 抛射角 → 真空射程' },
      { formula: 'projectile_apex_height', note: '初速 → 最高点（越过城墙的判断）' },
      { formula: 'stopping_distance', note: '速度 + 摩擦 → 刹车距离' },
      { formula: 'impact_speed_freefall', note: '落差 → 落地速度（坠落的真实后果）' },
      { formula: 'ram_momentum', note: '撞击动量（撞木等攻城器械，接点自军事链）' },
    ],
    bridges: [
      { formula: 'impact_speed_freefall', toSystem: 'sys-structure', note: '落地冲击力要用结构强度去接' },
    ],
  },
  {
    id: 'sys-military',
    name: '军事链（兵员 → 补给 → 攻城 → 财政负担）',
    purpose: '「这支军队能打多久」。把军事行动接到后勤与财政上。',
    keys: ['军事链', '行军', '补给', '攻城', '军费', 'military chain'],
    steps: [
      { formula: 'march_days', note: '距离 + 日行军 → 到达天数' },
      { formula: 'army_supply_days', note: '携带粮草 → 能撑几天（决定作战半径）' },
      { formula: 'formation_frontage', note: '兵员 + 队形 → 正面宽度' },
      { formula: 'ram_momentum', note: '撞木质量 + 速度 → 冲击动量' },
      { formula: 'trebuchet_range_estimate', note: '配重 + 臂长 → 投射距离' },
      { formula: 'army_pay_cost', note: '兵员 × 年饷 → 军费' },
      { formula: 'fiscal_burden_ratio', note: '军费/财政收入 → 打不打得起' },
    ],
    bridges: [
      { formula: 'fiscal_burden_ratio', toSystem: 'sys-fiscal', note: '军费占比是财政链历史上最常见的崩溃触发点' },
      { formula: 'ram_momentum', toSystem: 'sys-travel', note: '投射与撞击共用弹道物理' },
    ],
  },
  {
    id: 'sys-info',
    name: '信息与治理链（传播速度 → 行政半径 → 统治上限）',
    purpose: '「这个帝国最远能管到哪」。信息传递速度决定行政边界。',
    keys: ['信息链', '行政半径', '治理', '传令', 'info chain'],
    steps: [
      { formula: 'info_delivery_time', note: '距离 + 传递方式 → 单程耗时' },
      { formula: 'admin_radius_from_info', note: '往返可接受时间 → 有效统治半径' },
      { formula: 'diffusion_s_curve', note: '技术渗透 → 推广到半数要多久' },
    ],
    bridges: [
      { formula: 'admin_radius_from_info', toSystem: 'sys-fiscal', note: '统治半径决定征管成本，进而决定有效税率' },
    ],
  },

  {
    id: 'sys-water',
    name: '水利链（取水 → 管路 → 蓄水 → 灌溉）',
    purpose: '「水从哪来、怎么送到地里」。管路损失与蓄压是这条链的核心。',
    keys: ['水利链', '水管', '水头', '泵', '灌溉', 'water chain'],
    steps: [
      { formula: 'pipe_flow_rate', note: '流速 + 管径 → 输送流量' },
      { formula: 'darcy_head_loss', note: '管长 + 管径 + 流速 → 沿程水头损失' },
      { formula: 'pump_power', note: '流量 + 水头 → 泵功率（把水送上去的代价）' },
      { formula: 'water_tower_pressure', note: '水塔高差 → 出水压力（免泵的重力方案）' },
      { formula: 'irrigation_volume', note: '面积 + 灌水深度 → 一次灌溉需水量' },
      { formula: 'daily_water_need', note: '人口 × 日需 → 生活用水总量' },
    ],
    bridges: [
      { formula: 'pump_power', toSystem: 'sys-energy', note: '泵的功耗要计入总能耗（灌溉的隐藏成本）' },
      { formula: 'irrigation_volume', toSystem: 'sys-food', note: '灌溉量决定单产上限' },
    ],
  },
  {
    id: 'sys-finance',
    name: '金融链（借贷 → 还款 → 贴现 → 购买力）',
    purpose: '「这笔钱值不值得借/投」。跨期决策的定量基础。',
    keys: ['金融链', '利息', '还款', '贴现', '购买力', 'finance chain'],
    steps: [
      { formula: 'simple_interest', note: '本金 + 利率 + 期数 → 单利终值（古代借贷）' },
      { formula: 'compound_growth_time', note: '利率 → 翻倍所需年数（复利的威力）' },
      { formula: 'loan_payment', note: '本金 + 利率 + 期数 → 每期还款额' },
      { formula: 'npv_simple', note: '未来现金流 → 折现到今天（判断值不值得投）' },
      { formula: 'purchasing_power', note: '通胀 + 年限 → 未来购买力（钱会变毛多少）' },
    ],
    bridges: [
      { formula: 'simple_interest', toSystem: 'sys-fiscal', note: '国债利息支出是财政链的刚性项' },
    ],
  },
  {
    id: 'sys-astronomy',
    name: '天文链（恒星 → 光度 → 宜居带 → 表面环境）',
    purpose: '「这颗星能给行星什么」。架空星系的第一层推演。',
    keys: ['天文链', '恒星', '宜居带', '光照', 'astronomy chain'],
    steps: [
      { formula: 'main_sequence_lifetime', note: '恒星质量 → 主序寿命（这个文明有多少年）' },
      { formula: 'inverse_square_flux', note: '光度 + 距离 → 行星接收到的辐射通量' },
      { formula: 'habitable_zone_generic', note: '光度 → 宜居带范围（液态水可能在哪）' },
    ],
    bridges: [
      { formula: 'inverse_square_flux', toSystem: 'sys-climate', note: '辐射通量是地表温度的第一驱动' },
    ],
  },
  {
    id: 'sys-physiology',
    name: '生理链（体型 → 血容量 → 需水 → 缺水量）',
    purpose: '「这具身体要多少资源」。人形生物的补给需求推算。',
    keys: ['生理链', '血容量', '需水', '脱水', '剂量', 'physiology chain'],
    steps: [
      { formula: 'metabolic_generic', note: '体重 → 代谢率（能量需求的根）' },
      { formula: 'blood_volume_estimate', note: '体重 → 血容量（失血耐受的基准）' },
      { formula: 'daily_water_need', note: '体重/代谢 → 每日需水' },
      { formula: 'fluid_deficit', note: '已失水量 → 补水缺口' },
      { formula: 'drug_dose_by_weight', note: '体重 → 给药量（毒物的实际威胁）' },
    ],
    bridges: [
      { formula: 'metabolic_generic', toSystem: 'sys-food', note: '代谢率决定个体口粮，进而决定人口上限' },
      { formula: 'daily_water_need', toSystem: 'sys-water', note: '生活用水是水利链的固定负载' },
    ],
  },
]

/**
 * 按 id 取体系。
 *
 * @param id - 体系 id（也接受中文名与关键词）
 * @returns 体系定义；找不到返回 undefined
 */
export function findSystem(id: string): FormulaSystem | undefined {
  const needle = id.trim().toLowerCase()
  if (needle === '') return undefined
  const direct = FORMULA_SYSTEMS.find(function (system) { return system.id.toLowerCase() === needle })
  if (direct) return direct
  return FORMULA_SYSTEMS.find(function (system) {
    return system.name.toLowerCase().includes(needle) ||
      system.keys.some(function (key) { return key.toLowerCase() === needle })
  })
}

/**
 * 某条公式出现在哪些体系里。
 *
 * 这是「体系之间因为某一个公式相互连接」的查询入口：
 * 问「`metallurgy_yield` 属于哪几条链」→ 返回材料链与产能链，
 * 于是使用者知道可以从一条链跳到另一条。
 *
 * @param formulaId - 公式 id
 * @returns 体系列表（可能为空）
 */
/**
 * 某条公式出现在哪些体系里。
 *
 * 两种归属都算：
 *   · 作为链上的一步（`steps`）
 *   · 作为体系间的接点（`bridges`）—— 后者更重要，它才是「体系之间靠它连接」
 *
 * 踩过：第一版只查 `steps`，于是 `metallurgy_yield` 只显示「产能链」，
 * 而它在材料链里明确登记为接点 —— **接点关系被漏掉，正是用户要的那个信息**。
 *
 * @param formulaId - 公式 id
 * @returns 体系列表（可能为空）
 */
export function systemsOfFormula(formulaId: string): FormulaSystem[] {
  return FORMULA_SYSTEMS.filter(function (system) {
    const isStep = system.steps.some(function (step) { return step.formula === formulaId })
    const isBridge = (system.bridges ?? []).some(function (bridge) { return bridge.formula === formulaId })
    return isStep || isBridge
  })
}
