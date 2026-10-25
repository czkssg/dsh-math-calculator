/**
 * 综合推演：一次请求拿到界面需要的全部结论。
 *
 * @module dsh-math-calculator/summary
 * @description
 * ## 为什么要有这个
 *
 * 界面改一个参数后要同时更新四样东西：派生量、生物、文明、能不能住。
 * 分四次请求既慢、又容易不同步（第 2 次算完时参数可能已经被改了）。
 * 所以做成一次调用、一次快照。
 *
 * 实测总耗时 2.1 ms——够实时。
 *
 * ## 分层原则
 *
 * 返回结构严格区分三层：
 *   · `params`   —— 基础量（用户能改的，原样回显）
 *   · `derived`  —— 派生量（只读，由 params 算出）
 *   · `impact`   —— 结论（生物 / 文明 / 环境）
 *
 * 界面**绝不允许**把 derived 写回 params——那会破坏体系自洽。
 */

import { opWorld } from './ops/world-op.js'
import { judgeDead } from './dead-universe.js'
import { runCivilization } from './civilization.js'
import { ecosystemFromWorld } from './ecosystem.js'
import { CONSTRAINTS, deriveConstraintContext } from './feasibility.js'
import { paramsByGroup, WORLD_PARAMS } from './world-params.js'

/** 一个派生量（只读）。 */
export interface DerivedValue {
  /** 键名（界面用）。 */
  key: string
  /** 中文名。 */
  label: string
  /** 数值。 */
  value: number
  /** 单位。 */
  unit: string
  /** 格式化好的显示串。 */
  text: string
}

/** 一条结论。 */
export interface ImpactLine {
  /** 结论名。 */
  label: string
  /** 显示值。 */
  value: string
  /** 补充说明。 */
  note?: string
}

/** 综合结果。 */
export interface Summary {
  /** 基础量（原样回显）。 */
  params: Record<string, unknown>
  /** 参数元数据（界面据此渲染表单）。 */
  paramGroups: ReturnType<typeof paramsByGroup>
  /** 派生量（只读）。 */
  derived: DerivedValue[]
  /** 结论：生物。 */
  biology: ImpactLine[]
  /** 结论：文明。 */
  civilization: ImpactLine[]
  /** 结论：环境与可居住性。 */
  environment: ImpactLine[]
  /** 死寂判定。 */
  verdict: { level: string; summary: string; causes: string[] }
  /** 一句话速写。 */
  headline: string
}

/**
 * 把数字格式化成好读的串。
 *
 * @param value - 数值
 * @param digits - 有效位数
 * @returns 显示串
 */
function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs < 1e-2 && abs > 0)) return value.toExponential(2)
  return Number(value.toPrecision(digits)).toString()
}

/**
 * 把不可用的数字归一化为 `undefined`。
 *
 * 为什么需要：`JSON.stringify(Infinity)` 得到 `null`，但把 `Infinity` 原样放进
 * 对象里，前端/AI 读到的可能是字符串 `"Infinity"`（取决于序列化路径）。
 * 实测 `planetRadius=0` 时 `derived[0].value` 就是 `"Infinity"`，
 * 而只有 `text` 被 `fmt()` 格式化成了 `—`。两个字段不一致会误导消费方。
 *
 * @param value - 原始值（可能来自显示串，也可能是数字）
 * @returns 有限数原样返回，否则 `undefined`
 */
function finite(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const num = Number(value)
    return Number.isFinite(num) ? num : undefined
  }
  return undefined
}

/**
 * 一次算出界面上要显示的全部内容。
 *
 * @param params - 基础量（只认白名单里的键）
 * @returns 综合结果
 */
