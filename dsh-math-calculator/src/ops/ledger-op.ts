/**
 * operation="ledger" 的实现：台账闭合检查。
 *
 * ## 它解决什么
 *
 * 反馈包统计：282 条设定硬伤里 **48% 是账本问题** ——
 * 占比合计不等于 100、分项之和与总数对不上、某项明显是 10 倍笔误。
 *
 * 而工具此前**零覆盖**：只能手工拼 `evaluate` 算式，再靠人眼看差额。
 *
 * ```jsonc
 * // 现状：用户这么做
 * { "expressions": [
 *     { "label": "分项和", "expr": "120+80+50" },   // 250
 *     { "label": "总量",   "expr": "300" },          // 300
 *     { "label": "差额",   "expr": "120+80+50-300" } // -50  ← 然后人眼看
 * ] }
 * ```
 *
 * 工具给了**原材料**，没给**判断**。而用户要的是：
 * 「差 -50、最可疑的是 80、没有 10 倍笔误、账本不闭合」。
 *
 * ## 与 balance 的分工
 *
 * ```
 *   balance  需求 vs 供给（这个国家养不养得起这支军队）
 *   ledger   分项 vs 总量（这个占比表合不合得上）
 * ```
 *
 * `ledger` 是**两段共用**的（反馈包 14 号的关键发现）：
 * 推演段用它分配比（士农工商合计要 100%），对账段用它查闭合（99.011%）。
 *
 * @module dsh-math-calculator/ops/ledger-op
 */

import { toJsonValue } from '../format.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/** 一个分项。 */
interface LedgerPart {
  /** 分项名。 */
  name: string
  /** 分项值（与 total 同单位）。 */
  value: number
}

/** 闭合检查的结论。 */
interface ClosureReport {
  /** 分项之和。 */
  sum: number
  /** 声称的总量（没给就是 100，用于百分比场景）。 */
  total: number
  /** 差额 = sum - total。 */
  diff: number
  /** 相对差额 = diff / total。 */
  relative: number
  /** 是否闭合（相对差额在容差内）。 */
  closed: boolean
  /** 容差（相对值）。 */
  tolerance: number
  /** 最可疑的分项（可能有笔误的那个）。 */
  suspicious: Array<{ name: string; value: number; reason: string }>
}

/**
 * 数字显示：大数用指数，其余保留 6 位有效数字。
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
 * 找出最可疑的分项。
 *
 * ## 判据（从真实硬伤里归纳）
 *
 * 设定里账本对不上，最常见的原因是两类笔误：
 *
 * 1. **10 倍/100 倍笔误** —— 某项与差额恰好构成 10 或 100 的倍数
 * 2. **整数异常** —— 其他都是带小数的实测值，它是干净的整数
 *
 * 这两条不是猜测，而是「差额能被该项解释」的**定量判据**：
 * 若把该项调整 10 倍后差额变小，它就是最可能的错处。
 *
 * @param parts - 全部分项
 * @param diff - 当前差额
 * @returns 可疑项列表（按可疑度降序，最多 3 条）
 */
function findSuspicious(parts: LedgerPart[], diff: number): ClosureReport['suspicious'] {
  if (diff === 0) return []
  const out: Array<{ name: string; value: number; reason: string }> = []
  const absDiff = Math.abs(diff)

  for (const part of parts) {
    if (part.value === 0) continue
    /** 判据一：把该项按 10 的幂调整后，差额是否明显变小。 */
    for (const factor of [10, 100, 0.1, 0.01]) {
      const adjusted = part.value * factor
      const newDiff = Math.abs(diff + (adjusted - part.value))
      if (newDiff < absDiff / 10) {
        out.push({
          name: part.name,
          value: part.value,
          reason: '若「' + part.name + '」是 ' + show(adjusted) + '（当前 ' + show(part.value) +
            '，差 ' + factor + ' 倍），账本就能对上 —— 疑似量级笔误',
        })
        break
      }
    }
  }

  /** 判据二：差额恰好等于某个分项 —— 常见的「漏了一项」或「重复计入」。 */
  for (const part of parts) {
    if (part.value === 0) continue
    /** 差额 = -该项 → 分项之和比总量少了这么多，可能漏了一项同值分项。 */
    if (Math.abs(diff + part.value) < absDiff / 100) {
      out.push({
        name: part.name,
        value: part.value,
        reason: '差额 ' + show(-diff) + ' 恰好等于「' + part.name + '」的值 —— ' +
          '可能漏了一项同值分项，或这一项被重复扣减',
      })
    }
    /** 差额 = +该项 → 多算了这一项，可能重复计入。 */
    if (Math.abs(diff - part.value) < absDiff / 100) {
      out.push({
        name: part.name,
        value: part.value,
        reason: '差额 ' + show(diff) + ' 恰好等于「' + part.name + '」的值 —— ' +
          '这一项可能被重复计入',
      })
    }
  }

  /** 判据三：整数项在非整数项中可疑（只在前面都没命中时给，避免噪音）。 */
  if (out.length === 0) {
    const fractional = parts.filter((part) => !Number.isInteger(part.value))
    if (fractional.length >= 2) {
      const integers = parts.filter((part) => Number.isInteger(part.value) && part.value !== 0)
      for (const part of integers) {
        out.push({
          name: part.name,
          value: part.value,
          reason: '其余分项都带小数，只有「' + part.name + '」是整数 ' + show(part.value) +
            ' —— 整数可能是估算值，也可能是漏了小数位',
        })
      }
    }
  }

  return out.slice(0, 3)
}

