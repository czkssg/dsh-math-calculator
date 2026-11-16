/**
 * 气候层（网格适配）：复用 climate.ts 的温度/分区模型，补降水与可耕率。
 *
 * ## 为什么是「适配层」而不是重写
 *
 * climate.ts 已有精确模型：annualMeanTemperature（纬度+温室+气压）、
 * climateZone（温度/液态溶剂/年较差）。这里只做「逐格调用 + 降水」，不重复实现。
 *
 * @module dsh-math-calculator/features/deduction/grid-climate
 */

import { annualMeanTemperature, climateZone } from './climate.js'
import { fitPlanetClimate } from './climate-model.js'

/** 输入。 */
export interface GridClimateInput {
  /** 高度网格（0–1）。 */
  heights: number[][]
  /** 陆地网格。 */
  land: boolean[][]
  /** 全球平均温度 K（默认 288）。 */
  globalMeanK?: number
  /** 温室增量 K（默认 33）。 */
  greenhouseK?: number
  /** 气压 atm（默认 1）。 */
  pressureAtm?: number
  /** 海拔上限 m（默认 2500；陆地平均低平）。 */
  maxElevationM?: number
  /** 海平面高度（0–1，默认 0.61，与 world-map 一致）。 */
  seaLevel?: number
  /** 海拔递减率 K/km（默认 6.5）。 */
  lapseRateKPerKm?: number
  /** 风带强度（默认 1）。 */
  windStrength?: number
  /** 恒星辐射（地球=1）。 */
  stellarFlux?: number
  /** 倾角（度，默认 23.44）。 */
  obliquityDeg?: number
  /** 自转（小时，默认 23.93）。 */
  rotationHours?: number
  /** 陆地占比（默认 0.29）。 */
  landRatio?: number
}

/** 结果。 */
export interface GridClimateResult {
  temperatureC: number[][]
  precipitationMm: number[][]
  zone: string[][]
  zoneShare: Record<string, number>
  arableRatio: number
  notes: string[]
}

/** 各分区可耕率（按分区名匹配）。 */
function arableOf(zoneName: string): number {
  if (zoneName.includes('热带雨林')) return 0.35
  if (zoneName.includes('热带')) return 0.4
  if (zoneName.includes('亚热带')) return 0.45
  if (zoneName.includes('温带寒')) return 0.3
  if (zoneName.includes('温带大陆性')) return 0.35
  if (zoneName.includes('温带')) return 0.6
  if (zoneName.includes('针叶林')) return 0.15
  if (zoneName.includes('冻土')) return 0.05
  if (zoneName.includes('苔原')) return 0.02
  if (zoneName.includes('冰原')) return 0.001
  if (zoneName.includes('干旱（沙漠）')) return 0.01
  if (zoneName.includes('半干旱')) return 0.18
  return 0.2
}

/**
 * 逐格算气候。
 *
 * @param input - 网格与行星参数
 * @returns 温度/降水/分区/可耕率
 * @throws {Error} 网格尺寸不一致
 */
