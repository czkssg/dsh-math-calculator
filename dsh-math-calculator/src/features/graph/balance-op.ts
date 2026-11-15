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

/**
 * 单位族：收支盘点必须同族才能比（T7-N1/N2）。
 *
 * 旧实现把 `m³` 与 `kW` 一起算覆盖率、把「光年」当水量接受——
 * 数字看着正常，结论完全错。这里按单位族拦截，不猜换算。
 */
const UNIT_FAMILY: Record<string, 'mass' | 'volume' | 'energy' | 'area' | 'power' | 'currency' | 'info'> = {
  kg: 'mass', 克: 'mass', g: 'mass', 吨: 'mass', t: 'mass', 斤: 'mass', 石: 'mass', 万斤: 'mass', 磅: 'mass',
  m3: 'volume', 'm³': 'volume', L: 'volume', 升: 'volume', 加仑: 'volume', 斗: 'volume',
  J: 'energy', kJ: 'energy', MJ: 'energy', GJ: 'energy', kWh: 'energy', 卡: 'energy', 大卡: 'energy',
  m2: 'area', 'm²': 'area', 亩: 'area', 公顷: 'area', km2: 'area', 'km²': 'area',
  W: 'power', kW: 'power', MW: 'power', GW: 'power', 马力: 'power',
  元: 'currency', 两: 'currency', 贯: 'currency', 银元: 'currency', 金币: 'currency', 铜钱: 'currency', 钱: 'currency',
  bit: 'info', B: 'info', KB: 'info', MB: 'info', GB: 'info', TB: 'info',
}

/** 各收支项的推荐单位族（BALANCE_ITEMS 的已知项）。 */
const ITEM_FAMILY: Record<string, 'mass' | 'volume' | 'energy' | 'area' | 'power' | 'currency' | 'info'> = {
  grain: 'mass', water: 'volume', energy: 'energy', land: 'area', fiscal: 'currency', military: 'currency', info: 'info',
}

/** 单位 → 族。 */
function familyOf(unit: string): string | null {
  /**
   * 速率/复合单位归一（反馈 G3/H3/I1：`吨/年`、`m^3/年`、`kWh/年`）：
   * 去掉 ^ 与上标、按分子判族（kg/年、m³/日 都只看分子）。
   */
  const normalized = unit.trim().replace(/^\//, '').replace(/\^/g, '').replace(/³/g, '3').replace(/²/g, '2').split('/')[0]
  if (UNIT_FAMILY[normalized] !== undefined) return UNIT_FAMILY[normalized]
  /** 带前缀：万斤、千吨之类取尾部。 */
  for (const [name, family] of Object.entries(UNIT_FAMILY)) {
    if (normalized.endsWith(name)) return family
  }
  return null
}

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

  /**
   * 量纲/单位族校验（T7-N1/N2）。
   *
   * 1. 每项单位必须能归到族；2. 所有项必须同族；
   * 3. 已知项（grain/water/…）的单位族必须与推荐一致（光年不是水量）。
   */
  const families = new Map<string, string>()
  for (const [key, item] of Object.entries(inputs)) {
    if (item.unit === undefined) continue
    const family = familyOf(item.unit)
    if (family === null) {
      throw new CalcError(
        'invalid_argument',
        '收支项「' + key + '」的单位「' + item.unit + '」认不出量纲族',
        '可用：质量（kg/吨/斤）、体积（m³/L/加仑）、能量（J/kWh）、面积（m²/亩）、功率（W/kW）、货币（元/两）、信息（bit/GB）。',
      )
    }
    families.set(key, family)
    const expected = ITEM_FAMILY[key]
    if (expected !== undefined && expected !== family) {
      throw new CalcError(
        'invalid_argument',
        '收支项「' + key + '」是' + (expected === 'mass' ? '质量' : expected === 'volume' ? '体积' : expected === 'energy' ? '能量' : expected === 'area' ? '面积' : expected === 'power' ? '功率' : expected === 'currency' ? '货币' : '信息') + '类，单位却是「' + item.unit + '」',
        '例如 ' + key + ' 用 kg 或 吨（不是光年/米这类长度单位）。',
      )
    }
  }
  /**
   * 跨量纲：不再硬拒（反馈 G3 的三项盘点：粮=质量、水=体积、能=能量）。
   *
   * 每一项各自算覆盖率；「最短板」按**覆盖率**（无量纲比率）比较，
   * 不会拿 kg 与 kWh 直接比大小。
   */
  const distinct = new Set(families.values())
  const crossDimension = distinct.size > 1

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
  if (crossDimension) {
    lines.push('【跨量纲提示】')
    lines.push('  ' + [...families.entries()].map(([key, family]) => key + '=' + family).join('、') + '：不同量纲的项各自盘点；最短板按覆盖率（比率）比较，不是拿绝对量直接比。', '')
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
