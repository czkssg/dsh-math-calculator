/**
 * 公式库第十四批：**工艺级工程公式**（v2.3.5）。
 *
 * ## 为什么单独成批
 *
 * 外部实测反馈（《工程公式缺口与公式库扩展建议》，2026-11-08）的核心判断：
 *
 * > 「公式库不是数量少（499 条），而是『工艺级工程公式』稀薄 ——
 * >   它能算『灌溉要多少水』，算不了『掺 10% 砂的陶坯在 1100℃ 会不会裂』。」
 *
 * 实测分布证实了这点：
 *
 * ```
 *   physics 187 条    ← 极充实，解释「世界为什么这样」
 *   engineering 21 条 ← 全是顶层物理式（梁柱/热机/管流/泵）
 *   机械 0 命中 ｜ 发酵 0 命中 ｜ 窑 0 命中
 * ```
 *
 * 也就是说：**已有的 187 条物理规律往下接一层就够用，缺的是那座桥。**
 *
 * ## 这批补的链
 *
 * ```
 *   能源链  kiln_heat_balance → kiln_firing_time → wall_heat_loss
 *   材料链  metallurgy_yield → case_depth → gear_bending_strength
 *   传动链  gear_geometry / pendulum_clock_drift / gravity_storage_discharge
 *   农业链  growing_degree_days → leaching_residue → fermentation_time → syrup_concentration
 * ```
 *
 * ## 一个「自洽性检查」公式的特别价值
 *
 * `gravity_storage_discharge` 不是为了算新数，而是**检查设定自不自洽**：
 * 625J、8W、12 分钟各自都「看着合理」，只有放进同一个式子才暴露出差了数量级。
 * 这类「把散落的好看数字拼起来才出错」的场景，正是公式库最该覆盖的。
 *
 * ## 可信度
 *
 * 本批多为 `phenomenological`（形式对、系数需标定）。
 * 每个 desc 都给了典型区间与「换条件要重标定」的说明。
 *
 * @module dsh-math-calculator/formula-library-process
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/** 工艺级工程公式 14 条。 */
export const PROCESS_FORMULAS: FormulaDef[] = [
  {
    id: 'kiln_heat_balance',
    cat: 'engineering/process',
    name: '窑炉热平衡（燃料热量去哪了）',
    expr: 'ware_mass * ware_specific_heat * delta_T / 1000 * (1 + shell_loss_ratio)',
    params: {
      ware_mass: req('装坯质量 kg'),
      ware_specific_heat: p(0.9, '坯体比热 kJ/(kg·K)（陶 0.8~1.1、瓷 0.9~1.3）'),
      delta_T: req('升温幅度 K（室温→烧成温度）'),
      shell_loss_ratio: p(12, '窑体蓄热+散热相对坯体之比（间歇窑 8~20，连续窑 3~6）'),
    },
    unit: 'MJ（估算的一次烧成总耗热）',
    desc:
      '「单窑耗煤 Xkg」这类经验数可以靠这条验算：Q = m·c·ΔT·(1+损比)。' +
      '★ 这是全库第一缺口 —— 有了它，耗煤量、窑衬寿命、窑型升级幅度全部可算。' +
      '★ 实测对照：100kg 坯 20→1100℃ 本身只需 97MJ，而实际耗煤往往对应 8~15 倍，' +
      '  差的那部分正是窑体蓄热、窑壁散热、烟气带走。' +
      '★ 省燃料的关键在 shell_loss_ratio：间歇窑 12 是常态，' +
      '  改连续窑/余热回收能压到 3~6 —— 这就是「窑型升级 +40%~+300%」的来源。' +
      '⚠ 只算一次烧成的显热，不含保温维持与不完全燃烧。',
    keys: ['窑炉', '热平衡', '耗煤', '窑体蓄热', '烧成能耗', 'kiln'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering', 'materials'],
  },
  {
    id: 'kiln_firing_time',
    cat: 'engineering/process',
    name: '烧成时间（升温速率受热应力限制）',
    /**
     * ★ 不要再除以 60 —— `heating_rate` 的单位已经是 **K/h**，
     * 所以 ΔT/(K/h) 直接得小时。
     *
     * 我第一版写成 `delta_T / heating_rate / 60`，把一个 5.4 小时的窑
     * 算成了 0.09——那看着像「5 分钟」而不是「5.4 小时」，
     * 而单位栏还写着 h，属于**单位与数值互相矛盾**。
     * 这类错误比纯粹的算术错更难发现，因为数值本身「看着像个小时间」。
     */
    expr: 'delta_T / heating_rate',
    params: {
      delta_T: req('升温幅度 K'),
      heating_rate: p(200, '安全升温速率 K/h（薄壁 150~300、厚壁 60~120）'),
    },
    unit: 'h（到达烧成温度所需时间）',
    desc:
      't = ΔT / 升温速率。**升温速率不是随便定的，它被热应力上限卡住。**' +
      '★ 这就是「排潮 2h → 氧化 2.5h → 高温 2h → 保温 1h」里那些 2h 的来源：' +
      '  不是工艺偏保守，而是厚壁件温差过大会直接开裂。' +
      '★ 实测对照：室温→1100℃ 取 200K/h → 5.5h 爬温 + 各阶段保温，与常见「一窑一天」对得上。' +
      '★ 关键推论：薄壁能快、厚壁必须慢 —— 壁厚翻倍，允许升温率大致降一半，工期翻倍。' +
      '⚠ 150~300 / 60~120 是陶与瓷的常见区间；具体依热膨胀系数与抗张强度。',
    keys: ['烧成', '升温速率', '开裂', '烧成曲线', '工期', 'firing'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering', 'materials'],
  },
  {
    id: 'wall_heat_loss',
    cat: 'engineering/process',
    name: '围护结构稳态热损（R 值法）',
    expr: 'total_area * delta_T / r_value + ventilation_loss',
    params: {
      total_area: req('围护总面积 m²（墙+屋顶+地板）'),
      delta_T: req('内外温差 K'),
      r_value: p(2, '总热阻 R = Σ(δ/k) m²·K/W（单层砖墙 0.5，多层保温 9+）'),
      ventilation_loss: p(0, '通风换气热损 W（可单列）'),
    },
    unit: 'W（维持室内温度所需加热功率）',
    desc:
      'Q = A·ΔT/R + 通风。建筑围护结构的标准算法，与工业换热器的 LMTD 完全是两回事。' +
      '★ 关键：用总热阻 R 而不是导热系数 k，因为多层墙要逐层累加 δ/k。' +
      '★ 实测对照：64㎡、R=9.34、ΔT=25℃ → 171W；加通风 50W 得 221W，与实测 282W 同量级' +
      '  （差异来自缝隙与热桥 —— 实际总是比计算大）。' +
      '★ 反推用途：知道实测耗热 282W，可反推真实 R 值，检验保温做够了没有。' +
      '⚠ R 值是灵魂：单层砖墙约 0.5，加 10cm 岩棉可到 3~4，多层真空/反射箔可达 9+。',
    keys: ['热损', '保温', 'R值', '围护', '建筑传热', 'insulation'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'metallurgy_yield',
    cat: 'engineering/process',
    name: '冶金收得率（矿石 → 金属）',
    expr: 'ore_mass * grade * recovery',
    params: {
      ore_mass: req('矿石量 kg'),
      grade: req('品位 0—1（赤铁 0.5~0.6、孔雀石 0.55~0.57）'),
      recovery: p(0.85, '回收率（土法 0.6~0.8、改进 0.85~0.95）'),
    },
    unit: 'kg（产出金属量）',
    desc:
      'm = m_矿 × 品位 × 回收率。一眼就能看出「年产 5kg」与「年产 15-20kg」差在哪。' +
      '★ 实测对照：15kg 矿 × 0.3 × 0.9 = 4.05kg 生铁；5kg 孔雀石 × 0.57 × 0.8 = 2.28kg 精铜。' +
      '★ 反推最实用：已知「两炉年产 5kg」，反推每炉投多少矿 → 5/(2×0.35×0.7) ≈ 10kg 矿/炉。' +
      '  数字自相矛盾时，这条能把矛盾定位到具体环节。' +
      '★ 三因子各自可调：品位靠选矿、回收率靠炉型、矿量靠开采 ——' +
      '  外推产能时先看哪个因子先到天花板，那才是真瓶颈。',
    keys: ['冶金', '收得率', '品位', '回收率', '矿石', '炼铁'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering', 'materials'],
  },
  {
    id: 'case_depth',
    cat: 'engineering/process',
    name: '渗碳层深（扩散控制）',
    expr: '2 * sqrt(D0 * exp(-activation_energy / (R * temperature)) * hold_time)',
    params: {
      D0: p(2e-5, '扩散常数 D₀ m²/s（碳在奥氏体铁中约 2e-5）'),
      activation_energy: p(1.5e5, '激活能 J/mol（碳在 γ-Fe 约 1.3~1.6e5）'),
      R: p(8.314462618, '气体常数 J/(mol·K)'),
      temperature: req('渗碳温度 K（900℃ = 1173K）'),
      hold_time: req('保温时间 s（3h = 10800）'),
    },
    unit: 'm（渗碳层深度）',
    desc:
      'x ≈ 2√(D·t)，D = D₀·exp(−Q/RT)。表面硬化层的标准算法。' +
      '★ 实测对照：900℃ 保温 3h → D≈4.2e-12 m²/s、x≈0.42mm，与「表面硬化零点几毫米」吻合。' +
      '★ 关键推论：温度是平方级杠杆，时间是线性。' +
      '  900→950℃ 只差 50 度，D 约翻倍，层深涨 √2 倍；而保温 3h→5h 只涨 √(5/3)≈1.29 倍。' +
      '  所以「渗层不够就多烧一会儿」效率很低，提温才是真手段 —— 但要防过热与晶粒长大。' +
      '⚠ D₀ 与 Q 依钢种与碳势而变，给的是低碳钢 900-950℃ 的典型区间。',
    keys: ['渗碳', '扩散', '表面硬化', '层深', 'carburize'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['engineering', 'materials'],
  },
  {
    id: 'gear_bending_strength',
    cat: 'engineering/process',
    name: '齿轮齿根弯曲强度（模数选型）',
    expr: 'tangential_force / (face_width * gear_module * form_factor)',
    params: {
      tangential_force: req('圆周力 F_t N（F_t = 2T/d）'),
      face_width: req('齿宽 b m'),
      gear_module: req('模数 m m'),
      form_factor: p(0.32, '齿形系数 Y（20° 标准齿 0.30~0.34）'),
    },
    unit: 'Pa（齿根弯曲应力；与许用弯曲应力比即判安全）',
    desc:
      'σ = F_t/(b·m·Y)。齿轮传动的强度判据，也是模数选型的依据。' +
      '★ 这条能验算「模数 4 比 2.5 厚约 60%，足以承受 30kg 重锤」这种断言：' +
      '  m=4、z=30 → 分度圆 120mm；30kg 在 r=60mm → F_t≈294N；' +
      '  齿宽 30mm、Y=0.32 → σ ≈ 7.7 MPa，远低于铸铁许用 30~60MPa。' +
      '★ 结论是「模数 4 绰绰有余」，而模数 2.5 时应力涨到约 12 MPa —— 仍够。' +
      '  所以那句断言是对的，但只有算出这两个数才知道它对。' +
      '⚠ 简化式（未含动载系数、应力集中、齿面接触疲劳）。单件低速手工齿轮够用。',
    keys: ['齿轮', '齿根', '弯曲强度', '模数', '选型'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering'],
  },
  {
    id: 'gear_geometry',
    cat: 'engineering/process',
    name: '齿轮几何（分度圆与传动比）',
    expr: 'gear_module * teeth',
    params: {
      gear_module: req('模数 m mm'),
      teeth: req('齿数 z'),
    },
    unit: 'mm（分度圆直径 d）',
    desc:
      'd = m·z。齿轮的一切尺寸都从这两个数派生：外径 d+2m、齿高 2.25m、中心距 (d₁+d₂)/2。' +
      '★ 传动比 i = z_从/z_主（同模数）。所以「1:12 减速」可反推齿数组合：' +
      '  单级 30:360，或两级 30:180 + 20:40 —— 单级占空间、多级效率低但紧凑，' +
      '  这就是设计取舍的量化形式。' +
      '★ 手工加工的约束：模数决定刀具规格，所以一个作坊只用一两种模数，' +
      '  而齿数可自由组合 —— 「统一模数 + 自由齿数」正是钟表业的传统做法。',
    keys: ['齿轮', '模数', '齿数', '分度圆', '传动比'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'pendulum_clock_drift',
    cat: 'engineering/process',
    name: '摆钟走时精度（温度引起的快慢）',
    expr: '86400 * (-0.5 * length_change_ratio + 0.5 * gravity_change_ratio)',
    params: {
      length_change_ratio: req('摆长相对变化 ΔL/L（热膨胀 α·ΔT；钢 α≈1.2e-5/K）'),
      gravity_change_ratio: p(0, '重力相对变化 Δg/g（同地可忽略，高原/异星要算）'),
    },
    unit: 's/天（正为走快，负为走慢）',
    desc:
      'T = 2π√(L/g)，取对数微分得 ΔT/T = −½·ΔL/L + ½·Δg/g，乘 86400 得每天偏差。' +
      '★ 实测对照：钢摆 α=1.2e-5、冬夏温差 20℃ → ΔL/L=2.4e-4 → 每天慢约 10.4 秒。' +
      '  这就是「摆钟冬夏要重新校」的定量原因，也是补偿摆（双金属）要解决的问题。' +
      '★ 重要推论：周期只与摆长的**平方根**有关，所以摆长误差的影响被压掉一半；' +
      '  摆长差 0.1% 只让每天差 43 秒 —— 天文观测完全够用来校准。' +
      '★ 反过来最有用：**异星设定**里 g 变了多少，钟就快慢多少，这条直接给数。' +
      '⚠ 补偿摆能压到每天 1~2 秒；真空+恒温的精密摆钟可到每天 0.01 秒。',
    keys: ['摆钟', '钟表', '走时', '精度', '热膨胀'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'gravity_storage_discharge',
    cat: 'engineering/process',
    name: '重力储能放电时长（自洽性检查）',
    expr: 'mass * 9.80665 * height / power',
    params: {
      mass: req('配重质量 kg'),
      height: req('落差 m'),
      power: req('放电功率 W'),
    },
    unit: 's（能维持该功率的时长）',
    desc:
      't = E/P = m·g·h/P。**最重要的用途是检查设定自不自洽，而不是算新数。**' +
      '★ 实测对照（外部反馈的原案例）：25kg 配重 × 2.5m = 625J；' +
      '  若设定说「6~8W 持续 12~15 分钟」，625J ÷ 8W = 78 秒 —— 差一个数量级。' +
      '★ 这种错误极难自察：625J、8W、12 分钟各自都「看着合理」，' +
      '  只有把三个数放进同一个式子才暴露。这正是能量守恒检查的价值。' +
      '★ 反推用途：要维持 8W 共 12 分钟需 5760J → 需 235kg×2.5m 或 25kg×23.5m。' +
      '  于是「要么加配重十倍、要么加高十倍」—— 设计方向一下就明确了。',
    keys: ['重力储能', '配重', '放电', '储能时长', '自洽检查'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['engineering', 'physics'],
  },
  {
    id: 'water_turbine_output',
    cat: 'engineering/process',
    name: '水轮输出（功率/扭矩/转速）',
    expr: 'density * 9.80665 * flow * head * efficiency',
    params: {
      density: p(1000, '水密度 kg/m³'),
      flow: req('流量 m³/s'),
      head: req('有效水头 m'),
      efficiency: p(0.7, '总效率（木制水轮 0.4~0.6、改进 0.7~0.85）'),
    },
    unit: 'W（轴输出功率）',
    desc:
      'P = ρgQHη。与水轮机的「泵」公式同形但方向相反 —— 泵用电换水头，水轮用水头换功。' +
      '★ 实测对照：溪流 0.01m³/s、水头 3m、η=0.6 → 176W；小河 0.1m³/s、水头 6m → 3.5kW。' +
      '★ 扭矩 T = P/ω，转速 n = 60v/(πD)：' +
      '  低水头大流量的水轮转速慢、扭矩大，**这正是它能直接带动锻锤的原因**；' +
      '  而带动锯需要高转速，得加增速传动 —— 于是「传动比」成了必需项而不是选择项。' +
      '★ 效率 0.4→0.85 就是「木轮改铁轮 + 导流」的全部收益，提升 2 倍。',
    keys: ['水轮', '水车', '水力', '功率', '扭矩'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'gdd_accumulated',
    cat: 'engineering/process',
    name: '累计生长度日（一季能攒多少积温）',
    expr: 'excess_daily_temp * days',
    params: {
      excess_daily_temp: p(10, '日均温超出基点部分 K（日均 20℃、基点 10℃ → 10）'),
      days: req('生育期天数（无霜期 180~210）'),
    },
    unit: '℃·d（生长度日 GDD）',
    desc:
      'GDD = Σ max(0, T_日均 − T_基点)。**四季节奏的数学骨架。**' +
      '★ 价值在于「把时间换算成热量」：同样 200 天生育期，' +
      '  暖地日均积 15 度、冷地 8 度 → GDD 差近 2 倍 → 能种的作物完全不同。' +
      '★ 实测用途：给定「无霜期 180~210 天」可反推这一季能攒多少积温，' +
      '  再对照作物需求（玉米 2500~2800、小麦 1800~2200、水稻 3000+）判断能不能熟。' +
      '★ 这也是「春播秋收冬藏」必须按日历走的定量理由 —— 积温不够就熟不了。' +
      '⚠ 基点温度依作物而变（小麦 0~5℃、玉米 10℃、水稻 10~12℃）。',
    keys: ['生长度日', 'GDD', '积温', '物候', '无霜期', '农业'],
    frequency: 'medium',
    layer: 'phenomenological',
    domains: ['agriculture', 'biology'],
  },
  {
    id: 'leaching_residue',
    cat: 'engineering/process',
    name: '浸提残留（换水去单宁/苦涩）',
    expr: 'initial_concentration * residual_ratio^changes',
    params: {
      initial_concentration: req('初始浓度（如单宁含量）'),
      residual_ratio: p(0.6, '每次换水后的残留比（0.5~0.7，依切块大小与水温）'),
      changes: req('换水次数'),
    },
    unit: '与初始浓度同单位',
    desc:
      'C_n = C₀·rⁿ。橡子、蕨根、苦杏仁去毒去涩的标准算法。' +
      '★ 实测对照：r=0.6 换 4 次 → 0.1296，残留 13%；换 5 次 7.8%、换 6 次 4.7% —— 指数衰减。' +
      '★ 关键推论：**换水次数比每次泡多久更重要。**' +
      '  泡一夜再换 4 次（0.13）远好于泡 4 天不换（几乎不衰减）——' +
      '  因为扩散平衡后浓度不再下降，必须靠换水把平衡点推下去。' +
      '★ 这也是「手工程序值得公式化」的最好例子：' +
      '  设定里写「需浸泡去单宁」但没给次数，而次数直接决定能不能吃。',
    keys: ['浸提', '去单宁', '浸泡', '换水', '脱毒', 'leaching'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['agriculture', 'chemistry'],
  },
  {
    id: 'fermentation_time',
    cat: 'engineering/process',
    name: '发酵时间（达到目标残留糖）',
    expr: '-(log(target_residual / initial_sugar)) / rate_constant',
    params: {
      initial_sugar: req('初始糖浓度'),
      target_residual: req('目标残留糖浓度'),
      rate_constant: p(0.07, '速率常数 k 1/day（酿酒 0.05~0.09、酿醋 0.02~0.04）'),
    },
    unit: 'day（达到目标残留糖所需天数）',
    desc:
      'S(t) = S₀·e^(−kt)，解出 t = −ln(S_残/S₀)/k。酿酒、酿醋、沤肥的时间估算。' +
      '★ 实测对照：降到 5%、k=0.07 → t = −ln(0.05)/0.07 ≈ 43 天；' +
      '  而 k=0.04（低温）需 75 天 —— **这就是「温度低一度要延长几天」的定量答案。**' +
      '★ 关键推论：发酵时间对温度极敏感（k 随温度按 Q₁₀ 律变，见 q10_temperature）。' +
      '  所以「酿酒 2~4 周、酿醋 6~8 周」不是随便写的，它对应两个不同的 k。' +
      '★ 串联用途：先用 q10_temperature 由温度得 k，再代入本式得工期 —— 这是「换季要改工艺」的可算理由。' +
      '⚠ 简化的一级动力学；实际发酵有滞后期与产物抑制，工业上要用 Monod + 抑制项。',
    keys: ['发酵', '酿酒', '酿醋', '沤肥', '时间', 'fermentation'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['agriculture', 'biology', 'chemistry'],
  },
  {
    id: 'syrup_concentration',
    cat: 'engineering/process',
    name: '熬煮浓缩（糖浆得率）',
    expr: 'juice_volume * initial_brix / final_brix',
    params: {
      juice_volume: req('原汁体积 L'),
      initial_brix: req('初始糖度 Brix（%）'),
      final_brix: req('成品糖度 Brix（%）'),
    },
    unit: 'L（成品体积）',
    desc:
      'V_f = V₀·Brix₀/Brix_f。糖量守恒的浓缩换算。' +
      '★ 实测对照：40L 枫汁 Brix=2.5、成品 66 → 40×2.5/66 = 1.52L。' +
      '  设定里「40L 产 1L 糖浆」对应成品 Brix 更高或含水更多，量级一致。' +
      '★ 关键推论：**浓缩比只由糖度比决定**，与锅的大小、火的大小都无关。' +
      '  所以「熬多久」只影响风味与色泽，不影响得率 —— 得率只看两个度数。' +
      '★ 反过来最实用：知道要熬到多少度，就能预估这一锅能出多少，' +
      '  这也是判断「值不值得熬」的依据（燃料成本 vs 成品收益）。' +
      '⚠ Brix 是质量百分比糖度；若用糖度计读数，需按温度修正。',
    keys: ['熬煮', '浓缩', '糖浆', 'Brix', '糖度', '得率'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['agriculture', 'chemistry'],
  },
  // ══════════════════════════════════════════════════════════════════
  // 材料成品性能（外部反馈 P4/P6：把工艺参数接到成品性能上）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'sintering_porosity',
    cat: 'engineering/process',
    name: '烧结致密度（温度/时间 → 孔隙率）',
    expr: 'initial_porosity * exp(-A * exp(-activation_energy / (R * temperature)) * hold_time)',
    params: {
      initial_porosity: p(0.40, '坯体初始孔隙率（压制后 0.35~0.45）'),
      A: p(5.2e3, '指前因子（依粉体粒度；细粉更大）'),
      activation_energy: p(8.0e4, '烧结活化能 J/mol（氧化物烧结中值 80 kJ/mol）'),
      R: p(8.314462618, '气体常数 J/(mol·K)'),
      temperature: req('烧结温度 K（850℃ = 1123K）'),
      hold_time: req('保温时间（单位与 A 配套；A 对应「小时」时给 1）'),
    },
    unit: '无量纲（残余孔隙率；吸水率与之近似成正比）',
    desc: ['φ = φ₀·exp(−k·t)，k = A·exp(−Q/RT)。**把「烧到多密」变成可算的**。', '★ 标定结果（以 A=110、Q=42kJ/mol、1 小时保温）：', '  750℃ → 孔隙 18.4% ｜ 850℃ → 12.0% ｜ 1000℃ → 5.2% ｜ 1300℃ → 0.5%', '  与常识完全吻合：普通陶 850℃ 吸水率 10~15%、瓷 1300℃ <0.5%。', '★ **温度是主杠杆，时间是次级**：指数在温度项里，所以每升 100℃ 的效果', '  远大于把保温时间延长一倍 —— 这与渗碳的道理相同（都走扩散）。', '★ 反推用途：要求吸水率 <1%（近似孔隙 <1%），反推需要多高的烧结温度。', '⚠ 孔隙率与吸水率是**近似正比**而非相等：开口气孔才吸水，闭口气孔不吸。', '  所以「孔隙 0.5%」时吸水率可能已接近 0，但这个粗糙关系足够判断「够不够瓷化」。'].join(''),
    keys: ['烧结', '致密度', '孔隙率', '吸水率', '瓷化', 'sintering'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'quench_hardness',
    cat: 'engineering/process',
    name: '淬火硬度（含碳量 → 可达硬度）',
    expr: 'max_hardness - drop * exp(-rate * carbon_percent)',
    params: {
      carbon_percent: req('含碳量 %（0.2~1.2 为可淬硬区间）'),
      max_hardness: p(71.5, '饱和硬度上限 HRC（实际依合金元素，含铬钼可更高）'),
      drop: p(70, '从上限往下掉的幅度'),
      rate: p(2.55, '上升速率（拟合参数）'),
    },
    unit: 'HRC（洛氏 C 硬度，完全马氏体淬火）',
    desc: ['H = Hmax − drop·exp(−rate·C)。**含碳量决定「钢能硬到什么程度」的上限**。', '★ 拟合依据是实测的 HRC-含碳量表（0.2%→20、0.5%→52、0.7%→62、1.2%→67 HRC）：', '  **差值递减**（0.2→0.5 每档涨 10~12，0.7 之后每档只涨 1~2），所以用饱和型。', '★ 用默认参数：0.2%→29、0.5%→52、0.7%→60、1.2%→68。', '  ⚠ 低碳区偏乐观（0.2% 时高 9 个点），因为实际低碳钢淬不硬；高碳区很准。', '★ 这条的意义在于**判断「这把刀能不能硬」**：C<0.3% 的钢再怎么淬也到不了 HRC50，', '  而工具钢要 C 0.7~0.9% —— 这是「炼钢要控碳」的定量理由。', '⚠ 完全淬火的上限硬度。实际回火会显著降低（回火温度每升 50℃ 约降 2~4 HRC）。', '⚠ 只对「能淬硬的钢」成立：低碳钢、纯铁不适用（它们淬不硬）。'].join(''),
    keys: ['淬火', '硬度', '含碳量', 'HRC', '工具钢', 'quench'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials', 'engineering'],
  },
  // ══════════════════════════════════════════════════════════════════
  // 炉膛热效率（外部反馈 I5：燃料热量实际有多少变成有效功）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'furnace_efficiency',
    cat: 'engineering/process',
    name: '炉膛热效率（三种损失的合成）',
    expr: '1 - flue_loss - wall_loss - unburnt_loss',
    params: {
      flue_loss: p(0.35, '烟气带走比例（土窑 0.45、砖窑 0.30、带余热回收 0.18）'),
      wall_loss: p(0.08, '炉壁散热比例（土窑 0.10、砖窑 0.06、保温好 0.04）'),
      unburnt_loss: p(0.04, '不完全燃烧比例（土窑 0.05、改进 0.03、好炉 0.02）'),
    },
    unit: '无量纲（0—1，燃料热量转成有效热的比例）',
    desc: ['η = 1 − 烟气 − 炉壁 − 不完全燃烧。**三种损失各自可调，加起来就是天花板**。', '★ 实测对照：土窑 η=0.40、改进砖窑 0.61、带余热回收 0.76。', '  这与「火炉效率 0.40~0.50」的常见经验完全吻合。', '★ **最大的损失永远是烟气**：0.45 的烟气损失意味着近一半热量从烟囱跑了。', '  所以「加烟囱挡板、延长烟道路径（穿火炕）」比「把炉壁加厚」有效得多 ——', '  这是传统火炕设计的物理依据。', '★ 串联用途：η × 燃料热值 = 实际可用热量，再除以工艺所需热量，', '  就得到「一窑要烧多少料」—— 这条接在 kiln_heat_balance 之前。', '★ 与卡诺效率的区别：**卡诺是热机理论上限（温度决定），炉膛效率是燃烧损失（结构决定）**。', '  两者相乘才是「从煤到轴功」的总效率。'].join(''),
    keys: ['炉膛', '热效率', '烟气损失', '不完全燃烧', '火炕', 'furnace'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering'],
  },
  // ══════════════════════════════════════════════════════════════════
  // 化工单元与通用工具（外部反馈 I7 / P3 / M4）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'distillation_enrichment',
    cat: 'engineering/process',
    name: '一次蒸馏的富集倍数（汽液平衡）',
    expr: 'relative_volatility * liquid_fraction / (1 + (relative_volatility - 1) * liquid_fraction)',
    params: {
      liquid_fraction: req('液相中易挥发组分的摩尔分数（0—1）'),
      relative_volatility: p(2.2, '相对挥发度 α（乙醇-水 2.0~2.5、甲醇-水 3~4）'),
    },
    unit: '无量纲（气相摩尔分数；除以液相分数即富集倍数）',
    desc: [
      'y = αx/(1+(α−1)x)。蒸馏的**单级平衡**关系 —— 不是「一次蒸馏就能到纯度」。',
      '★ 关键性质：**富集倍数随浓度下降**。α=2.2 时：',
      '  x=0.05 → 富集 2.08 倍 ｜ x=0.30 → 1.62 ｜ x=0.80 → 1.12',
      '  所以「从 10% 提到 70%」不可能靠一次蒸馏，必须多级（理论塔板）。',
      '★ 塔板数：每级按上式算一次直到达标。10%→70% 在 α=2.2 下约需 6~8 块理论板。',
      '★ 这就是「为什么蒸馏器要做成塔」的定量理由 —— 单锅只能提 2 倍。',
      '⚠ 高浓度端会撞**共沸点**：乙醇-水在 95.6% 处共沸，再蒸也提不上去。',
      '⚠ α 随温度与浓度变化，2.2 是常压低浓度区的典型值。',
    ].join(''),
    keys: ['蒸馏', '汽液平衡', '相对挥发度', '富集', '酒精', '塔板'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['engineering', 'chemistry'],
  },
  {
    id: 'crystallization_yield',
    cat: 'engineering/process',
    name: '冷却结晶收率（溶解度差）',
    expr: '(solubility_hot - solubility_cold) * solvent_mass / 100',
    params: {
      solubility_hot: req('高温溶解度 g/100g 溶剂（KNO₃ 100℃ 约 246）'),
      solubility_cold: req('低温溶解度 g/100g 溶剂（KNO₃ 20℃ 约 32）'),
      solvent_mass: req('溶剂质量 g（水）'),
    },
    unit: 'g（理论最大析出量）',
    desc: [
      'm = (S_高温 − S_低温) × 溶剂量/100。**冷却结晶的收率上限**。',
      '★ 实测对照（硝石提纯）：100g 水配 246g KNO₃（100℃ 饱和），冷到 20℃ 析出 214g，收率 87%。',
      '★ 关键推论：**收率取决于两个温度的溶解度差**，而不是降温幅度本身。',
      '  「用冰水降得更低」收益递减（20℃→0℃ 只多析出约 12g）。',
      '★ 反过来最实用：要提高收率，**蒸发一部分水**比继续降温有效 —— 海盐晒盐正走这条路。',
      '⚠ 析出是理论最大值：实际有母液夹带、晶粒细会带走更多母液。',
      '⚠ 只适用「溶解度随温度显著上升」的盐；NaCl 几乎不变，此法无效。',
    ].join(''),
    keys: ['结晶', '收率', '溶解度', '硝石', '海盐', '提纯'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering', 'chemistry'],
  },
  {
    id: 'drying_shrinkage',
    cat: 'engineering/process',
    name: '坯体总收缩（干燥 + 烧成）',
    expr: 'drying_shrinkage + firing_shrinkage',
    params: {
      drying_shrinkage: p(0.06, '干燥线收缩（普通陶土 0.05~0.07；掺熟料可降到 0.03）'),
      firing_shrinkage: p(0.04, '烧成线收缩（陶 0.03~0.05；瓷 0.10~0.14）'),
    },
    unit: '无量纲（线性收缩率；乘 100 得百分比）',
    desc: [
      '总收缩 = 干燥收缩 + 烧成收缩。**配料与开裂风险的核心参数**。',
      '★ 干缩来自颗粒间水膜消失，烧成收缩来自孔隙闭合 —— 两段成因不同但会叠加。',
      '★ 关键数字：普通陶土总收缩 8~12%（干 6% + 烧 4%）；瓷更高（15~18%）。',
      '★ **掺熟料（煅烧过的黏土粉）是减收缩的主要手段**：熟料已收缩过，不再收缩。',
      '  每掺 10% 熟料约减 1~1.5 个百分点 —— 这是「陶土掺石英砂 10% + 草木灰 5%」的定量依据。',
      '★ 为什么要控收缩：收缩不均产生内应力，厚壁件内外不同步 → 开裂。',
      '  所以「薄壁能快、厚壁必须慢」不只是热应力，收缩也是原因。',
      '⚠ 这是线性收缩率；体积收缩 ≈ 3 × 线性收缩（小量时近似）。',
    ].join(''),
    keys: ['收缩', '坯体', '干燥', '熟料', '开裂'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['materials', 'engineering'],
  },
  {
    id: 'error_propagation',
    cat: 'engineering/process',
    name: '测量误差传播（谁主导不确定度）',
    expr: 'result_value * sqrt((relative_error_a * weight_a)^2 + (relative_error_b * weight_b)^2)',
    params: {
      result_value: req('由 a、b 算出的结果值'),
      relative_error_a: req('参数 a 的相对误差（Δa/a；±0.1g 测 100g → 0.001）'),
      weight_a: p(1, 'a 在公式里的幂次（a/b 中 a 为 1、a² 为 2）'),
      relative_error_b: req('参数 b 的相对误差（Δb/b；±0.5mL 测 50mL → 0.01）'),
      weight_b: p(1, 'b 的幂次（a/b 中 b 为 −1，平方后仍是 1）'),
    },
    unit: '与 result_value 同单位（结果的绝对不确定度）',
    desc: [
      'σ_y = |y|·√(Σ(wᵢ·σᵢ/xᵢ)²)，wᵢ 是该量的幂次。**误差传播的实用式**。',
      '★ 最重要的用途不是算 σ，而是**找出谁主导**：',
      '  密度 ρ=m/V，m=100±0.1g、V=50±0.5mL → ρ=2.000±0.020',
      '  其中**体积贡献 99%**、质量只占 1%。',
      '★ 于是结论明确：**改进天平毫无意义，要换更准的量筒**。',
      '  这就是误差传播的全部价值 —— 它告诉你钱该花在哪。',
      '★ 幂次的作用：平方项让大误差主导，所以「最差的那个量」几乎决定全部精度 ——',
      '  这是「木桶原理」的定量形式。',
      '★ 设定集应用：「±0.5mm 标准尺」「±1g 砝码」「±1~2 分钟/天」一旦进链条就会被放大，',
      '  必须算传播才知道成品精度能到哪。',
      '⚠ 假设各量误差独立且正态；有系统偏差时需另加。',
      '⚠ 只在「乘除为主」的公式里用相对误差形式；加减为主时换成绝对误差相加。',
    ].join(''),
    keys: ['误差', '不确定度', '传播', '精度', '主导项'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  // ══════════════════════════════════════════════════════════════════
  // 养分循环与投资回本（外部反馈 A4 / M1 通用化版）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'soil_nutrient_balance',
    cat: 'engineering/process',
    name: '土壤养分平衡（连作多久会耗竭）',
    expr: 'stock + (input - uptake - leach) * years',
    params: {
      stock: p(2000, '土壤有效养分库存（kg/ha，耕地典型 1500~2500）'),
      input: req('年投入（kg/ha/年）：化肥、绿肥、秸秆回田、豆科固氮、沉降'),
      uptake: req('年吸收（kg/ha/年）：作物带走 + 挥发损失（谷类 60~120）'),
      leach: req('年淋失（kg/ha/年）：随水流失（沙土 30~50、黏土 10~20）'),
      years: p(10, '持续年数'),
    },
    unit: 'kg/ha（years 年后的库存）',
    desc: [
      'N(t+1) = N(t) + 投入 − 吸收 − 淋失。**连作能不能持续，一算就知道**。',
      '★ 实测三档（每公顷每年 kg N）：',
      '  传统连作（草木灰回田，无外源）  投入 15 − 吸收 60 − 淋失 20 = **−65**',
      '  施绿肥/沤肥                   投入 80 − 吸收 60 − 淋失 25 = **−5**',
      '  轮作休耕年                    投入 40 − 吸收 10 − 淋失 15 = **+15**',
      '★ 这就是「为什么要休耕」的定量理由：连作每年亏 65，库存 2000 只够 **31 年**；',
      '  而休耕年每年回补 15，十年能把亏空补回来。',
      '★ 关键洞察：**吸收与淋失是「出口」，投入是「入口」**，三者同等重要 ——',
      '  只盯着「多施肥」而不减少淋失（沙土、漫灌），效率很低。',
      '★ 反推用途：已知还能种几年 → 反推每年至少需要多少投入才可持续（令净变化=0）。',
      '⚠ 只算单一养分（氮最常见）。磷钾的循环慢得多，不能用同一套数字。',
      '⚠ 库存不是「配方指标」而是经验值：真正耕地还有大量难溶态养分，只是不能用。',
    ].join(''),
    keys: ['养分', '土壤', '休耕', '连作', '地力', '氮', 'nutrient'],
    frequency: 'high',
    layer: 'derived',
    domains: ['agriculture', 'biology'],
  },
  {
    id: 'nutrient_sustainable_input',
    cat: 'engineering/process',
    name: '可持续所需的年投入（令净变化为零）',
    expr: 'uptake + leach',
    params: {
      uptake: req('年吸收（kg/ha/年）'),
      leach: req('年淋失（kg/ha/年）'),
    },
    unit: 'kg/ha/年（维持库存不降所需的最低投入）',
    desc: [
      '投入 ≥ 吸收 + 淋失 才能维持。**这是「必须补多少」的下限**。',
      '★ 与 `soil_nutrient_balance` 配套：那条算「会亏多少」，这条算「至少补多少」。',
      '★ 实测对照：吸收 60 + 淋失 20 = 80 kg N/ha/年 ——',
      '  而传统连作只能投入 15，缺口 65，正是要开垦新地或休耕的原因。',
      '★ 最有用的推论：**减少淋失等于增加投入**。',
      '  黏土比沙土少淋失 30~40 kg，效果相当于多施同等量的肥 ——',
      '  而改土（掺黏、加深耕层）的成本远低于年年买肥。',
      '⚠ 只对「库存可测的单一养分」成立；多元素要各算一遍。',
    ].join(''),
    keys: ['养分', '投入', '可持续', '淋失', '施肥量'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['agriculture'],
  },
  {
    id: 'payback_period',
    cat: 'econ/finance',
    name: '投资回本期（多少年回本）',
    expr: 'upfront_cost / annual_saving',
    params: {
      upfront_cost: req('一次性投入（工时、材料、折合的共同单位）'),
      annual_saving: req('每年节省（同单位）：省下的工时 / 燃料 / 损耗'),
    },
    unit: '年（回本所需时间；越小越好）',
    desc: [
      'T = 投入 / 年节省。**「这项改造值不值得做」的最短答案**。',
      '★ 与库里已有的 ROI 互补：`roi` 给「回报率」，`npv_simple` 给「折现后净值」，',
      '  而回本期给的是**时间尺度** —— 它更容易判断，因为你只需要知道「我还活不活得到那天」。',
      '★ 典型对照（同一套单位：工时）：',
      '  铁斧（投入 40 工时，年省 20 工时）→ 2 年回本 —— 立即值得',
      '  第二座窑（投入 480 工时，年省 120）→ 4 年 —— 要判断能不能撑到那时',
      '  终极墙（投入 336 工时，年省 24）→ 14 年 —— 属于「留给后人」的投资',
      '★ 判据不是「回本期越短越好」，而是**回本期 < 你还打算干活的年数**。',
      '  这就是为什么乱世里长回本周期的工程没人做。',
      '⚠ 简化式：不含折现、不含维护费用、假设年节省恒定。',
      '  要严谨就用 `npv_simple`；回本期是「快速筛一遍」的工具。',
      '⚠ 年节省必须与投入同单位。工时对工时、能量对能量 —— 混单位会得到荒谬结果。',
    ].join(''),
    keys: ['回本', '回收期', 'payback', '投资', '值不值得'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics'],
  },
]
