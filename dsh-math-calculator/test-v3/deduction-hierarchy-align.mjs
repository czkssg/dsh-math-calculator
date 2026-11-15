/**
 * hierarchy 对齐测试：等比链三种用法 + 自由拓扑四形态。
 *
 * ## 等比链（老接口，对齐）
 *
 * ```
 *   levels ["师","团","营","连","班"]   tree [3,3,3,3]   base 10
 *   师 1 个 / 团 3 / 营 9 / 连 27 / 班 81；师 810 人 / 团 270 / 营 90 / 连 30 / 班 10
 * ```
 *
 * ## 自由拓扑（新能力）
 *
 * 真实的四种形态，等比链表达不了：
 * ```
 *   不等比   师辖 3 普通团 + 1 加强团
 *   跨级     师直属独立营
 *   兵种混合 步/炮/工编成不同
 *   缺编     某团实有 2 营（战损）
 * ```
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-hierarchy-align-'))

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
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ───────────────────────────────────────────────────────────
console.log('-- 1. 等比链：正向 --')
// ───────────────────────────────────────────────────────────
{
  const out = hier.runHierarchy({ levels: ['师', '团', '营', '连', '班'], tree: [3, 3, 3, 3], base: 10 })
  assert('模式 = equal-chain', out.value.mode === 'equal-chain', out.value.mode)
  assert('★ 师满编 810 人', out.value.fullStrength === 810, String(out.value.fullStrength))
  assert('factor = [81,27,9,3,1]', JSON.stringify(out.value.factor) === '[81,27,9,3,1]', JSON.stringify(out.value.factor))
  assert('result 给出 810', out.result.includes('= 810'), out.result.split('\n').slice(-3).join(' | '))
  assert('result 表头有「本级单位数」', out.result.includes('本级单位数'), '')
  assert('★ 团级每单位 270 人', out.result.includes('270'), '')
  assert('★ 班级每单位 10 人', out.result.includes('  10'), '')
  assert('closed 为 null（只给 base 不判）', out.value.closed === null, String(out.value.closed))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 等比链：反解与自洽 --')
// ───────────────────────────────────────────────────────────
{
  const reverse = hier.runHierarchy({ levels: ['师', '团', '营'], tree: [3, 3], total: 900 })
  assert('反解模式不报错', reverse.value.mode === 'equal-chain', '')
  assert('每级单位数 1/3/9 都是整数（行内无标记）', !reverse.result.includes(' ※'), reverse.result)
  assert('顶层每单位 900 人', reverse.result.includes('900'), '')

  const closed = hier.runHierarchy({ levels: ['师', '团'], tree: [3], base: 10, total: 90 })
  assert('★ base 10 × 3 × 3 = 90 与 total 自洽', closed.value.closed === true, String(closed.value.closed))
  assert('result 打勾', closed.result.includes('✓'), '')

  const mismatch = hier.runHierarchy({ levels: ['师', '团'], tree: [3], base: 10, total: 100 })
  assert('★ 100 与满编对不上 → closed false', mismatch.value.closed === false, String(mismatch.value.closed))
  assert('result 说三种可能', mismatch.result.includes('三种可能'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 自由拓扑：不等比 + 缺编 + 跨级 + 混合兵种 --')
// ───────────────────────────────────────────────────────────
{
  const nodes = [
    { id: '师', name: '步兵师', own: 10, count: 1, level: 1, props: { type: '指挥' } },
    { id: '团1', name: '一团', parent: '师', count: 3, own: 8, authorized: 3, level: 2, props: { type: '步兵' } },
    { id: '团2', name: '加强团', parent: '师', count: 1, own: 20, level: 2, props: { type: '步兵' } },
    { id: '炮团', name: '炮兵团', parent: '师', count: 1, own: 30, level: 2, props: { type: '炮兵' } },
    { id: '营', name: '营', parent: '团1', count: 2, own: 5, authorized: 3, level: 3, props: { type: '步兵' } },
    { id: '班', name: '班', parent: '营', count: 3, own: 10, level: 4, props: { type: '步兵' } },
    { id: '独立营', name: '师属独立营', parent: '师', level: 3, count: 1, own: 5, props: { type: '工兵' } },
  ]
  const out = hier.runHierarchy({ nodes })
  assert('模式 = topology', out.value.mode === 'topology', out.value.mode)
  const byId = Object.fromEntries(out.value.nodes.map((node) => [node.id, node]))
  assert('★ 班的每单位人数 = 10', byId['班'].perUnit === 10, String(byId['班'].perUnit))
  assert('★ 营每单位 = 5 + 3×10 = 35（下辖 3 个班）', byId['营'].perUnit === 35, String(byId['营'].perUnit))
  assert('团的每单位 = 8 + 2×35 = 78（实有 2 个营）', byId['团1'].perUnit === 78, String(byId['团1'].perUnit))
  assert('加强团每单位 = 20（无下级）', byId['团2'].perUnit === 20, String(byId['团2'].perUnit))
  assert('炮团每单位 = 30', byId['炮团'].perUnit === 30, String(byId['炮团'].perUnit))
  assert('★ 师每单位 = 10 + 3×78 + 20 + 30 + 5 = 299', byId['师'].perUnit === 299, String(byId['师'].perUnit))
  assert('★ 全师总兵力 = 299', out.value.total === 299, String(out.value.total))
  assert('★ 营缺编 1（应有 3 实有 2）', byId['营'].shortfall === 1, String(byId['营'].shortfall))
  assert('★ 师属独立营被标跨级', byId['独立营'].crossLevel === true, String(byId['独立营'].crossLevel))
  assert('一团的 level 与父级一致 → 不算跨级', byId['团1'].crossLevel === false, '')
  assert('result 标出缺编', out.result.includes('缺编 1'), '')
  assert('result 标出跨级', out.result.includes('跨级'), '')
  assert('★ result 统计兵种分布', out.result.includes('步兵') && out.result.includes('炮兵') && out.result.includes('工兵'), '')
  assert('value.shortfallTotal 汇总缺编', out.value.shortfallTotal >= 1, String(out.value.shortfallTotal))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 自由拓扑：edges 连边 --')
// ───────────────────────────────────────────────────────────
{
  const out = hier.runHierarchy({
    nodes: [
      { id: '军', own: 100 },
      { id: '师1', own: 50 },
      { id: '师2', own: 60 },
    ],
    edges: [
      { from: '军', to: '师1' },
      { from: '军', to: '师2' },
    ],
  })
  assert('edges 连边后军每单位 = 100+50+60 = 210', out.value.total === 210, String(out.value.total))
  assert('根是军', out.value.root === '军', out.value.root)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
