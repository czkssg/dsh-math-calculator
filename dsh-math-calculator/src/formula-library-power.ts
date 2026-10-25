/**
 * 公式库第六批：**势力与文明运行动力学**。
 *
 * ## 为什么补这一批
 *
 * 前五批偏物理与读者感知层（地平线、声音、行军、建筑）。但作者真正卡住的问题
 * 往往是「这个势力撑得住吗」：
 *
 *   · 这个城邦能养多少兵？粮食够不够？
 *   · 这条商路的运费抵得过货值吗？
 *   · 这个帝国有多大？信使跑一趟要多久？
 *   · 能源投入本身要消耗多少能源（EROI）？
 *   · 新技术多久能扩散开？
 *   · 财政收得够发饷吗？
 *
 * 这是 WorldForge-Q 方案里少数**方向对且我们确实缺**的部分：它点出的
 * EROI、技术扩散 S 曲线、粮食单产、财政、信息扩散五条，原库里都没有。
 * 但实现取向不同——那一版要求「14 个工具、各自带错误码与禁止事项」的规程，
 * 这一版只要求**能算、能代入、能标适用域**。
 *
 * ## 收录标准（与前五批一致）
 *
 * 闭合式、单次求值、参数现实可得。**不收**需要完整 ODE 才能算的演化曲线
 * （那走 `operation="ode"`），也不收需要真实投入产出表才能算的（如列昂惕夫矩阵）。
 *
 * ## 误差说明
 *
 * 这五条全是**经验模型**，参数带很大的地域与时代差异。每条都写明
 * 「适用域」与「这是地球标定」，不假装精确——与项目「输出标可信度」的原则一致。
 *
 * @module dsh-math-calculator/formula-library-power
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/**
 * 第六批公式：势力运行与文明动力学。
 */
