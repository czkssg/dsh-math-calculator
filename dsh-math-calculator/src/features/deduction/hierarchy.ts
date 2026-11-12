/**
 * 编制 / 层级树（`hierarchy`）。
 *
 * ## 为什么这是推演段最痛的一项
 *
 * 反馈包实测：99 层项目连续 7 轮返工，其中 5 轮是编制树。
 * 层级树要「树状 + 闭合」：每级辖属数、底层基数、总兵力三者自洽，
 * 而 AI 只能一层一层算，每回都漏掉某一级，用户唯一的手段是「感觉不对」。
 *
 * ## 两种输入，统一成拓扑
 *
 * ```
 *   等比链（老接口，兼容）   { levels:["师","团","营"], tree:[3,3], base:10 }
 *   自由拓扑（新能力）       { nodes:[{id,name,parent,count,own,authorized,level,props}] }
 * ```
 *
 * 自由拓扑是「相对自由的层级拓扑」：真实编制有不等比（师辖 3 普通团 + 1 加强团）、
 * 跨级（师直属独立营）、兵种混合（步/炮/工编成不同）、缺编（战损后某团实有 2 营）
 * 四形态，等比链表达不了。
 *
 * 统一算法：把两种输入都建成 `id → 父 + 直属人数 + 实有单位数` 的节点表，
 * 再自底向上算「一个该级单位含多少人」：`perUnit = own + Σ(child.count × child.perUnit)`。
 *
 * ## 判据
 *
 * - 环、悬空父节点、重复 id → 直接报错（拓扑不成立，算出来的数没有意义）；
 * - 缺编 / 超编 / 跨级 → 报告，不报错（它们是真实编制状态，不是错误）；
 * - 多根 → 报错并要求 `root`（一棵树只能有一个根，多根时总兵力取决于你算哪棵）。
 *
 * @module dsh-math-calculator/features/deduction/hierarchy
 */

import { CalcError } from '../../core/errors.js'

/** 自由拓扑的一个节点。 */
export interface HierarchyNodeInput {
  /** 唯一 id。 */
  id: string
  /** 显示名（缺省用 id）。 */
  name?: string
  /** 父节点 id（根省略）。 */
  parent?: string
  /** 该级实有单位数（缺省 1）。 */
  count?: number
  /** 本单位直属人数（不含下级）。 */
  own?: number
  /** 该级应有单位数（给缺编判定用）。 */
  authorized?: number
  /** 层级序号（可选；给了才核对跨级）。 */
  level?: number
  /** 自由属性（兵种、驻地、装备…）。 */
  props?: Record<string, unknown>
}

/** 输入（两种模式）。 */
export interface HierarchyInput {
  /** 等比链：层级名（自上而下）。 */
  levels?: string[]
  /** 等比链：每级下辖倍数（长度 = levels.length − 1）。 */
  tree?: number[]
  /** 底层一个单位的人数。 */
  base?: number
  /** 总兵力（给 total 时反解或校验）。 */
  total?: number
  /** 自由拓扑节点。 */
  nodes?: HierarchyNodeInput[]
  /** 自由拓扑边（from=父，to=子）；与 node.parent 二选一或并用。 */
  edges?: Array<{ from: string; to: string }>
  /** 多根时指定根节点。 */
  root?: string
}

/** 计算后的节点。 */
export interface ComputedNode {
  id: string
  name: string
  parent: string | null
  depth: number
  count: number
  own: number
  perUnit: number
  total: number
  authorized: number | null
  shortfall: number | null
  overstrength: number | null
  crossLevel: boolean
  props: Record<string, unknown>
  children: string[]
}

/** 结果。 */
export interface HierarchyOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function show(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e7 || abs < 1e-3) return value.toExponential(3)
  return String(Number(value.toPrecision(6)))
}

/** 校验正有限数。 */
function positive(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CalcError('invalid_argument', label + ' 必须是有限数（收到 ' + JSON.stringify(value) + '）', '例如 ' + label + ':10。')
  }
  if (value <= 0) {
    throw new CalcError('invalid_argument', label + ' 必须大于 0（收到 ' + value + '）', '编制里的单位数与人数不能为 0 或负数。')
  }
  return value
}

