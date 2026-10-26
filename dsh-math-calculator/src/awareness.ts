/**
 * 让模型「知道并记得」插件可用。
 *
 * 问题：工具写好了，模型却自己心算一遍，不调用。三个原因：
 *   1. description 过时 —— 模型根本不知道有哪些能力
 *   2. 只在系统提示里出现一次 —— 对话长了就忘了
 *   3. 不知道「什么时候该用」—— 缺少触发场景的线索
 *
 * 对策（三层）：
 *
 *   第一层：**准确的 description**（模型每次看到的工具清单）
 *     - 完整枚举全部 operation
 *     - 写清楚「什么时候必须用」，而不只是「能做什么」
 *
 *   第二层：**系统提示注入**（`ctx.get('systemPrompt').section`，可选服务——不能直接读属性）
 *     - 每轮对话都带上简短提醒
 *     - 档位可调（off / brief / full），默认 brief，省 token
 *     - 动态生成：如果当前工作区改了常数，就提醒"当前世界常数已改"
 *
 *   第三层：**工具自身的引导**
 *     - operation=help 返回完整清单（模型主动查时用）
 *     - 错误信息里提示"该用哪个 operation"
 *
 * @module dsh-math-calculator/awareness
 */

import { FORMULAS } from './formulas.js'
import { FUNDAMENTAL_NAMES, getActiveConstants } from './constants-graph.js'
import { currentWorkspace, loadWorkspace, workspaceDirectory } from './workspace.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildBriefPlaybook, buildPlaybook } from './playbook.js'

/** 提示档位。 */
export type PromptMode = 'off' | 'brief' | 'full'

/** 当前档位（可运行时切换）。 */
let promptMode: PromptMode = 'brief'

/** 设置档位。 */
export function setPromptMode(mode: PromptMode): void {
  promptMode = mode
}

/** 读取档位。 */
export function getPromptMode(): PromptMode {
  return promptMode
}

/**
 * 第一层：工具描述。
 *
 * 这是模型**每次**看工具清单时都会读到的内容，所以必须：
 *   - 完整列出 operation（漏一个，模型就不知道它存在）
 *   - 写「何时使用」而不是只写「是什么」
 *   - 给出触发关键词，让模型在遇到这类问题时想起它
 */
export const TOOL_DESCRIPTION = [
  '本地数学与物理推演引擎（BigNumber 64 位 + 符号代数 + 架空世界推演）。',
  '',
  '⚠️ 数值计算必须调用本工具：不要心算、不要用 bash 拼凑算术。',
  '触发：算术/三角、解方程、求导积分、矩阵、统计、单位换算、公式求值、',
  '改常数看后果、推演星球/恒星/卫星/生命、势力收支与承压。',
  '',
  'operation（共 30 个；不填=auto，含等号判为方程；完整说明用 help）：',
  '  求值 evaluate | 方程 solve system | 微积分 derivative integral | 代数 simplify expand roots',
  '  线代 matrix eigen | 统计 stats dist regression | 微分方程 ode',
  '  公式 formula formulas | 世界 world | 常数 constants quantities impact',
  '  单位 units | 收支 balance | 天体 bodies | 推演 derivation（pipeline/dead/flip 等）',
  '  自创量 custom | 设定校验 feasibility | 数据 workspace formula-table | 自查 help',
  '',
  '读输出约定：',
  '  · [精确]/[标度]/[量级]/[仅方向] 是可信度标签，引用时保留；',
  '  · 【跨模块一致性】✓/⚠/✗，看到 ✗ 先修正设定；',
  '  · 【模型可信度】标出哪些数只是地球标定，常数偏离现实时会失真。',
  '',
  '精度默认 64 位（precision 可调 1-256）。失败返回 ok=false + error.hint，按提示修正。',
].join('\n')

/**
 * 第二层：系统提示注入。
 *
 * 每轮对话都会带上这段文字，解决「对话长了就忘记」的问题。
 * 按档位控制长度，默认 brief 省 token。
 */
