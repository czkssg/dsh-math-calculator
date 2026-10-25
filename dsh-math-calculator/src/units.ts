/**
 * 单位换算：把作者写的「三十里」「两丈高」「一天走六十里」换成标准单位。
 *
 * ## 为什么要有这一层
 *
 * 之前插件只有**量纲分析**（`quantities.ts` 算「改常数后哪些量该变」），
 * 没有**单位换算**。于是作者写「城墙高三丈」时，模型要么自己心算
 * （违反「复杂计算必须调工具」），要么换算错了也没人发现。
 *
 * 这与 WorldForge-Q 方案 FR-06 第 1 条对上了，但实现取向不同：
 * 那一版要的是「14 个工具、各自带错误码与禁止事项」的规程；
 * 这一版只要**一个能查、能算、能列出全部可用单位**的工具。
 *
 * ## 设计原则
 *
 * 1. **不猜**：`里` 在周制、汉制、清制下长度不同，所以内置的是**常用近似**
 *    并标明「朝代不同会有差异」，允许项目覆盖系数。
 * 2. **可扩展**：`customUnits` 允许项目自带单位（作者写「一斯特恩 = 12 公里」
 *    这种自创单位很常见）。
 * 3. **给代入过程**：不只给结果，还给「1 里 = 500 m，所以 30 里 = 15000 m」，
 *    这样 AI 能转述给作者看。
 * 4. **不静默**：单位不认识就报错并列出可用单位，绝不猜一个。
 *
 * ## 内置单位的选择标准
 *
 * 只收「架空/历史小说作者真会写」的单位，不是收得越多越好：
 *   · 中文古制：里、丈、尺、寸、步、顷、亩、斤、两、石、斗 —— 写古代必用
 *   · 英制：英里、英尺、英寸、磅、加仑 —— 写航海/工业革命常混用
 *   · 天文学：AU、光年、秒差距 —— 写星际必用
 *   · 时间：刻、时辰、更 —— 写古代日常必用
 *
 * 刻意不收：专业 SI 派生单位（那些用科学计数法反而更清楚）、
 * 以及所有需要上下文才能换算的单位（如「一箭之地」）。
 *
 * @module dsh-math-calculator/units
 */

/** 一个单位。 */
export interface UnitDef {
  /** 单位名（作者会写的写法）。 */
  name: string
  /** 别名（含单字与常见异写）。 */
  aliases?: string[]
  /** 所属量纲。 */
  dimension: Dimension
  /** 换算到该量纲基准单位的系数（基准单位见 BASE_UNIT）。 */
  factor: number
  /** 说明（什么时候用、有什么坑）。 */
  note?: string
}

/** 支持的量纲。 */
export type Dimension =
  | 'length'
  | 'mass'
  | 'time'
  | 'area'
  | 'volume'
  | 'energy'
  | 'power'
  | 'temperature'
  | 'speed'

/** 每个量纲的基准单位（factor = 1 的那个）。 */
export const BASE_UNIT: Record<Dimension, string> = {
  length: 'm',
  mass: 'kg',
  time: 's',
  area: 'm²',
  volume: 'm³',
  energy: 'J',
  power: 'W',
  temperature: 'K',
  speed: 'm/s',
}

/** 量纲的中文名。 */
export const DIMENSION_LABEL: Record<Dimension, string> = {
  length: '长度',
  mass: '质量',
  time: '时间',
  area: '面积',
  volume: '体积',
  energy: '能量',
  power: '功率',
  temperature: '温度',
  speed: '速度',
}

/**
 * 内置单位表。
 *
 * ⚠️ 中文古制的换算**历朝不同**，这里用最常见的近似值并在 note 里标注。
 * 作者若需要精确到某个朝代，用 `customUnits` 覆盖。
 */
