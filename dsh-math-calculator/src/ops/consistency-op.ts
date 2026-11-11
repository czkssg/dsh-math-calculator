/**
 * operation="consistency" 的实现：数值口径一致性体检。
 *
 * ## 一份重要的自我更正：上一版移植错了
 *
 * 上一版我照搬了 novel-writer 的三个检查（陈条/缺席/断线），
 * 理由是「小说与世界观同构」。**这个判断是错的**，实测两处反例：
 *
 * ```
 * ① 正常背景设定被误报
 *    第 1 段写「行星半径 8000 公里、重力 1.4 倍地球」，之后 19 段讲政治
 *    → 工具报「P01 立了 19 段还没回收」（陈条）
 *    → 但常量型设定**本来就不该被「回收」**，立一次一直有效才是对的
 *
 * ② 真实硬伤反而查不出
 *    第 1 段「人口 920 亿」、第 5 段「人口 8 亿」（差 115 倍）
 *    → 工具报「没发现结构问题」
 * ```
 *
 * ## 两者的本质差异（这才是该移植什么的分界）
 *
 * ```
 *   小说是「顺序阅读」              世界观是「查询式使用」
 *   ─────────────────────          ─────────────────────
 *   读者会忘 → 缺席是问题           读者按需查 → 缺席不是问题
 *   伏笔必有回收 → 陈条是问题       常量型设定永不回收 → 陈条不是问题
 *   一致性 = 前后提及对得上         一致性 = **同一件事两处说的数相悖**
 * ```
 *
 * 反馈包统计的 282 条硬伤里，一致性类**全是数值层**：
 *
 * ```
 *   W13 人口三套口径差 10–33 倍
 *   W18 39 亿 vs「数百万计」差 1000 倍
 *   W13 分项 6300 ≠ 自称 5500
 *   W20 42 MJ/kg 与 3.7 倍不自洽
 * ```
 *
 * 所以本操作改查**三类数值口径问题**，而叙事层那三个降为可选。
 *
 * @module dsh-math-calculator/ops/consistency-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个片段。 */
interface Section {
  /** 序号（从 1 起）。 */
  number: number
  /** 标题（可选）。 */
  title?: string
  /** 正文。 */
  text: string
}

/** 从文本里抽到的一个「数值主张」。 */
interface Quantity {
  /** 主体（如「人口」「面积」）。 */
  subject: string
  /** 数值。 */
  value: number
  /** 单位原文（如「亿人」「平方公里」）。 */
  unit: string
  /** 所在片段号。 */
  section: number
  /** 原文片段（供核对）。 */
  raw: string
}

/** 一处不一致。 */
interface Inconsistency {
  /** 类型。 */
  kind: 'multi_value' | 'unit_mismatch' | 'order_conflict'
  /** 严重度。 */
  severity: number
  /** 一句话。 */
  message: string
  /** 涉及的主体。 */
  subject: string
  /** 各处主张。 */
  quantities: Quantity[]
}

/**
 * 中文量级词 → 10 的幂。
 *
 * 与 extract_numbers 用同一套——中文量级折算是这个项目的既有能力，
 * 不该在第二个地方另写一份。
 */
const MAGNITUDE: Array<{ word: string; power: number }> = [
  { word: '万亿', power: 12 },
  { word: '千亿', power: 11 },
  { word: '百亿', power: 10 },
  { word: '十亿', power: 9 },
  { word: '亿', power: 8 },
  { word: '千万', power: 7 },
  { word: '百万', power: 6 },
  { word: '十万', power: 5 },
  { word: '万', power: 4 },
  { word: '千', power: 3 },
  { word: '百', power: 2 },
]

/**
 * 会被当成「同一量」核对的量纲词。
 *
 * ## 为什么只收这些
 *
 * `consistency` 要判「两处说的是不是同一个量」，那必须**认得主体**。
 * 主体认不准就会把「人口 8 亿」和「面积 8 亿平方公里」混为一谈 ——
 * 那是灾难性的假报。
 *
 * 所以只收**含义单一、区分度高**的主体词。认不出的宁可漏报。
 */
