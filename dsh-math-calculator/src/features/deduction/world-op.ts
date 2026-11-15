/**
 * `world` 的 op 包装：参数校验 + 结果渲染。
 *
 * ## 三件事，不混在一起
 *
 * ```
 *   校验   参数非法 → CalcError（invalid_argument / missing_params）
 *   计算   generateWorld（纯函数，异常降级为 warnings）
 *   渲染   result 文本（数据通道），提示走 notice
 * ```
 *
 * ## brief 模式
 *
 * 老插件实测：完整 world 输出约 4,600 字符，brief 约 304 字符（省 93%）。
 * 桌面端/多轮推演里，作者通常只需要"骨架 + 异常"，细节等真问到再展开。
 * 所以 brief 压缩的是 **result 文本**，`value` 仍返回完整画像。
 *
 * ## sanity
 *
 * 判据由调用方给，工具只报警、不替调用方下结论：
 * ```
 *   sanity:{dayHours:{min:20,max:30,note:'叙事按 24 小时写'}}
 * ```
 * 越界进 notice，不改 ok——「这个数合不合理」由作者判断。
 *
 * @module dsh-math-calculator/features/deduction/world-op
 */

import { CalcError } from '../../core/errors.js'
import { generateWorld, type WorldDeps, type WorldParams, type WorldProfile } from './world.js'

/** sanity 判据。 */
export interface SanityRule {
  min?: number
  max?: number
  expect?: number
  note?: string
}

/** world op 输入。 */
export interface WorldOpInput extends WorldParams {
  /** 只要骨架，省 90% 文本。 */
  brief?: boolean
  /** 对指定量的判据（键为 profile 里的路径，如 `planet.surfaceGravityEarth`）。 */
  sanity?: Record<string, SanityRule>
}

/** op 输出。 */
export interface WorldOpOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 可 sanity 的字段（白名单，避免任意路径求值）。 */
const SANITY_PATHS: Record<string, (p: WorldProfile) => number> = {
  surfaceGravityEarth: (p) => p.planet.surfaceGravityEarth,
  surfaceGravity: (p) => p.planet.surfaceGravity,
  dayHours: (p) => p.planet.dayHours,
  yearDays: (p) => p.orbit.yearDays,
  surfaceMeanC: (p) => p.temperature.surfaceMeanC,
  escapeVelocity: (p) => p.planet.escapeVelocity,
  maxMountainHeight: (p) => p.terrain.maxMountainHeight,
  horizonKm: (p) => p.terrain.horizonKm,
  localDaysPerYear: (p) => p.calendar.localDaysPerYear,
  tidalRelativeEarth: (p) => p.moons.tidalRelativeEarth,
}

/** 数值参数校验：类型 + 范围。 */
const NUMERIC_FIELDS: Array<{ key: keyof WorldParams; min?: number; max?: number; label: string }> = [
  { key: 'starMass', min: 0.08, label: 'starMass（太阳质量）' },
  { key: 'starRadius', min: 0.01, label: 'starRadius（太阳半径）' },
  { key: 'starTemp', min: 1000, label: 'starTemp（K）' },
  { key: 'orbitAU', min: 0.001, label: 'orbitAU（AU）' },
  { key: 'eccentricity', min: 0, max: 0.95, label: 'eccentricity（0–0.95）' },
  /** 下限放到 1e-6：小行星/矮行星（冥王星约 0.0022）也要能建模。 */
  { key: 'planetMass', min: 1e-6, label: 'planetMass（地球质量，1e-6 起）' },
  { key: 'planetRadius', min: 1e-4, label: 'planetRadius（地球半径，1e-4 起）' },
  { key: 'rotationHours', min: 0.01, label: 'rotationHours（小时）' },
  { key: 'obliquityDeg', min: 0, max: 90, label: 'obliquityDeg（0–90 度）' },
  { key: 'albedo', min: 0, max: 1, label: 'albedo（0–1）' },
  { key: 'pressure', min: 1, label: 'pressure（Pa）' },
  { key: 'molarMass', min: 0.001, label: 'molarMass（kg/mol）' },
  { key: 'gamma', min: 1.01, label: 'gamma（绝热指数 > 1）' },
  { key: 'greenhouse', min: 0, label: 'greenhouse（K）' },
  { key: 'materialStrength', min: 1e3, label: 'materialStrength（Pa）' },
  { key: 'materialDensity', min: 100, label: 'materialDensity（kg/m³）' },
  { key: 'moonCount', min: 0, label: 'moonCount（颗）' },
  { key: 'moonMass', min: 0, label: 'moonMass（月球质量）' },
  { key: 'moonDistance', min: 0.01, label: 'moonDistance（地月距离）' },
  { key: 'lightPollution', min: 0, max: 1, label: 'lightPollution（0–1）' },
  { key: 'galaxyBand', min: 0, max: 1, label: 'galaxyBand（0–1）' },
]

