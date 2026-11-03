/**
 * 公式库：电学 / 光学 / 核物理与化学计量。
 *
 * ## 为什么单独成批
 *
 * 单位表补齐了 18 个量纲（电流、电压、电阻、磁通密度、照度、活度、
 * 吸收剂量、催化活度……），但**公式库几乎空白**：
 *
 * | 量纲 | 补齐前 |
 * |---|---|
 * | 磁通密度 / 立体角 / 发光强度 / 照度 | 0 条 |
 * | 放射性活度 / 吸收剂量 / 剂量当量 / 催化活度 | 0 条 |
 *
 * 有单位没公式 = 那批单位永远产出不出来。这一批按**该量纲最常被问到的量**
 * 补齐，每条都能独立算出该量纲的一个值。
 *
 * ## 收录判据（与其它批次一致）
 *
 * 能写成闭合式、参数现实可得、不依赖外部数据集。
 * 经验式必须标注适用域；只有在地球成立的，desc 里写明。
 *
 * @module dsh-math-calculator/formula-library-em
 */

import { CONSTANTS, type FormulaDef } from './formula-library.js'

/** 带默认值的参数。 */
const p = (value: number, desc: string) => ({ value, desc })
/** 必填参数。 */
const req = (desc: string) => ({ value: null, desc })

/**
 * 电学 / 光学 / 核物理 / 化学计量公式。
 */