const SUBJECTS: Array<{ name: string; words: string[]; unitHints: string[] }> = [
  /**
   * ## 主体词要收「隐含主体」
   *
   * 第一版只收「人口」这个词本身，于是「首都有 1000 万人」
   * 抽不到（它没写「人口」，但说的就是人口）——
   * 结果同一件事只有一处被抽到，冲突自然就漏了。
   *
   * 所以补上「说人口但不用人口这个词」的常见主体。
   * 但**不能收太泛**（如「有」），否则会把任意数都算成人口。
   */
  { name: '人口', words: ['人口', '居民', '民众', '总人数', '首都', '城市', '巢都', '王国', '帝国'], unitHints: ['人', '万'] },
  { name: '兵力', words: ['兵力', '军队', '士兵', '驻军', '守军', '兵'], unitHints: ['人', '万', '个'] },
  { name: '面积', words: ['面积', '国土', '版图', '辖区', '疆域'], unitHints: ['平方公里', '平方千米', '万平方公里', '公顷', '亩'] },
  { name: '高度', words: ['高', '高度', '塔高', '层高'], unitHints: ['米', '公里', '千米', '英尺'] },
  { name: '半径', words: ['半径'], unitHints: ['米', '公里', '千米'] },
  { name: '质量', words: ['质量', '重量', '体量'], unitHints: ['吨', '千克', '公斤', '万吨', '亿吨'] },
  { name: '功率', words: ['功率', '发电量', '能耗'], unitHints: ['瓦', '千瓦', '兆瓦', '吉瓦', 'W', 'kW', 'MW', 'GW'] },
  { name: '税率', words: ['税率', '税额', '赋税'], unitHints: ['%'] },
  { name: '产量', words: ['产量', '年产', '产出'], unitHints: ['吨', '万吨', '亿吨', '件'] },
]

/**
 * 从一段文本里抽出所有数值主张。
 *
 * @param text - 片段正文
 * @param section - 片段号
 * @returns 抽到的数值主张
 */
function extractQuantities(text: string, section: number): Quantity[] {
  const out: Quantity[] = []
  /**
   * 逐个主体找：主体词之后（同一分句内）出现的第一个数字。
   *
   * 用「分句内」而不是「全文」是刻意的 —— 一句里可能有两个数
   * （`人口 920 亿、面积 5 亿平方公里`），跨分句取会把它们混起来。
   */
  const clauses = text.split(/[，。；、,.;]/)
  for (const clause of clauses) {
    for (const subject of SUBJECTS) {
      if (!subject.words.some((word) => clause.includes(word))) continue
      /**
       * 数字 + 可选中文量级 + 可选单位（**只从白名单里认**）。
       *
       * 第一版用 `[^\d\s]{0,6}` 兜单位，于是「920 亿**后开始外溢**」
       * 把后面半句话当成了单位。单位必须从白名单里认。
       */
      const unitList = subject.unitHints.join('|')
      const numRe = new RegExp(
        '([\\d.]+)\\s*(万亿|千亿|百亿|十亿|亿|千万|百万|十万|万|千|百)?\\s*(' + unitList + ')?',
        'g',
      )
      for (const match of clause.matchAll(numRe)) {
        const base = Number(match[1])
        if (!Number.isFinite(base)) continue
        const magWord = match[2]
        const mag = magWord ? (MAGNITUDE.find((item) => item.word === magWord)?.power ?? 0) : 0
        /** 只接受带中文量级或带单位的数 —— 裸小数多半是序号/比例，不算「主张」。 */
        const unitRaw = (match[3] ?? '').trim()
        if (mag === 0 && unitRaw === '') continue
        /** 排除明显的非量值（如「300 年」是时长，不是该主体的人口）。 */
        if (/^年|^月|^天|^%/.test(unitRaw)) continue
        /**
         * ★ 量级已折算进数值，单位里就**不能再带量级词**。
         *
         * 第一版 output 是 `9.200e+10 亿` —— 数值已经是 920 亿了，
         * 再标一个「亿」等于说了两遍，而且读起来像 9.2e10 个「亿」。
         */
        out.push({
          subject: subject.name,
          value: base * Math.pow(10, mag),
          unit: unitRaw,
          section,
          raw: clause.trim().slice(0, 60),
        })
        break
      }
    }
  }
  return out
}

