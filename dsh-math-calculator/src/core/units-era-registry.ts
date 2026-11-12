/**
 * 带时代的单位注册：把 `尺@汉` 这类名字注册进 mathjs。
 *
 * ## 命名约定
 *
 * ```
 *   cnchi_h      汉尺        ← 单位名_时代首字母
 *   cnchi_t      唐尺
 *   cnchi_q      清营造尺
 * ```
 *
 * 为什么用这种名字：`createUnit` 只允许字母数字（实测过，
 * `cn_li` 会被拒），所以不能用 `cnchi@汉`。
 *
 * ## 同时提供中文查询入口
 *
 * 光有 `cnchi_h` 还不够 —— 用户会直接问「汉代一尺多少厘米」。
 * 所以这里还给一个 `ERA_ALIAS` 表，把「汉尺」「唐大尺」这类写法
 * 映射到注册名。
 */

import type { MathJsInstance } from 'mathjs'
import { CHINESE_ERA_UNITS, type Era, type EraVariant } from './units-era.js'

/** 时代的短代码（用于单位名后缀）。 */
const ERA_CODE: Record<string, string> = {
  商: 'shang', 周: 'zhou', 秦汉: 'qinhan', 汉: 'han', 三国: 'sanguo',
  晋: 'jin', 南北朝: 'nanbei', 隋: 'sui', 唐: 'tang', 宋: 'song',
  元: 'yuan', 明: 'ming', 清: 'qing', 民国: 'minguo', 现代: 'modern',
}

/**
 * 变体名的拼音代码（`createUnit` 只允许字母数字，中文变体名必须转）。
 *
 * 只收实际出现的那些，不做完整拼音表 —— 多收反而容易错。
 */
const VARIANT_CODE: Record<string, string> = {
  通用尺: 'Tongyong', 量地尺: 'Liangdi', 营造尺: 'Yingzao',
  裁衣尺: 'Caiyi', 布帛尺: 'Bubo', 大尺: 'Da', 小尺: 'Xiao',
  '小尺（黍尺）': 'Xiaoshu', 市尺: 'Shi', 市里: 'Shili', 市斤: 'Shijin',
}

/**
 * 变体的优先级（数字小的优先），用于决定「无变体写法」落到哪把尺。
 *
 * ## 判据：日常用途优先
 *
 * 一个朝代可能有多把尺，**不能简单取第一个注册的**：
 *
 * ```
 *   唐   大尺（日常）   小尺（调律）
 *   宋   营造尺（建筑） 布帛尺（量布）
 *   明   营造尺 / 裁衣尺 / 量地尺
 * ```
 *
 * 「唐朝的尺」该给大尺，「宋朝的尺」该给营造尺。
 * 「小尺（黍尺）」是调律专用，绝不该当默认。
 */
const VARIANT_PRIORITY = ['营造尺', '通用尺', '大尺', '量地尺', '裁衣尺', '布帛尺']

/**
 * 变体优先级打分。
 *
 * @param variant - 变体名
 * @returns 排名（越小越优先；无变体给 0）
 */
function variantRank(variant?: string): number {
  if (variant === undefined) return 0
  const clean = variant.replace(/（[^）]*）/g, '').trim()
  const index = VARIANT_PRIORITY.indexOf(clean)
  return index < 0 ? 99 : index
}

/** 量纲 → mathjs 基准单位。 */
const BASE: Record<string, string> = {
  length: 'm',
  mass: 'kg',
  volume: 'm3',
  area: 'm2',
  time: 's',
}

/**
 * ## ⚠ 注册表必须挂在 `globalThis` 上
 *
 * 这不是风格问题，是**实测抓到的 bug**：
 *
 * ```
 *   require('./lib/core/units-era-registry.js').ERA_UNIT_INDEX.size  →  0
 *   require('./lib/core/engine.js') 之后同一表达式                    →  72
 *   import 拿到的又是另一个实例                                        →  72（但它自己那份）
 * ```
 *
 * 根因：同一个 `.js` 文件被 **CJS `require` 与 ESM `import` 各加载一次**，
 * 于是模块顶层的 `new Map()` 有两个互不相干的实例。
 *
 * 后果很隐蔽：`buildEngine()` 往 A 那份里写，调用方从 B 那份里读，
 * 读到空表 —— 表现为「注册了但查不到」。
 *
 * 解法：把状态挂在 `globalThis` 上，无论加载几次都是同一个对象。
 */
