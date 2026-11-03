/**
 * operation="units" 的实现：单位换算。
 *
 * ## 两种用法
 *
 * | 调用 | 作用 |
 * |---|---|
 * | `{operation:'units'}` | 列出全部可用单位（按量纲分组） |
 * | `{operation:'units', unitValue:30, unitFrom:'里', unitTo:'km'}` | 换算 |
 *
 * ## 为什么给「代入过程」
 *
 * 作者写「城墙高三丈」时，AI 需要能解释「三丈 = 9.6 米」。只给结果数字，
 * AI 转述时无法让作者核对。所以 `steps[]` 里写明
 * 「1 丈 = 3.2 m」「3 丈 = 9.6 m」「1 m = 1 m，故结果 = 9.6 m」。
 *
 * ## 措辞
 *
 * 换算不确定（古制朝代差异）时用「常见近似」「按朝代覆盖」这类描述，
 * 不写「错误/禁止/必须」——与项目铁律一致。
 *
 * @module dsh-math-calculator/ops/units-op
 */

import { toJsonValue } from '../format.js'
import {
  BASE_UNIT,
  DIMENSION_LABEL,
  UNITS,
  convert,
  type Dimension,
  type UnitDef,
} from '../units.js'
import { CalcError, safeNumberForJson, type MathArgs, type Outcome } from './shared.js'

/** 量纲的展示顺序（先写日常用的）。 */
const ORDER: Dimension[] = [
  'length', 'mass', 'time', 'area', 'volume',
  'energy', 'power', 'temperature', 'speed', 'pressure',
  'force', 'angle', 'data', 'frequency',
]

/**
 * 把作者传来的自定义单位规范化。
 *
 * 量纲名写错时直接报错并列出可用量纲，不静默丢弃。
 *
 * @param raw - 原始数组
 * @returns 规范化后的单位
 * @throws CalcError - 量纲未知
 */
function normalizeCustom(raw: MathArgs['customUnits']): UnitDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: UnitDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const dimension = String(item.dimension || '')
    if (!ORDER.includes(dimension as Dimension)) {
      throw new CalcError(
        'invalid_argument',
        '自定义单位的量纲「' + dimension + '」不认识',
        '可用量纲：' + ORDER.join(' / '),
      )
    }
    const factor = Number(item.factor)
    if (!Number.isFinite(factor) || factor === 0) {
      throw new CalcError(
        'invalid_argument',
        '自定义单位「' + item.name + '」的 factor 必须是正数（换成基准单位的系数）',
        '例如把「里」定义成 576 m 就写 factor:576。',
      )
    }
    out.push({
      name: String(item.name || ''),
      dimension: dimension as Dimension,
      factor: factor,
      ...(Array.isArray(item.aliases) ? { aliases: item.aliases.map(String) } : {}),
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    })
  }
  return out
}

/**
 * 把数字显示成人读得懂的位数。
 *
 * 不去追 10 位有效数字——换算结果给作者看，3—6 位足够；
 * 太多位反而让人以为精度真有那么高（「伪精确」）。
 *
 * @param value - 数值
 * @returns 显示串
 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) return value.toExponential(4)
  // 用 toPrecision 截到 6 位再转回数字，去掉尾巴的 0
  return String(Number(value.toPrecision(6)))
}

/**
 * 显示单位系数（清单里用）。
 *
 * 与 `show` 分开：`亩` 的系数是 666.666…（无限循环），
 * 用 `show` 会显示成 666.667，在清单里看着像一个精确值。
 * 这里对整数系数原样输出，其余保留 6 位有效数字。
 *
 * @param factor - 换算到基准单位的系数
 * @returns 显示串
 */
function showFactor(factor: number): string {
  if (!Number.isFinite(factor)) return '—'
  const abs = Math.abs(factor)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) return factor.toExponential(6)
  if (Number.isInteger(factor)) return String(factor)
  return String(Number(factor.toPrecision(6)))
}

/**
 * `units`：单位换算与单位清单。
 *
 * @param args - 工具参数
 * @returns 结果文本与结构化值
 */
