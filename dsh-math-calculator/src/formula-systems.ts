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
      { formula: 'wall_heat_loss', note: '围护热损也算一种「荷载」：R 值与截面一样是被查的约束（接点自能源链）' },
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
      { formula: 'refrigeration_cop_real', note: '冷热温差 → 制冷搬热的实际效率（空调比冰箱省电的原因）' },
      { formula: 'heat_pump_cop', note: '供暖 COP = 制冷 COP + 1（为什么比电暖器省）' },
      { formula: 'thermal_storage_capacity', note: '介质质量与温差 → 能蓄多少热（一夜保温要多大水池）' },
      { formula: 'heat_conduction_slab', note: '板材导热（接点自气候链）' },
      { formula: 'pump_power', note: '泵功耗（灌溉的隐藏能耗，接点自水利链）' },
      { formula: 'fick_diffusion', note: '扩散通量（与燃烧供能同一类输运上限，接点自生物链）' },
      { formula: 'steam_power_output', note: '蒸汽流量 + 焓差 → 输出功率' },
      { formula: 'conduction_wall_loss', note: '平壁导热损失（保温效果的定量）' },
      { formula: 'stefan_boltzmann', note: '高温端的辐射散热（T⁴，窑炉与炉膛都逃不掉；接点自量子链）' },
      { formula: 'rc_cutoff_frequency', note: '控制/滤波电路的带宽（电子时代的能耗项，接点自信息控制链）' },
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
      { formula: 'distillation_min_stages', note: '给定纯度与 α → 最少理论板数（分离难度的指数墙）' },
      { formula: 'crystallization_yield', note: '冷却结晶收率（硝石/海盐提纯）' },
      { formula: 'crystallization_supersaturation', note: '过饱和度决定晶粒大小（想要大晶体必须慢）' },
      { formula: 'reactor_residence_time', note: '产量与停留时间 → 反应器要多大（放大第一步）' },
      { formula: 'reactor_conversion_first_order', note: '停留时间 → 能转掉多少（最后几个百分点最贵）' },
      { formula: 'mass_transfer_rate', note: '传质速率 → 分离设备能多小' },
      { formula: 'payback_period', note: '投资回本期（这项工艺改造值不值得做）' },
      { formula: 'gear_geometry', note: '模数 + 齿数 → 传动件尺寸' },
      { formula: 'gear_bending_strength', note: '传动件尺寸 → 能不能承受扭矩',
        feeds: [{ from: 'gear_geometry', to: 'gear_module' }] },
      { formula: 'water_turbine_output', note: '水头 + 流量 → 可用动力（产能的动力上限）' },
      { formula: 'thermal_efficiency_carnot', note: '热机效率上限（决定动力产能的天花板，接点自能源链）' },
      { formula: 'rankine_efficiency', note: '蒸汽循环的真实效率（不是卡诺那个上限）' },
      { formula: 'otto_efficiency', note: '内燃机效率（只由压缩比决定 → 与蒸汽机是两条技术树）' },
      { formula: 'brayton_efficiency', note: '燃气轮机效率（压比决定，功率密度高一个数量级）' },
      { formula: 'combined_cycle_efficiency', note: '燃机+汽机串联 → 60% 效率（不是相加，是榨干废热）' },
      { formula: 'labor_force', note: '劳力 = 人口 × 参与率（接点自食物链）' },
      { formula: 'food_surplus_ratio', note: '食物剩余率（决定多少人能脱产做工，接点自食物链）' },
      { formula: 'feed_conversion_ratio', note: '料肉比（养殖的转化效率，决定肉食成本）' },
      { formula: 'livestock_growth_time', note: '出栏周期（养殖产能的时间约束）' },
      { formula: 'gdp_from_labor', note: '劳动力 × 人均产出 → 总产出',
        feeds: [{ from: 'labor_force', to: 'labor' }] },
      { formula: 'eoq', note: '备料批量（库存资金占用，接点自排队链）' },
      { formula: 'reliability_series', note: '多环节良率相乘 → 总成品率（工序越多越脆，接点自决策链）' },
      { formula: 'mtbf_availability', note: '设备可用度（直接折损年产量，接点自排队链）' },
      { formula: 'spares_required', note: '备件年需求（隐性产能成本，接点自决策链）' },
      { formula: 'channel_capacity', note: '通信上限（能协调多大生产组织，接点自信息控制链）' },
      { formula: 'fission_energy_per_mass', note: '若有核燃料，能源约束彻底改写（接点自量子链）' },
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
      { formula: 'drying_time', note: '含水率 → 入仓前要晾多少天（没干透就入仓，后面全发霉）' },
      { formula: 'storage_loss', note: '存 t 年还剩多少（总产 ≠ 可吃量，中间这一段最容易被忽略）' },
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
      { formula: 'tolerance_stack', note: '单件公差 → 装配公差（精度链条的终点：能不能造出这个钟）' },
      { formula: 'wien_displacement', note: '发光颜色 → 温度（光学高温计的原理，接点自量子链）' },
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
      { formula: 'nash_bargaining_split', note: '停战议和/税收谈判的分成（接点自决策链）' },
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
      { formula: 'gdp_from_labor', note: '劳力 × 人均产出 → 总产出（增长的起点，也是税基；接点自财政/产能链）' },
      { formula: 'gdp_expenditure', note: 'C+I+G+NX → 总产出（另一口径：检查设定是否闭合）' },
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
      { formula: 'reynolds_transition', note: '特征尺寸 → 流态（1mm 的虫与 100m 的船是两个世界）' },
      { formula: 'drag_force', note: '迎风面积 → 压力阻力（∝v²，高速时主导）' },
      { formula: 'viscous_drag_stokes', note: '低速粘性阻力（∝v，与上一条是两种机制）' },
      { formula: 'lift_force', note: '翼面积与速度 → 升力（能不能飞起来）' },
      { formula: 'wing_loading_stall_speed', note: '翼载 → 失速速度（飞多慢会掉下来）' },
      { formula: 'lift_to_drag_ratio', note: '升阻比 → 航程效率（极大值决定飞多远）' },
      { formula: 'mach_number', note: '速度 → 马赫数（判断激波与阻力突变）' },
      { formula: 'mach_angle', note: '马赫数 → 激波锥半角（音爆的来源）' },
      { formula: 'wave_drag_coefficient', note: '越过临界马赫 → 波阻立方律暴涨（音障的真相）' },
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
      { formula: 'bayes_posterior', note: '情报判读：看到这个迹象后敌人真来的概率（接点自决策链）' },
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
      { formula: 'expected_value_decision', note: '这笔投资的期望净收益（接点自决策链）' },
    ],
    bridges: [
      { formula: 'simple_interest', toSystem: 'sys-fiscal', note: '国债利息支出是财政链的刚性项' },
    ],
  },
  {
    id: 'sys-info-control',
    name: '信息与控制链（带宽 → 传输 → 采样 → 反馈校准）',
    purpose: '「这个文明能传多远、能控多准」。从信道容量一路推到自动调节的稳定性上限。',
    keys: ['信息链', '控制链', '信道', '采样', '反馈', '带宽', 'cybernetics', 'information chain'],
    steps: [
      { formula: 'shannon_hartley_bits', note: '一个符号带多少信息（编码的起点）' },
      { formula: 'channel_capacity', note: '带宽与信噪比 → 这条线的传输上限（物理天花板，不可超越）' },
      { formula: 'signal_to_noise_db', note: 'dB 与倍数互换（所有工程参数的共通语言）' },
      { formula: 'shannon_limit_min_snr', note: '要这么高的频谱效率，最少需要多少信噪比' },
      { formula: 'path_loss_freespace', note: '距离与频率 → 传到那里还剩多少（决定要不要中继）' },
      { formula: 'fresnel_zone_radius', note: '要清出多大的管道（天线/塔该架多高）' },
      { formula: 'nyquist_rate', note: '要记下这个信号，最低采样率是多少（混叠的门槛）' },
      { formula: 'quantization_snr', note: '用 n 位记录，本底噪声多大（每多一位 +6dB）' },
      { formula: 'redundancy_ratio', note: '冗余多少 → 能容忍多少错（抗噪预算）' },
      { formula: 'band_gap_wavelength', note: '光电器件的收发波长（接点自量子链）' },
      { formula: 'rc_cutoff_frequency', note: '滤波到多窄 → 响应就多慢（带宽与延迟同一件事）' },
      { formula: 'open_loop_error', note: '有反馈时残差被压到 1/(1+K)（为什么必须闭环）' },
      { formula: 'loop_stability_limit', note: '延迟卡死增益上限（增益不能无限加）' },
      { formula: 'second_order_settling', note: '调节稳下来要多久' },
      { formula: 'overshoot_from_damping', note: '会冲过头多少（精密动作的致命项）' },
    ],
    bridges: [
      { formula: 'rc_cutoff_frequency', toSystem: 'sys-energy', note: '滤波/控制电路的能耗与带宽要计入能源链' },
      { formula: 'info_delivery_time', toSystem: 'sys-info', note: '「传多远」在治理链里是行政半径，在控制链里是延迟' },
      { formula: 'channel_capacity', toSystem: 'sys-capacity', note: '通信能力决定能协调多大的生产组织' },
    ],
  },
  {
    id: 'sys-decision',
    name: '决策与可靠性链（赔率 → 概率 → 冗余 → 可用度）',
    purpose: '「这件事该不该做、做不做得成」。把冒险、判断与工程冗余接到同一条链上。',
    keys: ['决策链', '可靠性', '博弈', '概率', '冗余', '运筹', 'decision chain'],
    steps: [
      { formula: 'breakeven_probability', note: '赔率 → 至少要几成把握（不用知道概率就能判断）' },
      { formula: 'expected_value_decision', note: '成功概率 × 收益 − 失败损失 → 期望净收益' },
      { formula: 'bayes_posterior', note: '先验 + 检测表现 → 看到证据后的真实概率' },
      { formula: 'bayes_evidence_strength', note: '这条证据到底值多少信任（对数可相加）' },
      { formula: 'base_rate_neglect_error', note: '直觉会高估多少倍（量化认知偏差）' },
      { formula: 'nash_bargaining_split', note: '谈成了怎么分（先拿退路，剩余对半）' },
      { formula: 'winner_curse_markup', note: '竞标为什么总买贵（赢家携带坏消息）' },
      { formula: 'reliability_series', note: '多环节串联 → 整体成功率（环节越多越脆）' },
      { formula: 'reliability_parallel', note: '加备份 → 至少一份可用（两份压一个数量级）' },
      { formula: 'weibull_failure_rate', note: '形状参数 k → 越用越坏还是越用越好（决定维护策略）' },
      { formula: 'weibull_reliability', note: '到 t 时刻还剩多少好的（k=1 即指数分布）' },
      { formula: 'coefficient_of_variation', note: '相对离散度 → 这工艺算精密还是手工（判断设定自洽）' },
      { formula: 'poisson_mean_variance', note: '均值=方差 → 检验「这现象是否真随机」（算散布即模型选择）' },
      { formula: 'mtbf_availability', note: '坏了能不能修 → 实际可用时间占比' },
      { formula: 'spares_required', note: '该备多少件（期望故障数，不是保证量）' },
      { formula: 'payback_period', note: '投入多久能靠节省捞回来（决策的时间尺度）' },
    ],
    bridges: [
      { formula: 'payback_period', toSystem: 'sys-capacity', note: '产能改造值不值得做，由回本期判定' },
      { formula: 'spares_required', toSystem: 'sys-capacity', note: '备件需求是产能链的隐性成本项' },
      { formula: 'reliability_series', toSystem: 'sys-capacity', note: '工艺链每一环的良率相乘就是总良率' },
      { formula: 'bayes_posterior', toSystem: 'sys-military', note: '情报判读与战场识别的概率基础' },
      { formula: 'nash_bargaining_split', toSystem: 'sys-fiscal', note: '税收谈判/停战议和的分配逻辑' },
      { formula: 'expected_value_decision', toSystem: 'sys-finance', note: '投资决策的期望收益是金融链的判据' },
    ],
  },
  {
    id: 'sys-quantum',
    name: '量子与固体链（黑体 → 能带 → 器件 → 核）',
    purpose: '「这个文明能碰到物质的哪一层」。从热辐射与量子门槛推到半导体器件与核能。',
    keys: ['量子链', '固体', '半导体', '核', '带隙', '费米能', 'quantum chain'],
    steps: [
      { formula: 'wien_displacement', note: '温度 → 发光颜色（越热越蓝）' },
      { formula: 'stefan_boltzmann', note: '温度的四次方 → 辐射散热功率' },
      { formula: 'photoelectric_threshold', note: '逸出功 → 最低可用光频（红光打不出电子）' },
      { formula: 'compton_shift', note: '光子动量（必须用 X 射线才看得见）' },
      { formula: 'heisenberg_uncertainty', note: '尺度到多小，经典物理失效' },
      { formula: 'fermi_energy', note: '电子密度 → 费米能（金属为什么导电）' },
      { formula: 'debye_temperature_heat_capacity', note: '低温比热 → T³（经典理论失效的证据）' },
      { formula: 'band_gap_wavelength', note: '带隙 → 发光波长（LED 颜色从哪来）' },
      { formula: 'pn_junction_builtin_voltage', note: '掺杂 → 内建电势（二极管单向导通的根源）' },
      { formula: 'drift_velocity_mobility', note: '电场 → 电子漂移速度（每小时 14 厘米）' },
      { formula: 'fission_energy_per_mass', note: '裂变能量密度（煤的 270 万倍）' },
      { formula: 'nuclear_binding_energy_curve', note: '比结合能 → 为什么铁是终点' },
      { formula: 'shielding_attenuation', note: '多厚才安全（指数衰减，永不归零）' },
    ],
    bridges: [
      { formula: 'stefan_boltzmann', toSystem: 'sys-energy', note: '高温窑炉的辐射散失由 T⁴ 决定' },
      { formula: 'wien_displacement', toSystem: 'sys-time', note: '发光颜色是测温手段（光学高温计）' },
      { formula: 'band_gap_wavelength', toSystem: 'sys-info-control', note: '光电器件是通信的收发端' },
      { formula: 'fission_energy_per_mass', toSystem: 'sys-capacity', note: '有核燃料则能源约束彻底改变' },
      { formula: 'shielding_attenuation', toSystem: 'sys-physiology', note: '辐射剂量与人体耐受' },
    ],
  },
  {
    id: 'sys-queue',
    name: '排队与产能链（到达 → 负载 → 等待 → 库存）',
    purpose: '「这个作坊/渡口/医馆够不够用」。把服务能力接到实际等待与积压上。',
    keys: ['排队链', '产能', '等待', '队列', '库存', 'queue chain'],
    steps: [
      { formula: 'queue_utilization', note: '到达率 / 服务能力 → 负载 ρ（悬崖就在 0.9）' },
      { formula: 'mm1_wait_time', note: '负载 → 平均要等多久' },
      { formula: 'little_law', note: '流量 × 时间 → 系统里同时有多少（守恒，无条件成立）' },
      { formula: 'mmc_queue_length', note: '多服务台时队长多少（加人有没有用）' },
      { formula: 'eoq', note: '一次备多少最省（平方根法则）' },
      { formula: 'safety_stock', note: '该多备多少防断供（提前期开平方）' },
      { formula: 'mtbf_availability', note: '设备可用时间占比（决定真实产能）' },
      { formula: 'labor_force', note: '多少人能干活（接点自食物链）' },
    ],
    bridges: [
      { formula: 'labor_force', toSystem: 'sys-food', note: '可动员劳力来自人口，人口来自食物' },
      { formula: 'mtbf_availability', toSystem: 'sys-capacity', note: '可用度直接折损年产量' },
      { formula: 'eoq', toSystem: 'sys-capacity', note: '备料批量决定资金占用与库存成本' },
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
      { formula: 'shielding_attenuation', note: '辐射穿透多厚才降到安全（接点自量子链）' },
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

/**
 * ## 复合路径（compound）
 *
 * 用户最初的问法是「公式能连的尽量连」，而 22 条链各自只覆盖一步到十几步。
 * 真实推演里最难的**不是算某一步，而是跨 4 条链回答一个问题**：
 *
 * ```
 *   一颗星的光度 → 气候 → 能源 → 产能 → 财政能不能撑住
 *   水渠容量     → 食物 → 财政 → 这支军队打不打得起
 * ```
 *
 * 这些路径在图上**已经连通**（图直径 5 跳、单一连通分量），但读者要自己一段段拼。
 * `compounds` 就是把已知的真实路径**登记下来**，让「从矿石到帝国崩溃」可以一次查到。
 *
 * ## 为什么只登记 `via` 而不复制公式与参数
 *
 * ```
 *   复制 → 公式改了、链条调整了，复合路径不会跟着变 → 必然漂移
 *   引用 → 每次都从 FORMULA_SYSTEMS 现查 → 永远与代码一致
 * ```
 *
 * 所以一条复合路径只写：**经过哪几条链（按顺序）+ 每一步用哪个接点公式（可选）+ 一句话说明**。
 * 至于每一步该填什么参数，去查那条链的 `sys:<id>`。
 *
 * ## 为什么不是所有链都能组合
 *
 * 只登记**真实存在接点**的路径。两道校验（测试守）：
 * 1. `via` 里的每条链必须真实存在；
 * 2. **相邻两链之间必须有真实接点**（`steps[].feeds` 或 `bridges` 任一方向），
 *    否则就是「拼出来的假路径」—— 那比不登记更糟。
 */
export interface CompoundPath {
  /** 路径 id（检索用）。 */
  id: string;
  /** 中文名：它回答什么问题。 */
  name: string;
  /** 这条路径解决什么问题（一句话）。 */
  purpose: string;
  /** 按推演顺序排列的体系 id。 */
  via: string[];
  /**
   * 每一跳用的接点公式（长度 = via.length − 1，可为空数组表示「不必指明」）。
   *
   * 用于让读者知道「这两条链靠哪个公式接上」，而不必自己去比对两张步骤表。
   */
  hops?: string[];
  /** 检索关键词。 */
  keys: string[];
}

/**
 * 复合路径登记表。
 *
 * 只收**真实可走通**的路径，且每条都标清楚它回答的问题。
 * 「能连的尽量连」不等于「全部串成一条」—— 这里收的是**有实用目的的**那几条。
 */
export const COMPOUND_PATHS: CompoundPath[] = [
  {
    id: 'mine-to-empire',
    name: '从矿石到帝国（材料 → 产能 → 财政 → 军事）',
    purpose: '「有铁矿」能不能变成「有帝国」。四个环节各是一道门槛，断哪一环都不成立。',
    via: ['sys-material', 'sys-capacity', 'sys-fiscal', 'sys-military'],
    hops: ['metallurgy_yield', 'gdp_from_labor', 'fiscal_burden_ratio'],
    keys: ['矿石', '帝国', '军事', '财政', '工业化', '铁'],
  },
  {
    id: 'water-to-army',
    name: '水渠容量能养多少兵（水利 → 食物 → 财政 → 军事）',
    purpose: '灌溉能力最终能转化成多少军事力量。适合回答「这个国家打得起多大的仗」。',
    via: ['sys-water', 'sys-food', 'sys-fiscal', 'sys-military'],
    hops: ['irrigation_volume', 'population_fed_by_grain', 'fiscal_burden_ratio'],
    keys: ['水渠', '灌溉', '军队', '兵员', '粮草'],
  },
  {
    id: 'info-to-capacity',
    name: '治理半径决定产能上限（信息 → 财政 → 产能）',
    purpose: '通信速度决定能管多宽，管辖半径决定征管成本，最终决定能组织多大的生产。',
    via: ['sys-info', 'sys-fiscal', 'sys-capacity'],
    hops: ['admin_radius_from_info', 'gdp_from_labor'],
    keys: ['治理', '行政半径', '信息', '产能', '帝国规模'],
  },
  {
    id: 'material-to-fly',
    name: '材料到飞行（材料 → 结构 → 交通）',
    purpose: '「这个世界的材料能造出飞行器吗」—— 强度决定结构，结构决定能不能做轻。',
    via: ['sys-material', 'sys-structure', 'sys-travel'],
    hops: ['hooke_law', 'impact_speed_freefall'],
    keys: ['材料', '飞行', '航空', '结构', '轻量化'],
  },
  {
    id: 'energy-to-output',
    name: '燃料到年产量（能源 → 产能）',
    purpose: '这座窑/这个工坊一年能出多少货，瓶颈卡在燃料还是工艺。',
    via: ['sys-energy', 'sys-capacity'],
    hops: ['thermal_efficiency_carnot'],
    keys: ['燃料', '年产量', '窑', '工坊', '瓶颈'],
  },
  {
    id: 'quantum-to-industry',
    name: '从半导体到工业（量子 → 信息控制 → 产能）',
    purpose: '能不能做出电子工业。带隙定器件，器件定通信与控制，控制定产能组织方式。',
    via: ['sys-quantum', 'sys-info-control', 'sys-capacity'],
    hops: ['band_gap_wavelength', 'channel_capacity'],
    keys: ['半导体', '电子', '工业', '通信', '器件'],
  },
  {
    id: 'queue-to-output',
    name: '作坊够不够用（排队 → 产能）',
    purpose: '服务能力与到达率决定积压，积压决定实际产出 —— 回答「再加一个人有没有用」。',
    via: ['sys-queue', 'sys-capacity'],
    hops: ['mtbf_availability'],
    keys: ['作坊', '排队', '积压', '产能', '够不够用'],
  },
]

/**
 * 查某条复合路径的**实际可走通性**。
 *
 * 不信任登记表：每次都回到 `FORMULA_SYSTEMS` 核实相邻两链之间是否真有接点。
 * 返回每一跳的证据（是 feeds 还是 bridges、用的哪个公式），供展示与测试共用。
 *
 * @param path - 复合路径
 * @returns 每一跳的连通证据；某跳不通则该项的 `ok` 为 false
 */
export function traceCompound(
  path: CompoundPath,
): Array<{ from: string; to: string; ok: boolean; formula: string; kind: 'feeds' | 'bridges' | 'none'; note: string }> {
  const result: Array<{ from: string; to: string; ok: boolean; formula: string; kind: 'feeds' | 'bridges' | 'none'; note: string }> = []
  for (let index = 0; index < path.via.length - 1; index += 1) {
    const fromId = path.via[index]
    const toId = path.via[index + 1]
    const from = FORMULA_SYSTEMS.find(function (s) { return s.id === fromId })
    const to = FORMULA_SYSTEMS.find(function (s) { return s.id === toId })
    const hint = path.hops?.[index] ?? ''

    /** ① 先看有没有登记好的 bridges（任一方向）。 */
    let kind: 'feeds' | 'bridges' | 'none' = 'none'
    let formula = ''
    let note = ''

    if (from) {
      for (const bridge of from.bridges ?? []) {
        if (bridge.toSystem !== toId) continue
        if (hint && bridge.formula !== hint) continue
        /** 接点公式必须真的在目标链的步骤里，否则是「死链」（本项目踩过两次）。 */
        const inTarget = (to?.steps ?? []).some(function (step) { return step.formula === bridge.formula })
        if (!inTarget) continue
        kind = 'bridges'
        formula = bridge.formula
        note = bridge.note
        break
      }
    }
    /** ② 再看反方向的 bridges（别的链声明指向我）。 */
    if (kind === 'none' && to) {
      for (const bridge of to.bridges ?? []) {
        if (bridge.toSystem !== fromId) continue
        if (hint && bridge.formula !== hint) continue
        const inSource = (from?.steps ?? []).some(function (step) { return step.formula === bridge.formula })
        if (!inSource) continue
        kind = 'bridges'
        formula = bridge.formula
        note = '（对方链声明）' + bridge.note
        break
      }
    }
    /**
     * ③ 最后看「共用公式」：两链的 steps 里有同一个公式。
     * 这比 bridges 弱，但也是真实的连接 —— 同一个公式出现在两条链上。
     */
    if (kind === 'none' && from && to) {
      const toFormulas = new Set<string>(to.steps.map(function (step) { return step.formula }))
      for (const step of from.steps) {
        if (!toFormulas.has(step.formula)) continue
        if (hint && step.formula !== hint) continue
        kind = 'feeds'
        formula = step.formula
        note = '两链共用此公式'
        break
      }
    }

    result.push({ from: fromId, to: toId, ok: kind !== 'none', formula, kind, note })
  }
  return result
}

/**
 * 找一条复合路径（按 id 或名称/关键词）。
 *
 * @param needle - 用户输入
 * @returns 匹配到的路径，没有则 undefined
 */
export function findCompound(needle: string): CompoundPath | undefined {
  const raw = needle.trim()
  if (raw === '') return undefined
  const lower = raw.toLowerCase()
  const exact = COMPOUND_PATHS.find(function (path) {
    return path.id.toLowerCase() === lower || path.name === raw
  })
  if (exact) return exact
  return COMPOUND_PATHS.find(function (path) {
    return path.name.includes(raw) || path.id.includes(lower) || path.keys.some(function (key) { return key.includes(raw) })
  })
}
