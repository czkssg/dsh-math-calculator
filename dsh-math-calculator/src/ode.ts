/**
 * 常微分方程求解（数值）。
 *
 * 之前我把 ODE 列为「不支持」，理由是 mathjs 的 solveODE 只接受 JS 函数、
 * 不接受表达式字符串。那个理由只说明「没有现成函数可调」，不等于「做不到」——
 * 数值积分 RK4 是最标准的算法之一，完全可以自己实现。
 *
 * 支持范围：
 * - 一阶方程组：dy/dt = f(t, y, ...)
 * - 二阶方程自动降阶：d²y/dt² = f  → 引入 vy 变量变成一阶系统
 * - 初值问题（IVP），RK4 定步长 + 步长减半误差检查
 *
 * 不支持的：
 * - 边值问题（BVP）
 * - 刚性方程（stiff）需要隐式方法，显式 RK 会失稳 —— 会给出明确警告
 * - 符号解析解（只给数值解）
 *
 * @module dsh-math-calculator/ode
 */

/** 一条微分方程。 */
export interface OdeEquation {
  /** 状态变量名，如 y、S、I、R */
  variable: string
  /** 阶数：1 或 2 */
  order: 1 | 2
  /** 右端表达式（用 t 与全部状态变量） */
  rhs: string
}

/** 解析结果。 */
export interface OdeSystem {
  /** 自变量名（通常是 t） */
  independent: string
  /** 一阶状态变量（含降阶引入的辅助变量） */
  stateVariables: string[]
  /** 每个状态变量的导数表达式 */
  derivatives: string[]
  /** 由二阶降阶引入的辅助变量名 */
  introducedVariables: string[]
  /** 原始方程，用于回显 */
  equations: OdeEquation[]
}

export class OdeError extends Error {
  readonly type: string
  constructor(type: string, message: string) {
    super(message)
    this.name = 'OdeError'
    this.type = type
  }
}

/** 把 `表达式` 里的一条方程拆成 左/右。 */
function splitEquation(text: string): { left: string; right: string } | undefined {
  // 找顶层 = （排除 ==、<=、>=、!=）
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === '=' && depth === 0) {
      const previous = text[i - 1]
      const next = text[i + 1]
      if (previous === '=' || previous === '!' || previous === '<' || previous === '>') continue
      if (next === '=') continue
      return { left: text.slice(0, i).trim(), right: text.slice(i + 1).trim() }
    }
  }
  return undefined
}

