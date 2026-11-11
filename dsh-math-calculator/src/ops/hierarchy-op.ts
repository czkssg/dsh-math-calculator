/**
 * operation="hierarchy" 的实现：编制/层级树。
 *
 * ## 为什么这是推演段最痛的一项
 *
 * 反馈包 `14` 号实测：99层项目**连续 7 轮返工，其中 5 轮是它**。
 *
 * > 层级树要「树状 + 闭合」：每级辖属数、底层基数、总兵力三者必须自洽。
 * > 而 AI 只能一层一层算，每回都漏掉某一级 —— 用户唯一的手段是「感觉不对」。
 *
 * 这个运算形状与单点公式完全不同：
 *
 * ```
 *   单点公式：算一个数（这个窑要多少煤）
 *   表计算：  算一张表（这个编制对不对）      ← 本 operation
 * ```
 *
 * ## 三个数必须自洽
 *
 * ```
 *   levels  层级名（自上而下）   ["师","团","营","连","班"]
 *   tree    每级下辖倍数         [3,3,3,3]   ← 师辖 3 团，团辖 3 营…
 *   base    最底层一个单位人数    10          ← 一个班 10 人
 *   ────────────────────────────────────────────
 *   师满编 = base × ∏tree = 10 × 81 = 810 人
 * ```
 *
 * ## 它回答三类问题
 *
 * ```
 *   ① 给 base          → 正向算出每级人数与总兵力
 *   ② 给 total         → 反解每级应有多少单位（99层返工的地方）
 *   ③ 两个都给         → 校验是否自洽，不自洽时说差额与可能原因
 * ```
 *
 * @module dsh-math-calculator/ops/hierarchy-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * 数字显示。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * `hierarchy`：编制/层级树。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opHierarchy(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).hierarchy
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'hierarchy 需要给一个对象：{ levels, tree, base } 或 { levels, tree, total }',
      '例如：{hierarchy:{levels:["师","团","营","连","班"], tree:[3,3,3,3], base:10}}。' +
        'levels 是层级名（自上而下），tree 是每级下辖倍数（长度 = levels.length − 1），' +
        'base 是最底层一个单位的人数，total 是总兵力。' +
        '给 base 正向算；给 total 反解每级规模；两个都给则校验是否自洽。',
    )
  }

  const obj = raw as Record<string, unknown>
  const levels = Array.isArray(obj.levels) ? obj.levels.map((item) => String(item)) : []
  const tree = Array.isArray(obj.tree) ? obj.tree.map((item) => Number(item)) : []

  if (levels.length < 2) {
    throw new CalcError(
      'invalid_argument',
      'levels 至少要两级，收到 ' + levels.length,
      '例如 ["师","团","营"]。单级不需要编制树。',
    )
  }
  if (tree.length !== levels.length - 1) {
    throw new CalcError(
      'invalid_argument',
      'tree 的长度必须等于 levels.length − 1（' + (levels.length - 1) + '），收到 ' + tree.length,
      '每一级一个下辖倍数。例如 levels 有 5 级，tree 就要 4 个数。',
    )
  }
  for (const item of tree) {
    if (!Number.isFinite(item) || item <= 0) {
      throw new CalcError(
        'invalid_argument',
        'tree 里每个倍数必须是正数，收到 ' + String(item),
        '下辖倍数不能为 0（那意味着这一级没有下属）。',
      )
    }
  }

  const base = typeof obj.base === 'number' && obj.base > 0 ? obj.base : undefined
  const total = typeof obj.total === 'number' && obj.total > 0 ? obj.total : undefined
  if (base === undefined && total === undefined) {
    throw new CalcError(
      'invalid_argument',
      'hierarchy 需要 base（底层基数）或 total（总兵力）之一',
      '给 base 正向算总兵力；给 total 反解每级规模；两个都给则校验自洽。',
    )
  }

  /**
   * `factor[i]` = 一个第 i 级单位里装了几个最底层单位。
   *
   * 自下而上累乘（这是唯一不会算错的方向 —— 自上而下要连除，浮点误差会累积）：
   *
   * ```
   *   班(i=4) = 1
   *   连(i=3) = 1 × tree[3] = 3
   *   营(i=2) = 3 × tree[2] = 9
   *   团(i=1) = 9 × tree[1] = 27
   *   师(i=0) = 27 × tree[0] = 81
   * ```
   */
  const factor: number[] = new Array(levels.length).fill(1)
  for (let i = levels.length - 2; i >= 0; i -= 1) {
    factor[i] = factor[i + 1] * tree[i]
  }
  /** 顶层（第 0 级）一个满编单位里含多少个最底层单位。 */
  const topFactor = factor[0]

  const lines: string[] = []
  lines.push('═══ 编制树 ═══')
  lines.push('')

  const nameWidth = Math.max(6, ...levels.map((name) => name.length)) + 2
  /**
   * ## 列的含义（第一版做错，实测发现三列全是 810）
   *
   * ```
   *   本级单位数   一棵满编树里这一级有几个      师 1、团 3、营 9、连 27、班 81
   *   每单位含人   一个这一级单位总共多少人      师 810、团 270、营 90、连 30、班 10
   *   本级总人     这一级所有单位合起来          永远是 810（因为都在这棵树里）
   * ```
   *
   * 第一版把「本级单位数 × 每单位含人」当成「本级人数」，
   * 那正好等于全员总兵力 —— 五行全是 810，等于这一列没有信息量。
   *
   * 所以去掉那一列，改成更有用的**「每个上级辖几个本级」对照**
   * —— 这正是 99层返工时最容易写错的地方。
   */
  const header =
    '  ' + '层级'.padEnd(nameWidth, ' ') +
    '下辖'.padStart(6, ' ') +
    '本级单位数'.padStart(12, ' ') +
    '每单位含人'.padStart(12, ' ')
  lines.push(header)
  lines.push('  ' + '─'.repeat(nameWidth + 32))

  if (base !== undefined) {
    /**
     * 正向：以 `base` 为最底层一个单位的人数，顶层算 1 个满编单位。
     */
    const fullStrength = topFactor * base
    for (let i = 0; i < levels.length; i += 1) {
      const unitCount = topFactor / factor[i]
      const peoplePerUnit = factor[i] * base
      lines.push(
        '  ' + levels[i].padEnd(nameWidth, ' ') +
        (i < tree.length ? String(tree[i]) : '—').padStart(6, ' ') +
        show(unitCount).padStart(12, ' ') +
        show(peoplePerUnit).padStart(12, ' '),
      )
    }
    lines.push('  ' + '─'.repeat(nameWidth + 32))
    lines.push('  一个满编「' + levels[0] + '」= ' + show(fullStrength) + ' 人' +
      '（' + show(base) + ' × ' + show(topFactor) + '）')

    if (total !== undefined) {
      const ratio = total / fullStrength
      const rounded = Math.round(ratio)
      const closed = Math.abs(ratio - rounded) < 0.01
      lines.push('')
      if (closed) {
        lines.push('  ✓ 与声称总兵力 ' + show(total) + ' 自洽：正好 ' + show(rounded) +
          ' 个满编「' + levels[0] + '」')
      } else {
        lines.push('  ✗ 与声称总兵力 ' + show(total) + ' 对不上：')
        lines.push('    一个满编「' + levels[0] + '」只有 ' + show(fullStrength) + ' 人，' +
          show(total) + ' 人需要 ' + show(ratio) + ' 个（不是整数）')
        lines.push('    若按 ' + show(rounded) + ' 个算，差 ' + show(total - fullStrength * rounded) + ' 人')
        lines.push('')
        lines.push('    ★ 三种可能：')
        lines.push('      ① 某个 tree 倍数写错了')
        lines.push('      ② base 不是「最底层一个单位」的人数（如误填成全员平均）')
        lines.push('      ③ 总兵力是「实有」而树是「满编」—— 两者本来就不该相等')
        lines.push('    反解每级规模请只给 total（不给 base）重调一次。')
      }
    }
  } else if (total !== undefined) {
    /**
     * 反向：给总兵力，反解每级应有多少单位。
     *
     * 这是 99层反复返工的地方：数字对不上时不知道是哪个倍数写错了。
     * 所以逐级报「应有几个」+「一个含多少人」，并把**不是整数的层级标出来**。
     */
    lines.push('  （反解：按 1 个满编「' + levels[0] + '」计）')
    const topFactorTotal = factor[0]
    for (let i = 0; i < levels.length; i += 1) {
      /** 一棵满编树里这一级应有几个单位。 */
      const unitCount = topFactorTotal / factor[i]
      /** 一个这一级单位含多少人。 */
      const peoplePerUnit = total / unitCount
      const integer = Math.abs(unitCount - Math.round(unitCount)) < 1e-6
      lines.push(
        '  ' + levels[i].padEnd(nameWidth, ' ') +
        (i < tree.length ? String(tree[i]) : '—').padStart(6, ' ') +
        (show(unitCount) + (integer ? '' : ' ⚠')).padStart(12, ' ') +
        show(peoplePerUnit).padStart(12, ' '),
      )
    }
    lines.push('')
    lines.push('  总兵力 ' + show(total) + ' 人，按倍数链反解：')
    lines.push('    每级单位数都应是整数（标 ⚠ 的那一级说明倍数与总数不相容）')
    lines.push('    ★ 若最底层的「每单位含人」不是你能接受的数（如一个班 3 人），')
    lines.push('      说明倍数链或总兵力之一需要调 —— 这正是编制表对不上的原因。')
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      levels,
      tree,
      base: base ?? null,
      total: total ?? null,
      /** factor[i] = 一个 i 级单位含几个最底层单位。 */
      factor,
      /** 一个满编顶层单位的人数（给 base 时才算得出）。 */
      fullStrength: base !== undefined ? topFactor * base : null,
      /** 三数是否自洽（两个都给时才判）。 */
      closed:
        base !== undefined && total !== undefined
          ? Math.abs(total / (topFactor * base) - Math.round(total / (topFactor * base))) < 0.01
          : null,
    }),
  }
}
