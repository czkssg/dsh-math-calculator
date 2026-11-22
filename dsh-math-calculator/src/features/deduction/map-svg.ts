/**
 * 世界地图 SVG 渲染（矢量，无限缩放）。
 *
 * ## 为什么是 SVG 而不是更细的 ASCII
 *
 * ASCII 的分辨率上限就是字符数——再细也是「马赛克」。SVG 是**矢量**：
 * 等高线是路径、国界是折线、河流是曲线，放大到任意倍数都不糊，
 * 而且可以直接在浏览器/设计工具里改颜色与标注。
 *
 * ## 三层输出
 *
 * 1. `terrain`（等高分层填色）：按高度阈值切色带，marching squares 提边界；
 * 2. `lines`（线要素）：海岸线、国界、河流、行政线；
 * 3. `labels`（注记）：国家名、城市、比例尺、指北针。
 *
 * @module dsh-math-calculator/features/deduction/map-svg
 */

/**
 * 高度色带（**相对高度**，0 = 海平面，1 = 最高点）。
 *
 * ## 为什么必须相对化
 *
 * 初版用绝对阈值（0–1 硬编码）——但实际海平面是**分位数**（默认陆地 29% → 约 0.4）。
 * 结果是：大片陆地落在「绝对 0–0.4」区间，被画成深海色，整张图像噪声而不是地图。
 * 现在统一换算成「高于海平面多少」，海域单独按深度分档。
 */
const SEA_BANDS: Array<{ from: number; to: number; color: string; name: string }> = [
  { from: -1, to: -0.5, color: '#061a33', name: '深海' },
  { from: -0.5, to: -0.15, color: '#0d3a5c', name: '中深海' },
  { from: -0.15, to: 0, color: '#17557d', name: '浅海' },
]

const LAND_BANDS: Array<{ from: number; to: number; color: string; name: string }> = [
  { from: 0, to: 0.04, color: '#e8dcb8', name: '海岸' },
  { from: 0.04, to: 0.14, color: '#cfe0a0', name: '平原' },
  { from: 0.14, to: 0.3, color: '#b5cf80', name: '低地' },
  { from: 0.3, to: 0.48, color: '#dcc98c', name: '丘陵' },
  { from: 0.48, to: 0.64, color: '#c9a06a', name: '高地' },
  { from: 0.64, to: 0.8, color: '#a9744a', name: '山地' },
  { from: 0.8, to: 0.92, color: '#7d5137', name: '高山' },
  { from: 0.92, to: 2, color: '#f2f2f4', name: '雪线' },
]

/** 输出选项。 */
export interface MapSvgOptions {
  /** 画布宽（px，默认 1200）。 */
  width?: number
  /** 是否画国界（默认 true）。 */
  borders?: boolean
  /** 是否画河流（默认 true）。 */
  rivers?: boolean
  /** 是否画矿产点（默认 true）。 */
  minerals?: boolean
  /** 是否画经纬网格（默认 true）。 */
  graticule?: boolean
  /** 是否画国家注记（默认 true）。 */
  labels?: boolean
  /** 视图窗口（网格坐标）：放大局部时给 [x0,y0,x1,y1]。 */
  viewBox?: [number, number, number, number]
  /** 等高线分层数（默认 10）。 */
  contourLevels?: number
}

/** 网格 → SVG 坐标。 */
function svgPoint(x: number, y: number, scaleX: number, scaleY: number): string {
  return (x * scaleX).toFixed(2) + ',' + (y * scaleY).toFixed(2)
}

/**
 * 用 marching squares 提某阈值的等值线段。
 *
 * @param heights - 高度网格
 * @param level - 阈值
 * @returns 线段数组 [x1,y1,x2,y2]
 */
function contourSegments(heights: number[][], level: number): Array<[number, number, number, number]> {
  const h = heights.length
  const w = h > 0 ? heights[0].length : 0
  const out: Array<[number, number, number, number]> = []
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const tl = heights[y][x]
      const tr = heights[y][x + 1]
      const br = heights[y + 1][x + 1]
      const bl = heights[y + 1][x]
      const mask = (tl >= level ? 1 : 0) | (tr >= level ? 2 : 0) | (br >= level ? 4 : 0) | (bl >= level ? 8 : 0)
      if (mask === 0 || mask === 15) continue
      const lerp = (a: number, b: number): number => (b === a ? 0.5 : (level - a) / (b - a))
      const top: [number, number] = [x + lerp(tl, tr), y]
      const right: [number, number] = [x + 1, y + lerp(tr, br)]
      const bottom: [number, number] = [x + lerp(bl, br), y + 1]
      const left: [number, number] = [x, y + lerp(tl, bl)]
      const emit = (a: [number, number], b: [number, number]): void => { out.push([a[0], a[1], b[0], b[1]]) }
      switch (mask) {
        case 1: case 14: emit(left, top); break
        case 2: case 13: emit(top, right); break
        case 3: case 12: emit(left, right); break
        case 4: case 11: emit(right, bottom); break
        case 6: case 9: emit(top, bottom); break
        case 7: case 8: emit(left, bottom); break
        case 5: emit(left, top); emit(right, bottom); break
        case 10: emit(top, right); emit(left, bottom); break
        default: break
      }
    }
  }
  return out
}

