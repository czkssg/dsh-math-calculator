/**
 * 世界参数校验（L1）：把 `world-params.ts` 声明的 range 真正变成约束。
 *
 * ## 为什么单独一个模块
 *
 * `save-world`、`summary`、`derive` 都要判断「这组参数算得出来吗」。
 * 写在 api.ts 里会让 summary 也得复制一遍，于是两份逻辑早晚不同步
 * （白名单那次就是这么出事的，见 test/ai-journey.mjs）。
 *
 * ## 三档语义
 *
 * 铁律是「不反驳用户设定」，所以校验**不是一刀切拦住**：
 *
 * | 档 | 行为 | 判据 |
 * |---|---|---|
 * | 硬拒绝 | `errors[]` 非空，调用方回 400 | `range.hard` 且越界，会算出 Infinity/NaN/负物理量 |
 * | 软警告 | 写入，同时给 `warnings[]` | 未标 hard 且越界 |
 * | 通过 | 无输出 | 在范围内 |
 *
 * 哪些参数标 `hard` 是**实测**出来的，不是猜的：逐个参数取极端值跑 `opWorld`，
 * 统计产物里 `Infinity`/`NaN` 的个数。踩过的坑：`planet.surfaceGravity`
 * 其实是显示串（`'Infinity'` 字符串），只看 `typeof === 'number'` 会漏判。
 *
 * ## 类型严格性
 *
 * `Number(true) === 1`、`Number([]) === 0`、`Number(['7']) === 7` ——
 * 这些曾经让 `{planetMass:true}` 静默存成 1。现在只接受
 * `number` 与「数字字符串」，其余一律拒绝。
 *
 * @module dsh-math-calculator/world-validation
 */

import { PARAM_INDEX, WORLD_PARAMS, type ParamSpec } from './world-params.js'

/** 一条校验问题。 */
export interface ValidationIssue {
  /** 参数键名。 */
  key: string
  /** 出问题的值（原样）。 */
  value: unknown
  /** 参数声明的范围。 */
  range?: { min?: number; max?: number; hard?: boolean }
  /** 给人/AI 看的一句话，措辞不反驳设定。 */
  message: string
  /** 若是 moons 这类数组，指出第几颗。 */
  index?: number
}

/** 校验结果。 */
export interface ValidationResult {
  /** 干净的参数（只含合法且已规范化的值）。 */
  patch: Record<string, unknown>
  /** 硬错误：有一条就不能写盘。 */
  errors: ValidationIssue[]
  /** 软警告：写盘但要让作者知道代价。 */
  warnings: ValidationIssue[]
}

/**
 * 判断一个值能否当数字用。
 *
 * 只认 number 与数字字符串；`true`/`[]`/`{}`/`null` 都不算
 * （`Number()` 会把它们变成 1 / 0 / NaN，这是历史事故的根源）。
 *
 * @param value - 待判定的值
 * @returns 规范化后的数字；不能当数字用时返回 `undefined`
 */
function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return undefined
    const num = Number(text)
    return Number.isFinite(num) ? num : undefined
  }
  return undefined
}

/**
 * 描述一个越界值的问题（措辞遵循「不反驳设定」）。
 *
 * @param spec - 参数元数据
 * @param value - 越界的值
 * @param where - 位置说明（数组元素用）
 * @returns 一句话
 */
function describe(spec: ParamSpec, value: number, where: string): string {
  const range = spec.range || {}
  const min = range.min
  const max = range.max
  const bounds: string[] = []
  if (typeof min === 'number') bounds.push('不小于 ' + min)
  if (typeof max === 'number') bounds.push('不大于 ' + max)
  const limit = bounds.join('、') || '常规范围'
  const unit = spec.unit ? ' ' + spec.unit : ''
  return (
    spec.label + where + ' = ' + value + unit +
    '，超出常规范围（' + limit + '）。'
  )
}

/**
 * 校验标量参数。
 *
 * @param value - 原始值
 * @param spec - 参数元数据
 * @param out - 收集 patch / errors / warnings
 */
function checkScalar(value: unknown, spec: ParamSpec, out: ValidationResult): void {
  const key = spec.key
  const num = asNumber(value)
  if (num === undefined) {
    out.errors.push({
      key,
      value,
      range: spec.range,
      message: spec.label + ' 需要是一个数字，收到的是 ' + JSON.stringify(value) + '。',
    })
    return
  }
  const range = spec.range || {}
  const belowMin = typeof range.min === 'number' && num < range.min
  const aboveMax = typeof range.max === 'number' && num > range.max
  if (belowMin || aboveMax) {
    const issue: ValidationIssue = {
      key,
      value: num,
      range: spec.range,
      message: describe(spec, num, ''),
    }
    /**
     * `hard` 只约束**下界**，这是实测出来的结论。
     *
     * 逐个参数取极端值跑 `opWorld`，产物变成 Infinity/NaN 的情形**全部集中在
     * 「趋近零」或「为负」**：零半径 → 重力 Infinity、零质量 → 离心比 Infinity、
     * 零轨道 → 80 个 Infinity、负质量 → 逃逸速度 NaN。
     *
     * 而**上界完全不是这样**：`planetMass = 500`（比常规上限 100 高 5 倍）
     * 实测非有限数 = 0，算得出来，只是物理极端。作者要一颗 500 地球质量的行星
     * 是他的设定自由，插件不该拦 —— 拦了就违反「不反驳用户设定」。
     *
     * 所以：低于下限 → 400；高于上限 → 只警告。
     */
    if (range.hard && belowMin) {
      issue.message += '这个值会让推演算出无意义的物理量（无穷或负数），请不小于 ' +
        String(range.min) + (spec.unit ? ' ' + spec.unit : '') + '。'
      out.errors.push(issue)
      return
    }
    // 软范围（以及 hard 参数的上界）：设定自由，只提醒代价
    issue.message += '仍会按你的设定计算，但下游结论可能很极端。'
    out.warnings.push(issue)
  }
  out.patch[key] = num
}