/**
 * 校验参数。
 *
 * @param input - op 输入
 */
function validate(input: WorldOpInput): void {
  for (const field of NUMERIC_FIELDS) {
    const raw = input[field.key]
    if (raw === undefined) continue
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new CalcError(
        'invalid_argument',
        field.label + ' 必须是有限数字（收到 ' + JSON.stringify(raw) + '）',
        '例如 ' + field.label.split('（')[0] + ':1 表示地球基准。',
      )
    }
    if (field.min !== undefined && raw < field.min) {
      throw new CalcError(
        'invalid_argument',
        field.label + ' 不能小于 ' + field.min + '（收到 ' + raw + '）',
        '若你要表达"更小"，先确认单位是否给对；无量纲量用倍数表示。',
      )
    }
    if (field.max !== undefined && raw > field.max) {
      throw new CalcError(
        'invalid_argument',
        field.label + ' 不能大于 ' + field.max + '（收到 ' + raw + '）',
        '越界值会让模型进入无物理意义区间，请先确认设定。',
      )
    }
  }
  if (input.moons !== undefined && !Array.isArray(input.moons)) {
    throw new CalcError('invalid_argument', 'moons 必须是数组', '例如 moons:[{massMoon:1,distanceMoon:1}]。')
  }
}

/** 格式化数值（避免长尾小数）。 */
function f(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  /** 小行星重力 0.0022 g 用 toFixed(2) 会显示成 0.00 —— 低于显示精度时改科学计数。 */
  if (abs >= 1e5 || (abs > 0 && abs < Math.pow(10, -digits))) return value.toExponential(2)
  return value.toFixed(digits)
}

/** 完整渲染。 */
function renderFull(profile: WorldProfile): string {
  const lines: string[] = []
  const p = profile

  lines.push('【恒星】' + (profile.starClass ? profile.starClass.name + '（' + profile.starClass.id + '）' : '自定义') +
    '，' + f(p.star.tempK, 0) + ' K，光度 ' + f(p.star.luminositySun, 3) + ' L☉。')
  lines.push('【轨道】' + f(p.orbit.semiMajorAxisAU, 3) + ' AU，一年 ' + f(p.orbit.yearDays, 1) +
    ' 天，轨道速度 ' + f(p.orbit.orbitalVelocity / 1000, 1) + ' km/s，偏心率 ' + f(p.orbit.eccentricity, 4) + '。')
  lines.push('【行星】表面重力 ' + f(p.planet.surfaceGravity, 2) + ' m/s²（地球 ' + f(p.planet.surfaceGravityEarth, 2) +
    ' 倍），逃逸速度 ' + f(p.planet.escapeVelocity / 1000, 1) + ' km/s，平均密度 ' + f(p.planet.densityKgM3, 0) +
    ' kg/m³，自转 ' + f(p.planet.dayHours, 2) + ' h。')
  lines.push('【温度】平衡温度 ' + f(p.temperature.equilibriumK, 1) + ' K，表面均温 ' + f(p.temperature.surfaceMeanC, 1) +
    '°C；水在 ' + f(p.temperature.boilingPointC, 1) + '°C 沸腾。')
  lines.push('【大气】气压 ' + f(p.atmosphere.pressureAtm, 3) + ' atm，标高 ' + f(p.atmosphere.scaleHeightM / 1000, 2) +
    ' km（地球的 ' + f(p.atmosphere.relativeToEarth, 2) + ' 倍）。')
  lines.push('【地形】山高上限 ' + f(p.terrain.maxMountainHeight / 1000, 1) + ' km，雪线 ' +
    f(p.terrain.snowLineM / 1000, 1) + ' km，地平线 ' + f(p.terrain.horizonKm, 1) + ' km；' + p.terrain.seasonStrength + '。')

  lines.push('【季节成因】' + p.climate.season.description + p.climate.season.causeSummary)
  lines.push('【纬度气候】' + p.latitudeBands
    .map((b) => b.latitudeDeg + '°:' + f(b.approxTempC, 0) + '°C（' + b.zone + '）')
    .join('，') + '。')

  lines.push('【卫星】' + (p.moons.count === 0
    ? '无卫星。'
    : p.moons.count + ' 颗；主卫星潮汐为地球 ' + f(p.moons.tidalRelativeEarth, 2) + ' 倍，角直径 ' +
      f(p.moons.angularDiameterDeg, 2) + '°。'))
  if (p.moonSystem.resonances.length > 0) lines.push('【共振】' + p.moonSystem.resonances.join('；') + '。')

  lines.push('【天空】' + p.sky.day.description + p.sky.night.description)
  lines.push('【历法】恒星日 ' + f(p.calendar.siderealDayHours, 2) + ' h，太阳日 ' + f(p.calendar.solarDayHours, 2) +
    ' h；一年 ' + f(p.calendar.localDaysPerYear, 1) + ' 个本地日，' + p.calendar.monthsPerYear + ' 个月，每月 ' +
    f(p.calendar.daysPerMonth, 1) + ' 日。')

  lines.push('【生命闸门】' + p.life.gate.verdict + '：' + p.life.gate.note)
  if (p.checks.length > 0) {
    lines.push('【跨模块检查】' + p.checks.map((c) => c.status + ' ' + c.title).join('；') + '。')
  }
  if (p.warnings.length > 0) lines.push('【警告】' + p.warnings.join(' '))
  if (p.highlights.length > 0) lines.push('【要点】' + p.highlights.join(' '))

  return lines.join('\n')
}