export function buildSystemPromptSection(): string {
  if (promptMode === 'off') return ''

  // 动态信息：当前工作区 + 是否有常数改动
  let workspaceName = 'default'
  let changedConstants: string[] = []
  let customFormulaCount = 0
  let disabledCount = 0

  try {
    workspaceName = currentWorkspace()
    const workspace = loadWorkspace(workspaceName)
    const active = getActiveConstants()
    const baseline = new Set(['c', 'G', 'h', 'kB', 'e_charge', 'me', 'mp', 'NA', 'epsilon0'])
    changedConstants = FUNDAMENTAL_NAMES.filter((name) => {
      const value = active[name]
      return typeof value === 'number'
    }).slice(0, 6)
    const table = workspace.formulaTable
    if (table) {
      customFormulaCount = table.custom.length
      disabledCount = table.overrides.filter((o) => o.disabled).length
    }
  } catch {
    /* 读不到就按默认值 */
  }

  const changedNote =
    changedConstants.length > 0
      ? `\n· 当前工作区「${workspaceName}」已改动常数：${changedConstants.join(', ')} —— 公式会自动使用这些新值。`
      : ''

  const tableNote =
    customFormulaCount > 0 || disabledCount > 0
      ? `\n· 该工作区有 ${customFormulaCount} 条自定义公式、${disabledCount} 条停用公式（只在本工作区生效）。`
      : ''

  // 工作区状态快照（供指令集动态定制）
  let customConstantCount = 0
  let hasArchive = false
  try {
    const workspace = loadWorkspace(workspaceName)
    customConstantCount = (workspace.customConstants ?? []).length
    hasArchive = existsSync(join(workspaceDirectory(), workspaceName + '.derivation.json'))
  } catch {
    /* 读不到就按 0 */
  }

  if (promptMode === 'brief') {
    return [
      '## 数学计算工具（math_execute）',
      '',
      '涉及任何数值计算时**必须**调用 math_execute，不要心算、不要用 bash 拼凑。',
      '',
      '能算：高精度求值、解方程、符号微积分、矩阵/特征值/秩/奇异值、统计与分布、回归、',
      '微分方程、' + FORMULAS.length + ' 条自然科学公式、物理常数推演、星球/天空/恒星/卫星/生命推演、',
      '宏观文明极限（能量/材料/交通/技术树）、观测者体感、逆推校准、混沌概率云。',
      '',
      '读输出：',
      '· [精确]/[标度]/[量级]/[仅方向] 是可信度标签——引用结论时请保留；',
      '· 【跨模块一致性】的 ✗ 表示设定自相矛盾，先修正再写；',
      '· 【模型可信度】标出哪些数字只是地球标定。',
      '',
      buildBriefPlaybook({ changedConstants: changedConstants, customConstants: customConstantCount }),
      '',
      '不确定能力边界时先调 operation="help"。' + changedNote + tableNote,
    ].join('\n')
  }

  // full 档：完整清单
  return [
    '## 数学计算工具（math_execute）',
    '',
    '涉及任何数值计算时**必须**调用 math_execute，不要心算、不要用 bash 拼凑。',
    '',
    '### 常用 operation',
    '- evaluate：高精度求值（BigNumber，64 位有效数字）',
    '- solve / system：解方程与线性系统',
    '- derivative / integral / simplify / expand / roots：符号微积分与代数',
    '- matrix / eigen：线性代数；只给矩阵时额外给出 秩/行列式/迹/奇异值/零空间/逆',
    '- stats / dist / regression / ode：统计、概率、回归、微分方程',
    '- formula / formulas：' + FORMULAS.length + ' 条自然科学公式，参数全部可覆盖',
    '- world：星球 → 体感画像 + 天空 + 恒星结构 + 卫星系统 + 生命闸门 + 跨模块检查',
    '- constants / quantities / impact：改物理常数并评估后果',
    '- workspace / formula-table：分世界观管理数据（完全隔离）',
    '',
    '### 读输出的约定',
    '- 每个结论都带可信度：[精确] 严格公式；[标度] 有地球标定系数；[量级] 只保证数量级；[仅方向] 只给趋势。',
    '- 【跨模块一致性】给 ✓/⚠/✗；✗ 是矛盾（例如行星不在宜居带），需要先改设定。',
    '- 【模型可信度】列出经验标定项与适用域；偏离超出范围时结论降级，不要当作精确物理。',
    '- 生命闸门只判「绝对不行」：硬否决=不可能；强约束=需要解释；开放=交给你判断。',
    '',
    '### 世界推演相关 operation',
    '- derivation：推演栈框架（子命令见下）',
    '  · stack / cards / pipeline：分层推演与接口卡',
    '  · backSolve / anchors：逆推校准（给锚点反推参数窗口）',
    '  · civilization：能量/材料/交通/技术树极限',
    '  · dead：宇宙死寂判定（结构化原因，结语由你生成）',
    '  · observer：切换观测者重算体感（人择选择效应）',
    '  · chaos：Lyapunov 超限时给概率云，不给假精确值',
    '  · fantasy：幻想量与等价现实量（只提醒不判定）',
    '  · archive / history / compare：七张表持久化与版本对比',
    '- custom：定义自创常数与新物理量（必须带量纲）',
    '',
    '### 使用要点',
    '- 单次调用尽量把表达式写完整，避免来回多次',
    '- 公式参数用 overrides 覆盖（架空世界改系数就靠这个）',
    '- 不确定能力边界时调 operation="help"' + changedNote + tableNote,
    '',
    buildPlaybook({
      workspace: workspaceName,
      changedConstants: changedConstants,
      customConstants: customConstantCount,
      customFormulas: customFormulaCount,
      hasArchive: hasArchive,
    }),
  ].join('\n')
}

/**
 * 第三层：把常见错误引导到正确的 operation。
 *
 * 模型有时候会硬用一个不合适的 operation，这里给出建议。
 */
export function suggestOperation(expression: string, currentOperation: string): string | undefined {
  const text = expression.trim()
  if (text === '') return undefined

  // 含等号但用了 evaluate → 应该 solve
  if (currentOperation === 'evaluate' && /(?<![<>=!])=(?!=)/.test(text)) {
    return '表达式里含等号，看起来是方程。建议用 operation="solve"（多方程用逗号分隔）。'
  }

  // 提到导数/微分但用了 evaluate
  if (currentOperation === 'evaluate' && /求导|导数|derivative|d\/d/i.test(text)) {
    return '看起来是求导需求。建议用 operation="derivative" + expression（如 "x^3 * sin(x)"）。'
  }

  // 提到积分
  if (currentOperation === 'evaluate' && /积分|integral|∫/i.test(text)) {
    return '看起来是积分需求。建议用 operation="integral"。'
  }

  // 提到矩阵/特征值
  if (currentOperation === 'evaluate' && /特征值|eigen|特征向量/i.test(text)) {
    return '看起来是特征值需求。建议用 operation="eigen" + matrix。'
  }

  // 提到星球/重力/气候
  if (/星球|行星|重力|气候|昼夜|季节|宜居/i.test(text) && !/^[-+0-9.]/.test(text)) {
    return '这看起来是世界观推演需求。建议用 operation="world"（输入星球参数）或 operation="formula"（调用现成公式）。'
  }

  return undefined
}
