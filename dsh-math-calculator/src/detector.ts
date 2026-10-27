/**
 * 数学计算需求的实时检测。
 *
 * 需求：检测模型「思维中」是否出现大量数字或数学计算，若是则主动提醒它用插件。
 *
 * 实现依据（DSH 的 agent/pre-step 钩子）：
 *   `agent/pre-step` 是 waterfall 钩子，能在**模型发起请求前**介入，
 *   并可以通过 `{ kind: 'enter', messages }` 替换进入该步的消息。
 *   这让我们能在检测到计算需求时，往对话里插入一条提醒消息。
 *
 * 检测策略（避免误报是核心）：
 *   1. 统计用户消息里的**数字密度**（数字 token 数 / 总 token 数）
 *   2. 找**数学运算模式**（四则运算式、方程、求导、积分、单位换算…）
 *   3. 找**数学意图词**（计算、求解、推导、多少、比值…）
 *   4. 三者的加权分数超过阈值才提醒
 *
 * 为什么不能只看数字密度：
 *   「第 3 章 2024 年 15 岁」这类文本数字很多但不是计算需求。
 *   所以要结合运算符与意图词。
 *
 * 防打扰设计：
 *   - 每个会话只提醒有限次数（默认最多 3 次）
 *   - 提醒后进入冷却期
 *   - 如果模型已经用过插件，就不再提醒
 *
 * @module dsh-math-calculator/detector
 */

/** 一次检测的结果。 */
export interface DetectionResult {
  /** 是否应该提醒。 */
  shouldPrompt: boolean
  /** 综合评分 0-1。 */
  score: number
  /** 命中的信号（用于日志与调试）。 */
  signals: string[]
  /** 提取到的候选表达式（供参考，不自动执行）。 */
  candidates: string[]
  /**
   * 分流档位：simple（不提醒）/ forced（必须用工具）/ fuzzy（按阈值）。
   *
   * 与 `score` 的区别：score 只回答「数学需求强不强」，
   * 而档位回答「该心算还是该用工具」——
   * `2+2` 得分很高但该心算，`20 个数字求和` 得分低但最该用工具。
   */
  demandClass?: DemandClass
}

/** 检测配置。 */
export interface DetectorConfig {
  /** 触发阈值 0-1，越高越不容易打扰。默认 0.45。 */
  threshold: number
  /** 数字密度下限（低于它直接跳过）。默认 0.04。 */
  minDigitDensity: number
  /** 单会话最多提醒次数。默认 3。 */
  maxPromptsPerSession: number
  /** 提醒后的冷却步数。默认 2。 */
  cooldownSteps: number
  /** 是否启用。默认 true。 */
  enabled: boolean
}

/** 默认配置。 */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  threshold: 0.45,
  minDigitDensity: 0.04,
  maxPromptsPerSession: 3,
  cooldownSteps: 2,
  enabled: true,
}

/** 会话级状态（按会话 id 隔离，避免跨会话串扰）。 */
interface SessionState {
  promptCount: number
  lastPromptStep: number
}

const sessionStates = new Map<string, SessionState>()

/** 取会话状态。 */
function stateFor(sessionKey: string): SessionState {
  let state = sessionStates.get(sessionKey)
  if (!state) {
    state = { promptCount: 0, lastPromptStep: -1000 }
    sessionStates.set(sessionKey, state)
  }
  return state
}

/** 重置某个会话的检测状态（测试或用户手动清除时用）。 */
export function resetDetectionState(sessionKey?: string): void {
  if (sessionKey === undefined) sessionStates.clear()
  else sessionStates.delete(sessionKey)
}

