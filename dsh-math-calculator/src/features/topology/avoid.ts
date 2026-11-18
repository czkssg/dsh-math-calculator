/**
 * 面状地形绕障（`topology action:"avoid"`）。
 *
 * ## 为什么自写而不是引 @turf
 *
 * `@turf/shortest-path`（7.4.0）能用，但它依赖 `@turf/distance`——**地球半径写死**。
 * 本项目是架空世界推演，行星半径可改；引进来还得再拆一层。
 * 需求本身只是「多边形障碍 + 栅格 A*」，自写约 200 行且零依赖、半径可配。
 *
 * ## 口径
 *
 * - 经纬度按**局部平面近似**（以起终点中纬度为参考）转 km，输出长度用球面 haversine；
 * - 障碍是 [[lon, lat], ...] 的环（可不闭合），支持多个；
 * - `safetyKm` 把障碍膨胀一圈（绕城/禁飞区留余量）；
 * - 栅格分辨率默认 2 km，格子超过 400×400 会自动加粗并提示。
 *
 * @module dsh-math-calculator/features/topology/avoid
 */

/** 经纬度点。 */
export interface GeoPoint {
  lat: number
  lon: number
}

/** 绕障输入。 */
export interface AvoidParams {
  from: GeoPoint
  to: GeoPoint
  /** 障碍多边形（每个是 [[lon,lat],...]）。 */
  obstacles?: number[][][]
  /** 栅格分辨率 km（默认 2）。 */
  gridKm?: number
  /** 安全间距 km（默认 0）。 */
  safetyKm?: number
  /** 行星半径 km（默认 6371）。 */
  planetRadiusKm?: number
  /** 栅格单边上限（默认 400）。 */
  maxCells?: number
}

/** 绕障结果。 */
export interface AvoidResult {
  reachable: boolean
  /** 直线距离 km。 */
  straightKm: number
  /** 绕障路径长度 km。 */
  lengthKm: number
  /** 绕行比（length / straight）。 */
  detourRatio: number
  gridKm: number
  safetyKm: number
  /** 采样路径点。 */
  points: GeoPoint[]
  /** 栅格尺寸。 */
  grid: { width: number; height: number }
  /** 障碍个数。 */
  obstacleCount: number
  /** 栅格是否因规模被加粗。 */
  coarsened: boolean
}

/** 两点球面距离（km）。 */
export function haversineKm(a: GeoPoint, b: GeoPoint, radiusKm: number): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLon = (b.lon - a.lon) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 射线法：点是否在多边形内（lon/lat 平面）。 */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** 点到线段距离（km，局部平面近似）。 */
function distanceToSegmentKm(lon: number, lat: number, ax: number, ay: number, bx: number, by: number, kmPerLon: number, kmPerLat: number): number {
  const px = (lon - ax) * kmPerLon
  const py = (lat - ay) * kmPerLat
  const vx = (bx - ax) * kmPerLon
  const vy = (by - ay) * kmPerLat
  const lengthSq = vx * vx + vy * vy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * vx + py * vy) / lengthSq))
  const dx = px - t * vx
  const dy = py - t * vy
  return Math.sqrt(dx * dx + dy * dy)
}

/** 点到多边形边界的最近距离（km）。 */
function distanceToRingKm(lon: number, lat: number, ring: number[][], kmPerLon: number, kmPerLat: number): number {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const d = distanceToSegmentKm(lon, lat, ring[j][0], ring[j][1], ring[i][0], ring[i][1], kmPerLon, kmPerLat)
    if (d < best) best = d
  }
  return best
}

/** 小根堆（A* 的开放集）。 */
class MinHeap {
  private items: Array<{ index: number; priority: number }> = []
  get size(): number { return this.items.length }
  push(index: number, priority: number): void {
    this.items.push({ index, priority })
    let child = this.items.length - 1
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2)
      if (this.items[parent].priority <= this.items[child].priority) break
      const tmp = this.items[parent]
      this.items[parent] = this.items[child]
      this.items[child] = tmp
      child = parent
    }
  }
  pop(): { index: number; priority: number } | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last
      let parent = 0
      for (;;) {
        const left = parent * 2 + 1
        const right = left + 1
        let smallest = parent
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right
        if (smallest === parent) break
        const tmp = this.items[parent]
        this.items[parent] = this.items[smallest]
        this.items[smallest] = tmp
        parent = smallest
      }
    }
    return top
  }
}

