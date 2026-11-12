/**
 * mathjs 单位名的已知歧义与修正。
 *
 * ## ★ 最重要的一个：`min` 被拆成 `m × in`
 *
 * 这是实测抓出来的，也是本项目**最容易静默出错**的一处：
 *
 * ```
 *   1 min        →  报错「Unexpected type of argument in function multiply」
 *   1 m * in     →  39.37 in²        ← 原来 min 被解析成「米 × 英寸」！
 *   1 L/min      →  报错
 *   1 L/minute   →  1 L / minute    ✓
 * ```
 *
 * 根因：mathjs 的隐式乘法让 `min` 优先被拆成 `m`·`in`，而不是时间单位 `minute`。
 *
 * **危害**：任何带 `/min` 的单位（流量、转速、心率、产率）都会报错或算成面积。
 * 而「每分钟」在工程与蒸汽朋克描写里是最高频的单位组合之一。
 *
 * ## 还有几个同类歧义
 *
 * ```
 *   in   英寸       → 在某些上下文被当关键字
 *   gal  加仑       → 与「伽利略（加速度单位）」同名
 *   T    特斯拉/万亿 → 上下文相关
 * ```
 *
 * 但这些都没有 `min` 那么致命，所以只修 `min`，其余记录在此备查。
 *
 * @module dsh-math-calculator/core/unit-ambiguity
 */

/**
 * 需要替换的单位名（短名 → 安全全名）。
 *
 * **顺序无关**，因为都是整词替换（前后不接字母数字）。
 */
const SAFE_REPLACEMENTS: Array<[RegExp, string, string]> = [
  /**
   * `min` → `minute`。
   *
   * 判据：前后不能紧接字母（避免把 `minimum` 里的 `min` 也换掉），
   * 但**可以紧接数字或空格或斜杠**（`5min`、`5 min`、`L/min` 都要换）。
   */
  [/(?<![A-Za-z])min(?![A-Za-z])/g, 'minute', 'min 被拆成 m×in（米×英寸）'],
  /**
   * `mins` → `minutes`（复数）。
   */
  [/(?<![A-Za-z])mins(?![A-Za-z])/g, 'minutes', 'mins 同上'],
  /**
   * `sec` → `second`。
   *
   * `sec` 在 mathjs 里是合法的（secondary 的缩写冲突较少），
   * 但三角函数 `sec()` 会与它冲突，显式写全名更安全。
   */
  [/(?<![A-Za-z])sec(?![A-Za-z(])/g, 'second', 'sec 与三角函数 sec() 冲突'],
  /**
   * `ha` → `hectare`。
   *
   * mathjs 内置的是 `hectare`，不认 `ha` 这个缩写。
   * 而中文场景里「公顷」几乎总被写成 `ha`。
   */
  [/(?<![A-Za-z])ha(?![A-Za-z])/g, 'hectare', 'ha 是公顷的常用缩写，mathjs 只认 hectare'],
]

/**
 * 修正单位名歧义。
 *
 * @param source - 原始表达式
 * @returns 修正后的表达式
 */
export function fixUnitAmbiguity(source: string): string {
  let out = source
  for (const [pattern, replacement] of SAFE_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * 记录本模块处理过的歧义（供诊断与文档用）。
 *
 * @returns 歧义清单
 */
export function knownAmbiguities(): Array<{ from: string; to: string; why: string }> {
  return SAFE_REPLACEMENTS.map(([, to, why]) => ({
    from: to === 'minute' ? 'min' : to === 'minutes' ? 'mins' : 'sec',
    to,
    why,
  }))
}
