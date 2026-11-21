/**
 * 预存真实地球地图（历史时期）。
 *
 * ## 口径
 *
 * - 数据是**简化轮廓**（大陆多边形 + 政权圆近似 + 行政中心），非精确测绘；
 * - 用途：世界推演时给「地球该时期格局」作参照，不作测绘底图；
 * - 线字符：海岸 `~`、国界 `|`、政权内部行政线 `:`——都由精细格子判定后拟合。
 *
 * @module dsh-math-calculator/features/deduction/earth-maps
 */

import { CalcError } from '../../core/errors.js'

/** 大陆轮廓。 */
export interface Continent {
  name: string
  polygon: Array<[number, number]>
}

/** 时期政权（圆近似 + 行政中心）。 */
export interface EraPower {
  name: string
  lon: number
  lat: number
  radius: number
  /** 内部行政中心（Voronoi 子区）。 */
  admin?: Array<{ lon: number; lat: number }>
}

/** 时期。 */
export interface EraEntry {
  name: string
  powers: EraPower[]
}

/** 数据文件。 */
export interface EarthMapsFile {
  meta?: Record<string, unknown>
  continents: Continent[]
  erasData: Record<string, EraEntry>
}

/** 输入。 */
export interface EarthMapInput {
  era?: string
  width?: number
  height?: number
  asciiWidth?: number
}

/** 结果。 */
export interface EarthMapResult {
  era: string
  name: string
  ascii: string
  powers: Array<{ name: string; cells: number }>
  landRatio: number
  lines: { coast: number; border: number; admin: number }
}

