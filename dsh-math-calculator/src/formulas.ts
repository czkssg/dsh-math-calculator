/**
 * 公式求值器。
 *
 * 核心约定（对应「公式只是快捷方式」的需求）：
 * 1. 任何参数都能被覆盖 —— 架空世界把 g 改成 15 没问题。
 * 2. 允许**临时覆盖公式本身** —— 传一段改写过的表达式即可，
 *    不用改插件源码、不用重装。
 * 3. 缺参数时明确报缺哪个，而不是给个 0 糊弄过去。
 * 4. 太复杂就退回去用基础运算：本模块只是方便，不是唯一路径。
 *
 * @module dsh-math-calculator/formulas
 */

import {
  CONSTANTS,
  FORMULAS as BASE_FORMULAS,
  FORMULA_INDEX as BASE_INDEX,
  type FormulaDef,
} from './formula-library.js'
import { EXT_FORMULAS } from './formula-library-ext.js'
import { PERCEPTION_FORMULAS } from './formula-library-perception.js'
import { STORY_FORMULAS } from './formula-library-story.js'
import { getActiveConstants } from './constants-graph.js'
import { loadGlobalFormulas } from './formula-pack.js'

/**
 * 全部公式 = 主批次 + 扩展批次 + 感知层批次。
 * 分批组织而不是单文件拼接，避免 formula-library.ts 无限膨胀。
 */
export const FORMULAS: FormulaDef[] = [
  ...BASE_FORMULAS,
  ...EXT_FORMULAS,
  ...PERCEPTION_FORMULAS,
  ...STORY_FORMULAS,
]

/** id 索引（后批次覆盖同名 id 时以后者为准，便于后续修订）。 */
export const FORMULA_INDEX: Map<string, FormulaDef> = new Map()
for (const formula of BASE_INDEX.values()) FORMULA_INDEX.set(formula.id, formula)
for (const formula of EXT_FORMULAS) FORMULA_INDEX.set(formula.id, formula)
for (const formula of PERCEPTION_FORMULAS) FORMULA_INDEX.set(formula.id, formula)
for (const formula of STORY_FORMULAS) FORMULA_INDEX.set(formula.id, formula)

/**
 * 把全局公式包并入内置公式（幂等：已存在的 id 跳过）。
 *
 * 为什么在模块加载时就合并：formula / formulas / impact / formula-table
 * 全都从 FORMULAS 读，晚合并会让不同入口看到不同的公式集。
 *
 * @returns 本次新增的数量。
 */
export function mergePackedFormulas(): number {
  let added = 0
  try {
    for (const packed of loadGlobalFormulas()) {
      if (FORMULA_INDEX.has(packed.id)) continue
      FORMULAS.push(packed)
      FORMULA_INDEX.set(packed.id, packed)
      added += 1
    }
  } catch {
    /* 包文件损坏时不让内置公式也跟着挂掉 */
  }
  return added
}

mergePackedFormulas()

export { CONSTANTS, type FormulaDef }

/** 调用方传入的参数覆盖。值可以是数字、数字字符串，或数组表达式。 */
export type Overrides = Record<string, number | string | number[]>

/** 公式层错误。 */
export class FormulaError extends Error {
  readonly type: string
  readonly details?: string[]
  constructor(type: string, message: string, details?: string[]) {
    super(message)
    this.name = 'FormulaError'
    this.type = type
    this.details = details
  }
}

/** 把字符串转成数字，失败返回 undefined。 */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value.trim())
    return Number.isFinite(numeric) ? numeric : undefined
  }
  return undefined
}

/** 判断参数是否被声明为「数组型」（desc 里含「数组」或默认值是数组）。 */
function isArrayParam(desc: string): boolean {
  return desc.includes('数组') || desc.includes('array')
}

/**
 * 解析公式的参数：默认值 → 常量表 → 调用方覆盖。
 *
 * 优先级：调用方 overrides > 公式自带默认值。
 * 数组型参数（如熵的 p、HHI 的 s）允许传数组或数组表达式字符串，
 * 原样交给 mathjs 求值，不做数字转换。
 */
