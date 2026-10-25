/**
 * 公式库第七批：**通用计算基础件**。
 *
 * ## 为什么补这一批
 *
 * 前六批偏物理推演与叙事感知（重力、气候、行军、建筑）。但插件定位是
 * **计算器**，而实测 35 个常见计算需求只命中 17 个 —— 缺的集中在金融、
 * 几何、化学、电学、工程这五类，恰恰是用户日常最常算的。
 *
 * 例如「房贷 100 万、30 年、4.9%，月供多少」，之前完全算不了。
 *
 * ## mathjs 的两个坑（本文件已避开）
 *
 * 1. **`log` 是自然对数，不是常用对数。** 要 log₁₀ 必须写 `log10`。
 *    写成 `ln` 会得到 undefined 且不报错（吃过这个亏）。
 * 2. **三角函数默认弧度。** 公式里一律用弧度，参数说明写清；
 *    用户给角度时先用 `units` 或 `evaluate` 转成弧度。
 *
 * ## 单位约定
 *
 * 与前六批一致：**SI 基本单位**（m / kg / s / J / W）。
 * 时长类参数单独注明是天、月、年，并在参数描述里写出来 ——
 * 这类混用最容易出错。
 *
 * @module dsh-math-calculator/formula-library-basic
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/**
 * 第七批公式：通用计算基础件（金融 / 几何 / 化学 / 电学 / 工程 / 天文）。
 */
