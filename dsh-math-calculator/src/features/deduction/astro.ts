/**
 * 天文历表：astronomy-engine（MIT，纯 JS，高精度）。
 *
 * ## 为什么接它
 *
 * `world` 只给「行星级气候」（均温/昼夜），没有真实天文历表。
 * 接上之后可以算：某日某地的日出日落、太阳高度角、月相、日照时长——
 * 用来**校准架空世界的气候**（拿同纬度地球实测对照）。
 *
 * ## 能力边界
 *
 * 只算**真实地球**的天文（astronomy-engine 是地球历表）；架空行星的轨道周期/倾角
 * 由 `world` 负责，两者不混用。
 *
 * @module dsh-math-calculator/features/deduction/astro
 */

import { CalcError } from '../../core/errors.js'

/** 输入。 */
export interface AstroInput {
  /** sun / rise-set / moon / position / orbit / binary。 */
  action?: string
  /** orbit：轨道根数 {a,e,i,omega,w,M0,centralMass,bodyMass}。 */
  elements?: Record<string, unknown>
  /** orbit：历元后时间（年）。 */
  years?: number
  /** binary：{massA,massB,semiMajorAu,e}。 */
  binary?: Record<string, unknown>
  /** system：{starMass, planets:[{name,a,e,massEarth,radiusEarth,moons}]}。 */
  system?: Record<string, unknown>
  /** tech：{device, precision, yearErrorDays}。 */
  device?: string
  /** tech 的精度参数（mm/角分/秒/天）。 */
  precision?: number
  /** tech calendar-drift：年长误差（天）。 */
  yearErrorDays?: number

  /** calendar：{rotationHours, orbitDays, obliquityDeg, moonCount, moonPeriodDays}。 */
  rotationHours?: number
  /** 公转周期（地球日）。 */
  orbitDays?: number
  /** 倾角（度）。 */
  obliquityDeg?: number
  /** 卫星数。 */
  moonCount?: number
  /** 卫星周期（地球日）。 */
  moonPeriodDays?: number

  /** gravity/relativity：{massKg, radiusM, speedMps, separationM, bodies, point}。 */
  massKg?: number
  /** 半径（m）。 */
  radiusM?: number
  /** 速度（m/s）。 */
  speedMps?: number
  /** 潮汐分离距离（m）。 */
  separationM?: number
  /** N 体引力源 [{massKg, positionM:[x,y,z]}]。 */
  bodies?: Array<Record<string, unknown>>
  /** N 体计算点 [x,y,z]（m）。 */
  point?: number[]
  /** ISO 时间（缺省当前）。 */
  date?: string
  /** 纬度（度，北正）。 */
  lat?: number
  /** 经度（度，东正）。 */
  lon?: number
  /** 海拔（米）。 */
  elevation?: number
}

/** 结果。 */
export interface AstroOutcome {
  result: string
  value: unknown
}

/**
 * 执行天文计算。
 *
 * @param input - 输入
 * @returns 结果
 * @throws {CalcError} 参数缺失/日期非法
 */
