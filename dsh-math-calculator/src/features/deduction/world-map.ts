/**
 * 全球地图模拟（中等精度）：地形/地质/河流/矿产/国家边界，可编辑。
 *
 * ## 开源依据（先查再写）
 *
 * - **Azgaar/Fantasy-Map-Generator**（★6220）：完整的奇幻地图生成器，但许可是
 *   NOASSERTION（非标准宽松许可），**只借鉴算法思路，不引代码**；
 * - **simplex-noise** 4.0.3（MIT，109KB）：噪声场，✅ 用；
 * - **d3-delaunay** 6.0.6（ISC，141KB）：Voronoi 分区（国家边界），✅ 用。
 *
 * ## 精度
 *
 * 网格默认 180×90（16,200 格）——「中等精度」：能看出山脉走向、河流干流、国家分区，
 * 但不到气象/气候模拟的粒度。可调到 360×180（64,800 格），代价是计算时间。
 *
 * ## 可编辑
 *
 * `edits:[{x,y,height?,seaLevel?,nation?}]` —— 支持改地形（含海陆）、改国家归属。
 *
 * @module dsh-math-calculator/features/deduction/world-map
 */

import { Delaunay } from 'd3-delaunay'
import { createNoise2D } from 'simplex-noise'
import { CalcError } from '../../core/errors.js'
import { createPrng, roll, rollInt, seedFrom } from '../../core/prng.js'
import { computeGridClimate } from './grid-climate.js'

/** 世界拓扑。 */
export type WorldTopology = 'sphere' | 'plane'

/**
 * 网格两点距离（球体用大圆、平面用欧氏）。
 *
 * ## 为什么必须有
 *
 * 球体世界观里，「地图左边缘」与「右边缘」是**同一条经线**。
 * 若按平面欧氏算，AI 会以为要跨大半个地图，实际只有一步。
 *
 * @param input - 拓扑/网格/两点
 * @returns 距离（km 与格数）
 */
export function gridDistance(input: {
  topology?: WorldTopology
  width: number
  height: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  planetRadiusKm?: number
}): { km: number; cells: number; note: string } {
  const topology = input.topology ?? 'sphere'
  const radius = input.planetRadiusKm ?? 6371
  const width = input.width
  const height = input.height
  const dxRaw = input.to.x - input.from.x
  const dy = input.to.y - input.from.y
  if (topology === 'plane') {
    /** 平面：格宽按赤道周长折算。 */
    const cellKm = (2 * Math.PI * radius) / width
    const cells = Math.sqrt(dxRaw * dxRaw + dy * dy)
    return { km: cells * cellKm, cells, note: '平面（天圆地方）：欧氏距离，不环绕' }
  }
  /** 球体：x → 经度（环绕取最短），y → 纬度（两极收缩）。 */
  const lon1 = (input.from.x / width) * 360
  const lon2 = (input.to.x / width) * 360
  const lat1 = 90 - (input.from.y / height) * 180
  const lat2 = 90 - (input.to.y / height) * 180
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  const angle = 2 * Math.asin(Math.min(1, Math.sqrt(a)))
  const km = angle * radius
  /** 格数：按赤道格宽折算（高纬实际更短，这里给的是「等效格」）。 */
  const cellKm = (2 * Math.PI * radius) / width
  return { km, cells: km / cellKm, note: '球体：大圆距离，跨 180° 经线自动取最短（东西相邻）' }
}

