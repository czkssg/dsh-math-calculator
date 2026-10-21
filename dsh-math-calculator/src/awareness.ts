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
import { currentWorkspace, loadWorkspace } from './workspace.js'

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
  '本地数学计算引擎（BigNumber 高精度 + 符号代数 + 物理推演）。',
  '',
  '⚠️ 凡是需要数值计算的场景都必须调用本工具 —— 不要心算、不要用 bash 拼凑算术。',
  '典型触发：任何算术/开方/对数/三角；解方程；求导积分；矩阵；统计；单位换算；',
  '物理公式求值；改变物理常数看后果；推演星球/气候/地形；管理世界观数据。',
  '',
  '【operation 速查】（完整清单用 operation="help"）',
  '',
  '· evaluate     —— 求值。支持 BigNumber 与 mathjs 全部语法',
  '                  例：10^20+5 / factorial(50) / (1+2i)*(3-i) / 5 cm to inch',
  '',
  '· solve        —— 解方程。多方程逗号分隔即为方程组',
  '                  例：3x + 2y = 10, x - y = 1   /   x^2 - 5x + 6 = 0',
  '· system       —— 显式线性系统（给 matrix + vector）',
  '· derivative   —— 符号求导（支持 order 高阶）',
  '· integral     —— 符号不定积分',
  '· simplify / expand —— 化简与展开',
  '· roots        —— 多项式求根（含复数根）',
  '',
  '· matrix       —— 矩阵运算（乘法/求逆/行列式/转置）',
  '· eigen        —— 特征值与特征向量',
  '',
  '· stats        —— 描述统计（均值/中位数/方差/标准差/分位数/偏度/峰度）',
  '· dist         —— 概率分布（normal/binomial/poisson/exponential/chisquare/t）',
  '· regression   —— 线性与多项式回归（含 R²）',
  '· ode          —— 数值求解微分方程（RK4，一阶方程组/二阶方程）',
  '',
  '· formula      —— 调用已收录的 ' + FORMULAS.length + ' 条自然科学公式（按 id 或名称）',
  '                  例：formula="escape_velocity", overrides={M,r}',
  '                  任何参数都可覆盖 —— 这是架空世界改造的关键',
  '· formulas     —— 检索公式库（按关键词）',
  '',
  '· world        —— 输入星球参数 → 输出体感画像（重力/昼夜/季节/气候带/地形上限）',
  '· constants    —— 改变物理常数，自动推导全部派生量并评估世界偏离度',
  '· quantities   —— 看哪些物理量该跟着常数变、哪些不该（量纲分析）',
  '· impact       —— 改常数后跑全部公式并与现实对比，算出每条偏差',
  '',
  '· workspace    —— 管理工作区（一个世界观 = 一套常数表 + 公式表 + 地点 + 变量）',
  '                  不同工作区完全隔离，互不污染',
  '· formula-table —— 管理工作区的公式表（覆盖/自定义/停用）',
  '',
  '· help         —— 完整能力清单',
  '',
  '参数要点：',
  '  expression  表达式或方程（多方程用逗号）',
  '  variables   变量字典，如 {"m":500,"v":30}',
  '  operation   上面的值；不填=auto（含 = 判为方程，其余求值）',
  '  overrides / constants / world / terrain  各 operation 专用',
  '',
  '精度：默认 64 位有效数字（precision 可调 1-256）。整数输出为完整定点数，不会变成科学计数法。',
  '失败返回 ok=false + error.type/message/hint，按 hint 修正即可，不会崩溃。',
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

  if (promptMode === 'brief') {
    return [
      '## 数学计算工具（math_execute）',
      '',
      '涉及任何数值计算时**必须**调用 math_execute，不要心算、不要用 bash 拼凑。',
      '它能算的远不止四则运算：高精度大数、符号求导/积分、解方程、矩阵与特征值、',
      '统计与概率分布、微分方程数值解、270 条自然科学公式、物理常数推演、星球与气候模拟。',
      '不确定有什么能力时，先调 operation="help"。' + changedNote + tableNote,
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
    '- solve：解方程（多方程逗号分隔 = 方程组）',
    '- derivative / integral / simplify / roots：符号微积分与代数',
    '- matrix / eigen：线性代数',
    '- stats / dist / regression：统计与概率',
    '- ode：微分方程数值解（RK4）',
    '- formula / formulas：' + FORMULAS.length + ' 条自然科学公式，参数全部可覆盖',
    '- world：输入星球参数 → 体感画像（重力/气候/地形上限）',
    '- constants / quantities / impact：改物理常数并评估后果',
    '- workspace / formula-table：分世界观管理数据（完全隔离）',
    '',
    '### 使用要点',
    '- 单次调用尽量把表达式写完整，避免来回多次',
    '- 公式参数用 overrides 覆盖（架空世界改系数就靠这个）',
    '- 不确定能力边界时调 operation="help"' + changedNote + tableNote,
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
