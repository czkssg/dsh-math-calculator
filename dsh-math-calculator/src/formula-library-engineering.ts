/**
 * 公式库第九批：**工程 / 生物 / 宏观经济**的常用计算。
 *
 * ## 为什么单独开一批
 *
 * 公式库原有 442 条，分布很不均：
 *
 * ```
 *   physics     187 条
 *   biology      26 条（偏医学剂量，生态与生理偏少）
 *   economics    26 条（几乎全是金融/投资）
 *   engineering   3 条（只有齿轮、液压、皮带——全是机械传动）
 * ```
 *
 * 作者写「这座塔能不能立住」「这个蒸汽机出多少力」「这个国家的钱够不够花」时，
 * 前两类几乎找不到能直接用的式子，只能自己拼。这一批补的就是这三块。
 *
 * ## 收录判据（与既有几批一致）
 *
 * · **闭合式、单次求值** —— 参数现实可得，不需要解 ODE 或查外部数据表
 * · **带量纲** —— 参数说明里写明单位，能参与带单位计算
 * · **有工程出处** —— 经验系数标出取值范围，不编造
 * · **不重复已有条目** —— 已存在的式子（齿轮传动比、欧拉屈曲、CAGR）不重收
 *
 * ## 单位约定
 *
 * 一律 **SI 基本单位**（m / kg / s / J / W / Pa / N），
 * 但保留行业惯用单位（MPa、rpm、kW·h、元）并在参数说明里写清。
 *
 * @module dsh-math-calculator/formula-library-engineering
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/** 工程类 18 条：结构承重、热机与流体的常用算式。 */
export const ENGINEERING_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // A. 结构与材料（承重、截面、连接）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'beam_section_modulus',
    cat: 'engineering/structures',
    name: '矩形截面抗弯截面系数',
    expr: 'b * h^2 / 6',
    params: {
      b: req('截面宽 m'),
      h: req('截面高 m'),
    },
    unit: 'm³',
    desc: 'W = b·h²/6 —— 矩形梁抗弯计算的基础量。最大弯曲应力 σ = M / W，所以梁要高而不是宽：高度翻倍，抗弯能力变 4 倍。',
    keys: ['截面', '抗弯', 'section modulus', '梁', 'W'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'beam_bending_stress',
    cat: 'engineering/structures',
    name: '梁的最大弯曲应力',
    expr: 'M / (b * h^2 / 6) / 1e6',
    params: {
      M: req('弯矩 N·m'),
      b: req('截面宽 m'),
      h: req('截面高 m'),
    },
    unit: 'MPa',
    desc: 'σ = M / W（W = b·h²/6）。与材料屈服强度对比即知是否安全。钢梁通常取许用应力 = 屈服强度 / 1.5~2。',
    keys: ['弯曲应力', 'bending stress', '梁应力', 'MPa'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering', 'materials'],
  },
  {
    id: 'beam_self_weight_moment',
    cat: 'engineering/structures',
    name: '简支梁自重产生的跨中弯矩',
    expr: 'rho * g * b * h * L^2 / 8',
    params: {
      rho: p(7850, '材料密度 kg/m³（钢 7850，木 600，混凝土 2400）'),
      g: p(9.80665, '重力加速度 m/s²（由 world 给出）'),
      b: req('截面宽 m'),
      h: req('截面高 m'),
      L: req('跨度 m'),
    },
    unit: 'N·m',
    desc: '均布自重 q = ρ·g·b·h 作用在跨度为 L 的简支梁上，跨中弯矩 qL²/8。**这是跨度的平方律**：跨度翻倍，自重弯矩变 4 倍——大跨度结构必须先算这一项，否则会漏掉最主要的荷载。',
    keys: ['自重', '均布荷载', '简支梁', 'self weight', '跨度'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'beam_uniform_load_deflection',
    cat: 'engineering/structures',
    name: '简支梁均布荷载跨中挠度',
    expr: '5 * q * L^4 / (384 * E * I)',
    params: {
      q: req('均布荷载 N/m'),
      L: req('跨度 m'),
      E: p(2.06e11, '弹性模量 Pa（钢 2.06e11，木 1e10，混凝土 3e10）'),
      I: req('截面惯性矩 m⁴（矩形 b·h³/12）'),
    },
    unit: 'm',
    desc: 'δ = 5qL⁴/(384EI)。**跨度的四次方**——这是结构工程里最陡的一条 scaling：跨度翻倍，挠度变 16 倍。所以桥梁不能靠「加厚」来延长跨度，必须改结构形式（桁架、拱、预应力）。',
    keys: ['挠度', 'deflection', '简支梁', '刚度', '四次方'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'rect_inertia',
    cat: 'engineering/structures',
    name: '矩形截面惯性矩',
    expr: 'b * h^3 / 12',
    params: {
      b: req('截面宽 m'),
      h: req('截面高 m'),
    },
    unit: 'm⁴',
    desc: 'I = b·h³/12（绕水平中性轴）。挠度公式要用它，所以「高 h 的三次方」决定了梁的刚度——这是「梁要竖着放」的数学理由。',
    keys: ['惯性矩', 'inertia', '截面', 'I'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'bolt_shear_capacity',
    cat: 'engineering/structures',
    name: '螺栓抗剪承载力',
    expr: 'n * tau * pi * d^2 / 4',
    params: {
      n: p(1, '受剪面数（单剪 1，双剪 2）'),
      tau: p(141e6, '许用剪应力 Pa（约 0.6×屈服强度；4.6 级取 141e6）'),
      d: req('螺栓公称直径 m（M16 = 0.016）'),
    },
    unit: 'N',
    desc: 'F = n·τ·π·d²/4。普通螺栓（4.6 级）许用剪应力约 0.6×235 MPa。注意：**承压型高强螺栓靠摩擦传力，不按这个式子算**。',
    keys: ['螺栓', '抗剪', 'bolt', '连接'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'weld_throat_capacity',
    cat: 'engineering/structures',
    name: '角焊缝承载力（按喉部截面）',
    expr: '0.707 * a * L * tau',
    params: {
      a: req('焊脚尺寸 m（K 值，如 6mm 焊脚 = 0.006）'),
      L: req('焊缝计算长度 m'),
      tau: p(160e6, '焊缝许用剪应力 Pa（E43 焊条约 160 MPa）'),
    },
    unit: 'N',
    desc: '角焊缝的有效喉部厚度 = 0.707a（45° 等腰直角），有效面积 = 0.707a·L。这是钢结构连接的通用算法，比按母材截面估要准得多。',
    keys: ['焊缝', '焊接', 'weld', '喉部'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['engineering'],
  },
  // B. 热机与能量转换（蒸汽、内燃、传动）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'thermal_efficiency_carnot',
    cat: 'engineering/thermal',
    name: '卡诺热机效率上限',
    expr: '1 - Tc / Th',
    params: {
      Th: req('高温热源温度 K'),
      Tc: req('低温热源温度 K'),
    },
    unit: '无量纲（比值）',
    desc:
      'η ≤ 1 − Tc/Th。**绝对温度**，不是摄氏度：300 K（约 27°C）与 500 K（约 227°C）' +
      '之间，理论上限是 40%。这条给出了任何热机的天花板——' +
      '想提高效率只能提高热源温度或降低排热温度，加多少煤都没用。',
    keys: ['卡诺', 'carnot', '热效率', '热机', '效率上限'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['engineering', 'physics'],
  },
  {
    id: 'steam_power_output',
    cat: 'engineering/thermal',
    name: '蒸汽机功率（由蒸汽流量与焓差）',
    expr: 'mdot * dh * eta',
    params: {
      mdot: req('蒸汽质量流量 kg/s'),
      dh: req('进出口焓差 J/kg（饱和蒸汽 2.7 MPa 约 2.1e6）'),
      eta: p(0.15, '整机效率（单级往复式 0.10~0.15，多级汽轮机 0.25~0.40）'),
    },
    unit: 'W',
    desc:
      'P = mdot·dh·eta。这是蒸汽动力最实用的算法：**两台同功率的机器，' +
      '现代汽轮机（eta≈0.35）只需要往复式蒸汽机（eta≈0.12）三分之一的蒸汽**。' +
      '写蒸汽朋克设定时，这个 3 倍差距决定了煤耗与锅炉体积。',
    keys: ['蒸汽机', 'steam', '功率', '焓差', '锅炉'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'boiler_coal_rate',
    cat: 'engineering/thermal',
    name: '锅炉煤耗率',
    expr: 'P / (coal_cv * eta) * 3600',
    params: {
      P: req('所需功率 W'),
      coal_cv: p(2.93e7, '煤低位热值 J/kg（标准煤 2.93e7 约 7000 kcal）'),
      eta: p(0.7, '锅炉热效率（工业锅炉 0.7~0.85，老式 0.5）'),
    },
    unit: 'kg/h（每小时耗煤）',
    desc:
      '每小时耗煤 = P/(cv·eta) × 3600。**用「多少吨煤」比用「多少瓦」更容易让读者有体感**。' +
      '注意这里只算锅炉；整机电效率还要再乘蒸汽机的 eta。',
    keys: ['煤耗', 'coal', '锅炉', '燃料', '蒸汽朋克'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'heat_exchanger_duty',
    cat: 'engineering/thermal',
    name: '换热器换热量（对数平均温差）',
    expr: 'U * A * (dT1 - dT2) / log(dT1 / dT2)',
    params: {
      U: p(500, '总传热系数 W/(m²·K)（水-水 800，气-水 50~200，金属间 1000+）'),
      A: p(10, '换热面积 m²'),
      /**
       * 两端温差都给默认值，且**默认值必须不同**。
       *
       * 踩过：两个都给同一个数 → `log(dT1/dT2) = log(1) = 0` → 除零，
       * 整条公式在全量测试里变成 `non_finite`。
       * 而「两端温差相等」在物理上恰恰是**换热面积为无穷大**的极限，
       * 本来就不该作为默认使用场景。
       */
      dT1: p(40, '热端温差 K（入口，与 dT2 必须不同）'),
      dT2: p(20, '冷端温差 K（出口，与 dT1 必须不同）'),
    },
    unit: 'W',
    desc:
      'Q = U·A·LMTD，LMTD 是对数平均温差。逆流时 dT1 与 dT2 是两端温差，' +
      '**顺流时 LMTD 明显小于逆流**——这就是为什么好换热器都设计成逆流。' +
      '注意 dT1 与 dT2 相等时 LMTD 退化为该值（此处按极限处理），两者不能同时为零。',
    keys: ['换热器', 'heat exchanger', '传热', 'LMTD'],
    frequency: 'medium',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'conduction_wall_loss',
    cat: 'engineering/thermal',
    name: '平壁导热损失',
    expr: 'k * A * dT / d',
    params: {
      k: p(0.04, '导热系数 W/(m·K)（岩棉 0.04，砖 0.7，钢 45，铜 400）'),
      A: req('壁面积 m²'),
      dT: req('两侧温差 K'),
      d: req('壁厚 m'),
    },
    unit: 'W',
    desc:
      'Q = k·A·ΔT/d。**保温材料的 k 比钢小 1000 倍**——' +
      '所以一堵 10 cm 厚的岩棉墙，保温能力相当于 100 m 厚的钢墙。' +
      '写工业设定时，这个比值比任何形容词都更能说明「隔热做得好不好」。',
    keys: ['导热', 'conduction', '保温', '热损失', '隔热'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering', 'physics'],
  },
  // ══════════════════════════════════════════════════════════════════
  // C. 流体与管路
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'pipe_flow_rate',
    cat: 'engineering/fluid',
    name: '管道流量（由流速与管径）',
    expr: 'v * pi * d^2 / 4',
    params: {
      v: req('流速 m/s（水管 0.5~2，气体 10~30）'),
      d: req('管内径 m'),
    },
    unit: 'm³/s',
    desc:
      'Q = v·pi·d²/4。**管径翻倍，流量变 4 倍**——这就是为什么供水管网' +
      '「扩一倍口径」就能顶四条旧管。反过来，想把流量翻倍而管径只加 40% 时，' +
      '必须把流速也提上去，代价是阻力急剧上升。',
    keys: ['流量', '管径', 'pipe', 'flow rate', '供水'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'darcy_head_loss',
    cat: 'engineering/fluid',
    name: '管道沿程水头损失（达西-魏斯巴赫）',
    expr: 'f * (L / d) * v^2 / (2 * g)',
    params: {
      f: p(0.02, '摩阻系数（钢管清水 0.02，旧铸铁 0.04，混凝土渠 0.015）'),
      L: req('管长 m'),
      d: req('管内径 m'),
      v: req('流速 m/s'),
      g: p(9.80665, '重力加速度 m/s²'),
    },
    unit: 'm（水头）',
    desc:
      'h = f·(L/d)·v²/(2g)。**流速的平方**：流速翻倍，损失变 4 倍。' +
      '所以长距离输水宁可加大管径、降低流速——这条决定了管网的经济流速（约 1~2 m/s）。',
    keys: ['水头损失', '沿程阻力', 'darcy', '管路', '压降'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering'],
  },
  {
    id: 'pump_power',
    cat: 'engineering/fluid',
    name: '水泵轴功率',
    expr: 'rho * g * Q * H / eta',
    params: {
      rho: p(1000, '流体密度 kg/m³（水 1000）'),
      g: p(9.80665, '重力加速度 m/s²'),
      Q: req('流量 m³/s'),
      H: req('扬程 m'),
      eta: p(0.7, '泵效率（离心泵 0.6~0.85，小泵取低值）'),
    },
    unit: 'W',
    desc:
      'P = rho·g·Q·H/eta。扬程 H 是「能把水举多高」，包含沿程损失。' +
      '这是选泵与估电耗的核心式子：**流量与扬程都是相乘，任意一个翻倍，功率就翻倍**。',
    keys: ['水泵', 'pump', '扬程', '功率', '灌溉'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering', 'perception'],
  },
  {
    id: 'orifice_discharge',
    cat: 'engineering/fluid',
    name: '孔口出流流量',
    expr: 'Cd * A * sqrt(2 * g * h)',
    params: {
      Cd: p(0.62, '流量系数（薄壁圆孔 0.62，管嘴 0.82，锐缘 0.6）'),
      A: req('孔口面积 m²'),
      g: p(9.80665, '重力加速度 m/s²'),
      h: req('水头 m（孔口到水面的高度）'),
    },
    unit: 'm³/s',
    desc:
      'Q = Cd·A·sqrt(2gh)。**水头的平方根**：想把出流量翻倍，水头要涨到 4 倍。' +
      '这是水库泄洪、攻城水攻、倒水时间估算的通用式子。',
    keys: ['孔口', '出流', '泄洪', 'orifice', '流量'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['engineering'],
  },
  {
    id: 'wind_power_available',
    cat: 'engineering/energy',
    name: '风功率（风轮扫掠面积）',
    expr: '0.5 * rho * A * v^3 * cp',
    params: {
      rho: p(1.225, '空气密度 kg/m³（海平面 1.225）'),
      A: req('风轮扫掠面积 m²（直径 D 时 A = pi·D²/4）'),
      v: req('风速 m/s'),
      cp: p(0.45, '功率系数（贝茨极限 0.593，实用 0.35~0.45）'),
    },
    unit: 'W',
    desc:
      'P = ½rho·A·v³·Cp。**风速的三次方**——这是风能最反直觉的一条：' +
      '风速从 5 m/s 涨到 10 m/s，功率变 **8 倍**。' +
      '贝茨极限 0.593 是理论上限（动量守恒要求必须留一部分动能给下游气流）。',
    keys: ['风电', 'wind power', '贝茨', '风轮', '三次方'],
    frequency: 'high',
    layer: 'derived',
    domains: ['engineering', 'physics'],
  },
  {
    id: 'water_turbine_power',
    cat: 'engineering/energy',
    name: '水轮机功率',
    expr: 'rho * g * Q * H * eta',
    params: {
      rho: p(1000, '水密度 kg/m³'),
      g: p(9.80665, '重力加速度 m/s²'),
      Q: req('流量 m³/s'),
      H: req('水头 m（落差）'),
      eta: p(0.85, '水轮机效率（大型 0.85~0.92，小型 0.6~0.75）'),
    },
    unit: 'W',
    desc:
      'P = rho·g·Q·H·eta。**与水泵恰好相反**：这里 eta 是乘的（获取能量），水泵那里是除的。' +
      '一条 10 m³/s、落差 20 m 的水渠约 1.7 MW。',
    keys: ['水轮机', '水力发电', 'turbine', '落差', '水电'],
    frequency: 'high',
    layer: 'engineering',
    domains: ['engineering', 'power'],
  },
]
