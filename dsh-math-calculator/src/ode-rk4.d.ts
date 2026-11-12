/**
 * `ode-rk4` 的最小类型声明。
 *
 * ## 为什么手写
 *
 * 该包没有 `.d.ts`（实测 `node_modules/ode-rk4/lib/index.js` 无类型）。
 * 而它只有 4 个属性 + 2 个方法，声明成本极低。
 *
 * ## API 说明（来自 README 实测）
 *
 * ```js
 * const integrator = rk4(y0, deriv, t0, dt)
 * // deriv 的签名是 (dydt, y, t)，注意 **dydt 在前**
 * integrator.step()
 * integrator.steps(n)
 * integrator.y    // 当前状态（数组，就地更新）
 * integrator.t    // 当前时间
 * ```
 *
 * ⚠ 与我第一版手写 RK4 的签名不同（我的 `deriv(vars, t)` 返回一个数，
 * 而库的 `deriv(dydt, y, t)` 就地填充数组）—— 这是最容易接错的地方。
 */
declare module 'ode-rk4' {
  interface Integrator {
    /** 当前状态（就地更新）。 */
    y: number[]
    /** 当前时间。 */
    t: number
    /** 步长。 */
    dt: number
    /** 走一步。 */
    step(): void
    /** 走 n 步。 */
    steps(n: number): void
  }

  /**
   * 建一个 RK4 积分器。
   *
   * @param y0 - 初值数组
   * @param deriv - 导数函数 `(dydt, y, t) => void`，**就地写 dydt**
   * @param t0 - 起始时间
   * @param dt - 步长
   */
  function rk4(
    y0: number[],
    deriv: (dydt: number[], y: number[], t: number) => void,
    t0: number,
    dt: number,
  ): Integrator

  export default rk4
  export = rk4
}