/**
 * 栅格 A* 绕障。
 *
 * @param params - 起终点、障碍、栅格与行星半径
 * @returns 路径与长度；不可达时 reachable=false
 */
export function avoidRoute(params: AvoidParams): AvoidResult {
  const radiusKm = params.planetRadiusKm ?? 6371
  const safetyKm = Math.max(0, params.safetyKm ?? 0)
  const maxCells = Math.max(50, Math.min(1200, params.maxCells ?? 400))
  const obstacles = (params.obstacles ?? []).filter((ring) => Array.isArray(ring) && ring.length >= 3)
  const straightKm = haversineKm(params.from, params.to, radiusKm)

  /** 经纬度 → km 的比例（中纬度参考）。 */
  const kmPerDegLat = (radiusKm * Math.PI) / 180
  const midLat = ((params.from.lat + params.to.lat) / 2) * (Math.PI / 180)
  const kmPerLon = Math.max(1e-6, kmPerDegLat * Math.cos(midLat))
  const kmPerLat = kmPerDegLat

  /** 先按请求分辨率，超限则加粗。 */
  let gridKm = Math.max(0.05, params.gridKm ?? 2)
  const lats: number[] = [params.from.lat, params.to.lat]
  const lons: number[] = [params.from.lon, params.to.lon]
  for (const ring of obstacles) {
    for (const point of ring) {
      lons.push(Number(point[0]))
      lats.push(Number(point[1]))
    }
  }
  const marginKm = Math.max(3 * gridKm, safetyKm + 2 * gridKm)
  const minLat = Math.min(...lats) - marginKm / kmPerLat
  const maxLat = Math.max(...lats) + marginKm / kmPerLat
  const minLon = Math.min(...lons) - marginKm / kmPerLon
  const maxLon = Math.max(...lons) + marginKm / kmPerLon
  let coarsened = false
  for (let guard = 0; guard < 40; guard += 1) {
    const width = Math.ceil(((maxLon - minLon) * kmPerLon) / gridKm) + 1
    const height = Math.ceil(((maxLat - minLat) * kmPerLat) / gridKm) + 1
    if (width <= maxCells && height <= maxCells) break
    gridKm *= 1.25
    coarsened = true
  }
  const width = Math.min(maxCells, Math.ceil(((maxLon - minLon) * kmPerLon) / gridKm) + 1)
  const height = Math.min(maxCells, Math.ceil(((maxLat - minLat) * kmPerLat) / gridKm) + 1)

  const lonOf = (x: number): number => minLon + (x * gridKm) / kmPerLon
  const latOf = (y: number): number => minLat + (y * gridKm) / kmPerLat
  const xOf = (lon: number): number => Math.round(((lon - minLon) * kmPerLon) / gridKm)
  const yOf = (lat: number): number => Math.round(((lat - minLat) * kmPerLat) / gridKm)

  /** 阻挡判定：多边形内，或距边界 < safety。 */
  const blockedAt = (lon: number, lat: number): boolean => {
    for (const ring of obstacles) {
      if (pointInRing(lon, lat, ring)) return true
      if (safetyKm > 0 && distanceToRingKm(lon, lat, ring, kmPerLon, kmPerLat) < safetyKm) return true
    }
    return false
  }
  const blocked = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      blocked[y * width + x] = blockedAt(lonOf(x), latOf(y)) ? 1 : 0
    }
  }

  const start = { x: Math.max(0, Math.min(width - 1, xOf(params.from.lon))), y: Math.max(0, Math.min(height - 1, yOf(params.from.lat))) }
  const target = { x: Math.max(0, Math.min(width - 1, xOf(params.to.lon))), y: Math.max(0, Math.min(height - 1, yOf(params.to.lat))) }
  if (blocked[start.y * width + start.x] === 1) {
    throw new Error('起点落在障碍内（或安全间距覆盖范围内）')
  }
  if (blocked[target.y * width + target.x] === 1) {
    throw new Error('终点落在障碍内（或安全间距覆盖范围内）')
  }

  const NEIGHBOURS: Array<[number, number, number]> = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ]
  const gScore = new Float64Array(width * height).fill(Infinity)
  const fScore = new Float64Array(width * height).fill(Infinity)
  const cameFrom = new Int32Array(width * height).fill(-1)
  const closed = new Uint8Array(width * height)
  const startIndex = start.y * width + start.x
  const targetIndex = target.y * width + target.x
  const heuristic = (index: number): number => {
    const x = index % width
    const y = Math.floor(index / width)
    const dx = (x - target.x) * gridKm
    const dy = (y - target.y) * gridKm
    return Math.sqrt(dx * dx + dy * dy)
  }
  gScore[startIndex] = 0
  fScore[startIndex] = heuristic(startIndex)
  const open = new MinHeap()
  open.push(startIndex, fScore[startIndex])
  let found = false
  while (open.size > 0) {
    const current = open.pop()
    if (current === undefined) break
    const index = current.index
    if (closed[index] === 1) continue
    closed[index] = 1
    if (index === targetIndex) { found = true; break }
    const x = index % width
    const y = Math.floor(index / width)
    for (const [dx, dy, step] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nextIndex = ny * width + nx
      if (blocked[nextIndex] === 1 || closed[nextIndex] === 1) continue
      const tentative = gScore[index] + step * gridKm
      if (tentative < gScore[nextIndex]) {
        gScore[nextIndex] = tentative
        fScore[nextIndex] = tentative + heuristic(nextIndex)
        cameFrom[nextIndex] = index
        open.push(nextIndex, fScore[nextIndex])
      }
    }
  }

  if (!found) {
    return {
      reachable: false, straightKm, lengthKm: Infinity, detourRatio: Infinity,
      gridKm, safetyKm, points: [], grid: { width, height }, obstacleCount: obstacles.length, coarsened,
    }
  }

  /** 回溯并简化（合并同方向段，最多保留 200 点）。 */
  const cells: Array<{ x: number; y: number }> = []
  for (let index = targetIndex; index !== -1; index = cameFrom[index]) {
    cells.push({ x: index % width, y: Math.floor(index / width) })
    if (index === startIndex) break
  }
  cells.reverse()
  const simplified: Array<{ x: number; y: number }> = []
  for (let i = 0; i < cells.length; i += 1) {
    const prev = cells[i - 1]
    const next = cells[i + 1]
    if (prev === undefined || next === undefined) { simplified.push(cells[i]); continue }
    const d1x = cells[i].x - prev.x
    const d1y = cells[i].y - prev.y
    const d2x = next.x - cells[i].x
    const d2y = next.y - cells[i].y
    if (d1x !== d2x || d1y !== d2y) simplified.push(cells[i])
  }
  const stride = Math.max(1, Math.ceil(simplified.length / 200))
  const points: GeoPoint[] = []
  for (let i = 0; i < simplified.length; i += stride) points.push({ lat: latOf(simplified[i].y), lon: lonOf(simplified[i].x) })
  const last = simplified[simplified.length - 1]
  if (last !== undefined) points.push({ lat: latOf(last.y), lon: lonOf(last.x) })

  let lengthKm = 0
  for (let i = 1; i < points.length; i += 1) lengthKm += haversineKm(points[i - 1], points[i], radiusKm)
  return {
    reachable: true,
    straightKm,
    lengthKm,
    detourRatio: straightKm > 0 ? lengthKm / straightKm : 1,
    gridKm,
    safetyKm,
    points,
    grid: { width, height },
    obstacleCount: obstacles.length,
    coarsened,
  }
}
