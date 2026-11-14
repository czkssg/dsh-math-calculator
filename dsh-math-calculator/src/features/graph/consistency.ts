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

/** 抽到的一条数值主张。 */
interface Claim {
  subject: string
  value: number
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
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 }
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
  const text = section.text
  const sectionName = String(section.number)

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
  const pattern = /([\u4e00-\u9fa5]{2,6}?)\s*[:：]?\s*(约|达到|大约|约为|为|是|有)?\s*(?:([0-9]+(?:\.[0-9]+)?)|([零〇一二三四五六七八九十百千万亿两]+))\s*(万亿|亿|万|千|百)?/g

  for (const match of text.matchAll(pattern)) {
    /** 同义词归一：『总人口』与『人口』是同一个量（反馈报告：主体切分漏报）。 */
    const SUBJECT_ALIASES: Record<string, string> = {
      总人口: '人口', 人口数: '人口', 总人口数: '人口',
      总兵力: '兵力', 兵力总数: '兵力',
      总面积: '面积', 总产量: '产量', 总储量: '储量',
      总成本: '成本', 总预算: '预算', 总支出: '支出', 总收入: '收入',
    }
    const subject = SUBJECT_ALIASES[match[1]] ?? match[1]
    /** 阿拉伯数字或中文数字（八百 / 二千）。 */
    const base = match[3] !== undefined ? Number(match[3]) : parseChineseNumber(match[4])
    const magnitudeWord = match[5]
    if (!Number.isFinite(base)) continue

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

    const magnitude = magnitudeWord !== undefined ? (MAGNITUDE[magnitudeWord] ?? 1) : 1
    claims.push({
      subject,
      value: base * magnitude,
      raw: match[0].trim(),
      section: sectionName,
    })
  }

  return claims
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
  for (const section of input.sections) {
    if (typeof section?.text !== 'string') {
      throw new CalcError(
        'invalid_argument',
        '片段 ' + String(section?.number) + ' 缺 text',
        '每个片段要有 number（编号）与 text（正文）。',
      )
    }
    allClaims.push(...extractClaims(section))
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
    /** 去重（同一值在多处出现不算冲突）。 */
    const uniqueValues = [...new Set(claims.map((c) => c.value))]
    if (uniqueValues.length < 2) continue

    /**
     * ## 判据：差异 ≥2 倍才算「口径冲突」
     *
     * 小于 2 倍的差异（如「约 1 亿」与「1.02 亿」）是**精度差异**，
     * 不是硬伤。而反馈包里的实际案例都是 10 倍以上的。
     *
     * 阈值取 2 而不是 1.1，是为了避免把「四舍五入的两种写法」当冲突。
     */
    const min = Math.min(...uniqueValues)
    const max = Math.max(...uniqueValues)
    const ratio = min === 0 ? Infinity : max / min
    /**
     * 判据（反馈报告 §3 修复路径）：**相对差 ≥10% 或 ≥2 倍**都算冲突。
     *
     * 只报 ≥2 倍会漏掉「800 万 vs 700 万」这种 14% 的差——
     * 14% 在设定里往往是改了一位数（700→800），不是精度。
     */
    const relative = min === 0 ? Infinity : (max - min) / min
    if (relative < 0.1 && ratio < 2) continue

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
  } else {
    lines.push('  发现 ' + conflicts.length + ' 处：')
    lines.push('')
    for (const conflict of conflicts) {
      const ratioText = Number.isFinite(conflict.ratio)
        ? '差 ' + (conflict.ratio >= 100 ? conflict.ratio.toFixed(0) : conflict.ratio.toFixed(1)) + ' 倍'
        : '（含 0，倍数为无穷）'
      lines.push('   ✗ [口径冲突] 「' + conflict.subject + '」有 ' +
        [...new Set(conflict.claims.map((c) => c.value))].length + ' 处不同口径，' + ratioText + '：')
      for (const claim of conflict.claims) {
        lines.push('       第' + claim.section + '段　' +
          fmtNumber(claim.value, FMT.general) + '　（原文「' + claim.raw + '」）')
      }
    }
  }

  /** 供核对的清单。 */
  lines.push('')
  lines.push('  抽到的数值主张（供核对）：')
  for (const [subject, claims] of bySubject) {
    const list = claims.map((c) => '第' + c.section + '段=' + fmtNumber(c.value, FMT.general)).join('、')
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
    },
    notice: conflicts.length > 0
      ? '发现 ' + conflicts.length + ' 处口径冲突 —— 但不判断哪个值是对的。'
      : undefined,
  }
}
