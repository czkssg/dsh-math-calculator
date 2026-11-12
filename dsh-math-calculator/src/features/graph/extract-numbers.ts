/**
 * 从文本抽数字，形成结构化台账（`extract_numbers`）。
 *
 * ## 这一步在整条工作流里的位置
 *
 * ```
 *   PDF → 文本     由宿主 read_pdf / async_parse_pdf 负责
 *   文本 → 台账    本模块负责          ← 只做这一层
 * ```
 *
 * 不重复造 PDF 解析器：本模块接受一段文本，输出结构化的数字列表。
 *
 * ## 它比正则强在哪
 *
 * ```
 *   ① 认出数字    含中文量级（亿/万/千）、区间（20-50）、千分位、科学计数
 *   ② 判断单位    区分「元/吨/人/年」与「页码/时间戳/轮次」这类噪音
 *   ③ 给出上下文  每个数字带上它所在的那半句话，否则抽出来也不知道是什么
 * ```
 *
 * 反馈包实测：22,115 行台账里 60% 是噪音（「已思考（用时 7 秒）」也含数字），
 * 所以第 ② 步是必需项，不是可选装饰。
 *
 * ## 开源调研（2026-11-13）
 *
 * ```
 *   nzh                 1.0.14  BSD-2  周下载待查  数字 → 中文（反方向），不解析中文
 *   parse-chinese-number 1.0.5  ISC     停更 2022   只解析纯中文数字串，不管量级/单位/上下文
 * ```
 * 没有「中文数字 + 量级 + 单位 + 上下文 + 噪音过滤」的现成实现，故自写。
 * 若将来要支持「三千五百人」这类纯中文数字，可引入 nzh 的反向解析（nzh/cn 只做生成，
 * 反向需另找）；本模块当前只折算量级词，不解析中文数词。
 *
 * @module dsh-math-calculator/features/graph/extract-numbers
 */

import { CalcError } from '../../core/errors.js'

/** 抽到的一个数字。 */
export interface ExtractedNumber {
  /** 原文里的数字片段（不含量级词，如 `1.49`）。 */
  raw: string
  /** 数值（中文量级已折算）。 */
  value: number
  /** 区间上界；非区间时与 value 相同。 */
  high: number
  /** 单位（量级词 + 单位词，如 `亿`、`万吨`）；认不出为 null。 */
  unit: string | null
  /** 所在半句（≤120 字）。 */
  context: string
  /** 行号（从 1 起）。 */
  line: number
  /** 是否被判为噪音。 */
  noise: boolean
  /** 噪音原因。 */
  noiseReason?: string
}

/** 中文量级词 → 10 的幂（长的在前，避免 `万亿` 被 `万` 抢先匹配）。 */
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

/** 噪音判据。 */
const NOISE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /已思考|思考中|用时\s*\d+\s*秒/, reason: 'AI 思考耗时标记' },
  { pattern: /^=+\s*PAGE\s*\d+|^\d+\s*\/\s*\d+\s*$/, reason: '页码' },
  { pattern: /^\d{4}\/\d{1,2}\/\d{1,2}|^\d{4}-\d{2}-\d{2}/, reason: '日期戳' },
  { pattern: /\d{1,2}:\d{2}(:\d{2})?/, reason: '时间戳' },
  { pattern: /本回答由\s*AI\s*生成|仅供参考/, reason: '免责声明' },
  { pattern: /^\s*第\s*\d+\s*轮|^R\d{1,3}\s|^\s*\d+[.、]\s*$/, reason: '轮次/序号' },
  { pattern: /deepseek\.com|https?:\/\//, reason: '页眉页脚链接' },
]

