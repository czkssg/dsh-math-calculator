/**
 * 默认指向修正：把裸名重新绑定到国际标准。
 *
 * ## 为什么需要这一步
 *
 * mathjs 内置的英制单位**全是美制值**：
 *
 * ```
 *   mathjs 内置： 1 gallon = 3.785 L    （美制）
 *                 1 pint   = 473.2 mL   （美制）
 *                 1 ton    = 907 kg     （美制短吨）
 * ```
 *
 * 而本项目新注册的英制单位是**国际/英制值**：
 *
 * ```
 *   我们注册：     gallonimp = 4.546 L
 *                  pintbr    = 568.3 mL
 * ```
 *
 * 于是裸名（`gallon`）落在 mathjs 内置的美制上 —— 与「英制单位用国标」
 * 这条规则**相反**。
 *
 * ## 修法：`override` 重定义裸名
 *
 * mathjs 的 `createUnit(name, def, { override: true })` 可以重定义内置单位。
 * 这样裸名指向国际标准，而美制变体保留具名形式（`gallonus`）。
 *
 * ## ⚠ 一个必须保留的例外
 *
 * 石油桶（`bbl` / `oilbarrel`）**固定美制** —— 那是行业定义，
 * 不是「选哪套变体」的问题。42 美制加仑 = 158.987 L，全球统一。
 *
 * @module dsh-math-calculator/core/units-default-rebind
 */

import type { MathJsInstance } from 'mathjs'

/**
 * 要重新绑定的裸名 → 国际标准的定义。
 *
 * 每一项都必须与 `units-default-policy.ts` 里的决定一致。
 */
interface Rebind {
  /** 裸名（mathjs 内置的那个）。 */
  name: string
  /** 新的定义（国际标准值）。 */
  definition: string
  /** 为什么改。 */
  why: string
}

/**
 * ## 重绑定表
 *
 * 数值全部取 1959 国际码磅协定 / GB 3100 采用值。
 */
export const REBINDS: Rebind[] = [
  // ── 液量：改用英制（Imperial）──
  {
    name: 'gallon',
    definition: '4.54609 L',
    why: 'mathjs 内置是美制 3.785 L；改用国际（英制）4.54609 L。美制写 gallonus',
  },
  {
    name: 'pint',
    definition: '0.56826125 L',
    why: 'mathjs 内置是美制 473.2 mL；改用英制 568.3 mL。美制写 pintus',
  },
  {
    name: 'quart',
    definition: '1.1365225 L',
    why: 'mathjs 内置是美制 946.4 mL；改用英制 1.1365 L。美制写 quartus',
  },
  {
    name: 'fluidounce',
    definition: '28.4130625 mL',
    why: 'mathjs 内置是美制 29.574 mL；改用英制 28.413 mL。美制写 fluidounceus',
  },
  {
    name: 'gill',
    definition: '142.0653125 mL',
    why: 'mathjs 内置是美制 118.3 mL；改用英制 142.07 mL。美制写 gillus',
  },
  // ── 质量：`ton` 保持公制（老表已定义），`cwt` 改用长担 ──
  {
    name: 'cwt',
    definition: '50.80234544 kg',
    why: 'mathjs 内置 hundredweight 是短担 45.36 kg；改用长担 50.80 kg。短担写 cwtshort',
  },
  /**
   * ## ★ `ton` 的默认必须是公制吨，不是英制吨
   *
   * 这一条最要紧：中文语境里「一吨」**默认就是 1000 kg**。
   *
   * ```
   *   mathjs 内置 ton = 907.18 kg（美制短吨）
   *   我们改为 1000 kg（公制）
   * ```
   *
   * 若保留 907，「产量 300 万吨」会被算成 272 万吨 —— **差 10% 而不报错**。
   *
   * 英制吨保留具名：`长吨`(1016) / `短吨`(907)。
   */
  {
    name: 'ton',
    definition: '1000 kg',
    why: '★ mathjs 内置是美制短吨 907.18 kg；改为公制吨 1000 kg（中文「吨」的默认含义）。长吨写「长吨」、短吨写「短吨」',
  },
  // ── 长度：`ft`/`inch` 已是国际值，但显式确认 ──
  /**
   * ## ★ `bbl` 必须指向石油桶，不是啤酒桶
   *
   * mathjs 内置的 `bbl` 是 **beerbarrel（啤酒桶）= 117.35 L**，
   * 而工业界写 `bbl` 几乎总是指**石油桶 = 42 美制加仑 = 158.99 L**。
   *
   * ```
   *   实测：1 bbl to L → 117.35 L     ← 啤酒桶，与预期不符
   *   应为：1 bbl to L → 158.99 L     ← 石油桶（行业定义）
   * ```
   *
   * 这是「行业固定值优先」的一例：`bbl` 在工程语境里没有啤酒桶的含义。
   */
  {
    name: 'bbl',
    definition: '158.987294928 L',
    why: '★ mathjs 内置 bbl 是啤酒桶 117.35 L；改为石油桶 158.99 L（42 美制加仑，行业定义）',
  },
  {
    name: 'ft',
    definition: '0.3048 m',
    why: '显式确认为国际英尺（1959 协定精确定义）',
  },
  {
    name: 'inch',
    definition: '0.0254 m',
    why: '显式确认为国际英寸（1959 协定精确定义）',
  },
]

/**
 * 把裸名重绑定到国际标准。
 *
 * @param math - mathjs 实例
 * @returns 成功重绑定的条数
 */
export function rebindDefaults(math: MathJsInstance): number {
  let count = 0
  for (const rebind of REBINDS) {
    try {
      /**
       * `override: true` 是必需的 —— mathjs 默认拒绝重定义内置单位。
       * 这是官方文档给出的机制（见 `createUnit` 的 options 参数）。
       */
      math.createUnit(rebind.name, { definition: rebind.definition }, { override: true })
      count += 1
    } catch {
      /** 重绑定失败不抛 —— 单个失败不该让引擎挂掉，但下面会有验证。 */
    }
  }
  return count
}

/**
 * 验证重绑定是否生效。
 *
 * @param math - mathjs 实例
 * @returns 每一项的实际值（供测试与诊断）
 */
export function verifyRebinds(math: MathJsInstance): Array<{ name: string; value: number; ok: boolean }> {
  const EXPECT: Array<[string, string, number]> = [
    ['gallon', 'L', 4.54609],
    ['pint', 'L', 0.56826125],
    ['quart', 'L', 1.1365225],
    ['fluidounce', 'mL', 28.4130625],
    ['gill', 'mL', 142.0653125],
    ['cwt', 'kg', 50.80234544],
    ['ton', 'kg', 1000],
    ['bbl', 'L', 158.987294928],
    ['ft', 'm', 0.3048],
    ['inch', 'm', 0.0254],
  ]
  const out: Array<{ name: string; value: number; ok: boolean }> = []
  for (const [name, unit, want] of EXPECT) {
    try {
      const value = math.evaluate('1 ' + name + ' to ' + unit)
      const n = Number(String(value).split(' ')[0])
      out.push({ name, value: n, ok: Math.abs(n - want) / want < 1e-9 })
    } catch {
      out.push({ name, value: Number.NaN, ok: false })
    }
  }
  return out
}
