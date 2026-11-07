/**
 * 公式库第十批：**生物与宏观经济**的运行式子。
 *
 * ## 为什么这两块一起补
 *
 * 生物类原有 26 条，但偏向**医学剂量**（体重给药、输液速率、血液酒精）；
 * 经济类原有 26 条，几乎全是**金融**（复利、年金、NPV、CAGR）。
 *
 * 而写世界观真正会问的是另两类问题：
 *
 * ```
 *   生物：这片草原能养多少头牛？这窝猪多久出栏？这个生态能支撑多少顶级捕食者？
 *   经济：这个国家一年产多少？劳动力有多少？投资能带来多少增长？钱发多了会怎样？
 * ```
 *
 * 这一批补的就是这些**运行层面**的式子，而不是又一批财务指标。
 *
 * ## 收录判据
 *
 * 同既有几批：闭合式、带量纲、有出处、不重复。经验系数标出取值范围。
 *
 * @module dsh-math-calculator/formula-library-bioecon
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/** 生物与宏观 11 条：生态承载、畜禽养殖、人口劳动力、货币与通胀。 */
export const BIOECON_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // A. 生态与畜牧（土地能养多少、多久出栏、能撑几级食物链）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'grazing_capacity',
    cat: 'biology/ecology',
    name: '草地载畜量',
    expr: 'area * yield_per_ha * util / (intake * days)',
    params: {
      area: req('草场面积 ha（公顷，1 ha = 1e4 m²）'),
      yield_per_ha: req('单位面积产草量 kg/(ha·年)（温带草原 2000~5000，荒漠 200~500）'),
      util: p(0.5, '可利用率（放牧通常 0.4~0.6，留一半给草场恢复）'),
      intake: req('每头每日采食量 kg/头·日（牛 40~60，羊 5~8）'),
      days: p(365, '放牧天数（全年 365，季节性牧场按实际）'),
    },
    unit: '头（可承载标准畜单位）',
    desc: '载畜量 = 面积 × 产草量 × 利用率 /(采食量 × 天数)。**「留一半」不是保守，是必需**：草地超载后会退化，第二年产量直接腰斩。这条是游牧与畜牧设定的地基。',
    keys: ['载畜量', '草地', '放牧', 'grazing', '畜牧', '草原'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology', 'perception'],
  },
  {
    id: 'livestock_growth_time',
    cat: 'biology/ecology',
    name: '畜禽出栏时间（按日增重）',
    expr: '(target_weight - birth_weight) / adg',
    params: {
      target_weight: req('出栏体重 kg'),
      birth_weight: req('初生体重 kg（仔猪 1.5，犊牛 40，羔羊 3）'),
      adg: req('平均日增重 kg/日（肉猪 0.7~1.0，肉牛 0.8~1.2，肉鸡 0.05）'),
    },
    unit: '日',
    desc: '出栏天数 = (出栏重 − 初生重)/日增重。**猪约 180 天、牛约 450 天、肉鸡约 42 天**——这个比值决定了肉价与牧场的周转率。日增重随饲料与品种变，写设定时要说清是哪种。',
    keys: ['出栏', '日增重', 'livestock', '养殖', '肉'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology', 'perception'],
  },
  {
    id: 'feed_conversion_ratio',
    cat: 'biology/ecology',
    name: '饲料转化率（料肉比）',
    expr: 'feed_consumed / weight_gain',
    params: {
      feed_consumed: req('消耗饲料总量 kg（干物质）'),
      weight_gain: req('增重 kg'),
    },
    unit: '无量纲（kg 料/kg 肉）',
    desc: '料肉比 = 耗料/增重。**牛肉 6~8、猪肉 2.5~3.5、肉鸡 1.6~2.0**——这个数字直接决定「养一头牛要多少亩地」。牛高是因为反刍动物维持消耗大，不是品种差。',
    keys: ['料肉比', '饲料转化', 'feed conversion', 'FCR'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology', 'perception'],
  },
  {
    id: 'crop_yield_npp',
    cat: 'biology/ecology',
    name: '农田可收获能量（由 NPP 与收获指数）',
    expr: 'NPP * area * hi * 1e4',
    params: {
      NPP: req('净初级生产力 g/(m²·年)（温带农田 800~1500，热带 2000+）'),
      area: req('面积 ha'),
      hi: p(0.4, '收获指数（谷物 0.4~0.5，块根作物 0.6，牧草 0.9）'),
    },
    unit: 'g（干物质）',
    desc: '可收获干物质 = NPP × 面积 × 收获指数。收获指数是「长出来的东西里有多少是我们要吃的部分」——谷物的 0.4 意味着**六成生物量是秸秆**，那正是牲畜饲料与燃料的来源。',
    keys: ['NPP', '收获指数', '产量', '作物', 'yield'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology', 'perception'],
  },
  {
    id: 'trophic_chain_support',
    cat: 'biology/ecology',
    name: '营养级可支撑的生物量（十分之一定律）',
    expr: 'primary * eff^level',
    params: {
      primary: req('初级生产者生物量 kg'),
      eff: p(0.1, '营养级传递效率（陆地 0.1，海洋 0.1~0.15，以肉食为主时更低）'),
      level: req('营养级层数（草食 1，一级肉食 2，顶级 3~4）'),
    },
    unit: 'kg',
    desc: '每升一级只剩约 10%。**这就是为什么食物链一般不超过 5 级，也是为什么顶级捕食者稀少**：要养活 1 kg 狼，需要 10 kg 兔、100 kg 草。写生态设定时这条能立刻否掉「满地猛兽」的方案。',
    keys: ['营养级', '食物链', '十分之一', 'trophic', '捕食者'],
    frequency: 'high',
    layer: 'derived',
    domains: ['biology'],
  },
  // ══════════════════════════════════════════════════════════════════
  // B. 人口、劳动力与产出（宏观经济的运行层）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'labor_force',
    cat: 'econ/macro',
    name: '劳动力人口（由总人口与年龄结构）',
    expr: 'population * participation',
    params: {
      population: req('总人口'),
      participation: p(0.5, '劳动参与率（农业社会 0.45~0.55，工业化 0.55~0.65）'),
    },
    unit: '人',
    desc: '劳力 = 总人口 × 参与率。**农业社会的 0.45 里含着大量童工与老人**——这个比值决定了「能征多少兵」与「能修多大工程」的上限。',
    keys: ['劳动力', '人口', 'labor', '劳力'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics', 'society'],
  },
  {
    id: 'gdp_from_labor',
    cat: 'econ/macro',
    name: '总产出（人力 × 人均产出）',
    expr: 'labor * output_per_worker',
    params: {
      labor: req('劳动力人数'),
      output_per_worker: req('人均年产出（按货币或实物统一定义）'),
    },
    unit: '与人均产出同单位（通常为年产值）',
    desc: '产出 = 劳力 × 人均产出。最简单的宏观核算模型：**想提高总产出只有两条路——加人或提高单产**。人均产值翻倍比人口翻倍难得多，所以长期增长几乎全靠后者。',
    keys: ['总产出', 'GDP', '宏观', '产值'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics'],
  },
  {
    id: 'macro_savings_rate',
    cat: 'econ/macro',
    name: '储蓄率与投资能力',
    expr: 'output * savings_rate',
    params: {
      output: req('总产出'),
      savings_rate: p(0.2, '储蓄率（农业社会 0.05~0.15，高速增长期 0.25~0.40）'),
    },
    unit: '与总产出同单位',
    desc: '可投资额 = 产出 × 储蓄率。**这是增长的燃料**：高速增长的经济体储蓄率往往很高（东亚 0.3+），而贫困农业社会几乎全被消费掉，攒不出投资。',
    keys: ['储蓄', '投资', 'savings', '资本积累'],
    frequency: 'high',
    layer: 'conventional',
    domains: ['economics'],
  },
  {
    id: 'capital_output_ratio',
    cat: 'econ/macro',
    name: '资本产出比（增长的资本需求）',
    expr: 'savings_rate / growth_rate',
    params: {
      savings_rate: req('储蓄率'),
      growth_rate: req('目标增长率（小数）'),
    },
    unit: '无量纲（资本/产出）',
    desc: '哈罗德-多马式的推导：所需资本产出比 = 储蓄率 / 增长率。**想每年增长 5% 而储蓄率只有 10%，需要资本产出比 2（即每 1 元产出要 2 元资本）**——如果实际要 4，那 5% 就达不到。这条能立刻判断一个增长目标现不现实。',
    keys: ['资本产出比', '哈罗德', '增长', '投入产出'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['economics'],
  },
  {
    id: 'money_supply_from_base',
    cat: 'econ/macro',
    name: '货币供应量（基础货币 × 货币乘数）',
    expr: 'base_money * multiplier',
    params: {
      base_money: req('基础货币（流通现金 + 准备金）'),
      multiplier: p(5, '货币乘数（现代银行 8~12，准备金率高时 2~4，金属货币制接近 1）'),
    },
    unit: '与基础货币同单位',
    desc: '广义货币 = 基础货币 × 乘数。**金属货币制的乘数接近 1，现代部分准备金制能放大 10 倍**——这解释了为什么古代通货膨胀罕见而现代可以剧烈。架空设定里「银行体系发达程度」直接改这个乘数。',
    keys: ['货币供应', '乘数', 'money supply', '通胀', '银行'],
    frequency: 'high',
    layer: 'derived',
    domains: ['economics'],
  },
  {
    id: 'inflation_from_money_growth',
    cat: 'econ/macro',
    name: '货币增长与产出增长之差（通胀压力）',
    expr: '(money_growth - output_growth) * 100',
    params: {
      money_growth: req('货币供应年增长率（小数，如 0.15）'),
      output_growth: req('实际产出年增长率（小数，如 0.03）'),
    },
    unit: '%（年通胀率近似）',
    desc: '通胀 ≈ 货币增速 − 产出增速。**这是最实用的通胀判据**：钱印得比东西增长快多少，物价就涨多少。0.15 对 0.03 意味着约 12% 的年通胀——三年物价翻倍。写「滥发货币导致崩溃」时用这条量化。',
    keys: ['通胀', '货币增长', 'inflation', '物价'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['economics'],
  },
]
