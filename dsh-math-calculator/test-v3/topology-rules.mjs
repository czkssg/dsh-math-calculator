/**
 * topology rules 测试：七条通用规则。
 *
 * 每条都成对验证：健康的拓扑判 ok，人为破坏的结构判 warn。
 * 缺数据时必须「未检查」，不能当通过。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-topo-rules-'))
const model = await import(pathToFileURL(join(root, 'lib/features/topology/model.js')).href)
const rules = await import(pathToFileURL(join(root, 'lib/features/topology/rules.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

const healthy = model.buildTopology({
  nodes: [
    { id: 'A', name: '帝都', kind: 'city', lat: 39.9, lon: 116.4 },
    { id: 'B', name: '港口', kind: 'port', lat: 31.2, lon: 121.5 },
  ],
  edges: [{ from: 'A', to: 'B', kind: 'road' }],
})

console.log('-- 1. 全 ok 场景 --')
{
  const out = rules.checkRules(healthy, {
    groups: [{ name: '人口', total: 100, parts: [{ name: '士', value: 40 }, { name: '农', value: 35 }, { name: '工', value: 25 }] }],
    capacities: [{ from: 'A', to: 'B', capacity: 100, load: 80 }],
    properties: [{ entity: 'A', key: '人口', values: [{ source: '表1', value: 100 }, { source: '表2', value: 100 }] }],
    source: 'A',
  })
  const status = (rule) => out.value.findings.filter((f) => f.rule === rule).map((f) => f.status)
  assert('闭合 ok', status('closure').includes('ok'), JSON.stringify(status('closure')))
  assert('对称 ok', status('symmetry').includes('ok'), '')
  assert('无环 ok', status('acyclic').includes('ok'), '')
  assert('可达 ok', status('reachable').includes('ok'), '')
  assert('容量 ok', status('capacity').includes('ok'), '')
  assert('连续 ok（边长度由坐标算）', status('continuity').includes('ok'), JSON.stringify(out.value.findings))
  assert('一致 ok', status('consistency').includes('ok'), '')
  assert('无 notice', out.notice === undefined, String(out.notice))
}

console.log('-- 2. 各条规则的 warn --')
{
  const badGroups = rules.checkRules(healthy, { groups: [{ name: '人口', total: 100, parts: [{ name: '士', value: 40 }, { name: '农', value: 35 }, { name: '工', value: 20 }] }] })
  const closure = badGroups.value.findings.find((f) => f.rule === 'closure')
  assert('★ 闭合差 5% → warn', closure.status === 'warn' && closure.message.includes('5.0%'), closure.message)

  const oneWay = model.buildTopology({ nodes: [{ id: 'A' }, { id: 'B', x: 10, y: 0 }], edges: [{ from: 'A', to: 'B', bidirectional: false }] })
  const sym = rules.checkRules(oneWay).value.findings.find((f) => f.rule === 'symmetry')
  assert('★ 单向边 → warn', sym.status === 'warn' && sym.where.join(',').includes('A→B'), sym.message)

  const cycle = model.buildTopology({ nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }] })
  assert('★ 三角 → 有环 warn', rules.checkRules(cycle).value.findings.find((f) => f.rule === 'acyclic').status === 'warn', '')

  const isolated = model.buildTopology({ nodes: [{ id: 'A' }, { id: 'B' }, { id: '孤岛' }], edges: [{ from: 'A', to: 'B' }] })
  const reach = rules.checkRules(isolated, { source: 'A' }).value.findings.find((f) => f.rule === 'reachable')
  assert('★ 孤立节点 → 不可达 warn', reach.status === 'warn' && reach.where.includes('孤岛'), JSON.stringify(reach))

  const over = rules.checkRules(healthy, { capacities: [{ from: 'A', to: 'B', capacity: 100, load: 120 }] }).value.findings.find((f) => f.rule === 'capacity')
  assert('★ 容量超 20 → warn', over.status === 'warn' && over.message.includes('20'), over.message)

  const badLength = model.buildTopology({ nodes: [{ id: 'A', lat: 39.9, lon: 116.4 }, { id: 'B', lat: 31.2, lon: 121.5 }], edges: [{ from: 'A', to: 'B', lengthKm: 200 }] })
  const cont = rules.checkRules(badLength).value.findings.find((f) => f.rule === 'continuity')
  assert('★ 声明 200km 但坐标 1067km → 连续 warn', cont.status === 'warn' && cont.message.includes('偏差'), cont.message)

  const conflict = rules.checkRules(healthy, { properties: [{ entity: 'A', key: '人口', values: [{ source: '表1', value: 100 }, { source: '表2', value: 8 }] }] }).value.findings.find((f) => f.rule === 'consistency')
  assert('★ 同一属性两处不同 → 一致 warn', conflict.status === 'warn' && conflict.where.length === 2, conflict.message)
}

console.log('-- 3. 缺数据 = 未检查（不当通过）--')
{
  const empty = rules.checkRules(healthy)
  const unchecked = empty.value.findings.filter((f) => f.status === 'unchecked').map((f) => f.rule)
  assert('★ 闭合/容量/一致 未给数据 → unchecked', ['closure', 'capacity', 'consistency'].every((rule) => unchecked.includes(rule)), JSON.stringify(unchecked))
  assert('空 context 时可达仍检查', empty.value.findings.some((f) => f.rule === 'reachable' && f.status === 'ok'), '')
  assert('result 标「未检查」', empty.result.includes('未检查'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