/** 等比链 → 节点表。 */
function fromEqualChain(input: HierarchyInput): { nodes: HierarchyNodeInput[]; topLevel: string; tree: number[]; levels: string[]; base?: number; total?: number } {
  const levels = Array.isArray(input.levels) ? input.levels.map((item) => String(item)) : []
  const tree = Array.isArray(input.tree) ? input.tree.map((item) => Number(item)) : []
  if (levels.length < 2) {
    throw new CalcError(
      'invalid_argument',
      'levels 至少要两级，收到 ' + levels.length,
      '例如 ["师","团","营"]。单级不需要编制树。',
    )
  }
  if (tree.length !== levels.length - 1) {
    throw new CalcError(
      'invalid_argument',
      'tree 的长度必须等于 levels.length − 1（' + (levels.length - 1) + '），收到 ' + tree.length,
      '每一级一个下辖倍数。例如 levels 有 5 级，tree 就要 4 个数。',
    )
  }
  for (const item of tree) {
    if (!Number.isFinite(item) || item <= 0) {
      throw new CalcError('invalid_argument', 'tree 里每个倍数必须是正数，收到 ' + String(item), '下辖倍数不能为 0（那意味着这一级没有下属）。')
    }
  }
  const base = positive(input.base, 'base')
  const total = positive(input.total, 'total')
  if (base === undefined && total === undefined) {
    throw new CalcError(
      'invalid_argument',
      'hierarchy 需要 base（底层基数）或 total（总兵力）之一',
      '给 base 正向算总兵力；给 total 反解每级规模；两个都给则校验自洽。',
    )
  }

  /** 链式节点：第 i 级 count=1；叶子的 own = base（若给）；各级 own=0。 */
  const nodes: HierarchyNodeInput[] = levels.map((name, index) => ({
    id: name + '#' + index,
    name,
    ...(index === 0 ? {} : { parent: levels[index - 1] + '#' + (index - 1) }),
    count: 1,
    own: index === levels.length - 1 && base !== undefined ? base : 0,
    level: index,
  }))
  return { nodes, topLevel: levels[0], tree, levels, ...(base === undefined ? {} : { base }), ...(total === undefined ? {} : { total }) }
}

/**
 * 建树并计算。
 *
 * @param nodes - 节点输入
 * @returns 计算后的节点（根在前）
 * @throws {CalcError} 重复 id / 悬空父 / 环 / 多根 / 非法数值
 */