/**
 * `ledger`：台账闭合检查。
 *
 * @param args - 工具参数（`ledger` 对象或 `parts` + `total` 简写）
 * @returns 结果文本与结构化值
 */
export function opLedger(args: MathArgs): Outcome {
  const raw = (args as unknown as Record<string, unknown>).ledger

  let parts: LedgerPart[] = []
  let total: number | undefined
  let unit: string | undefined
  let tolerance = 0.001

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    /**
     * 支持两种形态：
     *
     * ```
     *   { ledger: { parts: [{name, value}], total: 300 } }   ← 显式
     *   { ledger: { 士: 1, 农: 85, 工: 10, 商: 4 } }         ← 简写
     * ```
     *
     * 简写形态是推演段最常用的（「士农工商占比」），先验它，
     * 因为 `parts` 也是合法键名，不能当成分项。
     */
    const explicitParts = obj.parts
    if (Array.isArray(explicitParts)) {
      for (const item of explicitParts) {
        if (!item || typeof item !== 'object') continue
        const one = item as Record<string, unknown>
        const name = typeof one.name === 'string' ? one.name : ''
        const value = typeof one.value === 'number' ? one.value : Number(one.value)
        if (name === '' || !Number.isFinite(value)) continue
        parts.push({ name, value })
      }
      if (typeof obj.total === 'number') total = obj.total
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'total' || key === 'unit' || key === 'tolerance') continue
        const num = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(num)) continue
        parts.push({ name: key, value: num })
      }
      if (typeof obj.total === 'number') total = obj.total
    }
    if (typeof obj.unit === 'string') unit = obj.unit
    if (typeof obj.tolerance === 'number') tolerance = obj.tolerance
  }

  if (parts.length === 0) {
    throw new CalcError(
      'invalid_argument',
      'ledger 没有可检查的分项',
      '两种写法：' +
        '① 占比简写 {ledger:{士:1, 农:85, 工:10, 商:4}}（默认总数 100）；' +
        '② 显式 {ledger:{parts:[{name:"甲",value:120},{name:"乙",value:80}], total:300}}。' +
        '它检查「分项之和 vs 总量」是否闭合，并指出最可疑的分项。',
    )
  }

  /** 没给 total 就是百分比场景：总数默认 100。 */
  const target = total ?? 100
  const sum = parts.reduce((acc, part) => acc + part.value, 0)
  const diff = sum - target
  const relative = target === 0 ? Number.POSITIVE_INFINITY : diff / target
  const closed = Math.abs(relative) <= tolerance
  const suspicious = closed ? [] : findSuspicious(parts, diff)

  const lines: string[] = []
  lines.push('═══ 台账闭合检查 ═══')
  lines.push('')

  /** 分项表。占比场景额外标出每一项的实际占比，便于横向对照。 */
  lines.push('  分项               数值       占比')
  for (const part of parts) {
    const share = target === 0 ? 0 : (part.value / target) * 100
    lines.push(
      '  ' + part.name.padEnd(16, ' ') +
      show(part.value).padStart(10, ' ') +
      (share.toFixed(2) + '%').padStart(10, ' '),
    )
  }
  lines.push('  ' + '─'.repeat(38))
  lines.push(
    '  ' + '合计'.padEnd(16, ' ') + show(sum).padStart(10, ' ') +
    (((target === 0 ? 0 : (sum / target) * 100)).toFixed(2) + '%').padStart(10, ' '),
  )
  lines.push('  ' + '声称总量'.padEnd(14, ' ') + show(target).padStart(10, ' ') + '       100.00%')
  lines.push('')

  if (closed) {
    lines.push('✓ 闭合：分项之和与总量差 ' + show(diff) + '（' + (relative * 100).toFixed(3) +
      '%），在容差 ' + (tolerance * 100).toFixed(2) + '% 内。')
  } else {
    lines.push('✗ 不闭合：分项之和 ' + show(sum) + '，声称总量 ' + show(target) + '，' +
      '差 ' + show(diff) + '（' + (relative * 100).toFixed(2) + '%）。')
    lines.push('')
    if (suspicious.length > 0) {
      lines.push('  最可疑的分项：')
      for (const item of suspicious) {
        lines.push('   · ' + item.reason)
      }
    } else {
      lines.push('  没有单一分项能解释这个差额 —— 可能是漏了一项，或总量写错了。')
    }
    lines.push('')
    lines.push('  提示：差额本身是确定的（' + show(diff) + '），不确定的是「该改哪一项」。')
    lines.push('  工具只给可疑度排序，最终判断交给作者 —— 哪个数是原文给的，只有你知道。')
  }

  if (unit) lines.push('')
  if (unit) lines.push('  单位：' + unit)

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      sum,
      total: target,
      diff,
      relative,
      closed,
      tolerance,
      suspicious,
      unit: unit ?? null,
      parts,
    }),
  }
}