interface EraRegistry {
  /** 生成的注册名 → 变体。 */
  index: Map<string, { unit: string; variant: EraVariant }>
  /** 中文写法 → 注册名。 */
  alias: Map<string, string>
  /** `@default@` 键 → 优先级排名（小的优先）。 */
  defaultRank?: Map<string, number>
}

const GLOBAL_KEY = '__dshMathEraUnitRegistry__'

function getRegistry(): EraRegistry {
  const holder = globalThis as unknown as Record<string, EraRegistry | undefined>
  const existing = holder[GLOBAL_KEY]
  if (existing !== undefined) return existing
  const created: EraRegistry = { index: new Map(), alias: new Map(), defaultRank: new Map() }
  holder[GLOBAL_KEY] = created
  return created
}

/** 生成的注册名 → 变体（供查询与显示还原）。 */
export const ERA_UNIT_INDEX = getRegistry().index

/** 中文写法 → 注册名。 */
export const ERA_ALIAS = getRegistry().alias

/** `@default@` 键 → 优先级排名。 */
export const ERA_DEFAULT_RANK = getRegistry().defaultRank as Map<string, number>

/**
 * 注册全部带时代的单位。
 *
 * ## 变体的命名去重
 *
 * 同一个朝代可能有多把尺（唐有大尺小尺、明有营造/裁衣/量地）。
 * 所以注册名要拼上变体特征：
 *
 * ```
 *   cnera_chi_han             汉尺（无变体）
 *   cnera_chi_tang_dachi      唐大尺
 *   cnera_chi_tang_xiaochi    唐小尺
 * ```
 *
 * @param math - mathjs 实例
 * @returns 成功注册的条数
 */
export function registerEraUnits(math: MathJsInstance): number {
  let ok = 0
  for (const unit of CHINESE_ERA_UNITS) {
    for (const variant of unit.variants) {
      const eraCode = ERA_CODE[variant.era]
      if (eraCode === undefined) continue
      /** 变体代码：中文变体名转拼音缩写不现实，改用序号保证唯一。 */
      /**
       * 变体标签：用拼音而不是字符码。
       *
       * 第一版用「前两个字的 charCode 转 36 进制」，生成 `cneraChiHanssvh80`
       * 这种乱码 —— 能跑但没法读。改成拼音后是 `cneraChiHanLiangdi`。
       */
      const variantTag = variant.variant !== undefined
        ? (VARIANT_CODE[variant.variant] ?? [...variant.variant].slice(0, 2).map((c) => c.charCodeAt(0).toString(36)).join(''))
        : ''
      /**
       * ## 单位名不能带下划线（实测）
       *
       * `createUnit` 只允许**字母数字**，`cnera_chi_han` 会报
       * `Invalid unit name (only alphanumeric characters are allowed)`。
       * 所以改用驼峰：`cneraChiHan`。
       *
       * 变体标识用「变体名的字符码转 36 进制」，保证唯一且纯字母数字。
       */
      const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
      const name = 'cnera' + cap(unit.name === '尺' ? 'chi' : unit.name === '里' ? 'li' : unit.name === '丈' ? 'zhang'
        : unit.name === '步' ? 'bu' : unit.name === '升' ? 'sheng' : unit.name === '斗' ? 'dou'
        : unit.name === '石' ? 'dan' : unit.name === '斤' ? 'jin' : unit.name === '两' ? 'liang'
        : 'x' + unit.name.charCodeAt(0).toString(36)) + cap(eraCode) + variantTag
      const base = BASE[unit.dimension]
      const definition = variant.factor + ' ' + base
      try {
        math.createUnit(name, definition)
        ERA_UNIT_INDEX.set(name, { unit: unit.name, variant })
        /**
         * 中文别名要按「有没有变体」分两种，否则会生成「秦汉通用尺尺」这种叠字。
         *
         * ```
         *   有变体：  时代 + 变体 + 单位    →  唐大尺 / 明营造尺
         *                       ↳ 变体名已含单位时不再拼（营造尺 → 唐营造尺 而不是 唐营造尺尺）
         *   无变体：  时代 + 单位           →  汉尺 / 商尺
         * ```
         *
         * 另外**去掉小括号内容**（`小尺（黍尺）` → `小尺`），否则别名不可能被匹配到。
         */
        const cleanVariant = variant.variant?.replace(/（[^）]*）/g, '').trim()
        const variantHasUnit = cleanVariant?.endsWith(unit.name) === true
        const cjkAlias = cleanVariant !== undefined
          ? variant.era + cleanVariant + (variantHasUnit ? '' : unit.name)
          : variant.era + unit.name
        ERA_ALIAS.set(cjkAlias, name)
        /**
         * 「汉朝的尺」比「汉朝尺」多一个「的」字 —— 中文里这种写法很自然，
         * 而别名匹配是整词比较，所以必须**两种都登记**。
         *
         * ⚠ 这里**不能直接 set**：多个变体会抢同一个无变体别名，
         * 后注册的会覆盖先注册的（实测：宋的「宋朝尺」被布帛尺覆盖，
         * 于是「宋朝的尺」算出 27.2 而不是营造尺的 31.2）。
         * 所以走与 `@default@` 相同的优先级比较。
         */
        const cjkPriorityKey = '@rank@' + variant.era + '朝' + unit.name
        const cjkName = variant.era + '朝' + unit.name
        const cjkNoDe = variant.era + '朝的' + unit.name
        const cjkRank = variantRank(variant.variant)
        if ((ERA_DEFAULT_RANK.get(cjkPriorityKey) ?? 99) > cjkRank) {
          ERA_ALIAS.set(cjkName, name)
          ERA_ALIAS.set(cjkNoDe, name)
          ERA_DEFAULT_RANK.set(cjkPriorityKey, cjkRank)
        }
        /**
         * 记录「该时代主变体」：无变体查询（如「唐朝的尺」）落到这里。
         *
         * ## 主变体的判据：日常用途优先
         *
         * 一个朝代可能有多把尺，**不能简单取第一个注册的** ——
         * 唐的注册顺序是大尺、小尺，取第一个碰巧对了；
         * 但宋是营造尺、布帛尺，明清是营造尺、裁衣尺、量地尺，
         * 顺序稍变就会选错。
         *
         * 所以显式给优先级：营造尺/通用尺（日常建筑）> 大尺 > 其余。
         * 「小尺（黍尺）」是调律用的，绝不该当默认。
         */
        const eraKey = '@default@' + variant.era + unit.name
        const current = ERA_ALIAS.get(eraKey)
        if (current === undefined) {
          ERA_ALIAS.set(eraKey, name)
          ERA_DEFAULT_RANK.set(eraKey, variantRank(variant.variant))
        } else if (variantRank(variant.variant) < (ERA_DEFAULT_RANK.get(eraKey) ?? 99)) {
          ERA_ALIAS.set(eraKey, name)
          ERA_DEFAULT_RANK.set(eraKey, variantRank(variant.variant))
        }
        ok += 1
      } catch {
        /** 单个失败不影响整体（例如区间变体只注册下界）。 */
      }
    }
  }
  return ok
}