/** 数学意图关键词 —— 出现这些词说明用户想要计算。 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /计算|算一下|算出|算算|求值|求解|解方程|解出/, weight: 0.55, label: '计算意图' },
  { pattern: /推导|推算|推演|演算/, weight: 0.45, label: '推导意图' },
  { pattern: /求导|导数|微分|积分|原函数/, weight: 0.6, label: '微积分意图' },
  { pattern: /矩阵|行列式|特征值|特征向量|求逆/, weight: 0.6, label: '线性代数意图' },
  { pattern: /概率|期望|方差|标准差|分布|检验/, weight: 0.45, label: '统计意图' },
  { pattern: /多少|多大|多远|多重|几倍|占多少|比例|比值|增长率/, weight: 0.4, label: '数量询问' },
  { pattern: /方程|方程组|联立|未知数/, weight: 0.55, label: '方程意图' },
  { pattern: /单位换算|换算成|等于多少|转换为/, weight: 0.5, label: '换算意图' },
  { pattern: /公式|常数|物理量|量纲/, weight: 0.4, label: '物理公式意图' },
  { pattern: /逃逸速度|轨道周期|表面重力|宜居|潮汐|恒星|行星/, weight: 0.45, label: '天文推演意图' },
  { pattern: /气候|降雨|地形|海拔|雪线|昼夜|季节/, weight: 0.4, label: '地理推演意图' },
  // 势力收支类：对应 balance 这个 operation。
  // 「养得起吗」「够不够」是作者最常问的一类，此前完全没有词表覆盖。
  { pattern: /养得起|养得活|够不够|够吃|支撑得起|收支|缺口|军费|粮草|补给/, weight: 0.45, label: '收支盘点意图' },
  { pattern: /人口|兵员|常备军|财政|税|粮产|单产/, weight: 0.35, label: '势力规模意图' },
]

/** 数学运算模式 —— 直接就是可计算的表达式。 */
const EXPRESSION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // 完整的算式：数字 运算符 数字
  { pattern: /\d+(?:\.\d+)?\s*[+\-*/^×÷]\s*\d+(?:\.\d+)?/, weight: 0.65, label: '完整算式' },
  // 幂与根
  { pattern: /\d+\s*\^\s*\d+|\bsqrt\(|\b\d+\s*的\s*\d+\s*次方/, weight: 0.5, label: '幂运算' },
  // 方程形式
  { pattern: /[a-zA-Z]\s*[\^]?\d*\s*[+\-]?\s*\d*\s*=\s*[\d-]/, weight: 0.6, label: '方程' },
  // 函数调用
  { pattern: /\b(sin|cos|tan|log|ln|exp|abs)\s*\(/, weight: 0.55, label: '数学函数' },
  // 求和/积分符号
  { pattern: /∑|∫|∏|√|π/, weight: 0.5, label: '数学符号' },
  // 单位
  { pattern: /\d+(?:\.\d+)?\s*(km|kg|cm|mm|m\/s|km\/h|°C|°F|Pa|kW|MW|J|N|W|mol|L)\b/, weight: 0.4, label: '带单位数值' },
]

/** 看起来「不是计算」的模式 —— 用于降低误报。 */
const NEGATIVE_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // 纯日期/年份
  { pattern: /^\s*(19|20)\d{2}\s*年?/, weight: -0.25, label: '年份' },
  // 章节编号
  { pattern: /第\s*\d+\s*[章节条款]/, weight: -0.2, label: '章节编号' },
  // 版本号
  { pattern: /\bv?\d+\.\d+\.\d+\b/, weight: -0.3, label: '版本号' },
  // URL / 路径
  { pattern: /https?:\/\/|\/[\w-]+\/[\w-]+/, weight: -0.3, label: 'URL或路径' },
  // 纯列表编号。注意必须**排除小数**：`1.5倍` 里的 `1.` 不是列表编号，
  // 而 `^.` 只匹配行首、后面跟数字加点的形式容易误伤。改用「行首 + 数字 + 点/顿号 + 空格或中文」
  { pattern: /^\s*\d+[.、)]\s+[^\d.]/m, weight: -0.1, label: '列表编号' },
  // 明确说不算
  { pattern: /不用计算|不需要算|只是描述|只是设定/, weight: -0.5, label: '明确排除' },
]

