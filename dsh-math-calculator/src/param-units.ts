/**
 * 公式参数的**量纲校验**：把「位移 m」这类描述里的单位当成真单位来用。
 *
 * ## 为什么这一步值得做
 *
 * 公式库 442 条，每个参数的描述里其实**已经写着单位**：
 *
 * ```
 *   velocity_uniform:  s → "位移 m"    t → "时间 s"
 *   kinetic_energy:    m → "质量 kg"   v → "速度 m/s"
 * ```
 *
 * 这些单位以前只用于**显示**，不参与任何判断。于是：
 *
 * ```
 *   {formula:"velocity_uniform", overrides:{s:10, t:1}}
 *   → 10 m/s        ← 数字对了，但没人能确认 s 给的是米而不是公里
 * ```
 *
 * 现在让调用方可以**带单位给参数**，工具负责校验与换算：
 *
 * ```
 *   overrides:{s:"10 m", t:"1 s"}     → 10 m/s        ✓
 *   overrides:{s:"10 km", t:"1 h"}    → 2.7778 m/s    ✓ 自动换算到 SI
 *   overrides:{s:"10 kg", t:"1 s"}    → 量纲不符：s 是长度，kg 是质量  ✗
 * ```
 *
 * ## 一个必须守住的边界：**只校验，不猜**
 *
 * 裸数字照旧原样接受 —— 不假装能知道 `10` 是米还是公里。
 * 单位只在调用方**主动写了**的时候才生效。这跟本项目一贯的取向一致：
 * 把判据交给知道答案的一方，工具只负责比对与换算。
 *
 * @module dsh-math-calculator/param-units
 */

import { fmtNumber } from './format.js'

/**
 * 从参数描述里抠出单位符号：取描述里**最后一个像单位的片段**。
 *
 * 描述写得很自由（"位移 m"、"时间 s"、"质量1 kg"、"半径 r / m"），
 * 所以判据定为：末尾那个不含中文、不含空格的短片段，且必须是已知单位。
 *
 * 为什么不用正则硬猜：`"质量1 kg"` 里的 `1` 与 `m3`、`s^-1` 这些形态都会把
 * 朴素正则带偏。先用「已知单位表」兜底，比先写好正则再补漏洞更稳。
 *
 * @param desc - 参数描述
 * @param isKnownUnit - 判断某字符串是否为已知单位（由调用方注入，避免模块耦合）
 * @returns 单位名；抠不出时返回空串
 */

export function unitFromDescription(desc: string, isKnownUnit: (name: string) => boolean): string {
  if (typeof desc !== 'string' || desc === '') return ''
  /**
   * ## 顺序很重要：先试**整段尾部**，再逐级去掉前导文字
   *
   * 踩过：第一版按空白**与斜杠**切，于是 `"速度 m/s"` 被切成 `["速度", "m", "s"]`，
   * 取末尾得到 `s` —— 把「速度」的声明单位判成了**时间**。
   * 后果是 `kinetic_energy` 的 `v:"速度 m/s"` 变成秒，
   * 于是 `m:{m:'2 t'}, v:{v:'10 m/s'}` 报「m/s 是速度，s 是时间，不能换算」。
   *
   * 所以先按**空白**切（斜杠是复合单位的一部分，不能单独切），
   * 再从最长的尾部片段往短了试 —— `m/s` 会在更短的 `s` 之前被命中。
   */
  const pieces = desc.split(/[\s　]+/).filter((item) => item !== '')
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    /** 从当前片段起，把后缀逐段拼接试（`m` + `/` + `s` 这类不切分也能整段命中）。 */
    for (let take = pieces.length - index; take >= 1; take -= 1) {
      const candidate = cleanPiece(pieces.slice(index, index + take).join(' ').replace(/\s+/g, ''))
      if (candidate !== '' && isKnownUnit(candidate)) return candidate
    }
  }
  return ''
}

