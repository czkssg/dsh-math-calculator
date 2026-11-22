/**
 * 多层文本地图（给 AI 读）。
 *
 * ## 为什么分图层
 *
 * 一张图塞不下所有信息：政权归属、水系、地形各自是独立的推理证据。
 * 所以按 `layers` 分别输出，每层都是纯文本字符网格——AI 可以只取需要的那层，
 * 也可以叠起来看。矢量图留给「需要精细呈现」的场合。
 *
 * ## 图层
 *
 * - `powers`：政权归属（数字=政权编号，按真实国界光栅化）；
 * - `water`：水系（`≈` 河流、`o` 湖面）；
 * - `terrain`：地形（`^` 山脉、`#` 高原、`.` 沙漠、`_` 平原）；
 * - `all`：以上叠加（政权打底，水系与地形用符号覆盖）。
 *
 * @module dsh-math-calculator/features/deduction/earth-layers
 */

import { CalcError } from '../../core/errors.js'

/** 一国轮廓。 */
export interface LayerCountry {
  n: string
  zh: string
  lx: number
  ly: number
  p: number[][]
}

/** 水系。 */
export interface WaterData {
  rivers: number[][]
  lakes: number[][]
}

/** 地形区域。 */
export interface TerrainRegion {
  k: string
  n: string
  p: number[]
}

/** 海拔数据：山峰 + 区域典型高程。 */
export interface ElevationData {
  peaks: number[][]
  regions: Array<{ k: string; n: string; e: number; p: number[] }>
}

/** 政权。 */
export interface LayerPower {
  name: string
  color: string
  countries: string[]
}

/** 历史节点。 */
export interface LayerNode {
  name: string
  sub: string
  powers: LayerPower[]
}

/** 渲染选项。 */
export interface LayerOptions {
  width?: number
  height?: number
  viewBox?: [number, number, number, number]
  /** 要哪些层：powers / water / terrain / all（默认 all）。 */
  layers?: string[]
}

/** 射线法。 */
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

/** 线段是否穿过格（粗判定：采样中点）。 */
function segmentHits(lon: number, lat: number, dLon: number, dLat: number, line: number[]): boolean {
  for (let i = 0; i + 3 < line.length; i += 2) {
    const x1 = line[i]
    const y1 = line[i + 1]
    const x2 = line[i + 2]
    const y2 = line[i + 3]
    for (let t = 0; t <= 1; t += 0.25) {
      const px = x1 + (x2 - x1) * t
      const py = y1 + (y2 - y1) * t
      if (Math.abs(px - lon) <= dLon * 0.6 && Math.abs(py - lat) <= dLat * 0.6) return true
    }
  }
  return false
}

/** 河流包围盒预筛（缓存首次计算的 bbox）。 */
const riverBounds = new WeakMap<number[], { minLon: number; maxLon: number; minLat: number; maxLat: number }>()

function boundsOf(flat: number[]): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const cached = riverBounds.get(flat)
  if (cached !== undefined) return cached
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const lon = flat[i]
    const lat = flat[i + 1]
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const box = { minLon, maxLon, minLat, maxLat }
  riverBounds.set(flat, box)
  return box
}

function riverBox(flat: number[], lon: number, lat: number, dLon: number, dLat: number): boolean {
  const b = boundsOf(flat)
  return lon >= b.minLon - dLon && lon <= b.maxLon + dLon && lat >= b.minLat - dLat && lat <= b.maxLat + dLat
}

function lakeBox(flat: number[], lon: number, lat: number, dLon: number, dLat: number): boolean {
  const b = boundsOf(flat)
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat
}

/**
 * 渲染多层文本地图。
 *
 * @param countries - 国界
 * @param node - 历史节点
 * @param water - 水系
 * @param terrain - 地形区域
 * @param options - 尺寸/视图/层
 * @returns 各层文本
 */