/**
 * 中文数字识别 —— 盲测暴露的重大缺口。
 *
 * ## 为什么必须有
 *
 * 原实现只匹配阿拉伯数字（`\d+`），于是这些句子拿到了 **0 分**：
 *   「主角从**一百**米高的悬崖跳下，落地的速度会有多快」  → 0.00 ❌
 *   「如果一个地方比海平面高**四千**米，那里的水大概几度开」→ 0.00 ❌
 *   「**十万**个人每天要吃多少粮食」                    → 只有 0.4 ❌
 *
 * 而中文写作里「一百米」「三千年」「半倍」是**常态**，
 * 尤其小说设定文本。这个缺口让大量本该提醒的场景被静默漏掉。
 *
 * ## 识别策略
 *
 * 不做完整的中文数字解析（那需要分词，且容易误伤），只做**存在性检测**：
 *   · 中文数字字符：一二三四五六七八九十百千万亿两
 *   · 单字「倍」也算数量标记（「翻倍」「三倍」）
 *   · 但排除序数与语气用法（「第三纪」「第三次」「万一」「十分」）
 */
const CN_NUMERAL_PATTERN = /[一二三四五六七八九十百千万亿两]{1,6}|[半几][个十百千万]|倍/

/**
 * 中文数字的**误伤排除**。
 *
 * 三类要排除：
 *   · 语气/固定搭配：「万一」「十分」「一点儿」「一点点」
 *   · **序数**：「第三纪」「第 3 次」「第3章」—— 这些是编号不是数量
 *   · 量词虚用：「最后一点」「一丝」
 *
 * 序数是最容易漏的一类：编年史文本「第三纪 1240 年」里的「三」
 * 是纪元编号，不是可计算的量。实测它让编年史与章节描述误报。
 *
 * 注意序数有两种写法：中文「第三」与阿拉伯「第 3」，
 * 两者都要排除（后者由 `第\d+` 覆盖）。
 */
const CN_NUMERAL_FALSE_POSITIVES =
  /万一|千万别|十分|一点儿|两下|三番|四处|五花|乱七八糟|不三不四|三心二意|一干二净|最后一点|一点|一些|有点|几分|一丝|一缕|一整夜|第\s*[一二三四五六七八九十百千万\d]/

/**
 * 物理推演类词表 —— 本插件的核心价值场景。
 *
 * ## 为什么单独处理
 *
 * 随机测试（400 条样本）暴露了一个系统性漏报：物理推演类只提醒了 45%，
 * 而这类恰恰是「心算给数字、工具给带约束的数字」差别最大的场景。
 *
 * 漏报原因：`2.0倍重力下，花岗岩山能长多高` 这类句子
 * **没有「多少/多大」这类疑问词**，只靠数字密度拿到 0.26，低于阈值 0.45。
 *
 * 相反对照：`这颗星球的逃逸速度是多少` 有「多少」→ 0.85，能提醒。
 * 同样是核心场景，只因为句式不同就被漏掉 —— 这是纯运气。
 *
 * ## 处置：作为**强信号**
 *
 * 命中即视为「该用工具」，与数据信号同档（forced）。
 * 代价是这类问题每次都会提醒一次（约 131 token），
 * 比心算出错后返工便宜得多 —— 实测漏报的折算成本是提醒的 10 倍。
 */
const PHYSICS_PATTERN =
  /重力|逃逸速度|轨道|宜居带|潮汐锁定|恒星|行星|气压|大气压|海拔|密度|温度|气温|沸点|冰点|硬度|强度|山高|体型|寿命|光度|辐照|昼夜|季节|自转|轴倾角|磁场|潮汐|潮水|月相|风速|降雨|降水|蒸散|盐度|洋流|生态|重力场|辐射|大气层|公转/

/**
 * 工程/军事/生活类词表 —— 第三轮盲测暴露的缺口。
 *
 * ## 缺口表现
 *
 * 作者常问的是「这东西要造多厚」「能射多远」「要走多久」，
 * 这些句子一个物理术语都不含，所以全部拿到 0 分：
 *   「要塞的城墙得修**多厚**才挡得住投石机」    → 0.00 ❌
 *   「这把弓拉满能射穿**多远**的皮甲」          → 0.40 ❌
 *   「船在无风带要靠桨划**多久**才能出界」      → 0.00 ❌
 *
 * 但这些都是**真需要算**的（材料强度、弹道能量、划桨功率与阻力），
 * 而且心算必错 —— 正是工具该介入的场合。
 *
 * ## 为什么不与 PHYSICS_PATTERN 合并
 *
 * 分开是为了**分级**：物理/天文类是这个插件的核心（常配 world 推演），
 * 工程类更像普通工程计算。合并会让分档失去意义。
 *
 * 但两类都算「该用工具」，所以下面判定时并集处理。
 */
