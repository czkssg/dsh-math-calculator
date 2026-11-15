/**
 * feasibility 对齐测试：11 条物理上限 + 设定一致性校验。
 *
 * ## 本套件守住的两个契约（老实现的已知缺陷）
 *
 * ### ① 字符串单位不能静默丢弃（T7-N9）
 *
 * 老版 claims 只收 number，`"9.2e10 人"` 会被跳过，最后报「全部 0 项自洽」。
 * 这里成对验证：「50 m」能解析并判定；「50 kg」在长度约束上必须报 unit_mismatch。
 *
 * ### ② 未知约束 id 不能假通过（A33 同类）
 *
 * 老版对未知键静默 continue。这里必须 unknown_symbol，并列出可用 id。
 *
 * ## 上限本身
 *
 * 每条上限都来自明确公式（见模块注释）。本套件核对地球基准值与参数变化的方向性：
 * 重力升高 → 生物/山高上限下降；大气密度升高 → 飞行质量上限上升。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-feasibility-'))

const feas = await import(pathToFileURL(join(root, 'lib/features/deduction/feasibility.js')).href)
const op = await import(pathToFileURL(join(root, 'lib/features/deduction/feasibility-op.js')).href)

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
console.log('-- 1. 地球默认环境与 11 条上限 --')
// ───────────────────────────────────────────────────────────
{
  const env = feas.deriveConstraintContext({})
  assert('重力 9.82 m/s²', near(env.gravity, 9.82, 0.02), String(env.gravity))
  assert('重力比 1.001', near(env.gravityRatio, 1.001, 0.005), String(env.gravityRatio))
  assert('大气密度 ≈ 1.225 kg/m³', near(env.airDensity, 1.225, 0.01), String(env.airDensity))
  assert('逃逸速度 ≈ 11.2 km/s', near(env.escapeVelocity / 1000, 11.2, 0.1), String(env.escapeVelocity / 1000))
  assert('约束共 11 条', feas.CONSTRAINTS.length === 11, String(feas.CONSTRAINTS.length))

  const limits = Object.fromEntries(feas.CONSTRAINTS.map((c) => [c.id, c.limit(env)]))
  assert('★ 建筑上限 ≈ 4903m（1.3e8/(2700×9.81)）', near(limits.buildingHeight, 4903, 20), String(limits.buildingHeight))
  assert('★ 生物高度上限 ≈ 25m', near(limits.creatureHeight, 25, 1), String(limits.creatureHeight))
  assert('飞行质量上限 ≈ 250kg', near(limits.flyingCreatureMass, 250, 5), String(limits.flyingCreatureMass))
  assert('山高上限 ≈ 9km', near(limits.mountainHeight, 9000, 100), String(limits.mountainHeight))
  assert('城市人口上限 ≈ 98.6 万', near(limits.cityPopulation, 985900, 5000), String(limits.cityPopulation))
  assert('帝国半径 5000km', limits.empireRadius === 5000, String(limits.empireRadius))
  assert('昼夜上限 72h', limits.dayLength === 72, String(limits.dayLength))

  // 方向性：重力升高 → 生物/建筑/山高上限下降
  const heavy = feas.deriveConstraintContext({ planetMass: 2, planetRadius: 1 })
  assert('2g 星球：生物高度上限减半', near(heavy.gravityRatio, 2, 0.01), String(heavy.gravityRatio))
  const heavyLimits = Object.fromEntries(feas.CONSTRAINTS.map((c) => [c.id, c.limit(heavy)]))
  assert('2g：生物上限 ≈ 12.5m', near(heavyLimits.creatureHeight, 12.5, 0.1), String(heavyLimits.creatureHeight))
  assert('2g：山高上限 ≈ 4.5km', near(heavyLimits.mountainHeight, 4500, 20), String(heavyLimits.mountainHeight))
  assert('2g：建筑上限下降', heavyLimits.buildingHeight < limits.buildingHeight, '')

  // 高气压 → 大气密度升高 → 飞行质量上限放宽
  const thick = feas.deriveConstraintContext({ pressure: 202650 })
  assert('★ 2atm 世界：飞行质量上限翻倍', near(
    feas.CONSTRAINTS.find((c) => c.id === 'flyingCreatureMass').limit(thick), 500, 10), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. claims 校验：三档判定 --')
// ───────────────────────────────────────────────────────────
{
  const safe = feas.checkFeasibility({}, { buildingHeight: 500, creatureHeight: 10 })
  assert('两项都安全 → consistent', safe.overall === 'consistent', safe.overall)
  assert('结果里两条', safe.results.length === 2, String(safe.results.length))
  assert('安全项 verdict = safe', safe.results.every((r) => r.verdict === 'safe'), '')

  const marginal = feas.checkFeasibility({}, { buildingHeight: 4500 })
  assert('★ 90% 上限 → marginal', marginal.results[0].verdict === 'marginal', marginal.results[0].verdict)
  assert('总判定 stretched', marginal.overall === 'stretched', marginal.overall)

  const violated = feas.checkFeasibility({}, { buildingHeight: 9000 })
  assert('★ 超上限 → violated', violated.results[0].verdict === 'violated', violated.results[0].verdict)
  assert('总判定 inconsistent', violated.overall === 'inconsistent', violated.overall)
  assert('违例项有建议', (violated.violations[0].suggestion ?? '').includes('放宽'), violated.violations[0].suggestion)
  assert('summary 点名超限项', violated.summary.includes('建筑高度'), violated.summary)

  const creature = feas.checkFeasibility({ planetMass: 2 }, { creatureHeight: 50 })
  assert('★ 2g 星球 50m 巨兽 → 超限 4 倍', creature.results[0].ratio > 3.9 && creature.results[0].verdict === 'violated',
    String(creature.results[0].ratio))
  assert('超限解释提到关节', creature.results[0].explanation.includes('关节'), creature.results[0].explanation.slice(0, 60))
  assert('建议提到降重力', (creature.results[0].suggestion ?? '').includes('重力'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 字符串单位：解析或报错，绝不静默丢弃 --')
// ───────────────────────────────────────────────────────────
{
  const withUnit = feas.checkFeasibility({}, { creatureHeight: '50 m' })
  assert('★ "50 m" 被解析成 50', near(withUnit.results[0].claimed, 50, 1e-9), String(withUnit.results[0].claimed))
  assert('中文单位 "米" 也认', near(feas.checkFeasibility({}, { creatureHeight: '50 米' }).results[0].claimed, 50, 1e-9), '')
  assert('科学计数法 "9.2e10 人" 能解析',
    near(feas.checkFeasibility({}, { cityPopulation: '9.2e10 人' }).results[0].claimed, 9.2e10, 1), '')
  assert('无单位字符串 "50" 直接当数值',
    near(feas.checkFeasibility({}, { creatureHeight: '50' }).results[0].claimed, 50, 1e-9), '')

  const wrongUnit = throwsOf(() => feas.checkFeasibility({}, { creatureHeight: '50 kg' }))
  assert('★ 单位不符 → unit_mismatch', wrongUnit?.type === 'unit_mismatch', wrongUnit?.type)
  assert('unit_mismatch 的 hint 给出正确单位', String(wrongUnit?.hint ?? '').includes('m'), String(wrongUnit?.hint ?? '').slice(0, 60))

  const unparsable = throwsOf(() => feas.checkFeasibility({}, { creatureHeight: '五十米' }))
  assert('无法解析 → invalid_argument（不跳过）', unparsable?.type === 'invalid_argument', unparsable?.type)

  const badType = throwsOf(() => feas.checkFeasibility({}, { creatureHeight: true }))
  assert('布尔值 → invalid_argument', badType?.type === 'invalid_argument', badType?.type)
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 未知 id 与数组 claims --')
// ───────────────────────────────────────────────────────────
{
  const unknown = throwsOf(() => feas.checkFeasibility({}, { solders: 1000 }))
  assert('★ 未知 id → unknown_symbol（不假通过）', unknown?.type === 'unknown_symbol', unknown?.type)
  assert('hint 列出可用 id', String(unknown?.hint ?? '').includes('buildingHeight'), String(unknown?.hint ?? '').slice(0, 80))

  const arr = throwsOf(() => op.runFeasibility({ claims: [{ claim: 'buildingHeight', value: 1 }] }))
  assert('★ 数组 claims → invalid_argument', arr?.type === 'invalid_argument', arr?.type)
  assert('hint 给出对象写法', String(arr?.hint ?? '').includes('"claims"'), String(arr?.hint ?? '').slice(0, 80))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. op 层：listConstraints 与渲染 --')
// ───────────────────────────────────────────────────────────
{
  const list = op.runFeasibility({ listConstraints: true })
  assert('list 模式返回 11 条上限', list.value.limits.length === 11, String(list.value.limits.length))
  assert('result 含世界环境段', list.result.includes('【世界环境】'), '')
  assert('result 含约束依据', list.result.includes('平方-立方定律'), '')
  assert('value 带 environment', typeof list.value.environment.gravity === 'number', '')

  const none = op.runFeasibility({})
  assert('不给 claims 等同只列上限', none.result.includes('【本世界的物理上限】'), '')

  const check = op.runFeasibility({ world: { planetMass: 2 }, claims: { creatureHeight: 50, buildingHeight: 3000 } })
  assert('★ 渲染出超限说明', check.result.includes('【超限说明】') && check.result.includes('关节'), '')
  assert('value 带 violations id 列表', Array.isArray(check.value.violations), JSON.stringify(check.value.violations))
  assert('总判定 inconsistent', check.value.overall === 'inconsistent', check.value.overall)

  const marginal = op.runFeasibility({ claims: { buildingHeight: 4500 } })
  assert('渲染出接近极限段', marginal.result.includes('【接近极限'), '')

  const withUnit = op.runFeasibility({ claims: { cityPopulation: '9.2e10 人' } })
  assert('★ op 层也认带单位字符串', withUnit.value.results[0].claimed === 9.2e10, '')
  assert('9.2e10 人 → 超限', withUnit.value.overall === 'inconsistent', withUnit.value.overall)
  assert('建议提到水运', JSON.stringify(withUnit.value.results[0].suggestion).includes('水运'), '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