export const UNITS: UnitDef[] = [
  // ── 长度 ──
  { name: 'm', dimension: 'length', factor: 1, note: '基准单位' },
  { name: 'km', dimension: 'length', factor: 1000 },
  { name: 'cm', dimension: 'length', factor: 0.01 },
  { name: 'mm', dimension: 'length', factor: 0.001 },
  {
    name: '里',
    dimension: 'length',
    factor: 500,
    note: '市里 = 500 m。周制约 415 m、汉制约 415 m、清制 576 m——写古代按朝代覆盖',
  },
  { name: '丈', dimension: 'length', factor: 3.2, note: '市丈 = 3.2 m（10 尺）' },
  { name: '尺', dimension: 'length', factor: 0.32, note: '市尺 ≈ 32 cm。汉尺约 23 cm、明清营造尺约 32 cm' },
  { name: '寸', dimension: 'length', factor: 0.032, note: '市寸 = 1/10 尺' },
  { name: '步', dimension: 'length', factor: 1.6, note: '古代一步 ≈ 5 尺 ≈ 1.6 m（「百步穿杨」约 160 m）' },
  { name: 'mile', aliases: ['英里', 'mi'], dimension: 'length', factor: 1609.344 },
  { name: 'ft', aliases: ['英尺'], dimension: 'length', factor: 0.3048 },
  { name: 'in', aliases: ['英寸'], dimension: 'length', factor: 0.0254 },
  { name: 'nmi', aliases: ['海里'], dimension: 'length', factor: 1852 },
  { name: 'AU', aliases: ['天文单位'], dimension: 'length', factor: 1.495978707e11, note: '日地平均距离' },
  { name: 'ly', aliases: ['光年'], dimension: 'length', factor: 9.4607304725808e15 },
  { name: 'pc', aliases: ['秒差距'], dimension: 'length', factor: 3.0856775814913673e16 },
  { name: 'Rearth', aliases: ['地球半径'], dimension: 'length', factor: 6.371e6 },
  { name: 'Rsun', aliases: ['太阳半径'], dimension: 'length', factor: 6.957e8 },

  // ── 质量 ──
  { name: 'kg', dimension: 'mass', factor: 1, note: '基准单位' },
  { name: 'g', dimension: 'mass', factor: 0.001 },
  { name: 't', aliases: ['吨'], dimension: 'mass', factor: 1000 },
  { name: '斤', dimension: 'mass', factor: 0.5, note: '市斤 = 500 g（10 两）' },
  { name: '两', dimension: 'mass', factor: 0.05, note: '市两 = 50 g' },
  { name: '石', dimension: 'mass', factor: 60, note: '容量/重量混用单位，此处按「一石米约 60 kg」估' },
  { name: 'lb', aliases: ['磅'], dimension: 'mass', factor: 0.45359237 },
  { name: 'oz', aliases: ['盎司'], dimension: 'mass', factor: 0.028349523125 },
  { name: 'Mearth', aliases: ['地球质量'], dimension: 'mass', factor: 5.972e24 },
  { name: 'Msun', aliases: ['太阳质量'], dimension: 'mass', factor: 1.989e30 },

  // ── 时间 ──
  { name: 's', dimension: 'time', factor: 1, note: '基准单位' },
  { name: 'min', aliases: ['分钟'], dimension: 'time', factor: 60 },
  { name: 'h', aliases: ['小时'], dimension: 'time', factor: 3600, note: '与普朗克常数 h 同名，单位换算里按小时理解' },
  { name: 'day', aliases: ['天', '日'], dimension: 'time', factor: 86400 },
  { name: 'year', aliases: ['年'], dimension: 'time', factor: 3.15576e7, note: '儒略年 = 365.25 天' },
  { name: 'Gyr', aliases: ['十亿年'], dimension: 'time', factor: 3.15576e16 },
  { name: '刻', dimension: 'time', factor: 900, note: '古代一刻 ≈ 15 分钟（百刻制一天）' },
  { name: '时辰', dimension: 'time', factor: 7200, note: '一个时辰 = 2 小时（十二时辰制）' },
  { name: '更', dimension: 'time', factor: 7200, note: '一夜五更，每更约 2 小时' },

  // ── 面积 ──
  { name: 'm²', dimension: 'area', factor: 1, note: '基准单位' },
  { name: 'km²', dimension: 'area', factor: 1e6 },
  { name: 'ha', aliases: ['公顷'], dimension: 'area', factor: 1e4 },
  { name: '亩', dimension: 'area', factor: 666.6666666666666, note: '市亩 ≈ 666.7 m²（15 亩 = 1 公顷）' },
  { name: '顷', dimension: 'area', factor: 66666.66666666667, note: '一顷 = 100 亩' },
  { name: 'acre', aliases: ['英亩'], dimension: 'area', factor: 4046.8564224 },

  // ── 体积 ──
  { name: 'm³', dimension: 'volume', factor: 1, note: '基准单位' },
  { name: 'L', aliases: ['升'], dimension: 'volume', factor: 0.001 },
  { name: '斗', dimension: 'volume', factor: 0.01, note: '市斗 = 10 L；古代一斗约 2—20 L，差异极大' },
  { name: 'gal', aliases: ['加仑'], dimension: 'volume', factor: 0.003785411784, note: '美制加仑' },

  // ── 能量 ──
  { name: 'J', dimension: 'energy', factor: 1, note: '基准单位' },
  { name: 'kJ', dimension: 'energy', factor: 1000 },
  { name: 'MJ', dimension: 'energy', factor: 1e6 },
  { name: 'GJ', dimension: 'energy', factor: 1e9 },
  { name: 'kWh', aliases: ['度'], dimension: 'energy', factor: 3.6e6, note: '一度电 = 3.6 MJ' },
  { name: 'cal', aliases: ['卡'], dimension: 'energy', factor: 4.184 },
  { name: 'kcal', aliases: ['大卡', '千卡'], dimension: 'energy', factor: 4184, note: '营养学的「卡路里」其实是大卡' },
  { name: 'TNT', dimension: 'energy', factor: 4.184e9, note: '1 吨 TNT 当量' },
  { name: 'eV', dimension: 'energy', factor: 1.602176634e-19 },
  { name: 'eVperBond', aliases: [], dimension: 'energy', factor: 1.602176634e-19 },

  // ── 功率 ──
  { name: 'W', dimension: 'power', factor: 1, note: '基准单位' },
  { name: 'kW', dimension: 'power', factor: 1000 },
  { name: 'MW', dimension: 'power', factor: 1e6 },
  { name: 'GW', dimension: 'power', factor: 1e9 },
  { name: 'TW', dimension: 'power', factor: 1e12 },
  { name: 'hp', aliases: ['马力'], dimension: 'power', factor: 745.6998715822702 },
  { name: '人', aliases: ['人力'], dimension: 'power', factor: 75, note: '一个成年人持续体力输出约 75—100 W（长时间）' },
  { name: '畜', aliases: ['畜力'], dimension: 'power', factor: 500, note: '一头上等役畜持续输出约 500 W' },

  // ── 温度 ──
  // 温度是仿射换算（有偏移），不能只用系数；见 convert() 里的专门分支
  { name: 'K', dimension: 'temperature', factor: 1, note: '基准单位，无偏移' },
  { name: '°C', aliases: ['℃', '摄氏度'], dimension: 'temperature', factor: 1, note: 'K = °C + 273.15' },
  { name: '°F', aliases: ['℉', '华氏度'], dimension: 'temperature', factor: 5 / 9, note: 'K = (°F + 459.67) × 5/9' },

  // ── 速度 ──
  { name: 'm/s', dimension: 'speed', factor: 1, note: '基准单位' },
  { name: 'km/h', dimension: 'speed', factor: 1 / 3.6 },
  { name: 'mph', aliases: ['英里每小时'], dimension: 'speed', factor: 0.44704 },
  { name: 'mach', aliases: ['马赫'], dimension: 'speed', factor: 340.29, note: '按海平面 15°C 声速折算；高空声速更低' },
  { name: 'c', aliases: ['光速'], dimension: 'speed', factor: 299792458 },
]

