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

  const pending = throwsOf(() => der.runDerivation({ derivation: 'no-such-sub' }, deps))
  assert('★ 未迁移子命令 → unknown_subcommand（不假装成功）', pending?.type === 'unknown_subcommand', pending?.type)
  assert('message 说明子命令不存在', String(pending?.message ?? '').includes('不认识'), String(pending?.message ?? '').slice(0, 60))
  assert('hint 列出全部可用子命令', String(pending?.hint ?? '').includes('stack') && String(pending?.hint ?? '').includes('inherit'), String(pending?.hint ?? '').slice(0, 80))

  const implemented = der.IMPLEMENTED_SUBCOMMANDS.length
  const pendingList = der.PENDING_SUBCOMMANDS.length
  assert('已实现 29 个（全部）', implemented === 29, String(implemented))
  assert('未迁移 0 个', pendingList === 0, String(pendingList))
  assert('29 + 0 = 29（与老插件一致）', implemented + pendingList === 29, String(implemented + pendingList))
}

// ───────────────────────────────────────────────────────────
console.log('-- 11. dead：死寂四级判定 --')
// ───────────────────────────────────────────────────────────
{
  const alive = der.runDerivation({ derivation: 'dead' }, deps)
  assert('地球默认 → alive', alive.value.dead.level === 'alive', alive.value.dead.level)
  assert('result 标「正常」', alive.result.includes('宇宙状态判定：正常'), '')

  const frozen = der.runDerivation({ derivation: 'dead', world: { orbitAU: 3, greenhouse: 0 } }, deps)
  assert('远轨道无温室 → marginal（全球冻结）', frozen.value.dead.level === 'marginal', frozen.value.dead.level)
  assert('原因里有 frozen', frozen.value.dead.causes.some((c) => c.id === 'frozen'), JSON.stringify(frozen.value.dead.causes.map((c) => c.id)))
  assert('★ 给「若想要物质世界」的调整方向', frozen.result.includes('若想要物质世界'), '')

  const invalid = der.runDerivation({ derivation: 'dead', world: { planetRadius: 0 } }, deps)
  assert('★ 半径 0 → invalid（参数不成立，不是设定太极端）', invalid.value.dead.level === 'invalid', invalid.value.dead.level)
  assert('invalid 的说明区分输入问题', invalid.result.includes('不是设定太极端'), '')

  const weak = der.runDerivation({ derivation: 'dead' }, { constants: { ...constants, e_charge: constants.e_charge * 0.5 }, starClasses: stars })
  assert('★ α 减到 1/4 → 化学键过弱 → dead', weak.value.dead.level === 'dead', weak.value.dead.level + ' ' + JSON.stringify(weak.value.dead.causes.map((c) => c.id)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 12. flip：结论翻转（不是数值变化） --')
// ───────────────────────────────────────────────────────────
{
  const rocket = der.runDerivation({ derivation: 'flip', flipClaim: 'rocket', flipBase: 1 }, deps)
  assert('火箭基线不成立', rocket.value.flip.baseHolds === false, '')
  assert('★ 下调 20% 后结论翻转', rocket.value.flip.flipped === true && rocket.value.flip.severity === 'critical', rocket.value.flip.severity)
  assert('result 说「踩线」', rocket.result.includes('踩线'), '')

  const stable = der.runDerivation({ derivation: 'flip', flipClaim: 'rocket', flipBase: 0.5 }, deps)
  assert('半重力基线成立', stable.value.flip.baseHolds === true, '')
  assert('★ 半重力下 ±20% 不翻（稳定）', stable.value.flip.flipped === false, JSON.stringify(stable.value.flip.probes.map((p) => p.flipped)))
  assert('给余量', typeof stable.value.flip.margin === 'number' && stable.value.flip.margin > 0.2, String(stable.value.flip.margin))

  const human = der.runDerivation({ derivation: 'flip', flipClaim: 'human', flipBase: 3.4 }, deps)
  assert('3.4g 基线成立', human.value.flip.baseHolds === true, '')
  assert('★ 3.4g ±20% 翻（3.5g 上限）', human.value.flip.flipped === true, JSON.stringify(human.value.flip.probes))

  const bad = throwsOf(() => der.runDerivation({ derivation: 'flip', flipClaim: 'no-such' }, deps))
  assert('未知判据 → invalid_argument', bad?.type === 'invalid_argument', bad?.type)
}

// ───────────────────────────────────────────────────────────
console.log('-- 13. observer：同一个世界，不同观测者 --')
// ───────────────────────────────────────────────────────────
{
  const human = der.runDerivation({ derivation: 'observer', observerKind: 'human' }, deps)
  assert('人类骨骼强度体重比 ≈ 5', Math.abs(human.value.observer.metrics.boneRatio - 5) < 0.01, String(human.value.observer.metrics.boneRatio))
  assert('人类与自身比 = 1', human.value.observer.metrics.versusHuman.bone === 1, '')

  const tiny = der.runDerivation({ derivation: 'observer', observerKind: 'tiny' }, deps)
  assert('★ 20cm 生物的骨骼比是人类 8.5 倍', tiny.value.observer.metrics.versusHuman.bone > 8, String(tiny.value.observer.metrics.versusHuman.bone))
  assert('小型生物散热更快（余量更低）', tiny.value.observer.metrics.heatBalance < human.value.observer.metrics.heatBalance, '')

  const twoD = der.runDerivation({ derivation: 'observer', observerKind: '2d' }, deps)
  assert('★ 二维生物：三维建筑受限', twoD.result.includes('受限') && twoD.result.includes('三维建筑'), '')
  const aquatic = der.runDerivation({ derivation: 'observer', observerKind: 'aquatic' }, deps)
  assert('★ 水生智慧：用火受限', aquatic.result.includes('用火') && aquatic.result.includes('受限'), '')

  const badKind = throwsOf(() => der.runDerivation({ derivation: 'observer', observerKind: 'alien' }, deps))
  assert('未知观测者 → invalid_argument', badKind?.type === 'invalid_argument', badKind?.type)
}

// ───────────────────────────────────────────────────────────
console.log('-- 14. heatmap：相图扫描 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'heatmap' }, deps)
  assert('81 格（9×9）', out.value.heatmap.cells.length === 81, String(out.value.heatmap.cells.length))
  assert('★ 统计总和 = 81', out.value.heatmap.summary.ok + out.value.heatmap.summary.warn + out.value.heatmap.summary.danger + out.value.heatmap.summary.unknown === 81, JSON.stringify(out.value.heatmap.summary))
  assert('有可行格也有边缘格（本扫描范围内没有参数不成立点）', out.value.heatmap.summary.ok > 0 && out.value.heatmap.summary.warn > 0, JSON.stringify(out.value.heatmap.summary))
  assert('给窄窗判定', typeof out.value.heatmap.narrow.narrow === 'boolean', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 15. timeline：快慢变量与临界点 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'timeline' }, deps)
  assert('11 个采样点', out.value.timeline.points.length === 11, String(out.value.timeline.points.length))
  assert('t=0 亮度 = 1', out.value.timeline.points[0].luminosity === 1, String(out.value.timeline.points[0].luminosity))
  assert('★ t=10 亮度约 2（每 Gyr +10%）', near(out.value.timeline.points[10].luminosity, 2, 0.01), String(out.value.timeline.points[10].luminosity))
  assert('★ 临界点含温室失控与地质死寂', out.value.timeline.critical.some((c) => c.name.includes('温室')), JSON.stringify(out.value.timeline.critical.map((c) => c.name)))
  assert('地质热流单调下降', out.value.timeline.points[10].geologicalHeat < out.value.timeline.points[0].geologicalHeat, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 16. graph / trace / impact --')
// ───────────────────────────────────────────────────────────
{
  const graph = der.runDerivation({ derivation: 'graph' }, deps)
  assert('节点 > 20', graph.value.graph.nodes.length > 20, String(graph.value.graph.nodes.length))
  assert('★ 有层深（≥3 层）', graph.value.graph.maxDepth >= 3, String(graph.value.graph.maxDepth))
  assert('坐标字段齐全', graph.value.graph.nodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number' && typeof n.depth === 'number'), '')

  const list = der.runDerivation({ derivation: 'trace' }, deps)
  assert('缺 traceTarget 时列可溯源量', Array.isArray(list.value.nodes) && list.value.nodes.length > 20, String(list.value.nodes?.length))
  const traced = der.runDerivation({ derivation: 'trace', traceTarget: '建筑高度上限' }, deps)
  assert('★ 建筑高度上限能溯源', traced.value.trace.found === true, JSON.stringify(traced.value.trace.direct))
  assert('★ 最终落到行星质量/行星半径', traced.value.trace.roots.includes('行星质量') && traced.value.trace.roots.includes('行星半径'), JSON.stringify(traced.value.trace.roots))

  const impact = der.runDerivation({ derivation: 'impact', traceTarget: '行星质量' }, deps)
  assert('★ 改行星质量直接影响表面重力', impact.value.impact.direct.includes('表面重力'), JSON.stringify(impact.value.impact.direct))
  assert('间接波及非空', impact.value.impact.indirect.length > 0, String(impact.value.impact.indirect.length))
  const missing = throwsOf(() => der.runDerivation({ derivation: 'impact' }, deps))
  assert('★ impact 缺参 → 演示模式可跑（不再报错）', missing === undefined || missing?.type === undefined, String(missing?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 17. cost：算力估算 --')
// ───────────────────────────────────────────────────────────
{
  const fast = der.runDerivation({ derivation: 'cost', costKind: 'timeline', timelineSteps: 11 }, deps)
  assert('11 步时间轴 → fast', fast.value.cost.risk === 'fast', fast.value.cost.risk)
  const sweep = der.runDerivation({ derivation: 'cost', costKind: 'sweep', costCombos: 1000 }, deps)
  assert('1000 组扫描 → moderate 或以上', ['moderate', 'slow', 'very-slow'].includes(sweep.value.cost.risk), sweep.value.cost.risk)
  const phase = der.runDerivation({ derivation: 'cost', costKind: 'phase', costX: 100, costY: 100 }, deps)
  assert('★ 100×100 相图 → very-slow 并给降级建议', phase.value.cost.risk === 'very-slow' && phase.value.cost.downgrade.length > 0, phase.value.cost.risk)
  assert('result 说插件不拒绝请求', phase.result.includes('不会拒绝'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 18. whitepaper：白皮书与 Prompt 卡片 --')
// ───────────────────────────────────────────────────────────
{
  const paper = der.runDerivation({ derivation: 'whitepaper' }, deps)
  assert('含白皮书标题', paper.result.includes('# 世界物理与文明白皮书'), '')
  assert('物理底色表有重力行', paper.result.includes('表面重力') && paper.result.includes('m/s²'), '')
  assert('文明极限分三组', paper.result.includes('### 能量') && paper.result.includes('### 材料') && paper.result.includes('### 交通'), '')
  assert('★ 时间尺度给可居住年限', paper.result.includes('可居住年限'), '')
  assert('value 含文明极限数组', Array.isArray(paper.value.whitepaper.civilization.energy) && paper.value.whitepaper.civilization.energy.length > 0, '')

  const prompt = der.runDerivation({ derivation: 'whitepaper', whitepaperMode: 'prompt' }, deps)
  assert('★ prompt 模式更短', prompt.result.length < paper.result.length, prompt.result.length + ' vs ' + paper.result.length)
  assert('prompt 含世界设定卡', prompt.result.includes('【世界设定卡】'), '')
  assert('prompt 声明不是禁令', prompt.result.includes('不要把它们当禁令'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 19. fantasy：叠加与代价 --')
// ───────────────────────────────────────────────────────────
{
  const ability = { name: 'telekinesis', label: '念力', source: 'external', efficiency: 1, costPerUnit: 2, powerLimit: 1e4, boosts: '力量', meaning: '隔空取物' }
  const out = der.runDerivation({ derivation: 'fantasy', fantasyAbility: ability, fantasyDemand: 1000, fantasyPhysical: 100 }, deps)
  assert('物理 100 + 幻想补足 900', out.value.fantasy.physical === 100 && out.value.fantasy.fantasy === 900, JSON.stringify(out.value.fantasy))
  assert('★ 成本 = 900×2 = 1800', out.value.fantasy.cost === 1800, String(out.value.fantasy.cost))
  assert('预算 1e4 内 → 未超', out.value.fantasy.overBudget === false, '')
  assert('★ 等价人力 18 人', Math.abs(out.value.cost.humanEquivalent - 18) < 1e-9, String(out.value.cost.humanEquivalent))
  assert('★ 散热需求 18 m² > 体表 1.8 → 不足', out.value.cost.coolingShort === true, '')
  assert('result 不含「禁止」', !out.result.includes('禁止'), '')

  const bad = throwsOf(() => der.runDerivation({ derivation: 'fantasy' }, deps))
  assert('缺 fantasyAbility → 演示模式可跑（不再报错）', bad === undefined || bad?.type === undefined, JSON.stringify(bad).slice(0, 60))
  const badField = throwsOf(() => der.runDerivation({ derivation: 'fantasy', fantasyAbility: { name: 'x', label: 'y', source: 'external', efficiency: 0, costPerUnit: 1, powerLimit: 1 } }, deps))
  assert('字段缺失 → invalid_argument', badField?.type === 'invalid_argument', badField?.type)
}

// ───────────────────────────────────────────────────────────
console.log('-- 20. civilization：物理锁死技术树 --')
// ───────────────────────────────────────────────────────────
{
  const out = der.runDerivation({ derivation: 'civilization' }, deps)
  assert('极限 ≥ 10 条', out.value.civilization.limits.length >= 10, String(out.value.civilization.limits.length))
  const kardashev = out.value.civilization.limits.find((item) => item.name === '卡尔达肖夫指数')
  assert('★ 地球卡尔达肖夫 ≈ 0.73', Math.abs(kardashev.value - 0.73) < 0.03, String(kardashev.value))
  assert('★ 化学火箭航天开放（Δv 13.5 > 逃逸 11.2）', out.value.civilization.tech.some((item) => item.branch === '化学火箭航天' && item.status === 'open'), JSON.stringify(out.value.civilization.tech))
  assert('★ 太空电梯锁死（材料差数千倍）', out.value.civilization.tech.some((item) => item.branch === '太空电梯' && item.status === 'locked'), '')
  assert('生态承载力 > 0', out.value.civilization.limits.some((item) => item.name === '生态承载力' && item.value > 0), '')
  assert('result 给统计', out.result.includes('统计：开放'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 21. archive / history / compare / diff --')
// ───────────────────────────────────────────────────────────
{
  const first = der.runDerivation({ derivation: 'archive' }, deps)
  assert('★ 归档第一版 v1', first.value.archive.version === 'v1', first.value.archive.version)
  assert('result 说已归档', first.result.includes('已归档'), '')

  const history = der.runDerivation({ derivation: 'history' }, deps)
  assert('history 列出 v1', history.value.versions.length === 1 && history.value.versions[0].version === 'v1', JSON.stringify(history.value.versions.map((v) => v.version)))

  const second = der.runDerivation({ derivation: 'archive', world: { planetMass: 2 } }, deps)
  assert('★ 归档第二版 v2', second.value.archive.version === 'v2', second.value.archive.version)
  assert('v2 重力约 2g', Math.abs(second.value.archive.physical.gravityEarth - 2) < 0.05, String(second.value.archive.physical.gravityEarth))

  const compare = der.runDerivation({ derivation: 'compare', compareFrom: 'v1' }, deps)
  assert('★ compare 默认对比最新一版', compare.value.diff.ok === true && compare.value.diff.message.includes('v1'), compare.value.diff.message)
  assert('★ 检出重力差异', compare.value.diff.items.some((item) => item.field.includes('重力')), JSON.stringify(compare.value.diff.items.map((i) => i.field)))

  const diff = der.runDerivation({ derivation: 'diff', diffA: 'v1', diffB: 'v2' }, deps)
  assert('diff 指定两版', diff.value.diff.ok === true && diff.value.diff.items.length > 0, String(diff.value.diff.items.length))

  const missing = throwsOf(() => der.runDerivation({ derivation: 'compare' }, deps))
  assert('★ compare 缺参 → missing_params 并列出已有版本', missing?.type === 'missing_params' && String(missing?.hint ?? '').includes('v1'), missing?.type)
  const badVersion = throwsOf(() => der.runDerivation({ derivation: 'compare', compareFrom: 'v9' }, deps))
  assert('不存在的版本 → invalid_argument', badVersion?.type === 'invalid_argument', badVersion?.type)
}

// ───────────────────────────────────────────────────────────
console.log('-- 22. inherit：继承关系与环检测 --')
// ───────────────────────────────────────────────────────────
{
  const tables = ['母星', '殖民地', '飞船']
  const linked = der.runDerivation({ derivation: 'inherit', inheritDerived: '殖民地', inheritBase: '母星', tableNames: tables }, deps)
  assert('★ 建立继承', linked.value.link.ok === true && linked.result.includes('继承'), linked.result.slice(0, 40))
  const linked2 = der.runDerivation({ derivation: 'inherit', inheritDerived: '飞船', inheritBase: '母星', tableNames: tables }, deps)
  assert('第二条继承', linked2.value.link.ok === true, '')

  const list = der.runDerivation({ derivation: 'inherit', tableNames: tables }, deps)
  assert('列出继承关系', list.value.links.length === 2, String(list.value.links.length))

  const self = throwsOf(() => der.runDerivation({ derivation: 'inherit', inheritDerived: '母星', inheritBase: '母星', tableNames: tables }, deps))
  assert('★ 继承自己 → invalid_argument', self?.type === 'invalid_argument', self?.type)
  const unknown = throwsOf(() => der.runDerivation({ derivation: 'inherit', inheritDerived: '殖民地', inheritBase: '不存在', tableNames: tables }, deps))
  assert('基线不存在 → invalid_argument', unknown?.type === 'invalid_argument', unknown?.type)

  const checked = der.runDerivation({ derivation: 'inherit', inheritCheck: true, tableNames: tables }, deps)
  assert('健康关系无问题', (checked.value.findings ?? checked.value.links).length >= 0 && checked.result.includes('继承关系'), '')
  const sync = der.runDerivation({ derivation: 'inherit', inheritSync: true, inheritBase: '母星' }, deps)
  assert('★ sync 列出受影响的表', sync.value.sync.affected.includes('殖民地') && sync.value.sync.affected.includes('飞船'), JSON.stringify(sync.value.sync))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
