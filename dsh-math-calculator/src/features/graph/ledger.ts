/**
 * 台账闭合（`ledger`）。
 *
 * ## 为什么这是对账里最要紧的一项
 *
 * 反馈包的统计：**282 条硬伤里 139 条（48%）是账本闭合问题**。
 *
 * ```
 *   W02  占比合计 99.011%（应 100%）
 *   W13  分项 6300 ≠ 自称 5500
 *   W12  伤亡上限之和 119%（超过 100%）
 * ```
 *
 * ## 这一层做三件事
 *
 * ```
 *   ① 分项之和 vs 声称总量      差多少、差百分比
 *   ② 找出最可疑的分项          量级差 10 倍 / 100 倍的那种（笔误最常见）
 *   ③ 占比清单                  让用户能扫一眼看出哪里不对
 * ```
 *
 * ## ★ 一个关键判断：「哪一个是错的」工具不猜
 *
 * 反馈包的实测教训：四个人工复核者分别指出不同的分项「最可疑」，
 * 而真相是**总量写错了**。所以工具只给数据，判断留给人。
 *
 * @module dsh-math-calculator/features/graph/ledger
 */

import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT } from '../../core/format.js'

/** 一个分项。 */
export interface LedgerPart {
  name: string
  value: number
  /** 备注（如「含殖民地」）。 */
  note?: string
}

/** 台账输入。 */
export interface LedgerInput {
  parts: LedgerPart[]
  /** 声称的总量。 */
  total: number
  /** 允许的相对误差（默认 0.5%，即 0.005）。 */
  tolerance?: number
  /** 单位（仅显示用）。 */
  unit?: string
}

/** 结果。 */
export interface LedgerOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 台账闭合检查。
 *
 * @param input - 输入
 * @returns 结果
 */
export function checkLedger(input: LedgerInput): LedgerOutcome {
  if (!Array.isArray(input.parts) || input.parts.length === 0) {
    throw new CalcError(
      'missing_params',
      'ledger 需要 parts（分项列表）与 total（声称总量），parts 不能为空',
      '例如 {ledger:{parts:[{name:"甲",value:60},{name:"乙",value:40}], total:100}}。',
    )
  }
  if (!Number.isFinite(input.total)) {
    throw new CalcError('invalid_argument', 'total 必须是有限数（收到 ' + String(input.total) + '）', '')
  }

  /** 校验分项。 */
  const parts: LedgerPart[] = []
  for (let i = 0; i < input.parts.length; i += 1) {
    const part = input.parts[i]
    if (typeof part?.name !== 'string' || part.name === '') {
      throw new CalcError('invalid_argument', '第 ' + (i + 1) + ' 个分项缺 name', '每个分项要有名字与数值。')
    }
    const value = Number(part.value)
    if (!Number.isFinite(value)) {
      throw new CalcError(
        'invalid_argument',
        '分项「' + part.name + '」的 value 不是有限数（收到 ' + JSON.stringify(part.value) + '）',
        '',
      )
    }
    parts.push({ name: part.name, value, note: part.note })
  }

  const sum = parts.reduce((s, p) => s + p.value, 0)
  const tolerance = input.tolerance ?? 0.005
  const diff = sum - input.total
  const relativeDiff = input.total === 0 ? (sum === 0 ? 0 : Infinity) : diff / input.total
  const closed = Math.abs(relativeDiff) <= tolerance

  /** 正文。 */
  const lines: string[] = []
  lines.push('═══ 台账闭合检查 ═══')
  lines.push('')
  lines.push('  分项'.padEnd(18) + '数值'.padStart(14) + '占比'.padStart(10))
  for (const part of parts) {
    const share = sum === 0 ? 0 : (part.value / sum) * 100
    lines.push('  ' + part.name.padEnd(18) +
      fmtNumber(part.value, FMT.general).padStart(14) +
      (share.toFixed(2) + '%').padStart(10))
  }
  lines.push('  ' + '─'.repeat(42))
  lines.push('  ' + '合计'.padEnd(18) + fmtNumber(sum, FMT.general).padStart(14) + '    100.00%')
  lines.push('  ' + '声称总量'.padEnd(18) + fmtNumber(input.total, FMT.general).padStart(14) + '    100.00%')
  lines.push('')

  if (closed) {
    lines.push('✓ 闭合：分项之和 ' + fmtNumber(sum, FMT.general) +
      '，声称总量 ' + fmtNumber(input.total, FMT.general) +
      '，差 ' + fmtNumber(diff, FMT.general) +
      '（' + (relativeDiff * 100).toFixed(3) + '%，在容差 ' + (tolerance * 100).toFixed(1) + '% 内）')
  } else {
    lines.push('✗ **不闭合**：分项之和 ' + fmtNumber(sum, FMT.general) +
      '，声称总量 ' + fmtNumber(input.total, FMT.general) +
      '，差 ' + fmtNumber(diff, FMT.general) +
      '（' + (relativeDiff * 100).toFixed(2) + '%）。')
  }

  /**
   * ## 找出「可疑分项」—— 判据是**量级差**
   *
   * 反馈包里的实际案例：
   *
   * ```
   *   W02 贵族占比写 0.01 而应为 1     → 差 100 倍（小数点位错）
   *   W13 某项 630 而应为 6300          → 差 10 倍（少数了一个零）
   * ```
   *
   * 所以判据是：某分项与「按总量应占的份额」相差 10 倍或 100 倍时，
   * **那很可能是笔误**。
   *
   * ⚠ 但工具**不判断哪个是错的** —— 只指出「这个数看着像差了一个数量级」。
   */
  const suspects: Array<{ name: string; value: number; ratio: number; hint: string }> = []
  if (!closed && sum !== 0) {
    /** 若把某个分项当成「应为它的 10 或 100 倍」，能否让总和闭合？ */
    for (const part of parts) {
      for (const factor of [10, 100, 0.1, 0.01]) {
        const adjusted = sum - part.value + part.value * factor
        const newDiff = Math.abs((adjusted - input.total) / (input.total || 1))
        if (newDiff <= tolerance) {
          suspects.push({
            name: part.name,
            value: part.value,
            ratio: factor,
            hint: '它 ×' + factor + ' = ' + fmtNumber(part.value * factor, FMT.general) +
              ' 时总和恰好闭合',
          })
        }
      }
    }
  }

  if (suspects.length > 0) {
    lines.push('')
    lines.push('  可疑分项（**只指出位置，不判断对错**）：')
    for (const s of suspects) {
      lines.push('    · ' + s.name + ' = ' + fmtNumber(s.value, FMT.general) + '　' + s.hint)
    }
    lines.push('')
    lines.push('  ⚠ 工具不猜哪个数是对的 —— 可能是这个分项错了，也可能是总量错了。')
  } else if (!closed) {
    /**
     * 找不到明显的量级笔误时，说明差值是「零散误差」而非笔误。
     */
    lines.push('')
    lines.push('  没有发现量级笔误（试过 ×10/×100/÷10/÷100 都无法闭合）。')
    lines.push('  差异是零散分布的 —— 可能是多个分项都有小误差，或总量本身就不精确。')
  }

  return {
    result: lines.join('\n'),
    value: {
      parts,
      sum,
      total: input.total,
      diff,
      relativeDiff,
      tolerance,
      closed,
      suspects,
    },
    notice: closed ? undefined : '不闭合 —— 但不判断哪一项错了，只指出数值位置。',
  }
}