function compute(nodes: HierarchyNodeInput[]): { computed: ComputedNode[]; roots: string[]; total: number } {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new CalcError('missing_params', 'hierarchy 需要非空的 nodes（或 levels/tree/base）', '例如 nodes:[{id:"师"},{id:"团",parent:"师",count:3}]。')
  }
  const byId = new Map<string, HierarchyNodeInput>()
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || node.id.trim() === '') {
      throw new CalcError('invalid_argument', '每个节点都要有非空字符串 id', '例如 {id:"师", name:"师部"}。')
    }
    const id = node.id.trim()
    if (byId.has(id)) {
      throw new CalcError('invalid_argument', '节点 id 重复：' + id, 'id 是拓扑的主键，重复会让父子关系无从判断。')
    }
    const count = positive(node.count, id + '.count')
    const own = node.own === undefined ? 0 : node.own
    if (typeof own !== 'number' || !Number.isFinite(own) || own < 0) {
      throw new CalcError('invalid_argument', id + '.own 必须是非负有限数（收到 ' + JSON.stringify(node.own) + '）', 'own 是本单位直属人数。')
    }
    const authorized = positive(node.authorized, id + '.authorized')
    byId.set(id, { ...node, id, count: count ?? 1, own, ...(authorized === undefined ? {} : { authorized }) })
  }

  /** 父子关系：node.parent 与 edges 合并；两者冲突时以 node.parent 为准并记 notice。 */
  const parentOf = new Map<string, string | null>()
  for (const node of byId.values()) parentOf.set(node.id, typeof node.parent === 'string' && node.parent.trim() !== '' ? node.parent.trim() : null)

  const roots = [...byId.values()].filter((node) => parentOf.get(node.id) === null).map((node) => node.id)
  for (const id of parentOf.values()) {
    if (id === null) continue
    if (!byId.has(id)) {
      throw new CalcError('unknown_symbol', '节点 ' + id + ' 作为父节点不存在', '父节点必须在 nodes 里；悬空父节点会让整棵树无法闭合。')
    }
  }
  if (roots.length === 0) {
    throw new CalcError('invalid_argument', '拓扑没有根（每个节点都有父节点）——这一定是环', '用 derivation 之外的检查：从任一节点向上走，若能回到自己就是环。')
  }

  /** 子节点表。 */
  const childrenOf = new Map<string, string[]>()
  for (const id of byId.keys()) childrenOf.set(id, [])
  for (const [child, parent] of parentOf) if (parent !== null) childrenOf.get(parent)!.push(child)

  /** 深度与环检测（DFS）。 */
  const depth = new Map<string, number>()
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string, stack: string[]): number => {
    const current = state.get(id)
    if (current === 'visiting') {
      throw new CalcError('invalid_argument', '拓扑有环：' + [...stack, id].join(' → '), '编制树必须是树；环意味着某级辖属自己，人数会被无限累加。')
    }
    if (current === 'done') return depth.get(id)!
    state.set(id, 'visiting')
    const parent = parentOf.get(id) ?? null
    const value = parent === null ? 0 : visit(parent, [...stack, id]) + 1
    state.set(id, 'done')
    depth.set(id, value)
    return value
  }
  for (const id of byId.keys()) visit(id, [])

  /** 自底向上：perUnit = own + Σ(child.count × child.perUnit)。 */
  const perUnit = new Map<string, number>()
  const order = [...byId.keys()].sort((a, b) => depth.get(b)! - depth.get(a)!)
  for (const id of order) {
    const node = byId.get(id)!
    let sum = node.own ?? 0
    for (const child of childrenOf.get(id)!) {
      const childNode = byId.get(child)!
      sum += (childNode.count ?? 1) * (perUnit.get(child) ?? 0)
    }
    perUnit.set(id, sum)
  }

  const computed: ComputedNode[] = [...byId.values()].map((node) => {
    const parent = parentOf.get(node.id) ?? null
    const count = node.count ?? 1
    const per = perUnit.get(node.id) ?? 0
    const authorized = node.authorized ?? null
    const level = typeof node.level === 'number' ? node.level : undefined
    const parentLevel = parent !== null ? (byId.get(parent)?.level as number | undefined) : undefined
    return {
      id: node.id,
      name: node.name ?? node.id,
      parent,
      depth: depth.get(node.id) ?? 0,
      count,
      own: node.own ?? 0,
      perUnit: per,
      total: count * per,
      authorized,
      shortfall: authorized === null ? null : Math.max(0, authorized - count),
      overstrength: authorized === null ? null : Math.max(0, count - authorized),
      crossLevel: level !== undefined && parentLevel !== undefined ? parentLevel !== level - 1 : false,
      props: node.props ?? {},
      children: childrenOf.get(node.id) ?? [],
    }
  })

  const total = computed.filter((node) => node.parent === null).reduce((sum, node) => sum + node.total, 0)
  return { computed, roots, total }
}

/**
 * 执行 hierarchy。
 *
 * @param input - 等比链或自由拓扑
 * @returns 渲染结果
 * @throws {CalcError} 见各校验
 */