export const POWER_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 能源：EROI（能源投资回报率）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'eroi',
    cat: 'power/energy',
    name: '能源投资回报率 EROI',
    expr: 'energy_out / energy_invested',
    params: {
      energy_out: req('获取到的可用能量 J'),
      energy_invested: req('为获取它而投入的能量 J'),
    },
    unit: '倍',
    desc:
      '社会能维持的复杂度上限。EROI < 5 时难以支撑城市与专业分工，' +
      '> 20 才有富余供养军队、艺术与科研。这是「文明能有多复杂」的硬门槛。',
    keys: ['eroi', '能源回报', 'net energy', '能源净产出'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['physics', 'society'],
  },
  {
    id: 'eroi_surplus',
    cat: 'power/energy',
    name: '能源净剩余',
    expr: 'energy_out * (1 - 1 / eroi)',
    params: {
      energy_out: req('总产出能量 J'),
      eroi: p(20, 'EROI（倍）'),
    },
    unit: 'J',
    desc:
      '扣掉「为了拿到这些能量而消耗的能量」之后，真正能拿去干别的事的部分。' +
      'EROI = 1 时剩余为 0——再多能源也养不活非生产人口。',
    keys: ['surplus', '净能量', '剩余能量'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics', 'society'],
  },
  {
    id: 'kardashev_scale',
    cat: 'power/energy',
    name: '卡尔达肖夫指数',
    expr: '(log10(power) - 6) / 10',
    params: { power: req('文明总功率 W') },
    unit: '级',
    desc:
      '文明的能源量级。地球当前约 1.8e13 W → 0.73 级；' +
      'I 型（地球全部日照约 1.7e17 W）→ 1.1（教材常写 1.0，按此式实为 1.1，' +
      '差异来自「全部日照」与「教材定义」的口径不同）；II 型（恒星约 3.8e26 W）→ 2.0。' +
      '公式即 (log10 P − 6) / 10。',
    keys: ['kardashev', '卡尔达肖夫', '文明等级'],
    frequency: 'medium',
    layer: 'conventional',
    domains: ['society'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 粮食：单位面积产出与供养人口
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'grain_yield_total',
    cat: 'power/food',
    name: '粮食总产',
    expr: 'area_hectare * kg_per_hectare * 0.9',
    params: {
      area_hectare: req('耕地面积 公顷'),
      kg_per_hectare: p(3000, '每公顷年产 kg'),
    },
    unit: 'kg/年',
    desc:
      '「0.9」是收后损耗与留种。传统农业 1000—3000 kg/公顷，' +
      '现代农业 6000—8000。这是「能养多少人」的起点。',
    keys: ['grain', '粮食', '产量', 'yield'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'population_fed_by_grain',
    cat: 'power/food',
    name: '粮食能供养的人口',
    expr: 'grain_kg * kcal_per_kg * 4184 / (kcal_per_person_day * 365 * 4184)',
    params: {
      grain_kg: req('可用粮食 kg/年'),
      kcal_per_kg: p(3500, '每公斤热量 kcal'),
      kcal_per_person_day: p(2200, '人均日需热量 kcal'),
    },
    unit: '人',
    desc:
      '纯口粮口径的供养上限。实际要打折——还要饲料、酿酒、纺织、储备。' +
      '人均 2200 kcal 是温饱线，不是舒适线。',
    keys: ['population fed', '供养人口', '粮食承载'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'arable_land_needed',
    cat: 'power/food',
    name: '供养人口所需耕地',
    expr: 'population * kcal_per_person_day * 365 / (kg_per_hectare * kcal_per_kg * 0.9)',
    params: {
      population: req('人口'),
      kcal_per_person_day: p(2200, '人均日需热量 kcal'),
      kg_per_hectare: p(3000, '每公顷年产 kg'),
      kcal_per_kg: p(3500, '每公斤热量 kcal'),
    },
    unit: '公顷',
    desc:
      '反向问法：先有一个人口数，反推需要多少耕地。' +
      '「这个王国养得起两百万人口吗」直接用它。',
    keys: ['arable', '耕地需求', 'land needed'],
    frequency: 'high',
    layer: 'derived',
    domains: ['society'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 财政：收入、军饷与赤字
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fiscal_revenue',
    cat: 'power/fiscal',
    name: '财政收入',
    expr: 'population * output_per_capita * tax_rate',
    params: {
      population: req('人口'),
      output_per_capita: p(3000, '人均年产出（折粮 kg 或等价货币）'),
      tax_rate: p(0.1, '实际征税率 0—1'),
    },
    unit: '同上口径',
    desc:
      '前工业国家的实际征税率通常只有 5%—10%（名义税率可以高得多，' +
      '但收不上来）。这是「国家能干什么」的真实上限。',
    keys: ['fiscal', '财政', '税收', 'revenue'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'army_pay_cost',
    cat: 'power/fiscal',
    name: '军饷与给养成本',
    expr: 'soldiers * pay_per_soldier_year',
    params: {
      soldiers: req('兵员数'),
      pay_per_soldier_year: p(1500, '每兵年成本（同财政口径）'),
    },
    unit: '同上口径',
    desc:
      '养常备军是前工业国家最贵的开支。兵员成本约为普通劳动力产出的 1.5—3 倍，' +
      '因为脱产、装备、训练都要摊进去。',
    keys: ['army cost', '军费', '军饷'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'fiscal_burden_ratio',
    cat: 'power/fiscal',
    name: '军费占财政比例',
    expr: 'army_cost / revenue',
    params: { army_cost: req('军费'), revenue: req('财政收入') },
    unit: '倍',
    desc:
      '> 1 表示打不起（要么加税要么借债要么裁军）。历史上长期 0.5 以上' +
      '的国家往往在几十年内崩一次。这是「帝国能不能维持」的直接判据。',
    keys: ['burden', '军费占比', 'deficit'],
    frequency: 'high',
    layer: 'derived',
    domains: ['society'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 技术与社会扩散：S 曲线
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'diffusion_s_curve',
    cat: 'power/diffusion',
    name: '技术扩散 S 曲线（当前渗透率）',
    expr: '1 / (1 + exp(-rate * (t - t_mid)))',
    params: {
      rate: p(0.5, '扩散速率（每年）'),
      t: req('已过时间（年）'),
      t_mid: req('达到半数渗透的时点（年）'),
    },
    unit: '0—1',
    desc:
      '新事物（铁器、印刷、火药、蒸汽机）的采纳曲线。' +
      'rate 越大越陡：0.3 约需 20 年过半，1.0 约需 7 年。' +
      '**这是地球经验值，不同社会差距极大**——收窄或放大 rate 就能表达你的世界。',
    keys: ['diffusion', '扩散', 's curve', '渗透率', '技术采纳'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'diffusion_half_life',
    cat: 'power/diffusion',
    name: '技术扩散达到半数所需时间',
    // mathjs 的自然对数是 log()，没有 ln()——写 ln 会算出 undefined
    expr: 'log(1 / 0.01 - 1) / rate',
    params: { rate: p(0.5, '扩散速率（每年）') },
    unit: '年',
    desc:
      '从 1% 到 50% 渗透的时间。用来回答「这项技术多久普及」。' +
      'rate = 0.5 时约 9 年；rate = 0.1 时约 46 年。',
    keys: ['half life', '普及时间', 'adoption time'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['society'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 信息：传递速度与统治半径
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'info_delivery_time',
    cat: 'power/information',
    name: '信息传递耗时',
    expr: 'distance / speed_km_per_day',
    params: {
      distance: req('距离 km'),
      speed_km_per_day: p(200, '传信速度 km/天'),
    },
    unit: '天',
    desc:
      '驿马接力约 200—400 km/天，步行信使约 40 km/天，烽火几乎瞬时但只能传固定信号。' +
      '这是「政令能不能及时到达」的物理基础。',
    keys: ['information', '信息', '驿马', 'message'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['society'],
  },
  {
    id: 'admin_radius_from_info',
    cat: 'power/information',
    name: '可有效统治的半径',
    expr: 'speed_km_per_day * max_days / 2',
    params: {
      speed_km_per_day: p(200, '传信速度 km/天'),
      max_days: p(20, '可容忍的单程延迟（天）'),
    },
    unit: 'km',
    desc:
      '「往返一趟还在可控范围内」的半径。除以 2 是因为要算来回。' +
      '骑马帝国约 2000 km，正是历史上大帝国尺寸相近的原因——' +
      '不是巧合，是通信速度决定的。',
    keys: ['admin radius', '统治半径', '帝国尺寸'],
    frequency: 'high',
    layer: 'derived',
    domains: ['society'],
  },
]