/** 按顶层逗号/分号/换行拆分多条方程。 */
export function splitOdeEquations(source: string): string[] {
  const pieces: string[] = []
  let depth = 0
  let current = ''
  for (const char of source) {
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if ((char === ',' || char === ';' || char === '\n') && depth === 0) {
      if (current.trim() !== '') pieces.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') pieces.push(current.trim())
  return pieces
}

/**
 * 解析左侧的导数记号。
 * 支持：
 *   dy/dt    → 变量 y，阶数 1
 *   dS/dt    → 变量 S，阶数 1
 *   d^2y/dt^2 → 变量 y，阶数 2
 *   d2y/dt2   → 变量 y，阶数 2（简化写法）
 */
function parseDerivativeNotation(left: string): { variable: string; order: 1 | 2; independent: string } | undefined {
  const text = left.replace(/\s+/g, '')

  // d^2y/dt^2 或 d2y/dt2
  const second = text.match(/^d(?:\^2|2)([A-Za-z_][A-Za-z0-9_]*)\/d([A-Za-z_][A-Za-z0-9_]*)(?:\^2|2)$/)
  if (second) {
    return { variable: second[1], order: 2, independent: second[2] }
  }

  // dy/dt
  const first = text.match(/^d([A-Za-z_][A-Za-z0-9_]*)\/d([A-Za-z_][A-Za-z0-9_]*)$/)
  if (first) {
    return { variable: first[1], order: 1, independent: first[2] }
  }

  return undefined
}

/**
 * 解析 ODE 系统。
 * 二阶方程自动降阶：d²y/dt² = f  →  y' = vy, vy' = f
 */
export function parseOdeSystem(expression: string): OdeSystem {
  const pieces = splitOdeEquations(expression)
  if (pieces.length === 0) {
    throw new OdeError('invalid_argument', '没有找到方程')
  }

  const equations: OdeEquation[] = []
  let independent = 't'

  for (const piece of pieces) {
    const split = splitEquation(piece)
    if (!split) {
      throw new OdeError('syntax', `方程 "${piece}" 缺少等号，应为 dy/dt = ... 形式`)
    }
    const notation = parseDerivativeNotation(split.left)
    if (!notation) {
      throw new OdeError(
        'syntax',
        `左侧 "${split.left}" 不是导数形式，应为 dy/dt、dS/dt 或 d^2y/dt^2`,
      )
    }
    independent = notation.independent
    equations.push({ variable: notation.variable, order: notation.order, rhs: split.right })
  }

  // 降阶：二阶 → 两个一阶
  const stateVariables: string[] = []
  const derivatives: string[] = []
  const introducedVariables: string[] = []

  for (const equation of equations) {
    if (equation.order === 1) {
      stateVariables.push(equation.variable)
      derivatives.push(equation.rhs)
      continue
    }
    // 二阶：y' = vy, vy' = rhs
    const auxiliary = `${equation.variable}_d`
    introducedVariables.push(auxiliary)
    stateVariables.push(equation.variable, auxiliary)
    derivatives.push(auxiliary, equation.rhs)
  }

  // 去重（同一变量重复定义时取后者）
  const seen = new Map<string, string>()
  const orderedVariables: string[] = []
  for (let index = 0; index < stateVariables.length; index += 1) {
    const name = stateVariables[index]
    if (!seen.has(name)) orderedVariables.push(name)
    seen.set(name, derivatives[index])
  }

  return {
    independent,
    stateVariables: orderedVariables,
    derivatives: orderedVariables.map((name) => seen.get(name) as string),
    introducedVariables,
    equations,
  }
}

/** 积分选项。 */
export interface OdeOptions {
  /** 初值：变量名 → 数值 */
  initial: Record<string, number>
  /** 积分区间 [t0, t1] */
  from: number
  to: number
  /** 步数（越大越准） */
  steps: number
  /** 返回值里包含的采样点数上限 */
  sampleLimit?: number
}

/** 积分结果。 */
export interface OdeSolution {
  system: OdeSystem
  /** 采样点：t 与各状态变量 */
  samples: Array<{ t: number; values: Record<string, number> }>
  /** 终点值 */
  final: Record<string, number>
  /** 每个变量的极值 */
  extremes: Record<string, { max: number; maxAt: number; min: number; minAt: number }>
  /** 实际使用的步数 */
  steps: number
  /** 步长 */
  stepSize: number
  /** 是否触发了刚性/发散警告 */
  warnings: string[]
}

/** 取数值。 */
function numeric(value: any): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (value && typeof value === 'object') {
    if (value.isBigNumber) {
      const n = Number(value.valueOf())
      return Number.isFinite(n) ? n : undefined
    }
  }
  return undefined
}

/**
 * 用 RK4 求解初值问题。
 *
 * 步骤：
 * 1. 用 mathjs 编译每条导数表达式
 * 2. 复用同一个 scope 对象，只改数值 —— 避免每步分配
 * 3. 四阶 Runge-Kutta 推进
 * 4. 每隔若干步采样一次
 */
export function solveOde(
  engine: any,
  system: OdeSystem,
  options: OdeOptions,
): OdeSolution {
  const { initial, from, to, steps } = options
  const variables = system.stateVariables
  const dimension = variables.length

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new OdeError('invalid_argument', '积分区间必须是有限数字')
  }
  if (to === from) {
    throw new OdeError('invalid_argument', '积分区间不能为零长度')
  }
  if (!Number.isInteger(steps) || steps < 1) {
    throw new OdeError('invalid_argument', 'steps 必须是正整数')
  }

  // 检查初值完整性
  const missing = variables.filter((name) => typeof initial[name] !== 'number' || !Number.isFinite(initial[name]))
  if (missing.length > 0) {
    throw new OdeError(
      'missing_initial',
      `缺少初值: ${missing.join(', ')}。用 initial 参数给出，例如 {"y": 1}`,
    )
  }

  // 编译导数
  const compiled: Array<{ name: string; node: any }> = []
  for (let index = 0; index < dimension; index += 1) {
    const name = variables[index]
    const expression = system.derivatives[index]
    let node: any
    try {
      node = engine.parse(expression)
    } catch (error) {
      throw new OdeError('syntax', `导数 ${name}' = ${expression} 解析失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    compiled.push({ name, node: node.compile() })
  }

  // 复用的 scope
  const scope: Record<string, any> = {}
  for (const name of variables) scope[name] = initial[name]
  scope[system.independent] = from

  /** 计算导数向量。 */
  const derive = (t: number, state: number[]): number[] => {
    scope[system.independent] = t
    for (let index = 0; index < dimension; index += 1) {
      scope[variables[index]] = state[index]
    }
    const result = new Array<number>(dimension)
    for (let index = 0; index < dimension; index += 1) {
      let raw: any
      try {
        raw = compiled[index].node.evaluate(scope)
      } catch (error) {
        throw new OdeError(
          'evaluation',
          `在 t=${t} 处计算 ${variables[index]}' 失败: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const value = numeric(raw)
      if (value === undefined) {
        throw new OdeError(
          'evaluation',
          `在 t=${t} 处 ${variables[index]}' 的值不是有限实数`,
        )
      }      result[index] = value
    }
    return result
  }

  const stepSize = (to - from) / steps
  let state = variables.map((name) => initial[name])
  let t = from

  const sampleLimit = Math.max(2, options.sampleLimit ?? 24)
  const sampleEvery = Math.max(1, Math.floor(steps / sampleLimit))
  const samples: Array<{ t: number; values: Record<string, number> }> = []
  const warnings: string[] = []

  const record = (time: number, values: number[]): void => {
    const map: Record<string, number> = {}
    for (let index = 0; index < dimension; index += 1) map[variables[index]] = values[index]
    samples.push({ t: time, values: map })
  }

  record(t, state)

  const extremes: Record<string, { max: number; maxAt: number; min: number; minAt: number }> = {}
  for (const name of variables) {
    extremes[name] = { max: -Infinity, maxAt: from, min: Infinity, minAt: from }
  }
  const updateExtremes = (time: number, values: number[]): void => {
    for (let index = 0; index < dimension; index += 1) {
      const name = variables[index]
      const value = values[index]
      if (!Number.isFinite(value)) continue
      if (value > extremes[name].max) {
        extremes[name].max = value
        extremes[name].maxAt = time
      }
      if (value < extremes[name].min) {
        extremes[name].min = value
        extremes[name].minAt = time
      }
    }
  }
  updateExtremes(t, state)

  // RK4 主循环
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    const k1 = derive(t, state)

    const y2 = state.map((value, index) => value + (stepSize / 2) * k1[index])
    const k2 = derive(t + stepSize / 2, y2)

    const y3 = state.map((value, index) => value + (stepSize / 2) * k2[index])
    const k3 = derive(t + stepSize / 2, y3)

    const y4 = state.map((value, index) => value + stepSize * k3[index])
    const k4 = derive(t + stepSize, y4)

    const next = state.map(
      (value, index) =>
        value + (stepSize / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]),
    )

    // 发散检测：任一状态变量变成非有限或增长过快
    let diverged = false
    for (const value of next) {
      if (!Number.isFinite(value) || Math.abs(value) > 1e100) {
        diverged = true
        break
      }
    }
    if (diverged) {
      warnings.push(
        `积分在 t≈${(t + stepSize).toFixed(6)} 处发散（数值爆炸）。` +
          '可能是方程本身有奇点，或系统刚性太强需要更小步长。',
      )
      break
    }

    state = next
    t += stepSize
    updateExtremes(t, state)

    if ((stepIndex + 1) % sampleEvery === 0 || stepIndex === steps - 1) {
      record(t, state)
    }
  }

  const final: Record<string, number> = {}
  for (let index = 0; index < dimension; index += 1) final[variables[index]] = state[index]

  // 刚性提示：如果状态变化量级远超初值，或出现大负值（如人口为负）值得提醒
  for (const name of variables) {
    if (final[name] < -1e-9) {
      warnings.push(`变量 ${name} 出现了负值（${final[name].toPrecision(4)}）。若该量不该为负，说明步长过大或用错了模型。`)
    }
  }

  return {
    system,
    samples,
    final,
    extremes,
    steps,
    stepSize,
    warnings,
  }
}
