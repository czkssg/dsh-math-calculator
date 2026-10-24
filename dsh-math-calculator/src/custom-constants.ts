/**
 * 自创常数与新物理量：让架空世界能定义现实里不存在的量。
 *
 * @module dsh-math-calculator/custom-constants
 * @description
 * 为什么需要：有些设定的效果**靠调现有参数怎么都做不出来**——
 * 必须引入「新物理量 / 新规律 / 新物质」。例如：
 *   · 一种叫「以太压」的量，决定这个世界能否超光速通信；
 *   · 一种叫「灵能浓度」的量，让生物能直接做功；
 *   · 「晶格强度」远超现有材料强度公式能给的区间。
 *
 * 这些量必须满足**三条约束**，否则推演会立刻崩：
 *
 * 1. **量纲必须明确**：每个自创量要声明基本量纲（长度/质量/时间/温度/电流/物质量/光强），
 *    否则无法判断公式量纲是否自洽（规格里的「量纲一致」检查就过不了）。
 * 2. **基准值必须给**：自创量没有「现实值」，所以要给一个「本世界基准值」，
 *    后续所有推导都以它为参照。
 * 3. **来源必须记**：这是作者的选择还是从更基本的量推出来的？
 *    若是推出来的，要写明依赖——这样改底层时能自动重算。
 */

/**
 * 量纲的七个基本分量（国际单位制的标准七维）。
 *
 * 任何物理量的量纲都可以写成这七个指数的组合，例如：
 *   速度 = L¹T⁻¹、力 = M¹L¹T⁻²、能量 = M¹L²T⁻²。
 */
export interface Dimension {
  /** 长度 L 的指数。 */
  L?: number
  /** 质量 M 的指数。 */
  M?: number
  /** 时间 T 的指数。 */
  T?: number
  /** 温度 Θ 的指数。 */
  Theta?: number
  /** 电流 I 的指数。 */
  I?: number
  /** 物质量 N 的指数。 */
  N?: number
  /** 光强 J 的指数。 */
  J?: number
}

/**
 * 自创常数的定义。
 *
 * 这是「本世界新增的一个物理量」。存进工作区后，公式可以引用它、
 * 推演层可以用它做判定。
 */
export interface CustomConstant {
  /** 量名（须是合法标识符，供表达式引用）。 */
  name: string
  /** 中文显示名。 */
  label: string
  /** 本世界的基准值。 */
  value: number
  /** 单位（自由文本，如 `J/m³`、`灵能单位`）。 */
  unit: string
  /** 量纲（用于量纲检查）。 */
  dimension: Dimension
  /** 物理含义 / 在故事里起什么作用。 */
  meaning: string
  /** 来源：author=作者设定；derived=由其它量推来。 */
  origin: 'author' | 'derived'
  /** 若 origin=derived，依赖哪些量。 */
  dependsOn?: string[]
  /** 若 origin=derived，求值表达式（可用其它量名）。 */
  derive?: string
  /** 创建时间。 */
  createdAt: string
}

/** 计算量纲的字符串形式，便于展示与比较。 */
export function dimensionText(dim: Dimension): string {
  const parts: string[] = []
  const add2 = function (symbol: string, power: number | undefined): void {
    if (!power) return
    parts.push(power === 1 ? symbol : symbol + '^' + power)
  }
  add2('L', dim.L)
  add2('M', dim.M)
  add2('T', dim.T)
  add2('Θ', dim.Theta)
  add2('I', dim.I)
  add2('N', dim.N)
  add2('J', dim.J)
  return parts.length === 0 ? '无量纲' : parts.join('·')
}

/** 判断两个量纲是否相同。 */
export function sameDimension(a: Dimension, b: Dimension): boolean {
  return (a.L ?? 0) === (b.L ?? 0) && (a.M ?? 0) === (b.M ?? 0) && (a.T ?? 0) === (b.T ?? 0) &&
    (a.Theta ?? 0) === (b.Theta ?? 0) && (a.I ?? 0) === (b.I ?? 0) &&
    (a.N ?? 0) === (b.N ?? 0) && (a.J ?? 0) === (b.J ?? 0)
}

