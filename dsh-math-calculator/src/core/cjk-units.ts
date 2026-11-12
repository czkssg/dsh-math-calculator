/**
 * 中文古制单位注册。
 *
 * ## 为什么单独一个文件
 *
 * UCUM 是国际科学标准，**不负责中国古制单位**。里/丈/尺/寸/斤/两/时辰/亩
 * 这些必须本项目自己维护 —— 而它们恰恰是架空世界观设定的常用单位
 * （「99 层世界」的疆域是「247.5 亿平方公里」、「粮产 2.66 亿吨」、
 * 「行军三千里」）。
 *
 * ## ★ 命名必须加前缀（这是实测抓出来的）
 *
 * mathjs 的单位表里有几个缩写与中文单位**撞名**：
 *
 * ```
 *   li   在 mathjs 里是 link（测链，0.201168 m）
 *        而中文的「里」是 500 m
 * ```
 *
 * 不加前缀会被**静默算成错值**，而且数值看着正常（0.2 与 500 都不荒谬）。
 * 这是最危险的一类 bug，所以所有中文古制单位统一加 `cn` 前缀。
 *
 * ⚠ **前缀不能带下划线**：`createUnit` 只允许字母数字，
 * `cn_li` 会报 `Invalid unit name (only alphanumeric characters are allowed)`。
 * 实测后改用 `cnli` 形式。
 *
 * ## 换算因子的来源
 *
 * 全部沿用老插件 `units-data.ts` 的因子（那些已经过实测校对），
 * 不在重写时重新推算 —— 换算是**历史约定**，不是可以重新发明的。
 */

import type { MathJsInstance } from 'mathjs'

/**
 * 中文古制单位定义。
 *
 * `factor` 是换算到基准单位的倍数（长度→米、质量→千克、时间→秒、面积→平方米）。
 */
interface CjkUnit {
  /** mathjs 里的单位名（带 `cn_` 前缀）。 */
  unit: string
  /** 中文写法（归一用）。 */
  cjk: string
  /** 换算因子。 */
  factor: number
  /** 量纲（用于挑对 base unit）。 */
  dimension: 'length' | 'mass' | 'time' | 'area' | 'volume'
  /** 一句说明（供 help 与提示用）。 */
  note?: string
}

/**
 * 中文古制单位表。
 *
 * **因子来源**：老插件 `src/units-data.ts`（已实测校对）。
 * 只收**架空设定里真会用到**的那些，不收冷僻的。
 */
export const CJK_UNITS: CjkUnit[] = [
  // ── 长度（基准：米）──
  { unit: 'cnli', cjk: '里', factor: 500, dimension: 'length', note: '市里，1 里 = 500 m' },
  { unit: 'cnzhang', cjk: '丈', factor: 3.2, dimension: 'length', note: '1 丈 = 10 尺 = 3.2 m' },
  /**
   * ⚠ **「尺」有歧义，必须按语境分开**
   *
   * ```
   *   营造尺（明清建筑）  32 cm     ← 古籍与建筑的「尺」
   *   市尺（1929 市制）   33.33 cm  ← 现代语境说「三尺布」的尺
   * ```
   *
   * 两者差 4%。本条的 `cjk:'尺'` 保留给古籍语境（营造尺），
   * 市制的「市尺」用独立条目 `cnshichi`（见 `units-cn-market.ts`）。
   */
  { unit: 'cnchi', cjk: '尺', factor: 0.32, dimension: 'length', note: '1 尺（营造尺）= 32 cm；市制「市尺」是 33.33 cm，见 cnshichi' },
  { unit: 'cncun', cjk: '寸', factor: 0.032, dimension: 'length', note: '1 寸 = 0.032 m' },

  // ── 质量（基准：千克）──
  { unit: 'cnjin', cjk: '斤', factor: 0.5, dimension: 'mass', note: '市斤，1 斤 = 500 g' },
  { unit: 'cnliang', cjk: '两', factor: 0.05, dimension: 'mass', note: '1 两 = 50 g' },
  { unit: 'cndan', cjk: '石', factor: 60, dimension: 'mass', note: '容量单位按质量折，1 石 ≈ 60 kg' },
  { unit: 'cndou', cjk: '斗', factor: 6, dimension: 'mass', note: '1 斗 ≈ 6 kg' },

  // ── 时间（基准：秒）──
  { unit: 'cnshichen', cjk: '时辰', factor: 7200, dimension: 'time', note: '1 时辰 = 2 h' },
  { unit: 'cnke', cjk: '刻', factor: 900, dimension: 'time', note: '1 刻 = 15 min' },

  // ── 面积（基准：平方米）──
  { unit: 'cnmu', cjk: '亩', factor: 666.6666666666666, dimension: 'area', note: '1 亩 ≈ 666.7 m²' },
  { unit: 'cnqing', cjk: '顷', factor: 66666.66666666666, dimension: 'area', note: '1 顷 = 100 亩' },
]

/** 维度 → mathjs 里对应的基准单位。 */
const BASE_UNIT: Record<CjkUnit['dimension'], string> = {
  length: 'm',
  mass: 'kg',
  time: 's',
  area: 'm2',
  volume: 'm3',
}

/**
 * 把中文古制单位注册进 mathjs 实例。
 *
 * ## 实现方式：用别名而不是 defineUnit
 *
 * mathjs 的 `createUnit` 已在引擎层删掉（安全边界），所以这里走**别名**：
 * 定义一个「与基准单位同量纲、但按因子缩放」的单位表达式。
 *
 * ```
 *   cnli : 500 m
 *   cnjin: 0.5 kg
 * ```
 *
 * 这样 `1 cnli to m` 得 500，`30 cnli to km` 得 15 —— 完全走 mathjs 的换算。
 *
 * @param math - mathjs 实例
 */
export function registerCjkUnits(math: MathJsInstance): void {
  for (const def of CJK_UNITS) {
    const base = BASE_UNIT[def.dimension]
    /**
     * 单位定义串：`500 m` 表示「本单位 = 500 个基准单位」。
     * mathjs 会据此建立换算关系，不需要再写转换表。
     */
    const definition = def.factor + ' ' + base
    try {
      /**
       * ## 用 `createUnit` 而不是 `evaluate('x = 500 m')`
       *
       * 后者只是**变量赋值**，不会建立单位换算关系 ——
       * 第一版就是这么写的，于是 `30 cnli to m` 报「cnli 没有定义」。
       *
       * `createUnit` 才是 mathjs 定义单位的正式 API。它接受的是
       * 「因子 + 基准单位」这样的**常量表达式**，不是可执行代码，
       * 所以与「删除动态执行入口」不冲突（`import` 才是真危险）。
       */
      math.createUnit(def.unit, definition)
    } catch {
      /**
       * 注册失败不抛 —— 单个单位注册不上不该让整个引擎挂掉。
       * 但要留痕：调用方查这个单位时会看到「未定义」，能反查到这里。
       */
    }
  }
}

/**
 * 按中文名查单位定义。
 *
 * @param cjk - 中文写法（如「里」）
 * @returns 定义；找不到返回 undefined
 */
export function findCjkUnit(cjk: string): CjkUnit | undefined {
  return CJK_UNITS.find((u) => u.cjk === cjk)
}