const ENGINEERING_PATTERN =
  /城墙|要塞|堡垒|投石机|弓箭|射程|弓|弩|皮甲|护甲|刀剑|枪械|火药|推力|功率|马力|航速|划桨|桨|帆|桅|船|船速|载重|吃水|骆驼|驮|耕|收成|围城|粮道|补给线|兵员|军费|行军|攻城|防守|工事|桥|堤|坝|渠|塔|井|窑|炉|风箱|水车|磨/

/**
 * 数据/汇总类信号 —— **强**信号，出现就该走插件。
 *
 * 为什么单独列一类：这类需求的特点是「数字多、要精确、人工算会错」，
 * 而原来的意图词表里**完全没有它们**，导致实测漏判：
 *   「把这20个数字求和」     → 0.30（不提醒）❌
 *   「这份CSV里所有销售额加起来」→ 0.00（不提醒）❌
 *
 * 这两个恰恰是最该用工具的场合：20 个数求和，AI 心算出错的概率不低，
 * 而且错了没人能发现。
 */
const DATA_SIGNAL_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  /**
   * 求和类。注意「合计」有名词/动词两用：
   *   「把这几项合计」= 求和（要算）
   *   「他合计了一下，决定明天再来」= 盘算（不算）
   * 前者通常跟「把/这几项/数据/总额」，后者常跟「了一下/了一下子」。
   */
  { pattern: /求和|总和|加总|累加|汇总|(把.{0,10})合计|合计.{0,6}(多少|总额|金额)/, weight: 0.6, label: '求和汇总' },
  /**
   * 统计量。「平均」也有修辞用法：
   *   「平均每个县三万人」= 统计（要算）
   *   「平均每个人都说这想法疯狂」= 修辞（不算）
   * 判据：后面跟数量或「是/为」，而不是跟「人/都/说」这类主语。
   */
  { pattern: /均值|中位数|众数|方差|标准差|平均数?[是为约]|平均数?[^,。]{0,8}\d|平均.{0,4}(多少|几)/, weight: 0.55, label: '统计量' },
  { pattern: /表格|表单|CSV|csv|附件|文件里|这份数据|这批数据/, weight: 0.55, label: '结构化数据' },
  { pattern: /精确|核对|校验|验证一下|准确计算/, weight: 0.5, label: '要求精确' },
  { pattern: /批量|逐条|每一[条行个]|全部算|都算一遍/, weight: 0.5, label: '批量计算' },
  { pattern: /分组|分类汇总|按.{1,6}统计/, weight: 0.5, label: '分组统计' },
  { pattern: /复利|利息|月供|还款|摊销|日期差|相差多少天|本利|年息|利率|本金|年化/, weight: 0.5, label: '金融/日期计算' },
  { pattern: /多步|先.{1,10}再.{1,10}然后|链式|逐级换算/, weight: 0.45, label: '多步依赖' },
]

/**
 * 「简单到可以心算」的判据 —— 用于**不提醒**，不是禁止。
 *
 * 文档建议「简单算式让 AI 心算」。采纳其判据思路，但有一个重要差异：
 *
 *   这里判定为 simple 只表示**不主动提醒**，不禁止调用工具。
 *
 * 为什么不做成禁止：心算给的是数字，工具给的是**带约束的数字**。
 * 实测过：`1.5 倍重力下花岗岩山能长多高`——
 *   心算「大概 3000 米」看着合理，但没有任何约束校验；
 *   工具给 3262 米，并提示「已接近花岗岩极限，再高会塌」。
 * 差别不在精度，在于是否知道「这个数意味着什么」。
 *
 * 判据（全部满足才算简单）：
 *   · 长度短（< 50 字符）
 *   · 数字个数 ≤ 3
 *   · 只有四则运算与括号
 *   · 没有任何数据/汇总类信号
 *   · 没有物理推演意图（那些一律不算简单）
 */
