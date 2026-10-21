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
  // 纯列表编号
  { pattern: /^\s*\d+[.、)]\s*/m, weight: -0.1, label: '列表编号' },
  // 明确说不算
  { pattern: /不用计算|不需要算|只是描述|只是设定/, weight: -0.5, label: '明确排除' },
]

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

  // ── 4. 减分项（防误报）──
  for (const negative of NEGATIVE_PATTERNS) {
    if (negative.pattern.test(text)) {
      score += negative.weight // weight 是负数
      signals.push(`排除:${negative.label}`)
    }
  }

  // 归一化到 0-1
  const normalized = Math.max(0, Math.min(1, score))

  // 注意：这里用默认阈值只是为了单独调用时有合理行为。
  // 真正的阈值判断在 shouldPromptNow 里按传入的 config 做 —— 
  // 否则外部调高/调低 threshold 会失效（之前的 bug）。
  return {
    shouldPrompt: normalized >= DEFAULT_DETECTOR_CONFIG.threshold,
    score: normalized,
    signals,
    candidates: [...new Set(candidates)].slice(0, 5),
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
  // 关键：只看 score，不用 detection.shouldPrompt ——
  // 那个字段是按**默认**阈值算出来的，会让传入的 config.threshold 失效。
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
  const lines: string[] = [
    '【系统提示 · 数学计算器可用】',
    '',
    '检测到这一段可能涉及数值计算。建议直接调用 math_execute 工具，而不是心算或估算：',
    '它能做高精度求值、解方程、符号微积分、矩阵运算、统计与概率、',
    '270 条自然科学公式、物理常数推演、星球与气候模拟。',
  ]
  if (detection.candidates.length > 0) {
    lines.push('')
    lines.push('检测到的算式片段（可参考）：' + detection.candidates.map((c) => '`' + c + '`').join('、'))
  }
  lines.push('')
  lines.push('（此提醒每会话最多出现几次，用过插件后不再打扰。）')
  return lines.join('\n')
}