/** 输入。 */
export interface WorldMapInput {
  /** 网格宽（默认 180）。 */
  width?: number
  /** 网格高（默认 90）。 */
  height?: number
  /** 随机种子。 */
  seed?: number
  /** 海平面（0–1，默认 0.5）。 */
  seaLevel?: number
  /** 山脉强度（默认 1）。 */
  mountainScale?: number
  /** 河流条数（默认 24）。 */
  riverCount?: number
  /** 国家数（默认 8）。 */
  nationCount?: number
  /** 矿产密度（每格概率，默认 0.02）。 */
  mineralDensity?: number
  /** 编辑：改格点高度/海陆/国家。 */
  edits?: Array<{ x: number; y: number; height?: number; seaLevel?: number; nation?: number; mineral?: number }>
  /** 是否输出 ASCII 缩略图（默认 true）。 */
  ascii?: boolean
  /** ASCII 图宽度（默认 120；20–240）。 */
  asciiWidth?: number
  /** ASCII 图高度（默认 宽度/2；10–160）。 */
  asciiHeight?: number
  /** 自定义重点区域（自主编辑格子粗细）：x/y 网格坐标、radius 范围、detail 子图列数（越大越细）。 */
  focusRegions?: Array<{ name?: string; x: number; y: number; radius?: number; detail?: number }>
  /**
   * 世界拓扑：
   * - `sphere`（默认）：球体星球——x 是经度（环绕），跨 180° 经线**不跨远路**；
   * - `plane`：天圆地方——平面网格，边界不环绕。
   */
  topology?: 'sphere' | 'plane'
  /** 星球半径 km（球体距离用，默认 6371）。 */
  planetRadiusKm?: number
  /** 查询两点距离（网格坐标）。 */
  distance?: { from: { x: number; y: number }; to: { x: number; y: number } }
  /** 是否叠加气候层（默认 false）。 */
  climate?: boolean
  /** 气候用：全球平均温度 K（默认 288）。 */
  globalMeanK?: number
  /** 气候用：温室增量 K（默认 33）。 */
  greenhouseK?: number
}

/** 地形类型。 */
export type TerrainKind = 'ocean' | 'coast' | 'plain' | 'hill' | 'mountain' | 'plateau' | 'valley'

/** 矿产。 */
export interface MineralDeposit {
  x: number
  y: number
  kind: string
  /** 储量等级（1–3）。 */
  grade: number
}

/** 结果。 */
export interface WorldMapResult {
  width: number
  height: number
  /** 高度网格（0–1）。格数 > 30 万时改给 heightsPacked（省体积）。 */
  heights: number[][]
  /** 量化高度（0–255 的 base64，行优先；小网格不给）。 */
  heightsPacked?: string
  /** 量化地形（每格 1 字节：0 海洋 1 海岸 2 平原 3 丘陵 4 山地 5 高原 6 河谷）。 */
  terrainPacked?: string
  /** 量化国家归属（int16 → base64，−1 为无主）。 */
  nationsPacked?: string
  /** 地形分类网格。 */
  terrain: string[][]
  /** 国家归属网格（-1 = 无主）。 */
  nations: number[][]
  /** 河流（每条是格点序列）。 */
  rivers: Array<Array<{ x: number; y: number }>>
  /** 矿产。 */
  minerals: MineralDeposit[]
  /** 统计。 */
  stats: {
    landRatio: number
    mountainRatio: number
    plainRatio: number
    riverCells: number
    mineralCount: number
    nationCount: number
  }
  /** 国界统计（边界格数 / 国家数）。 */
  borders?: { cells: number; nations: number }
  /** ASCII 地形图（可选：不给这个键，而不是给 undefined）。 */
  ascii?: string
  /** ASCII 国界图（数字=国家编号，| = 边界）。 */
  asciiBorders?: string
  /** 多尺度：重点区域局部精细子图（首都/经济中心/国界密集）。 */
  focusMaps?: Array<{ kind: string; name: string; x: number; y: number; ascii: string }>
  /** 世界拓扑。 */
  topology: 'sphere' | 'plane'
  /** 两点距离（给了 distance 才有）。 */
  distance?: { km: number; cells: number; note: string }
  /** 气候摘要（climate:true 才有）。 */
  climate?: { zoneShare: Record<string, number>; arableRatio: number; arableKm2: number; notes: string[] }
  notes: string[]
}

/**
 * 生成全球地图。
 *
 * @param input - 网格/种子/参数/编辑
 * @returns 地图
 * @throws {CalcError} 参数非法
 */