function isSimpleArithmetic(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  if (compact.length > 50) return false

  /**
   * 中文运算符归一化。
   *
   * 盲测发现「128除4是多少」被判成 fuzzy —— 因为它不含四则运算符符号，
   * 而中文里「加上」「减去」「乘以」「除以」都是标准说法。
   * 先归一化成符号，后续判断就统一了。
   *
   * ⚠️ 注意：注释里不要写「星号紧跟斜杠」的字面形式 ——
   * 那会被当成块注释的结束符，导致后面整段代码解析失败。
   * （本项目踩过这个坑：写运算符说明时把注释提前闭合了。）
   */
  const normalized = text
    .replace(/加上|加/g, '+')
    .replace(/减去|减/g, '-')
    .replace(/乘以|乘/g, '*')
    .replace(/除以|除/g, '/')

  // 数字个数。放宽到 5：`(3+4)*5/2` 这类纯算术有 4 个数字，
  // 仍然一望可算，不该因为多一个数就被当成复杂需求。
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? []
  if (numbers.length > 5) return false

  // 必须含运算符（纯数字不是计算需求）
  if (!/[+\-*/^%×÷]/.test(normalized)) return false

  // 只允许数字、运算符、括号、小数点和空白，以及中文疑问尾缀（是多少/等于几）
  const stripped = normalized
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[+\-*/^%×÷()（）\s=？?。，,]/g, '')
    .replace(/是多少|等于多少|等于几|是几|多少|几/g, '')
  if (stripped.length > 0) return false

  // 有任何数据/汇总信号就不是简单算术
  for (const signal of DATA_SIGNAL_PATTERNS) {
    if (signal.pattern.test(text)) return false
  }

  // 物理推演类一律不算简单（这类是工具的核心价值，即便形式像算术）
  if (PHYSICS_PATTERN.test(text)) {
    return false
  }

  return true
}

/**
 * 分流结论。
 *
 * | 档位 | 含义 | 处置 |
 * |---|---|---|
 * | `simple` | 短、少数字、纯四则、无数据信号 | **不提醒**（AI 自己算即可，想用工具仍可用） |
 * | `forced` | 有数据/汇总/多步信号 | **强提醒**：这类务必用工具 |
 * | `fuzzy` | 其它数学需求 | 一般提醒 |
 */
export type DemandClass = 'simple' | 'forced' | 'fuzzy'

/**
 * 计算数字密度。
 * 用「数字字符数 / 非空白字符数」作为近似。
 */
function digitDensity(text: string): number {
  const compact = text.replace(/\s+/g, '')
  if (compact.length === 0) return 0
  const digits = (compact.match(/[0-9]/g) ?? []).length
  return digits / compact.length
}

/**
 * 检测文本里的计算需求。
 *
 * @param text - 待检测的文本（通常是用户消息）
 * @returns 检测结果
 */
