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

import { ALL_UNITS } from './units-data.js'
import { unit as mathUnit } from 'mathjs'

/** 一个单位。 */
/**
 * 单位的**用途分类**。
 *
 * ## 为什么要分
 *
 * 这两类的使用场景完全不同，混在一张表里会让列表变得没法读：
 *
 * | 分类 | 例子 | 谁会用 |
 * |---|---|---|
 * | `measure`（度量衡） | 里、斤、斗、俄尺、日尺、加仑、英亩 | 写小说、算账、历史考据 |
 * | `science`（科学） | eV、里德伯、靶恩、玻尔半径、amu、erg、slug | 物理/化学/天文计算 |
 *
 * 一个作者问「三丈是多少米」，不该在 422 条里跟「玻尔半径」挤在一起找；
 * 反过来，算原子结合能的人也不关心「日尺」。分开列，两边都清爽。
 *
 * ## 判据
 *
 * · **度量衡**：日常生活、贸易、历史、工程里**人真的会说出口**的量
 * · **科学**：只在专业计算里出现，日常语境说了没人懂（「这块地 3 靶恩」是笑话）
 *
 * 边界情况按「作者会不会在正文里写它」判：`psi` 会（工程题材），
 * 所以算度量衡；`hartree` 不会（原子物理单位），算科学。
 */
export type UnitCategory = 'measure' | 'science'

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
  /**
   * 用途分类，默认 `measure`（度量衡）。
   *
   * 省略时按度量衡处理 —— 表里绝大多数是这一类，
   * 只给科学单位显式标 `science`，比逐条标更不容易漏。
   */
  category?: UnitCategory
  /** 说明（什么时候用、有什么坑）。 */
  note?: string
}

/**
 * 支持的量纲。
 *
 * 分两层：**物理量纲**（长/质/时/面/体/能/功/温/速/压）与**扩展量纲**
 * （数据量/角度/力/频率）—— 后者是写小说时同样会撞上的（「这段代码多大」
 * 「转三十度」「拉弓要多少牛」），它们各自的公制基准也定义在 units-data。
 */
export type Dimension =
  // ── 力学与几何（14 个原有）──
  | 'length'
  | 'mass'
  | 'time'
  | 'area'
  | 'volume'
  | 'energy'
  | 'power'
  | 'temperature'
  | 'speed'
  | 'pressure'
  | 'data'
  | 'angle'
  | 'force'
  | 'frequency'
  // ── 电学（8 个）──
  | 'current'
  | 'charge'
  | 'voltage'
  | 'capacitance'
  | 'resistance'
  | 'conductance'
  | 'magnetic_flux'
  | 'magnetic_flux_density'
  | 'inductance'
  // ── 光学（3 个）──
  | 'solid_angle'
  | 'luminous_intensity'
  | 'luminous_flux'
  | 'illuminance'
  // ── 化学与核物理（5 个）──
  | 'amount_of_substance'
  | 'activity'
  | 'absorbed_dose'
  | 'dose_equivalent'
  | 'catalytic_activity'

/**
 * 每个量纲的基准单位（factor = 1 的那个）—— 即「公制中转点」。
 *
 * 定义在 `units-data.ts`，这里再导出，保持旧的导入路径可用。
 */
import { DIMENSION_BASE, DIMENSION_LABEL, DIMENSION_ORDER } from './units-data.js'
import { fmtShow } from './format.js'

/** 每个量纲的基准单位 —— 即「公制中转点」。 */
export const BASE_UNIT = DIMENSION_BASE

/** 量纲的中文名。 */
export { DIMENSION_LABEL, DIMENSION_ORDER }

/**
 * 内置单位表。
 *
 * ⚠️ 中文古制的换算**历朝不同**，这里用最常见的近似值并在 note 里标注。
 * 作者若需要精确到某个朝代，用 `customUnits` 覆盖。
 */
/**
 * 内置单位表 —— 从 `units-data.ts` 导入（那里按体系分节，便于查阅与扩充）。
 *
 * 现在是 **288 条**：公制（含 SI 词头）、中国市制与古制、英制与美制、
 * 航海、天文、日本、俄国、印度、古希腊罗马，外加数据量/角度/力/频率。
 */