/**
 * 校验逐颗卫星这类结构化数组。
 *
 * @param value - 原始数组
 * @param spec - 参数元数据（`kind === 'array'`）
 * @param out - 收集结果
 */
function checkArray(value: unknown, spec: ParamSpec, out: ValidationResult): void {
  const key = spec.key
  if (!Array.isArray(value)) {
    out.errors.push({
      key,
      value,
      message: spec.label + ' 需要是一个数组（每项一个对象），收到了 ' + JSON.stringify(value) + '。',
    })
    return
  }
  const range = spec.range || {}
  if (typeof range.max === 'number' && value.length > range.max) {
    out.errors.push({
      key,
      value: value.length,
      range,
      message: spec.label + ' 最多 ' + range.max + ' 项，收到 ' + value.length + ' 项。',
    })
    return
  }
  const shape = spec.itemShape || []
  const clean: Array<Record<string, unknown>> = []
  let bad = false
  for (let index = 0; index < value.length; index++) {
    const item = value[index]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      out.errors.push({
        key,
        value: item,
        index,
        message: spec.label + ' 第 ' + (index + 1) + ' 项必须是一个对象。',
      })
      bad = true
      continue
    }
    const row: Record<string, unknown> = {}
    for (const field of shape) {
      const raw = (item as Record<string, unknown>)[field.key]
      if (raw === undefined || raw === null || raw === '') continue
      if (field.kind === 'string') {
        row[field.key] = String(raw)
        continue
      }
      const num = asNumber(raw)
      if (num === undefined) {
        out.errors.push({
          key,
          value: raw,
          index,
          message: spec.label + ' 第 ' + (index + 1) + ' 项的 ' + field.key +
            ' 需要是一个数字，收到 ' + JSON.stringify(raw) + '。',
        })
        bad = true
        continue
      }
      const fieldRange = field.range || {}
      const fieldBelowMin = typeof fieldRange.min === 'number' && num < fieldRange.min
      const fieldAboveMax = typeof fieldRange.max === 'number' && num > fieldRange.max
      if (fieldBelowMin || fieldAboveMax) {
        const where = '第 ' + (index + 1) + ' 颗的 ' + field.key
        const issue: ValidationIssue = {
          key,
          value: num,
          index,
          range: fieldRange,
          message: where + ' = ' + num + '，超出常规范围（' +
            (typeof fieldRange.min === 'number' ? '不小于 ' + fieldRange.min : '') +
            (typeof fieldRange.max === 'number'
              ? (typeof fieldRange.min === 'number' ? '、' : '') + '不大于 ' + fieldRange.max
              : '') +
            '）。',
        }
        // 与标量同一套语义：低于下界才硬拒（趋零会算出无穷观测量）
        if (fieldRange.hard && fieldBelowMin) {
          issue.message += '这个值会让观测量变成无穷，请不小于 ' + String(fieldRange.min) + '。'
          out.errors.push(issue)
          bad = true
          continue
        }
        issue.message += '仍会按你的设定计算。'
        out.warnings.push(issue)
      }
      row[field.key] = num
    }
    clean.push(row)
  }
  if (!bad) out.patch[key] = clean
}

/**
 * 校验一整个 world 参数对象。
 *
 * 只处理白名单内的键；未知键（垃圾字段、派生量）一律忽略 ——
 * 这是「派生量绝不入库」的入口防线。
 *
 * @param incoming - 调用方给的 world 对象
 * @returns patch（可写盘部分）、errors（硬错误）、warnings（软警告）
 */
export function validateWorld(incoming: Record<string, unknown>): ValidationResult {
  const out: ValidationResult = { patch: {}, errors: [], warnings: [] }
  for (const spec of WORLD_PARAMS) {
    const value = incoming[spec.key]
    if (value === undefined || value === null || value === '') continue
    if (spec.kind === 'bool') {
      // 布尔型：接受 true/false 与 'true'/'false' 字面量，别把 'false' 当 true
      if (typeof value === 'boolean') { out.patch[spec.key] = value; continue }
      const text = String(value).trim().toLowerCase()
      if (text === 'true' || text === '1') { out.patch[spec.key] = true; continue }
      if (text === 'false' || text === '0') { out.patch[spec.key] = false; continue }
      out.errors.push({
        key: spec.key,
        value,
        message: spec.label + ' 需要是布尔值（true/false），收到 ' + JSON.stringify(value) + '。',
      })
      continue
    }
    if (spec.kind === 'choice') {
      const text = String(value)
      const legal = (spec.choices || []).some(function (item) { return item.value === text })
      if (!legal) {
        out.errors.push({
          key: spec.key,
          value,
          message: spec.label + ' 不在可选项里：' + text + '。可用：' +
            (spec.choices || []).map(function (item) { return item.value }).join(' / '),
        })
        continue
      }
      out.patch[spec.key] = text
      continue
    }
    if (spec.kind === 'array') {
      checkArray(value, spec, out)
      continue
    }
    checkScalar(value, spec, out)
  }
  return out
}

/**
 * 判断某个键是不是可写的基础量。
 *
 * @param key - 参数键名
 * @returns 是否在白名单里
 */
export function isWorldKey(key: string): boolean {
  return PARAM_INDEX.has(key)
}