/**
 * 按名字查单位（含别名）。
 *
 * @param name - 作者写的单位名
 * @param custom - 项目自定义单位（优先于内置）
 * @returns 单位定义；找不到返回 `undefined`
 */
export function findUnit(name: string, custom?: UnitDef[]): UnitDef | undefined {
  const wanted = name.trim()
  if (wanted === '') return undefined
  // 自定义单位优先，允许项目覆盖内置（比如把「里」改成 576 m）
  for (const unit of custom || []) {
    if (unit.name === wanted) return unit
    if ((unit.aliases || []).some(function (alias) { return alias === wanted })) return unit
  }
  for (const unit of UNITS) {
    if (unit.name === wanted) return unit
    if ((unit.aliases || []).some(function (alias) { return alias === wanted })) return unit
  }
  return undefined
}

/**
 * 列出某量纲下的全部单位名（用于「不认识这个单位」时提示可用项）。
 *
 * @param dimension - 量纲
 * @returns 单位名清单
 */
export function listUnits(dimension: Dimension): string[] {
  return UNITS.filter(function (unit) { return unit.dimension === dimension })
    .map(function (unit) { return unit.name })
}

/**
 * 换算结果。
 */
export interface Conversion {
  /** 原始数值。 */
  value: number
  /** 原始单位。 */
  from: UnitDef
  /** 目标单位。 */
  to: UnitDef
  /** 换算后的数值。 */
  result: number
  /** 量纲。 */
  dimension: Dimension
  /** 代入过程（给 AI 转述用）。 */
  steps: string[]
  /** 警告（例如温度偏移、历史单位差异）。 */
  warnings: string[]
}