export function generateWorldMap(input: WorldMapInput = {}): WorldMapResult {
  /** 默认 720×360（0.5° 约 55 km/格）；上限 2880×1440（0.125° 约 14 km/格）。 */
  const width = Math.max(36, Math.min(1440, Math.floor(input.width ?? 720)))
  const height = Math.max(18, Math.min(1440, Math.floor(input.height ?? 360)))
  const seed = input.seed ?? 1
  /**
   * seaLevel 语义：**陆地目标占比**（0–1），默认 0.29（地球量级）。
   * 内部按分位数取阈值——这样「海陆分布可编辑」是直观的：给 0.1 就是 10% 陆地。
   */
  const landTarget = typeof input.seaLevel === 'number' ? input.seaLevel : 0.29
  const mountainScale = typeof input.mountainScale === 'number' ? input.mountainScale : 1
  /** 河流默认随面积增长（每约 6000 格一条，封顶 120）。 */
  const riverCount = Math.max(0, Math.floor(input.riverCount ?? Math.min(120, Math.max(12, Math.round((width * height) / 6000)))))
  const nationCount = Math.max(0, Math.floor(input.nationCount ?? 8))
  const mineralDensity = typeof input.mineralDensity === 'number' ? input.mineralDensity : 0.02
  if (!(landTarget > 0 && landTarget < 1)) throw new CalcError('invalid_argument', 'seaLevel（陆地目标占比）必须在 (0,1) 之间', '')
  /** 拓扑：球体（经度环绕）或平面（天圆地方）。 */
  const topology: WorldTopology = input.topology === 'plane' ? 'plane' : 'sphere'
  const prng = createPrng(seedFrom(seed, width, height))

  /** 多层 simplex 噪声（陆地高度场）。 */
  const noise2 = createNoise2D(() => roll(prng))
  const heights: number[][] = []
  for (let y = 0; y < height; y += 1) {
    const row: number[] = []
    for (let x = 0; x < width; x += 1) {
      const nx = x / width
      const ny = y / height
      /** 三层叠加：大陆尺度 + 山脉 + 细节。 */
      const continental = noise2(nx * 2.2, ny * 2.2) * 0.55
      const ridge = (1 - Math.abs(noise2(nx * 6.5, ny * 6.5))) * 0.3 * mountainScale
      const detail = noise2(nx * 16, ny * 16) * 0.15
      /** 纬度调制：两极更容易是海（简化）。 */
      const latFactor = Math.cos(((ny - 0.5) * Math.PI)) * 0.12
      row.push(continental + ridge + detail + latFactor)
    }
    heights.push(row)
  }
  /** 归一化：把噪声原始值映射到 0–1（否则海陆比不可控）。 */
  const flat = heights.flat()
  const sortedRaw = [...flat].sort((a, b) => a - b)
  const lo = sortedRaw[0]
  const hi = sortedRaw[sortedRaw.length - 1]
  const span = hi - lo || 1
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) heights[y][x] = (heights[y][x] - lo) / span
  /** 编辑：改高度与海平面。 */
  for (const edit of input.edits ?? []) {
    if (edit.x < 0 || edit.x >= width || edit.y < 0 || edit.y >= height) continue
    if (typeof edit.height === 'number') heights[edit.y][edit.x] = Math.max(0, Math.min(1, edit.height))
  }
  const effectiveLandTarget = input.edits?.reduce<number>((level, edit) => (typeof edit.seaLevel === 'number' ? edit.seaLevel : level), landTarget) ?? landTarget
  /**
   * 分位阈值（用**归一化后**的高度）：高于 (1−陆地占比) 分位的是陆地。
   * 球体时按**面积加权**分位（高纬格实际面积小），否则极地格会让陆地占比失真。
   */
  const weighted: Array<{ h: number; w: number }> = []
  for (let y = 0; y < height; y += 1) {
    const w = topology === 'sphere' ? Math.max(0.01, Math.cos(((y / height) - 0.5) * Math.PI)) : 1
    for (let x = 0; x < width; x += 1) weighted.push({ h: heights[y][x], w })
  }
  weighted.sort((a, b) => a.h - b.h)
  const targetArea = weighted.reduce((sum, item) => sum + item.w, 0) * (1 - effectiveLandTarget)
  let cumulative = 0
  let effectiveSea = 0.5
  for (const item of weighted) {
    cumulative += item.w
    if (cumulative >= targetArea) { effectiveSea = item.h; break }
  }

  /** 地形分类。 */
  const terrain: string[][] = []
  const isLand = (x: number, y: number): boolean => heights[y][x] > effectiveSea
  for (let y = 0; y < height; y += 1) {
    const row: string[] = []
    for (let x = 0; x < width; x += 1) {
      const h = heights[y][x]
      if (h <= effectiveSea) {
        /** 浅海边缘判海岸。 */
        const nearLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx
          const ny = y + dy
          return nx >= 0 && nx < width && ny >= 0 && ny < height && heights[ny][nx] > effectiveSea
        })
        row.push(nearLand ? 'coast' : 'ocean')
        continue
      }
      /** 相对高度：按「陆地可占区间」归一（海平面 0.71 时仍能分出山地）。 */
      const rel = (h - effectiveSea) / Math.max(0.01, 1 - effectiveSea)
      /** 坡度：与邻格高度差。 */
      const slope = Math.max(
        Math.abs(h - heights[Math.max(0, y - 1)][x]),
        Math.abs(h - heights[Math.min(height - 1, y + 1)][x]),
        Math.abs(h - heights[y][Math.max(0, x - 1)]),
        Math.abs(h - heights[y][Math.min(width - 1, x + 1)]),
      )
      if (rel > 0.45 * mountainScale) row.push('mountain')
      else if (rel > 0.3 && slope < 0.03) row.push('plateau')
      else if (slope > 0.06) row.push('hill')
      else if (rel < 0.06) row.push('valley')
      else row.push('plain')
    }
    terrain.push(row)
  }

  /** 河流：从高处出发沿下降方向流，入海或到边界。 */
  const rivers: Array<Array<{ x: number; y: number }>> = []
  const riverCells = new Set<string>()
  const landCells: Array<{ x: number; y: number; h: number }> = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (isLand(x, y)) landCells.push({ x, y, h: heights[y][x] })
  landCells.sort((a, b) => b.h - a.h)
  const candidates = landCells.slice(0, Math.max(1, Math.min(landCells.length, riverCount * 3)))
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  for (let index = 0; index < riverCount && index < candidates.length; index += 1) {
    const start = candidates[index * 2 % candidates.length]
    const path: Array<{ x: number; y: number }> = [{ x: start.x, y: start.y }]
    let cx = start.x
    let cy = start.y
    for (let step = 0; step < 400; step += 1) {
      if (!isLand(cx, cy)) break
      let best: { x: number; y: number; h: number } | null = null
      for (const [dx, dy] of dirs) {
        /** 球体：经度环绕（东西相邻）；平面：越界丢弃。 */
        const nx = topology === 'sphere' ? (cx + dx + width) % width : cx + dx
        const ny = cy + dy
        if (ny < 0 || ny >= height || (topology === 'plane' && (nx < 0 || nx >= width))) continue
        const nh = heights[ny][nx]
        if (best === null || nh < best.h) best = { x: nx, y: ny, h: nh }
      }
      if (best === null || best.h >= heights[cy][cx]) break
      cx = best.x
      cy = best.y
      path.push({ x: cx, y: cy })
    }
    if (path.length >= 3) {
      rivers.push(path)
      for (const cell of path) riverCells.add(cell.x + ',' + cell.y)
    }
  }
  /** 河床格改 valley（地形上更真实）。 */
  for (const key of riverCells) {
    const [x, y] = key.split(',').map(Number)
    terrain[y][x] = 'valley'
  }

  /** 矿产：按地质带分配。 */
  const minerals: MineralDeposit[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (roll(prng) > mineralDensity) continue
      const kindOfCell = terrain[y][x]
      let kind = ''
      if (kindOfCell === 'mountain') kind = ['铜', '铁', '金', '银', '锡'][rollInt(prng, 0, 4)]
      else if (kindOfCell === 'plateau') kind = ['煤', '铀', '稀土'][rollInt(prng, 0, 2)]
      else if (kindOfCell === 'plain' || kindOfCell === 'hill') kind = ['煤', '石油', '天然气'][rollInt(prng, 0, 2)]
      else if (kindOfCell === 'valley') kind = ['砂金', '钻石'][rollInt(prng, 0, 1)]
      if (kind === '') continue
      minerals.push({ x, y, kind, grade: rollInt(prng, 1, 3) })
    }
  }

  /** 矿产编辑：{x,y,mineral}——mineral>0 覆盖该格储量（1–3），0 清除。 */
  for (const edit of input.edits ?? []) {
    if (typeof edit.mineral !== 'number') continue
    const index = minerals.findIndex((item) => item.x === edit.x && item.y === edit.y)
    if (edit.mineral <= 0) {
      if (index >= 0) minerals.splice(index, 1)
      continue
    }
    const grade = Math.max(1, Math.min(3, Math.round(edit.mineral)))
    if (index >= 0) minerals[index] = { ...minerals[index], grade }
    else minerals.push({ x: edit.x, y: edit.y, kind: '自定', grade })
  }

  /** 国家种子（首都候选，供多尺度精细子图用）。 */
  let nationSeeds: Array<{ x: number; y: number }> = []
  /** 国家：Voronoi 分区（delaunay）。 */
  const nations: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => -1))
  if (nationCount > 0) {
    const seeds: Array<{ x: number; y: number }> = []
    for (let attempt = 0; attempt < nationCount * 20 && seeds.length < nationCount; attempt += 1) {
      const x = rollInt(prng, 0, width - 1)
      const y = rollInt(prng, 0, height - 1)
      if (isLand(x, y)) seeds.push({ x, y })
    }
    nationSeeds = seeds
    if (seeds.length > 0) {
      const delaunay = Delaunay.from(seeds.map((point) => [point.x, point.y]))
      const voronoi = delaunay.voronoi([0, 0, width - 1, height - 1])
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!isLand(x, y)) continue
          /** 找到最近种子。 */
          let bestIndex = 0
          let bestDist = Infinity
          for (let index = 0; index < seeds.length; index += 1) {
            /** 球体：经度差取环绕最短，并按纬度收缩（cos lat）。 */
            let dx = Math.abs(seeds[index].x - x)
            if (topology === 'sphere') dx = Math.min(dx, width - dx)
            const dy = seeds[index].y - y
            const latScale = topology === 'sphere' ? Math.cos(((y / height) - 0.5) * Math.PI) : 1
            const dist = dx * dx * latScale * latScale + dy * dy
            if (dist < bestDist) { bestDist = dist; bestIndex = index }
          }
          nations[y][x] = bestIndex
        }
      }
      void voronoi
    }
  }
  /** 编辑：改国家归属。 */
  for (const edit of input.edits ?? []) {
    if (edit.x < 0 || edit.x >= width || edit.y < 0 || edit.y >= height) continue
    if (typeof edit.nation === 'number') nations[edit.y][edit.x] = edit.nation
  }

  /** 国界：相邻格归属不同记一段（球体按经度环绕）。 */
  let borderCells = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const own = nations[y][x]
      if (own < 0) continue
      const right = topology === 'sphere' ? nations[y][(x + 1) % width] : x + 1 < width ? nations[y][x + 1] : -1
      const down = y + 1 < height ? nations[y + 1][x] : -1
      if (right >= 0 && right !== own) borderCells += 1
      if (down >= 0 && down !== own) borderCells += 1
    }
  }

  /** 统计。 */
  /** 面积加权（球体：高纬格实际面积按 cos lat 收缩）。 */
  let land = 0
  let mountain = 0
  let plain = 0
  let area = 0
  for (let y = 0; y < height; y += 1) {
    const weight = topology === 'sphere' ? Math.max(0.01, Math.cos(((y / height) - 0.5) * Math.PI)) : 1
    for (let x = 0; x < width; x += 1) {
      area += weight
      if (isLand(x, y)) land += weight
      const kind = terrain[y][x]
      if (kind === 'mountain') mountain += weight
      if (kind === 'plain') plain += weight
    }
  }
  const stats = {
    landRatio: area > 0 ? land / area : 0,
    mountainRatio: area > 0 ? mountain / area : 0,
    plainRatio: area > 0 ? plain / area : 0,
    riverCells: riverCells.size,
    mineralCount: minerals.length,
    nationCount: seedsOfNations(nations),
  }
  const notes = [
    '拓扑：' + (topology === 'sphere' ? '球体（经度环绕，跨 180° 不会绕远路）' : '平面（天圆地方，边界不环绕）'),
    '网格 ' + width + '×' + height + '（' + (width * height) + ' 格），seed=' + seed,
    '海平面 ' + effectiveSea.toFixed(2) + '，陆地占比 ' + (stats.landRatio * 100).toFixed(1) + '%',
    '山地 ' + (stats.mountainRatio * 100).toFixed(1) + '%、平原 ' + (stats.plainRatio * 100).toFixed(1) + '%',
    '河流 ' + rivers.length + ' 条（' + stats.riverCells + ' 格水道）、矿产 ' + minerals.length + ' 处',
    '国家 ' + stats.nationCount + ' 个（Voronoi 分区；河流/山脉可作自然边界）',
    '编辑：edits 可改 height/seaLevel/nation/mineral（矿 1–3 级，0 清除）',
    '国界 ' + borderCells + ' 段（相邻格归属不同处）',
    '图例（ascii）：空白海洋 . 海岸 · 平原 : 丘陵 ^ 山地 # 高原 ~ 河谷；asciiBorders：数字=国家编号，| = 边界',
    '★ ASCII 是随机生成的大陆：只用于相对位置与距离校验，不是真实地球底图。',
  ]
  /** 两点距离（给了 mapDistance 才有）——必须进文本，否则用户以为参数没生效。 */
  if (input.distance !== undefined) {
    const gridDistanceKm = gridDistance({ topology, width, height, from: input.distance.from, to: input.distance.to, planetRadiusKm: input.planetRadiusKm })
    notes.push('两点距离：' + gridDistanceKm.km.toFixed(1) + ' km（' + Math.round(gridDistanceKm.cells) + ' 格）')
  }
  /** 大网格：高度网格量化为 0–255 + base64（1440×720 原始 JSON 约 2 MB，量化后约 700 KB）。 */
  /** 超过 10 万格就量化（否则 JSON 上 MB；量化后高度/地形/国家都是紧凑串）。 */
  const large = width * height > 100000
  const packed = large ? Buffer.from(Uint8Array.from(heights.flat(), (value) => Math.round(value * 255))).toString('base64') : undefined
  const TERRAIN_CODE: Record<string, number> = { ocean: 0, coast: 1, plain: 2, hill: 3, mountain: 4, plateau: 5, valley: 6 }
  const terrainPacked = large ? Buffer.from(Uint8Array.from(terrain.flat(), (kind) => TERRAIN_CODE[kind] ?? 0)).toString('base64') : undefined
  const nationsPacked = large ? Buffer.from(new Int16Array(nations.flat()).buffer).toString('base64') : undefined
  const distance = input.distance !== undefined ? gridDistance({ topology, width, height, from: input.distance.from, to: input.distance.to, planetRadiusKm: input.planetRadiusKm }) : undefined
  /** 气候层（可选）：复用 grid-climate 的温度模型 + 降水。 */
  const landGrid = heights.map((row, y) => row.map((_value, x) => isLand(x, y)))
  let climateSummary: WorldMapResult['climate']
  if (input.climate === true) {
    const climateResult = computeGridClimate({ heights, land: landGrid, globalMeanK: input.globalMeanK, greenhouseK: input.greenhouseK, seaLevel: effectiveSea })
    const landAreaKm2 = (4 * Math.PI * (input.planetRadiusKm ?? 6371) ** 2 * (1 - effectiveLandTarget) * 0.9) / 1e0
    climateSummary = { zoneShare: climateResult.zoneShare, arableRatio: climateResult.arableRatio, arableKm2: landAreaKm2 * climateResult.arableRatio, notes: climateResult.notes }
  }
  const result: WorldMapResult = {
    width,
    height,
    topology,
    ...(climateSummary !== undefined ? { climate: climateSummary } : {}),
    ...(distance !== undefined ? { distance } : {}),
    heights: large ? [] : heights,
    ...(packed !== undefined ? { heightsPacked: packed } : {}),
    terrain: large ? [] : terrain,
    nations: large ? [] : nations,
    ...(terrainPacked !== undefined ? { terrainPacked } : {}),
    ...(nationsPacked !== undefined ? { nationsPacked } : {}),
    rivers,
    minerals,
    stats,
    borders: { cells: borderCells, nations: stats.nationCount },
    notes,
  }
  if (input.ascii !== false) {
    /**
     * 精细 ASCII 地图（默认 120×60）：
     * 地形按高度分层（等高视觉）、河流、矿产、国界叠加；顶部比例尺与指北针，底部图例。
     * 仍是纯文本（约 8 KB），不输出海量坐标。
     */
    const aw = Math.max(20, Math.min(240, Math.floor(input.asciiWidth ?? 120)))
    const ah = Math.max(10, Math.min(160, Math.floor(input.asciiHeight ?? Math.round(aw / 2))))
    const sx = width / aw
    const sy = height / ah
    const planetRadiusKm = input.planetRadiusKm ?? 6371
    const kmPerCell = (2 * Math.PI * planetRadiusKm) / width
    const mineralSet = new Set(minerals.map((item) => item.x + ',' + item.y))

    /** 一格渲染：地形分层用高度细分，形成等高线视觉。 */
    const renderCell = (gx: number, gy: number): string => {
      const kind = terrain[gy][gx]
      const value = heights[gy][gx]
      if (kind === 'ocean') return value < 0.08 ? ' ' : value < 0.15 ? '~' : '≈'
      if (kind === 'coast') return '.'
      if (kind === 'plain') return value < 0.35 ? '·' : '-'
      if (kind === 'hill') return value < 0.6 ? ':' : '+'
      if (kind === 'mountain') return value < 0.78 ? '^' : '@'
      if (kind === 'plateau') return value < 0.9 ? '#' : '%'
      return '='
    }

    /** 粗格内采样：河流/矿产/国界。 */
    const sampleCell = (gx: number, gy: number, stepX = sx, stepY = sy): { river: boolean; mineral: boolean; border: boolean } => {
      const xEnd = Math.min(gx + Math.max(1, Math.ceil(stepX)), width)
      const yEnd = Math.min(gy + Math.max(1, Math.ceil(stepY)), height)
      let river = false
      let mineral = false
      let border = false
      for (let yy = gy; yy < yEnd; yy += 1) {
        for (let xx = gx; xx < xEnd; xx += 1) {
          if (riverCells.has(xx + ',' + yy)) river = true
          if (mineralSet.has(xx + ',' + yy)) mineral = true
          const own = nations[yy][xx]
          if (own < 0) continue
          const nr = topology === 'sphere' ? nations[yy][(xx + 1) % width] : xx + 1 < width ? nations[yy][xx + 1] : -1
          const nd = yy + 1 < height ? nations[yy + 1][xx] : -1
          if ((nr >= 0 && nr !== own) || (nd >= 0 && nd !== own)) border = true
        }
      }
      return { river, mineral, border }
    }

    const lines: string[] = []
    lines.push('N↑  比例尺：1 字符 ≈ ' + (kmPerCell * sx).toFixed(1) + ' km（网格格距 ' + kmPerCell.toFixed(1) + ' km）  |  网格 ' + width + '×' + height + '  |  ' + (topology === 'sphere' ? '球体（经度环绕）' : '平面'))
    for (let ry = 0; ry < ah; ry += 1) {
      const gy = Math.min(height - 1, Math.floor((ry + 0.5) * sy))
      let line = ''
      for (let rx = 0; rx < aw; rx += 1) {
        const gx = Math.min(width - 1, Math.floor((rx + 0.5) * sx))
        const flags = sampleCell(gx, gy)
        let ch = renderCell(gx, gy)
        if (flags.river) ch = '='
        if (flags.mineral && !flags.border) ch = '*'
        if (flags.border) ch = ch === '=' ? '+' : '|'
        line += ch
      }
      lines.push(line)
    }
    lines.push('图例（字符=高度带，等高视觉）：· 平原 - 低地 : 丘陵 + 高地 ^ 山 @ 高峰 # 高原 % 极高原 = 河 * 矿 | 国界 ~ 浅海 ≈ 深海 . 海岸')

    /** 多尺度：重点区域局部精细子图（首都 / 经济中心 / 国界密集）。 */
    const focusMaps: Array<{ kind: string; name: string; x: number; y: number; ascii: string }> = []
    const renderWindow = (cx: number, cy: number, radius: number, cols: number): string => {
      const x0 = Math.max(0, cx - radius)
      const y0 = Math.max(0, cy - radius)
      const x1 = Math.min(width, cx + radius + 1)
      const y1 = Math.min(height, cy + radius + 1)
      const stepX = Math.max(1, Math.floor((x1 - x0) / cols))
      const stepY = Math.max(1, Math.floor(stepX / 2))
      const windowLines: string[] = []
      for (let yy = y0; yy < y1; yy += stepY) {
        let line = ''
        for (let xx = x0; xx < x1; xx += stepX) {
          const flags = sampleCell(xx, yy, 1, 1)
          let ch = renderCell(xx, yy)
          if (flags.river) ch = '='
          if (flags.mineral && !flags.border) ch = '*'
          if (flags.border) ch = ch === '=' ? '+' : '|'
          line += ch
        }
        windowLines.push(line)
      }
      return windowLines.join('\n')
    }
    /** 窗口密度最高点（矿 / 国界）。 */
    const densestCenter = (kind: 'mineral' | 'border', radius: number): { x: number; y: number } | null => {
      const step = Math.max(2, Math.round(width / 40))
      let best: { x: number; y: number; score: number } | null = null
      for (let y = radius; y < height - radius; y += step) {
        for (let x = radius; x < width - radius; x += step) {
          let score = 0
          for (let yy = y - radius; yy <= y + radius; yy += 1) {
            for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
              if (kind === 'mineral') {
                if (mineralSet.has(xx + ',' + yy)) score += 1
              } else {
                const own = nations[yy][xx]
                if (own < 0) continue
                const nr = topology === 'sphere' ? nations[yy][(xx + 1) % width] : xx + 1 < width ? nations[yy][xx + 1] : -1
                const nd = yy + 1 < height ? nations[yy + 1][xx] : -1
                if ((nr >= 0 && nr !== own) || (nd >= 0 && nd !== own)) score += 1
              }
            }
          }
          if (best === null || score > best.score) best = { x, y, score }
        }
      }
      return best === null || best.score === 0 ? null : { x: best.x, y: best.y }
    }
    /** 用户自定义重点区域优先（自主编辑格子粗细）；否则自动检测。 */
    if (Array.isArray(input.focusRegions) && input.focusRegions.length > 0) {
      for (const region of input.focusRegions) {
        const cx = Math.max(0, Math.min(width - 1, Math.floor(region.x)))
        const cy = Math.max(0, Math.min(height - 1, Math.floor(region.y)))
        const radius = Math.max(2, Math.min(200, Math.floor(region.radius ?? Math.round(width / 24))))
        const cols = Math.max(10, Math.min(160, Math.floor(region.detail ?? Math.min(60, aw))))
        focusMaps.push({ kind: 'custom', name: region.name ?? '自定义区域', x: cx, y: cy, ascii: renderWindow(cx, cy, radius, cols) })
      }
    } else {
      for (let index = 0; index < nationSeeds.length; index += 1) {
        const seed = nationSeeds[index]
        focusMaps.push({ kind: 'capital', name: '首都 ' + (index + 1), x: seed.x, y: seed.y, ascii: renderWindow(seed.x, seed.y, Math.max(8, Math.round(width / 24)), Math.min(60, aw)) })
      }
      const mineralCenter = densestCenter('mineral', Math.max(4, Math.round(width / 50)))
      if (mineralCenter !== null) focusMaps.push({ kind: 'economy', name: '经济中心（矿密集）', x: mineralCenter.x, y: mineralCenter.y, ascii: renderWindow(mineralCenter.x, mineralCenter.y, Math.max(8, Math.round(width / 24)), Math.min(60, aw)) })
      const borderCenter = densestCenter('border', Math.max(4, Math.round(width / 50)))
      if (borderCenter !== null) focusMaps.push({ kind: 'border', name: '国界密集段', x: borderCenter.x, y: borderCenter.y, ascii: renderWindow(borderCenter.x, borderCenter.y, Math.max(8, Math.round(width / 24)), Math.min(60, aw)) })
    }
    /** 国界 ASCII（80×40）：数字=国家编号，| = 边界。 */
    const stepXB = Math.max(1, Math.floor(width / 80))
    const stepYB = Math.max(1, Math.floor(height / 40))
    const borderLines: string[] = []
    for (let y = 0; y < height; y += stepYB) {
      let line = ''
      for (let x = 0; x < width; x += stepXB) {
        const own = nations[y][x]
        if (own < 0) { line += ' '; continue }
        let boundary = false
        const yEnd = Math.min(y + stepYB, height)
        const xEnd = Math.min(x + stepXB, width)
        for (let yy = y; yy < yEnd && !boundary; yy += 1) {
          for (let xx = x; xx < xEnd && !boundary; xx += 1) {
            const n0 = nations[yy][xx]
            if (n0 < 0) continue
            const nr = topology === 'sphere' ? nations[yy][(xx + 1) % width] : xx + 1 < width ? nations[yy][xx + 1] : -1
            const nd = yy + 1 < height ? nations[yy + 1][xx] : -1
            if ((nr >= 0 && nr !== n0) || (nd >= 0 && nd !== n0)) boundary = true
          }
        }
        line += boundary ? '|' : String(own % 10)
      }
      borderLines.push(line)
    }
    /** 只在生成时才加这个键（undefined 会让宿主判「value is not lossless JSON」）。 */
    return { ...result, ascii: lines.join('\n'), asciiBorders: borderLines.join('\n'), ...(focusMaps.length > 0 ? { focusMaps } : {}) }
  }
  return result
}

/**
 * 统计国家数（去重）。
 *
 * @param nations - 归属网格
 * @returns 国家数
 */

function seedsOfNations(nations: number[][]): number {
  const set = new Set<number>()
  for (const row of nations) for (const cell of row) if (cell >= 0) set.add(cell)
  return set.size
}