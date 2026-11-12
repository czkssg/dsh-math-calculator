/**
 * 英制/市制/计数单位注册。
 *
 * ## 为什么需要这一层
 *
 * `units-imperial.ts` 与 `units-cn-market.ts` 只是**数据**，
 * 要让 `1 psi to kPa`、`1 gpm to L/min`、`1 市斤 to g` 能算，
 * 必须把它们注册进 mathjs。
 *
 * ## 三个必须处理的麻烦
 *
 * ```
 *   ① 维度名要映射到 mathjs 的基准单位（flow → m3/s，count → 无单位）
 *   ② 单位名不能带下划线（createUnit 只允许字母数字）
 *   ③ 计数单位（dozen/gross）没有物理量纲，mathjs 会拒绝
 * ```
 *
 * 第三条是最麻烦的：mathjs 的单位体系要求「每个单位属于某个量纲」，
 * 而「打」「罗」只是计数。解法是在**换算层**处理，不注册成 mathjs 单位。
 *
 * @module dsh-math-calculator/core/units-imperial-registry
 */

import type { MathJsInstance } from 'mathjs'
import { IMPERIAL_AND_MISC_UNITS, type UnitEntry } from './units-imperial.js'
import { CN_MARKET_UNITS } from './units-cn-market.js'
import { IMPERIAL_EXT_UNITS } from './units-imperial-ext.js'

/**
 * 维度 → mathjs 基准单位。
 *
 * `flow` 是新维度（体积/时间），mathjs 原生没有，用 `m3/s` 表达。
 * `count` 不是物理量纲，**不注册**（见 `COUNT_FACTORS`）。
 */
const BASE_UNIT: Record<string, string> = {
  length: 'm',
  mass: 'kg',
  volume: 'm3',
  area: 'm2',
  time: 's',
  energy: 'J',
  power: 'W',
  pressure: 'Pa',
  force: 'N',
  speed: 'm/s',
  angle: 'rad',
  temperature: 'K',
  frequency: 'Hz',
  flow: 'm3/s',
  linear_density: 'kg/m',
  dynamic_viscosity: 'Pa*s',
  kinematic_viscosity: 'm2/s',
  ratio: '1',
  inverse_length: '1/m',
}

/**
 * 计数单位的换算因子（**不注册进 mathjs**）。
 *
 * ## 为什么不注册
 *
 * mathjs 要求单位属于某个量纲，而「打」「罗」「令」只是计数：
 *
 * ```
 *   1 打 = 12 个      个是什么量纲？没有。
 * ```
 *
 * 强行注册成「无量纲单位」会让 `1 打 + 3 米` 不报错 —— 那更糟。
 *
 * 所以计数换算走**独立通道**：`countFactor(name)` 给因子，
 * 调用方自己做乘法。这样「1 打 + 3 米」仍会被 mathjs 拦住。
 */
export const COUNT_FACTORS: Map<string, { factor: number; note: string; aliases: string[] }> = new Map()

/** 注册结果统计。 */
export interface RegisterResult {
  /** 成功注册的条数。 */
  registered: number
  /** 注册失败的条数。 */
  failed: number
  /** 计数单位（走独立通道）的条数。 */
  counted: number
  /** 失败的单位名（用于诊断）。 */
  failedNames: string[]
}

/**
 * 把英制/市制单位注册进 mathjs。
 *
 * @param math - mathjs 实例
 * @returns 统计结果
 */
export function registerImperialUnits(math: MathJsInstance): RegisterResult {
  const result: RegisterResult = { registered: 0, failed: 0, counted: 0, failedNames: [] }

  const all: UnitEntry[] = [...IMPERIAL_AND_MISC_UNITS, ...CN_MARKET_UNITS, ...IMPERIAL_EXT_UNITS]

  for (const entry of all) {
    /** 计数单位走独立通道。 */
    if (entry.dimension === 'count') {
      COUNT_FACTORS.set(entry.name, {
        factor: entry.factor,
        note: entry.note ?? '',
        aliases: entry.aliases,
      })
      result.counted += 1
      continue
    }

    const base = BASE_UNIT[entry.dimension]
    if (base === undefined) {
      result.failed += 1
      result.failedNames.push(entry.name + '（未知维度 ' + entry.dimension + '）')
      continue
    }

    /**
     * 单位名清洗：只留字母数字。
     *
     * `createUnit` 拒绝下划线与中文（实测 `cn_li` 报 Invalid unit name）。
     * 而本表里的名字已经是字母（`gpm`/`psi`/`cnchi`），少数带下划线的要洗掉。
     */
    const safeName = entry.name.replace(/[^A-Za-z0-9]/g, '')
    try {
      /**
       * ## 用对象形态 `{ definition }`，不用字符串
       *
       * 实测：字符串形态 `createUnit('gpm', '0.0000630901964 m3/s')` 能创建，
       * 但随后 `1 gpm to L/min` 会报 `Unexpected type of argument`。
       * 对象形态 `{definition: '...'}` 正常（官方文档的写法）。
       *
       * 另外基准单位里的 `min` 必须写成 `minute` —— 见 `unit-ambiguity.ts`。
       */
      math.createUnit(safeName, { definition: entry.factor + ' ' + base })
      result.registered += 1
    } catch {
      /**
       * 已存在同名单位（如 `acre`/`fathom`/`hand` 老表有、本表也有）不重复注册。
       * 这类不算失败 —— 但要在别名上补齐。
       */
      result.failed += 1
      result.failedNames.push(safeName)
    }
  }
  return result
}

/**
 * 查计数单位的换算因子。
 *
 * @param text - 单位名或别名（`打`/`dozen`/`gross`/`罗`）
 * @returns 因子与说明；认不出返回 null
 */
export function countFactor(text: string): { factor: number; note: string } | null {
  const direct = COUNT_FACTORS.get(text)
  if (direct !== undefined) return { factor: direct.factor, note: direct.note }
  for (const [, value] of COUNT_FACTORS) {
    if (value.aliases.includes(text)) return { factor: value.factor, note: value.note }
  }
  return null
}
