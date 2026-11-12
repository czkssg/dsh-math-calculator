/**
 * 自设单位操作层（对外接口的实现）。
 *
 * ## 四个动作
 *
 * ```
 *   add     注册一个自设单位（校验 → 注册 → 落盘）
 *   list    列出现有的自设单位
 *   remove  删掉一个
 *   check   只校验不落盘（干跑）
 * ```
 *
 * ## `check` 为什么单独存在
 *
 * 用户常常不确定「这个名字会不会撞已有单位」。
 * 若只能 add，那试错的代价是**多一条脏数据**要手动删。
 * `check` 让试错无代价 —— 与老插件 `constants{preview}` 同一思路。
 *
 * @module dsh-math-calculator/features/numeric/unit-custom-op
 */

import type { Engine } from '../../core/engine.js'
import { CalcError } from '../../core/errors.js'
import {
  validateCustomUnit,
  toRegistryName,
  registerCustomUnit,
  DIMENSION_BASE,
  type CustomUnit,
} from '../../core/units-custom.js'
import {
  loadCustomUnits,
  appendCustomUnit,
  removeCustomUnit,
  type StoreOptions,
} from '../../core/units-custom-store.js'

/** 操作结果。 */
export interface UnitCustomOutcome {
  /** 人类可读的正文。 */
  result: string
  /** 结构化数据。 */
  value: Record<string, unknown>
  /**
   * 是否需要重建引擎。
   *
   * ## 为什么由操作层回报而不是自己重建
   *
   * 操作层拿到的是 `Engine` 实例（可能是单例缓存）。
   * 若它自己调 `rebuildEngine()`，调用方手里的 `engine` 变量
   * 仍指向旧实例 —— 反而更乱。
   *
   * 所以这里只**标记**，由调用方（分发层）负责重建后重新取引擎。
   */
  needsRebuild?: boolean
}

/**
 * 收集已有单位名与「量纲:因子」索引（用于冲突与重复检查）。
 *
 * @param engine - 引擎
 * @returns 名字集合与小写映射
 */
function collectExisting(engine: Engine): {
  names: Set<string>
  sameFactor: Map<string, string>
} {
  const names = new Set<string>()
  const sameFactor = new Map<string, string>()

  /**
   * 从 mathjs 的单位表取全部名字。
   *
   * `math.Unit.UNITS` 是 mathjs 的公开静态属性（实测可用），
   * 结构是 `{ 名字: { name, prefixes, base, dimensions, offset } }`。
   */
  const unitTable = (engine.math as unknown as {
    Unit?: { UNITS?: Record<string, { name?: string; base?: unknown }> }
  }).Unit?.UNITS

  if (unitTable !== undefined) {
    for (const key of Object.keys(unitTable)) names.add(key.toLowerCase())
  }
  /**
   * 自己的自设单位也算进去 —— 否则用户可以重复注册同一个名字，
   * 后一次会静默覆盖前一次。
   */
  for (const unit of engine.customUnits) {
    names.add(unit.name.toLowerCase())
    sameFactor.set(unit.dimension + ':' + unit.factor, unit.display)
  }
  return { names, sameFactor }
}

/**
 * 从参数里取单位定义。
 *
 * @param args - 工具参数
 * @returns 部分单位定义
 */
function readUnitArg(args: Record<string, unknown>): Partial<CustomUnit> {
  /** 支持两种形态：`unit: {...}` 或直接平铺 `display`/`dimension`/`factor`。 */
  const nested = args['unit']
  const source = (nested !== null && typeof nested === 'object'
    ? nested
    : args) as Record<string, unknown>

  const out: Partial<CustomUnit> = {}
  if (typeof source['display'] === 'string') out.display = source['display']
  else if (typeof source['name'] === 'string') out.display = source['name']

  if (typeof source['dimension'] === 'string') out.dimension = source['dimension']
  if (source['factor'] !== undefined) out.factor = Number(source['factor'])
  if (typeof source['note'] === 'string') out.note = source['note']
  if (typeof source['baseUnit'] === 'string') out.baseUnit = source['baseUnit']
  return out
}