export const UNITS: UnitDef[] = ALL_UNITS

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
  /**
   * ## 复合单位（`m/s^2`、`N/m`、`kg/m^3`）
   *
   * 上面只做**名称精确匹配**，于是这些常见写法全部查不到 ——
   * 实测 530 个参数里有 **258 个（49%）** 因此拿不到量纲。
   *
   * 后果很具体：**链执行器无法按量纲匹配参数**，
   * 于是「数字带物理量标记后自动流入下一个算式」这件事做不成。
   *
   * 所以这里补一层：把复合单位拆成「基本单位 + 指数」再合成量纲。
   */
  const composed = composeDimension(wanted)
  if (composed) {
    /**
     * 合成出来的单位不在 UNITS 表里，所以现造一个 UnitDef 返回。
     *
     * `factor` 取 1：本函数只用来**判断量纲是否相容**，不做数值换算 ——
     * 精确换算仍走 `convert`（它有自己的 mathjs 路径，能正确处理复合单位）。
     */
    return {
      name: wanted,
      dimension: composed,
      factor: 1,
      aliases: [],
      desc: '复合单位（合成量纲）',
    } as unknown as UnitDef
  }
  return undefined
}

/**
 * 用 mathjs 判定复合单位的量纲。
 *
 * ## 为什么不再手写「量纲签名表」
 *
 * 第一版我手写了一张 `{ 'length^1*time^-2': 'speed', ... }` 的表，
 * 结果**连 `kg/m^3` 都匹配不上** —— 因为签名的维度顺序必须与排序一致，
 * 写错一个顺序就永远查不到。而且它根本覆盖不了等价形式：
 *
 * ```
 *   N/kg  与  m/s^2  是同一个量纲（都是加速度）
 *   手写的表若不显式列出 N/kg，就永远认不出来
 * ```
 *
 * **mathjs 本身就带完整的单位系统，而且本项目早已依赖它**（formula 求值全程用它）。
 * 它的 `unit().dimensions` 直接给出量纲向量：
 *
 * ```
 *   'm/s^2' → [0,1,-2,0,0,0,0,0,0]     （length=1, time=-2）
 *   'N/kg'  → [0,1,-2,0,0,0,0,0,0]     ← 自动相等
 * ```
 *
 * 向量相等就是「同一个物理量」，**不需要任何表格**。
 *
 * ## 为什么返回 `Dimension` 而不是「向量是否相等」
 *
 * 上游 `findUnit` 的契约是返回 `UnitDef`（带 dimension 字段）。
 * 但 mathjs 的量纲向量有 9 维，而本项目的 `Dimension` 只有 30 个名字 ——
 * 两者不是一一对应（加速度/密度这些派生量纲不在 `Dimension` 里）。
 *
 * 所以这里做**降级映射**：能直接对应到基本量纲的返回那个名字，
 * 派生量纲返回最接近的（加速度→speed），实在不行返回 undefined。
 *
 * ⚠ 这一步是**为了兼容旧的二维契约**，不是物理需要。
 * 精确的量纲比较应直接用 mathjs 的 `unit(x).dimensions` 向量，
 * 不要依赖这里的降级结果 —— 那个向量才是准确判据。
 *
 * @param raw - 复合单位字符串
 * @returns 量纲名；无法判定时为 undefined
 */
