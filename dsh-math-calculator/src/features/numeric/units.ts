/**
 * 单位换算（`units`）。
 *
 * ## 这一层与 `core/` 的分工
 *
 * ```
 *   core/engine.ts        负责「把中文单位归一成可计算的符号」
 *   core/units-*.ts       负责「单位数据与注册」
 *   本文件                 负责「给用户看的换算过程与说明」
 * ```
 *
 * ## 为什么要给「代入过程」
 *
 * 老插件的反馈里有一条：用户不知道换算为什么是这个数。
 * 所以输出三层：
 *
 * ```
 *   结论    1 里 = 0.5 km
 *   代入过程 1 里 = 500 m；1 km = 1000 m；故 0.5 km
 *   注意     里：市里 = 500 m。古代差异极大：周制约 415 m…
 * ```
 *
 * 第三层是**本项目的特色** —— 单位不是常量，古今中外差异巨大。
 *
 * @module dsh-math-calculator/features/numeric/units
 */

import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import { fmtNumber, FMT, trimDecimal, restoreCjkUnitNames, restoreCustomUnitNames } from '../../core/format.js'

/** 换算结果。 */
export interface UnitsOutcome {
  result: string
  value: unknown
  notice?: string
}

/**
 * 单位换算。
 *
 * @param engine - 引擎
 * @param value - 数值（默认 1）
 * @param from - 源单位
 * @param to - 目标单位
 * @param terse - 精简输出
 * @returns 结果
 */
export function convertUnits(
  engine: Engine,
  value: number,
  from: string,
  to: string,
  terse = false,
  displayPrecision = 8,
): UnitsOutcome {
  if (from === '' || to === '') {
    throw new CalcError(
      'missing_params',
      '换算需要同时给 unitFrom 与 unitTo（源单位、目标单位）',
      '例如 {operation:"units", unitFrom:"里", unitTo:"km"}。' +
        '只给 unitFrom 会列出该单位的信息。',
    )
  }
  if (!Number.isFinite(value)) {
    throw new CalcError('invalid_argument', 'unitValue 必须是有限数（收到 ' + String(value) + '）', '')
  }

  /**
   * 走引擎求值，而不是自己乘除 ——
   * 这样中文归一、时代单位、自设单位全部自动生效。
   */
  let converted: unknown
  try {
    converted = engine.evaluate(value + ' ' + from + ' to ' + to)
  } catch (error) {
    throw error
  }

  /**
   * ## 数值部分必须按显示精度截断
   *
   * BigNumber 模式下 `5 cm to inch` 的原始文本是：
   * ```
   *   1.968503937007874015748031496062992125984251968503937007874015748 inch
   * ```
   * —— 63 位小数。而 `displayPrecision` 默认是 8。
   *
   * 老插件踩过同一个坑（「`5 cm to inch` 吐 21 位小数」）。
   *
   * 用正则抓行首数值而不是 `split(' ')` —— 后者在
   * 「数值 单位」之间有多个空格时会取错段。
   */
  const cut = (raw: string): string => {
    const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(\s+.*)?$/i.exec(raw)
    if (m === null) return raw
    const n = Number(m[1])
    if (!Number.isFinite(n)) return raw
    return trimDecimal(n, displayPrecision) + (m[2] ?? '')
  }

  const text = cut(restoreCustomUnitNames(
    restoreCjkUnitNames(String(converted)),
    engine.customUnits,
  ))
  const numeric = Number(String(converted).split(' ')[0])

  if (terse) {
    return {
      result: value + ' ' + from + ' = ' + text,
      value: { value, from, to, result: numeric },
    }
  }

  /** 三层输出。 */
  const lines: string[] = []
  lines.push('══════ 单位换算 ══════')
  lines.push('')
  if (value === 1) lines.push('未给 unitValue，按 1 计算。')
  lines.push('')
  lines.push('  ' + value + ' ' + from + ' = ' + text)
  lines.push('')

  /** 代入过程：两个单位各自与基准的关系。 */
  const steps: string[] = []
  try {
    const fromBase = engine.evaluate('1 ' + from)
    const toBase = engine.evaluate('1 ' + to)
    steps.push('1 ' + from + ' = ' + restoreCjkUnitNames(String(fromBase)))
    steps.push('1 ' + to + ' = ' + restoreCjkUnitNames(String(toBase)))
    steps.push('故结果 = ' + text)
  } catch {
    /** 拿不到基准关系时不硬编过程，只给结论。 */
  }
  if (steps.length > 0) {
    lines.push('【代入过程】')
    for (const step of steps) lines.push('  · ' + step)
    lines.push('')
  }

  /**
   * ## 注意：单位的时代/地域差异
   *
   * 这是本项目的核心价值之一 —— 同一个词在不同时代不同值。
   */
  const warnings: string[] = []
  const ERA_HINTS: Record<string, string> = {
    里: '市里 = 500 m。古代差异极大：周制约 415 m、秦汉约 415 m、清制 576 m',
    尺: '市尺 = 33.33 cm。营造尺 32 cm；历代差异更大：商 15.8、汉 23.1、元 34 cm',
    斤: '市斤 = 500 g。古代差异大：汉 250 g、唐 668 g、清 596.8 g',
    升: '市升 = 1 L。汉升约 200 mL、明升约 1073 mL —— 差 5 倍',
    亩: '市亩 ≈ 666.7 m²。周亩与清亩不同，各地也有差异',
    加仑: '默认国际（英制）= 4.546 L；美制 3.785 L，差 20%',
    吨: '默认公制 1000 kg；长吨 1016 kg、短吨 907 kg',
  }
  for (const unit of [from, to]) {
    const hint = ERA_HINTS[unit]
    if (hint !== undefined) warnings.push(unit + '：' + hint)
  }
  if (warnings.length > 0) {
    lines.push('【注意】')
    for (const warning of warnings) lines.push('  · ' + warning)
  }

  return {
    result: lines.join('\n'),
    value: {
      mode: 'convert',
      value,
      from,
      to,
      result: numeric,
      text,
      steps,
      warnings,
    },
  }
}

/**
 * 列出某个单位的信息（只给 unitFrom 时）。
 *
 * @param engine - 引擎
 * @param unit - 单位名
 * @returns 结果
 */
export function describeUnit(engine: Engine, unit: string): UnitsOutcome {
  let base: unknown
  try {
    base = engine.evaluate('1 ' + unit)
  } catch {
    throw new CalcError(
      'unknown_unit',
      '不认识单位「' + unit + '」',
      '可用中文（里/丈/斤/时辰/亩）、英制（psi/gpm/BTU）、SI（m/kg/s）或时代单位（汉尺/唐大尺）。',
    )
  }
  const text = restoreCjkUnitNames(String(base))
  return {
    result: '  1 ' + unit + ' = ' + text,
    value: { unit, base: text },
  }
}