/** 射线法：点是否在多边形内（经纬度）。 */
function inPolygon(lon: number, lat: number, polygon: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 圆近似：点是否在政权范围内。 */
function inPower(lon: number, lat: number, power: EraPower): boolean {
  const dLon = Math.min(Math.abs(lon - power.lon), 360 - Math.abs(lon - power.lon))
  const dLat = Math.abs(lat - power.lat)
  return dLon * dLon + dLat * dLat <= power.radius * power.radius
}

/** 最近行政中心（无 admin 时返回 -1）。 */
function nearestAdmin(lon: number, lat: number, power: EraPower): number {
  const centers = power.admin ?? []
  let best = -1
  let bestDist = Infinity
  for (let index = 0; index < centers.length; index += 1) {
    const dLon = Math.min(Math.abs(lon - centers[index].lon), 360 - Math.abs(lon - centers[index].lon))
    const dLat = Math.abs(lat - centers[index].lat)
    const dist = dLon * dLon + dLat * dLat
    if (dist < bestDist) { bestDist = dist; best = index }
  }
  return best
}

/**
 * 渲染某时期的地球 ASCII 图（线字符拟合大陆边缘/国界/行政线）。
 *
 * @param data - 内置数据
 * @param input - 时期与分辨率
 * @returns 结果
 * @throws {CalcError} 时期未知
 */
export function renderEarthMap(data: EarthMapsFile, input: EarthMapInput = {}): EarthMapResult {
  const era = typeof input.era === 'string' && input.era.trim() !== '' ? input.era.trim() : '2000'
  const entry = data.erasData[era]
  if (entry === undefined) {
    throw new CalcError('unknown_symbol', '没有时期「' + era + '」的预存地图', '可用：' + Object.keys(data.erasData).join(' / ') + '。')
  }
  const width = Math.max(72, Math.min(1440, Math.floor(input.width ?? 720)))
  const height = Math.max(36, Math.min(720, Math.floor(input.height ?? 360)))
  const aw = Math.max(40, Math.min(300, Math.floor(input.asciiWidth ?? 160)))
  const ah = Math.max(20, Math.min(150, Math.floor(Math.round(aw / 2))))
  const sx = width / aw
  const sy = height / ah

  const landGrid: boolean[][] = []
  const powerGrid: number[][] = []
  const adminGrid: number[][] = []
  for (let y = 0; y < height; y += 1) {
    const landRow: boolean[] = []
    const powerRow: number[] = []
    const adminRow: number[] = []
    const lat = 90 - ((y + 0.5) * 180) / height
    for (let x = 0; x < width; x += 1) {
      const lon = -180 + ((x + 0.5) * 360) / width
      let land = false
      for (const continent of data.continents) {
        if (inPolygon(lon, lat, continent.polygon)) { land = true; break }
      }
      landRow.push(land)
      let power = -1
      let admin = -1
      if (land) {
        for (let index = 0; index < entry.powers.length; index += 1) {
          if (inPower(lon, lat, entry.powers[index])) { power = index; break }
        }
        if (power >= 0) admin = nearestAdmin(lon, lat, entry.powers[power])
      }
      powerRow.push(power)
      adminRow.push(admin)
    }
    landGrid.push(landRow)
    powerGrid.push(powerRow)
    adminGrid.push(adminRow)
  }

  const powerCells = new Array<number>(entry.powers.length).fill(0)
  let landCells = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!landGrid[y][x]) continue
      landCells += 1
      const index = powerGrid[y][x]
      if (index >= 0) powerCells[index] += 1
    }
  }

  const symbolOf = (index: number): string => String.fromCharCode(65 + (index % 26))
  const lines: string[] = []
  lines.push('地球 ' + era + ' · ' + entry.name + ' | 等距投影 | 政权 ' + entry.powers.length + ' | 格 ' + width + '×' + height + ' | 图 ' + aw + ' 列')
  const stats = { coast: 0, border: 0, admin: 0 }
  for (let ry = 0; ry < ah; ry += 1) {
    const gy = Math.min(height - 1, Math.floor((ry + 0.5) * sy))
    let line = ''
    for (let rx = 0; rx < aw; rx += 1) {
      const gx = Math.min(width - 1, Math.floor((rx + 0.5) * sx))
      const xEnd = Math.min(gx + Math.max(1, Math.ceil(sx)), width)
      const yEnd = Math.min(gy + Math.max(1, Math.ceil(sy)), height)
      let hasLand = false
      let hasSea = false
      const powerOfCell = powerGrid[gy][gx]
      let boundary = false
      let adminBoundary = false
      for (let yy = gy; yy < yEnd; yy += 1) {
        for (let xx = gx; xx < xEnd; xx += 1) {
          if (landGrid[yy][xx]) hasLand = true
          else hasSea = true
          const otherPower = powerGrid[yy][xx]
          if (otherPower >= 0 && powerOfCell >= 0 && otherPower !== powerOfCell) boundary = true
          const otherAdmin = adminGrid[yy][xx]
          if (otherPower === powerOfCell && otherPower >= 0 && adminGrid[gy][gx] >= 0 && otherAdmin >= 0 && otherAdmin !== adminGrid[gy][gx]) adminBoundary = true
        }
      }
      if (hasLand && hasSea) { stats.coast += 1; line += '~'; continue }
      if (boundary) { stats.border += 1; line += '|'; continue }
      if (adminBoundary) { stats.admin += 1; line += ':'; continue }
      if (!landGrid[gy][gx]) { line += ' '; continue }
      if (powerOfCell < 0) { line += '·'; continue }
      line += symbolOf(powerOfCell)
    }
    lines.push(line)
  }
  lines.push('')
  for (let index = 0; index < entry.powers.length; index += 1) {
    lines.push('  ' + symbolOf(index) + ' ' + entry.powers[index].name + '（' + powerCells[index] + ' 格）')
  }
  lines.push('  · 未划归政权的大陆  ~ 海岸线  | 国界  : 行政线  ★ 简化轮廓，非精确测绘')

  return {
    era,
    name: entry.name,
    ascii: lines.join('\n'),
    powers: entry.powers.map((power, index) => ({ name: power.name, cells: powerCells[index] })),
    landRatio: landCells / (width * height),
    lines: stats,
  }
}