/** 去掉包裹符号与数字尾缀，得到干净的单位候选。 */
function cleanPiece(piece: string): string {
  return piece
    .replace(/^[（(\[【]+|[）)\]】。，,；;：:]+$/g, '')
    .replace(/[。，,；;：:]+$/g, '')
    .trim()
}

/** 一个参数的解析结果。 */
export interface ParsedParamValue {
  /** 换算到该参数声明单位的数值。 */
  value: number
  /** 调用方写的原始单位（没写时为空）。 */
  givenUnit?: string
  /** 实际做了一次换算（givenUnit 不是声明单位时）。 */
  converted?: boolean
}

/**
 * 解析一个「带单位」参数值。
 *
 * @param raw - 调用方传的值（`"10 m"`、`"10 km"`、或裸数字）
 * @param declaredUnit - 参数描述里声明的单位（如 `m`）；为空表示该参数没有单位约定
 * @param convertUnit - 换算函数（由调用方注入，签名对齐 `units.ts` 的 convert）
 * @returns 解析结果；失败时返回 `{ error, hint }`
 */
export function parseParamValue(
  raw: unknown,
  declaredUnit: string,
  convertUnit: (value: number, from: string, to: string) => { ok: boolean; value?: number; error?: string; hint?: string },
): ParsedParamValue | { error: string; hint: string } {
  /**
   * 裸数字（含数字字符串）：原样接受，不做任何量纲推断。
   *
   * 这是本模块最重要的一条边界 —— 不知道的事就不猜。
   * `overrides:{s:10}` 里的 10 到底是米还是公里，只有调用方知道。
   */
  const asNumber = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (Number.isFinite(asNumber)) {
    return { value: asNumber }
  }
  const text = String(raw ?? '').trim()
  if (text === '') {
    return { error: '空值', hint: '给一个数字，或「数值 + 单位」如 "10 m"。' }
  }
  /** 拆成「数值 余下部分」：数值可带符号、小数点、指数。 */
  const match = text.match(/^([+-]?[0-9][0-9.]*(?:[eE][+-]?[0-9]+)?)\s*(.+)$/)
  if (!match) {
    return {
      error: '不是「数值 + 单位」的形态: ' + text,
      hint: '写法是 "10 m"、"30 里"、"2 kg" —— 数字在前、单位在后。',
    }
  }
  const numeric = Number(match[1])
  const givenUnit = match[2].trim()
  if (!Number.isFinite(numeric)) {
    return { error: '数值部分不是有效数字: ' + match[1], hint: '检查是否多打了小数点。' }
  }
  if (!Number.isFinite(numeric)) return { error: '数值部分无效', hint: '' }

  /**
   * 参数**没有**声明单位：不擅自判定调用方写的单位对不对。
   *
   * 例如某些公式的参数是纯数（个数、比例、无量纲系数），
   * 那时写了单位多半是误用 —— 但也可能是我们没登记。折中：只剥掉数值，
   * 并在调用方（opFormula）那边决定要不要提示。
   */
  if (declaredUnit === '') {
    return { value: numeric, givenUnit }
  }

  /** 单位与声明一致：直接用。 */
  if (givenUnit === declaredUnit) {
    return { value: numeric, givenUnit }
  }
  /** 其它情况交给单位表换算 —— 它会同时完成「是否同量纲」的判定。 */
  const converted = convertUnit(numeric, givenUnit, declaredUnit)
  if (!converted.ok) {
    return {
      error: converted.error ?? '无法换算',
      hint: (converted.hint ?? '') +
        ' 这个参数声明的是「' + declaredUnit + '」，请按该量纲给值，或直接给裸数字。',
    }
  }
  return { value: Number(converted.value), givenUnit, converted: true }
}

