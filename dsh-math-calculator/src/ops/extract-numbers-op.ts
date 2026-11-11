/**
 * operation="extract_numbers" 的实现：从文本抽数字，形成结构化台账。
 *
 * ## 为什么需要它
 *
 * 反馈包 `11` 号的实测：整理 23 份 PDF 时，**22,115 行台账是用 Python 脚本抽的**。
 * 工具在「对账入口第一件事」上是**零支撑** —— 而这是全部工作中耗时最多的一环。
 *
 * ## 用户已确认：允许读 PDF
 *
 * 反馈包 `06` 号曾把「读 PDF」列为「插件做不到的 6 项」之一。**那是误判**：
 * `dsh-pdf-mineru` 证明 PDF 解析在 DSH 里完全可行。
 *
 * 但本插件不重复造解析器 —— 正确做法是分层：
 *
 * ```
 *   PDF → 文本     由 read_pdf / async_parse_pdf（宿主已有）负责
 *   文本 → 台账    由本 operation 负责   ← 这一层才是这里该做的
 * ```
 *
 * 所以本操作接受 `text`（一段文本），将来也可接 `file`（交给宿主读）。
 *
 * ## 它比正则强在哪
 *
 * 三步，缺一步都不可用：
 *
 * ```
 *   ① 认出数字       含中文量级（亿/万/千）、区间（20-50）、约数（约一万吨）
 *   ② 判断单位       区分「元/吨/人/年」与「页码/时间戳/轮次」这类噪音
 *   ③ 给出上下文     每个数字带上它所在的那半句话，否则抽出来也不知道是什么
 * ```
 *
 * 反馈包原话：「台账里 60% 的行是噪音（『已思考（用时 7 秒）』也含数字）」
 * —— 所以第 ② 步是必需的，不是可选。
 *
 * @module dsh-math-calculator/ops/extract-numbers-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 抽到的一个数字。 */
interface ExtractedNumber {
  /** 原文片段（如 `2.66 亿吨`）。 */
  raw: string
  /** 数值（中文量级已折算）。 */
  value: number
  /** 若原文是区间，这里是上界；否则与 value 相同。 */
  high: number
  /** 单位（认不出时为 null）。 */
  unit: string | null
  /** 所在的那半句话（上下文，供人判断这是什么数）。 */
  context: string
  /** 行号（从 1 起）。 */
  line: number
  /** 是否被判定为噪音（页码/时间戳/轮次）。 */
  noise: boolean
  /** 判为噪音的原因。 */
  noiseReason?: string
}

/** 中文量级词 → 10 的幂。 */
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
 * 噪音判据：这些上下文说明数字是排版/流程产物，不是设定数据。
 *
 * ## 为什么必须有这一步
 *
 * 反馈包实测：22,115 行台账里**60% 是噪音**。
 * 不滤的话，抽出来的东西没法用 —— 使用者还得自己一条条挑。
 */
const NOISE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /已思考|思考中|用时\s*\d+\s*秒/, reason: 'AI 思考耗时标记' },
  { pattern: /^=+\s*PAGE\s*\d+|^\d+\s*\/\s*\d+\s*$/, reason: '页码' },
  { pattern: /^\d{4}\/\d{1,2}\/\d{1,2}|^\d{4}-\d{2}-\d{2}/, reason: '日期戳' },
  { pattern: /\d{1,2}:\d{2}(:\d{2})?/, reason: '时间戳' },
  { pattern: /本回答由\s*AI\s*生成|仅供参考/, reason: '免责声明' },
  { pattern: /^\s*第\s*\d+\s*轮|^R\d{1,3}\s|^\s*\d+[.、]\s*$/, reason: '轮次/序号' },
  { pattern: /deepseek\.com|https?:\/\//, reason: '页眉页脚链接' },
]

/**
 * 单位白名单片段（认单位用）。
 *
 * 只收**会出现在设定里**的单位。收太杂会把「7 秒」也当成数据。
 */
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

/**
 * 从文本里抽数字。
 *
 * @param text - 待抽文本
 * @param options - 选项（是否滤噪音、最大条数）
 * @returns 抽到的数字列表
 */
