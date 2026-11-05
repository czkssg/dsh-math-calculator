/**
 * 防呆层：在数字旁边多放一句「这个数看起来不对劲」。
 *
 * ## 为什么需要这一层
 *
 * 一份实测复盘文档记录了 200 余条表达式的使用，其中**真正算错的只有单位口径类**，
 * 但代价最贵的不是算错，而是**算对了却没人觉得不对**：
 *
 * ```
 *   2645.6*28*3600*8000/1e9  →  2133.41184
 *   调用者贴上「万吨」的标签 → 以此为据指控原文「错了 10 倍」
 *   真相：2133 是「千吨」，万吨应为 /1e10 → 213.34
 * ```
 *
 * 返回体当时只有一行裸数字，**既不说量级、也不说 label 与结果是否对得上**。
 *
 * ## 这一层做什么、不做什么
 *
 * **做**：数量级标注、label 与结果的量级比对、同批次一致性比对。
 * **不做**：替调用者判断结论对错 —— 那需要动机与上下文，工具拿不到。
 *
 * 判据必须**保守**：只在「label 明确声称了一个量级词」且「结果差得离谱」时提示。
 * 宁可漏报，不可误报 —— 误报会让整条通道被关掉，比漏报更糟。
 *
 * @module dsh-math-calculator/guards
 */

/**
 * 「量级词 → 该词代表的 10 的幂」映射。
 *
 * ## 收录范围刻意小
 *
 * 只收**量级词**（万、亿、千…），不收具体单位（吨、度、W）——
 * 因为「1 万」代表 10⁴，而「1 吨」代表什么取决于量纲，工具不知道量纲。
 *
 * 量级词是纯数量级的，与量纲无关，所以能安全比对。
 */
const MAGNITUDE_WORDS: Array<{ word: string; power: number }> = [
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
  { word: '十', power: 1 },
]

/**
 * 从 label 里认出量级词。
 *
 * @param label - 条目的 label（如「年耗N2万吨」「年发电量亿度」）
 * @returns 命中的量级词与幂次；没命中返回 null
 */