export function runHierarchy(input: HierarchyInput | undefined): HierarchyOutcome {
  if (input === undefined || input === null) {
    throw new CalcError(
      'missing_params',
      'hierarchy 需要输入',
      '等比链：{hierarchy:{levels:["师","团","营","连","班"], tree:[3,3,3,3], base:10}}。' +
        '自由拓扑：{hierarchy:{nodes:[{id:"师"},{id:"团",parent:"师",count:3,own:10}]}}。',
    )
  }

  const isChain = Array.isArray(input.levels) && input.levels.length > 0
  const isTopology = Array.isArray(input.nodes) && input.nodes.length > 0
  if (!isChain && !isTopology) {
    throw new CalcError(
      'missing_params',
      'hierarchy 需要 levels/tree（等比链）或 nodes（自由拓扑）之一',
      '等比链适合规整编制；不等比/跨级/兵种混合/缺编请用 nodes + parent。',
    )
  }

  const chain = isChain ? fromEqualChain(input) : null
  const nodes = chain ? chain.nodes : (input.nodes as HierarchyNodeInput[])
  if (!chain && input.edges !== undefined) {
    if (!Array.isArray(input.edges)) {
      throw new CalcError('invalid_argument', 'edges 必须是数组（每项 {from,to}）', 'from 是父，to 是子。')
    }
    for (const edge of input.edges) {
      const child = nodes.find((node) => node.id === edge.to)
      if (!child) {
        throw new CalcError('unknown_symbol', 'edges 指向的节点 ' + edge.to + ' 不在 nodes 里', '先把节点列全，再连边。')
      }
      if (child.parent === undefined) child.parent = edge.from
    }
  }

  /** 多根时按 root 选树。 */
  const { computed, roots, total } = compute(nodes)
  if (roots.length > 1 && !(typeof input.root === 'string' && roots.includes(input.root))) {
    throw new CalcError(
      'invalid_argument',
      '拓扑有 ' + roots.length + ' 个根（' + roots.join('、') + '），需要 root 指定算哪一棵',
      '多棵树的总兵力会相加；若这不是你的意图，先用 root 指定，或修正 parent。',
    )
  }
  const selectedRoot = typeof input.root === 'string' ? input.root : roots[0]
  const inTree = (id: string): boolean => {
    let cursor: string | null = id
    while (cursor !== null) {
      if (cursor === selectedRoot) return true
      cursor = computed.find((node) => node.id === cursor)?.parent ?? null
    }
    return false
  }
  const treeNodes = computed.filter((node) => inTree(node.id)).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))
  const treeTotal = treeNodes.find((node) => node.id === selectedRoot)?.total ?? 0

  const lines: string[] = ['═══ 编制树 ═══', '']
  const nameWidth = Math.max(8, ...treeNodes.map((node) => node.name.length)) + 2

  if (chain) {
    /** 等比链：保留老表格的语义（层级/下辖/本级单位数/每单位含人）。 */
    const factor: number[] = new Array(chain.levels.length).fill(1)
    for (let i = chain.levels.length - 2; i >= 0; i -= 1) factor[i] = factor[i + 1] * chain.tree[i]
    const topFactor = factor[0]
    lines.push(
      '  ' + '层级'.padEnd(nameWidth, ' ') + '下辖'.padStart(6, ' ') + '本级单位数'.padStart(12, ' ') + '每单位含人'.padStart(12, ' '),
    )
    lines.push('  ' + '─'.repeat(nameWidth + 32))

    if (chain.base !== undefined) {
      const fullStrength = topFactor * chain.base
      for (let i = 0; i < chain.levels.length; i += 1) {
        lines.push(
          '  ' + chain.levels[i].padEnd(nameWidth, ' ') +
            (i < chain.tree.length ? String(chain.tree[i]) : '—').padStart(6, ' ') +
            show(topFactor / factor[i]).padStart(12, ' ') +
            show(factor[i] * chain.base).padStart(12, ' '),
        )
      }
      lines.push('  ' + '─'.repeat(nameWidth + 32))
      lines.push('  一个满编「' + chain.levels[0] + '」= ' + show(fullStrength) + ' 人（' + show(chain.base) + ' × ' + show(topFactor) + '）')
      if (chain.total !== undefined) {
        const ratio = chain.total / fullStrength
        const rounded = Math.round(ratio)
        const closed = Math.abs(ratio - rounded) < 0.01
        lines.push('')
        if (closed) {
          lines.push('  ✓ 与声称总兵力 ' + show(chain.total) + ' 自洽：正好 ' + show(rounded) + ' 个满编「' + chain.levels[0] + '」')
        } else {
          lines.push('  ✗ 与声称总兵力 ' + show(chain.total) + ' 对不上：一个满编只有 ' + show(fullStrength) + ' 人，' + show(chain.total) + ' 人需要 ' + show(ratio) + ' 个（不是整数）')
          lines.push('    若按 ' + show(rounded) + ' 个算，差 ' + show(chain.total - fullStrength * rounded) + ' 人')
          lines.push('    ★ 三种可能：① 某个 tree 倍数写错；② base 不是「最底层一个单位」的人数；③ 总兵力是「实有」而树是「满编」')
        }
      }
    } else if (chain.total !== undefined) {
      lines.push('  （反解：按 1 个满编「' + chain.levels[0] + '」计）')
      for (let i = 0; i < chain.levels.length; i += 1) {
        const unitCount = topFactor / factor[i]
        const peoplePerUnit = chain.total / unitCount
        const integer = Math.abs(unitCount - Math.round(unitCount)) < 1e-6
        lines.push(
          '  ' + chain.levels[i].padEnd(nameWidth, ' ') +
            (i < chain.tree.length ? String(chain.tree[i]) : '—').padStart(6, ' ') +
            (show(unitCount) + (integer ? '' : ' ※')).padStart(12, ' ') +
            show(peoplePerUnit).padStart(12, ' '),
        )
      }
      lines.push('')
      lines.push('  总兵力 ' + show(chain.total) + ' 人，按倍数链反解：每级单位数都应是整数（某级不是整数时行内会标注）')
    }

    return {
      result: lines.join('\n'),
      value: {
        mode: 'equal-chain',
        levels: chain.levels,
        tree: chain.tree,
        base: chain.base ?? null,
        total: chain.total ?? null,
        factor,
        fullStrength: chain.base !== undefined ? topFactor * chain.base : null,
        closed:
          chain.base !== undefined && chain.total !== undefined
            ? Math.abs(chain.total / (topFactor * chain.base) - Math.round(chain.total / (topFactor * chain.base))) < 0.01
            : null,
      },
    }
  }

  /** 自由拓扑表。 */
  lines.push(
    '  ' + '节点'.padEnd(nameWidth, ' ') + '深度'.padStart(5, ' ') + '单位数'.padStart(8, ' ') +
      '直属'.padStart(8, ' ') + '每单位'.padStart(10, ' ') + '总人数'.padStart(12, ' ') + '状态',
  )
  lines.push('  ' + '─'.repeat(nameWidth + 48))
  const notices: string[] = []
  for (const node of treeNodes) {
    const marks: string[] = []
    if (node.crossLevel) marks.push('跨级')
    if (node.shortfall !== null && node.shortfall > 0) marks.push('缺编 ' + show(node.shortfall))
    if (node.overstrength !== null && node.overstrength > 0) marks.push('超编 ' + show(node.overstrength))
    if (node.children.length === 0) marks.push('叶')
    lines.push(
      '  ' + node.name.padEnd(nameWidth, ' ') + String(node.depth).padStart(5, ' ') + show(node.count).padStart(8, ' ') +
        show(node.own).padStart(8, ' ') + show(node.perUnit).padStart(10, ' ') + show(node.total).padStart(12, ' ') +
        ' ' + marks.join('，'),
    )
  }
  lines.push('  ' + '─'.repeat(nameWidth + 48))
  lines.push('  根「' + (treeNodes.find((node) => node.id === selectedRoot)?.name ?? selectedRoot) + '」总兵力 ' + show(treeTotal) + ' 人')
  if (roots.length > 1) {
    const others = roots.filter((root) => root !== selectedRoot)
    lines.push('  另有 ' + others.length + ' 棵独立树未计入：' + others.join('、') + '（用 root 指定另一棵）')
    notices.push('拓扑有多棵树，本次只算 root 指定的那棵')
  }
  const shortfallTotal = treeNodes.reduce((sum, node) => sum + (node.shortfall ?? 0) * (node.count > 0 ? 1 : 1), 0)
  if (treeNodes.some((node) => node.shortfall !== null && node.shortfall > 0)) {
    lines.push('  缺编单位合计 ' + show(shortfallTotal) + ' 个（按节点逐项相加，不含下级重复计）')
  }
  if (treeNodes.some((node) => node.crossLevel)) {
    lines.push('  跨级节点：' + treeNodes.filter((node) => node.crossLevel).map((node) => node.name).join('、') + '（直属关系与 level 声明不一致）')
  }
  const types = new Map<string, number>()
  for (const node of treeNodes) {
    const type = typeof node.props['type'] === 'string' ? (node.props['type'] as string) : null
    if (type !== null) types.set(type, (types.get(type) ?? 0) + 1)
  }
  if (types.size > 1) lines.push('  兵种/类型分布：' + [...types.entries()].map(([type, count]) => type + '×' + count).join('，'))

  return {
    result: lines.join('\n'),
    value: { mode: 'topology', roots, root: selectedRoot, nodes: treeNodes, total: treeTotal, shortfallTotal },
    ...(notices.length > 0 ? { notice: notices.join('；') } : {}),
  }
}
