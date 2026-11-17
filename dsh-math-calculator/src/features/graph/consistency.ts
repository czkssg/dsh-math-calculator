/**
 * 数值口径体检（`consistency`）。
 *
 * ## ★ 只查「同一量两处不同值」
 *
 * 这是对账里最能抓硬伤的检查。反馈包的实测：
 *
 * ```
 *   W01  「人口 920 亿」与「人口 8 亿」同时存在   → 差 115 倍
 *   W13  「七千年」与「七万年」                  → 差 10 倍
 * ```
 *
 * 而**不查「多久没提到」** —— 那是小说的检查（读者会忘），
 * 世界观读者是按需查询，不需要某个量每章都出现。
 *
 * ## 工具不判断哪个数是对的
 *
 * 哪个数是原文给的只有作者知道。工具只把矛盾摆出来。
 *
 * @module dsh-math-calculator/features/graph/consistency
 */

import { CalcError } from '../../core/errors.js'
import { buildEngine, type Engine } from '../../core/engine.js'
import { fmtNumber, FMT } from '../../core/format.js'

/** 输入的一个片段。 */
export interface ConsistencySection {
  /** 片段编号或名字（如「第 1 段」「W02 §3」）。 */
  number: number | string
  /** 正文。 */
  text: string
}

/** 输入。 */
export interface ConsistencyInput {
  sections: ConsistencySection[]
  /** 只查这些主体（可选，空则查全部）。 */
  subjects?: string[]
}

/** mathjs 量纲位序与 SI 基准（与 function.ts 保持一致）。 */
const DIM_ORDER = ['M', 'L', 'T', 'I', 'Theta', 'J', 'N'] as const
const DIM_BASE: Record<string, string> = { M: 'kg', L: 'm', T: 's', I: 'A', Theta: 'K', J: 'cd', N: 'mol' }

/** 惰性引擎：只有出现「带单位的数字」时才构建。 */
let engineCache: Engine | null = null
function getEngine(): Engine {
  if (engineCache === null) engineCache = buildEngine()
  return engineCache
}

/**
 * 把单位串换算成 SI 基准的倍数与量纲签名。
 *
 * ## 为什么需要（R61）
 *
 * `1 km` 与 `1000 m` 是同一个量，但抽取只拿数字 → 1000 倍误报。
 * 比较前把两边都换成 SI，再比数值。
 *
 * @param unit - 单位串（如 `km`、`MJ/kg`）
 * @returns 倍数与量纲签名；不可解析返回 null
 */
function unitInfo(unit: string): { factor: number; signature: string } | null {
  try {
    const parsed = getEngine().evaluate('1 ' + unit) as {
      isUnit?: boolean
      dimensions?: number[]
      to?: (target: string) => { toNumber(): number }
    }
    if (parsed?.isUnit !== true) return null
    const dims = parsed.dimensions ?? []
    const parts: string[] = []
    const signature: string[] = []
    for (let index = 0; index < Math.min(DIM_ORDER.length, dims.length); index += 1) {
      if (dims[index] === 0) continue
      parts.push(DIM_BASE[DIM_ORDER[index]] + (dims[index] === 1 ? '' : '^' + dims[index]))
      signature.push(DIM_ORDER[index] + dims[index])
    }
    if (parts.length === 0) return { factor: 1, signature: '' }
    const factor = Number(parsed.to!(parts.join('*')).toNumber())
    return Number.isFinite(factor) ? { factor, signature: signature.join('·') } : null
  } catch {
    return null
  }
}

/** 抽到的一条数值主张。 */
interface Claim {
  subject: string
  value: number
  /** 区间上界（R61）：`50-60` 抽成 [50,60]，此时 value 是下界。 */
  upper?: number
  /** 数字后的单位串（ASCII；用于 `1 km` 与 `1000 m` 归一）。 */
  unit?: string
  /** 形态：百分比（50% = 0.5）/ 倍（2 倍 = 2）。 */
  form?: 'percent' | 'multiple'
  /** 原文片段（显示用）。 */
  raw: string
  section: string
}

/** 结果。 */
export interface ConsistencyOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 中文数字转数值（八百 / 二千 / 一万 / 十二 / 两万）。
 */
