/**
 * operation="balance" 的实现：收支盘点与最短板。
 *
 * 用法：
 * ```jsonc
 * { "operation": "balance",
 *   "balance": {
 *     "grain":  { "demand": 2.7e6, "supply": 3.1e6, "unit": "kg/年" },
 *     "army":   { "demand": 3e7,   "supply": 3e8,   "unit": "钱" }
 *   } }
 * ```
 *
 * 与 `feasibility` 的区别：`feasibility` 判「某一项超没超上限」（生理/工程约束），
 * `balance` 判「几项一起看能不能跑得动」（社会收支）。两者互补，
 * 前者回答「这栋楼能建多高」，后者回答「这个国家养不养得起这支军队」。
 *
 * @module dsh-math-calculator/ops/balance-op
 */

import { toJsonValue } from '../format.js'
import { BALANCE_ITEMS, checkBalance } from '../balance.js'
import { CalcError, safeNumberForJson, type MathArgs, type Outcome } from './shared.js'

/**
 * 把一项数字显示成好读的串。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-3)) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * `balance`：收支盘点和最短板判定。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opBalance(args: MathArgs): Outcome {
  const raw = args.balance
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'balance 需要给一个对象：{ 键名: { demand, supply, unit? } }',
      '例如 {grain:{demand:2.7e6,supply:3.1e6,unit:"kg/年"}, army:{demand:3e7,supply:3e8}}。' +
        '可用键名见下方清单；也可以自定键名。',
    )
  }

  const inputs: Record<string, { demand: number; supply: number; unit?: string }> = {}
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CalcError(
        'invalid_argument',
        '收支项「' + key + '」必须是 { demand, supply } 对象',
        '例如 grain:{demand:2.7e6,supply:3.1e6}。',
      )
    }
    const row = item as Record<string, unknown>
    const demand = Number(row.demand)
    const supply = Number(row.supply)
    if (!Number.isFinite(demand) || !Number.isFinite(supply)) {
      throw new CalcError(
        'invalid_argument',
        '收支项「' + key + '」的 demand / supply 必须是数字',
        '收到 demand=' + JSON.stringify(row.demand) + '，supply=' + JSON.stringify(row.supply),
      )
    }
    if (demand < 0 || supply < 0) {
      throw new CalcError(
        'invalid_argument',
        '收支项「' + key + '」的 demand / supply 不能为负',
        '缺口用「demand 大于 supply」表达，不要写负数。',
      )
    }
    inputs[key] = {
      demand: demand,
      supply: supply,
      ...(typeof row.unit === 'string' ? { unit: row.unit } : {}),
    }
  }

  const report = checkBalance(inputs)
  const lines: string[] = []

  lines.push('══════ 收支盘点 ══════')
  lines.push('')

  if (report.checks.length === 0) {
    lines.push('  没有可检查的项。')
    return {
      result: lines.join('\n'),
      value: toJsonValue({ checks: [], verdict: report.verdict } as never),
    }
  }

  lines.push('  项目              需求              供给            覆盖    状态')
  for (const check of report.checks) {
    const mark = check.status === 'short' ? '✗ 不够' : check.status === 'tight' ? '△ 紧' : '✓ 充裕'
    lines.push(
      '  ' + check.label.padEnd(14) +
      (show(check.demand) + ' ' + check.unit).padStart(18) +
      (show(check.supply) + ' ' + check.unit).padStart(18) +
      (Number.isFinite(check.coverage) ? (check.coverage * 100).toFixed(0) + '%' : '—').padStart(8) +
      '   ' + mark,
    )
  }
  lines.push('')

  lines.push('【结论】')
  lines.push('  ' + report.verdict)
  lines.push('')

  const bottleneck = report.bottleneck
  if (bottleneck) {
    lines.push('【最短板】')
    lines.push('  木桶效应：整体能撑多大，取决于最紧的这一项。')
    lines.push('  · ' + bottleneck.label + '：覆盖 ' +
      (bottleneck.coverage * 100).toFixed(0) + '%' +
      (bottleneck.gap > 0 ? '，缺 ' + show(bottleneck.gap) + ' ' + bottleneck.unit : '，不缺'));
    lines.push('  · 想补的话：' + bottleneck.remedy)
    lines.push('')
  }

  if (report.unchecked.length > 0) {
    lines.push('【没检查的项】')
    lines.push('  ' + report.unchecked.join('、'))
    lines.push('  这些项你没给数据，所以不在最短板里——整体结论只覆盖上面查过的项。')
    lines.push('')
  }

  lines.push('【已有单项上限工具的分工】')
  lines.push('  · feasibility  判单项生理/工程上限（生物体型、建筑高度、城市人口上限）')
  lines.push('  · balance      判多项社会收支能不能同时跑得动（粮/水/能/财政/军费/信息）')

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      checks: report.checks.map(function (check) {
        return {
          key: check.key,
          label: check.label,
          demand: safeNumberForJson(check.demand),
          supply: safeNumberForJson(check.supply),
          coverage: Number.isFinite(check.coverage) ? check.coverage : 'inf',
          status: check.status,
          gap: safeNumberForJson(check.gap),
          unit: check.unit,
        }
      }),
      bottleneck: bottleneck
        ? {
            key: bottleneck.key,
            label: bottleneck.label,
            coverage: Number.isFinite(bottleneck.coverage) ? bottleneck.coverage : 'inf',
            gap: safeNumberForJson(bottleneck.gap),
            unit: bottleneck.unit,
          }
        : undefined,
      sustainable: report.sustainable,
      verdict: report.verdict,
      unchecked: report.unchecked,
      availableItems: BALANCE_ITEMS.map(function (item) { return item.key }),
    } as never),
  }
}
