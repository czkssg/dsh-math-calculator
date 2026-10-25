/**
 * 依赖图渲染：可折叠、带中文标注、连线明显。
 *
 * @module dsh-math-calculator/graph-render
 * @description
 * 用户反馈三点：
 *   1. 「希望可以像图片一样点开伸缩」→ 分组可折叠；
 *   2. 「希望加上标注」→ 节点显示中文名与符号名；
 *   3. 「连线希望更明显一些」→ 加粗、加深，并用箭头指示方向。
 *
 * 之前的版本把 40 个节点一次性铺开，画布 1970px 宽，
 * 在侧栏里横向滚动很难用。改成**按层折叠**：默认只展开一层，
 * 其余层收起来，点一下展开。
 */

/** 一行（同层）的渲染数据。 */
export interface RenderRow {
  /** 层号（0 = 最底层基础量）。 */
  depth: number;
  /** 该层中文名。 */
  layerName: string
  /** 该层的节点。 */
  nodes: Array<{ id: string; label: string; incoming: number }>
  /** 默认是否展开。 */
  expanded: boolean
}

/** 量的中文名（用户要求「非中文的地方都加中文标注」）。 */
export const QUANTITY_LABELS: Record<string, string> = {
  // 常数
  c: '光速',
  G: '引力常数',
  h: '普朗克常数',
  hbar: '约化普朗克常数',
  kB: '玻尔兹曼常数',
  NA: '阿伏伽德罗常数',
  e_charge: '元电荷',
  me: '电子质量',
  mp: '质子质量',
  epsilon0: '真空介电常数',
  mu0: '真空磁导率',
  sigma: '斯特藩常数',
  bWien: '维恩位移常数',
  alpha_fs: '精细结构常数',
  R: '气体常数',
  kCoulomb: '库仑常数',
  Lsun: '太阳光度',
  ly: '光年',
  mPlanck: '普朗克质量',
  lPlanck: '普朗克长度',
  tPlanck: '普朗克时间',
  re: '经典电子半径',
  alphaG: '引力耦合常数',
  // 接口卡
  原子尺度: '原子尺度',
  键能范围: '键能范围',
  材料强度密度比: '材料强度密度比',
  代谢能尺度: '代谢能尺度',
  骨骼强度体重比: '骨骼强度体重比',
  身高大气标高比: '身高/大气标高',
  反应时间重力比: '反应时间/重力',
  大气逃逸率: '大气逃逸率',
  地质热流: '地质热流',
  恒星寿命: '恒星寿命',
  辐射谱峰值波长: '辐射谱峰值波长',
  主要溶剂相变点: '主要溶剂相变点',
  辐射吸收窗口: '辐射吸收窗口',
  热导与散热: '热导与散热',
  // 场景量
  表面重力: '表面重力',
  行星质量: '行星质量',
  行星半径: '行星半径',
  大气密度: '大气密度',
  地表温度: '地表温度',
  气压: '气压',
  恒星质量: '恒星质量',
  恒星辐射: '恒星辐射',
  轨道距离: '轨道距离',
  温室效应: '温室效应',
  反照率: '反照率',
  恒星光度: '恒星光度',
  基础常数: '基础常数',
}

/** 层的中文名。 */
const LAYER_NAMES = [
  '基础常数',
  '第一层（微观）',
  '第二层（材料）',
  '第三层（体感）',
  '第四层（行星）',
  '第五层（恒星）',
]

/**
 * 把布局结果整理成分层可折叠的行。
 *
 * @param layout - layoutGraph 的结果
 * @param expandedDepths - 用户手动展开的层（默认只展开最上一层）
 * @returns 每层的渲染数据
 */
export function toRenderRows(
  layout: { nodes: Array<{ id: string; depth: number; incoming: number }>; maxDepth: number },
  expandedDepths: number[] = [],
): RenderRow[] {
  const byDepth = new Map<number, Array<{ id: string; label: string; incoming: number }>>()

  for (const node of layout.nodes) {
    const list = byDepth.get(node.depth) ?? []
    list.push({
      id: node.id,
      label: QUANTITY_LABELS[node.id] || node.id,
      incoming: node.incoming,
    })
    byDepth.set(node.depth, list)
  }

  const rows: RenderRow[] = []
  const depths = Array.from(byDepth.keys()).sort(function (a, b) { return b - a })
  for (const depth of depths) {
    const nodes = byDepth.get(depth) as Array<{ id: string; label: string; incoming: number }>
    rows.push({
      depth: depth,
      layerName: LAYER_NAMES[depth] || ('第 ' + (depth + 1) + ' 层'),
      nodes: nodes.sort(function (a, b) { return a.label.localeCompare(b.label) }),
      // 默认：只展开最上面一层（val），其余折叠——避免一屏塞满
      expanded: expandedDepths.length > 0 ? expandedDepths.includes(depth) : depth === Math.max.apply(null, depths),
    })
  }
  return rows
}

/**
 * 生成带箭头的连线路径（比纯贝塞尔更明显）。
 *
 * @param edge - 边的坐标
 * @returns SVG path
 */
export function arrowPath(edge: { x1: number; y1: number; x2: number; y2: number }): string {
  const midY = (edge.y1 + edge.y2) / 2
  return 'M ' + edge.x1 + ' ' + edge.y1 +
    ' C ' + edge.x1 + ' ' + midY + ', ' + edge.x2 + ' ' + midY + ', ' + edge.x2 + ' ' + edge.y2
}

/**
 * 箭头三角的坐标（放在线的终点上方）。
 *
 * @param edge - 边的坐标
 * @returns SVG polygon 的 points
 */
export function arrowHead(edge: { x2: number; y2: number }, size = 5): string {
  const y = edge.y2 - 2
  return [
    (edge.x2 - size) + ',' + (y - size),
    (edge.x2 + size) + ',' + (y - size),
    edge.x2 + ',' + y,
  ].join(' ')
}