/** 渲染需要的输入（由 world-map 传入，避免循环依赖）。 */
export interface MapSvgInput {
  width: number
  height: number
  heights: number[][]
  land: boolean[][]
  nations: number[][]
  rivers: Array<Array<{ x: number; y: number }>>
  minerals: Array<{ x: number; y: number; kind: string; grade: number }>
  /** 国家名（不足补「国 #n」）。 */
  nationNames?: string[]
  /** 每格 km（比例尺）。 */
  kmPerCell: number
  /** 海平面高度（分位数阈值）——色带按它相对化。 */
  seaLevel?: number
}

/**
 * 生成 SVG 地图。
 *
 * @param input - 网格与要素
 * @param options - 输出选项
 * @returns SVG 文本
 */
export function renderMapSvg(input: MapSvgInput, options: MapSvgOptions = {}): string {
  const outW = Math.max(200, Math.min(4000, Math.round(options.width ?? 1200)))
  const gridW = input.width
  const gridH = input.height
  /** viewBox：局部放大时用网格坐标窗口。 */
  const view = options.viewBox ?? [0, 0, gridW, gridH]
  const [vx, vy, vw, vh] = view
  const outH = Math.round((outW * vh) / Math.max(1e-6, vw))
  const scaleX = 1
  const scaleY = 1
  const parts: string[] = []
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + outW + '" height="' + outH + '" viewBox="' + vx + ' ' + vy + ' ' + vw + ' ' + vh + '" preserveAspectRatio="xMidYMid meet">')
  parts.push('<defs>')
  parts.push('<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b2a4a"/><stop offset="100%" stop-color="#155e8f"/></linearGradient>')
  parts.push('</defs>')
  parts.push('<rect x="' + vx + '" y="' + vy + '" width="' + vw + '" height="' + vh + '" fill="url(#sea)"/>')

  /** 1. 等高分层：按「相对海平面」的高度出色带（每格一个矩形，同色横向合并降体积）。 */
  const sea = input.seaLevel ?? 0.5
  const landRange = Math.max(0.01, 1 - sea)
  /** 相对高度：海平面以下为负（按深度比例），以上 0–1。 */
  const relativeOf = (value: number): number => (value <= sea ? (value - sea) / Math.max(0.01, sea) : (value - sea) / landRange)
  const bands = [...SEA_BANDS, ...LAND_BANDS]
  for (const band of bands) {
    const rects: string[] = []
    for (let y = Math.max(0, Math.floor(vy)); y < Math.min(gridH, Math.ceil(vy + vh)); y += 1) {
      let runStart = -1
      for (let x = Math.max(0, Math.floor(vx)); x <= Math.min(gridW, Math.ceil(vx + vw)); x += 1) {
        const raw = x < gridW && y < gridH ? input.heights[y][x] : Number.NaN
        const value = Number.isFinite(raw) ? relativeOf(raw) : Number.NaN
        const inBand = Number.isFinite(value) && value >= band.from && value < band.to
        if (inBand && runStart < 0) runStart = x
        else if (!inBand && runStart >= 0) {
          rects.push('<rect x="' + runStart + '" y="' + y + '" width="' + (x - runStart) + '" height="1"/>')
          runStart = -1
        }
      }
    }
    if (rects.length > 0) parts.push('<g fill="' + band.color + '">' + rects.join('') + '</g>')
  }
  const levels = Math.max(2, Math.min(24, Math.round(options.contourLevels ?? 10)))

  /** 2. 等高线（矢量路径，放大不糊）。 */
  const contourLines: string[] = []
  for (let i = 1; i < levels; i += 1) {
    /** 等高线画在「海平面以上」的相对层。 */
    const level = sea + (i / levels) * landRange
    for (const [x1, y1, x2, y2] of contourSegments(input.heights, level)) {
      contourLines.push('M' + svgPoint(x1, y1, scaleX, scaleY) + 'L' + svgPoint(x2, y2, scaleX, scaleY))
    }
  }
  if (contourLines.length > 0) parts.push('<path d="' + contourLines.join('') + '" fill="none" stroke="#00000022" stroke-width="0.15" vector-effect="non-scaling-stroke"/>')

  /** 3. 河流。 */
  if (options.rivers !== false && input.rivers.length > 0) {
    const riverPaths: string[] = []
    for (const river of input.rivers) {
      if (river.length < 2) continue
      riverPaths.push('M' + river.map((p) => svgPoint(p.x, p.y, scaleX, scaleY)).join('L'))
    }
    parts.push('<path d="' + riverPaths.join('') + '" fill="none" stroke="#2e86ab" stroke-width="0.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>')
  }

  /** 4. 国界（相邻格归属不同处画线段）。 */
  if (options.borders !== false) {
    const borderSegs: string[] = []
    const NATION_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990']
    for (let y = Math.max(0, Math.floor(vy)); y < Math.min(gridH, Math.ceil(vy + vh)); y += 1) {
      for (let x = Math.max(0, Math.floor(vx)); x < Math.min(gridW, Math.ceil(vx + vw)); x += 1) {
        const own = input.nations[y]?.[x] ?? -1
        if (own < 0) continue
        const right = x + 1 < gridW ? input.nations[y][x + 1] : -1
        const down = y + 1 < gridH ? input.nations[y + 1]?.[x] ?? -1 : -1
        if (right >= 0 && right !== own) borderSegs.push('M' + (x + 1) + ',' + y + 'L' + (x + 1) + ',' + (y + 1))
        if (down >= 0 && down !== own) borderSegs.push('M' + x + ',' + (y + 1) + 'L' + (x + 1) + ',' + (y + 1))
      }
    }
    if (borderSegs.length > 0) parts.push('<path d="' + borderSegs.join('') + '" fill="none" stroke="#8b0000" stroke-width="0.9" stroke-linecap="round" vector-effect="non-scaling-stroke"/>')
    void NATION_COLORS
  }

  /** 5. 矿产点。 */
  if (options.minerals !== false && input.minerals.length > 0) {
    const dots: string[] = []
    for (const mineral of input.minerals) {
      if (mineral.x < vx || mineral.x > vx + vw || mineral.y < vy || mineral.y > vy + vh) continue
      const r = 0.22 + mineral.grade * 0.12
      dots.push('<circle cx="' + mineral.x + '" cy="' + mineral.y + '" r="' + r.toFixed(2) + '"/>')
    }
    if (dots.length > 0) parts.push('<g fill="#111" opacity="0.75">' + dots.join('') + '</g>')
  }

  /** 6. 经纬网格。 */
  if (options.graticule !== false) {
    const grat: string[] = []
    const stepX = Math.max(1, Math.round(vw / 8))
    const stepY = Math.max(1, Math.round(vh / 6))
    for (let x = Math.ceil(vx / stepX) * stepX; x <= vx + vw; x += stepX) grat.push('M' + x + ',' + vy + 'L' + x + ',' + (vy + vh))
    for (let y = Math.ceil(vy / stepY) * stepY; y <= vy + vh; y += stepY) grat.push('M' + vx + ',' + y + 'L' + (vx + vw) + ',' + y)
    parts.push('<path d="' + grat.join('') + '" fill="none" stroke="#ffffff30" stroke-width="0.1" stroke-dasharray="1 2" vector-effect="non-scaling-stroke"/>')
  }

  /** 7. 注记：国家名 + 比例尺 + 指北针。 */
  if (options.labels !== false) {
    const labels: string[] = []
    const seen = new Map<number, { x: number; y: number; n: number }>()
    for (let y = Math.max(0, Math.floor(vy)); y < Math.min(gridH, Math.ceil(vy + vh)); y += 1) {
      for (let x = Math.max(0, Math.floor(vx)); x < Math.min(gridW, Math.ceil(vx + vw)); x += 1) {
        const own = input.nations[y]?.[x] ?? -1
        if (own < 0) continue
        const acc = seen.get(own)
        if (acc === undefined) seen.set(own, { x, y, n: 1 })
        else { acc.x += x; acc.y += y; acc.n += 1 }
      }
    }
    const fontSize = Math.max(1.2, Math.min(6, vw / 40))
    for (const [own, acc] of [...seen.entries()].sort((a, b) => a[0] - b[0])) {
      const name = input.nationNames?.[own] ?? '国 #' + (own + 1)
      const cx = acc.x / acc.n
      const cy = acc.y / acc.n
      labels.push('<text x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" font-size="' + fontSize.toFixed(2) + '" text-anchor="middle" fill="#1a1a1a" stroke="#ffffffaa" stroke-width="' + (fontSize * 0.12).toFixed(2) + '" paint-order="stroke">' + escapeXml(name) + '</text>')
    }
    /** 比例尺：1/10 图宽。 */
    const barKm = Math.round((vw / 10) * input.kmPerCell)
    const barX = vx + vw * 0.02
    const barY = vy + vh * 0.97
    labels.push('<rect x="' + barX + '" y="' + barY + '" width="' + (vw / 10) + '" height="' + (vh * 0.008) + '" fill="#000000aa"/>')
    labels.push('<text x="' + barX + '" y="' + (barY - vh * 0.008) + '" font-size="' + fontSize.toFixed(2) + '" fill="#000">' + barKm + ' km</text>')
    /** 指北针。 */
    const nx = vx + vw * 0.96
    const ny = vy + vh * 0.06
    labels.push('<path d="M' + nx + ',' + (ny - vh * 0.04) + 'L' + (nx - vw * 0.012) + ',' + (ny + vh * 0.01) + 'L' + (nx + vw * 0.012) + ',' + (ny + vh * 0.01) + 'Z" fill="#1a1a1a"/>')
    labels.push('<text x="' + nx + '" y="' + (ny + vh * 0.05) + '" font-size="' + fontSize.toFixed(2) + '" text-anchor="middle" fill="#1a1a1a">N</text>')
    parts.push('<g font-family="sans-serif">' + labels.join('') + '</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** XML 转义。 */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}