/**
 * operation="world" 的实现。
 *
 * 从 index.ts 原样迁出（纯搬迁：逻辑、错误消息、输出文本逐字未改）。
 */

import { toJsonValue, type JsonValue } from '../format.js'
import { describeTerrain, type TerrainClimatology, type TerrainParams } from '../terrain.js'
import { generateWorld, type WorldParams, type WorldProfile } from '../world.js'
import { MODEL_CONSTANTS, describeProvenance, provenanceSummary } from '../provenance.js'
import { CalcError, type MathArgs, type Outcome } from './shared.js'

/**
 * `world`：输入基础常数，输出整个星球的体感画像。
 *
 * 这是「世界观推演」的总入口：不用逐条调公式，改几个常数就能拿到
 * 重力、昼夜、季节、气候带、地形上限、大气稀薄度这些读者实际会感知到的量。
 */
export function opWorld(args: MathArgs, precision: number): Outcome {
  const params: WorldParams = (args.world ?? {}) as WorldParams

  // 允许把常用参数直接写在顶层，减少嵌套
  const shorthand: WorldParams = {}
  if (typeof args.planetRadius === 'number') shorthand.planetRadius = args.planetRadius
  if (typeof args.planetMass === 'number') shorthand.planetMass = args.planetMass
  if (typeof args.rotationHours === 'number') shorthand.rotationHours = args.rotationHours
  if (typeof args.obliquityDeg === 'number') shorthand.obliquityDeg = args.obliquityDeg
  const merged: WorldParams = { ...shorthand, ...params }

  let profile: WorldProfile
  try {
    profile = generateWorld(merged)
  } catch (error) {
    throw new CalcError('internal', `世界推演出错: ${error instanceof Error ? error.message : String(error)}`)
  }

  const lines: string[] = []
  const f = (value: number, digits = 2): string => Number(value.toFixed(digits)).toString()

  lines.push('══════ 星球体感画像 ══════')
  lines.push('')

  // 读者最先感知的
  lines.push('【最直观的几件事】')
  for (const item of profile.highlights) lines.push(`  · ${item}`)

  lines.push('')
  lines.push('【恒星与轨道】')
  lines.push(`  恒星: ${f(profile.star.luminositySun, 3)} 倍太阳光度，表面温度 ${f(profile.star.tempK, 0)}K`)
  lines.push(`  轨道: ${f(profile.orbit.semiMajorAxisAU, 3)} AU，偏心率 ${f(profile.orbit.eccentricity, 3)}`)
  lines.push(`  一年: ${f(profile.orbit.yearDays, 0)} 个地球日`)
  if (profile.orbit.eccentricity > 0.05) {
    lines.push(`  近日/远日温度差: ±${f(profile.orbit.perihelionTempDeltaPercent, 1)}%`)
  }

  lines.push('')
  lines.push('【行星本体】')
  lines.push(`  半径 ${f(profile.planet.radiusM / 1000, 0)} km，质量 ${f((profile.planet.massKg / 5.9722e24), 3)} 地球`)
  lines.push(`  平均密度 ${f(profile.planet.densityKgM3, 0)} kg/m³`)
  lines.push(`  表面重力 ${f(profile.planet.surfaceGravity, 2)} m/s²（地球的 ${f(profile.planet.surfaceGravityEarth, 2)} 倍）`)
  lines.push(`  逃逸速度 ${f(profile.planet.escapeVelocity / 1000, 2)} km/s`)
  lines.push(`  一天 ${f(profile.planet.dayHours, 1)} 小时`)
  if (profile.planet.centrifugalRatio > 0.05) {
    lines.push(`  赤道离心/重力比 ${f(profile.planet.centrifugalRatio, 3)}`)
  }

  lines.push('')
  lines.push('【温度】')
  lines.push(`  辐射平衡温度 ${f(profile.temperature.equilibriumK, 1)}K`)
  lines.push(`  含温室后表面平均 ${f(profile.temperature.surfaceMeanK, 1)}K = ${f(profile.temperature.surfaceMeanC, 1)}°C`)
  lines.push(`  水的沸点 ${f(profile.temperature.boilingPointC, 1)}°C，冰点 ${f(profile.temperature.freezingPointK - 273.15, 1)}°C`)

  lines.push('')
  lines.push('【大气】')
  lines.push(`  海平面气压 ${f(profile.atmosphere.pressureAtm, 3)} atm`)
  lines.push(`  大气标高 ${f(profile.atmosphere.scaleHeightM / 1000, 2)} km（地球 8.5km）`)
  lines.push(`  气压减半高度 ${f(profile.atmosphere.altitudeHalfPressure / 1000, 2)} km`)
  lines.push(`  气压降到 1/10 高度 ${f(profile.atmosphere.altitudeTenthPressure / 1000, 2)} km`)

  lines.push('')
  lines.push('【纬度气候带】（粗略估算，真实气候还取决洋流与地形）')
  lines.push('  纬度  夏至正午高度  冬至正午高度  夏至昼长  冬至昼长   年均温      气候带')
  for (const band of profile.latitudeBands) {
    const cells = [
      `${band.latitudeDeg}°`.padEnd(6),
      `${f(band.noonElevationSummer, 1)}°`.padEnd(14),
      `${f(band.noonElevationWinter, 1)}°`.padEnd(14),
      `${f(band.dayLengthSummer, 1)}h`.padEnd(10),
      `${f(band.dayLengthWinter, 1)}h`.padEnd(11),
      `${f(band.approxTempC, 1)}°C`.padEnd(11),
      band.zone,
    ]
    lines.push('  ' + cells.join(' '))
  }

  lines.push('')
  lines.push('【地形与视野】')
  lines.push(`  材料能支撑的最大山高 ${f(profile.terrain.maxMountainHeight / 1000, 2)} km`)
  lines.push(`  雪线高度 ${f(profile.terrain.snowLineM / 1000, 2)} km`)
  lines.push(`  地平线距离（1.7m 眼高）${f(profile.terrain.horizonKm, 2)} km`)
  lines.push(`  季节: ${profile.terrain.seasonStrength}`)

  lines.push('')
  lines.push('【恒星结构与寿命】')
  const st = profile.stellar
  lines.push(`  ${st.massSun.toFixed(2)} M☉：L=${st.luminositySun.toFixed(3)} L☉，R=${st.radiusSun.toFixed(3)} R☉，有效温度 ${f(st.effectiveTempK, 0)} K`)
  lines.push(
    `  主序寿命 ${st.lifetimeGyr < 1 ? (st.lifetimeGyr * 1000).toFixed(0) + ' Myr' : st.lifetimeGyr.toFixed(1) + ' Gyr'}；` +
      `宜居带 ${f(st.habitableZoneAU[0], 2)}–${f(st.habitableZoneAU[1], 2)} AU；紫外占 ${f(st.uvFraction * 100, 1)}%`,
  )
  for (const item of st.sensitivity) {
    lines.push(`  · [${item.confidence === 'exact' ? '精确' : item.confidence === 'empirical' ? '经验' : item.confidence === 'order-of-magnitude' ? '量级' : '仅方向'}] ${item.direction}：${item.magnitude}`)
  }

  lines.push('')
  lines.push('【抬头看见什么】（地表观测者视角）')
  const sky = profile.sky
  lines.push(
    `  恒星: ${sky.star.colorName}（${sky.star.colorHex}），${sky.star.spectralClass} 型，辐射峰值 ${f(sky.star.peakWavelengthNm, 0)} nm`,
  )
  lines.push(
    `  天上大小 ${f(sky.star.angularDiameterDeg, 2)}°（太阳 0.53°），视星等 ${f(sky.star.apparentMagnitude, 1)}`,
  )
  lines.push(`  谱线特征: ${sky.star.spectralLines}`)
  lines.push(`  ${sky.day.description}`)
  lines.push(`  ${sky.night.description}`)
  lines.push(
    `  夜空基色 ${sky.night.zenithColorHex}（无月夜空亮度 ${f(sky.night.darkSkyBrightness, 1)} mag/arcsec²）`,
  )

  lines.push('')
  lines.push('【卫星系统】（希尔球 / 洛希极限 / 稳定性）')
  const ms = profile.moonSystem
  lines.push(
    `  希尔球 ${f(ms.hillRadiusKm, 0)} km；洛希极限 ${f(ms.rocheLimitKm, 0)} km；` +
      `稳定轨道 ${f(ms.stableInnerKm, 0)}–${f(ms.stableOuterKm, 0)} km`,
  )
  lines.push(`  容量估算 ${ms.maxMoonCount} 颗；系统判定 ${ms.stable ? '稳定' : '不稳定'}`)
  if (ms.moons.length > 0) {
    for (const moon of ms.moons) lines.push(`  · ${moon.name}: ${moon.impression}`)
    if (ms.resonances.length > 0) lines.push(`  共振: ${ms.resonances.join('；')}`)
  } else {
    lines.push('  无卫星——两条边界仍然成立，只是没有天体占据。')
  }

  // ── 模型可信度（ADR-0001）──
  //
  // 这一段不是凑数：作者最需要知道的正是"哪个数字能当真"。
  lines.push('')
  lines.push('【模型可信度】（哪些是物理、哪些只是地球标定）')
  for (const line of describeProvenance()) lines.push('  ' + line)

  if (profile.warnings.length > 0) {
    lines.push('')
    lines.push('⚠ 一致性警告（这些是设定上的硬伤，建议调整参数）')
    for (const warning of profile.warnings) lines.push(`  · ${warning}`)
  }

  lines.push('')
  lines.push('以上「纬度气候带」为辐射平衡估算，实际气候还需考虑自转方向、洋流、大陆分布与山脉走向。')

  // ── 局部地形推演（可选）──
  if (args.terrain && typeof args.terrain === 'object') {
    const terrainParams: TerrainParams = { ...args.terrain }
    // 纬度未指定则用局部推演自己给的默认值；温度基准取该纬度带的估算值
    if (terrainParams.latitudeDeg === undefined) {
      const band = profile.latitudeBands.find((b) => b.latitudeDeg === 45) ?? profile.latitudeBands[0]
      terrainParams.latitudeDeg = band.latitudeDeg
      terrainParams.baseTempK = band.approxTempK
    } else {
      // 就近匹配气候带作为基准温度
      const nearest = profile.latitudeBands.reduce((best, b) =>
        Math.abs(b.latitudeDeg - terrainParams.latitudeDeg!) < Math.abs(best.latitudeDeg - terrainParams.latitudeDeg!)
          ? b
          : best,
      )
      if (terrainParams.baseTempK === undefined) terrainParams.baseTempK = nearest.approxTempK
      if (terrainParams.annualPrecipMm === undefined) {
        // 由干旱指数反推一个合理基准降水
        terrainParams.annualPrecipMm = 800
      }
    }

    let local: TerrainClimatology
    try {
      local = describeTerrain(terrainParams)
    } catch (error) {
      throw new CalcError('internal', `局部地形推演出错: ${error instanceof Error ? error.message : String(error)}`)
    }

    const t = local.terrain
    const fmt = (value: number, digits = 1): string => Number(value.toFixed(digits)).toString()

    lines.push('')
    lines.push('══════ 局部地形气候 ══════')
    lines.push(`  地点类型: ${t.kind}  海拔 ${fmt(t.elevationM, 0)}m  纬度 ${fmt(terrainParams.latitudeDeg ?? 45, 0)}°`)
    lines.push('')
    lines.push('【温湿】')
    lines.push(`  年均温 ${fmt(t.meanTempC)}°C（相对该纬度基准 ${t.tempAnomaly >= 0 ? '+' : ''}${fmt(t.tempAnomaly)}K）`)
    lines.push(`  昼夜温差 ${fmt(t.diurnalRangeK, 0)}K，年温差 ${fmt(t.seasonalRangeK, 0)}K`)
    lines.push(`  年降水 ${fmt(t.annualPrecipMm, 0)}mm（${t.precipPattern}）`)
    lines.push(`  相对湿度 ${fmt(t.humidity * 100, 0)}%`)
    lines.push('')
    lines.push('【农事】')
    lines.push(`  生长季 ${t.growingSeasonDays} 天，无霜期 ${t.frostFreeDays} 天`)
    lines.push(`  潜在蒸散 ${fmt(t.potentialEvapotranspiration, 0)}mm/年，干旱指数 ${fmt(t.aridityIndex, 2)}`)
    lines.push(`  土壤: ${t.soilProfile}`)
    lines.push(`  宜居性: ${t.habitability}`)
    lines.push('')
    lines.push('【垂直地带性】')
    lines.push(`  雪线 ${fmt(t.snowLineM / 1000, 2)}km，林线 ${fmt(t.treeLineM / 1000, 2)}km`)

    if (local.visibleEffects.length > 0) {
      lines.push('')
      lines.push('【读者会直接感知到的】')
      for (const effect of local.visibleEffects) lines.push(`  · ${effect}`)
    }

    if (local.phenomena.length > 0) {
      lines.push('')
      lines.push('【局地气候机制】')
      for (const phenomenon of local.phenomena) lines.push(`  · ${phenomenon}`)
    }

    lines.push('')
    lines.push('注：局地气候为经验估算，精度低于前面的代数公式。')

    // 把局部结果也塞进 value
    const baseValue = toJsonValue({
      star: profile.star,
      orbit: profile.orbit,
      planet: profile.planet,
      temperature: profile.temperature,
      atmosphere: profile.atmosphere,
      latitudeBands: profile.latitudeBands,
      terrain: profile.terrain,
      climate: profile.climate,
      starClass: profile.starClass,
      moons: profile.moons,
      moonSystem: profile.moonSystem,
      sky: profile.sky,
      stellar: profile.stellar,
      calendar: profile.calendar,
      warnings: profile.warnings,
      highlights: profile.highlights,
      provenance: { summary: provenanceSummary(), constants: MODEL_CONSTANTS },
    }) as { [key: string]: JsonValue }

    return {
      result: lines.join('\n'),
      value: {
        ...baseValue,
        localTerrain: toJsonValue(local) as JsonValue,
      },
    }
  }

  return {
    result: lines.join('\n'),
    value: toJsonValue({
      star: profile.star,
      orbit: profile.orbit,
      planet: profile.planet,
      temperature: profile.temperature,
      atmosphere: profile.atmosphere,
      latitudeBands: profile.latitudeBands,
      terrain: profile.terrain,
      climate: profile.climate,
      starClass: profile.starClass,
      moons: profile.moons,
      moonSystem: profile.moonSystem,
      sky: profile.sky,
      stellar: profile.stellar,
      calendar: profile.calendar,
      warnings: profile.warnings,
      highlights: profile.highlights,
      provenance: { summary: provenanceSummary(), constants: MODEL_CONSTANTS },
    }),
  }
}
