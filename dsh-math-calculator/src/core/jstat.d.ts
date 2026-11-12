/**
 * jstat 没有官方类型声明，这里补一个最小声明。
 *
 * ## 为什么手写而不装 `@types/jstat`
 *
 * 理由与 `algebrite.d.ts` 相同：**只声明我们实际用到的符号**。
 * 装一个社区 `@types` 会增加一个 devDependency，而它声明几百个方法，
 * 我们一个都不用 —— 更糟的是，那些声明可能与运行时不符（这个包常见）。
 *
 * ## 只声明 CDF 家族
 *
 * 本项目的用途是**判定**（这个值落在分布的哪一侧、p 值多大），
 * 所以只需要 CDF。PMF/PDF 我们自己算（二项系数要精确整数，不能走浮点）。
 *
 * 注意：`jstat` 是 UMD 包，导出的是**一个函数对象**（不是 `{ normal: ... }`），
 * 所以默认导入后直接 `.normal.cdf(...)`。
 */
declare module 'jstat' {
  interface Distribution {
    /** 累积分布函数。 */
    cdf(x: number, ...params: number[]): number
    /** 概率密度/质量函数（本项目未用，留作扩展）。 */
    pdf?(x: number, ...params: number[]): number
    /** 分位数。 */
    inv?(p: number, ...params: number[]): number
  }

  interface JStat {
    /** 正态分布：`normal.cdf(z, mean, sd)`。 */
    normal: Distribution
    /** 二项分布：`binomial.cdf(k, n, p)`。 */
    binomial: Distribution
    /** 泊松分布：`poisson.cdf(k, lambda)`。 */
    poisson: Distribution
    /** 指数分布：`exponential.cdf(x, rate)`。 */
    exponential: Distribution
    /** 卡方分布：`chisquare.cdf(x, df)`。 */
    chisquare: Distribution
    /** Student-t 分布：`studentt.cdf(t, df)`。 */
    studentt: Distribution
    /** 百分位（返回**数组**，取 [0] 才是数值）。 */
    percentile(data: number[], k: number): number[] | number
  }

  const jstat: JStat
  export default jstat
}
