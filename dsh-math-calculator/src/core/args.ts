/**
 * 参数读取（深模块）。
 *
 * ## 为什么需要它
 *
 * `dispatch.ts` 里同一段取值模式重复 **151 次**：
 *
 * ```ts
 * typeof args['planetMass'] === 'number' ? (args['planetMass'] as number) : undefined
 * ```
 *
 * 这是典型的**浅接口**：每个调用点都得知道「怎么判断类型、怎么断言、缺省值写什么」。
 * 加一个 operation 就要再抄一遍，而且抄错的方式千奇百怪（漏 trim、漏 NaN 检查、
 * `??` 与 `||` 混用导致 0 被当缺省）。第 428 行甚至内联了 14 个这样的表达式，2588 字符。
 *
 * ## 设计：小接口 + 深实现
 *
 * 接口只有 4 个方法，每个一行：
 *
 * ```
 * num(args, 'planetMass')       → number | undefined
 * str(args, 'op')               → string | undefined（自动 trim，空串当 undefined）
 * bool(args, 'profile')         → boolean | undefined
 * rec(args, 'edits')            → Record<string, unknown> | undefined
 * ```
 *
 * 藏在实现里的知识：
 * - `num` 拒绝 NaN/Infinity（否则会污染下游计算，且 JSON 序列化变 null）；
 * - `str` 统一 trim 并把空串归一成 undefined（避免 `''` 与 `undefined` 两种空）；
 * - `bool` 只认真正的 boolean，不把字符串 'true' 当真（避免静默误读）；
 * - `rec` 拒绝数组与 null（对应旧 `asRecord` 的语义）。
 *
 * ## 删除测试
 *
 * 删掉它，复杂度会**重新散回 151 个调用点**——所以它值得存在。
 *
 * @module dsh-math-calculator/core/args
 */

/** 参数袋（工具收到的原始参数）。 */
export type ArgBag = Record<string, unknown>

/**
 * 读有限数。
 *
 * @param args - 参数袋
 * @param key - 键名
 * @returns 有限数；缺失/非数/NaN/Infinity 一律 undefined
 */
export function num(args: ArgBag, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 读字符串（自动 trim）。
 *
 * @param args - 参数袋
 * @param key - 键名
 * @returns 去空白后的非空串；缺失/非串/全空白一律 undefined
 */
export function str(args: ArgBag, key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * 读布尔（严格）。
 *
 * @param args - 参数袋
 * @param key - 键名
 * @returns 仅当原值是 boolean 时返回它，否则 undefined
 */
export function bool(args: ArgBag, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * 读对象（拒绝数组与 null）。
 *
 * @param args - 参数袋
 * @param key - 键名
 * @returns 普通对象；缺失/数组/null 一律 undefined
 */
export function rec(args: ArgBag, key: string): Record<string, unknown> | undefined {
  const value = args[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

/**
 * 读字符串数组（逐项转字符串，跳过 null/undefined）。
 *
 * @param args - 参数袋
 * @param key - 键名
 * @returns 字符串数组；缺失/非数组一律 undefined
 */
export function strList(args: ArgBag, key: string): string[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item) => item !== null && item !== undefined).map((item) => String(item))
}