export const BASIC_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 金融：贷款、利息、现值、通胀
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'loan_payment',
    cat: 'econ/finance',
    name: '等额本息月供',
    expr: 'P * (annual_rate / 12) * (1 + annual_rate / 12)^months / ((1 + annual_rate / 12)^months - 1)',
    params: {
      P: req('贷款本金'),
      annual_rate: p(0.049, '年利率（小数，4.9% 写 0.049）'),
      months: req('还款月数（30 年 = 360）'),
    },
    unit: '每期还款额（与本金同币种）',
    desc:
      '房贷 / 车贷的标准算法。⚠️ 年利率为 0 时会除零 —— 那种情况直接 本金 / 月数。' +
      '总利息 = 月供 × 月数 − 本金。',
    keys: ['loan', '月供', '房贷', 'mortgage', '等额本息'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'simple_interest',
    cat: 'econ/finance',
    name: '单利终值',
    expr: 'P * (1 + r * t)',
    params: {
      P: req('本金'),
      r: req('年利率（小数）'),
      t: req('年数'),
    },
    unit: '与本金同币种',
    desc: '只对本金计息。对比 compound_interest 看复利差多少。',
    keys: ['simple interest', '单利', '利息'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'annuity_present_value',
    cat: 'econ/finance',
    name: '年金现值',
    expr: 'pmt * (1 - (1 + r)^(-n)) / r',
    params: {
      pmt: req('每期金额'),
      r: req('每期利率（小数）'),
      n: req('期数'),
    },
    unit: '现值（与每期金额同币种）',
    desc:
      '未来每期收一笔钱，折算到今天的价值。「这份年金现在值多少」。' +
      'r 为 0 时直接 pmt × n。',
    keys: ['annuity', '年金', '现值'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'npv_simple',
    cat: 'econ/finance',
    name: '净现值 NPV（等额现金流）',
    expr: 'cf * (1 - (1 + r)^(-n)) / r - initial',
    params: {
      cf: req('每期净现金流'),
      r: req('每期折现率（小数）'),
      n: req('期数'),
      initial: p(0, '初始投入'),
    },
    unit: '与现金流同币种',
    desc: '大于 0 表示这项投资按该折现率划算。',
    keys: ['npv', '净现值', '折现'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'depreciation_straight_line',
    cat: 'econ/finance',
    name: '直线折旧（年折旧额）',
    expr: '(cost - salvage) / years',
    params: {
      cost: req('购置成本'),
      salvage: p(0, '残值'),
      years: req('使用年限'),
    },
    unit: '每年折旧额',
    desc: '最简单的折旧法。余额递减法等会计方法不在此列。',
    keys: ['depreciation', '折旧'],
    frequency: 'medium',
    layer: 'conventional',
    domains: ['economics'],
  },
  {
    id: 'break_even_units',
    cat: 'econ/finance',
    name: '盈亏平衡销量',
    expr: 'fixed_cost / (price - unit_cost)',
    params: {
      fixed_cost: req('固定成本总额'),
      price: req('单件售价'),
      unit_cost: req('单件变动成本'),
    },
    unit: '件',
    desc:
      '卖多少件才不亏。售价 ≤ 变动成本时无解（每卖一件都在亏），' +
      '此时会算出负数或无穷 —— 那本身就是结论。',
    keys: ['break even', '盈亏平衡', '保本'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'effective_annual_rate',
    cat: 'econ/finance',
    name: '实际年利率 EAR',
    expr: '(1 + nominal_rate / n)^n - 1',
    params: {
      nominal_rate: p(0.049, '名义年利率（小数）'),
      n: p(12, '每年复利次数（12 = 月复利）'),
    },
    unit: '小数（× 100 得百分比）',
    desc:
      '月复利的名义 4.9% 不等于实际 4.9%。n 越大越接近连续复利 e^r − 1。' +
      '对比信用卡与房贷时看这个，不看名义利率。',
    keys: ['ear', '实际利率', '复利次数'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'compound_growth_time',
    cat: 'econ/finance',
    name: '复利翻倍所需年数',
    expr: 'log(target / P) / log(1 + r)',
    params: {
      P: req('本金'),
      target: req('目标金额'),
      r: req('年利率（小数）'),
    },
    unit: '年',
    desc:
      '「多久能翻倍」直接用它。约等于 72/r(%) 的「72 法则」，但这是精确解。' +
      '⚠️ mathjs 的 log 是自然对数，这里两处都是，所以比值正确。',
    keys: ['翻倍', '复利时间', 'double', '72 rule'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'purchasing_power',
    cat: 'econ/finance',
    name: '通胀后的购买力',
    expr: 'P / (1 + inflation)^years',
    params: {
      P: req('今天的金额'),
      inflation: p(0.03, '年通胀率（小数）'),
      years: req('年数'),
    },
    unit: '相当于今天的购买力',
    desc:
      '「三十年后这笔钱还值多少」。反向问「到时候要多少钱才有同等购买力」用 ' +
      'P × (1+inflation)^years。',
    keys: ['inflation', '通胀', '购买力'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['economics'],
  },
  {
    id: 'markup_margin',
    cat: 'econ/finance',
    name: '毛利率',
    expr: '(price - cost) / price',
    params: { price: req('售价'), cost: req('成本') },
    unit: '小数（× 100 得百分比）',
    desc:
      '注意与「加价率」(price−cost)/cost 不同：成本 60 卖 100，' +
      '毛利率 40%、加价率 66.7%。谈生意时这两个常被混用。',
    keys: ['margin', '毛利', '加价'],
    frequency: 'medium',
    layer: 'conventional',
    domains: ['economics'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 几何：三角形、扇形、曲面体
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'law_of_cosines',
    cat: 'math/geometry',
    name: '余弦定理（求第三边）',
    expr: 'sqrt(a^2 + b^2 - 2 * a * b * cos(angle_c))',
    params: {
      a: req('第一边'),
      b: req('第二边'),
      angle_c: req('两边的夹角（**弧度**）'),
    },
    unit: '与输入长度同单位',
    desc:
      '已知两边及夹角求第三边。⚠️ 夹角用弧度；给角度时先乘 π/180。' +
      '也用于「已知三边求角」的反向解：cosC = (a²+b²−c²)/(2ab)。',
    keys: ['cosine law', '余弦定理', '三角形', 'third side'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'law_of_sines',
    cat: 'math/geometry',
    name: '正弦定理',
    expr: 'a * sin(angle_b) / sin(angle_a)',
    params: {
      a: req('已知边'),
      angle_a: req('该边对角（**弧度**）'),
      angle_b: req('待求边对角（**弧度**）'),
    },
    unit: '与输入长度同单位',
    desc: 'a/sinA = b/sinB。已知一边两角求另一边，测距与航海常用。',
    keys: ['sine law', '正弦定理', '测距'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'sector_area',
    cat: 'math/geometry',
    name: '扇形面积',
    expr: '0.5 * r^2 * theta',
    params: {
      r: req('半径'),
      theta: req('圆心角（**弧度**）'),
    },
    unit: '面积（与半径单位平方一致）',
    desc: 'θ 用弧度。弧长用 r × θ。整圆 θ = 2π。',
    keys: ['sector', '扇形', 'arc'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'spherical_cap_volume',
    cat: 'math/geometry',
    name: '球冠体积',
    expr: 'pi * h^2 * (3 * r - h) / 3',
    params: { r: req('球半径'), h: req('球冠高度') },
    unit: '体积',
    desc:
      '被平面切下的那部分球体。h = r 时退化为半球（2πr³/3），' +
      'h = 2r 时是整个球（4πr³/3）—— 可用来验算。',
    keys: ['spherical cap', '球冠', 'segment'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'trapezoid_area',
    cat: 'math/geometry',
    name: '梯形面积',
    expr: '(a + b) * h / 2',
    params: { a: req('上底'), b: req('下底'), h: req('高') },
    unit: '面积',
    desc: '「上底加下底乘高除以二」。a = b 时退化为矩形。',
    keys: ['trapezoid', '梯形'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'ellipse_area',
    cat: 'math/geometry',
    name: '椭圆面积',
    expr: 'pi * a * b',
    params: { a: req('半长轴'), b: req('半短轴') },
    unit: '面积',
    desc: 'a = b 时退化为圆。椭圆周长没有初等闭式，需椭圆积分。',
    keys: ['ellipse', '椭圆'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'torus_volume',
    cat: 'math/geometry',
    name: '圆环体体积',
    expr: '2 * pi^2 * R * r^2',
    params: {
      R: req('环中心半径（大半径）'),
      r: req('管半径（小半径）'),
    },
    unit: '体积',
    desc: '甜甜圈形状的体积。R 必须大于 r，否则管子自相交。',
    keys: ['torus', '圆环', '甜甜圈'],
    frequency: 'low',
    layer: 'engineering',
    domains: ['math'],
  },
  {
    id: 'regular_polygon_area',
    cat: 'math/geometry',
    name: '正多边形面积',
    expr: 'n * s^2 / (4 * tan(pi / n))',
    params: {
      n: req('边数'),
      s: req('边长'),
    },
    unit: '面积',
    desc: 'n = 4 且 s 为边长时得正方形面积 —— 可用来验算。',
    keys: ['polygon', '正多边形'],
    frequency: 'low',
    layer: 'engineering',
    domains: ['math'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 化学：溶度积、滴定、浓度表达
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'solubility_product',
    cat: 'chemistry/solution',
    name: '溶度积 Ksp',
    expr: 'cation^m * anion^n',
    params: {
      cation: req('阳离子浓度 mol/L'),
      anion: req('阴离子浓度 mol/L'),
      m: p(1, '阳离子计量数'),
      n: p(1, '阴离子计量数'),
    },
    unit: '(mol/L)^(m+n)',
    desc:
      '难溶盐的溶解平衡常数。离子积 Q > Ksp 时沉淀析出，Q < Ksp 时会继续溶解。' +
      '计量数按化学式：CaCl₂ 的 m=1, n=2。',
    keys: ['ksp', '溶度积', '沉淀'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['chemistry'],
  },
  {
    id: 'titration_moles',
    cat: 'chemistry/solution',
    name: '滴定所需体积',
    expr: 'C1 * V1 / C2',
    params: {
      C1: req('已知液浓度 mol/L'),
      V1: req('已知液体积 mL'),
      C2: req('待测液浓度 mol/L'),
    },
    unit: 'mL',
    desc:
      'C₁V₁ = C₂V₂。1:1 反应的等当点。计量比不是 1:1 时先把 C₁ 除以计量比。',
    keys: ['titration', '滴定', '等当点'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['chemistry'],
  },
  {
    id: 'molality',
    cat: 'chemistry/solution',
    name: '质量摩尔浓度',
    expr: 'moles / kg_solvent',
    params: {
      moles: req('溶质摩尔数 mol'),
      kg_solvent: req('**溶剂**质量 kg（不是溶液质量）'),
    },
    unit: 'mol/kg',
    desc:
      '与体积摩尔浓度不同，它不受温度影响（体积会热胀冷缩）。' +
      '凝固点降低、沸点升高的公式用的是这个。',
    keys: ['molality', '质量摩尔浓度'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['chemistry'],
  },
  {
    id: 'mass_percent',
    cat: 'chemistry/solution',
    name: '质量百分比浓度',
    expr: 'solute_mass / solution_mass * 100',
    params: {
      solute_mass: req('溶质质量'),
      solution_mass: req('**溶液**总质量'),
    },
    unit: '%',
    desc: '实验室最常见的浓度表达。注意分母是溶液不是溶剂。',
    keys: ['mass percent', '质量百分比', '浓度'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['chemistry'],
  },
  {
    id: 'ppm_concentration',
    cat: 'chemistry/solution',
    name: '百万分浓度 ppm',
    expr: 'solute_mass / solution_mass * 1e6',
    params: {
      solute_mass: req('溶质质量'),
      solution_mass: req('溶液总质量'),
    },
    unit: 'ppm',
    desc:
      '稀溶液常用。水溶液中 1 ppm ≈ 1 mg/L。' +
      '饮用水余氯、重金属限值都用这个口径。',
    keys: ['ppm', '百万分', '微量'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['chemistry'],
  },
  {
    id: 'gas_volume_stp',
    cat: 'chemistry/mole',
    name: '标准状况气体体积',
    expr: 'moles * 22.414',
    params: { moles: req('气体摩尔数 mol') },
    unit: 'L',
    desc:
      'STP（273.15 K, 1 atm）下 1 mol 理想气体约 22.414 L。' +
      '非标准状况用 PV=nRT（operation="evaluate" 可直接算）。',
    keys: ['stp', '气体体积', 'molar volume'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['chemistry'],
  },
  {
    id: 'particles_from_moles',
    cat: 'chemistry/mole',
    name: '摩尔数换算粒子数',
    expr: 'n * 6.02214076e23',
    params: { n: req('摩尔数 mol') },
    unit: '个',
    desc: '阿伏伽德罗常数取 2019 SI 定义值。反向除一下即得摩尔数。',
    keys: ['avogadro', '阿伏伽德罗', '粒子数'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['chemistry'],
  },
  {
    id: 'radioactive_remaining',
    cat: 'chemistry/nuclear',
    name: '放射性剩余量',
    expr: 'N0 * (1 / 2)^(t / half_life)',
    params: {
      N0: req('初始量（质量/摩尔数/活度都可）'),
      t: req('经过时间'),
      half_life: req('半衰期（与 t 同单位）'),
    },
    unit: '与 N0 同单位',
    desc:
      '每过一个半衰期剩一半。⚠️ t 与 half_life 必须同单位。' +
      '习惯上 10 个半衰期后视为衰尽（剩 0.1%）。',
    keys: ['半衰期', 'half life', '衰变'],
    frequency: 'high',
    layer: 'derived',
    domains: ['chemistry', 'physics'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 电学：阻抗、分压、能耗
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'capacitive_reactance',
    cat: 'physics/em',
    name: '容抗',
    expr: '1 / (2 * pi * f * C)',
    params: {
      f: req('频率 Hz'),
      C: req('电容 F（1 µF = 1e-6）'),
    },
    unit: 'Ω',
    desc:
      '电容对交流的「等效电阻」。频率越高容抗越小（直流下相当于断路）。' +
      '⚠️ 电容单位是法拉，微法要乘 1e-6。',
    keys: ['reactance', '容抗', '电容'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics'],
  },
  {
    id: 'inductive_reactance',
    cat: 'physics/em',
    name: '感抗',
    expr: '2 * pi * f * L',
    params: {
      f: req('频率 Hz'),
      L: req('电感 H（1 mH = 1e-3）'),
    },
    unit: 'Ω',
    desc: '电感对交流的阻抗。频率越高感抗越大（直流下相当于短路）。',
    keys: ['reactance', '感抗', '电感'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics'],
  },
  {
    id: 'lc_resonance',
    cat: 'physics/em',
    name: 'LC 谐振频率',
    expr: '1 / (2 * pi * sqrt(L * C))',
    params: {
      L: req('电感 H'),
      C: req('电容 F'),
    },
    unit: 'Hz',
    desc: 'LC 回路自振频率。此频率下容抗与感抗相等、相互抵消。',
    keys: ['resonance', '谐振', 'lc'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics'],
  },
  {
    id: 'voltage_divider',
    cat: 'physics/em',
    name: '分压电路输出',
    expr: 'Vin * R2 / (R1 + R2)',
    params: {
      Vin: req('输入电压 V'),
      R1: req('上臂电阻 Ω'),
      R2: req('下臂电阻 Ω（输出取在它两端）'),
    },
    unit: 'V',
    desc: '两个电阻串联取中间电压。R2 越大输出越接近 Vin。',
    keys: ['voltage divider', '分压'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics'],
  },
  {
    id: 'energy_kwh',
    cat: 'physics/em',
    name: '用电量（度）',
    expr: 'power * hours / 1000',
    params: {
      power: req('功率 W'),
      hours: req('时长 小时'),
    },
    unit: 'kWh（度）',
    desc:
      '1000 W 用 1 小时 = 1 度。电费 = 度数 × 电价。' +
      '注意功率是 W 不是 kW，否则差 1000 倍。',
    keys: ['kwh', '度', '用电量', '电费'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['physics', 'economics'],
  },
  {
    id: 'battery_runtime',
    cat: 'physics/em',
    name: '电池续航时间',
    expr: 'capacity / load',
    params: {
      capacity: req('电池容量 mAh'),
      load: req('负载电流 mA'),
    },
    unit: '小时',
    desc:
      '理想值。实际受放电曲线、温度、内阻影响，通常只有 70—85%。' +
      '升压/降压电路还有效率损失。',
    keys: ['battery', '续航', '电池'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['physics'],
  },
  {
    id: 'transformer_turns',
    cat: 'physics/em',
    name: '变压器匝数比',
    expr: 'N1 * V2 / V1',
    params: {
      N1: req('初级匝数'),
      V1: req('初级电压 V'),
      V2: req('次级电压 V'),
    },
    unit: '次级匝数',
    desc:
      'N₁/N₂ = V₁/V₂。升压则次级匝数多。' +
      '⚠️ 电流反向：电压升几倍，电流就降到几分之一（功率守恒）。',
    keys: ['transformer', '变压器', '匝数'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 工程机械：传动、流体、热应力
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'gear_ratio',
    cat: 'engineering/mechanics',
    name: '齿轮传动比',
    expr: 'N2 / N1',
    params: {
      N1: req('主动轮齿数'),
      N2: req('从动轮齿数'),
    },
    unit: '倍',
    desc:
      '转速比 = N₁/N₂（与齿数比相反）；扭矩比 = N₂/N₁。' +
      '大于 1 表示减速增扭。多级传动把各级比值乘起来。',
    keys: ['gear', '齿轮', '传动比'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'reynolds_number',
    cat: 'physics/fluid',
    name: '雷诺数',
    expr: 'rho * v * D / mu',
    params: {
      rho: req('流体密度 kg/m³'),
      v: req('流速 m/s'),
      D: req('特征长度 m（管径等）'),
      mu: req('动力黏度 Pa·s（20°C 水约 1e-3）'),
    },
    unit: '无量纲',
    desc:
      '判断层流还是湍流。圆管中 Re < 2300 层流、> 4000 湍流、中间过渡。' +
      '⚠️ 用的是动力黏度 μ，不是运动黏度 ν（ν = μ/ρ）。',
    keys: ['reynolds', '雷诺数', '层流', '湍流'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics', 'engineering'],
  },
  {
    id: 'thermal_stress',
    cat: 'materials/structures',
    name: '热应力',
    expr: 'E * alpha * dT',
    params: {
      E: req('弹性模量 Pa（钢约 2e11）'),
      alpha: req('线膨胀系数 1/K（钢约 1.2e-5）'),
      dT: req('温差 K（也等于 °C 差）'),
    },
    unit: 'Pa',
    desc:
      '完全约束下温度变化产生的应力。这就是铁轨留缝、桥梁装伸缩缝的原因。' +
      '与材料抗压强度比较即可判断会不会开裂。',
    keys: ['thermal stress', '热应力', '膨胀'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['materials'],
  },
  {
    id: 'spring_energy',
    cat: 'physics/mechanics',
    name: '弹簧储能',
    expr: '0.5 * k * x^2',
    params: { k: req('弹性系数 N/m'), x: req('形变量 m') },
    unit: 'J',
    desc:
      '压缩或拉伸储存的能量。这正是弓弩、投石机、钟表发条的储能原理：' +
      '能量与形变量的**平方**成正比，所以拉两倍距离储能四倍。',
    keys: ['spring', '弹簧', '储能'],
    frequency: 'high',
    layer: 'derived',
    domains: ['physics'],
  },
  {
    id: 'hydraulic_force',
    cat: 'engineering/mechanics',
    name: '液压推力',
    expr: 'pressure * area',
    params: {
      pressure: req('液压 Pa'),
      area: req('活塞面积 m²'),
    },
    unit: 'N',
    desc:
      '帕斯卡原理：压力处处相等，所以小活塞小力 → 大活塞大力。' +
      '这正是液压千斤顶、挖掘机、刹车系统的原理。',
    keys: ['hydraulic', '液压', '帕斯卡'],
    frequency: 'high',
    layer: 'derived',
    domains: ['physics', 'engineering'],
  },
  {
    id: 'pulley_ratio',
    cat: 'engineering/mechanics',
    name: '皮带轮转速比',
    expr: 'D1 / D2',
    params: { D1: req('主动轮直径'), D2: req('从动轮直径') },
    unit: '倍',
    desc:
      '从动轮转速 = 主动轮转速 × (D₁/D₂)。与齿轮不同，' +
      '皮带轮靠摩擦，从动轮直径大则转得慢。',
    keys: ['pulley', '皮带轮', '转速比'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['engineering'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 天文：恒星寿命（此前只在 world 内部算，没暴露成公式）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'main_sequence_lifetime',
    cat: 'physics/astronomy',
    name: '主序星寿命',
    expr: '10 * M^(-2.5)',
    params: {
      M: req('恒星质量（**太阳质量**为单位）'),
    },
    unit: 'Gyr（十亿年）',
    desc:
      'τ ≈ 10 Gyr × M⁻²·²⁵（M 以太阳质量计）。大质量星亮但短命：' +
      '10 M☉ 只有约 3200 万年 —— 不够演化出复杂生命。' +
      '此式只在主序阶段成立，且对极端质量有偏差。',
    keys: ['stellar lifetime', '恒星寿命', '主序'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['astronomy'],
  },
]