export async function runAstro(input: AstroInput = {}): Promise<AstroOutcome> {
  const action = typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim() : 'rise-set'
  const lat = typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : 0
  const lon = typeof input.lon === 'number' && Number.isFinite(input.lon) ? input.lon : 0
  const elevation = typeof input.elevation === 'number' ? input.elevation : 0
  if (Math.abs(lat) > 90) throw new CalcError('invalid_argument', 'lat 必须在 -90..90（收到 ' + lat + '）', '')
  if (Math.abs(lon) > 180) throw new CalcError('invalid_argument', 'lon 必须在 -180..180（收到 ' + lon + '）', '')
  const date = input.date !== undefined && input.date.trim() !== '' ? new Date(input.date) : new Date()
  if (Number.isNaN(date.getTime())) throw new CalcError('invalid_argument', '日期解析失败：' + String(input.date), '用 ISO 格式，如 2026-06-21T12:00:00Z。')

  const A = await import('astronomy-engine')
  const observer = new A.Observer(lat, lon, elevation)
  /** orbit / binary 是通用二体模型（可架空），其余是真实地球历表。 */
  const isGeneric = ['orbit', 'binary', 'system', 'gravity', 'relativity', 'calendar', 'tech'].includes(action)
  const lines: string[] = [isGeneric ? '═══ 天文（通用轨道模型）═══' : '═══ 天文历表（地球）═══', '']
  lines.push('  观测点 ' + lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°，海拔 ' + elevation + ' m')
  lines.push('  时刻 ' + date.toISOString())

  /** 任意天体的开普勒轨道（把 astronomy-engine 的模型推广到非太阳系天体）。 */
  if (action === 'orbit') {
    const orbitMod = await import('./orbit.js')
    const raw = input.elements ?? {}
    const elements = {
      a: Number(raw['a'] ?? 1),
      e: Number(raw['e'] ?? 0),
      i: Number(raw['i'] ?? 0),
      omega: Number(raw['omega'] ?? 0),
      w: Number(raw['w'] ?? 0),
      M0: Number(raw['M0'] ?? 0),
      centralMass: Number(raw['centralMass'] ?? 1),
      bodyMass: Number(raw['bodyMass'] ?? 0),
    }
    const state = orbitMod.orbitState(elements, typeof input.years === 'number' ? input.years : 0)
    lines.push('', '【轨道（开普勒）】')
    lines.push('  半长轴 ' + elements.a.toFixed(3) + ' AU，偏心率 ' + elements.e.toFixed(4) + '，周期 ' + state.periodYears.toFixed(3) + ' 年')
    lines.push('  平近点角 ' + state.meanAnomaly.toFixed(1) + '°，真近点角 ' + state.trueAnomaly.toFixed(1) + '°，距离 ' + state.radiusAu.toFixed(4) + ' AU')
    lines.push('  位置 (' + state.positionAu.x.toFixed(3) + ', ' + state.positionAu.y.toFixed(3) + ', ' + state.positionAu.z.toFixed(3) + ') AU')
    return { result: lines.join('\n'), value: { elements, state } }
  }

  if (action === 'binary') {
    const orbitMod = await import('./orbit.js')
    const raw = input.binary ?? {}
    const system = { massA: Number(raw['massA'] ?? 1), massB: Number(raw['massB'] ?? 0.5), semiMajorAu: Number(raw['semiMajorAu'] ?? 1), e: Number(raw['e'] ?? 0) }
    if (!(system.massA > 0) || !(system.massB > 0)) throw new CalcError('invalid_argument', 'binary 需要正质量 massA / massB', '')
    const result = orbitMod.binaryOrbit(system)
    lines.push('', '【双星互绕】')
    lines.push('  主星 ' + system.massA + ' M☉ + 伴星 ' + system.massB + ' M☉，半长轴 ' + system.semiMajorAu + ' AU')
    lines.push('  周期 ' + result.periodYears.toFixed(3) + ' 年')
    lines.push('  质心距：主星 ' + result.aStarAu.toFixed(3) + ' AU，伴星 ' + result.aCompanionAu.toFixed(3) + ' AU（速度比 ' + result.velocityRatio.toFixed(2) + '）')
    lines.push('  相对速度约 ' + result.relativeSpeedKms.toFixed(1) + ' km/s')
    return { result: lines.join('\n'), value: { system, result } }
  }

  if (action === 'system') {
    const sysMod = await import('./system.js')
    const raw = input.system ?? {}
    const planets = Array.isArray(raw['planets']) ? (raw['planets'] as Array<Record<string, unknown>>) : []
    if (planets.length === 0) throw new CalcError('missing_params', 'astro system 需要 planets（至少一颗）', '例如 {action:"system", system:{starMass:1, planets:[{name:"地球", a:1, massEarth:1}]}}。')
    const result = sysMod.buildPlanetarySystem({ starMass: Number(raw['starMass'] ?? 1), planets: planets.map((p) => ({ name: String(p['name'] ?? ''), a: Number(p['a'] ?? 1), e: Number(p['e'] ?? 0), i: Number(p['i'] ?? 0), massEarth: Number(p['massEarth'] ?? 1), radiusEarth: Number(p['radiusEarth'] ?? 1), moons: Array.isArray(p['moons']) ? (p['moons'] as Array<Record<string, unknown>>).map((m) => ({ name: String(m['name'] ?? ''), a: Number(m['a'] ?? 0) })) : [] })), years: typeof input.years === 'number' ? input.years : 0 })
    lines.push('', '【行星系统】')
    lines.push('  恒星 ' + result.starMass + ' M☉，行星 ' + result.planets.length + ' 颗')
    for (const planet of result.planets) {
      lines.push('  ' + planet.name + '：a=' + planet.semiMajorAu.toFixed(3) + ' AU，周期 ' + planet.periodYears.toFixed(3) + ' 年，希尔球 ' + planet.hillAu.toFixed(5) + ' AU，卫星 ' + planet.moons.length + ' 颗')
      for (const moon of planet.moons) lines.push('    ' + moon.name + '：a=' + moon.semiMajorAu.toFixed(5) + ' AU，周期 ' + moon.periodYears.toFixed(3) + ' 年' + (moon.insideRoche ? '（洛希内）' : moon.outsideHill ? '（希尔外）' : ''))
    }
    if (result.warnings.length > 0) { lines.push('', '【稳定性提示】'); for (const w of result.warnings) lines.push('  · ' + w) }
    return { result: lines.join('\n'), value: result }
  }

  if (action === 'tech') {
    const techMod = await import('./astrotech.js')
    const result = techMod.deriveAstroTech({
      device: typeof input.device === 'string' ? input.device : undefined,
      precision: typeof input.precision === 'number' ? input.precision : undefined,
      latitudeDeg: typeof input.lat === 'number' ? input.lat : undefined,
      yearErrorDays: typeof input.yearErrorDays === 'number' ? input.yearErrorDays : undefined,
    })
    lines.push('', '【天文观测 → 科技】')
    for (const note of result.notes) lines.push('  ' + note)
    return { result: lines.join('\n'), value: result }
  }

  if (action === 'calendar') {
    const calMod = await import('./calendar.js')
    const result = calMod.deriveCalendar({
      rotationHours: typeof input.rotationHours === 'number' ? input.rotationHours : undefined,
      orbitDays: typeof input.orbitDays === 'number' ? input.orbitDays : undefined,
      obliquityDeg: typeof input.obliquityDeg === 'number' ? input.obliquityDeg : undefined,
      moonCount: typeof input.moonCount === 'number' ? input.moonCount : undefined,
      moonPeriodDays: typeof input.moonPeriodDays === 'number' ? input.moonPeriodDays : undefined,
    })
    lines.push('', '【历法推导】')
    for (const note of result.notes) lines.push('  ' + note)
    lines.push('', '  分至点（本地日）：')
    for (const s of result.solstices) lines.push('    ' + s.name + '：第 ' + s.dayOfYear.toFixed(1) + ' 日')
    return { result: lines.join('\n'), value: result }
  }

  if (action === 'gravity') {
    const g = await import('./gravity.js')
    const extra: Record<string, unknown> = {}
    const massKg = typeof input.massKg === 'number' ? input.massKg : 0
    if (!(massKg > 0)) throw new CalcError('missing_params', 'astro gravity 需要 massKg（质量，kg）', '例如 {action:"gravity", massKg:5.9722e24, radiusM:6371000}。')
    const radiusM = typeof input.radiusM === 'number' ? input.radiusM : 0
    lines.push('', '【引力】')
    lines.push('  质量 ' + massKg.toExponential(4) + ' kg' + (radiusM > 0 ? '，半径 ' + radiusM.toExponential(4) + ' m' : ''))
    if (radiusM > 0) {
      const ve = g.escapeVelocity(massKg, radiusM)
      const vc = g.circularVelocity(massKg, radiusM)
      lines.push('  逃逸速度 ' + (ve / 1000).toFixed(2) + ' km/s（' + (ve / g.C).toFixed(3) + ' c）')
      lines.push('  圆轨道速度 ' + (vc / 1000).toFixed(2) + ' km/s')
      const tid = typeof input.separationM === 'number' ? g.tidalAcceleration(massKg, radiusM, input.separationM) : null
      if (tid !== null) lines.push('  潮汐加速度（分离 ' + input.separationM + ' m）' + tid.toExponential(3) + ' m/s²')
      const regime = g.classifyRegime(massKg, radiusM)
      lines.push('  引力区间：' + (regime.isBlackHole ? '黑洞' : regime.beta > 0.5 ? '致密天体（强相对论）' : regime.beta > 0.1 ? '致密天体（中）' : '常规天体（弱场）'))
      extra['regime'] = regime
    }
    if (Array.isArray(input.bodies) && Array.isArray(input.point)) {
      const bodies = input.bodies.map((b) => ({ massKg: Number(b['massKg'] ?? 0), positionM: (b['positionM'] as number[]).map(Number) as [number, number, number] }))
      const acc = g.nBodyAcceleration(bodies, input.point as [number, number, number])
      lines.push('  N 体加速度 (' + acc.map((a) => a.toExponential(3)).join(', ') + ') m/s²')
    }
    return { result: lines.join('\n'), value: { massKg, radiusM, ...extra } }
  }

  if (action === 'relativity') {
    const g = await import('./gravity.js')
    const massKg = typeof input.massKg === 'number' ? input.massKg : 0
    if (!(massKg > 0)) throw new CalcError('missing_params', 'astro relativity 需要 massKg', '例如 {action:"relativity", massKg:1.98847e30}。')
    const rs = g.schwarzschildRadius(massKg)
    lines.push('', '【相对论（史瓦西）】')
    lines.push('  史瓦西半径 ' + rs.toExponential(4) + ' m')
    lines.push('  光子球 ' + g.photonSphere(massKg).toExponential(4) + ' m，ISCO ' + g.iscoRadius(massKg).toExponential(4) + ' m')
    const radiusM = typeof input.radiusM === 'number' && input.radiusM > rs ? input.radiusM : rs * 2
    const speed = typeof input.speedMps === 'number' ? input.speedMps : 0
    const dtau = g.totalTimeDilation(massKg, radiusM, speed)
    lines.push('  在 r=' + radiusM.toExponential(4) + ' m、v=' + (speed / 1000).toFixed(1) + ' km/s 处：dτ/dt = ' + dtau.toFixed(6))
    lines.push('  引力红移 z = ' + g.gravitationalRedshift(massKg, radiusM).toFixed(6))
    return { result: lines.join('\n'), value: { massKg, schwarzschildM: rs, photonSphereM: g.photonSphere(massKg), iscoM: g.iscoRadius(massKg), dtau, redshift: g.gravitationalRedshift(massKg, radiusM) } }
  }

  if (action === 'sun' || action === 'position') {
    const eq = A.Equator(A.Body.Sun, date, observer, true, true)
    const horizon = A.Horizon(date, observer, eq.ra, eq.dec, 'normal')
    lines.push('', '【太阳】')
    lines.push('  赤纬 ' + eq.dec.toFixed(3) + '°，赤经 ' + eq.ra.toFixed(3) + 'h')
    lines.push('  高度角 ' + horizon.altitude.toFixed(2) + '°，方位角 ' + horizon.azimuth.toFixed(1) + '°')
    return { result: lines.join('\n'), value: { lat, lon, date: date.toISOString(), sun: { ra: eq.ra, dec: eq.dec, altitude: horizon.altitude, azimuth: horizon.azimuth } } }
  }

  if (action === 'moon') {
    const phase = A.MoonPhase(date)
    const illum = A.Illumination(A.Body.Moon, date)
    /** 光照比例 = (1 + cos(相位角))/2。 */
    const lit = (1 + Math.cos((illum.phase_angle * Math.PI) / 180)) / 2
    lines.push('', '【月亮】')
    lines.push('  相位角 ' + phase.toFixed(1) + '°，光照比例 ' + (lit * 100).toFixed(1) + '%')
    lines.push('  视星等 ' + illum.mag.toFixed(2))
    return { result: lines.join('\n'), value: { lat, lon, date: date.toISOString(), moon: { phaseAngle: phase, illuminated: lit, magnitude: illum.mag } } }
  }

  if (action === 'rise-set') {
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    /** 从 dayStart 前一天起搜，避免「当天的日出」被取成次日（跨 UTC 日界）。 */
    const rise = A.SearchRiseSet(A.Body.Sun, observer, 1, new Date(dayStart.getTime() - 86400000), 1)
    const set = A.SearchRiseSet(A.Body.Sun, observer, -1, dayStart, 1)
    const noonEq = A.Equator(A.Body.Sun, new Date(dayStart.getTime() + 12 * 3600 * 1000), observer, true, true)
    const noonHorizon = A.Horizon(new Date(dayStart.getTime() + 12 * 3600 * 1000), observer, noonEq.ra, noonEq.dec, 'normal')
    lines.push('', '【日出日落】')
    if (rise === null && set === null) {
      lines.push('  极昼或极夜（这一天太阳不升/不落）')
      return { result: lines.join('\n'), value: { lat, lon, date: date.toISOString(), polar: true, rise: null, set: null } }
    }
    const riseText = rise !== null ? rise.date.toISOString() : '无（极昼）'
    const setText = set !== null ? set.date.toISOString() : '无（极夜）'
    /** 跨 UTC 日界时 set-rise 为负 → 取绝对值（实际日照时长）。 */
    const dayLength = rise !== null && set !== null ? Math.abs(set.date.getTime() - rise.date.getTime()) / 3600000 : null
    lines.push('  日出 ' + riseText)
    lines.push('  日落 ' + setText)
    if (dayLength !== null) lines.push('  日照时长 ' + dayLength.toFixed(2) + ' 小时')
    lines.push('  正午太阳高度约 ' + noonHorizon.altitude.toFixed(1) + '°')
    return { result: lines.join('\n'), value: { lat, lon, date: date.toISOString(), rise: rise?.date.toISOString() ?? null, set: set?.date.toISOString() ?? null, dayLengthHours: dayLength, noonAltitude: noonHorizon.altitude } }
  }

  throw new CalcError('unknown_argument', '不认识的 astro 动作「' + action + '」', '可用：sun（太阳位置）/ rise-set（日出日落）/ moon（月相）/ position（同 sun）。')
}
