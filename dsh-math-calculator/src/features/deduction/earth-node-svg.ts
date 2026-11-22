/**
 * 真实地球历史节点地图（SVG）。
 *
 * ## 数据
 *
 * - `earth-borders.json`：258 国的简化轮廓（源自 Natural Earth 10m，公有领域）；
 * - `earth-nodes.json`：历史节点（中世纪 / 一战前 / 二战前 / 冷战…），每节点给出
 *   政权 → 国家名列表 + 颜色。
 *
 * ## 为什么按国家多边形填充而不是圆
 *
 * 圆只是「大概在哪」，看起来像色斑。按真实国界填充才对得上地图：
 * 宋就沿中国边界、奥斯曼就沿土耳其/叙利亚/埃及边界。
 *
 * ## 可编辑
 *
 * SVG 是纯文本：改颜色、加标注、换多边形都行；
 * 也可以用 `edits` 在生成前改（见 world-map 的 earthNodeEdits）。
 *
 * @module dsh-math-calculator/features/deduction/earth-node-svg
 */

import { CalcError } from '../../core/errors.js'

/** 一国轮廓。 */
export interface BorderCountry {
  /** 英文名（Natural Earth NAME）。 */
  n: string
  /** 中文名。 */
  zh: string
  /** 标注点经纬度。 */
  lx: number
  ly: number
  /** 多边形（扁平经纬度数组：[lon,lat,lon,lat,…]）。 */
  p: number[][]
}

/** 一个政权。 */
export interface NodePower {
  name: string
  color: string
  /** 国家名列表（英文 NAME）。 */
  countries: string[]
}

/** 一个历史节点。 */
export interface HistoryNode {
  name: string
  sub: string
  powers: NodePower[]
}