export function magnitudeOfLabel(label: string): { word: string; power: number } | null {
  if (typeof label !== 'string' || label.trim() === '') return null
  const text = label.trim()

  /**
   * ## 只在 label **就是**一个量级表述时才检查
   *
   * 踩过的坑（实测反馈 2026-11-06）：原来用 `label.includes(词)`，
   * 于是 `"1亿棵树日产台"` 命中「亿」，工具按「结果单位是亿」去解释，
   * 得出「若按字面读成亿则为 2.50e20」这种**从来没有人会这么读**的警告。
   *
   * 原话：「我写 label 为『1亿棵树日产台』的意思是**以 1 亿棵树为输入条件**
   *   算出的日产台数，不是『结果单位是亿』。工具却按后者解释，
   *   于是**每一个含量级词的 label 都会触发一条无意义警告**。」
   *
   * 判据改为：量级词必须出现在**结尾**，且它前面那段只能是
   *   · 空（label 就是「亿」）
   *   · 纯数字 / 小数（「2.5亿」「300万」）
   *   · 数字 + 分隔（「2.5 亿」「日产 3 亿」这类仍不认——宁可漏报）
   *
   * 也就是说，只有「数值 + 量级」这种**像单位一样**的写法才被当成量级表达式。
   * `"1亿棵树日产台"` 的量级词后面还有「棵树日产台」，说明它是**条件描述**而非单位，放过。
   */
  /**
   * 先把结尾的成对括号剥掉：`年发电量（亿）`、`产量(万件)` 都是常见写法。
   * 括号里的内容是「量级 + 单位」时整体当单位看待。
   */
  let body = text
  const bracketPair = body.match(/[（(\[【]\s*(.+?)\s*[）)\]】]$/)
  if (bracketPair) body = bracketPair[1].trim()

  /**
   * ## 判据：量级词必须处在「单位位置」
   *
   * 三种形态算单位位置，其余一律当描述放过：
   *
   *   ① 结尾：`年发电量亿`、`2.5亿`、`亿`
   *   ② 量级词 + 单位词收尾：`产量万件`、`金额万元`、`里程万公里`
   *   ③ 量级词 + 数量名词收尾：`树木万棵`、`人口亿人`
   *
   * 反例（不放行）：`1亿棵树日产台` —— 量级词后面还跟着一长串描述，
   * 它是**条件**（以 1 亿棵树为输入），不是单位。
   * 实测原话：「我写 label 为『1亿棵树日产台』的意思是
   *   以 1 亿棵树为输入条件算出的日产台数，不是『结果单位是亿』。」
   *
   * 所以 ② ③ 都要求「量级词之后**只剩很短的一段**」（≤ 4 个汉字），
   * 那段是单位或数量名词；超过就是句子，放过。
   */
  for (const entry of MAGNITUDE_WORDS) {
    const at = body.indexOf(entry.word)
    if (at < 0) continue
    const prefix = body.slice(0, at).trim()
    const after = body.slice(at + entry.word.length).trim()

    /** 前缀是纯数字（`2.5亿`）或空（`亿`）→ 明确是量级表达式。 */
    if (prefix === '' || /^[0-9][0-9,.]*$/.test(prefix)) {
      /** 后面还有一长串 → 这是句子，放过。 */
      if (after.length > 4) continue
      return entry
    }
    /**
     * ## 前缀里的数字不能一律当「条件」
     *
     * 踩过：`年耗H2O万吨`、`年耗N2万吨` 这类 label 里的数字是**化学式下标**
     * （H2O 的 2、N2 的 2），不是「一天产出 2 亿」那种数量条件。
     * 旧判据一见到前缀里有数字就放过，导致四条年度物料全都不检查 ——
     * 而那恰恰是报告里「同一个错犯了四次」的原始案例。
     *
     * 现在的区分：数字只作为**独立数量出现**时才算条件；
     * 紧贴在字母/汉字后（`H2O`、`N2`、`CO2`）算单词的一部分。
     *
     *   `一天产出1亿`   → 1 前面是中文「出」、后面是「亿」→ 独立数量，放过
     *   `年耗H2O万吨`   → 2 夹在 H 与 O 之间 → 单词内部，不是条件
     */
    const digitIsStandalone = /(^|[^A-Za-z])[0-9]/.test(prefix) && !/[A-Za-z][0-9][A-Za-z]/.test(prefix)
    /**
     * 纯中文前缀（`年发电量亿`）→ 只在量级词处于结尾或**紧接一个短单位**时认。
     *
     * `after` 允许两种形态：
     *   · 空或很短（≤4 字）：`年发电量亿`、`产量万件`
     *   · 「单位 + 说明」：`年发电量亿度_按8000h` —— 单位是「度」，
     *     后面的 `_按8000h` 是**注释**，不该让整条失效。
     *
     * 判据：`after` 的第一个分隔符（_ / ( / 空格）之前那段要很短。
     */
    const unitPart = after.split(/[_（(\s]/)[0]
    if (unitPart.length <= 4) {
      if (prefix !== '' && digitIsStandalone) return null
      return entry
    }
  }
  return null
}

/**
 * 给数值加一个量级标注，如 `2.13e5 (~10⁵)`。
 *
 * ## 为什么不直接格式化成分数/万/亿
 *
 * 因为工具不知道量纲，也就不知道该用「万吨」还是「万度」还是「万焦」。
 * 只给**纯数量级**（10 的幂），调用方自己配上单位 —— 这不容易出错。
 *
 * @param value - 已格式化的结果文本（如「2133.41184」）
 * @returns 带量级标注的文本；值不是有限数或量级为 1 时原样返回
 */
export function annotateMagnitude(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return value
  const magnitude = Math.floor(Math.log10(Math.abs(numeric)))
  /** 10⁰~10³ 这个区间是日常数字，标了反而吵。 */
  if (magnitude < 1) return value
  const superscript = superscriptOf(magnitude)
  return value + ' (~10' + superscript + ')'
}

/** 把指数转成上标（用 ASCII 兜底，避免字体缺字）。 */
function superscriptOf(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(n).split('').map(function (ch) { return map[ch] ?? ch }).join('')
}

/**
 * 检查 label 声称的量级与结果是否对得上。
 *
 * ## 判据要松
 *
 * 「万吨」标 213.34 —— 213 是**吨**为单位时的数值，而 label 说的是「万吨」，
 * 也就是 213 万吨 = 2.13×10⁶ 吨。这种「label 带量级词但数值本身没到量级」
 * 恰恰**不是**错误：数值 213 + 单位「万吨」= 213 万吨，是正常的。
 *
 * 所以判据不能是「结果是否达到 10⁴」，而是：
 *
 * · 若把结果**按裸数字直接读成该量级**（213 × 10⁴ = 2.13e6），
 *   与「结果本身就是最终量」的读法相比差很多 —— 这时才提示可能混了换算。
 *
 * 实际上更有价值的是**同批一致性**：一批里所有「年耗（万吨）」条目
 * 都落在同一量级、却与另一批同义条目的量级差 10 倍 —— 见 `findBatchAnomalies`。
 *
 * 因此这里只做一件事：**提示 label 里含量级词，提醒调用方核对换算**。
 * 不做数值比对（容易误报）。
 *
 * @param label - 条目 label
 * @param result - 结果文本
 * @returns 提示文本；无需提示时返回空串
 */
export function checkLabelMagnitude(label: string, result: string): string {
  const hit = magnitudeOfLabel(label)
  if (!hit) return ''
  const numeric = Number(result)
  if (!Number.isFinite(numeric)) return ''
  /**
   * 结果已经是科学计数法（很大或很小）时，说明调用方给的表达式
   * 本来就跨了量级，这时 label 里的量级词很可能是**整条链的最终单位**，
   * 而不是需要再乘一次的因子 —— 不提示。
   */
  if (/e[+-]/i.test(result)) return ''
  const magnitude = Math.floor(Math.log10(Math.abs(numeric)))
  /**
   * 结果量级 ≥ label 量级时，说明数值本身就跨了那个量级
   * （例：label「亿」，结果 2.88e8）—— 这才是可疑的：2.88e8 亿 = 2.88e16。
   */
  if (magnitude >= hit.power) {
    const asLiteral = numeric * Math.pow(10, hit.power)
    return '⚠ label 含「' + hit.word + '」，而结果 ' + result +
      ' 本身已达 10' + superscriptOf(magnitude) +
      ' 量级；若按字面读成「' + hit.word + '」则为 ' + asLiteral.toExponential(2).replace(/e\+/, 'e') + '，请核对换算。'
  }
  return ''
}

/**
 * 一条待检查的批量结果。
 */
export interface BatchEntryForGuard {
  /** 条目 label（可能为空）。 */
  label?: string
  /** 结果文本（失败条目不要传）。 */
  result: string
}

/**
 * 同批次量级一致性比对。
 *
 * ## 这是文档里最想要的一条
 *
 * 真实案例：四条「年耗/年产（万吨）」全部用了 `/1e9` 而不是 `/1e10`，
 * 全部偏大 10 倍，全部报「成功」。
 *
 * 单条看不出问题（2133 看起来就是个正常数），但**四条一起就该看出来** ——
 * 它们全落在同一量级，而那个量级与该组共同声称的单位不匹配。
 *
 * ## 判据
 *
 * 1. 按 label 里的量级词分组（同组意味着同一个数量级口径）
 * 2. 组内 ≥2 条，且量级**一致**（说明是同一个系统性偏差）
 * 3. 该量级 ≥ label 声称的量级（说明裸数字本身就跨了那个量级 → 可疑）
 *
 * 三条都满足才提示。这样误报率极低。
 *
 * @param entries - 本次批量里成功的条目
 * @returns 提示文本；无需提示时返回空串
 */
export function findBatchAnomalies(entries: BatchEntryForGuard[]): string {
  const groups = new Map<string, { word: string; power: number; items: Array<{ label: string; value: number; magnitude: number }> }>()

  for (const entry of entries) {
    if (!entry.label) continue
    const hit = magnitudeOfLabel(entry.label)
    if (!hit) continue
    const numeric = Number(entry.result)
    if (!Number.isFinite(numeric) || numeric === 0) continue
    /** 已经是科学计数法的不纳入 —— 调用方显然知道自己在跨量级。 */
    if (/e[+-]/i.test(entry.result)) continue
    const magnitude = Math.floor(Math.log10(Math.abs(numeric)))
    if (!groups.has(hit.word)) groups.set(hit.word, { word: hit.word, power: hit.power, items: [] })
    groups.get(hit.word)!.items.push({ label: entry.label, value: numeric, magnitude })
  }

  const problems: string[] = []
  for (const group of groups.values()) {
    if (group.items.length < 2) continue
    /**
     * 组内量级是否一致（同一个系统性偏差的特征）。
     *
     * ⚠️ 判据修正过一次：最初写「量级必须 ≥ label 声称的量级」，
     * 于是 10³ < 10⁴（万吨）的情况被放过 —— 而那恰恰就是要抓的：
     * 用 /1e9 得到「千吨」，却贴上「万吨」标签，差**恰好一个**量级。
     *
     * 真正的判据是：组内量级一致，**且与 label 声称的量级不一致**。
     * 完全相等时说明调用方口径已经对齐（数值就是该量级下的数），不必提示。
     */
    const magnitudes = group.items.map(function (i) { return i.magnitude })
    const allSameMagnitude = magnitudes.every(function (m) { return m === magnitudes[0] })
    if (!allSameMagnitude) continue
    /**
     * 组量级与 label 量级的差。
     * 差 0：口径已对齐（213 万吨 就是 213，正常）→ 不提示
     * 差 ±1：最可疑 —— 「千吨」被当成「万吨」正是这一类
     * 差更大：量级完全不同，也可能是正常的大数/小数，不强行提示
     */
    const gap = magnitudes[0] - group.power
    if (gap !== 1 && gap !== -1) continue
    const values = group.items.map(function (i) { return i.label + ' = ' + i.value }).join('\n   ')
    problems.push(
      '⚠ 本批有 ' + group.items.length + ' 条 label 含「' + group.word + '」（=10' +
      superscriptOf(group.power) + '），但结果全部落在 10' + superscriptOf(magnitudes[0]) +
      ' 量级：\n   ' + values +
      '\n   量级与 label 声称的差 ' + Math.abs(gap) + ' 个数量级 —— ' +
      '若数值本来该是「' + group.word + '」为单位，除数可能少除了一个 10' +
      '（例如该用 /1e' + (group.power + 6) + ' 却用了 /1e' + (group.power + 5) + '）。' +
      '\n   或反过来：若数值已是对的量级，label 里的「' + group.word + '」是多余的。',
    )
  }
  return problems.join('\n')
}