export const EM_OPTICAL_NUCLEAR_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 电磁学 · 基本关系
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'ohm_current',
    cat: 'physics/em',
    name: '欧姆定律（求电流）',
    expr: 'V / R',
    params: { V: req('电压 V'), R: req('电阻 Ω') },
    unit: 'A',
    desc: 'I = V/R。与 ohm（求电压）互为逆式，避免每次自己移项。',
    keys: ['ohm', 'current', '欧姆', '电流'],
  },
  {
    id: 'ohms_law_resistance',
    cat: 'physics/em',
    name: '欧姆定律（求电阻）',
    expr: 'V / I',
    params: { V: req('电压 V'), I: req('电流 A') },
    unit: 'Ω',
    desc: 'R = V/I。',
    keys: ['resistance', '电阻'],
  },
  {
    id: 'electric_power_vi',
    cat: 'physics/em',
    name: '电功率（电压电流式）',
    expr: 'V * I',
    params: { V: req('电压 V'), I: req('电流 A') },
    unit: 'W',
    desc: 'P = VI。与 joule_power（I²R 式）互补：已知电压电流时用这条。',
    keys: ['power', '功率'],
  },
  {
    id: 'resistors_mixed_two',
    cat: 'physics/em',
    name: '两电阻并联后的等效电阻',
    expr: '(R1 * R2) / (R1 + R2)',
    params: { R1: req('电阻1 Ω'), R2: req('电阻2 Ω') },
    unit: 'Ω',
    desc: 'R = R1R2/(R1+R2)。并联结果必小于任一支路，可用来自查。',
    keys: ['parallel', '并联', '分流'],
  },
  {
    id: 'conductance_from_resistance',
    cat: 'physics/em',
    name: '电导（电阻倒数）',
    expr: '1 / R',
    params: { R: req('电阻 Ω') },
    unit: 'S',
    desc: 'G = 1/R。电导与电阻互为倒数，小电阻对应大电导。',
    keys: ['conductance', '电导', '西门子'],
  },
  {
    id: 'charge_from_current_time',
    cat: 'physics/em',
    name: '电荷量（电流×时间）',
    expr: 'I * t',
    params: { I: req('电流 A'), t: req('时间 s') },
    unit: 'C',
    desc: 'Q = It。电池容量「1 Ah = 3600 C」就是这条的常用形式。',
    keys: ['charge', '电荷', '安时'],
  },
  {
    id: 'capacitor_charge_from_cv',
    cat: 'physics/em',
    name: '电容电荷（Q=CU）',
    expr: 'C * V',
    params: { C: req('电容 F'), V: req('电压 V') },
    unit: 'C',
    desc: 'Q = CU。与 capacitor_charge 同义，参数名更直观。',
    keys: ['capacitor', '电容', '电荷'],
  },
  {
    id: 'rc_time_constant_tau',
    cat: 'physics/em',
    name: 'RC 时间常数',
    expr: 'R * C',
    params: { R: req('电阻 Ω'), C: req('电容 F') },
    unit: 's',
    desc: 'τ = RC。经过 1τ 充到 63.2%，5τ 基本充满 —— 电路快慢的判断依据。',
    keys: ['rc', '时间常数', 'tau'],
  },
  {
    id: 'rc_discharge_voltage_tau',
    cat: 'physics/em',
    name: 'RC 放电电压（τ 倍数式）',
    expr: 'V0 * exp(-n)',
    params: { V0: req('初始电压 V'), n: p(1, '经过几个时间常数 τ') },
    unit: 'V',
    desc: 'V = V0·e^(−n)，n = t/τ。n=1 剩 37%，n=5 剩 0.67%。',
    keys: ['rc', '放电', '衰减'],
  },
  {
    id: 'inductor_energy_half_li2',
    cat: 'physics/em',
    name: '电感储能',
    expr: '0.5 * L * I^2',
    params: { L: req('电感 H'), I: req('电流 A') },
    unit: 'J',
    desc: 'E = ½LI²。与电容储能 ½CV² 对称 —— 电感储能与电流平方成正比。',
    keys: ['inductor', '电感', '储能'],
  },
  {
    id: 'lc_resonance_freq_hz',
    cat: 'physics/em',
    name: 'LC 谐振频率',
    expr: '1 / (2 * pi * sqrt(L * C))',
    params: { L: req('电感 H'), C: req('电容 F') },
    unit: 'Hz',
    desc: 'f = 1/(2π√(LC))。',
    keys: ['resonance', '谐振', 'lc'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 磁学（补齐 magnetic_flux_density 的空白）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'magnetic_field_wire',
    cat: 'physics/em',
    name: '直导线磁场（安培环路）',
    expr: 'mu0 * I / (2 * pi * r)',
    params: { I: req('电流 A'), r: req('到导线距离 m'), mu0: p(CONSTANTS.mu0, '真空磁导率') },
    unit: 'T',
    desc: 'B = μ0I/(2πr)。距离翻倍磁场减半 —— 这是「磁通密度 T」最基础的产出式。',
    keys: ['magnetic field', '磁场', '导线'],
  },
  {
    id: 'magnetic_field_solenoid',
    cat: 'physics/em',
    name: '螺线管内部磁场',
    expr: 'mu0 * N * I / L',
    params: { N: req('匝数'), I: req('电流 A'), L: req('螺线管长度 m'), mu0: p(CONSTANTS.mu0, '真空磁导率') },
    unit: 'T',
    desc: 'B = μ0NI/L（忽略螺线管端部效应，L ≫ 直径 时成立）。',
    keys: ['solenoid', '螺线管', '线圈'],
  },
  {
    id: 'magnetic_flux_from_bt',
    cat: 'physics/em',
    name: '磁通量（B×面积）',
    expr: 'B * A * cos(theta)',
    params: { B: req('磁通密度 T'), A: req('面积 m²'), theta: p(0, '法线夹角 rad') },
    unit: 'Wb',
    desc: 'Φ = BA·cosθ。θ=0 时通量最大，θ=90° 时为零（磁感线平行于面）。',
    keys: ['flux', '磁通量', '韦伯'],
  },
  {
    id: 'ampere_force_two_wires',
    cat: 'physics/em',
    name: '两平行导线间的作用力',
    expr: 'mu0 * I1 * I2 * L / (2 * pi * d)',
    params: { I1: req('电流1 A'), I2: req('电流2 A'), L: req('导线长度 m'), d: req('间距 m'), mu0: p(CONSTANTS.mu0, '真空磁导率') },
    unit: 'N',
    desc: 'F = μ0I1I2L/(2πd)。同向相吸、反向相斥。',
    keys: ['ampere', '安培力', '导线'],
  },
  {
    id: 'faraday_emf_from_flux_change',
    cat: 'physics/em',
    name: '法拉第电磁感应（通量变化率式）',
    expr: 'N * (B2 - B1) * A / t',
    params: { N: req('匝数'), B2: req('末磁通密度 T'), B1: req('初磁通密度 T'), A: req('面积 m²'), t: req('时间 s') },
    unit: 'V',
    desc: 'E = N·Δ(BA)/Δt。与 faraday_emf（速度式）是同一现象的两条写法。',
    keys: ['faraday', '感应', '法拉第'],
  },
  {
    id: 'inductance_solenoid',
    cat: 'physics/em',
    name: '螺线管电感',
    expr: 'mu0 * N^2 * A / L',
    params: { N: req('匝数'), A: req('截面积 m²'), L: req('长度 m'), mu0: p(CONSTANTS.mu0, '真空磁导率') },
    unit: 'H',
    desc: 'L = μ0N²A/L。匝数翻倍电感变四倍（N² 关系）。',
    keys: ['inductance', '电感', '螺线管'],
  },
  {
    id: 'transformer_current_ratio',
    cat: 'physics/em',
    name: '变压器电流比',
    expr: 'I1 * N1 / N2',
    params: { I1: req('初级电流 A'), N1: req('初级匝数'), N2: req('次级匝数') },
    unit: 'A',
    desc: 'I2 = I1·N1/N2。升压则降流，功率守恒（理想变压器）。',
    keys: ['transformer', '变压器', '电流'],
  },
  {
    id: 'power_factor_real',
    cat: 'physics/em',
    name: '有功功率（含功率因数）',
    expr: 'V * I * cos(phi)',
    params: { V: req('电压 V'), I: req('电流 A'), phi: p(0, '功率因数角 rad') },
    unit: 'W',
    desc: 'P = VI·cosφ。φ=0 时是纯阻性（cosφ=1）；感性负载 cosφ<1，视在功率大于有功。',
    keys: ['power factor', '功率因数', '有功'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 光学（补齐立体角 / 光通量 / 照度 / 发光强度）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'solid_angle_cone',
    cat: 'physics/optics',
    name: '圆锥立体角',
    expr: '2 * pi * (1 - cos(theta))',
    params: { theta: req('半顶角 rad') },
    unit: 'sr',
    desc: 'Ω = 2π(1−cosθ)。半顶角 90° 时得 2π（半空间），180° 时得 4π（整球）。',
    keys: ['solid angle', '立体角', '圆锥'],
  },
  {
    id: 'illuminance_inverse_square',
    cat: 'physics/optics',
    name: '照度（距离平方反比）',
    expr: 'I / r^2',
    params: { I: req('发光强度 cd'), r: req('距离 m') },
    unit: 'lx',
    desc: 'E = I/r²。点光源的照度随距离平方衰减 —— 「离灯近一倍，亮四倍」。',
    keys: ['illuminance', '照度', '照度衰减'],
  },
  {
    id: 'luminous_flux_from_intensity_angle',
    cat: 'physics/optics',
    name: '光通量（发光强度×立体角）',
    expr: 'I * omega',
    params: { I: req('发光强度 cd'), omega: req('立体角 sr') },
    unit: 'lm',
    desc: 'Φ = I·Ω。整球 4π 时，1 cd 的点光源给出 4π lm ≈ 12.57 lm。',
    keys: ['luminous flux', '光通量', '流明'],
  },
  {
    id: 'luminance_required',
    cat: 'physics/optics',
    name: '房间所需光通量',
    expr: 'E * A',
    params: { E: req('目标照度 lx'), A: req('面积 m²') },
    unit: 'lm',
    desc: 'Φ = E·A。已知「每平米要多少勒克斯」就能算总光通量，再除光效得瓦数。',
    keys: ['lighting', '照明', '光通量'],
  },
  {
    id: 'lamp_power_from_flux',
    cat: 'physics/optics',
    name: '灯具功率（按光效）',
    expr: 'phi / efficacy',
    params: { phi: req('光通量 lm'), efficacy: p(100, '光效 lm/W（LED 约 100，白炽约 12）') },
    unit: 'W',
    desc: 'P = Φ/η。光效 η 是这类的关键参数：LED 100—150 lm/W，荧光灯 60—90，白炽灯 12—15。',
    keys: ['lamp', '灯具', '光效'],
  },
  {
    id: 'illuminance_from_flux_area',
    cat: 'physics/optics',
    name: '照度（光通量/面积）',
    expr: 'phi / A',
    params: { phi: req('光通量 lm'), A: req('受照面积 m²') },
    unit: 'lx',
    desc: 'E = Φ/A。',
    keys: ['illuminance', '照度', '光通量'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 核物理（补齐放射性活度 / 吸收剂量 / 剂量当量）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'decay_constant_from_halflife',
    cat: 'physics/nuclear',
    name: '衰变常数（由半衰期）',
    expr: 'log(2) / T',
    params: { T: req('半衰期 s') },
    unit: '1/s',
    desc: 'λ = ln2 / T½。放射性活度、衰减比例都从这条出发。（公式表达式用 log：mathjs 的 log 即自然对数，ln 只在 evaluate 层做归一化，公式库不经那层。）',
    keys: ['decay', '衰变', '半衰期'],
  },
  {
    id: 'activity_from_atoms',
    cat: 'physics/nuclear',
    name: '放射性活度（原子数×衰变常数）',
    expr: 'N * log(2) / T',
    params: { N: req('当前放射性原子数'), T: req('半衰期 s') },
    unit: 'Bq',
    desc: 'A = Nλ = N·ln2/T½。活度是「每秒衰变多少次」，与原子总数成正比。',
    keys: ['activity', '活度', '贝可'],
  },
  {
    id: 'activity_from_mass',
    cat: 'physics/nuclear',
    name: '放射性活度（由质量衡量）',
    expr: '(m / M) * NA * log(2) / T',
    params: { m: req('放射性核素质量 g'), M: req('摩尔质量 g/mol'), T: req('半衰期 s'), NA: p(CONSTANTS.NA, '阿伏伽德罗常数') },
    unit: 'Bq',
    desc: 'A = (m/M)·NA·ln2/T½。这是「1 克镭-226 约 3.7×10¹⁰ Bq」的来源，也就是居里的定义。',
    keys: ['activity', '活度', '居里', '质量'],
  },
  {
    id: 'radiation_absorbed_dose',
    cat: 'physics/nuclear',
    name: '吸收剂量',
    expr: 'E / m',
    params: { E: req('沉积能量 J'), m: req('受照质量 kg') },
    unit: 'Gy',
    desc: 'D = E/m。1 Gy = 1 J/kg —— 与比热容同量纲，但含义是辐射沉积。',
    keys: ['dose', '吸收剂量', '戈瑞'],
  },
  {
    id: 'dose_equivalent_from_dose',
    cat: 'physics/nuclear',
    name: '剂量当量（吸收剂量×权重因子）',
    expr: 'D * Q',
    params: { D: req('吸收剂量 Gy'), Q: p(1, '辐射权重因：X/γ=1、β=1、中子≈10、α=20') },
    unit: 'Sv',
    desc: 'H = D·Q。同样 1 Gy，α 粒子造成的生物损伤是 X 射线的 20 倍 —— 这就是 Sv 与 Gy 分开的原因。',
    keys: ['dose equivalent', '剂量当量', '希沃特'],
  },
  {
    id: 'radiation_dose_rate',
    cat: 'physics/nuclear',
    name: '辐射剂量率',
    expr: 'A * E_per_decay * t_exp / m',
    params: { A: req('源活度 Bq'), E_per_decay: req('每次衰变沉积能量 J'), t_exp: req('暴露时间 s'), m: req('受照质量 kg') },
    unit: 'Gy',
    desc: 'D = A·E_d·t/m。活度与累积剂量的桥：同样的源，暴露时间翻倍剂量翻倍。',
    keys: ['dose rate', '剂量率', '辐照'],
  },
  {
    id: 'radioactive_remaining_fraction',
    cat: 'physics/nuclear',
    name: '剩余比例（经过若干半衰期）',
    expr: '0.5^n',
    params: { n: req('经过几个半衰期') },
    unit: '无量纲',
    desc: 'N/N₀ = 0.5ⁿ。n=1 剩一半，n=10 剩 0.1%，n=30 剩十亿分之一。',
    keys: ['half-life', '半衰期', '衰减'],
  },
  {
    id: 'shielding_halfvalue_layers',
    cat: 'physics/nuclear',
    name: '屏蔽所需半值层数',
    expr: 'log(I0 / I) / log(2)',
    params: { I0: req('入射强度'), I: req('目标强度') },
    unit: '层',
    desc: 'n = log(I₀/I)/log2。每穿一层半值层衰减一半 —— 计算防护厚度的标准做法。',
    keys: ['shielding', '屏蔽', '防护'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 化学计量（补齐物质的量 / 催化活度）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'moles_from_mass',
    cat: 'chemistry/mole',
    name: '物质的量（质量/摩尔质量）',
    expr: 'm / M',
    params: { m: req('质量 g'), M: req('摩尔质量 g/mol') },
    unit: 'mol',
    desc: 'n = m/M。化学计量最基础的一条：18 g 水 = 1 mol。',
    keys: ['mole', '摩尔', '物质的量'],
  },
  {
    id: 'mass_from_moles_compound',
    cat: 'chemistry/mole',
    name: '质量（物质的量×摩尔质量）',
    expr: 'n * M',
    params: { n: req('物质的量 mol'), M: req('摩尔质量 g/mol') },
    unit: 'g',
    desc: 'm = nM。与 moles_from_mass 互为逆式。',
    keys: ['mass', '质量', '摩尔'],
  },
  {
    id: 'catalyst_rate_from_units',
    cat: 'chemistry/kinetics',
    name: '酶活（单位 U 换算成 kat）',
    expr: 'U * 1.6666666666666667e-8',
    params: { U: req('酶活 U（µmol/min）') },
    unit: 'kat',
    desc: '1 U = 1 µmol/min ≈ 1.667×10⁻⁸ kat。实验报告多用 U，SI 用 kat。',
    keys: ['enzyme', '酶活', '催化'],
  },
  {
    id: 'enzyme_activity_from_rata',
    cat: 'chemistry/kinetics',
    name: '催化活度（底物消耗速率）',
    expr: 'delta_n / t',
    params: { delta_n: req('底物消耗量 mol'), t: req('时间 s') },
    unit: 'kat',
    desc: 'kat = Δn/Δt，每秒转化多少摩尔底物。',
    keys: ['catalytic', '催化活度', '开特'],
  },
  {
    id: 'molar_concentration_mol_per_l',
    cat: 'chemistry/solution',
    name: '摩尔浓度（mol/L）',
    expr: 'n / V',
    params: { n: req('溶质物质的量 mol'), V: req('溶液体积 L') },
    unit: 'mol/L',
    desc: 'c = n/V。生物与化学里「mmol/L」是临床化验的标准写法。',
    keys: ['concentration', '浓度', '摩尔'],
  },
]