/**
 * 判断两个数值是否「实质冲突」。
 *
 * ## 为什么不要求完全相等
 *
 * 同一件事在不同处的表述会有合理差异：
 *
 * ```
 *   「约 920 亿」与「920 亿」        → 同一值
 *   「约 920 亿」与「900 亿出头」    → 近似但不同口径，属可疑但轻
 *   「920 亿」与「8 亿」             → 差 115 倍，**实质冲突**
 * ```
 *
 * 所以用**倍数**判：差 3 倍以上才算实质冲突（3 倍以内可能是口径差异，
 * 如「含周边」与「不含周边」）。
 *
 * @param a - 值 a
 * @param b - 值 b
 * @returns 倍数（≥1）
 */
function ratioOf(a: number, b: number): number {
  if (a === 0 || b === 0) return a === b ? 1 : Number.POSITIVE_INFINITY
  return Math.max(Math.abs(a / b), Math.abs(b / a))
}

/**
 * `consistency`：数值口径一致性体检。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opConsistency(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).consistency
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'consistency 需要给一个对象：{ sections }',
      '例如 {consistency:{sections:[{number:1,text:"巢都人口 920 亿"},{number:5,text:"人口约 8 亿"}]}}。' +
        '它查**同一量在不同处写了不同值**（这是世界观硬伤的主因），' +
        '而不是「多久没提到」（那是小说的检查）。',
    )
  }

  const obj = raw as Record<string, unknown>
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : []
  if (sectionsRaw.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'consistency 需要 sections（片段列表），收到空',
      '每项 {number, title?, text}。没有片段就无从比对数值口径。',
    )
  }

  const sections: Section[] = sectionsRaw.map((item, index) => {
    const one = (item ?? {}) as Record<string, unknown>
    return {
      number: typeof one.number === 'number' ? one.number : index + 1,
      title: typeof one.title === 'string' ? one.title : undefined,
      text: typeof one.text === 'string' ? one.text : '',
    }
  })
  sections.sort((a, b) => a.number - b.number)

  /** 冲突阈值：同一主体两处差这么多倍才算实质冲突。 */
  const conflictRatio =
    typeof obj.conflictRatio === 'number' && obj.conflictRatio > 1 ? obj.conflictRatio : 3

  /** 抽全部数值主张。 */
  const all: Quantity[] = []
  for (const section of sections) {
    all.push(...extractQuantities(section.text, section.number))
  }

  /** 按主体归组。 */
  const bySubject = new Map<string, Quantity[]>()
  for (const item of all) {
    const list = bySubject.get(item.subject) ?? []
    list.push(item)
    bySubject.set(item.subject, list)
  }

  const inconsistencies: Inconsistency[] = []

  for (const [subject, list] of bySubject) {
    if (list.length < 2) continue
    /** 找最大与最小值的倍数 —— 这是最快发现「同一量多口径」的方式。 */
    const sorted = [...list].sort((a, b) => a.value - b.value)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const ratio = ratioOf(max.value, min.value)

    if (ratio >= conflictRatio) {
      /**
       * 严重度按倍数分档：
       * ```
       *   3–10 倍   可疑（可能是口径差异，如含/不含周边）
       *   10–100 倍 明确冲突
       *   >100 倍   严重（多半是量级笔误或抄错）
       * ```
       */
      const severity = ratio >= 100 ? 10 : ratio >= 10 ? 7 : 4
      /**
       * ★ 展示顺序按**片段号**排，不按数值大小。
       *
       * 按数值排会让读者看不出「故事在哪一段说了什么」；
       * 按段落顺序列才便于顺着原文核对（`第1段 920亿 → 第5段 8亿`）。
       */
      const inOrder = [...list].sort((a, b) => a.section - b.section)
      inconsistencies.push({
        kind: 'multi_value',
        severity,
        message:
          '「' + subject + '」有 ' + list.length + ' 处不同口径，差 ' +
          fmtRatio(ratio) + '：' +
          inOrder
            .map((item) => '第' + item.section + '段 ' + fmtNum(item.value) + ' ' + item.unit)
            .join('　vs　'),
        subject,
        quantities: inOrder,
      })
    }

    /**
     * 单位口径不一致（同一主体用了不同写法）。
     *
     * ★ 只在**数值不冲突**时才报这一条 —— 否则就是噪音：
     * 「1000 万人」与「2000 万」本来就该报「差 2 倍」，
     * 再叠一条「单位不同」等于把一个问题的两种表现拆成两个。
     */
    const units = new Set(list.map((item) => item.unit).filter((unit) => unit !== ''))
    if (units.size > 1 && ratio < conflictRatio) {
      inconsistencies.push({
        kind: 'unit_mismatch',
        severity: 1,
        message: '「' + subject + '」各处单位写法不同：' + [...units].join(' / ') +
          '（数值不冲突，但口径最好统一）',
        subject,
        quantities: list,
      })
    }
  }

  inconsistencies.sort((a, b) => b.severity - a.severity)

  // ── 渲染 ──
  const lines: string[] = []
  lines.push('═══ 数值口径体检 ═══')
  lines.push('')
  lines.push('  片段 ' + sections.length + ' 个　抽出数值主张 ' + all.length +
    ' 条　涉及主体 ' + bySubject.size + ' 个')
  lines.push('')

  if (inconsistencies.length === 0) {
    lines.push('  ✓ 没发现数值口径冲突。')
    if (all.length === 0) {
      lines.push('')
      lines.push('  ⚠ 但也**一条数值主张都没抽到** —— 这可能是')
      lines.push('    ① 正文里确实没有带量级的数值（如纯叙述段）')
      lines.push('    ② 或数值的表述形式我没认出来（只认「数字 + 中文量级/单位」）')
      lines.push('    这条说明必须给出来，否则「没冲突」会被误读成「检查过了没问题」。')
    }
  } else {
    lines.push('  发现 ' + inconsistencies.length + ' 处：')
    lines.push('')
    for (const item of inconsistencies) {
      const label =
        item.kind === 'multi_value' ? '口径冲突'
          : item.kind === 'unit_mismatch' ? '单位不一'
            : '量级可疑'
      lines.push('   ✗ [' + label + '] ' + item.message)
      lines.push('')
    }
  }

  /** 抽出全部主张，供人工核对（这是「可核对性」的一半）。 */
  if (all.length > 0) {
    lines.push('  抽到的数值主张（供核对）：')
    for (const [subject, list] of bySubject) {
      lines.push('    ' + subject + '：' +
        list.map((item) => '第' + item.section + '段=' + fmtNum(item.value)).join('、'))
    }
  }

  lines.push('')
  lines.push('  ★ 只查**同一量两处不同值**（世界观硬伤的主因），不查「多久没提到」')
  lines.push('    —— 后者是小说的检查：小说读者会忘，世界观读者是按需查询。')
  lines.push('  ★ 工具只报冲突，**不判断哪一处是对的** —— 哪个数是原文给的只有你知道。')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      sections: sections.length,
      quantities: all,
      subjects: [...bySubject.keys()],
      inconsistencies,
      conflictRatio,
      /** 抽到了几条主张 —— 0 条时「没冲突」不可信，调用方要能看出来。 */
      quantityCount: all.length,
    }),
  }
}

/**
 * 数字显示。
 *
 * @param value - 数值
 * @returns 显示串
 */
function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * 倍数显示（取 1 位小数，大数用整数）。
 *
 * @param ratio - 倍数
 * @returns 显示串
 */
function fmtRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '无穷'
  return ratio >= 10 ? String(Math.round(ratio)) + ' 倍' : ratio.toFixed(1) + ' 倍'
}