function extractAll(
  text: string,
  options: { keepNoise?: boolean; limit?: number },
): ExtractedNumber[] {
  const lines = text.split(/\r?\n/)
  const out: ExtractedNumber[] = []
  const limit = options.limit ?? 2000

  /**
   * 数字正则：
   * ```
   *   -?数字(可能带小数/千分位)(可选 e 指数)(可选 中文量级)(可选 区间上界)
   * ```
   * 区间单独处理（`20-50`、`20~50`、`20 到 50`）。
   */
  const intervalRe = /(-?\d[\d,]*(?:\.\d+)?)\s*(?:[-~至到])\s*(\d[\d,]*(?:\.\d+)?)/g
  const singleRe = /(-?\d[\d,]*(?:\.\d+)?)(?:\s*[eE]([+-]?\d+))?/g

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue

    /** 先判噪音：整行命中就不用细抽了。 */
    let lineNoise: string | undefined
    for (const rule of NOISE_PATTERNS) {
      if (rule.pattern.test(line.trim())) {
        lineNoise = rule.reason
        break
      }
    }

    const lineUsed = new Set<number>()
    /** 区间占用的字符范围（单值抽取要跳过，否则 `20-50` 会被拆出 `-50`）。 */
    const intervalRanges: Array<[number, number]> = []

    const pushOne = (raw: string, value: number, high: number, at: number): void => {
      if (out.length >= limit) return
      /** 同一个位置只抽一次（区间优先于单值）。 */
      if (lineUsed.has(at)) return
      lineUsed.add(at)

      /**
       * 单位：数字后面紧跟的那几个字。
       *
       * ★ 中文量级词（万/亿）要**并进单位**，而不是只留在 raw 里。
       * 第一版把它折算进数值却没进单位，于是 `1.49 亿` 显示成
       * `1.49` + 单位「（无）」—— 读者看不出这其实是 1.49 亿。
       */
      const after = line.slice(at + raw.length, at + raw.length + 14).trimStart()
      const magWord = MAGNITUDE.find((item) => after.startsWith(item.word))
      const afterMag = magWord ? after.slice(magWord.word.length) : after
      const baseUnit = UNIT_HINTS.find((hint) => afterMag.startsWith(hint)) ?? null
      const unitText = (magWord ? magWord.word : '') + (baseUnit ?? '')
      const unit = unitText === '' ? null : unitText

      /**
       * 上下文：取该数字所在那半句（到最近的标点为止）。
       * 没有上下文，抽出来的数字就没法判断是什么。
       */
      const segStart = Math.max(
        line.lastIndexOf('，', at),
        line.lastIndexOf('。', at),
        line.lastIndexOf('；', at),
        line.lastIndexOf('、', at),
        0,
      )
      const candidates = ['，', '。', '；', '、'].map((mark) => line.indexOf(mark, at + raw.length))
      const positives = candidates.filter((pos) => pos >= 0)
      const segEnd = positives.length > 0 ? Math.min(...positives) : line.length
      const context = line.slice(segStart === 0 ? 0 : segStart + 1, segEnd).trim().slice(0, 120)

      out.push({
        raw: raw.trim(),
        value,
        high,
        unit,
        context,
        line: i + 1,
        noise: lineNoise !== undefined,
        noiseReason: lineNoise,
      })
    }

    /** ① 区间优先。 */
    for (const match of line.matchAll(intervalRe)) {
      const low = Number(match[1].replace(/,/g, ''))
      const high = Number(match[2].replace(/,/g, ''))
      if (!Number.isFinite(low) || !Number.isFinite(high)) continue
      const at = match.index ?? 0
      /** 中文量级后缀（`20-50 万`）。 */
      const tail = line.slice(at + match[0].length, at + match[0].length + 3).trimStart()
      const mag = MAGNITUDE.find((item) => tail.startsWith(item.word))
      const factor = mag ? Math.pow(10, mag.power) : 1
      pushOne(match[0], low * factor, high * factor, at)
      intervalRanges.push([at, at + match[0].length])
    }

    /** ② 单值（跳过区间已占用的字符范围）。 */
    for (const match of line.matchAll(singleRe)) {
      const at = match.index ?? 0
      /**
       * ★ 跳过落在区间内部的数字。
       *
       * 第一版没跳，于是 `20-50 天` 抽出了三个数：`20`、`-50`、`50`。
       * 其中 `-50` 尤其糟 —— 它把一个正数区间变成了负数。
       */
      if (intervalRanges.some(([start, end]) => at >= start && at < end)) continue
      const base = Number(match[1].replace(/,/g, ''))
      if (!Number.isFinite(base)) continue
      const expFactor = match[2] !== undefined ? Math.pow(10, Number(match[2])) : 1
      /**
       * 中文量级后缀。
       *
       * ★ 必须先 `trimStart` 再比 —— 原文是「1.49 亿」，
       * 数字与量级词之间有空格，`startsWith('亿')` 直接比会全程不命中。
       * 这个遗漏让所有中文量级都没折算，而单位却显示成了「亿」。
       */
      const after = line.slice(at + match[0].length, at + match[0].length + 4).trimStart()
      const mag = MAGNITUDE.find((item) => after.startsWith(item.word))
      const factor = expFactor * (mag ? Math.pow(10, mag.power) : 1)
      const value = base * factor
      /**
       * ★ `raw` 只放**数字原文**，量级词交给 `unit`。
       *
       * 第一版把量级词拼进 raw（`match[0] + mag.word`），于是
       * `pushOne` 用 `raw.length` 去定位单位时偏移了 1 个字，
       * 把「亿」当成了单位开头 → 数值没折算、单位还只有「亿」。
       *
       * 现在 raw 保持 `1.49`，单位是 `亿`，数值是 149000000。
       */
      pushOne(match[0], value, value, at)
    }
  }

  return options.keepNoise === true ? out : out.filter((item) => !item.noise)
}