/**
 * 把数字显示成人读得懂的位数（与 ops/units-op 的 show 保持同一口径）。
 *
 * 换算结果给作者看，6 位有效数字足够；给太多位会制造「伪精确」。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) return value.toExponential(4)
  return String(Number(value.toPrecision(6)))
}

/**
 * 换算。
 *
 * 温度是仿射变换（`K = °C + 273.15`），不能只乘系数，所以单独处理。
 *
 * @param value - 数值
 * @param fromName - 源单位
 * @param toName - 目标单位
 * @param custom - 自定义单位
 * @returns 换算结果；单位不存在或量纲不符时返回错误信息
 */
export function convert(
  value: number,
  fromName: string,
  toName: string,
  custom?: UnitDef[],
): { ok: true; conversion: Conversion } | { ok: false; error: string; hint: string } {
  const from = findUnit(fromName, custom)
  const to = findUnit(toName, custom)

  if (!from) {
    return {
      ok: false,
      error: '不认识单位「' + fromName + '」',
      hint: '已知单位见 operation="units"（不带参数即列出全部）。' +
        '自创单位可用 customUnits 传入。',
    }
  }
  if (!to) {
    return {
      ok: false,
      error: '不认识单位「' + toName + '」',
      hint: '已知单位见 operation="units"。',
    }
  }
  if (from.dimension !== to.dimension) {
    return {
      ok: false,
      error: '量纲不符：' + fromName + ' 是' + DIMENSION_LABEL[from.dimension] +
        '，' + toName + ' 是' + DIMENSION_LABEL[to.dimension] + '，不能直接换算',
      hint: '换到同量纲单位，或先乘/除得到正确量纲（例如速度 = 长度 / 时间）。',
    }
  }

  const steps: string[] = []
  const warnings: string[] = []
  let result: number

  if (from.dimension === 'temperature') {
    // 先把源温度换成 K，再从 K 换成目标
    let kelvin: number
    if (from.name === 'K') kelvin = value
    else if (from.name === '°C') kelvin = value + 273.15
    else kelvin = (value + 459.67) * (5 / 9)
    steps.push('先转成开尔文：' + show(value) + ' ' + from.name + ' → ' + show(kelvin) + ' K')
    if (to.name === 'K') result = kelvin
    else if (to.name === '°C') result = kelvin - 273.15
    else result = kelvin * (9 / 5) - 459.67
    steps.push('再转成目标：' + show(kelvin) + ' K → ' + show(result) + ' ' + to.name)
    if (value < 0 && (from.name === 'K' || from.name === '°C')) {
      warnings.push('低于绝对零度，物理上不成立——若这是设定，请当作叙事选择而非硬参数')
    }
  } else {
    const inBase = value * from.factor
    result = inBase / to.factor
    steps.push('1 ' + from.name + ' = ' + from.factor + ' ' + BASE_UNIT[from.dimension])
    steps.push(
      show(value) + ' ' + from.name + ' = ' + show(inBase) + ' ' + BASE_UNIT[from.dimension],
    )
    steps.push(
      '1 ' + to.name + ' = ' + to.factor + ' ' + BASE_UNIT[to.dimension] +
      '，故结果 = ' + show(result) + ' ' + to.name,
    )
  }

  if (from.note) warnings.push(from.name + '：' + from.note)
  if (to.note && to.name !== from.name) warnings.push(to.name + '：' + to.note)

  return {
    ok: true,
    conversion: {
      value,
      from,
      to,
      result,
      dimension: from.dimension,
      steps,
      warnings,
    },
  }
}