export function resolveParams(
  formula: FormulaDef,
  overrides: Overrides,
  extraConstants: Record<string, number | string> = {},
): { values: Record<string, unknown>; overridden: string[]; missing: string[] } {
  const values: Record<string, unknown> = {}
  const overridden: string[] = []
  const missing: string[] = []
  // 当前生效的世界常数（由 operation=constants 设定）
  const active = getActiveConstants()

  for (const [name, spec] of Object.entries(formula.params)) {
    const arrayLike = isArrayParam(spec.desc)

    // 1. 调用方显式覆盖（最高优先级）
    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      const raw = overrides[name]
      if (arrayLike) {
        values[name] = raw
      } else {
        const numeric = toNumber(raw)
        if (numeric === undefined) {
          throw new FormulaError('invalid_argument', `参数 "${name}" 不是有效数字: ${String(raw)}`)
        }
        values[name] = numeric
      }
      overridden.push(name)
      continue
    }

    // 2. 世界常数覆盖（operation=constants 设定的值）—— 必须优先于公式默认值！
    // 否则改了 c 之后，公式里写死的默认 c 会把新值盖回去，
    // "牵一发动全身"就失效了。
    if (Object.prototype.hasOwnProperty.call(active, name)) {
      values[name] = active[name]
      continue
    }

    // 3. 额外常量
    if (Object.prototype.hasOwnProperty.call(extraConstants, name)) {
      const numeric = toNumber(extraConstants[name])
      if (numeric !== undefined) {
        values[name] = numeric
        continue
      }
    }

    // 4. 公式自带默认值
    if (spec.value !== null) {
      values[name] = spec.value
      continue
    }

    // 5. 必填但没给
    missing.push(name)
  }

  return { values, overridden, missing }
}

/**
 * 把参数表拼成 mathjs 可用的 scope。
 *
 * 踩过的坑（务必保留这段注释）：
 * 1. **不能直接塞 JS number**。`9.8` 在 JS 里可能是 `9.806650000000001` 这类
 *    超过 15 位有效数字的浮点，mathjs 会抛
 *    "Cannot implicitly convert a number with >15 significant digits"。
 * 2. **也不能塞普通字符串**。实测 `{ g: '9.8' }` 下 `m * g` 会被当成
 *    字符串运算，得到 `980.0000000000001` 这种浮点污染值，
 *    再与字面量相乘就直接报错。
 * 3. **唯一正确做法**是转成 mathjs 的 BigNumber 对象（`bignumber(...)`），
 *    这样 `9.8 * 1.3` 走的是十进制精确乘法。
 */
export function buildFormulaScope(engine: any, values: Record<string, unknown>): Record<string, any> {
  const scope: Record<string, any> = {}
  // 合并顺序：静态 CONSTANTS → 当前生效的覆盖层（改过常数的世界）
  // 这样 operation=constants 改过的 c/sigma/... 会真正流入公式计算，
  // 而不只是"推演展示"。
  const overrides = getActiveConstants()
  for (const [name, value] of Object.entries(CONSTANTS)) {
    scope[name] = engine.bignumber(String(overrides[name] ?? value))
  }
  // 覆盖层里可能有 CONSTANTS 未收录的派生量
  for (const [name, value] of Object.entries(overrides)) {
    if (scope[name] === undefined) scope[name] = engine.bignumber(String(value))
  }
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      // 数组参数：转成 BigNumber 数组，保持精度
      scope[name] = value.map((item) => engine.bignumber(String(item)))
    } else if (typeof value === 'number') {
      scope[name] = engine.bignumber(String(value))
    } else if (typeof value === 'string') {
      // 可能是数组表达式字符串，如 "[0.5,0.5]"，交给 mathjs 解析
      try {
        scope[name] = engine.evaluate(value.startsWith('[') ? value : String(value), {})
      } catch {
        scope[name] = engine.bignumber(value)
      }
    } else {
      scope[name] = value
    }
  }
  return scope
}

/**
 * 查找公式。支持 id 精确匹配、名称子串、关键词、分类。
 * 返回按相关度排序的候选。
 *
 * 排序优先级：id 精确 > 关键词精确 > id 子串 > 名称精确 > 名称子串 > 描述 > 分类。
 * 注意：分类命中给的分要低，否则搜「重力」会把整个 physics/gravity
 * 分类的公式都挤到最前面，把真正相关的 gravitation 埋掉。
 */