export function detectMathNeed(text: string): DetectionResult {
  const signals: string[] = []
  const candidates: string[] = []

  if (typeof text !== 'string' || text.trim() === '') {
    return { shouldPrompt: false, score: 0, signals: [], candidates: [] }
  }

  let score = 0

  // ── 1. 数字密度 ──
  const density = digitDensity(text)
  if (density >= 0.04) {
    const contribution = Math.min(0.3, (density - 0.04) * 3)
    score += contribution
    signals.push(`数字密度 ${(density * 100).toFixed(1)}%`)
  }

  /**
   * ── 1b. 中文数字 ──
   *
   * 盲测发现的最大缺口：原实现只认阿拉伯数字，
   * 「一百米」「四千米」「十万个」「翻倍」全部拿到 0 分。
   * 而中文写作（尤其小说设定）里这些是常态。
   *
   * 检出就加分，但不叠加 —— 一句里有几个中文数字都只加一次，
   * 避免长句因为「数字多」被推到很高分。
   */
  if (CN_NUMERAL_PATTERN.test(text) && !CN_NUMERAL_FALSE_POSITIVES.test(text)) {
    score += 0.2
    signals.push('含中文数量词')
  }

  // ── 2. 意图词 ──
  for (const intent of INTENT_PATTERNS) {
    if (intent.pattern.test(text)) {
      score += intent.weight
      signals.push(intent.label)
    }
  }

  // ── 3. 表达式模式 ──
  for (const expression of EXPRESSION_PATTERNS) {
    const match = text.match(expression.pattern)
    if (match) {
      score += expression.weight
      signals.push(expression.label)
      const captured = match[0].trim()
      if (captured.length > 0 && captured.length < 200) candidates.push(captured)
    }
  }

  /**
   * ── 3b. 数据/汇总信号（强信号）──
   *
   * 这类需求一旦出现就该走插件：数字多、要精确、人工算容易错。
   * 原来的词表里完全没有它们，实测「20 个数字求和」只得 0.30（不提醒）。
   */
  let dataSignalHit = false
  for (const signal of DATA_SIGNAL_PATTERNS) {
    if (signal.pattern.test(text)) {
      score += signal.weight
      signals.push('数据信号:' + signal.label)
      dataSignalHit = true
    }
  }

  /**
   * ── 3c. 物理推演信号（强信号）──
   *
   * 随机测试发现这类只提醒了 45%：`2.0倍重力下，花岗岩山能长多高`
   * 没有疑问词，只靠数字密度得 0.26，低于阈值。
   *
   * 这类是「心算给数字、工具给带约束的数字」差别最大的场景，
   * 漏报的代价（算错返工）远高于提醒一次的 131 token。
   * 所以命中即按 forced 处理。
   */
  let physicsSignalHit = false
  /**
   * 物理/工程类信号：两类都算「该用工具」，所以并集判定。
   *
   * 但**分数不同**：物理类 0.35（核心场景，但仍要看有没有具体量），
   * 工程类 0.3（更接近普通工程计算，权重略低）。
   */
  const physicsWord = PHYSICS_PATTERN.test(text)
  if (physicsWord || ENGINEERING_PATTERN.test(text)) {
    score += physicsWord ? 0.35 : 0.3
    signals.push(physicsWord ? '物理推演信号' : '工程计算信号')
    physicsSignalHit = true
  }

  /**
   * 物理推演**确实要算**的判据：物理词 + 有具体量。
   *
   * 为什么这样判：`2.0倍重力下，花岗岩山能长多高` 有数量+疑问，
   * 是真的要算；`重力压得他喘不过气` 只有词、没有量，是描写。
   *
   * 「有具体量」的三种来源：阿拉伯数字、中文数字、疑问词（多少/多高/几度…）。
   */
  const hasQuantity =
    /\d/.test(text) || (CN_NUMERAL_PATTERN.test(text) && !CN_NUMERAL_FALSE_POSITIVES.test(text))
  /**
   * 疑问词表 —— 盲测补充。
   *
   * 原来只有「多少/多高/多大」，漏掉了很多真实问法：
   *   「那里的水大概几度开」      → 几度
   *   「落地的速度会有多快」      → 多快
   *   「吃水会加深到什么程度」    → 什么程度
   * 这些都是在问一个可算的量，句式变了但需求没变。
   */
  const hasQuestion =
    /多少|多高|多远|多重|多快|多深|多长|多厚|多宽|多久|多快|几度|几倍|几[个次天年米度层]|多大|什么程度|达到什么|会不会|能不能|得几|要几/
  /**
   * 「变化量」词表 —— 盲测补充。
   *
   * 「载重**翻倍**，吃水会加深到什么程度」这类句子的需求是
   * 「参数变了，结果怎么变」，它既不含物理术语也不含标准疑问词，
   * 但显然要算。这类词表示「有一个量在变」。
   */
  const hasChange =
    /翻倍|减半|加倍|增加.{0,4}[倍成]|减少.{0,4}[倍成]|涨到|降到|变成原来的|放大|缩小|提高|降低/
  const physicsWantsCompute = physicsSignalHit && (hasQuantity || hasQuestion.test(text))

  /**
   * ── 3d. 变化量/数值疑问（独立信号）──
   *
   * 这类句子可能一个物理术语都不含，但显然要算：
   *   「这艘船如果载重翻倍，吃水会加深到什么程度」
   *     → 有「翻倍」「什么程度」，需求是「参数变了结果怎么变」
   *
   * 判据保守：必须**同时**有数量信息，才额外加分。
   * 否则「他合计了一下」这种纯叙述会被误伤。
   */
  if (hasQuantity && (hasChange.test(text) || hasQuestion.test(text))) {
    score += 0.3
    signals.push('变化量/数值疑问')
  }

  // ── 4. 减分项（防误报）──
  for (const negative of NEGATIVE_PATTERNS) {
    if (negative.pattern.test(text)) {
      /**
       * 数据信号存在时，**弱**排除项一律不生效。
       *
       * 实测踩到：`1.5 倍重力下，花岗岩山能长多高` 里的 `1.`
       * 被「列表编号」规则（-0.1）误伤，把 0.15 又压低，导致漏判。
       * 这类误伤的特点是「排除项权重很轻、但足以翻越阈值」。
       *
       * 弱排除的定义：|weight| ≤ 0.15（列表编号 -0.1、章节编号 -0.2 不算弱）。
       * 强排除（明确说不算 -0.5、版本号/URL -0.3）仍然生效 ——
       * 那些是真正「这不是计算需求」的信号。
       */
      const isWeakNegative = Math.abs(negative.weight) <= 0.15
      if (dataSignalHit && isWeakNegative) continue
      score += negative.weight // weight 是负数
      signals.push(`排除:${negative.label}`)
    }
  }

  // 归一化到 0-1
  const normalized = Math.max(0, Math.min(1, score))

  /**
   * ── 5. 分流 ──
   *
   * 为什么单一阈值不够：它只能回答「数学需求强不强」，
   * 回答不了「该心算还是该用工具」。实测两个反例：
   *   `2+2`            → 0.95（强）但它该心算
   *   `20 个数字求和`   → 0.30（弱）但它最该用工具
   * 前者的「强」来自表达式模式，后者的「弱」来自缺少数据信号词 ——
   * 两者都被阈值判反了。
   */
  const simple = isSimpleArithmetic(text)
  const demandClass: DemandClass = simple
    ? 'simple'
    : dataSignalHit || physicsWantsCompute
      ? 'forced'
      : 'fuzzy'

  /**
   * 各档的提醒决策：
   *   simple → 不提醒（AI 自己算；想用工具仍然可以用）
   *   forced → 一定提醒（数据多、要精确，这类出错代价高）
   *   fuzzy  → 按阈值（保留原来的防打扰行为）
   */
  const shouldPromptByClass =
    demandClass === 'simple'
      ? false
      : demandClass === 'forced'
        ? true
        : normalized >= DEFAULT_DETECTOR_CONFIG.threshold

  return {
    shouldPrompt: shouldPromptByClass,
    score: normalized,
    signals: simple ? [...signals, '分流:简单算术(不提醒)'] : signals,
    candidates: [...new Set(candidates)].slice(0, 5),
    demandClass,
  }
}

