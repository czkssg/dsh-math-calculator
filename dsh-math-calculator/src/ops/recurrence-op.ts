/**
 * 离散递推（`recurrence`）。
 *
 * ## 为什么需要它，而 `ode` 顶不了
 *
 * `ode` 是**连续时间**积分（RK4）。但设定推演里的模型往往是**离散**的：
 *
 * 年度结算 `P(t+1) = P(t) × 增速`、批次解锁、世代更替，都是逐期跳变的。
 *
 * 两者**不是同一个答案**，实测反馈给了具体数字：
 *
 * ```
 *   离散（每年 ×2）      2^19        = 524,288
 *   连续（dP/dt=0.693P） e^(0.693×19) = 522,824
 *   差 0.28%
 * ```
 *
 * 0.28% 看起来可以忽略，但第 33 年换成本「亿人」时差 0.5 亿 ——
 * **而写作时写的是「第 33 年，四十二亿人」这种具体整数。**
 * 连续模型的 4.24e9 会让你在「42 亿还是 43 亿」上反复纠结，
 * 离散模型直接给出你要抄的那个数。
 *
 * ## 设计：一步式递推 + 多状态
 *
 * 递推式写成「下一期 = f(本期)」。单状态最常见：
 *
 * ```
 *   recurrence="P*2"               initial={P:1}  periods=20
 *   recurrence="P*min(1.2, 1000/P)"               ← 带资源上限的年度增长
 * ```
 *
 * 多状态用逗号分隔的列表，与 ode 写法一致（每个状态各自求一次同一表达式）。
 *
 * @module dsh-math-calculator/ops/recurrence-op
 */