/** 量名合法性：必须是合法标识符且不与保留字冲突。 */
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/

/** 常见保留字（避免覆盖引擎或常数表的名字）。 */
const RESERVED = new Set([
  'c', 'G', 'h', 'kB', 'NA', 'e_charge', 'me', 'mp', 'pi', 'e', 'i',
  'import', 'createUnit', 'evaluate', 'parse', 'simplify',
])

/**
 * 校验一个自创常数定义。
 *
 * @param input - 待校验的定义
 * @returns 错误信息数组（空数组表示通过）
 */
export function validateCustomConstant(input: unknown): string[] {
  const errors: string[] = []
  const value = input as Record<string, unknown> | undefined
  if (!value || typeof value !== 'object') return ['定义必须是对象']

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (name === '') errors.push('缺少 name')
  else if (!NAME_PATTERN.test(name)) errors.push('name 必须是合法标识符（字母/数字/下划线，不以数字开头）')
  else if (RESERVED.has(name)) errors.push('name 与保留字冲突：' + name)

  if (typeof value.label !== 'string' || value.label.trim() === '') errors.push('缺少 label（中文显示名）')
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) errors.push('value 必须是有限数')
  if (typeof value.unit !== 'string' || value.unit.trim() === '') errors.push('缺少 unit（单位）')
  if (typeof value.meaning !== 'string' || value.meaning.trim() === '') errors.push('缺少 meaning（物理含义）')

  const dim = value.dimension as Dimension | undefined
  if (!dim || typeof dim !== 'object') {
    errors.push('缺少 dimension（量纲）——不做量纲检查的话，公式会悄悄算错')
  } else {
    for (const key of ['L', 'M', 'T', 'Theta', 'I', 'N', 'J']) {
      const power = (dim as Record<string, unknown>)[key]
      if (power !== undefined && (typeof power !== 'number' || !Number.isFinite(power))) {
        errors.push('量纲 ' + key + ' 必须是数字')
      }
    }
  }

  const origin = value.origin
  if (origin !== 'author' && origin !== 'derived') {
    errors.push('origin 只能是 author 或 derived')
  }
  if (origin === 'derived') {
    if (typeof value.derive !== 'string' || value.derive.trim() === '') {
      errors.push('origin=derived 时必须给 derive（表达式）')
    }
    if (!Array.isArray(value.dependsOn) || value.dependsOn.length === 0) {
      errors.push('origin=derived 时必须给 dependsOn（依赖哪些量）')
    }
  }

  return errors
}

/** 量纲检查结果。 */
export interface DimensionCheckResult {
  ok: boolean
  resultDimension: Dimension
  expectedDimension?: Dimension
  problems: string[]
}

/**
 * 从表达式里提取参与运算的已知量名。
 *
 * @param expression - 表达式文本
 * @param known - 已知量名集合
 * @returns 出现的已知量名
 */
export function referencedNames(expression: string, known: Set<string>): string[] {
  const found = new Set<string>()
  const pattern = /[A-Za-z_][A-Za-z0-9_]*/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(expression)) !== null) {
    if (known.has(match[0])) found.add(match[0])
  }
  return Array.from(found)
}

/**
 * 简易量纲检查：抓常见错误，不追求完整解析。
 *
 * 支持：单量、幂次、乘除、数字因子。
 * 不支持：加减混合（提示拆分）、函数调用（提示无法自动检查）。
 *
 * @param expression - 待检查表达式
 * @param dimensions - 量名 → 量纲
 * @param expected - 期望量纲（可选）
 * @returns 检查结果
 */