function parseChineseNumber(raw: string | undefined): number {
  if (raw === undefined || raw === '') return Number.NaN
  /** 含**大写**（壹贰叁…）：账册、契约、碑铭里全用大写，以前完全盲。 */
  const digits: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    壹: 1, 贰: 2, 貳: 2, 叁: 3, 參: 3, 肆: 4, 伍: 5, 陆: 6, 陸: 6, 柒: 7, 捌: 8, 玖: 9,
  }
  const units: Record<string, number> = {
    十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000,
    拾: 10, 佰: 100, 仟: 1000, 萬: 10000, 億: 100000000,
  }
  let total = 0
  let section = 0
  let digit = 0
  for (const char of raw) {
    if (digits[char] !== undefined) {
      digit = digits[char]
    } else if (units[char] !== undefined) {
      const unit = units[char]
      if (unit >= 10000) {
        section = (section + digit) * unit
        total += section
        section = 0
        digit = 0
      } else {
        section += (digit === 0 ? 1 : digit) * unit
        digit = 0
      }
    } else {
      return Number.NaN
    }
  }
  return total + section + digit
}

/**
 * 中文量级折算。
 *
 * ```
 *   1.49 亿  →  149000000
 *   920 亿   →  92000000000
 *   3 千年   →  3000（年）
 * ```
 */
const MAGNITUDE: Record<string, number> = {
  万: 1e4,
  亿: 1e8,
  万亿: 1e12,
  兆: 1e12,
  千: 1e3,
  百: 1e2,
}

/**
 * 从一个片段里抽数值主张。
 *
 * ## 抽什么
 *
 * 只抽「**主体 + 数字 + 量级词**」的三元组：
 *
 * ```
 *   「人口 920 亿」     → subject=人口, value=9.2e10
 *   「总人口约 8 亿」   → subject=总人口, value=8e8
 *   「山高 4893 m」     → subject=山高, value=4893
 * ```
 *
 * 不抽裸露的数字（「第 3 章」「1984 年」会被误抽）。
 *
 * @param section - 片段
 * @returns 抽到的主张
 */