import { toJsonValue } from '../format.js'
import { normalizeSource, fast, CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * 逐年（逐期）迭代，出逐期表与终值。
 *
 * @param args - `recurrence` 递推式、`initial` 初值、`periods` 期数
 * @param precision - 计算精度
 * @returns 逐期表 + 终值
 */
export function opRecurrence(args: MathArgs, precision: number): Outcome {
  const raw = String((args as any).recurrence ?? args.expression ?? '').trim()
  if (raw === '') {
    throw new CalcError(
      'invalid_argument',
      '需要递推式',
      '写成「下一期 = f(本期)」，例如 recurrence="P*2"、"P*min(1.2, 1000/P)"。' +
        '初值用 initial，期数用 periods。',
    )
  }
  const periods = typeof (args as any).periods === 'number' ? Math.round((args as any).periods as number) : 12
  if (!Number.isInteger(periods) || periods < 1) {
    throw new CalcError('invalid_argument', 'periods 必须是正整数', '给要迭代多少期，例如 20。')
  }
  if (periods > 5000) {
    throw new CalcError('invalid_argument', 'periods 上限 5000', '超过这个数请改用 ode（连续模型更快）。')
  }

  const initial = ((args as any).initial ?? {}) as Record<string, number>
  const names = Object.keys(initial)
  if (names.length === 0) {
    throw new CalcError('missing_params', '需要初值', '用 initial 给起点，例如 {"P": 1}。')
  }
  for (const name of names) {
    if (!Number.isFinite(Number(initial[name]))) {
      throw new CalcError('invalid_argument', `初值 ${name} 不是有限数字`, '给一个数，例如 {"P": 1}。')
    }
  }

  /**
   * ## 必须用 Number 引擎，不能用 BigNumber
   *
   * 踩过：`P*min(1.2, 1000/P)` 到第 15 期报
   *
   * ```
   *   Cannot implicitly convert a number with >15 significant digits
   *   to BigNumber (value: 12.83918464548864)
   * ```
   *
   * 根因：`min()` 返回的是 JS number（mathjs 的内建函数不走 BigNumber），
   * 于是 `P * min(...)` 里 number 与 BigNumber 相乘，
   * mathjs 尝试把 12.83918464548864 转成 BigNumber 时因位数超过 15 而失败。
   *
   * 这与 `ode` 当时踩的是同一个坑（那边注释写的是「RK4 中间值天然带 15 位以上小数」）。
   * 递推同理：**中间值本来就是普通浮点**，用 BigNumber 没有意义且必然失败。
   *
   * 而「整数不丢位」这条不变量由 `trimRec` 在**显示层**保证（整数完整输出），
   * 不依赖计算引擎是 BigNumber —— 递推的期数有限，浮点误差不会累积到改变整数部分。
   */
  const engine = fast()
  const source = normalizeSource(raw)
  let node: any
  try {
    node = engine.parse(source)
  } catch (error) {
    throw new CalcError('syntax', `递推式解析失败: ${error instanceof Error ? error.message : String(error)}`, '写成一步运算，如 "P*2"、"P*(1+r)"。')
  }

  /** 逐期推进，每一期都存值（要出年表，不能只留终值）。 */
  const rows: Array<{ period: number; values: Record<string, number> }> = []
  const state: Record<string, any> = {}
  for (const name of names) state[name] = Number(initial[name])
  const snapshot = (period: number): void => {
    const values: Record<string, number> = {}
    for (const name of names) values[name] = Number(state[name])
    rows.push({ period, values });
  };
  snapshot(0)
  let diverged = false
  for (let period = 1; period <= periods; period += 1) {
    try {
      const next: Record<string, any> = {}
      for (const name of names) next[name] = node.evaluate(state)
      for (const name of names) {
        const value = Number(next[name]);
        if (!Number.isFinite(value)) {
          throw new CalcError('non_finite', `第 ${period} 期 ${name} 变成非有限值`, '递推式可能发散了，检查是否存在除法或指数爆炸。')
        }
        state[name] = value;
      }
    } catch (error) {
      if (error instanceof CalcError) throw error;
      throw new CalcError('evaluation', `第 ${period} 期求值失败: ${error instanceof Error ? error.message : String(error)}`, '检查递推式里的符号是否都在 initial 里。')
    }
    snapshot(period);
    for (const name of names) {
      if (Math.abs(Number(state[name])) > 1e300) { diverged = true; break }
    }
    if (diverged) break;
  }
  /** ── 输出 ── */
  const lines: string[] = []
  lines.push(`离散递推 ${periods} 期，状态 ${names.join(', ')}`);
  lines.push(`递推式: ${raw}`);
  if (diverged) lines.push('⚠ 数值爆炸，已提前停止（用 ode 或缩小系数再看）');
  lines.push('');
  const labels: string[] = ['期']
  for (const name of names) labels.push(name);
  const header = labels.map((label, index) => index === 0 ? label.padEnd(6) : label.padStart(18)).join(' ');
  lines.push(header);
  lines.push('-'.repeat(header.length));
  for (const row of rows) {
    const cells: string[] = [String(row.period).padEnd(6)]
    for (const name of names) cells.push(trimRec(row.values[name], precision).padStart(18));
    lines.push(cells.join(' '));
  }
  lines.push('');
  lines.push('终值:');
  for (const name of names) {
    const last = rows[rows.length - 1];
    lines.push(`  ${name}(${last.period}) = ${trimRec(last.values[name], precision)}`);
  }

  /**
   * 与连续模型对照 —— **这是这条 operation 的存在理由**。
   *
   * 实测反馈的核心诉求是「离散与连续答案不同，会露馅」。
   * 所以直接把差额摆出来，让作者一眼看出「用 ode 近似会差多少」。
   */
  const first = rows[0].values;
  const end = rows[rows.length - 1].values;
  const gaps: string[] = [];
  for (const name of names) {
    const startValue = first[name];
    const endValue = end[name];
    if (startValue <= 0 || endValue <= 0) continue;
    const span = rows[rows.length - 1].period;
    if (span <= 0) continue;
    /** 同口径连续解：把「每期比值」取对数后按连续指数展开。 */
    const growth = Math.log(endValue / startValue) / span;
    const continuous = startValue * Math.exp(growth * span);
    const diff = Math.abs(continuous - endValue) / Math.abs(continuous);
    if (diff < 1e-12) continue;
    gaps.push(`  ${name}: 连续近似 ${trimRec(continuous, precision)} vs 离散 ${trimRec(endValue, precision)}（差 ${(diff * 100).toFixed(2)}%）`);
  }
  if (gaps.length > 0) {
    lines.push('');
    lines.push('与连续模型对照（写年表请用离散值，那是你能直接抄的数）:');
    for (const line of gaps) lines.push(line);
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({ periods, states: names, rows }) as any,
  };
}

/**
 * 递推值的显示格式。
 *
 * ## 为什么整数不给小数、大数给完整位
 *
 * 年表里的数会被**直接抄进正文**（「第 5 年 1,756 人」）。
 * 所以：
 *   · 整数 → 完整输出，一位不丢（`10^20` 也不能变成 `1e20`）
 *   · 非整数 → 按 precision 截小数
 *
 * 这与项目「整数永不截断」的硬不变量一致，也和 `formatValue` 的做法同源。
 *
 * @param value - 数值
 * @param precision - 小数位
 * @returns 文本
 */
function trimRec(value: number, precision: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
  const multiplier = Math.pow(10, Math.min(12, Math.max(0, precision)))
  return String(Math.round(value * multiplier) / multiplier);
}