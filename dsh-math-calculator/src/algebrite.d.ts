/**
 * Algebrite 的最小类型声明。
 *
 * ## 为什么手写而不装 `@types/algebrite`
 *
 * 理由与 `jstat.d.ts` 相同：**只声明实际用到的符号**。
 * 装社区 `@types` 会多一个依赖，而它声明几十个方法我们一个不用。
 *
 * ## 2026-11-13 补充：`run` / `nroots` / `defint` / `eigenval`
 *
 * 上一版只声明了 derivative/integral/simplify/expand/roots，
 * 于是 `A.run(...)` / `A.nroots(...)` / `A.defint(...)` 编译报
 * 「Property does not exist」。
 *
 * 而这些正是本批改用的关键 API（用库的现成实现替代手写）。
 */
declare module 'algebrite' {
  interface AlgebriteResult {
    toString(): string
  }

  interface AlgebriteApi {
    /** 求导。 */
    derivative(expression: string, variable?: string): AlgebriteResult
    /** 积分（不定）。 */
    integral(expression: string, variable?: string): AlgebriteResult
    /** 定积分（下限、上限）。 */
    defint(expression: string, variable: string, from: number, to: number): AlgebriteResult
    /** 化简。 */
    simplify(expression: string): AlgebriteResult
    /** 展开。 */
    expand(expression: string): AlgebriteResult
    /** 因式分解。 */
    factor(expression: string, variable?: string): AlgebriteResult
    /** 求根（精确，返回 `[r1,r2,...]` 或单值）。 */
    roots(expression: string, variable?: string): AlgebriteResult
    /** 数值求根（含复根）。 */
    nroots(expression: string, variable?: string): AlgebriteResult
    /** 求值。 */
    eval(expression: string): AlgebriteResult
    /** 转浮点。 */
    float(expression: string): AlgebriteResult
    /** 系数提取。 */
    coeff(expression: string, variable?: string, degree?: number): AlgebriteResult
    /** 泰勒展开。 */
    taylor(expression: string, variable?: string, order?: number): AlgebriteResult
    /**
     * ## 通用执行入口
     *
     * 线代（`det` / `inv` / `rank` / `eigenval`）只能通过 `run` 用字符串调用 ——
     * 它们的函数形式（`A.det`）不接受 JS 数组（实测报
     * `unknown argument type [ [ 1, 2 ], [ 3, 4 ] ]`）。
     *
     * ```
     *   A.run('det([[1,2],[3,4]])')     → -2
     *   A.run('inv([[1,2],[3,4]])')     → [[-2,1],[3/2,-1/2]]
     * ```
     */
    run(expression: string): AlgebriteResult
  }

  const algebrite: AlgebriteApi
  export default algebrite
  export = algebrite
}