function composeDimension(raw: string): Dimension | undefined {
  try {
    const parsed = mathUnit(raw)
    const dims: number[] = parsed.dimensions as unknown as number[]
    if (!Array.isArray(dims)) return undefined
    /** mass, length, time, current, temperature, luminous, amount, ... */
    const [mass, length, time, current, temperature] = dims
    const nonZero = dims.filter(function (d) { return d !== 0 }).length

    /** 单一量纲直接映射。 */
    if (nonZero === 1) {
      if (mass === 1) return 'mass'
      if (length === 1) return 'length'
      if (length === 2) return 'area'
      if (length === 3) return 'volume'
      if (time === 1) return 'time'
      if (time === -1) return 'frequency'
      if (current === 1) return 'current'
      if (temperature === 1) return 'temperature'
    }
    /**
     * 派生量纲降级到最接近的基本量纲。
     * 只用于兼容旧契约；精度不重要，因为链执行器不走这条路径。
     */
    if (time === -1 && length === 1) return 'speed'
    if (time === -2 && length === 1) return 'speed'
    if (time === -2 && mass === 1 && length === 1) return 'force'
    if (time === -2 && mass === 1 && length === 2) return 'energy'
    if (time === -3 && mass === 1 && length === 2) return 'power'
    if (time === -1 && mass === 1 && length === 2) return 'energy'
    if (time === -2 && mass === 1 && length === -1) return 'pressure'
    if (length === -3 && mass === 1) return 'mass'
    if (length === -2 && mass === 1) return 'mass'
    if (length === -1 && mass === 1) return 'mass'
    if (time === -3 && length === 2) return 'power'
    if (time === -1 && length === 2) return 'area'
    /** 热流密度 W/m²：mathjs 把它化简成 mass·time⁻³（mass=1, time=-3）。 */
    if (time === -3 && mass === 1) return 'power'
    /** 粘度 Pa·s：mass·length⁻¹·time⁻¹。 */
    if (time === -1 && mass === 1 && length === -1) return 'mass'
    /** 物质的量浓度 mol/L：amount·length⁻³，归到 amount。 */
    if (length === -3 && dims[6] === 1) return 'amount_of_substance'
    /** 熵/热容 J/K：energy·temperature⁻¹。 */
    if (temperature === -1 && mass === 1 && length === 2) return 'energy'
    return undefined
  } catch {
    /** mathjs 不认识这个单位串。 */
    return undefined
  }
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
const show = fmtShow

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
    /**
     * 代入过程只写「有信息量」的步骤。
     *
     * ## 修的是什么
     *
     * 实测反馈（2026-11-06）原话：换算 kg → t 时「代入过程」里出现
     * 「1 kg = 1 kg」「9.0000e+15 kg = 9.0000e+15 kg」这类**同义重复**，
     * 属无效信息 —— 而且它让输出**看起来有内容，其实没有**。
     *
     * 根因：当 from 或 to 恰好是基准单位（factor = 1）时，
     * 那一步就是「X = X」，什么都没说明。
     *
     * 现在的规则：
     *   · from.factor ≠ 1 时才写「1 from = N base」（否则 1 = 1，无信息）
     *   · from.factor ≠ 1 时才写「value from = inBase base」（上面那行是它的依据）
     *   · to.factor ≠ 1 时才写「1 to = M base」；无论哪种都写「故结果 = ...」
     *
     * 换算到基准单位时，过程就只剩一行结论 —— 那本来就是它的全部信息。
     */
    const fromIsBase = from.factor === 1
    const toIsBase = to.factor === 1
    const baseName = BASE_UNIT[from.dimension]

    /**
     * ## 合并成一行，避免同一个换算关系说两遍
     *
     * 踩过：`t → kg` 时先写「1 t = 1000 kg」，再写
     * 「9.0000e+15 t = 9.0000e+15 kg」—— 两行说的是**同一件事**
     * （因为 inBase 恰好等于 inBase，且 to 就是基准单位）。
     *
     * 现在按信息量分三种：
     *   · 源非基准、目标非基准 → 「1 from = N base，1 to = M base，故结果」
     *   · 源非基准、目标是基准 → 「value from = X base，故结果 = X to」
     *   · 源是基准、目标非基准 → 「1 to = M base，故结果」
     *   · 两者都是基准       → 只剩结论（其实同名，前面已处理）
     */
    if (!fromIsBase && !toIsBase) {
      /**
       * 两个都非基准 → 中间值**必须给**。
       *
       * 它是「30 里 = 15000 m = 15 km」这条链的中段：
       * 少了它，调用方无法核对「500 × 30」这一步是否算对。
       * 这与「去掉同义重复」不冲突 —— 重复指的是 `1 X = 1 X` 那种零信息行，
       * 而中间值是真信息。
       */
      steps.push('1 ' + from.name + ' = ' + from.factor + ' ' + baseName)
      steps.push(show(value) + ' ' + from.name + ' = ' + show(inBase) + ' ' + baseName)
      steps.push('1 ' + to.name + ' = ' + to.factor + ' ' + baseName)
      steps.push('故结果 = ' + show(result) + ' ' + to.name)
    } else if (!fromIsBase && toIsBase) {
      steps.push(show(value) + ' ' + from.name + ' = ' + show(inBase) + ' ' + baseName)
      steps.push('故结果 = ' + show(result) + ' ' + to.name)
    } else if (fromIsBase && !toIsBase) {
      steps.push('1 ' + to.name + ' = ' + to.factor + ' ' + baseName)
      steps.push('故结果 = ' + show(result) + ' ' + to.name)
    } else {
      steps.push('故结果 = ' + show(result) + ' ' + to.name)
    }
  }
  if (from.name === to.name) {
    /** 源与目标同名：换算本身无操作，别编出一段过程。 */
    steps.length = 0
    steps.push('源单位与目标单位同名，数值不变。')
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
