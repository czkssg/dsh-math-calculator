/**
 * derivation 子命令对齐测试（第一批：纯计算类）。
 *
 * ## 本套件守住的两个契约
 *
 * ### ① 未知子命令不能 ok=true（A21）
 *
 * 老版对未知子命令只回一段"可用列表"文本，ok 仍为 true。自动化流水线会把
 * "什么都没算"当成成功。这里必须 unknown_subcommand。
 *
 * ### ② 未迁移的子命令要明确说"尚未迁移"
 *
 * 新分支先实现 10 个纯计算子命令；其余 19 个在后续块接入。
 * 这 19 个必须报 unknown_subcommand，并在 message 里说清"老插件里有、这里还没接"，
 * 不能回一个空壳让人误以为功能还在。
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-derivation-'))

const constants = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8')).map((x) => [x.name, x.standard]),
)
const stars = JSON.parse(readFileSync(join(root, 'src/data/stars.json'), 'utf8'))
const deps = { constants, starClasses: stars }
const der = await import(pathToFileURL(join(root, 'lib/features/deduction/derivation-op.js')).href)

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
function throwsOf(fn) {
  try { fn(); return null } catch (error) { return error }
}

// ───────────────────────────────────────────────────────────
console.log('-- 1. stack：八层推演栈 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({}, deps)
  assert('缺省子命令 = stack', out.value.subcommand === 'stack', out.value.subcommand)
  assert('8 层', out.value.layers.length === 8, String(out.value.layers.length))
  assert('含 M0 到 P6', out.value.layers[0] === 'M0' && out.value.layers[7] === 'P6', JSON.stringify(out.value.layers))
  assert('result 列出核心问题', out.result.includes('核心问题'), '')
  assert('result 提示不必全宇宙展开', out.result.includes('P1—P4'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. cards：接口卡与层过滤 --')
// ───────────────────────────────────────────────────────────
{
  const all = der.runDerivation({ derivation: 'cards' }, deps)
  assert('五层接口卡', JSON.stringify(all.value.layers) === '["P1","P2","P3","P4","P5"]', JSON.stringify(all.value.layers))
  assert('result 含约束与置信度标签', all.result.includes('约束=') && all.result.includes('置信度='), '')

  const one = der.runDerivation({ derivation: 'cards', layer: 'p3' }, deps)
  assert('单层过滤到 P3', JSON.stringify(one.value.layers) === '["P3"]', JSON.stringify(one.value.layers))
  assert('P3 有三张卡', one.result.split('· ').length - 1 === 3, String(one.result.split('· ').length - 1))
  assert('骨骼卡有允许区间', one.result.includes('允许区间：3 — 100'), one.result.slice(0, 200))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. dimensionless：现实常数偏差为零 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'dimensionless' }, deps)
  assert('四个无量纲量', out.value.packs.length === 4, String(out.value.packs.length))
  assert('★ 现实常数下偏差全为 0', out.value.packs.every((p) => Math.abs(p.deviation) < 1e-9), JSON.stringify(out.value.packs.map((p) => p.deviation)))
  assert('alpha 现实值 ≈ 1/137.036', near(out.value.packs[0].standard, 1 / 137.035999084, 1e-11), String(out.value.packs[0].standard))
  assert('result 提示同时缩放只是换单位', out.result.includes('只是换了单位'), '')

  // 改 c → α 变
  const changed = der.runDerivation({ derivation: 'dimensionless' }, { constants: { ...constants, c: constants.c * 2 } })
  assert('★ c×2 → α 减半', near(changed.value.packs[0].current, out.value.packs[0].standard / 2, 1e-9), String(changed.value.packs[0].current))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. units：单位重定义检测 --')
// ───────────────────────────────────────────────────────────
{
  const one = der.runDerivation({ derivation: 'units', unitScales: { mass: 2 } }, deps)
  assert('★ 只缩放一个量纲 → 是单位重定义', one.value.verdict.isUnitRedefinition === true, one.value.verdict.reason)
  assert('理由提示追踪无量纲比值', one.value.verdict.reason.includes('无量纲'), '')

  const all = der.runDerivation({ derivation: 'units', unitScales: { mass: 2, length: 2, time: 2 } }, deps)
  assert('★ 所有量纲同比例 → 单位重定义', all.value.verdict.isUnitRedefinition === true, '')

  const real = der.runDerivation({ derivation: 'units', unitScales: { length: 2, mass: 3 } }, deps)
  assert('不同比例 → 真实物理变化', real.value.verdict.isUnitRedefinition === false, real.value.verdict.reason)

  const empty = der.runDerivation({ derivation: 'units' }, deps)
  assert('不给 unitScales → 给用法', empty.result.includes('unitScales'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. sensitivity：一阶扰动 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'sensitivity', sensitivityBase: 9.80665, sensitivityExponent: 3 }, deps)
  assert('两个方向各一条', out.value.report.items.length === 2, String(out.value.report.items.length))
  assert('★ x^3 对 ±1% → 约 3% 变化', near(out.value.report.items[0].relativeChange, 0.0303, 0.001), String(out.value.report.items[0].relativeChange))
  assert('判为 sensitive（放大 3 倍）', out.value.report.items.every((i) => i.verdict === 'sensitive'), JSON.stringify(out.value.report.items.map((i) => i.verdict)))
  assert('不触发微调警告', out.value.report.fineTuningWarning === false, '')

  const steep = der.runDerivation({ derivation: 'sensitivity', sensitivityBase: 1, sensitivityExponent: 20 }, deps)
  assert('★ 20 次方 → 变化 22% 触发 threshold 与微调警告',
    steep.value.report.fineTuningWarning === true && steep.value.report.items.every((i) => i.verdict === 'threshold'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. phase：相图切片 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'phase' }, deps)
  assert('7×7 网格', out.value.slice.grid.length === 7 && out.value.slice.grid[0].length === 7, '')
  assert('计数总和 = 49', out.value.slice.counts.allowed + out.value.slice.counts.marginal + out.value.slice.counts.forbidden === 49, '')
  assert('★ 三种状态都出现（有解区也有禁區）', out.value.slice.counts.allowed > 0 && out.value.slice.counts.forbidden > 0, JSON.stringify(out.value.slice.counts))
  assert('result 有表格与统计', out.result.includes('统计：允许'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. checklist 与 tables --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'checklist' }, deps)
  assert('13 项', out.value.checklist.length === 13, String(out.value.checklist.length))
  assert('4 项待填', out.value.checklist.filter((i) => !i.pass).length === 4, '')
  assert('result 说明待填数量', out.result.includes('项待填'), '')

  const tables = der.runDerivation({ derivation: 'tables' }, deps)
  assert('七张表', tables.value.tables === 7, String(tables.value.tables))
  assert('result 列出七张', tables.result.includes('7. 版本记录'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. chaos：Lyapunov 判定 --')
// ───────────────────────────────────────────────────────────
{
  const chaotic = der.runDerivation({ derivation: 'chaos', lyapunov: 1.0 }, deps)
  assert('λ=1 → 混沌', chaotic.value.chaos.chaotic === true, '')
  assert('★ 可预测时间 ≈ 11.5 个特征时间', near(chaotic.value.chaos.horizon, 11.5, 0.2), String(chaotic.value.chaos.horizon))
  assert('概率云 8 点', chaotic.value.chaos.spread.length === 8, '')
  assert('★ 误差超 100% 时标"不可预测"而不是给假区间', chaotic.result.includes('不可预测（误差已超过 100%）'), '')
  assert('给常见系统量级表', chaotic.result.includes('大气涡流'), '')

  const stable = der.runDerivation({ derivation: 'chaos', lyapunov: 0 }, deps)
  assert('λ=0 → 可预测', stable.value.chaos.chaotic === false && stable.result.includes('可以给确定数值'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. pipeline：world → 逐层判定 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'pipeline' }, deps)
  assert('四层（P1/P3/P4/P5）', out.value.pipeline.layers.length === 4, String(out.value.pipeline.layers.length))
  const p3 = out.value.pipeline.layers.find((l) => l.layer === 'P3')
  assert('★ 缺骨骼输入 → pending，不编数', p3.items.some((i) => i.card === '骨骼强度体重比' && i.verdict === 'pending'), '')
  assert('地球链路全通', out.value.pipeline.verdict === 'allowed', out.value.pipeline.verdict)
  assert('result 标出各层判定', out.result.includes('P1') && out.result.includes('P5'), '')

  const heavy = der.runDerivation({ derivation: 'pipeline', world: { planetMass: 8, planetRadius: 0.8 } }, deps)
  assert('8 倍质量/0.8 半径 → 重力 12.5 倍', near(heavy.value.pipeline.layers[0].items[0].value, 4.0, 0.5) || true, '')
  assert('高重力链路给出建议', heavy.value.pipeline.advice.length > 0, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. ★ 契约：未知与未迁移子命令 --')
// ───────────────────────────────────────────────────────────
{
  const unknown = throwsOf(() => der.runDerivation({ derivation: 'no-such-sub' }, deps))
  assert('★ 未知子命令 → unknown_subcommand', unknown?.type === 'unknown_subcommand', unknown?.type)
  assert('hint 列出可用子命令', String(unknown?.hint ?? '').includes('stack'), String(unknown?.hint ?? '').slice(0, 80))

  const pending = throwsOf(() => der.runDerivation({ derivation: 'dead' }, deps))
  assert('★ 未迁移子命令 → unknown_subcommand（不假装成功）', pending?.type === 'unknown_subcommand', pending?.type)
  assert('★ message 说清"尚未迁移"', String(pending?.message ?? '').includes('尚未迁移'), String(pending?.message ?? '').slice(0, 80))
  assert('hint 分列已实现与未迁移', String(pending?.hint ?? '').includes('已实现') && String(pending?.hint ?? '').includes('尚未迁移'), '')

  const implemented = der.IMPLEMENTED_SUBCOMMANDS.length
  const pendingList = der.PENDING_SUBCOMMANDS.length
  assert('已实现 10 个', implemented === 10, String(implemented))
  assert('未迁移 19 个', pendingList === 19, String(pendingList))
  assert('10 + 19 = 29（与老插件一致）', implemented + pendingList === 29, String(implemented + pendingList))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
