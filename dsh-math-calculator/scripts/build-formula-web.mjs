process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const ROOT = 'D:/0cengxu/5/dsh-math-calculator'
const formulas = JSON.parse(readFileSync(ROOT + '/src/data/formulas.json', 'utf8'))
const constants = JSON.parse(readFileSync(ROOT + '/src/data/constants-graph.json', 'utf8'))
const systems = JSON.parse(readFileSync(ROOT + '/src/data/systems.json', 'utf8'))
const { buildEngine } = await import(pathToFileURL(ROOT + '/lib/core/engine.js').href)
const engine = buildEngine()
const ORDER = ['M', 'L', 'T', 'I', 'Theta', 'J', 'N']
function dimOf(unitText) {
  const t = String(unitText || '').replace(/[（(].*?[）)]/g, '').trim()
  if (!t) return null
  const m = /^([A-Za-z][A-Za-z0-9\^*/·().\- ]*)/.exec(t)
  if (!m) return null
  try {
    const parsed = engine.evaluate('1 ' + m[1].replace(/\s+/g, ''))
    if (parsed?.isUnit !== true) return null
    const dims = parsed.dimensions ?? []
    const dim = {}
    for (let i = 0; i < ORDER.length; i += 1) if ((dims[i] || 0) !== 0) dim[ORDER[i]] = dims[i]
    return Object.keys(dim).length > 0 ? JSON.stringify(dim) : null
  } catch { return null }
}
const GROUPS = [
  { name: '力', dim: '{"M":1,"L":1,"T":-2}', words: ['力', '载荷', '荷载', '重量', '重力', '推力', '拉力', '张力', '剪力', '轴力', '浮力', '摩擦', '支持力'] },
  { name: '能量', dim: '{"M":1,"L":2,"T":-2}', words: ['能量', '功', '热量', '内能', '焓', '势能', '动能', '热能', '潜热', '焦耳'] },
  { name: '力矩', dim: '{"M":1,"L":2,"T":-2}', words: ['力矩', '弯矩', '扭矩', '转矩'] },
  { name: '功率', dim: '{"M":1,"L":2,"T":-3}', words: ['功率', '耗电', '发电'] },
  { name: '速度', dim: '{"L":1,"T":-1}', words: ['速度', '速率', '流速', '风速', '船速', '车速', '末速度', '初速度', '相对速度'] },
  { name: '加速度', dim: '{"L":1,"T":-2}', words: ['加速度', '重力加速度', '向心加速度'] },
  { name: '时间', dim: '{"T":1}', words: ['时间', '时长', '周期', '工期', '寿命', '年龄', '天数', '小时'] },
  { name: '长度', dim: '{"L":1}', words: ['长度', '距离', '位移', '半径', '直径', '高度', '深度', '宽度', '厚度', '跨度', '行程', '水深', '河宽', '边长', '视距'] },
  { name: '面积', dim: '{"L":2}', words: ['面积', '截面', '表面积', '耕地', '播种', '围护'] },
  { name: '体积', dim: '{"L":3}', words: ['体积', '容积', '方量', '蓄水'] },
  { name: '质量', dim: '{"M":1}', words: ['质量', '干重', '湿重'] },
  { name: '密度', dim: '{"M":1,"L":-3}', words: ['密度'] },
  { name: '温度', dim: '{"Theta":1}', words: ['温度', '温差', '终温', '初温', '熔点', '沸点', '体温'] },
  { name: '压强', dim: '{"M":1,"L":-1,"T":-2}', words: ['压强', '压力', '应力', '强度', '许用应力', '屈服强度', '抗压强度', '抗弯强度'] },
  { name: '频率', dim: '{"T":-1}', words: ['频率', '截止频率', '带宽'] },
  { name: '波长', dim: '{"L":1}', words: ['波长'] },
  { name: '电荷', dim: '{"T":1,"I":1}', words: ['电荷', '电量'] },
  { name: '电流', dim: '{"I":1}', words: ['电流'] },
  { name: '电压', dim: '{"M":1,"L":2,"T":-3,"I":-1}', words: ['电压', '电势差'] },
  { name: '电阻', dim: '{"M":1,"L":2,"T":-3,"I":-2}', words: ['电阻'] },
  { name: '电容', dim: '{"M":-1,"L":-2,"T":4,"I":2}', words: ['电容'] },
  { name: '电感', dim: '{"M":1,"L":2,"T":-2,"I":-2}', words: ['电感'] },
  { name: '模量', dim: '{"M":1,"L":-1,"T":-2}', words: ['模量', '杨氏模量', '剪切模量', '体积模量'] },
  { name: '转动惯量', dim: '{"M":1,"L":2}', words: ['转动惯量', '惯性矩'] },
  { name: '流量', dim: '{"L":3,"T":-1}', words: ['流量', '出流量', '渗流量', '水流量'] },
  { name: '物质的量', dim: '{"N":1}', words: ['物质的量', '摩尔数', '摩尔量'] },
  { name: '浓度', dim: '{"N":1,"L":-3}', words: ['浓度', '摩尔浓度'] },
  { name: '热容', dim: '{"M":1,"L":2,"T":-2,"Theta":-1}', words: ['热容', '比热', '热容量'] },
  { name: '导热系数', dim: '{"M":1,"L":1,"T":-3,"Theta":-1}', words: ['导热系数', '热导率'] },
  { name: '数量', dim: null, words: ['数量', '个数', '人数', '头数', '件数', '块数', '砖数'] },
  { name: '比率', dim: null, words: ['比率', '比例', '效率', '系数', '份额', '占比', '产率', '税率'] },
  { name: '金额', dim: null, words: ['金额', '成本', '价格', '收入', '费用', '税', '预算'] },
  { name: '指数', dim: null, words: ['指数', '评分', '等级'] },
]
const nameHas = (text, group) => group.words.some((w) => text.includes(w))
function outGroup(f) {
  const text = String(f.name) + ' ' + String(f.desc || '')
  const dim = dimOf(f.unit)
  const candidates = GROUPS.filter((g) => g.dim === dim)
  if (candidates.length === 0) {
    for (const g of GROUPS) if (g.dim === null && nameHas(text, g)) return g.name
    return null
  }
  const exact = candidates.filter((g) => nameHas(text, g))
  return exact.length > 0 ? exact[0].name : candidates[0].name
}
function paramGroup(p) {
  const text = String(p.quantity || '') + ' ' + String(p.desc || '')
  const dim = p.dimension ? JSON.stringify(p.dimension) : null
  let best = null
  for (const g of GROUPS) {
    if (!nameHas(text, g)) continue
    if (dim !== null && g.dim !== null && g.dim !== dim) continue
    if (best === null || g.words.some((w) => String(p.quantity || '').includes(w))) best = g
  }
  return best === null ? null : best.name
}
/** 别名折叠：同式重复条并入主节点（aliasOf）。 */
const aliasMap = new Map(formulas.filter((f) => typeof f.aliasOf === 'string').map((f) => [f.id, f.aliasOf]))
const mainOf = (id) => aliasMap.get(id) ?? id
const mains = formulas.filter((f) => typeof f.aliasOf !== 'string')
const outs = new Map()
for (const f of mains) { const g = outGroup(f); if (g) outs.set(f.id, g) }
const params = []
for (const f of mains) for (const [name, p] of Object.entries(f.params || {})) { const g = paramGroup(p); if (g) params.push({ formula: f.id, name, g }) }
const formulaEdges = []
const edgeSeen = new Set()
for (const [fid, og] of outs) for (const p of params) {
  if (p.formula === fid || p.g !== og) continue
  const from = mainOf(fid), to = mainOf(p.formula)
  if (from === to) continue
  const key = from + '>' + to + '>' + p.name
  if (edgeSeen.has(key)) continue
  edgeSeen.add(key)
  formulaEdges.push([from, to, p.name, og])
}
/** 链边：systems.json 的 dataFlow（人工声明的确定性路径）。 */
const chains = Array.isArray(systems) ? systems : (systems.systems || [])
const chainEdges = []
const chainIndex = {}
for (const chain of chains) {
  const steps = chain.steps || []
  steps.forEach((step, index) => {
    const to = mainOf(step.formula)
    for (const [param, mapping] of Object.entries(step.dataFlow || {})) {
      const source = steps[mapping.fromStep - 1]
      if (!source) continue
      const from = mainOf(source.formula)
      chainEdges.push([chain.id, index + 1, from, to, param, mapping.fromStep])
      for (const [id, role, stepNo] of [[from, 'upstream', mapping.fromStep], [to, 'downstream', index + 1]]) {
        if (chainIndex[id] === undefined) chainIndex[id] = []
        if (!chainIndex[id].some((item) => item.chain === chain.id && item.step === stepNo && item.role === role)) chainIndex[id].push({ chain: chain.id, step: stepNo, role })
      }
    }
  })
}
const constEdges = []
for (const c of constants) {
  if (typeof c.standard !== 'number' || !Number.isFinite(c.standard) || c.standard === 0) continue
  for (const f of formulas) {
    for (const [pname, p] of Object.entries(f.params || {})) {
      if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value === 0) continue
      if (Math.abs(p.value - c.standard) / Math.abs(c.standard) < 1e-6) { constEdges.push([c.name, mainOf(f.id), pname]); break }
    }
  }
}
const adj = new Map()
for (const [from, to] of formulaEdges) { if (!adj.has(from)) adj.set(from, []); adj.get(from).push(to) }
const color = new Map()
let cycleEdges = 0
const sampleCycles = []
const path = []
const visit = (node) => {
  color.set(node, 1)
  path.push(node)
  for (const next of adj.get(node) || []) {
    const c = color.get(next) || 0
    if (c === 1) {
      cycleEdges += 1
      if (sampleCycles.length < 5) {
        const start = path.indexOf(next)
        if (start >= 0) sampleCycles.push(path.slice(start).concat(next))
      }
      continue
    }
    if (c === 0) visit(next)
  }
  path.pop()
  color.set(node, 2)
}
for (const node of adj.keys()) if (!color.has(node)) visit(node)
const withIn = new Set(formulaEdges.map((e) => e[1]))
const withOut = new Set(formulaEdges.map((e) => e[0]))
const web = {
  meta: {
    builtAt: '2026-11-19', formulas: mains.length, constants: constants.length, aliasCount: aliasMap.size,
    constantEdges: constEdges.length, formulaEdges: formulaEdges.length, groups: GROUPS.length,
    chainCount: chains.length, chainEdges: chainEdges.length,
    cycleEdges, isolatedNoIn: mains.filter((f) => !withIn.has(f.id)).length,
    sources: mains.filter((f) => !withIn.has(f.id)).length,
    sinks: mains.filter((f) => !withOut.has(f.id)).length,
    sampleCycles,
    note: '常数边：参数默认值 ≈ 常数；公式边：输出物理量组 == 下游参数组（同义词组 + 量纲校验），闭合环由互引产生。',
  },
  groupNames: GROUPS.map((g) => g.name),
  aliases: Object.fromEntries(aliasMap),
  constants: constants.map((c) => [c.name, c.standard, c.unit]),
  constantEdges: constEdges,
  formulaEdges,
  /** [链 id, 步号, 上游公式, 下游公式, 下游参数, 上游步号]。 */
  chainEdges,
  /** 公式 → 参与的链（chain/step/role）。 */
  chainIndex,
  /** 链 id → 显示名。 */
  chainNames: Object.fromEntries(chains.map((chain) => [chain.id, chain.name ?? chain.label ?? chain.id])),
}
writeFileSync(ROOT + '/src/data/formula-web.json', JSON.stringify(web))
const bytes = JSON.stringify(web).length
console.log('formulaEdges', formulaEdges.length, '| constantEdges', constEdges.length, '| chainEdges', chainEdges.length, '| cycleEdges', cycleEdges)
console.log('无入边', web.meta.sources, '| 无出边', web.meta.sinks, '| 文件字节', bytes)
console.log('样例环:', sampleCycles.slice(0, 3).map((c) => c.join('→')).join(' | '))