/**
 * 按时代查单位的换算因子（走注册表）。
 *
 * @param unitName - 单位名（如「尺」）
 * @param era - 时代（如「汉」）
 * @param variant - 变体名（可选）
 * @returns 换算因子与说明；找不到返回 null
 */
export function lookupEraFactor(
  unitName: string,
  era: Era,
  variant?: string,
): { name: string; factor: number; source: string; confidence: string } | null {
  const unit = CHINESE_ERA_UNITS.find((u) => u.name === unitName || u.cjk.includes(unitName))
  if (!unit) return null
  const hit = unit.variants.find((v) => v.era === era && (variant === undefined || v.variant === variant))
  if (!hit) return null
  return {
    name: hit.era + (hit.variant ?? '') + unit.name,
    factor: hit.factor,
    source: hit.source,
    confidence: hit.confidence,
  }
}

/**
 * 把一个中文时代写法归一成注册名。
 *
 * 例如 `汉尺` → `cnera_尺_han`。
 *
 * @param text - 中文写法
 * @returns 注册名；认不出返回 null
 */
export function normalizeEraUnit(text: string): string | null {
  const direct = ERA_ALIAS.get(text)
  if (direct !== undefined) return direct
  /**
   * 「汉尺」这种没写变体的写法，落到该时代的**主变体**。
   *
   * 汉代有两把尺（通用尺 23.1 / 量地尺 23.1），主变体是第一个注册的。
   * 这样「汉尺」总能查到东西，而不会因为「没有无变体条目」而落空。
   */
  const def = ERA_ALIAS.get('@default@' + text)
  if (def !== undefined) return def
  /** 再试「朝代 + 变体 + 单位」的几种组合。 */
  for (const [alias, name] of ERA_ALIAS) {
    if (alias.startsWith('@default@')) continue
    if (text.includes(alias) || alias.includes(text)) return name
  }
  return null
}