function extractClaims(section: ConsistencySection): Claim[] {
  const claims: Claim[] = []
  /** 被丢弃的指代型主体数（供上层统计，避免「静默通过」）。 */
  const dropped: string[] = []
  const text = section.text
  /** 没给编号时留空（`String(undefined)` 会产出字符串 "undefined"，显示成「第undefined段」）。 */
  const sectionName = section.number !== undefined && section.number !== null ? String(section.number) : ''

  /**
   * 模式：中文主体（2–6 字）+ 可选空格/冒号 + 可选程度词 + 数字 + 可选量级词。
   *
   * ```
   *   人口 920 亿
   *   总人口约 8 亿
   *   山高: 4893
   *   储量达到 1.49 亿吨
   * ```
   *
   * ## ⚠ 程度词**不能吸进主体**
   *
   * 实测（2026-11-13）：第一版把「约」前面全当主体，于是
   *
   * ```
   *   第1段「帝国总人口 920 亿」  →  subject = '帝国总人口'
   *   第2段「帝国总人口约 8 亿」  →  subject = '帝国总人口约'   ← 多了「约」
   * ```
   *
   * 两个主体名不同 → **不被判为同一个量 → 漏报冲突**。
   * 而「920 亿 vs 8 亿」正是反馈包里的头号案例（差 115 倍）。
   *
   * 修法：主体用**非贪婪**匹配，程度词单独成组（`(?:约|达到|为|是|有)?` 在主体之后）。
   */
  /**
   * 数字字符集含**大写中文数字**（R51 C 类：壹仟贰佰 以前完全匹配不到）。
   * 大小写混写（壹仟200）也能吃进来，由 parseChineseNumber 处理。
   */
  const CN_DIGITS = '零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟萬億'
  /**
   * 主体字符集必须**排除数字汉字**（R51）：
   * 中文数字本身在 `[\u4e00-\u9fa5]` 里，不排除的话
   *
   * ```
   *   部壹仟贰佰人  →  主体被抽成「部壹」   ✗
   *   部八百至一千人 →  主体被抽成「部八」「至一」 ✗
   * ```
   *
   * 所以主体用「非数字汉字」的 1–6 字（单字主体如「部」「军」也合法，
   * 噪音由下方的 SKIP_SUBJECTS 与指代词过滤兜住）。
   */
  const SUBJECT = '(?:(?![' + CN_DIGITS + '])[\\u4e00-\\u9fa5]){1,6}?'
  /**
   * 负号必须与数字一起匹配（R58）：「反应焓变 -876 kJ/mol」原先整条不匹配，
   * 两段负数抽出 0 条、判「无冲突」。支持半角 -、全角 −/－ 与「负」字；
   * 单位后缀（kJ/mol）不参与匹配，不会阻断抽取。
   */
  const pattern = new RegExp(
    '(' + SUBJECT + ')\\s*[:：]?\\s*(约|达到|大约|约为|为|是|有)?\\s*(负\\s*|[-−－]\\s*|\\+\\s*)?' +
      '(?:([0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?\\d+)?)|([' + CN_DIGITS + ']+))\\s*(万亿|亿|万|千|百|萬億|萬|億)?\\s*(%|％|倍)?' +
      '\\s*([A-Za-zµ°Ω][A-Za-z0-9µ°Ω^*/·.()\\-]*)?(?:\\s*(?:-|~|—|–|至|到)\\s*([-]?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?\\d+)?))?',
    'g',
  )

  for (const match of text.matchAll(pattern)) {
    /** 同义词归一：『总人口』与『人口』是同一个量（反馈报告：主体切分漏报）。 */
    const SUBJECT_ALIASES: Record<string, string> = {
      总人口: '人口', 人口数: '人口', 总人口数: '人口',
      总兵力: '兵力', 兵力总数: '兵力',
      总面积: '面积', 总产量: '产量', 总储量: '储量',
      总成本: '成本', 总预算: '预算', 总支出: '支出', 总收入: '收入',
    }
    const subject = SUBJECT_ALIASES[match[1]] ?? match[1]
    /** 符号组：`-`/`−`/`－`/`负` 为负；`+` 或未给为正。 */
    const negative = match[3] !== undefined && /负|[-−－]/.test(match[3])
    /** 阿拉伯数字或中文数字（八百 / 二千）。 */
    const base = match[4] !== undefined ? Number(match[4]) : parseChineseNumber(match[5])
    const magnitudeWord = match[6]
    if (!Number.isFinite(base)) continue
    /** 形态（R61）：50% → 0.5；2 倍 → 2。 */
    const formWord = match[7]
    const form = formWord === '%' || formWord === '％' ? 'percent' : formWord === '倍' ? 'multiple' : undefined
    /** 单位串去掉尾随标点（`km.` → `km`）。 */
    const unit = match[8] !== undefined ? match[8].replace(/[.,;:]+$/, '') : undefined
    /** 区间上界（`50-60` / `-10~-5`）。 */
    const upper = match[9] !== undefined ? Number(match[9]) : undefined

    /**
     * ## 过滤明显的非数量词
     */
    const SKIP_SUBJECTS = new Set([
      '第几', '如下', '其中', '以上', '以下', '一共', '总共', '大约',
      '这个', '那个', '这些', '那些', '我们', '他们',
    ])
    if (SKIP_SUBJECTS.has(subject)) continue
    /**
     * 主体不能以程度词结尾（防 `帝国总人口约` 这类残留）。
     */
    if (/[约达到为是有]$/.test(subject)) continue
    /**
     * 主体不能以指代词开头（R48：「这支军队有八百人」抽出主体「这支军队」，
     * 「另一处写着二千人」抽出「另一处写着」——都不是同一个量，会误报/漏报）。
     * 指代型主体一律丢弃：它们指向语境，不是可比较的量名。
     */
    if (/^(这|那|该|此|其|另一|另|本|该处|上述|其中|其余|剩下|其他)/.test(subject)) { dropped.push(subject); continue }

    const magnitude = magnitudeWord !== undefined ? (MAGNITUDE[magnitudeWord] ?? 1) : 1
    claims.push({
      subject,
      value: (negative ? -base : base) * magnitude,
      ...(upper !== undefined ? { upper } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(form !== undefined ? { form } : {}),
      raw: match[0].trim(),
      section: sectionName,
    })
  }

  /** 把丢弃记录挂到数组上（不改接口，靠属性传给上层）。 */
  Object.defineProperty(claims, 'droppedSubjects', { value: dropped, enumerable: false })
  return claims
}


/**
 * 片段标签：有编号写「第 N 段」，没编号就不写（避免「第段」「第undefined段」）。
 *
 * @param section - 片段编号（可能为空）
 * @returns 展示用标签
 */
function labelOf(section: string): string {
  return section === '' ? '原文' : '第' + section + '段'
}

/**
 * 口径体检。
 *
 * @param input - 输入
 * @returns 结果
 */
export function checkConsistency(input: ConsistencyInput): ConsistencyOutcome {
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    throw new CalcError(
      'missing_params',
      'consistency 需要 sections（片段列表），不能为空',
      '例如 {consistency:{sections:[{number:1,text:"人口 920 亿"},{number:2,text:"人口 8 亿"}]}}。',
    )
  }

  /** 抽全部主张。 */
  const allClaims: Claim[] = []
  /** 因「主体是代词」被丢弃的条目（要报给调用方，否则等于静默通过）。 */
  const droppedSubjects: string[] = []
  for (const section of input.sections) {
    if (typeof section?.text !== 'string') {
      throw new CalcError(
        'invalid_argument',
        '片段 ' + String(section?.number) + ' 缺 text',
        '每个片段要有 number（编号）与 text（正文）。',
      )
    }
    const extracted = extractClaims(section)
    const droppedOfSection = (extracted as unknown as { droppedSubjects?: string[] }).droppedSubjects ?? []
    droppedSubjects.push(...droppedOfSection)
    allClaims.push(...extracted)
  }

  /** 显示：区间写成 `50–60`，其余走通用格式。 */
  const claimDisplay = (claim: Claim): string => {
    if (claim.upper === undefined) return fmtNumber(claim.value, FMT.general)
    const low = Math.min(claim.value, claim.upper)
    const high = Math.max(claim.value, claim.upper)
    return fmtNumber(low, FMT.general) + '–' + fmtNumber(high, FMT.general)
  }

  /** 按主体分组。 */
  const bySubject = new Map<string, Claim[]>()
  for (const claim of allClaims) {
    const list = bySubject.get(claim.subject) ?? []
    list.push(claim)
    bySubject.set(claim.subject, list)
  }

  /** 只查有 ≥2 个**不同值**的主体。 */
  const conflicts: Array<{
    subject: string
    claims: Claim[]
    ratio: number
  }> = []

  for (const [subject, claims] of bySubject) {
    /** 归一：百分比 ÷100；带单位只在所有条目同量纲时换算到 SI（R61）。 */
    const infos = claims.map((claim) => (claim.unit !== undefined ? unitInfo(claim.unit) : null))
    const signatures = infos.filter((info) => info !== null).map((info) => info.signature)
    const comparable = signatures.every((signature) => signature === signatures[0])
    const normalized = claims.map((claim, index) => {
      let value = claim.value
      if (claim.form === 'percent') value /= 100
      const info = infos[index]
      if (comparable && info !== null) value *= info.factor
      return value
    })
    const uppers = claims.map((claim, index) => {
      if (claim.upper === undefined) return undefined
      let upper = claim.upper
      const info = infos[index]
      if (comparable && info !== null) upper *= info.factor
      return upper
    })
    /**
     * 区间相容（R61）：`50-60` 与 `55` 是同一口径；区间重叠也不算冲突。
     * 只有「有点落在所有区间外」或「区间互不重叠」才报。
     */
    const ranges: Array<[number, number]> = []
    for (let index = 0; index < claims.length; index += 1) {
      const upper = uppers[index]
      if (upper !== undefined) ranges.push([Math.min(normalized[index], upper), Math.max(normalized[index], upper)])
    }
    if (ranges.length > 0) {
      const points = normalized.filter((_, index) => uppers[index] === undefined)
      const inAnyRange = (point: number): boolean => ranges.some(([low, high]) => point >= low && point <= high)
      const rangesOverlap = ranges.every(([low, high]) => ranges.some(([low2, high2]) => low <= high2 && low2 <= high))
      if (points.every(inAnyRange) && rangesOverlap) continue
    }
    /** 去重（同一值在多处出现不算冲突）；区间端点也参与。 */
    const uniqueValues = [...new Set([...normalized, ...uppers.filter((upper): upper is number => upper !== undefined)])]
    if (uniqueValues.length < 2) continue

    /**
     * ## 判据：差异 ≥2 倍才算「口径冲突」
     *
     * 小于 2 倍的差异（如「约 1 亿」与「1.02 亿」）是**精度差异**，
     * 不是硬伤。而反馈包里的实际案例都是 10 倍以上的。
     *
     * 阈值取 2 而不是 1.1，是为了避免把「四舍五入的两种写法」当冲突。
     */
    /**
     * 负数用绝对值算倍数（R58）：-876 与 -324 的比例是 2.7；
     * 而把带符号的 min/max 相除会得到负的相对差 → 被判「精度差异」漏报。
     * 正负号相反本身是硬伤（+876 vs -876），直接算冲突。
     */
    const absValues = uniqueValues.map((value) => Math.abs(value))
    const signFlip = uniqueValues.some((value) => value > 0) && uniqueValues.some((value) => value < 0)
    const min = Math.min(...absValues)
    const max = Math.max(...absValues)
    const ratio = min === 0 ? Infinity : max / min
    /**
     * 判据（反馈报告 §3 修复路径）：**相对差 ≥10% 或 ≥2 倍**都算冲突。
     *
     * 只报 ≥2 倍会漏掉「800 万 vs 700 万」这种 14% 的差——
     * 14% 在设定里往往是改了一位数（700→800），不是精度。
     */
    const relative = min === 0 ? Infinity : (max - min) / min
    if (!signFlip && relative < 0.1 && ratio < 2) continue

    conflicts.push({ subject, claims, ratio })
  }

  /** 按差异倍数降序（最严重的在前）。 */
  conflicts.sort((a, b) => b.ratio - a.ratio)

  /** 正文。 */
  const lines: string[] = []
  lines.push('═══ 数值口径体检 ═══')
  lines.push('')
  lines.push('  片段 ' + input.sections.length + ' 个　抽出数值主张 ' + allClaims.length +
    ' 条　涉及主体 ' + bySubject.size + ' 个')
  lines.push('')

  if (conflicts.length === 0) {
    lines.push('✓ 没有发现同一量出现多个不同值（差异 ≥10% 或 ≥2 倍的才算冲突）。')
    if (droppedSubjects.length > 0) {
      lines.push('')
      lines.push('⚠ 另有 ' + droppedSubjects.length + ' 条**因主体是指代词**（这/那/该/另一…）被丢弃，未参与比对：')
      lines.push('    ' + [...new Set(droppedSubjects)].slice(0, 8).join('、'))
      lines.push('    若要参与比对，请把主体写实（如「北境军兵力 800」而不是「这支军队有 800 人」）。')
    }
  } else {
    lines.push('  发现 ' + conflicts.length + ' 处：')
    lines.push('')
    for (const conflict of conflicts) {
      const ratioText = Number.isFinite(conflict.ratio)
        ? '差 ' + (conflict.ratio >= 100 ? conflict.ratio.toFixed(0) : conflict.ratio.toFixed(1)) + ' 倍'
        : '（含 0，倍数为无穷）'
      lines.push('   ✗ [口径冲突] 「' + conflict.subject + '」有 ' +
        [...new Set(conflict.claims.map((claim) => claimDisplay(claim)))].length + ' 处不同口径，' + ratioText + '：')
      for (const claim of conflict.claims) {
        lines.push('       ' + labelOf(claim.section) + '　' +
          claimDisplay(claim) + '　（原文「' + claim.raw + '」）')
      }
    }
  }

  /** 供核对的清单。 */
  lines.push('')
  lines.push('  抽到的数值主张（供核对）：')
  for (const [subject, claims] of bySubject) {
    const list = claims.map((c) => labelOf(c.section) + '=' + claimDisplay(c)).join('、')
    lines.push('    ' + subject + '：' + list)
  }

  lines.push('')
  lines.push('  ★ 只查**同一量两处不同值**（世界观硬伤的主因），不查「多久没提到」')
  lines.push('    —— 后者是小说的检查：小说读者会忘，世界观读者是按需查询。')
  lines.push('  ★ 工具只报冲突，**不判断哪一处是对的** —— 哪个数是原文给的只有你知道。')

  return {
    result: lines.join('\n'),
    value: {
      sections: input.sections.length,
      claimCount: allClaims.length,
      subjects: [...bySubject.keys()],
      conflicts: conflicts.map((c) => ({
        subject: c.subject,
        ratio: Number.isFinite(c.ratio) ? c.ratio : null,
        claims: c.claims.map((claim) => ({ value: claim.value, section: claim.section, raw: claim.raw })),
      })),
      allClaims,
      /** 指代型主体被丢弃（这些量没参与比对）。 */
      droppedSubjects,
    },
    notice: conflicts.length > 0
      ? '发现 ' + conflicts.length + ' 处口径冲突 —— 但不判断哪个值是对的。'
      : undefined,
  }
}