/** 单位提示词（只收会出现在设定里的单位）。 */
const UNIT_HINTS = [
  '吨', '公斤', '千克', 'kg', '克', 'g', '斤', '磅',
  '米', '千米', '公里', '里', '英尺', 'm', 'km', 'cm', 'mm',
  '平方米', '平方公里', 'm²', 'm2', 'km²', '亩', '公顷', '平方英尺',
  '立方米', 'm³', 'm3', '升', 'L', '加仑', '桶',
  '年', '天', '日', '小时', '分钟', '秒', '月', '周', 'h', 's', 'min',
  '人', '个', '台', '辆', '艘', '门', '座', '栋', '层', '间', '条', '只',
  '元', '美元', '英镑', '先令', '两', '文', '贯',
  '度', '℃', '°C', 'K', '焦', 'J', '卡', 'kcal', '瓦', 'W', 'kW', 'MW', 'GW',
  '帕', 'Pa', 'kPa', 'MPa', 'atm', '巴',
  '牛', 'N', 'kN', '马力', 'hp',
  '焦每千克', 'MJ/kg', 'kJ/kg', '每千克',
  '%', '倍', '分之一',
]

/** 区间分隔符（`-`、`~`、`至`、`到`）。 */
const INTERVAL_RE = /(-?\d[\d,]*(?:\.\d+)?)\s*(?:[-~至到])\s*(-?\d[\d,]*(?:\.\d+)?)/g
/** 单值。 */
const SINGLE_RE = /(-?\d[\d,]*(?:\.\d+)?)(?:\s*[eE]([+-]?\d+))?/g

/** 取数字后紧跟的量级词。 */
function magnitudeAt(text: string): { word: string; power: number } | undefined {
  const trimmed = text.trimStart()
  return MAGNITUDE.find((item) => trimmed.startsWith(item.word))
}

/** 取数字后紧跟的单位词。 */
function unitAt(text: string): string | null {
  const trimmed = text.trimStart()
  const hit = UNIT_HINTS.find((hint) => trimmed.startsWith(hint))
  return hit ?? null
}

/**
 * 抽数字。
 *
 * @param text - 待抽文本
 * @param options - keepNoise 保留噪音；limit 上限
 * @returns 抽到的数字列表
 * @throws {CalcError} text 为空 → missing_params
 */
export function extractNumbers(
  text: string,
  options: { keepNoise?: boolean; limit?: number } = {},
): ExtractedNumber[] {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new CalcError(
      'missing_params',
      'extract_numbers 需要 text（要抽数字的正文）',
      '把 PDF 解析出的正文贴进来即可。PDF 本身先用宿主工具取成文本，本操作负责「文本 → 台账」。',
    )
  }
  const limit = options.limit !== undefined && options.limit > 0 ? Math.floor(options.limit) : 2000
  const lines = text.split(/\r?\n/)
  const out: ExtractedNumber[] = []

  for (let i = 0; i < lines.length && out.length < limit; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue

    let lineNoise: string | undefined
    for (const rule of NOISE_PATTERNS) {
      if (rule.pattern.test(line.trim())) {
        lineNoise = rule.reason
        break
      }
    }

    const used = new Set<number>()
    const intervalRanges: Array<[number, number]> = []

    const pushOne = (raw: string, value: number, high: number, at: number): void => {
      if (out.length >= limit) return
      if (used.has(at)) return
      used.add(at)

      /** 单位 = 量级词 + 单位词（量级也要进单位，否则读者看不出这是 1.49 亿）。 */
      const tail = line.slice(at + raw.length, at + raw.length + 14)
      const mag = magnitudeAt(tail)
      const afterMag = mag ? tail.trimStart().slice(mag.word.length) : tail
      const baseUnit = unitAt(afterMag)
      const unitText = (mag ? mag.word : '') + (baseUnit ?? '')
      const unit = unitText === '' ? null : unitText

      /** 上下文：该数字所在那半句（到最近标点为止）。 */
      const marks = ['，', '。', '；', '、']
      let segStart = 0
      for (const mark of marks) segStart = Math.max(segStart, line.lastIndexOf(mark, at))
      const ends = marks.map((mark) => line.indexOf(mark, at + raw.length)).filter((pos) => pos >= 0)
      const segEnd = ends.length > 0 ? Math.min(...ends) : line.length
      const context = line.slice(segStart === 0 ? 0 : segStart + 1, segEnd).trim().slice(0, 120)

      out.push({
        raw: raw.trim(),
        value,
        high,
        unit,
        context,
        line: i + 1,
        noise: lineNoise !== undefined,
        ...(lineNoise === undefined ? {} : { noiseReason: lineNoise }),
      })
    }

    /** ① 区间优先。 */
    for (const match of line.matchAll(INTERVAL_RE)) {
      const low = Number(match[1].replace(/,/g, ''))
      const high = Number(match[2].replace(/,/g, ''))
      if (!Number.isFinite(low) || !Number.isFinite(high)) continue
      const at = match.index ?? 0
      const tail = line.slice(at + match[0].length, at + match[0].length + 3)
      const mag = magnitudeAt(tail)
      const factor = mag ? 10 ** mag.power : 1
      pushOne(match[0], low * factor, high * factor, at)
      intervalRanges.push([at, at + match[0].length])
    }

    /** ② 单值（跳过区间已占用的字符范围，否则 20-50 会被拆出 -50）。 */
    for (const match of line.matchAll(SINGLE_RE)) {
      const at = match.index ?? 0
      if (intervalRanges.some(([start, end]) => at >= start && at < end)) continue
      const base = Number(match[1].replace(/,/g, ''))
      if (!Number.isFinite(base)) continue
      const expFactor = match[2] !== undefined ? 10 ** Number(match[2]) : 1
      const tail = line.slice(at + match[0].length, at + match[0].length + 4)
      const mag = magnitudeAt(tail)
      const value = base * expFactor * (mag ? 10 ** mag.power : 1)
      pushOne(match[0], value, value, at)
    }
  }

  return options.keepNoise === true ? out : out.filter((item) => !item.noise)
}