export function deriveAll(params: Record<string, unknown> = {}): Summary {
  // 只保留白名单里的键——防止派生量或垃圾字段混进来。
  // 这是「派生量绝不入库」的实现点：即使调用方硬塞 gravity，也会被丢弃。
  const allowed = new Set(WORLD_PARAMS.map(function (item) { return item.key }))
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    clean[key] = value
  }

  const world = (opWorld({ world: clean } as never, 32) as any).value || {}
  const planet = world.planet || {}
  const orbit = world.orbit || {}
  const temp = world.temperature || {}
  const atm = world.atmosphere || {}
  const stellar = world.stellar || {}

  const gravity = finite(planet.surfaceGravity) ?? 0
  const radiusM = finite(planet.radiusM) ?? 6.371e6
  const escapeVelocity = Math.sqrt(2 * gravity * radiusM)

  // ── 派生量：全部现算，一个都不存 ──
  // value 一律过 finite()：参数不合法时会算出 Infinity/NaN，
  // 原样给出去会被 AI 当成真数字写进结语（见 test/sanity.mjs）。
  const derived: DerivedValue[] = [
    {
      key: 'gravity',
      label: '表面重力',
      value: gravity,
      unit: 'm/s²',
      text: fmt(gravity) + ' m/s²（' + fmt(finite(planet.surfaceGravityEarth) ?? 0, 2) + ' g）',
    },
    {
      key: 'escapeVelocity',
      label: '逃逸速度',
      value: escapeVelocity,
      unit: 'km/s',
      text: fmt(escapeVelocity / 1000) + ' km/s',
    },
    {
      key: 'dayHours',
      label: '一天',
      value: finite(planet.dayHours) ?? 0,
      unit: '小时',
      text: fmt(finite(planet.dayHours) ?? 0) + ' 小时',
    },
    {
      key: 'yearDays',
      label: '一年',
      value: finite(orbit.yearDays) ?? 0,
      unit: '天',
      text: fmt(finite(orbit.yearDays) ?? 0) + ' 天',
    },
    {
      key: 'meanTemp',
      label: '年均温',
      value: finite(temp.surfaceMeanK) ?? 0,
      unit: 'K',
      text: fmt(finite(temp.surfaceMeanK) ?? 0) + ' K（' + fmt((finite(temp.surfaceMeanK) ?? 0) - 273.15) + ' °C）',
    },
    {
      key: 'scaleHeight',
      label: '大气标高',
      value: finite(atm.scaleHeightM) ?? 0,
      unit: 'm',
      text: fmt(finite(atm.scaleHeightM) ?? 0) + ' m',
    },
    {
      key: 'starLifetime',
      label: '恒星寿命',
      value: finite(stellar.lifetimeGyr) ?? 0,
      unit: 'Gyr',
      text: fmt(finite(stellar.lifetimeGyr) ?? 0) + ' Gyr（' + fmt((finite(stellar.lifetimeGyr) ?? 0) * 10) + ' 亿年）',
    },
  ]

  // ── 生物：复用 feasibility，不重写物理 ──
  const ctx = deriveConstraintContext(clean)
  const biology = CONSTRAINTS
    .filter(function (item) { return item.category === 'biology' })
    .map(function (item) {
      const limit = item.limit(ctx)
      return {
        label: item.name,
        value: fmt(limit) + ' ' + item.unit,
        note: item.formula,
      }
    })

  // ── 文明 ──
  const civ = runCivilization(clean)
  const eco = ecosystemFromWorld(world)
  const civilization: ImpactLine[] = []

  for (const item of civ.limits) {
    if (item.category !== 'material' && item.category !== 'transport') continue
    if (item.name === '逃逸速度' || item.name === '第一宇宙速度') continue
    civilization.push({ label: item.name, value: fmt(item.value) + ' ' + item.unit, note: item.basis })
  }
  civilization.push({
    label: '生态承载力',
    value: fmt(eco.carryingCapacity / 1e8) + ' 亿人',
    note: eco.note,
  })
  for (const tech of civ.tech) {
    civilization.push({
      label: tech.branch,
      value: tech.status === 'open' ? '✓ 可行' : tech.status === 'conditional' ? '△ 有条件' : '✗ 被锁死',
      note: tech.reason,
    })
  }

  // ── 环境与可居住性 ──
  const dead = judgeDead(world)
  const environment: ImpactLine[] = []
  environment.push({
    label: '能不能住人',
    value: dead.level === 'alive' ? '✓ 可以' : dead.level === 'marginal' ? '△ 勉强' : '✗ 不行',
    note: dead.summary,
  })
  if (temp.surfaceMeanK !== undefined) {
    environment.push({
      label: '地表均温',
      value: fmt(temp.surfaceMeanK) + ' K',
      note: temp.surfaceMeanK > 273.15 ? '高于冰点，可能有液态水' : '低于冰点，水会冻住',
    })
  }
  if (atm.pressureAtm !== undefined) {
    environment.push({
      label: '气压',
      value: fmt(atm.pressureAtm) + ' atm',
      note: atm.pressureAtm < 0.5 ? '很稀薄，难以呼吸'
        : atm.pressureAtm > 3 ? '高压，呼吸阻力大' : '接近地球，可呼吸',
    })
  }
  environment.push({
    label: '一天',
    value: fmt(planet.dayHours || 0) + ' 小时',
    note: (planet.dayHours || 24) < 12 ? '自转快，风暴强'
      : (planet.dayHours || 24) > 48 ? '自转慢，昼夜温差大' : '与地球相当',
  })

  const headline = '重力 ' + fmt(planet.surfaceGravityEarth || 0, 2) + ' g、一天 ' +
    fmt(planet.dayHours || 0) + ' 小时、均温 ' + fmt(temp.surfaceMeanK || 0) + ' K 的世界'

  return {
    params: clean,
    paramGroups: paramsByGroup(),
    derived: derived,
    biology: biology,
    civilization: civilization,
    environment: environment,
    verdict: {
      level: dead.level,
      summary: dead.summary,
      causes: dead.causes.map(function (cause) { return cause.name + '：' + cause.value }),
    },
    headline: headline,
  }
}