export function findFormulas(query: string, limit = 10): FormulaDef[] {
  const text = query.trim().toLowerCase()
  if (text === '') return []

  const scored: Array<{ formula: FormulaDef; score: number }> = []
  for (const formula of FORMULAS) {
    let score = 0
    const id = formula.id.toLowerCase()

    if (id === text) score += 5000
    else if (id.includes(text)) score += 800

    for (const key of formula.keys ?? []) {
      const lowered = key.toLowerCase()
      if (lowered === text) score += 2000
      else if (lowered.includes(text)) score += 400
    }

    if (formula.name === query) score += 3000
    else if (formula.name.includes(query)) score += 700
    else if (formula.name.toLowerCase().includes(text)) score += 350

    if (formula.desc.toLowerCase().includes(text)) score += 80
    if (formula.cat.toLowerCase().includes(text)) score += 20

    if (score > 0) scored.push({ formula, score })
  }

  return scored
    .sort((left, right) => right.score - left.score || left.formula.id.localeCompare(right.formula.id))
    .slice(0, limit)
    .map((entry) => entry.formula)
}

// ── 读者视角频次 ──
//
// 270 条是「检索式广度」，但故事里真正高频的是另一批：
// 材料会不会断、船多快、风多冷、露点多少、箭射多远、人一天要多少水。
// 这里按分类给出默认频次，单条公式可以用 frequency 字段覆盖。

/** 故事里高频出现的分类。 */
const HIGH_FREQ_CATEGORIES = new Set([
  // perception/* 这一批本来就是按「读者能感知」写的
  'perception/weather',
  'perception/senses',
  'perception/travel',
  'perception/agriculture',
  'perception/architecture',
  'perception/climate',
  'perception/celestial',
  'perception/horizon',
  'perception/technology',
  // 材料/结构：读者最常问「会不会断」
  'materials/structures',
  // 战斗与重力：故事高频
  'military/combat',
  'physics/gravity',
])

/** 几乎不会在故事里用到的分类。 */
const LOW_FREQ_CATEGORIES = new Set([
  'physics/quantum',
  'physics/nuclear',
  'physics/relativity',
  'econ/finance',
  'econ/macro',
  'econ/io',
  'econ/utility',
  'social/information',
  'social/inequality',
])

/** 某条公式的读者视角频次。 */
export function formulaFrequency(formula: FormulaDef): 'high' | 'medium' | 'low' {
  if (formula.frequency) return formula.frequency
  if (HIGH_FREQ_CATEGORIES.has(formula.cat)) return 'high'
  if (LOW_FREQ_CATEGORIES.has(formula.cat)) return 'low'
  return 'medium'
}

/** 按频次筛选公式。 */
export function listFormulasByFrequency(level: 'high' | 'medium' | 'low'): FormulaDef[] {
  return FORMULAS.filter((formula) => formulaFrequency(formula) === level)
}

/** 按分类列出公式。 */
export function listFormulaCategories(): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>()
  for (const formula of FORMULAS) {
    counts.set(formula.cat, (counts.get(formula.cat) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => left.category.localeCompare(right.category))
}

/**
 * 把「用户临时改写」的表达式套到公式上。
 *
 * 场景：架空世界要改公式结构而不只是改系数，
 * 例如把 `m * g` 改成 `m * g * 1.3`（该世界重力异常）。
 * 这种直接走 operation="evaluate" 即可，本函数用于
 * 「保留了公式参数名但换了表达式」的场景。
 */
export function resolveExpression(formula: FormulaDef, customExpression?: string): string {
  if (typeof customExpression === 'string' && customExpression.trim() !== '') {
    return customExpression.trim()
  }
  return formula.expr
}

/** 把求值结果格式化成可读文本（含参数回显）。 */
export function describeFormula(
  formula: FormulaDef,
  expression: string,
  values: Record<string, unknown>,
  overridden: string[],
): string {
  const paramLines = Object.entries(formula.params).map(([name, spec]) => {
    const raw = values[name]
    const value = Array.isArray(raw) ? `[${raw.join(', ')}]` : String(raw)
    const mark = overridden.includes(name) ? ' *' : ''
    return `${name} = ${value}${mark}  (${spec.desc})`
  })
  const lines = [
    `${formula.name}  [${formula.cat}]`,
    `表达式: ${expression}`,
    ...paramLines,
  ]
  if (overridden.length > 0) {
    lines.push(`* 表示本次调用覆盖了默认值: ${overridden.join(', ')}`)
  }
  if (formula.unit) lines.push(`单位: ${formula.unit}`)
  return lines.join('\n')
}
