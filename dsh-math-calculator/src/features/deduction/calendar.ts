/**
 * 历法推导：给定行星参数，推出「一年多少天、怎么闰、月份怎么分、季节怎么定」。
 *
 * ## 输入
 *
 * - 自转周期（小时）：一天的长度；
 * - 公转周期（地球日）：一年的长度（以地球日计）；
 * - 倾角（度）：决定季节；
 * - 卫星（颗数与周期，地球日）：决定「月」；
 * - 起始历元（可选）。
 *
 * ## 输出
 *
 * - 本地日照数与小数（一年 = 多少本地日）；
 * - 闰年规则（按小数部分选 4 年/128 年/无闰）；
 * - 季节（倾角 0 → 无季节；23.44 → 四季；>90 → 逆行）；
 * - 卫星月（一颗卫星周期 → 太阴月，与年比决定阴阳历）；
 * - 分至点（太阳黄经 0/90/180/270 对应的本地日）。
 *
 * 对照：地球（自转 23.934 h、公转 365.2422 日、倾角 23.44°）应得
 * 「365 天 5 小时 49 分」、4 年一闰、四季、太阴月 29.53 日。
 *
 * @module dsh-math-calculator/features/deduction/calendar
 */

/** 输入。 */
export interface CalendarInput {
  /** 自转周期（小时）。 */
  rotationHours?: number
  /** 公转周期（地球日）。 */
  orbitDays?: number
  /** 倾角（度）。 */
  obliquityDeg?: number
  /** 卫星数。 */
  moonCount?: number
  /** 卫星周期（地球日，取第一颗）。 */
  moonPeriodDays?: number
  /** 卫星半长轴（AU）——给了就用开普勒算周期（与 system/orbit 耦合）。 */
  moonSemiMajorAu?: number
  /** 行星质量（地球质量，卫星轨道用）。 */
  planetMassEarth?: number
  /** 历元（可选，ISO）。 */
  epoch?: string
}

/** 结果。 */
export interface CalendarResult {
  /** 一天（小时）。 */
  dayHours: number
  /** 一年（本地日）。 */
  yearDays: number
  /** 一年（整数天）+ 小数。 */
  yearDaysInteger: number
  yearDaysFraction: number
  /** 闰年建议。 */
  leapRule: string
  /** 季节档。 */
  season: string
  /** 卫星月（本地日；无卫星为 null）。 */
  lunarMonthDays: number | null
  /** 历法类型（太阳历/太阴历/阴阳历）。 */
  calendarType: string
  /** 分至点（本地日，从历元起）。 */
  solstices: Array<{ name: string; dayOfYear: number }>
  /** 推导说明。 */
  notes: string[]
}

/**
 * 推导历法。
 *
 * @param input - 行星参数
 * @returns 历法结果
 * @throws {Error} 参数非法
 */
export function deriveCalendar(input: CalendarInput): CalendarResult {
  const rotationHours = input.rotationHours ?? 24
  const orbitDays = input.orbitDays ?? 365.2422
  const obliquity = input.obliquityDeg ?? 23.44
  const moonCount = input.moonCount ?? 1
  /** 卫星周期：给了半长轴就用开普勒算（地月 a=0.00257 AU → 27.3 天）。 */
  let moonPeriod = input.moonPeriodDays ?? 29.53
  if (typeof input.moonSemiMajorAu === 'number' && input.moonSemiMajorAu > 0) {
    const planetMass = (input.planetMassEarth ?? 1) / 332946
    const periodYears = Math.sqrt((input.moonSemiMajorAu ** 3) / planetMass)
    moonPeriod = periodYears * 365.25
  }
  if (!(rotationHours > 0)) throw new Error('自转周期必须为正')
  if (!(orbitDays > 0)) throw new Error('公转周期必须为正')

  /** 一年 = 公转（地球日）× 24 / 本地日长（小时）。 */
  const yearDays = (orbitDays * 24) / rotationHours
  const yearDaysInteger = Math.floor(yearDays)
  const yearDaysFraction = yearDays - yearDaysInteger

  /** 闰年：按小数部分选规则（地球 0.2422 → 4 年一闰；0.25 附近同样）。 */
  let leapRule: string
  if (yearDaysFraction < 1 / 400) leapRule = '无闰（年长几乎是整数天）'
  else if (yearDaysFraction > 0.24 && yearDaysFraction < 0.26) leapRule = '4 年一闰（每 4 年加 1 天）'
  else if (yearDaysFraction > 0.36 && yearDaysFraction < 0.39) leapRule = '3 年一闰（小数约 1/3）'
  else leapRule = '按小数部分 ' + yearDaysFraction.toFixed(4) + ' 天：每 ' + Math.round(1 / yearDaysFraction) + ' 年加 1 天'

  /** 季节：倾角决定。 */
  let season: string
  if (obliquity < 3) season = '几乎无季节（倾角 < 3°）'
  else if (obliquity < 10) season = '弱季节（倾角 ' + obliquity.toFixed(1) + '°）'
  else if (obliquity <= 35) season = '四季分明（倾角 ' + obliquity.toFixed(1) + '°）'
  else if (obliquity <= 60) season = '极端季节（倾角 ' + obliquity.toFixed(1) + '°，冬夏温差大）'
  else season = '倾角 ' + obliquity.toFixed(1) + '°：接近侧躺，极区半年极昼/极夜'

  /** 卫星月（本地日）。 */
  const lunarMonthDays = moonCount > 0 ? (moonPeriod * 24) / rotationHours : null

  /** 历法类型。 */
  let calendarType = '太阳历（按年定历）'
  if (lunarMonthDays !== null) {
    const monthsPerYear = yearDays / lunarMonthDays
    if (Math.abs(monthsPerYear - Math.round(monthsPerYear)) < 0.02) calendarType = '纯太阴历或纯太阳历（月年几乎整除）'
    else calendarType = '阴阳历（一年约 ' + monthsPerYear.toFixed(2) + ' 个太阴月，需要闰月）'
  }

  /** 分至点：太阳黄经 0/90/180/270（近似均分公转）。 */
  const names = ['春分（黄经 0°）', '夏至（黄经 90°）', '秋分（黄经 180°）', '冬至（黄经 270°）']
  const solstices = names.map((name, index) => ({ name, dayOfYear: (yearDays * index) / 4 }))

  const notes: string[] = []
  notes.push('一天 = ' + rotationHours.toFixed(2) + ' 小时（本地日）')
  notes.push('一年 = ' + yearDays.toFixed(4) + ' 本地日 = ' + yearDaysInteger + ' 天 + ' + (yearDaysFraction * 24).toFixed(2) + ' 小时')
  notes.push('闰年：' + leapRule)
  notes.push('季节：' + season)
  if (lunarMonthDays !== null) notes.push('太阴月 = ' + lunarMonthDays.toFixed(2) + ' 本地日')
  notes.push('历法类型：' + calendarType)
  notes.push('分至点是均分近似（真实日期取决于轨道偏心率与近日点位置）')

  return { dayHours: rotationHours, yearDays, yearDaysInteger, yearDaysFraction, leapRule, season, lunarMonthDays, calendarType, solstices, notes }
}
// ───────────────────────────── 历法换算（2026-11-16） ─────────────────────────────