/**
 * 把校验问题与警告渲染成文本。
 *
 * @param problems - 问题
 * @param warnings - 警告
 * @returns 文本行
 */
function renderIssues(problems: string[], warnings: string[]): string[] {
  const lines: string[] = []
  for (const problem of problems) lines.push('  ✗ ' + problem)
  for (const warning of warnings) lines.push('  ⚠ ' + warning)
  return lines
}

/**
 * `unit_custom` 操作的实现。
 *
 * @param engine - 引擎
 * @param args - 工具参数
 * @param store - 存储选项
 * @returns 结果
 */
export function opUnitCustom(
  engine: Engine,
  args: Record<string, unknown>,
  store: StoreOptions,
): UnitCustomOutcome {
  const action = typeof args['action2'] === 'string'
    ? args['action2']
    : typeof args['action'] === 'string'
      ? (args['action'] as string)
      : 'list'

  // ────────────────────────────────────────
  // list
  // ────────────────────────────────────────
  if (action === 'list') {
    const units = loadCustomUnits(store)
    const lines: string[] = ['═══ 自设单位 ═══', '']
    if (units.length === 0) {
      lines.push('  还没有自设单位。')
      lines.push('')
      lines.push('  添加一个：')
      lines.push('    {operation:"unit_custom", action2:"add",')
      lines.push('     unit:{display:"维尔", dimension:"length", factor:1200, note:"1 维尔 = 1.2 km"}}')
      lines.push('')
      lines.push('  可用量纲：' + Object.keys(DIMENSION_BASE).filter((d) => DIMENSION_BASE[d] !== '').join(' / '))
      return { result: lines.join('\n'), value: { count: 0, units: [] } }
    }
    lines.push('  共 ' + units.length + ' 个：')
    lines.push('')
    for (const unit of units) {
      lines.push('  @' + unit.display + '（' + unit.name + '）')
      lines.push('    ' + unit.factor + ' ' + unit.baseUnit + '　量纲 ' + unit.dimension)
      if (unit.note !== '') lines.push('    ' + unit.note)
    }
    lines.push('')
    lines.push('  用法：`5 @' + units[0].display + ' to ' + units[0].baseUnit + '`')
    return {
      result: lines.join('\n'),
      value: { count: units.length, units },
    }
  }

  // ────────────────────────────────────────
  // remove
  // ────────────────────────────────────────
  if (action === 'remove' || action === 'delete') {
    const target = typeof args['unitName'] === 'string'
      ? args['unitName']
      : typeof args['name'] === 'string'
        ? (args['name'] as string)
        : ''
    if (target === '') {
      throw new CalcError(
        'missing_params',
        '删除要指定 unitName',
        '例如 {operation:"unit_custom", action2:"remove", unitName:"维尔"}。' +
          '用 action2:"list" 看现有名字。',
      )
    }
    const units = loadCustomUnits(store)
    const existing = units.find((u) => u.name === target || u.display === target)
    if (existing === undefined) {
      throw new CalcError(
        'invalid_argument',
        '没有叫「' + target + '」的自设单位',
        '现有：' + (units.length === 0 ? '（空）' : units.map((u) => u.display).join(' / ')),
      )
    }
    const next = removeCustomUnit(store, target) ?? []
    return {
      result: '✓ 已删除 @' + existing.display + '（' + existing.factor + ' ' + existing.baseUnit + '）\n' +
        '  剩余 ' + next.length + ' 个自设单位。',
      value: { removed: existing, count: next.length },
      needsRebuild: true,
    }
  }

  // ────────────────────────────────────────
  // add / check
  // ────────────────────────────────────────
  if (action !== 'add' && action !== 'check') {
    throw new CalcError(
      'invalid_argument',
      '认不出 action2「' + action + '」',
      '可用：add（注册）/ list（列表）/ remove（删除）/ check（只校验不落盘）。',
    )
  }

  const partial = readUnitArg(args)
  const existing = collectExisting(engine)
  const check = validateCustomUnit(partial, existing.names, existing.sameFactor)

  if (!check.ok) {
    const lines: string[] = ['✗ 这个单位注册不了：', '']
    lines.push(...renderIssues(check.problems, []))
    lines.push('')
    lines.push('  正确写法：')
    lines.push('    {operation:"unit_custom", action2:"add",')
    lines.push('     unit:{display:"维尔", dimension:"length", factor:1200, note:"1 维尔 = 1.2 km"}}')
    lines.push('')
    lines.push('  可用量纲：' + Object.keys(DIMENSION_BASE).filter((d) => DIMENSION_BASE[d] !== '').join(' / '))
    throw new CalcError('invalid_argument', lines.join('\n'), undefined)
  }

  /** 干跑：只说结果不动盘。 */
  if (action === 'check') {
    const lines: string[] = ['✓ 可以注册：', '']
    lines.push('  显示名  @' + (partial.display ?? ''))
    lines.push('  注册名  ' + check.name)
    lines.push('  换算    1 @' + (partial.display ?? '') + ' = ' + partial.factor + ' ' +
      (DIMENSION_BASE[partial.dimension ?? ''] ?? '?'))
    if (check.warnings.length > 0) {
      lines.push('')
      lines.push(...renderIssues([], check.warnings))
    }
    lines.push('')
    lines.push('  （这是干跑，没有写盘。确认无误后把 action2 改成 "add"。）')
    return {
      result: lines.join('\n'),
      value: { wouldRegister: check.name, display: partial.display, warnings: check.warnings, dryRun: true },
    }
  }

  /** 真正注册。 */
  const unit: CustomUnit = {
    name: check.name,
    display: partial.display ?? '',
    dimension: partial.dimension ?? '',
    factor: Number(partial.factor),
    baseUnit: DIMENSION_BASE[partial.dimension ?? ''] ?? 'm',
    note: partial.note ?? '',
    createdAt: new Date().toISOString(),
  }

  registerCustomUnit(engine.math, unit)
  const units = appendCustomUnit(store, unit)

  /**
   * 注册后**立刻验证**能换算 —— 若不行说明 factor 或基准单位有问题。
   *
   * 这一步不是多余的：`createUnit` 对某些定义会静默接受但换算出错
   * （实测：用复合基准 `m3/s` 时接受但 `to L/min` 报错）。
   */
  let verified = ''
  try {
    const probe = engine.math.evaluate('1 ' + unit.name + ' to ' + unit.baseUnit)
    verified = String(probe)
  } catch {
    verified = '（换算自检失败，请检查 factor）'
  }

  const lines: string[] = ['✓ 已注册 @' + unit.display, '']
  lines.push('  注册名  ' + unit.name)
  lines.push('  换算    1 @' + unit.display + ' = ' + unit.factor + ' ' + unit.baseUnit + '（自检：' + verified + '）')
  lines.push('  量纲    ' + unit.dimension)
  if (unit.note !== '') lines.push('  说明    ' + unit.note)
  lines.push('')
  lines.push('  现在可以这样用：')
  lines.push('    `5 ' + unit.display + ' to ' + unit.baseUnit + '` → ' +
    (() => {
      try { return String(engine.math.evaluate('5 ' + unit.name + ' to ' + unit.baseUnit)) } catch { return '?' }
    })())
  lines.push('')
  lines.push('  共 ' + units.length + ' 个自设单位（已存盘，重启后仍可用）。')
  if (check.warnings.length > 0) {
    lines.push('')
    lines.push(...renderIssues([], check.warnings))
  }

  return {
    result: lines.join('\n'),
    value: { registered: unit, count: units.length, warnings: check.warnings },
    /**
     * 标记需要重建引擎 —— 见 `UnitCustomOutcome.needsRebuild` 的说明。
     * 调用方（分发层）拿到这个标记后调 `rebuildEngine()`。
     */
    needsRebuild: true,
  }
}