/**
 * 中文传统单位族：这些单位一旦出现在输入里，输出就该照顾同一体系。
 *
 * ## 为什么需要它（用户 2026-11-07 直接要求）
 *
 * 用户原话：「最好使用同一体系单位，把 60 km 折算成 里。」
 *
 * ```
 *   输入：V='30 里/h', T='2 时辰'   →  60 km
 *   用户要的：60 km ≈ 60 里（因为 60 km ÷ 1 m 尺度…）
 * ```
 *
 * 这不是计算问题 —— 数值本来就对。问题是**输出换了体系**：
 * 用里和时辰下的订单，收据开了公里和小时。作者写正文时得自己再换一遍，
 * 而每换一次就多一次出错机会（这正是本项目一直在对付的那类错误）。
 *
 * ## 收哪些族
 *
 * 只收**有稳定换算系数**的传统单位族。不收「一箭之地」「一盏茶工夫」
 * 这类需要上下文的 —— 见 units-data 的收录原则。
 */
export const TRADITIONAL_FAMILIES: Record<string, string[]> = {
  /** 长度：里/丈/尺/寸/步（1 里 = 500 m，其余见 units-data） */
  length: ['里', '丈', '尺', '寸', '步'],
  /** 质量：斤/两/石/担 */
  mass: ['斤', '两', '石', '担'],
  /** 时间：时辰/刻/更 */
  time: ['时辰', '刻', '更'],
  /** 面积：亩/顷 */
  area: ['亩', '顷'],
  /** 体积：斗/升（升与 SI 同名，需靠语境区分，这里只收斗） */
  volume: ['斗'],
}

/**
 * 判断一批输入的参数用了哪些传统单位族。
 *
 * @param units - 输入里出现过的单位名（如 `['里', '时辰']`）
 * @returns 命中的量纲键（如 `['length', 'time']`）
 */
export function familiesOfUnits(units: string[]): string[] {
  const hit: string[] = []
  for (const unit of units) {
    for (const [dimension, members] of Object.entries(TRADITIONAL_FAMILIES)) {
      if (members.includes(unit) && !hit.includes(dimension)) hit.push(dimension)
    }
  }
  return hit
}

/**
 * 把 SI 结果**按输入的传统单位族折算一遍**，作为附注。
 *
 * ## 用户原话
 *
 * 「最好使用同一体系单位，把 60 km 折算成 里。」
 *
 * ## 为什么做成附注而不是替换主结果
 *
 * 主结果必须保持 SI —— 那是公式的参数约定，也是与其它计算对接的口径。
 * 而作者写正文时用的是里/丈/时辰，所以**两种都要给**：
 *
 * ```
 *   结果: 2.08333333 m/s
 *   【同体系折算】约 2.25 里/时辰（你的输入用了 里、时辰）
 * ```
 *
 * 替换掉主结果会破坏「公式内部一律 SI」这条约定；只给 SI 又要作者自己换算，
 * 而每换一次就多一次出错机会。附注是唯一不牺牲任何一边的做法。
 *
 * @param siText - 已格式化的 SI 结果文本（如 `2.08333333 m/s`）
 * @param families - 输入里用到的传统单位族（见 `familiesOfUnits`）
 * @param convert - 换算函数（注入以避免模块耦合）
 * @returns 折算附注行；不需要时为 null
 */