export function checkDimension(
  expression: string,
  dimensions: Record<string, Dimension>,
  expected?: Dimension,
): DimensionCheckResult {
  const problems: string[] = []
  const result: Dimension = {}

  if (/[+]/.test(expression)) {
    problems.push('表达式含加法：请确认每一项量纲一致（本工具只检查乘除幂）')
  }
  if (/[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(expression)) {
    problems.push('表达式含函数调用，无法自动做量纲检查')
  }

  const factors = expression.split(/[*/]/)
  const operators = expression.match(/[*/]/g) || []

  for (let index = 0; index < factors.length; index += 1) {
    const raw = factors[index].trim()
    if (raw === '') continue
    const sign = index === 0 ? 1 : operators[index - 1] === '/' ? -1 : 1
    if (/^[0-9.]+$/.test(raw)) continue

    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\^(-?[0-9.]+))?$/)
    if (!match) {
      problems.push('无法识别因子「' + raw + '」')
      continue
    }
    const name = match[1]
    const power = match[2] !== undefined ? Number(match[2]) : 1
    const dim = dimensions[name]
    if (!dim) {
      problems.push('未知量「' + name + '」——请先定义它的量纲')
      continue
    }
    const scale = sign * power
    const keys: Array<keyof Dimension> = ['L', 'M', 'T', 'Theta', 'I', 'N', 'J']
    for (const key of keys) {
      const base = dim[key] ?? 0
      if (base === 0) continue
      result[key] = (result[key] ?? 0) + base * scale
    }
  }

  for (const key of Object.keys(result) as Array<keyof Dimension>) {
    if (result[key] === 0) delete result[key]
  }

  let ok = problems.length === 0
  if (expected !== undefined && !sameDimension(result, expected)) {
    ok = false
    problems.push('结果量纲 ' + dimensionText(result) + ' 与期望 ' + dimensionText(expected) + ' 不一致')
  }

  return { ok: ok, resultDimension: result, expectedDimension: expected, problems: problems }
}

/**
 * 把自创常数合并成可注入表达式的值字典。
 *
 * author 类型直接取值；derived 类型按依赖多轮求解（最多 5 轮）。
 *
 * @param customs - 自创常数列表
 * @param base - 基础值（常数表标准值）
 * @returns 合并后的值与错误列表
 */
export function resolveCustomConstants(
  customs: CustomConstant[],
  base: Record<string, number>,
): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = { ...base }
  const errors: string[] = []

  const derivedOnes = customs.filter(function (item) { return item.origin === 'derived' })
  const authorOnes = customs.filter(function (item) { return item.origin === 'author' })

  for (const item of authorOnes) {
    if (Number.isFinite(item.value)) values[item.name] = item.value
    else errors.push(item.name + ': 值不是有限数')
  }

  for (let round = 0; round < 5 && derivedOnes.length > 0; round += 1) {
    let progressed = false
    for (const item of derivedOnes.slice()) {
      const deps = item.dependsOn || []
      const ready = deps.every(function (dep) { return typeof values[dep] === 'number' })
      if (!ready) continue
      try {
        const evaluate = createSafeEvaluator(values)
        const computed = evaluate(item.derive || '')
        derivedOnes.splice(derivedOnes.indexOf(item), 1)
        if (Number.isFinite(computed)) {
          values[item.name] = computed
          progressed = true
        } else {
          errors.push(item.name + ': derive 结果不是有限数')
        }
      } catch (error) {
        derivedOnes.splice(derivedOnes.indexOf(item), 1)
        errors.push(item.name + ': derive 求值失败 —— ' + (error as Error).message)
      }
    }
    if (!progressed) break
  }

  for (const item of derivedOnes) {
    errors.push(item.name + ': 依赖未满足（' + (item.dependsOn || []).join(', ') + '）')
  }

  return { values: values, errors: errors }
}