/** 精简渲染（约 10 行）。 */
function renderBrief(profile: WorldProfile): string {
  const p = profile
  const abnormal = p.checks.filter((c) => c.status !== 'ok')
  return [
    '【骨架】' + f(p.planet.surfaceGravityEarth, 2) + 'g · ' + f(p.planet.dayHours, 1) + 'h/天 · ' +
      f(p.orbit.yearDays, 0) + '天/年 · 均温 ' + f(p.temperature.surfaceMeanC, 0) + '°C · 气压 ' +
      f(p.atmosphere.pressureAtm, 2) + 'atm',
    '【气候】' + p.climate.season.description + '；赤道 ' + f(p.latitudeBands[0].approxTempC, 0) +
      '°C，极地 ' + f(p.latitudeBands[p.latitudeBands.length - 1].approxTempC, 0) + '°C',
    '【卫星】' + (p.moons.count === 0 ? '无' : p.moons.count + ' 颗，潮汐 ' + f(p.moons.tidalRelativeEarth, 2) + '×地球'),
    '【地形】山高上限 ' + f(p.terrain.maxMountainHeight / 1000, 1) + 'km · 地平线 ' + f(p.terrain.horizonKm, 1) + 'km',
    '【历法】' + f(p.calendar.localDaysPerYear, 0) + ' 本地日/年，' + p.calendar.monthsPerYear + ' 个月',
    '【生命闸门】' + p.life.gate.verdict,
    abnormal.length > 0 ? '【异常】' + abnormal.map((c) => c.title).join('；') : '【异常】无',
    '【警告】' + (p.warnings.length === 0 ? '无' : p.warnings.slice(0, 3).join(' ') + (p.warnings.length > 3 ? ' …' : '')),
    p.starNotes.length > 0 ? '【输入改动】' + p.starNotes.join(' ') : '',
  ].filter(Boolean).join('\n')
}

/** 跑 sanity 判据，返回越界说明。 */
function runSanity(profile: WorldProfile, rules: Record<string, SanityRule>): string[] {
  const notes: string[] = []
  for (const [path, rule] of Object.entries(rules)) {
    const getter = SANITY_PATHS[path]
    if (!getter) {
      notes.push('sanity 的「' + path + '」不是可核对字段；可用：' + Object.keys(SANITY_PATHS).join('、'))
      continue
    }
    const value = getter(profile)
    const over: string[] = []
    if (rule.min !== undefined && value < rule.min) over.push('低于下限 ' + rule.min)
    if (rule.max !== undefined && value > rule.max) over.push('高于上限 ' + rule.max)
    if (rule.expect !== undefined) {
      const gap = Math.abs(value - rule.expect) / Math.max(1e-9, Math.abs(rule.expect))
      if (gap > 0.1) over.push('与预期 ' + rule.expect + ' 差 ' + (gap * 100).toFixed(0) + '%')
    }
    if (over.length > 0) {
      notes.push(path + ' = ' + f(value, 2) + '：' + over.join('，') + (rule.note ? '——' + rule.note : ''))
    }
  }
  return notes
}

/**
 * 执行 world。
 *
 * @param input - op 输入
 * @param deps - 注入的数据
 * @returns 渲染结果
 */
export function runWorld(input: WorldOpInput, deps: WorldDeps = {}): WorldOpOutcome {
  validate(input)
  const profile = generateWorld(input, deps)
  const result = input.brief === true ? renderBrief(profile) : renderFull(profile)

  const notices: string[] = []
  if (input.sanity && typeof input.sanity === 'object') {
    notices.push(...runSanity(profile, input.sanity))
  }
  if (profile.starNotes.length > 0) notices.push(...profile.starNotes)

  const outcome: WorldOpOutcome = { result, value: profile }
  if (notices.length > 0) outcome.notice = notices.join('\n')
  return outcome
}