export function computeGridClimate(input: GridClimateInput): GridClimateResult {
  const heights = input.heights
  const land = input.land
  const rows = heights.length
  const cols = heights[0]?.length ?? 0
  if (rows === 0 || cols === 0) throw new Error('高度网格为空')
  if (land.length !== rows || land[0]?.length !== cols) throw new Error('海陆网格与高度网格尺寸不一致')
  const globalMeanK = input.globalMeanK ?? 288
  const greenhouseK = input.greenhouseK ?? 33
  const pressureAtm = input.pressureAtm ?? 1
  const maxElev = input.maxElevationM ?? 2500
  const seaLevel = input.seaLevel ?? 0.61
  const lapse = input.lapseRateKPerKm ?? 6.5
  const wind = input.windStrength ?? 1
  /** 通用气候拟合（地球标定）：给纬度温度/降水基线，地形只做局部修正。 */
  const fit = fitPlanetClimate({ stellarFlux: input.stellarFlux, obliquityDeg: input.obliquityDeg, rotationHours: input.rotationHours, greenhouseK: input.greenhouseK, pressureAtm: input.pressureAtm, landRatio: input.landRatio })
  const latitudeTemp = (lat: number): number => {
    const abs = Math.abs(lat)
    const lower = fit.curve[Math.min(6, Math.floor(abs / 15))]
    return lower.meanTempC
  }
  const temperatureC: number[][] = []
  const precipitationMm: number[][] = []
  const zone: string[][] = []
  const stepX = Math.max(1, Math.floor(cols / 24))
  for (let y = 0; y < rows; y += 1) {
    const lat = (y / rows - 0.5) * 180
    const absLat = Math.abs(lat)
    /** 拟合基线（地球标定），若给了非地球 flux 也已折算。 */
    const annualMean = latitudeTemp(lat) + 273.15
    temperatureC.push([])
    precipitationMm.push([])
    zone.push([])
    for (let x = 0; x < cols; x += 1) {
      const isLand = land[y][x]
      /** 海拔：把「海平面以上」的相对高度映射到 0–maxElev（否则 0–1 噪声当海拔会全冻结）。 */
      const rel = Math.max(0, (heights[y][x] - seaLevel) / Math.max(0.01, 1 - seaLevel))
      const elevation = rel * maxElev
      let tempC = annualMean - 273.15 - (elevation / 1000) * lapse - (isLand ? 0 : 1.5)
      let distanceToSea = 0
      if (isLand) {
        let nearest = Infinity
        for (let dx = 0; dx < cols; dx += stepX) {
          if (!land[y][dx]) nearest = Math.min(nearest, Math.abs(dx - x))
        }
        distanceToSea = Number.isFinite(nearest) ? Math.min(10, nearest / stepX) : 6
      }
      const band = absLat < 20 ? 'trade' : absLat < 60 ? 'west' : 'polar'
      const dir = band === 'west' ? -1 : 1
      const prevX = (x + dir + cols) % cols
      const prevElev = Math.max(0, heights[y][prevX]) * maxElev
      const uphill = elevation - prevElev
      const orographic = uphill > 0 ? Math.min(2000, uphill * 0.02) : Math.max(-1200, uphill * 0.015)
      const itcz = Math.max(0, 1 - absLat / 20)
      const subtropics = Math.max(0, 1 - Math.abs(absLat - 30) / 15)
      const polarFront = Math.max(0, 1 - Math.abs(absLat - 60) / 20)
      const basePrecip = 300 + itcz * 2200 + polarFront * 900 - subtropics * 500 + (isLand ? 0 : 400)
      const distancePenalty = isLand ? Math.min(600, distanceToSea * 60) : 0
      const basePrecipValue = Math.max(0, (basePrecip - distancePenalty) * wind + orographic)
      /** 极宏观三机制：季风、洋流、云。 */
      const circulation = coarseCirculation(lat, basePrecipValue, isLand, input.landRatio ?? 0.29)
      const precip = Math.max(0, basePrecipValue * circulation.monsoonFactor)
      precipitationMm[y].push(precip)
      /** 洋流与云修正温度（叠加在基础温度上）。 */
      const circulationTempK = circulation.currentTempK + circulation.cloudTempK
      tempC += circulationTempK
      temperatureC[y].push(tempC)
      /** 分区：温度类来自 climateZone；再按降水修正干旱（沙漠/草原）。 */
      const thermalZone = climateZone(lat, tempC, true, Math.abs(tempC) * 0.4 + 6)
      const arid = precip < 200 ? '干旱（沙漠）' : precip < 450 ? '半干旱（草原）' : thermalZone
      zone[y].push(arid)
    }
  }
  const zoneShare: Record<string, number> = {}
  let landArea = 0
  let arableArea = 0
  for (let y = 0; y < rows; y += 1) {
    const weight = Math.cos((y / rows - 0.5) * Math.PI)
    for (let x = 0; x < cols; x += 1) {
      if (!land[y][x]) continue
      landArea += weight
      const name = zone[y][x]
      zoneShare[name] = (zoneShare[name] ?? 0) + weight
      arableArea += weight * arableOf(name)
    }
  }
  for (const key of Object.keys(zoneShare)) zoneShare[key] = landArea > 0 ? zoneShare[key] / landArea : 0
  const arableRatio = landArea > 0 ? arableArea / landArea : 0
  const notes = [
    '温度：复用 climate.ts 的 annualMeanTemperature（纬度+温室+气压），海拔递减 ' + lapse + ' K/km',
    '降水：ITCZ/副高/极锋 + 距海衰减 + 迎风坡地形雨 - 背风坡雨影',
    '分区：' + Object.entries(zoneShare).map(([key, value]) => key + ' ' + (value * 100).toFixed(1) + '%').join('、'),
    '可耕率 ' + (arableRatio * 100).toFixed(1) + '%（温带 60%、热带 40%、草原 35%、沙漠 1%、苔原 2%）',
  ]
  return { temperatureC, precipitationMm, zone, zoneShare, arableRatio, notes }
}
/**
 * 极宏观大气/海洋/云（粗到只剩几个常数）。
 *
 * 三个机制各用一个式子，不做流体求解：
 * - **季风**：海陆热力差 → 夏季 / 冬季降水增减；
 * - **洋流**：风带驱动的纬向输送 + 大陆阻挡 → 沿岸温度 ±2 K；
 * - **云**：云量 = f(降水) → 昼遮阳/夜保温，温度 ∓1–2 K。
 *
 * @param lat - 纬度（度）
 * @param precipMm - 基础降水
 * @param isLand - 是否陆地
 * @param landRatio - 陆地占比
 * @returns 三项修正
 */
export function coarseCirculation(lat: number, precipMm: number, isLand: boolean, landRatio: number): { monsoonFactor: number; currentTempK: number; cloudTempK: number; cloudCover: number } {
  const absLat = Math.abs(lat)
  /** 季风：低纬 + 大块陆地 → 强；海陆比越大越强。 */
  const latWeight = Math.max(0, 1 - Math.abs(absLat - 20) / 35)
  const monsoonStrength = latWeight * landRatio * 2
  /** 夏季风（海→陆）加雨、冬季风（陆→海）减雨；这里给**全年净值**（弱正）。 */
  const monsoonFactor = isLand ? 1 + monsoonStrength * 0.25 : 1 - monsoonStrength * 0.05
  /** 洋流：西风带（30–60°）向东输送暖流；信风带（0–30°）向西输送。 */
  const band = absLat < 30 ? -1 : absLat < 60 ? 1 : 0
  /** 沿岸（海陆交界附近）受洋流影响最大；这里按「陆地 + 低纬」近似暖流。 */
  const currentTempK = isLand ? band * (absLat < 45 ? 1.5 : 0.8) : band * 0.5
  /** 云：降水越多云越厚（0–0.9），厚云昼遮阳 → 净降温 1–2 K。 */
  const cloudCover = Math.min(0.9, precipMm / 2500)
  const cloudTempK = -cloudCover * 2.2 + (1 - cloudCover) * 0.3
  return { monsoonFactor, currentTempK, cloudTempK, cloudCover }
}
