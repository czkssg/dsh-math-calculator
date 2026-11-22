/**
 * 真实地球历史节点的**文本地图**（给 AI 读）。
 *
 * ## 为什么不再输出 SVG
 *
 * 地图的读者是 AI：它要的是「哪块地是谁的、相邻关系、大致方位」，
 * 而不是像素级配色。所以这里把 258 国多边形**实时光栅化**成字符网格，
 * 每格一个字符（政权编号）+ 边缘经纬度标尺——纯文本、几十 KB、可直接推理。
 *
 * ## 两种视图
 *
 * - `text`（默认）：字符网格 + 坐标标尺 + 政权清单；
 * - `svg`：需要给人看时才生成矢量图（体积大，默认不给）。
 *
 * @module dsh-math-calculator/features/deduction/earth-node-map
 */

import { CalcError } from '../../core/errors.js'

/** 一国轮廓（扁平经纬度数组）。 */
export interface BorderCountry {
  n: string
  zh: string
  lx: number
  ly: number
  p: number[][]
}

/** 政权。 */
export interface NodePower {
  name: string
  color: string
  countries: string[]
}

/** 历史节点。 */
export interface HistoryNode {
  name: string
  sub: string
  powers: NodePower[]
}

/** 字符地图选项。 */
export interface TextMapOptions {
  /** 网格宽（默认 120，40–300）。 */
  width?: number
  /** 网格高（默认 宽/2，20–160）。 */
  height?: number
  /** 视图窗口 [lon0, lat0, lon1, lat1]（局部放大）。 */
  viewBox?: [number, number, number, number]
  /** 是否标经纬度尺（默认 true）。 */
  ruler?: boolean
  /** 未划归政权的大陆字符（默认 '·'）。 */
  neutralChar?: string
}

/** 射线法：点是否在多边形内。 */
function inRing(lon: number, lat: number, ring: number[]): boolean {
  let inside = false
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i * 2]
    const yi = ring[i * 2 + 1]
    const xj = ring[j * 2]
    const yj = ring[j * 2 + 1]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * 光栅化成字符网格。
 *
 * @param borders - 国界数据
 * @param node - 历史节点
 * @param options - 网格与视图
 * @returns 文本地图与统计
 */
export function renderNodeTextMap(borders: BorderCountry[], node: HistoryNode, options: TextMapOptions = {}): { text: string; cells: Record<string, number> } {
  const W = Math.max(40, Math.min(300, Math.floor(options.width ?? 120)))
  const H = Math.max(20, Math.min(160, Math.floor(options.height ?? Math.round(W / 2))))
  const view = options.viewBox ?? [-180, 90, 180, -90]
  const [lon0, lat0, lon1, lat1] = view
  const spanLon = Math.max(0.01, lon1 - lon0)
  const spanLat = Math.max(0.01, lat0 - lat1)
  /** 每格对应的经纬度。 */
  const dLon = spanLon / W
  const dLat = spanLat / H
  /** 各国首点做快速包围盒，避免全量射线法。 */
  const boxes = borders.map((country) => {
    let minLon = 180
    let maxLon = -180
    let minLat = 90
    let maxLat = -90
    for (const poly of country.p) {
      for (let i = 0; i < poly.length; i += 2) {
        const lon = poly[i]
        const lat = poly[i + 1]
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
    return { country, minLon, maxLon, minLat, maxLat }
  })
  /** 政权 → 国家集合。 */
  const powerOfCountry = new Map<string, number>()
  node.powers.forEach((power, index) => {
    for (const name of power.countries) powerOfCountry.set(name, index)
  })
  const cells: Record<string, number> = {}
  const rows: string[] = []
  const neutral = options.neutralChar ?? '·'
  /** 政权编号字符：0-9 用数字，10-35 用 A-Z。 */
  const symbolOf = (index: number): string => (index < 10 ? String(index) : String.fromCharCode(55 + index))
  for (let row = 0; row < H; row += 1) {
    const lat = lat0 - (row + 0.5) * dLat
    let line = ''
    for (let col = 0; col < W; col += 1) {
      const lon = lon0 + (col + 0.5) * dLon
      let found = -1
      for (const box of boxes) {
        if (lon < box.minLon || lon > box.maxLon || lat < box.minLat || lat > box.maxLat) continue
        let inside = false
        for (const poly of box.country.p) {
          if (inRing(lon, lat, poly)) { inside = true; break }
        }
        if (!inside) continue
        const power = powerOfCountry.get(box.country.n)
        found = power === undefined ? -2 : power
        break
      }
      if (found === -1) { line += ' '; continue }
      if (found === -2) { line += neutral; continue }
      line += symbolOf(found)
      const key = node.powers[found].name
      cells[key] = (cells[key] ?? 0) + 1
    }
    rows.push(line)
  }
  /** 组装：标题 + 坐标尺 + 网格 + 图例。 */
  const out: string[] = []
  out.push('═══ ' + node.name + ' · ' + node.sub + ' ═══')
  out.push('  视图 经度 ' + lon0 + '°…' + lon1 + '°，纬度 ' + lat0 + '°…' + lat1 + '°｜网格 ' + W + '×' + H)
  out.push('')
  /**
   * 坐标尺：顶部标经度刻度，左侧标纬度。
   * 刻度线对齐「列」，数字对齐在刻度下方（4 字符前缀与数据行一致）。
   */
  if (options.ruler !== false) {
    const marks = Array.from({ length: W }, (_v, col) => (col % 10 === 0 ? '+' : '-'))
    out.push('    ' + marks.join(''))
    const labelLine = Array.from({ length: W }, () => ' ')
    for (let col = 0; col < W; col += 10) {
      const lon = Math.round(lon0 + (col + 0.5) * dLon)
      const label = (lon >= 0 ? '+' : '') + lon
      for (let i = 0; i < label.length && col + i < W; i += 1) labelLine[col + i] = label[i]
    }
    out.push('    ' + labelLine.join(''))
  }
  for (let row = 0; row < H; row += 1) {
    const lat = lat0 - (row + 0.5) * dLat
    const mark = options.ruler !== false && row % 5 === 0 ? String(Math.round(lat)).padStart(3, ' ') + ' ' : '    '
    out.push(mark + rows[row])
  }
  out.push('')
  out.push('  图例：')
  node.powers.forEach((power, index) => {
    const count = cells[power.name] ?? 0
    out.push('    ' + symbolOf(index) + ' ' + power.name + '（' + count + ' 格）')
  })
  out.push('    ' + neutral + ' 未划归政权的大陆　（空白 = 海洋）')
  return { text: out.join('\n'), cells }
}

/**
 * 取历史节点定义。
 *
 * @param nodes - 节点表
 * @param key - 节点键
 * @returns 节点
 * @throws {CalcError} 未知节点
 */
export function pickNode(nodes: Record<string, HistoryNode>, key: string): HistoryNode {
  const node = nodes[key.trim()]
  if (node === undefined) {
    throw new CalcError('unknown_symbol', '没有历史节点「' + key + '」', '可用：' + Object.keys(nodes).join(' / ') + '。')
  }
  return node
}