/**
 * 结合会话状态判断是否该提醒。
 *
 * 三条防打扰规则：
 *   1. 已提醒次数达到上限 → 不再提醒
 *   2. 距离上次提醒不足冷却步数 → 跳过
 *   3. 模型本会话已经用过插件 → 不再提醒
 *
 * @param sessionKey - 会话标识
 * @param text - 待检测文本
 * @param step - 当前步数
 * @param toolUsedInSession - 本会话是否已用过插件
 * @param config - 配置覆盖
 */
export function shouldPromptNow(
  sessionKey: string,
  text: string,
  step: number,
  toolUsedInSession: boolean,
  config: Partial<DetectorConfig> = {},
): DetectionResult & { reason?: string } {
  const merged: DetectorConfig = { ...DEFAULT_DETECTOR_CONFIG, ...config }

  if (!merged.enabled) {
    return { shouldPrompt: false, score: 0, signals: [], candidates: [], reason: '检测已禁用' }
  }

  // 已用过插件就不必再提醒（模型已经知道它存在）
  if (toolUsedInSession) {
    return { shouldPrompt: false, score: 0, signals: [], candidates: [], reason: '本会话已用过插件' }
  }

  const state = stateFor(sessionKey)
  if (state.promptCount >= merged.maxPromptsPerSession) {
    return { shouldPrompt: false, score: 0, signals: [], candidates: [], reason: '已达提醒次数上限' }
  }
  if (step - state.lastPromptStep < merged.cooldownSteps) {
    return { shouldPrompt: false, score: 0, signals: [], candidates: [], reason: '冷却中' }
  }

  const detection = detectMathNeed(text)
  /**
   * 按**档位**决策，而不是只看 score。
   *
   * 为什么必须分流：score 只回答「数学需求强不强」，
   * 回答不了「该心算还是该用工具」。实测两个方向都判反过：
   *   `2+2`          score 0.95 → 按阈值会提醒，但它该心算
   *   `20 个数字求和` score 0.30 → 按阈值不提醒，但它最该用工具
   *
   * 分档规则：
   *   simple → 不提醒（AI 自己算；想用工具仍然可以用）
   *   forced → 一定提醒（数据多、要精确，这类出错代价高）
   *   fuzzy  → 按阈值（保留原来的防打扰行为）
   */
  if (detection.demandClass === 'simple') {
    return { ...detection, shouldPrompt: false, reason: '简单算术，不打断' }
  }
  if (detection.demandClass === 'forced') {
    return { ...detection, shouldPrompt: true, reason: '涉及数据/汇总，建议用工具' }
  }
  if (detection.score < merged.threshold) {
    return {
      ...detection,
      shouldPrompt: false,
      reason: `评分 ${detection.score.toFixed(2)} 低于阈值 ${merged.threshold}`,
    }
  }

  return { ...detection, shouldPrompt: true }
}