export const HISTORY_NODES: Record<string, HistoryNode> = {
  medieval: { name: '中世纪盛期', sub: '十字军与宋', powers: [
    { name: '宋', color: '#d35400', countries: ['China'] },
    { name: '神圣罗马', color: '#8e44ad', countries: ['Germany', 'Austria', 'Czechia', 'Switzerland', 'Italy', 'Netherlands', 'Belgium'] },
    { name: '法兰西', color: '#2980b9', countries: ['France'] },
    { name: '英格兰', color: '#e67e22', countries: ['United Kingdom'] },
    { name: '拜占庭', color: '#16a085', countries: ['Greece', 'Turkey', 'Bulgaria', 'Albania', 'North Macedonia'] },
    { name: '基辅罗斯', color: '#27ae60', countries: ['Ukraine', 'Belarus'] },
    { name: '塞尔柱', color: '#c0392b', countries: ['Iran', 'Iraq', 'Turkmenistan', 'Uzbekistan', 'Azerbaijan', 'Afghanistan'] },
    { name: '朱罗', color: '#f1c40f', countries: ['India', 'Sri Lanka'] },
    { name: '玛雅', color: '#7f8c8d', countries: ['Mexico', 'Guatemala', 'Belize', 'Honduras'] },
  ] },
  'pre-ww1': { name: '一战前夕', sub: '同盟国 vs 协约国', powers: [
    { name: '德意志帝国', color: '#7f8c8d', countries: ['Germany'] },
    { name: '奥匈帝国', color: '#f1c40f', countries: ['Austria', 'Hungary', 'Czechia', 'Slovakia', 'Croatia', 'Slovenia', 'Bosnia and Herzegovina'] },
    { name: '奥斯曼', color: '#27ae60', countries: ['Turkey', 'Syria', 'Iraq', 'Lebanon', 'Israel', 'Jordan', 'Saudi Arabia'] },
    { name: '俄罗斯帝国', color: '#16a085', countries: ['Russia', 'Ukraine', 'Belarus', 'Finland', 'Poland', 'Georgia', 'Armenia', 'Kazakhstan'] },
    { name: '法兰西', color: '#2980b9', countries: ['France', 'Vietnam', 'Laos', 'Cambodia', 'Algeria', 'Morocco', 'Tunisia'] },
    { name: '英国', color: '#e67e22', countries: ['United Kingdom', 'Ireland', 'India', 'Pakistan', 'Bangladesh', 'Myanmar', 'Australia', 'Canada', 'New Zealand', 'South Africa', 'Egypt', 'Nigeria', 'Kenya'] },
    { name: '意大利', color: '#e74c3c', countries: ['Italy', 'Libya', 'Somalia', 'Eritrea'] },
    { name: '美国', color: '#8e44ad', countries: ['United States of America', 'Philippines'] },
    { name: '中华民国', color: '#d35400', countries: ['China', 'Mongolia'] },
    { name: '日本', color: '#c0392b', countries: ['Japan', 'South Korea', 'North Korea', 'Taiwan'] },
  ] },
  'pre-ww2': { name: '二战前夕', sub: '轴心国崛起', powers: [
    { name: '纳粹德国', color: '#7f8c8d', countries: ['Germany', 'Austria', 'Czechia'] },
    { name: '意大利', color: '#e74c3c', countries: ['Italy', 'Libya', 'Albania', 'Somalia', 'Eritrea'] },
    { name: '日本', color: '#c0392b', countries: ['Japan', 'South Korea', 'North Korea', 'Taiwan'] },
    { name: '苏联', color: '#16a085', countries: ['Russia', 'Ukraine', 'Belarus', 'Georgia', 'Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan'] },
    { name: '英国', color: '#e67e22', countries: ['United Kingdom', 'India', 'Pakistan', 'Bangladesh', 'Myanmar', 'Australia', 'Canada', 'New Zealand', 'South Africa', 'Egypt', 'Iraq', 'Israel', 'Jordan'] },
    { name: '法国', color: '#2980b9', countries: ['France', 'Vietnam', 'Laos', 'Cambodia', 'Algeria', 'Morocco', 'Tunisia', 'Syria', 'Lebanon'] },
    { name: '美国', color: '#8e44ad', countries: ['United States of America', 'Philippines'] },
    { name: '中国', color: '#d35400', countries: ['China', 'Mongolia'] },
  ] },
  'cold-war': { name: '冷战', sub: '两极对峙', powers: [
    { name: '美国/北约', color: '#8e44ad', countries: ['United States of America', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Denmark', 'Norway', 'Greece', 'Turkey', 'Canada', 'Japan', 'South Korea'] },
    { name: '苏联/华约', color: '#c0392b', countries: ['Russia', 'Ukraine', 'Belarus', 'Poland', 'Romania', 'Hungary', 'Bulgaria', 'Czechia', 'Slovakia', 'Georgia', 'Kazakhstan', 'Mongolia'] },
    { name: '中国', color: '#d35400', countries: ['China', 'North Korea', 'Vietnam'] },
    { name: '不结盟', color: '#f39c12', countries: ['India', 'Egypt', 'Indonesia', 'Pakistan', 'Bangladesh', 'Sri Lanka'] },
    { name: '非洲独立潮', color: '#27ae60', countries: ['Nigeria', 'Kenya', 'Tanzania', 'Ghana', 'Ethiopia', 'South Africa', 'Angola', 'Mozambique'] },
  ] },
}

/** 渲染选项。 */
export interface EarthNodeSvgOptions {
  /** 画布宽（默认 2400）。 */
  width?: number
  /** 视图窗口（经纬度）[lon0,lat0,lon1,lat1]：局部放大。 */
  viewBox?: [number, number, number, number]
  /** 是否画经纬网（默认 true）。 */
  graticule?: boolean
  /** 是否画政权注记（默认 true）。 */
  labels?: boolean
  /** 覆盖某政权的颜色：{政权名: '#rrggbb'}。 */
  colorOverrides?: Record<string, string>
  /** 覆盖某政权的国家列表（凭空换一个世界）：{政权名: [国家名]}。 */
  countryOverrides?: Record<string, string[]>
}

/**
 * 生成历史节点 SVG。
 *
 * @param borders - 国界数据
 * @param nodeKey - 节点键（medieval / pre-ww1 / pre-ww2 / cold-war）
 * @param options - 渲染选项
 * @returns SVG 文本
 * @throws {CalcError} 节点未知
 */
export function renderEarthNodeSvg(borders: BorderCountry[], nodeKey: string, options: EarthNodeSvgOptions = {}): string {
  const key = nodeKey.trim()
  const node = HISTORY_NODES[key]
  if (node === undefined) {
    throw new CalcError('unknown_symbol', '没有历史节点「' + key + '」', '可用：' + Object.keys(HISTORY_NODES).join(' / ') + '。')
  }
  const W = Math.max(800, Math.min(6000, Math.round(options.width ?? 2400)))
  const H = Math.round(W / 2)
  const view = options.viewBox ?? [-180, 90, 180, -90]
  const [vLon0, vLat0, vLon1, vLat1] = view
  const spanLon = Math.max(0.01, vLon1 - vLon0)
  const spanLat = Math.max(0.01, vLat0 - vLat1)
  const px = (lon: number): number => ((lon - vLon0) / spanLon) * W
  const py = (lat: number): number => ((vLat0 - lat) / spanLat) * H
  const byName = new Map<string, BorderCountry>()
  for (const country of borders) byName.set(country.n, country)
  const parts: string[] = []
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">')
  parts.push('<defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d3352"/><stop offset="50%" stop-color="#15608f"/><stop offset="100%" stop-color="#0d3352"/></linearGradient></defs>')
  parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#sea)"/>')
  /** 无主陆地。 */
  const landPath: string[] = []
  for (const country of borders) {
    for (const poly of country.p) {
      if (poly.length < 6) continue
      const pts: string[] = []
      for (let i = 0; i < poly.length; i += 2) pts.push(px(poly[i]).toFixed(1) + ',' + py(poly[i + 1]).toFixed(1))
      landPath.push('M' + pts.join('L') + 'Z')
    }
  }
  parts.push('<path d="' + landPath.join('') + '" fill="#ded9c4" stroke="#a0997f" stroke-width="0.5" stroke-linejoin="round"/>')
  /** 政权填充：按国家多边形。 */
  for (const power of node.powers) {
    const color = options.colorOverrides?.[power.name] ?? power.color
    const countries = options.countryOverrides?.[power.name] ?? power.countries
    const paths: string[] = []
    for (const name of countries) {
      const country = byName.get(name)
      if (country === undefined) continue
      for (const poly of country.p) {
        if (poly.length < 6) continue
        const pts: string[] = []
        for (let i = 0; i < poly.length; i += 2) pts.push(px(poly[i]).toFixed(1) + ',' + py(poly[i + 1]).toFixed(1))
        paths.push('M' + pts.join('L') + 'Z')
      }
    }
    if (paths.length > 0) parts.push('<path d="' + paths.join('') + '" fill="' + color + '" fill-opacity="0.85" stroke="' + color + '" stroke-width="0.6"/>')
  }
  /** 经纬网。 */
  if (options.graticule !== false) {
    const g: string[] = []
    for (let lon = Math.ceil(vLon0 / 30) * 30; lon <= vLon1; lon += 30) g.push('M' + px(lon).toFixed(0) + ',0L' + px(lon).toFixed(0) + ',' + H)
    for (let lat = Math.ceil(vLat1 / 30) * 30; lat <= vLat0; lat += 30) g.push('M0,' + py(lat).toFixed(0) + 'L' + W + ',' + py(lat).toFixed(0))
    parts.push('<path d="' + g.join('') + '" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-dasharray="8 8" opacity="0.18"/>')
  }
  /** 赤道。 */
  if (vLat0 >= 0 && vLat1 <= 0) parts.push('<line x1="0" y1="' + py(0).toFixed(0) + '" x2="' + W + '" y2="' + py(0).toFixed(0) + '" stroke="#ffcc66" stroke-width="1.2" opacity="0.45"/>')
  /** 政权注记。 */
  if (options.labels !== false) {
    const fontSize = Math.max(10, Math.min(40, W / 90))
    for (const power of node.powers) {
      const countries = options.countryOverrides?.[power.name] ?? power.countries
      const first = byName.get(countries[0] ?? '')
      if (first === undefined) continue
      const tx = px(first.lx)
      const ty = py(first.ly)
      parts.push('<text x="' + tx.toFixed(0) + '" y="' + ty.toFixed(0) + '" font-size="' + fontSize.toFixed(0) + '" font-family="sans-serif" text-anchor="middle" fill="#141414" stroke="#ffffff" stroke-width="' + (fontSize * 0.18).toFixed(1) + '" paint-order="stroke" stroke-opacity="0.85">' + escapeXml(power.name) + '</text>')
    }
  }
  /** 标题。 */
  parts.push('<rect x="0" y="0" width="' + W + '" height="' + Math.round(H * 0.045) + '" fill="#08182a"/>')
  parts.push('<text x="' + Math.round(W * 0.012) + '" y="' + Math.round(H * 0.032) + '" font-size="' + Math.round(H * 0.022) + '" font-family="sans-serif" font-weight="bold" fill="#f0f0f0">' + escapeXml(node.name + ' · ' + node.sub) + '</text>')
  parts.push('</svg>')
  return parts.join('\n')
}

/** XML 转义。 */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}