/**
 * 安全求值器：只允许数字、已知量名、+ - * / ^ 与括号。
 *
 * 不用 mathjs，避免依赖膨胀与注入风险。
 *
 * @param values - 变量字典
 * @returns 求值函数
 */
export function createSafeEvaluator(values: Record<string, number>): (expression: string) => number {
  return function evaluate(expression: string): number {
    if (/[^0-9A-Za-z_+\-*/^().\s]/.test(expression)) {
      throw new Error('表达式含不允许的字符')
    }
    // ⚠️ 科学计数法必须整体替换成普通小数再扫描标识符，
    // 否则 `1e-8` 里的 e 会被当成变量名（曾报「未知量 e」/「未知量 EXP」）。
    // 替换后 `1e-8` 变成 `0.00000001`，标识符正则就看不到了。
    const guarded = expression.replace(/([0-9.]+)[eE]([+-]?[0-9]+)/g, function (_all: string, mantissa: string, exp: string) {
      const value = Number(mantissa + 'e' + exp)
      if (!Number.isFinite(value)) return mantissa
      // ⚠️ 不能用 String(value)：String(1e-8) 仍然是 '1e-8'，e 还在。
      // 必须用 toFixed 展开成纯小数，标识符扫描才看不到 e。
      if (value !== 0 && Math.abs(value) < 1e-6) return value.toFixed(20)
      if (Math.abs(value) >= 1e21) return value.toFixed(0)
      return String(value)
    })
    const identifiers = guarded.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []
    for (const id of identifiers) {
      if (typeof values[id] !== 'number') throw new Error('未知量 ' + id)
    }
    const js = guarded.replace(/\^/g, '**')
    const names = Object.keys(values)
    const args = names.map(function (name) { return values[name] })
    const fn = new Function(...names, 'return (' + js + ')') as (...xs: number[]) => number
    return fn(...args)
  }
}

/**
 * 常见物理量的量纲（供量纲检查当基准）。
 *
 * 只列推演里最常出现的那些；自创量由用户自己声明。
 */
export const BASE_DIMENSIONS: Record<string, Dimension> = {
  // 基本量
  length: { L: 1 },
  mass: { M: 1 },
  time: { T: 1 },
  temperature: { Theta: 1 },
  current: { I: 1 },
  amount: { N: 1 },
  luminous: { J: 1 },
  // 力学
  velocity: { L: 1, T: -1 },
  acceleration: { L: 1, T: -2 },
  force: { M: 1, L: 1, T: -2 },
  energy: { M: 1, L: 2, T: -2 },
  power: { M: 1, L: 2, T: -3 },
  pressure: { M: 1, L: -1, T: -2 },
  density: { M: 1, L: -3 },
  momentum: { M: 1, L: 1, T: -1 },
  // 热 / 电磁
  entropy: { M: 1, L: 2, T: -2, Theta: -1 },
  charge: { I: 1, T: 1 },
  voltage: { M: 1, L: 2, T: -3, I: -1 },
  resistance: { M: 1, L: 2, T: -3, I: -2 },
  // 天体 / 化学
  frequency: { T: -1 },
  area: { L: 2 },
  volume: { L: 3 },
  molarMass: { M: 1, N: -1 },
  specificHeat: { L: 2, T: -2, Theta: -1 },
  // 常数表里的常见符号（便于检查引用它们的公式）
  c: { L: 1, T: -1 },
  G: { L: 3, M: -1, T: -2 },
  h: { M: 1, L: 2, T: -1 },
  kB: { M: 1, L: 2, T: -2, Theta: -1 },
  e_charge: { I: 1, T: 1 },
  me: { M: 1 },
  mp: { M: 1 },
  NA: { N: -1 },
  epsilon0: { M: -1, L: -3, T: 4, I: 2 },
  R: { M: 1, L: 2, T: -2, Theta: -1, N: -1 },
  sigma: { M: 1, T: -3, Theta: -4 },
  bWien: { L: 1, Theta: 1 },
}