/**
 * `extract_numbers`：从文本抽数字台账。
 *
 * @param args - 工具参数（`text` 必填）
 * @returns 结果文本与结构化值
 */
export function opExtractNumbers(args: MathArgs): Outcome {
  const raw = args as unknown as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text : ''
  if (text.trim() === '') {
    throw new CalcError(
      'invalid_argument',
      'extract_numbers 需要 text（要抽数字的正文）',
      '把 PDF 解析出的正文贴进来即可：' +
        '{operation:"extract_numbers", text:"…正文…"}。' +
        'PDF 本身请先用宿主工具（read_pdf / async_parse_pdf）取成文本 —— ' +
        '本操作负责「文本 → 结构化台账」这一层。',
    )
  }

  const keepNoise = raw.keepNoise === true
  const limit = typeof raw.limit === 'number' && raw.limit > 0 ? Math.floor(raw.limit) : 2000
  const items = extractAll(text, { keepNoise, limit })

  /** 按量纲/单位分组统计，让人一眼看出这份文档主要在讲什么量。 */
  const byUnit = new Map<string, number>()
  for (const item of items) {
    const key = item.unit ?? '（无单位）'
    byUnit.set(key, (byUnit.get(key) ?? 0) + 1)
  }
  const topUnits = [...byUnit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  const noiseCount = items.filter((item) => item.noise).length
  const lines: string[] = []
  lines.push('═══ 数字台账 ═══')
  lines.push('')
  lines.push('  抽出 ' + items.length + ' 个数字' +
    (keepNoise ? '（含噪音 ' + noiseCount + ' 个）' : '（已滤掉噪音）'))
  if (topUnits.length > 0) {
    lines.push('  主要单位：' + topUnits.map(([unit, count]) => unit + '×' + count).join('　'))
  }
  lines.push('')

  /** 明细：每行「原文 = 数值 | 单位 | 上下文」。 */
  const shown = items.slice(0, 60)
  for (const item of shown) {
    const valueText =
      item.high !== item.value
        ? item.value + '–' + item.high
        : item.value >= 1e6 || item.value < 1e-3
          ? item.value.toExponential(3)
          : String(Number(item.value.toPrecision(8)))
    lines.push(
      '  L' + String(item.line).padEnd(5, ' ') +
      (item.raw + '　').padEnd(14, ' ') +
      '= ' + valueText.padEnd(14, ' ') +
      (item.unit ? '[' + item.unit + '] ' : '') +
      (item.noise ? '（噪音：' + item.noiseReason + '）' : item.context.slice(0, 46)),
    )
  }
  if (items.length > shown.length) {
    lines.push('  …还有 ' + (items.length - shown.length) + ' 条，见 value.items')
  }

  lines.push('')
  lines.push('  ★ 这只是台账，不是验算。要对账请把成组的数送进 ledger / evaluate。')
  lines.push('  ★ 中文量级已折算（亿=1e8、万=1e4）；区间给上下界。')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      items,
      count: items.length,
      noiseCount,
      units: topUnits.map(([unit, count]) => ({ unit, count })),
    }),
  }
}
