/**
 * Algebrite 没有官方类型声明，这里补一个最小声明。
 * 只声明我们实际用到的符号方法。
 */
declare module 'algebrite' {
  interface AlgebriteApi {
    derivative(expression: string, variable?: string): { toString(): string }
    integral(expression: string, variable?: string): { toString(): string }
    simplify(expression: string): { toString(): string }
    expand(expression: string): { toString(): string }
    roots(expression: string, variable?: string): { toString(): string }
    eval(expression: string): { toString(): string }
    float(expression: string): { toString(): string }
    factor(expression: string, variable?: string): { toString(): string }
  }
  const algebrite: AlgebriteApi
  export default algebrite
  export = algebrite
}