/** 记录一次提醒（更新会话状态）。 */
export function recordPrompt(sessionKey: string, step: number): void {
  const state = stateFor(sessionKey)
  state.promptCount += 1
  state.lastPromptStep = step
}

/**
 * 生成提醒消息文本。
 *
 * 语气要克制：不打断创作流，只提示一句。
 */
export function buildReminderMessage(detection: DetectionResult): string {
  /**
   * 按档位说不同的话。
   *
   * 为什么不能一视同仁：`forced` 档是「数据多、要精确、人工算会错」，
   * 语气该更明确；`fuzzy` 档只是「可能涉及计算」，说重了就是打扰。
   *
   * 注意措辞不出现「禁止」「必须」这类硬指令 —— 本插件的风格是
   * 「说明代价」，把选择权留给作者。
   */
  const forced = detection.demandClass === 'forced'
  const lines: string[] = forced
    ? [
        '【系统提示 · 这类计算建议用 math_execute】',
        '',
        '检测到涉及数据汇总/精确计算的需求。这类内容人工推容易出错，',
        '而且错了通常看不出来 —— 建议直接调用 math_execute：',
      ]
    : [
        '【系统提示 · 数学计算器可用】',
        '',
        '检测到这一段可能涉及数值计算。可以用 math_execute 而不是心算或估算：',
      ]
  lines.push(
    '它能做高精度求值、解方程、符号微积分、矩阵运算、统计与概率、',
    '自然科学的公式求值、物理常数推演、星球与气候模拟。',
  )
  lines.push('批量算多条用 expressions 参数，一次往返即可。')
  if (detection.candidates.length > 0) {
    lines.push('')
    lines.push('检测到的算式片段（可参考）：' + detection.candidates.map((c) => '`' + c + '`').join('、'))
  }
  lines.push('')
  lines.push('（此提醒每会话最多出现几次，用过插件后不再打扰。）')
  return lines.join('\n')
}