export function renderLayers(
  countries: LayerCountry[],
  node: LayerNode,
  water: WaterData,
  terrain: TerrainRegion[],
  options: LayerOptions = {},
  elevation: ElevationData = { peaks: [], regions: [] },
): { text: string; cells: Record<string, number> } {
  const W = Math.max(40, Math.min(240, Math.floor(options.width ?? 120)))
  const H = Math.max(20, Math.min(120, Math.floor(options.height ?? Math.round(W / 2))))
  const view = options.viewBox ?? [-180, 90, 180, -90]
  const [lon0, lat0, lon1, lat1] = view
  const spanLon = Math.max(0.01, lon1 - lon0)
  const spanLat = Math.max(0.01, lat0 - lat1)
  const dLon = spanLon / W
  const dLat = spanLat / H
  const wantLayers = options.layers ?? ['all']
  const want = (name: string): boolean => wantLayers.includes('all') || wantLayers.includes(name)
  /**
   * 海拔分带（0–9 共 10 带，字符表示梯度）。
   * 海平面以下不画（归海洋）；500 m 以下用 '.'，越往高处字符越「重」。
   */
  const ELEV_CHARS = ['.', '-', ':', '=', '+', '*', 'x', 'X', '%', '@']
  const bandOf = (meters: number): number => {
    if (meters < 0) return -1
    if (meters < 200) return 0
    if (meters < 500) return 1
    if (meters < 1000) return 2
    if (meters < 1500) return 3
    if (meters < 2000) return 4
    if (meters < 3000) return 5
    if (meters < 4000) return 6
    if (meters < 5000) return 7
    if (meters < 6500) return 8
    return 9
  }
  /** 格点高程：区域典型高程 + 最近山峰的加权影响。 */
  const elevationAt = (lon: number, lat: number): number | null => {
    let base: number | null = null
    for (const region of elevation.regions) {
      if (inRing(lon, lat, region.p)) { base = region.e; break }
    }
    /** 山峰影响：3° 内按距离衰减抬高。 */
    let boost = 0
    for (const peak of elevation.peaks) {
      const pLon = peak[0]
      const pLat = peak[1]
      const pEl = peak[2]
      const dLon = Math.abs(lon - pLon) * Math.cos((lat * Math.PI) / 180)
      const dLat = lat - pLat
      const dist = Math.sqrt(dLon * dLon + dLat * dLat)
      if (dist > 3) continue
      boost = Math.max(boost, pEl * (1 - dist / 3))
    }
    if (base === null && boost === 0) return null
    return Math.max(base ?? 0, boost)
  }
  /** 政权格：数字编号。 */
  const powerOf = new Map<string, number>()
  node.powers.forEach((power, index) => { for (const name of power.countries) powerOf.set(name, index) })
  const boxes = countries.map((country) => {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90
    for (const poly of country.p) {
      for (let i = 0; i < poly.length; i += 2) {
        const lon = poly[i], lat = poly[i + 1]
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
    return { country, minLon, maxLon, minLat, maxLat }
  })
  const symbolOf = (index: number): string => (index < 10 ? String(index) : String.fromCharCode(55 + index))
  const cells: Record<string, number> = {}
  const grid: string[][] = []
  const terrainChar: Record<string, string> = { M: '^', P: '#', D: '.', L: '_', B: '~' }
  for (let row = 0; row < H; row += 1) {
    const lat = lat0 - (row + 0.5) * dLat
    const line: string[] = []
    for (let col = 0; col < W; col += 1) {
      const lon = lon0 + (col + 0.5) * dLon
      /** 1) 政权层。 */
      let ch = ' '
      if (want('powers')) {
        for (const box of boxes) {
          if (lon < box.minLon || lon > box.maxLon || lat < box.minLat || lat > box.maxLat) continue
          let inside = false
          for (const poly of box.country.p) { if (inRing(lon, lat, poly)) { inside = true; break } }
          if (!inside) continue
          const power = powerOf.get(box.country.n)
          if (power === undefined) { ch = '·'; break }
          ch = symbolOf(power)
          const key = node.powers[power].name
          cells[key] = (cells[key] ?? 0) + 1
          break
        }
      }
      /** 2) 水系层：先做包围盒预筛，避免 2145 段全量采样。 */
      if (want('water')) {
        for (const lake of water.lakes) {
          if (!lakeBox(lake, lon, lat, dLon, dLat)) continue
          if (inRing(lon, lat, lake)) { ch = 'o'; break }
        }
        if (ch !== 'o') {
          for (const river of water.rivers) {
            if (!riverBox(river, lon, lat, dLon, dLat)) continue
            if (segmentHits(lon, lat, dLon, dLat, river)) { ch = '≈'; break }
          }
        }
      }
      /** 3) 海拔层（分带字符，可单独看，也可与政权叠加）。 */
      if (want('elevation')) {
        const meters = elevationAt(lon, lat)
        if (meters !== null) {
          const band = bandOf(meters)
          if (band >= 0) ch = ELEV_CHARS[Math.min(ELEV_CHARS.length - 1, band)]
        }
      }
      /** 4) 地形层（区域类别符号，最低优先级）。 */
      if (want('terrain')) {
        for (const region of terrain) {
          if (!inRing(lon, lat, region.p)) continue
          const tc = terrainChar[region.k] ?? '?'
          if (ch === ' ' || ch === '·') ch = tc
          break
        }
      }
      line.push(ch)
    }
    grid.push(line)
  }
  /** 组装。 */
  const out: string[] = []
  out.push('═══ ' + node.name + ' · ' + node.sub + ' ═══')
  out.push('  视图 经度 ' + lon0 + '°…' + lon1 + '°，纬度 ' + lat0 + '°…' + lat1 + '°｜网格 ' + W + '×' + H)
  out.push('  图层：' + wantLayers.join(' + '))
  out.push('')
  const marks = Array.from({ length: W }, (_v, col) => (col % 10 === 0 ? '+' : '-'))
  out.push('    ' + marks.join(''))
  for (let row = 0; row < H; row += 1) {
    const lat = lat0 - (row + 0.5) * dLat
    const mark = row % 5 === 0 ? String(Math.round(lat)).padStart(3, ' ') + ' ' : '    '
    out.push(mark + grid[row].join(''))
  }
  out.push('')
  if (want('powers')) {
    out.push('  政权图例：')
    node.powers.forEach((power, index) => {
      out.push('    ' + symbolOf(index) + ' ' + power.name + '（' + (cells[power.name] ?? 0) + ' 格）')
    })
    out.push('    · 未划归政权的大陆')
  }
  if (want('water')) out.push('  水系图例：≈ 河流　o 湖泊' + (want('powers') ? '（覆盖在政权层上）' : ''))
  if (want('elevation')) {
    out.push('  海拔图例（米）：. <200　- 200-500　: 500-1k　= 1-1.5k　+ 1.5-2k')
    out.push('              * 2-3k　x 3-4k　X 4-5k　% 5-6.5k　@ >6.5k')
  }
  if (want('terrain')) out.push('  地形图例：^ 山脉　# 高原　. 沙漠　_ 平原　~ 盆地')
  out.push('  空白 = 海洋')
  return { text: out.join('\n'), cells }
}

/** 取节点。 */
export function pickLayerNode(nodes: Record<string, LayerNode>, key: string): LayerNode {
  const node = nodes[key.trim()]
  if (node === undefined) throw new CalcError('unknown_symbol', '没有历史节点「' + key + '」', '可用：' + Object.keys(nodes).join(' / ') + '。')
  return node
}