/** 历法换算输入。 */
export interface CalendarConvertInput {
  /** 自转小时。 */
  rotationHours?: number
  /** 公转地球日。 */
  orbitDays?: number
  /** 倾角。 */
  obliquityDeg?: number
  /** 目标年份（1 起）。 */
  year?: number
  /** 年内第几天（0 起，默认 0）。 */
  dayOfYear?: number
  /** 或：绝对天数（从历元起，优先于 year/dayOfYear）。 */
  absoluteDay?: number
  /** 闰年周期（年，默认按小数自动）。 */
  leapEvery?: number
}

/** 历法换算结果。 */
export interface CalendarConvertResult {
  /** 该年天数（含闰）。 */
  daysInYear: number
  /** 该年是否闰年。 */
  leap: boolean
  /** 第 year 年、第 dayOfYear 天（0 起）对应的绝对天数。 */
  absoluteDay: number
  /** 反推：年 / 年内第几天。 */
  resolvedYear: number
  resolvedDayOfYear: number
  /** 季节（按分至点均分）。 */
  season: string
  /** 太阳黄经（度，均分近似）。 */
  solarLongitudeDeg: number
}

/**
 * 历法 ↔ 日期换算（使用与 deriveCalendar 相同的年长规则）。
 *
 * @param input - 历法参数与目标日期
 * @returns 换算结果
 */
export function convertCalendarDate(input: CalendarConvertInput): CalendarConvertResult {
  const rotationHours = input.rotationHours ?? 24
  const orbitDays = input.orbitDays ?? 365.2422
  const obliquity = input.obliquityDeg ?? 23.44
  if (!(rotationHours > 0) || !(orbitDays > 0)) throw new Error('自转/公转必须为正')
  const yearDays = (orbitDays * 24) / rotationHours
  const baseDays = Math.floor(yearDays)
  const fraction = yearDays - baseDays
  /** 闰年周期：默认按小数 4 年一闰（0.25 附近），否则按 1/fraction。 */
  const leapEvery = input.leapEvery ?? (fraction > 0.24 && fraction < 0.26 ? 4 : Math.max(2, Math.round(1 / Math.max(fraction, 1e-9))))
  const isLeap = (year: number): boolean => year > 0 && year % leapEvery === 0
  const daysInYear = (year: number): number => baseDays + (isLeap(year) ? 1 : 0)
  /** 绝对天数 → 年/年内日。 */
  let absolute = 0
  if (typeof input.absoluteDay === 'number' && input.absoluteDay >= 0) {
    absolute = Math.floor(input.absoluteDay)
  } else {
    const year = Math.max(1, Math.floor(input.year ?? 1))
    let sum = 0
    for (let y = 1; y < year; y += 1) sum += daysInYear(y)
    absolute = sum + Math.max(0, Math.floor(input.dayOfYear ?? 0))
  }
  let resolvedYear = 1
  let remaining = absolute
  while (remaining >= daysInYear(resolvedYear)) {
    remaining -= daysInYear(resolvedYear)
    resolvedYear += 1
    if (resolvedYear > 1e6) break
  }
  const resolvedDayOfYear = remaining
  const solarLongitudeDeg = (resolvedDayOfYear / daysInYear(resolvedYear)) * 360
  const season = obliquity < 3 ? '无季节（倾角 < 3°）' : solarLongitudeDeg < 90 ? '春' : solarLongitudeDeg < 180 ? '夏' : solarLongitudeDeg < 270 ? '秋' : '冬'
  return { daysInYear: daysInYear(resolvedYear), leap: isLeap(resolvedYear), absoluteDay: absolute, resolvedYear, resolvedDayOfYear, season, solarLongitudeDeg }
}
