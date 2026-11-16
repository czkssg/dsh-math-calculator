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
  edits?: Array<{ x: number; y: number; height?: number; seaLevel?: number; nation?: number }>
  /** 是否输出 ASCII 缩略图（默认 true）。 */
  ascii?: boolean
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
  /** ASCII 缩略图（可选）。 */
  ascii?: string
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
  /** 分位数阈值（用**归一化后**的高度）：高于 (1−陆地占比) 分位的是陆地。 */
  const normalizedFlat = heights.flat().sort((a, b) => a - b)
  const effectiveSea = normalizedFlat[Math.floor(normalizedFlat.length * (1 - effectiveLandTarget))] ?? 0.5

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
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
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

  /** 国家：Voronoi 分区（delaunay）。 */
  const nations: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => -1))
  if (nationCount > 0) {
    const seeds: Array<{ x: number; y: number }> = []
    for (let attempt = 0; attempt < nationCount * 20 && seeds.length < nationCount; attempt += 1) {
      const x = rollInt(prng, 0, width - 1)
      const y = rollInt(prng, 0, height - 1)
      if (isLand(x, y)) seeds.push({ x, y })
    }
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
            const dx = seeds[index].x - x
            const dy = seeds[index].y - y
            const dist = dx * dx + dy * dy
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

  /** 统计。 */
  let land = 0
  let mountain = 0
  let plain = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isLand(x, y)) land += 1
      const kind = terrain[y][x]
      if (kind === 'mountain') mountain += 1
      if (kind === 'plain') plain += 1
    }
  }
  const stats = {
    landRatio: land / (width * height),
    mountainRatio: mountain / (width * height),
    plainRatio: plain / (width * height),
    riverCells: riverCells.size,
    mineralCount: minerals.length,
    nationCount: seedsOfNations(nations),
  }
  const notes = [
    '网格 ' + width + '×' + height + '（' + (width * height) + ' 格），seed=' + seed,
    '海平面 ' + effectiveSea.toFixed(2) + '，陆地占比 ' + (stats.landRatio * 100).toFixed(1) + '%',
    '山地 ' + (stats.mountainRatio * 100).toFixed(1) + '%、平原 ' + (stats.plainRatio * 100).toFixed(1) + '%',
    '河流 ' + rivers.length + ' 条（' + stats.riverCells + ' 格水道）、矿产 ' + minerals.length + ' 处',
    '国家 ' + stats.nationCount + ' 个（Voronoi 分区；河流/山脉可作自然边界）',
    '编辑：edits 可改 height/seaLevel/nation（改地形到海陆分布）',
  ]
  /** 大网格：高度网格量化为 0–255 + base64（1440×720 原始 JSON 约 2 MB，量化后约 700 KB）。 */
  /** 超过 10 万格就量化（否则 JSON 上 MB；量化后高度/地形/国家都是紧凑串）。 */
  const large = width * height > 100000
  const packed = large ? Buffer.from(Uint8Array.from(heights.flat(), (value) => Math.round(value * 255))).toString('base64') : undefined
  const TERRAIN_CODE: Record<string, number> = { ocean: 0, coast: 1, plain: 2, hill: 3, mountain: 4, plateau: 5, valley: 6 }
  const terrainPacked = large ? Buffer.from(Uint8Array.from(terrain.flat(), (kind) => TERRAIN_CODE[kind] ?? 0)).toString('base64') : undefined
  const nationsPacked = large ? Buffer.from(new Int16Array(nations.flat()).buffer).toString('base64') : undefined
  const result: WorldMapResult = {
    width,
    height,
    heights: large ? [] : heights,
    ...(packed !== undefined ? { heightsPacked: packed } : {}),
    terrain: large ? [] : terrain,
    nations: large ? [] : nations,
    ...(terrainPacked !== undefined ? { terrainPacked } : {}),
    ...(nationsPacked !== undefined ? { nationsPacked } : {}),
    rivers,
    minerals,
    stats,
    notes,
  }
  if (input.ascii !== false) {
    /** 缩略图：宽 80 列、按地形取字符。 */
    const stepX = Math.max(1, Math.floor(width / 80))
    const stepY = Math.max(1, Math.floor(height / 40))
    const lines: string[] = []
    for (let y = 0; y < height; y += stepY) {
      let line = ''
      for (let x = 0; x < width; x += stepX) {
        const kind = terrain[y][x]
        line += kind === 'ocean' ? ' ' : kind === 'coast' ? '.' : kind === 'plain' ? '·' : kind === 'hill' ? ':' : kind === 'mountain' ? '^' : kind === 'plateau' ? '#' : '~'
      }
      lines.push(line)
    }
    result.ascii = lines.join('\n')
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
