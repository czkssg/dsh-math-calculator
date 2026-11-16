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
  if (zoneName.includes('温带大陆性')) return 0.35
  if (zoneName.includes('温带')) return 0.6
  if (zoneName.includes('针叶林')) return 0.15
  if (zoneName.includes('冻土')) return 0.05
  if (zoneName.includes('苔原')) return 0.02
  if (zoneName.includes('冰原')) return 0.001
  if (zoneName.includes('干旱')) return 0.01
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
  const temperatureC: number[][] = []
  const precipitationMm: number[][] = []
  const zone: string[][] = []
  const stepX = Math.max(1, Math.floor(cols / 24))
  for (let y = 0; y < rows; y += 1) {
    const lat = (y / rows - 0.5) * 180
    const absLat = Math.abs(lat)
    const annualMean = annualMeanTemperature(lat, globalMeanK, greenhouseK, pressureAtm)
    temperatureC.push([])
    precipitationMm.push([])
    zone.push([])
    for (let x = 0; x < cols; x += 1) {
      const isLand = land[y][x]
      /** 海拔：把「海平面以上」的相对高度映射到 0–maxElev（否则 0–1 噪声当海拔会全冻结）。 */
      const rel = Math.max(0, (heights[y][x] - seaLevel) / Math.max(0.01, 1 - seaLevel))
      const elevation = rel * maxElev
      const tempC = annualMean - 273.15 - (elevation / 1000) * lapse - (isLand ? 0 : 1.5)
      temperatureC[y].push(tempC)
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
      const precip = Math.max(0, (basePrecip - distancePenalty) * wind + orographic)
      precipitationMm[y].push(precip)
      zone[y].push(climateZone(lat, tempC, true, Math.abs(tempC) * 0.4 + 6))
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
