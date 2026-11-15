/**
 * hierarchy 边界测试：拓扑不成立时必须报错，真实编制状态只报告。
 *
 * ## 分界线
 *
 * ```
 *   报错   环、悬空父、重复 id、多根未指定、非法数值 → 算出来的数没有意义
 *   报告   缺编、超编、跨级 → 真实编制状态，不是错误
 * ```
 *
 * 这条界线是本模块的核心：把"缺编"当报错会让作者没法写战损后的部队，
 * 把"环"当报告则会输出一个无限累加的总人数。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-hierarchy-boundary-'))

const hier = await import(pathToFileURL(join(root, 'lib/features/deduction/hierarchy.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}
function throwsOf(fn) {
  try { fn(); return null } catch (error) { return error }
}

console.log('-- 1. 输入缺失与形态错误 --')
{
  assert('无输入 → missing_params', throwsOf(() => hier.runHierarchy(undefined))?.type === 'missing_params', '')
  assert('空对象 → missing_params', throwsOf(() => hier.runHierarchy({}))?.type === 'missing_params', '')
  assert('levels 只有一级 → invalid_argument', throwsOf(() => hier.runHierarchy({ levels: ['师'], tree: [], base: 10 }))?.type === 'invalid_argument', '')
  assert('★ tree 长度与 levels 不符 → invalid_argument',
    throwsOf(() => hier.runHierarchy({ levels: ['师', '团', '营'], tree: [3], base: 10 }))?.type === 'invalid_argument', '')
  assert('tree 含 0 → invalid_argument', throwsOf(() => hier.runHierarchy({ levels: ['师', '团'], tree: [0], base: 10 }))?.type === 'invalid_argument', '')
  assert('tree 含负数 → invalid_argument', throwsOf(() => hier.runHierarchy({ levels: ['师', '团'], tree: [-3], base: 10 }))?.type === 'invalid_argument', '')
  assert('★ 既无 base 也无 total → invalid_argument',
    throwsOf(() => hier.runHierarchy({ levels: ['师', '团'], tree: [3] }))?.type === 'invalid_argument', '')
  assert('base 为负 → invalid_argument', throwsOf(() => hier.runHierarchy({ levels: ['师', '团'], tree: [3], base: -1 }))?.type === 'invalid_argument', '')
}

console.log('-- 2. 拓扑不成立 → 报错 --')
{
  assert('nodes 空数组 → missing_params', throwsOf(() => hier.runHierarchy({ nodes: [] }))?.type === 'missing_params', '')
  assert('节点缺 id → invalid_argument', throwsOf(() => hier.runHierarchy({ nodes: [{ name: 'x' }] }))?.type === 'invalid_argument', '')
  assert('★ id 重复 → invalid_argument',
    throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A' }, { id: 'A', parent: undefined }] }))?.type === 'invalid_argument', '')
  assert('★ 悬空父节点 → unknown_symbol',
    throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', parent: '不存在的父' }] }))?.type === 'unknown_symbol', '')
  assert('count 为 0 → invalid_argument', throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', count: 0 }] }))?.type === 'invalid_argument', '')
  assert('own 为负 → invalid_argument', throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', own: -1 }] }))?.type === 'invalid_argument', '')

  // 环：A 父 B、B 父 A → 没有根
  const cycle = throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', parent: 'B' }, { id: 'B', parent: 'A' }] }))
  assert('★ 环 → invalid_argument', cycle?.type === 'invalid_argument', cycle?.type)
  assert('环的提示说清"没有根/是环"', String(cycle?.message ?? '').includes('环'), String(cycle?.message ?? ''))

  // 自环
  const self = throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', parent: 'A' }] }))
  assert('自环也报错', self?.type === 'invalid_argument', self?.type)
}

console.log('-- 3. 多根：必须指定 root --')
{
  const multi = throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A', own: 1 }, { id: 'B', own: 2 }] }))
  assert('★ 多根未指定 → invalid_argument', multi?.type === 'invalid_argument', multi?.type)
  assert('提示列出两个根', String(multi?.message ?? '').includes('A') && String(multi?.message ?? '').includes('B'), '')

  const specified = hier.runHierarchy({ nodes: [{ id: 'A', own: 1 }, { id: 'B', own: 2 }], root: 'B' })
  assert('★ 指定 root 只算一棵树', specified.value.total === 2, String(specified.value.total))
  assert('另一棵树给出 notice', (specified.notice ?? '').includes('多棵'), String(specified.notice))
}

console.log('-- 4. 真实编制状态只报告 --')
{
  const shortfall = hier.runHierarchy({
    nodes: [
      { id: '师', own: 10 },
      { id: '团', parent: '师', count: 2, own: 10, authorized: 3 },
    ],
  })
  const node = shortfall.value.nodes.find((n) => n.id === '团')
  assert('缺编不报错（能正常返回）', node !== undefined, '')
  assert('缺编 1 个单位', node.shortfall === 1, String(node.shortfall))
  assert('总人数按实有算（10 + 2×10 = 30）', shortfall.value.total === 30, String(shortfall.value.total))

  const over = hier.runHierarchy({
    nodes: [{ id: '师', own: 0 }, { id: '团', parent: '师', count: 5, own: 10, authorized: 3 }],
  })
  const overNode = over.value.nodes.find((n) => n.id === '团')
  assert('超编 2 个单位', overNode.overstrength === 2, String(overNode.overstrength))
  assert('超编也进 result', over.result.includes('超编 2'), '')
}

console.log('-- 5. 深层与规模边界 --')
{
  const chain = []
  for (let i = 0; i < 100; i += 1) {
    chain.push({ id: 'L' + i, ...(i === 0 ? {} : { parent: 'L' + (i - 1) }), own: i === 99 ? 1 : 0 })
  }
  const deep = hier.runHierarchy({ nodes: chain })
  assert('★ 100 层链不爆栈', deep.value.total === 1, String(deep.value.total))
  assert('最深节点 depth = 99', deep.value.nodes.find((n) => n.id === 'L99').depth === 99, '')

  const flat = hier.runHierarchy({ nodes: [{ id: '唯一', own: 42 }] })
  assert('单节点拓扑也能算', flat.value.total === 42, String(flat.value.total))

  const wide = hier.runHierarchy({
    nodes: [{ id: '根', own: 1 }, ...Array.from({ length: 50 }, (_, i) => ({ id: '子' + i, parent: '根', own: 1 }))],
  })
  assert('50 个叶子也能算（1 + 50 = 51）', wide.value.total === 51, String(wide.value.total))
}

console.log('-- 6. edges 边界 --')
{
  assert('edges 非数组 → invalid_argument',
    throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A' }], edges: 'x' }))?.type === 'invalid_argument', '')
  assert('★ edges 指向不存在的节点 → unknown_symbol',
    throwsOf(() => hier.runHierarchy({ nodes: [{ id: 'A' }], edges: [{ from: 'A', to: 'B' }] }))?.type === 'unknown_symbol', '')

  const both = hier.runHierarchy({
    nodes: [{ id: 'A' }, { id: 'B', parent: 'A' }, { id: 'C' }],
    edges: [{ from: 'A', to: 'C' }],
  })
  assert('parent 与 edges 并用：B、C 都挂到 A', both.value.total !== undefined && both.value.nodes.filter((n) => n.parent === 'A').length === 2,
    JSON.stringify(both.value.nodes.map((n) => [n.id, n.parent])))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