export function opUnits(args: MathArgs): Outcome {
  const custom = normalizeCustom(args.customUnits)
  const fromName = typeof args.unitFrom === 'string' ? args.unitFrom.trim() : ''
  const toName = typeof args.unitTo === 'string' ? args.unitTo.trim() : ''

  const lines: string[] = []
  const hasFrom = fromName !== ''
  const hasTo = toName !== ''

  /**
   * 只给了 unitValue 而没给单位 → 报错，不静默返回清单。
   *
   * 静默返回清单会让调用方以为「换算成功、结果就是这张表」，
   * 是典型的「成功与生效不一致」。既然给了数值就说明想换算，
   * 缺单位应当明说缺哪个。
   */
  if (args.unitValue !== undefined && !hasFrom && !hasTo) {
    throw new CalcError(
      'invalid_argument',
      '给了 unitValue 但没给 unitFrom / unitTo，无法换算',
      '补上源单位与目标单位，例如 {unitValue:30, unitFrom:"里", unitTo:"km"}；' +
        '想看单位清单请不带 unitValue 调用。',
    )
  }

  // ── 情形 A：列清单 ──
  /**
   * ## 为什么默认只给摘要
   *
   * 单位收到 287 条后，全量展开一次是 17000+ 字符 —— 那是**每轮对话都占上下文**的东西，
   * 而调用方通常只想确认「有没有我要的那条」。
   *
   * 所以默认给「每个量纲几条约数 + 几个样例」，要看全表就传 `unitScale`
   * （如 `unitScale:"length"`）。这与 help 的取向一致：**用到时才读**。
   */
  if (!hasFrom && !hasTo) {
    const wantedDimension = typeof args.unitScale === 'string' ? args.unitScale.trim().toLowerCase() : ''
    const expandDimension =
      wantedDimension === ''
        ? null
        : ORDER.find(function (d) { return d === wantedDimension || DIMENSION_LABEL[d] === wantedDimension }) ?? null
    if (wantedDimension !== '' && expandDimension === null) {
      throw new CalcError(
        'invalid_argument',
        '不认识的量纲「' + wantedDimension + '」',
        '可用: ' + ORDER.map(function (d) { return d + '(' + DIMENSION_LABEL[d] + ')' }).join(' / '),
      )
    }

    lines.push('══════ 可用单位（共 ' + (UNITS.length + custom.length) + ' 条）══════')
    lines.push('')
    if (custom.length > 0) {
      lines.push('【本项目的自定义单位】')
      for (const unit of custom) {
        lines.push(
          '  ' + unit.name.padEnd(10) + ' ' + DIMENSION_LABEL[unit.dimension].padEnd(4) +
          ' 1 ' + unit.name + ' = ' + showFactor(unit.factor) + ' ' + BASE_UNIT[unit.dimension] +
          (unit.note ? '（' + unit.note + '）' : ''),
        )
      }
      lines.push('')
    }
    for (const dimension of ORDER) {
      const items = [...custom.filter(function (u) { return u.dimension === dimension }), ...UNITS.filter(function (u) { return u.dimension === dimension })]
      if (items.length === 0) continue
      /** 展开只针对点名的那一维；其余给计数与样例。 */
      if (expandDimension === dimension) {
        /**
         * 展开时**按用途分两段**：度量衡在前（绝大多数调用者要这个），
         * 科学单位在后并标明。混排会让「找三丈是多少米」的人翻过一堆 eV。
         */
        const measureItems = items.filter(function (u) { return u.category !== 'science' })
        const scienceItems = items.filter(function (u) { return u.category === 'science' })
        lines.push(
          '【' + DIMENSION_LABEL[dimension] + '】（基准单位 ' + BASE_UNIT[dimension] + '）' +
          '共 ' + items.length + ' 条：度量衡 ' + measureItems.length + ' / 科学 ' + scienceItems.length,
        )
        for (const unit of measureItems) {
          const aliases = (unit.aliases || []).length > 0 ? '（别名：' + unit.aliases!.join('、') + '）' : ''
          lines.push(
            '  ' + unit.name.padEnd(12) + ' = ' + showFactor(unit.factor).padEnd(22) +
            BASE_UNIT[dimension] + aliases,
          )
          if (unit.note) lines.push('      · ' + unit.note)
        }
        if (scienceItems.length > 0) {
          lines.push('  ── 科学单位（专业计算用，正文里通常不写）──')
          for (const unit of scienceItems) {
            const aliases = (unit.aliases || []).length > 0 ? '（别名：' + unit.aliases!.join('、') + '）' : ''
            lines.push(
              '  ' + unit.name.padEnd(12) + ' = ' + showFactor(unit.factor).padEnd(22) +
              BASE_UNIT[dimension] + aliases,
            )
          }
        }
        lines.push('')
      } else {
        /** 摘要行也标出度量衡/科学的条数——不展开也能看出这条量纲的分界。 */
        const measureCount = items.filter(function (u) { return u.category !== 'science' }).length
        const scienceCount = items.length - measureCount
        const sample = items.slice(0, 5).map(function (u) { return u.name }).join('/')
        lines.push(
          '  ' + DIMENSION_LABEL[dimension].padEnd(4) + BASE_UNIT[dimension].padEnd(6) +
          ('度量衡 ' + measureCount).padEnd(9) +
          ('科学 ' + scienceCount).padEnd(7) + '例：' + sample + (items.length > 5 ? '/…' : ''),
        )
      }
    }
    if (expandDimension === null) {
      lines.push('【看某一类的全部单位】')
      lines.push('  传 unitScale:"length" / "mass" / "volume" / …（也可用中文名如 "长度"）')
    }
    lines.push('')
    lines.push('【怎么换算】')
    lines.push('  {operation:"units", unitValue:30, unitFrom:"里", unitTo:"km"}')
    lines.push('  → 30 里 = 15 km')
    lines.push('')
    lines.push('注：中文古制单位历朝不同，内置值取最常见近似；要精确到某朝代，')
    lines.push('    用 customUnits 覆盖（如 {name:"里",dimension:"length",factor:576}）。')
    lines.push('    同一名字在两套体系里数值不同的（加仑、担、石、马力），')
    lines.push('    已分两类收（gal/gal_uk、hp/hp_metric），按 note 区分。')
    return {
      result: lines.join('\n'),
      value: toJsonValue({
        mode: 'list',
        dimensions: ORDER.map(function (dimension) {
          return {
            dimension: dimension,
            label: DIMENSION_LABEL[dimension],
            base: BASE_UNIT[dimension],
            units: [...custom.filter(function (u) { return u.dimension === dimension }), ...UNITS.filter(function (u) { return u.dimension === dimension })]
              .map(function (unit) {
                return {
                  name: unit.name,
                  aliases: unit.aliases ?? [],
                  factor: safeNumberForJson(unit.factor),
                  note: unit.note ?? null,
                }
              }),
          }
        }),
      } as never),
    }
  }

  // ── 情形 B：给了单位但数值没给，按 1 处理并明说 ──
  const value = typeof args.unitValue === 'number' ? args.unitValue : Number(args.unitValue ?? 1)
  if (!Number.isFinite(value)) {
    throw new CalcError(
      'invalid_argument',
      'unitValue 必须是数字，收到 ' + JSON.stringify(args.unitValue),
      '例如 {unitValue:30, unitFrom:"里", unitTo:"km"}。',
    )
  }
  const implicitOne = args.unitValue === undefined

  if (!hasFrom || !hasTo) {
    throw new CalcError(
      'invalid_argument',
      '换算需要同时给 unitFrom 与 unitTo（源单位、目标单位）',
      '只给了「' + (hasFrom ? fromName : toName) + '」。例如 ' +
        '{unitValue:30, unitFrom:"里", unitTo:"km"}；不带参数调用则列出全部单位。',
    )
  }

  const outcome = convert(value, fromName, toName, custom)
  if (!outcome.ok) {
    throw new CalcError('invalid_argument', outcome.error, outcome.hint)
  }
  const c = outcome.conversion

  lines.push('══════ 单位换算 ══════')
  lines.push('')
  if (implicitOne) {
    lines.push('未给 unitValue，按 1 计算。')
    lines.push('')
  }
  lines.push('  ' + show(c.value) + ' ' + c.from.name + ' = ' + show(c.result) + ' ' + c.to.name)
  lines.push('')
  lines.push('【代入过程】')
  for (const step of c.steps) lines.push('  · ' + step)
  if (c.warnings.length > 0) {
    lines.push('')
    lines.push('【注意】')
    for (const warning of c.warnings) lines.push('  · ' + warning)
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      mode: 'convert',
      dimension: c.dimension,
      value: safeNumberForJson(c.value),
      from: c.from.name,
      to: c.to.name,
      result: safeNumberForJson(c.result),
      steps: c.steps,
      warnings: c.warnings,
      implicitOne: implicitOne,
    } as never),
  }
}
