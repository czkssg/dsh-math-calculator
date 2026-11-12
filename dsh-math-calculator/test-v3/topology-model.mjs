/**
 * topology model 测试：构建、校验与摘要。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-model-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/topology/model.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

console.log('-- 1. 构建与摘要 --')
{
  const t = mod.buildTopology({
    nodes: [
      { id: 'A', name: '帝都', kind: 'city', lat: 39.9, lon: 116.4 },
      { id: 'B', name: '港口', kind: 'port', lat: 31.2, lon: 121.5 },
      { id: 'C', name: '煤田', kind: 'mine', lat: -75, lon: 0 },
    ],
    edges: [
      { from: 'A', to: 'B', kind: 'road' },
      { from: 'B', to: 'C', kind: 'sea' },
    ],
  })
  assert('3 节点 2 边', t.nodes.size === 3 && t.edges.length === 2, t.nodes.size + '/' + t.edges.length)
  assert('★ 边长度由坐标自动算（帝都—港口 ≈ 1067km）', near(t.edges[0].lengthKm, 1067, 5), String(t.edges[0].lengthKm))
  assert('sea 边也算了长度（港口—煤田 > 10000km）', t.edges[1].lengthKm > 10000, String(t.edges[1].lengthKm))
  assert('摘要 kinds 计数', mod.summarizeTopology(t).kinds.road === 1 && mod.summarizeTopology(t).kinds.sea === 1, '')
  assert('无孤立节点', mod.summarizeTopology(t).isolated.length === 0, '')
  assert('无环', mod.summarizeTopology(t).cycles === false, '')
}

console.log('-- 2. 校验：必须报错的形态 --')
{
  assert('重复 id → invalid_argument', throwsOf(() => mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'A' }] }))?.type === 'invalid_argument', '')
  assert('缺 id → invalid_argument', throwsOf(() => mod.buildTopology({ nodes: [{ name: 'x' }] }))?.type === 'invalid_argument', '')
  assert('空 nodes → missing_params', throwsOf(() => mod.buildTopology({ nodes: [] }))?.type === 'missing_params', '')
  assert('★ 悬空边 → unknown_symbol', throwsOf(() => mod.buildTopology({ nodes: [{ id: 'A' }], edges: [{ from: 'A', to: 'B' }] }))?.type === 'unknown_symbol', '')
  assert('★ 自环 → invalid_argument', throwsOf(() => mod.buildTopology({ nodes: [{ id: 'A' }], edges: [{ from: 'A', to: 'A' }] }))?.type === 'invalid_argument', '')
  assert('负长度 → invalid_argument', throwsOf(() => mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'B', x: 1, y: 0 }], edges: [{ from: 'A', to: 'B', lengthKm: -5 }] }))?.type === 'invalid_argument', '')
}

console.log('-- 3. 校验：报告项（不阻断）--')
{
  const dup = mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ from: 'A', to: 'B' }, { from: 'A', to: 'B' }] })
  assert('重复边只保留一条，并报告', dup.edges.length === 1 && dup.findings.some((f) => f.kind === 'duplicate_edge'), JSON.stringify(dup.findings))

  const iso = mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'B' }, { id: '孤岛' }], edges: [{ from: 'A', to: 'B' }] })
  assert('★ 孤立节点被报告', iso.findings.some((f) => f.kind === 'isolated' && f.message.includes('孤岛')), JSON.stringify(iso.findings))
  assert('摘要列出孤立节点', mod.summarizeTopology(iso).isolated.includes('孤岛'), '')

  const cyc = mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }] })
  assert('★ 环被报告（不报错）', cyc.findings.some((f) => f.kind === 'cycle') && mod.summarizeTopology(cyc).cycles === true, '')

  const oneWay = mod.buildTopology({ nodes: [{ id: 'A' }, { id: 'B', x: 10, y: 0 }], edges: [{ from: 'A', to: 'B', bidirectional: false }] })
  assert('单向边被报告（可达性偏乐观）', oneWay.findings.some((f) => f.kind === 'one_way'), '')
}

console.log('-- 4. 距离公式 --')
{
  assert('同一点距离 0', mod.haversineKm(39.9, 116.4, 39.9, 116.4) === 0, '')
  assert('赤道 1 度经度 ≈ 111.2km', near(mod.haversineKm(0, 0, 0, 1), 111.19, 0.1), String(mod.haversineKm(0, 0, 0, 1)))
  assert('★ 行星半径翻倍 → 距离翻倍', near(mod.haversineKm(0, 0, 0, 1, 12742), 222.39, 0.2), '')
  assert('平面距离 3-4-5', mod.planarKm(0, 0, 3, 4) === 5, '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