export function traditionalNote(
  siText: string,
  families: string[],
  convert: (value: number, from: string, to: string) => { ok: boolean; value?: number },
): string | null {
  if (families.length === 0) return null
  /** 只处理「数值 + 简单单位」—— 复合单位（m/s、kg·m/s）的量纲换算见下。 */
  const match = siText.trim().match(/^(-?[0-9][0-9.]*(?:[eE][+-]?[0-9]+)?|[-+]?[0-9.]+(?:e[+-]?[0-9]+)?)\s+(\S+)$/i)
  if (!match) {
    /**
     * 复合单位：`m/s`、`kg·m/s` 这类没法直接换成单个传统单位。
     * 但作者真正关心的是「速度」这个量在传统体系里怎么表达 ——
     * 而传统时间族里 时辰 = 2 h、长度族里 里 = 500 m。
     * 所以把分子分母分别折算，拼出「里/时辰」这种写法。
     */
    return compoundTraditionalNote(siText, families, convert)
  }
  const numeric = Number(match[1])
  const unit = match[2]
  if (!Number.isFinite(numeric)) return null
  /**
   * ★ 复合单位（`m/s`）会**先被简单式匹配到**（`\S+` 收得住斜杠）——
   * 但单纯的量纲换算换不了它，于是旧版在这里 continue 到头、return null，
   * 压根走不到下面的复合分支。踩过一次，症状是速度永远折不出里/时辰。
   */
  if (/[\/·*^]/.test(unit)) return compoundTraditionalNote(siText, families, convert)
  for (const dimension of families) {
    const target = TRADITIONAL_PREFERRED[dimension]
    if (!target) continue
    const result = convert(numeric, unit, target)
    if (!result.ok || result.value === undefined) continue
    return '【同体系折算】约 ' + fmt(result.value) + ' ' + target + '（你的输入用了传统单位）'
  }
  return null
}

/** 每个量纲在「同体系折算」里用哪个传统单位（挑最常用的那个）。 */
const TRADITIONAL_PREFERRED: Record<string, string> = {
  length: '里',
  mass: '斤',
  time: '时辰',
  area: '亩',
  volume: '斗',
}

/** 复合单位（速度/加速度等）的传统体系写法。 */
function compoundTraditionalNote(
  siText: string,
  families: string[],
  convert: (value: number, from: string, to: string) => { ok: boolean; value?: number },
): string | null {
  const text = siText.trim()
  /** 形如 `2.08 m/s`、`9.81 m/s^2`、`10 kg / s` 的复合单位。 */
  const compound = text.match(/^([-+]?[0-9.]+(?:e[+-]?[0-9]+)?)\s+([A-Za-z]+)\s*\/\s*([A-Za-z]+)(?:\^([0-9]+))?$/)
  if (!compound) return null
  const numeric = Number(compound[1])
  const numerator = compound[2]
  const denominator = compound[3]
  const power = compound[4] ? Number(compound[4]) : 1
  if (!Number.isFinite(numeric)) return null
  const hasLength = families.includes('length')
  const hasTime = families.includes('time')
  if (!hasLength || !hasTime) return null
  /** 分子折成里、分母折成时辰，得到「里/时辰」量。 */
  const up = convert(numeric, numerator, '里')
  const un = convert(1, denominator, '时辰')
  if (!up.ok || up.value === undefined || !un.ok || un.value === undefined) return null
  /** value = x 里 / (y 时辰) = (x / y) 里每时辰；power>1 时再取幂。 */
  const perHourLike = up.value / Math.pow(un.value, power)
  return '【同体系折算】约 ' + fmt(perHourLike) + ' 里/时辰' +
    (power !== 1 ? '^' + power : '') + '（你的输入用了 里、时辰）'
}

/** 折算结果的位数：保留 4 位有效数字，够看又不啰嗦。 */
const fmt = (value: number): string =>
  fmtNumber(value, { expHigh: 1e6, expLow: 1e-3, expDigits: 3, precision: 4 })
/**
 * 默认换算适配器：直接接 `units.ts` 的 `convert`。
 *
 * 为什么放在这里而不是让每个调用方自己写一遍：
 * `convert` 返回的三层结构（`{ok, conversion:{result}}`）很容易读错字段 ——
 * 本项目已经踩过一次（读 `conversion.value` 拿到 undefined）。
 * 集中一处，读错了只改一个地方。
 */
export function makeConverter(
  convert: (value: number, from: string, to: string) =>
    { ok: true; conversion: { result: number } } | { ok: false; error: string; hint: string },
): (value: number, from: string, to: string) => { ok: boolean; value?: number; error?: string; hint?: string } {
  return function (value, from, to) {
    const result = convert(value, from, to)
    if (!result.ok) return { ok: false, error: result.error, hint: result.hint }
    return { ok: true, value: result.conversion.result }
  }
}