/** 台账汇总。 */
export interface ExtractOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 抽数字并渲染台账。
 *
 * @param text - 正文
 * @param options - keepNoise / limit
 * @returns 台账结果
 */
export function runExtractNumbers(
  text: string,
  options: { keepNoise?: boolean; limit?: number } = {},
): ExtractOutcome {
  const items = extractNumbers(text, options)
  const byUnit = new Map<string, number>()
  for (const item of items) {
    const key = item.unit ?? '（无单位）'
    byUnit.set(key, (byUnit.get(key) ?? 0) + 1)
  }
  const topUnits = [...byUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const noiseCount = items.filter((item) => item.noise).length

  const lines: string[] = ['═══ 数字台账 ═══', '']
  lines.push('  抽出 ' + items.length + ' 个数字' + (options.keepNoise === true ? '（含噪音 ' + noiseCount + ' 个）' : '（已滤掉噪音）'))
  if (topUnits.length > 0) lines.push('  主要单位：' + topUnits.map(([unit, count]) => unit + '×' + count).join('　'))
  lines.push('')

  const shown = items.slice(0, 60)
  for (const item of shown) {
    const valueText =
      item.high !== item.value
        ? Number(item.value.toPrecision(8)) + '–' + Number(item.high.toPrecision(8))
        : item.value >= 1e6 || item.value < 1e-3
          ? item.value.toExponential(3)
          : String(Number(item.value.toPrecision(8)))
    lines.push(
      '  L' + String(item.line).padEnd(5, ' ') +
        (item.raw + '　').padEnd(14, ' ') +
        '= ' + valueText.padEnd(18, ' ') +
        (item.unit ? '[' + item.unit + '] ' : '') +
        (item.noise ? '（噪音：' + item.noiseReason + '）' : item.context.slice(0, 46)),
    )
  }
  if (items.length > shown.length) lines.push('  …还有 ' + (items.length - shown.length) + ' 条，见 value.items')
  lines.push('')
  lines.push('  ★ 这只是台账，不是验算。要对账请把成组的数送进 ledger / evaluate。')
  lines.push('  ★ 中文量级已折算（亿=1e8、万=1e4）；区间给上下界。')

  return {
    result: lines.join('\n'),
    value: { items, count: items.length, noiseCount, units: topUnits.map(([unit, count]) => ({ unit, count })) },
    ...(items.length >= 60 ? { notice: '只渲染前 60 条，完整列表在 value.items' } : {}),
  }
}
