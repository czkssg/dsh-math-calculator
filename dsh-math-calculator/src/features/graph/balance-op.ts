/**
 * `balance`：收支盘点与最短板。
 *
 * 与 feasibility 的分工：feasibility 判「某一项超没超上限」，
 * balance 判「几项一起看能不能跑得动」。前者回答「楼能建多高」，
 * 后者回答「这个国家养不养得起这支军队」。
 *
 * @module dsh-math-calculator/features/graph/balance-op
 */

import { CalcError } from '../../core/errors.js'
import { BALANCE_ITEMS, checkBalance } from './balance.js'

/** 结果。 */
export interface BalanceOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-3)) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/**
 * 执行 balance。
 *
 * @param raw - 收支项 { 键名: {demand,supply,unit?} }
 * @returns 盘点结果
 * @throws {CalcError} 形态错误
 */
export function runBalance(raw: unknown): BalanceOutcome {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError(
      'invalid_argument',
      'balance 需要给一个对象：{ 键名: { demand, supply, unit? } }',
      '例如 {grain:{demand:2.7e6,supply:3.1e6,unit:"kg/年"}, army:{demand:3e7,supply:3e8}}。',
    )
  }
  const inputs: Record<string, { demand: number; supply: number; unit?: string }> = {}
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CalcError('invalid_argument', '收支项「' + key + '」必须是 { demand, supply } 对象', '例如 grain:{demand:2.7e6,supply:3.1e6}。')
    }
    const row = item as Record<string, unknown>
    const demand = Number(row['demand'])
    const supply = Number(row['supply'])
    if (!Number.isFinite(demand) || !Number.isFinite(supply)) {
      throw new CalcError('invalid_argument', '收支项「' + key + '」的 demand / supply 必须是数字', '收到 demand=' + JSON.stringify(row['demand']) + '，supply=' + JSON.stringify(row['supply']))
    }
    if (demand < 0 || supply < 0) {
      throw new CalcError('invalid_argument', '收支项「' + key + '」的 demand / supply 不能为负', '缺口用「demand > supply」表达，不要写负数。')
    }
    inputs[key] = { demand, supply, ...(typeof row['unit'] === 'string' ? { unit: row['unit'] } : {}) }
  }

  const report = checkBalance(inputs)
  const lines: string[] = ['══════ 收支盘点 ══════', '']
  if (report.checks.length === 0) {
    lines.push('  没有可检查的项。')
    return { result: lines.join('\n'), value: { checks: [], verdict: report.verdict } }
  }

  lines.push('  项目              需求              供给            覆盖    状态')
  for (const check of report.checks) {
    const mark = check.status === 'short' ? '✗ 不够' : check.status === 'tight' ? '△ 紧' : '✓ 充裕'
    lines.push('  ' + check.label.padEnd(14) + (show(check.demand) + ' ' + check.unit).padStart(18) + (show(check.supply) + ' ' + check.unit).padStart(18) + (Number.isFinite(check.coverage) ? (check.coverage * 100).toFixed(0) + '%' : '—').padStart(8) + '   ' + mark)
  }
  lines.push('', '【结论】', '  ' + report.verdict, '')

  if (report.bottleneck) {
    const bottleneck = report.bottleneck
    lines.push('【最短板】')
    lines.push('  · ' + bottleneck.label + '：覆盖 ' + (bottleneck.coverage * 100).toFixed(0) + '%' + (bottleneck.gap > 0 ? '，缺 ' + show(bottleneck.gap) + ' ' + bottleneck.unit : '，不缺'))
    lines.push('  · 想补的话：' + bottleneck.remedy, '')
  }
  if (report.unchecked.length > 0) {
    lines.push('【没检查的项】')
    lines.push('  ' + report.unchecked.join('、'))
    lines.push('  这些项你没给数据，所以不在最短板里——整体结论只覆盖上面查过的项。', '')
  }
  lines.push('【与 feasibility 的分工】')
  lines.push('  · feasibility  判单项生理/工程上限（生物体型、建筑高度、城市人口上限）')
  lines.push('  · balance      判多项社会收支能不能同时跑得动（粮/水/能/财政/军费/信息）')

  return {
    result: lines.join('\n'),
    value: {
      checks: report.checks.map((check) => ({ key: check.key, label: check.label, demand: check.demand, supply: check.supply, coverage: check.coverage, status: check.status, gap: check.gap, unit: check.unit })),
      bottleneck: report.bottleneck ? { key: report.bottleneck.key, label: report.bottleneck.label, coverage: report.bottleneck.coverage, gap: report.bottleneck.gap, unit: report.bottleneck.unit } : null,
      sustainable: report.sustainable,
      verdict: report.verdict,
      unchecked: report.unchecked,
      availableItems: BALANCE_ITEMS.map((item) => item.key),
    },
  }
}
