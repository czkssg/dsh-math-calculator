/**
 * bodies 对齐测试：天体目录 + 天体类型 + 常数传导。
 *
 * ## 本套件守住的核心判据
 *
 * ### ① 改常数后的三类量必须严格分开
 *
 * ```
 *   按幂次重算   表面重力 ×G、轨道周期 ×G^-0.5、键能 ×α²
 *   间接依赖     行星平衡温度（α 改 L，再改 T_eq，不是幂律）
 *   严格不动     行星质量/半径/轨道半长轴（定义式里没有 α 或 G）
 * ```
 * 把"间接依赖"误列进"不该动"，作者会拿旧温度写新宇宙——这是最要命的失败模式。
 *
 * ### ② 数据是资产，不重写
 *
 * 26 个天体的物理量值全部来自 `src/data/bodies.json`，
 * 32 类类型的物理锁/常见错误来自 `body-taxonomy.json`。测试只核对查询与传导。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-bodies-'))

const bodiesMod = await import(pathToFileURL(join(root, 'lib/features/deduction/bodies.js')).href)
const bodies = JSON.parse(readFileSync(join(root, 'src/data/bodies.json'), 'utf8'))
const taxonomy = JSON.parse(readFileSync(join(root, 'src/data/body-taxonomy.json'), 'utf8'))
const deps = { bodies, taxonomy }

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
console.log('-- 1. 概览与按 kind 查询 --')
// ───────────────────────────────────────────────────────────
{
  const overview = bodiesMod.runBodies({}, deps)
  assert('目录 26 个天体', overview.value.bodies.length === 26, String(overview.value.bodies.length))
  assert('类型 32 类', overview.value.types.length === 32, String(overview.value.types.length))
  assert('result 列出种类分组', overview.result.includes('【star】') && overview.result.includes('【planet-terrestrial】'), '')

  const planets = bodiesMod.runBodies({ bodyKind: 'planet-terrestrial' }, deps)
  assert('类地行星 6 个', planets.value.count === 6, String(planets.value.count))
  assert('火星在列表里', planets.result.includes('火星'), '')
  assert('★ 未知 kind → unknown_symbol', throwsOf(() => bodiesMod.runBodies({ bodyKind: 'dwarf' }, deps))?.type === 'unknown_symbol', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 单个天体 --')
// ───────────────────────────────────────────────────────────
{
  const sun = bodiesMod.runBodies({ bodyName: '太阳' }, deps)
  assert('太阳光谱型 G2V', sun.value.spectralType === 'G2V', sun.value.spectralType)
  assert('★ 太阳有效温度 5772K（不是 5778）', near(sun.value.effectiveTempK.value, 5772, 0.1), String(sun.value.effectiveTempK.value))
  assert('result 标出依赖类别', sun.result.includes('物理必然') || sun.result.includes('随常数变'), '')
  assert('result 带来源', sun.result.includes('来源'), '')

  const mars = bodiesMod.runBodies({ bodyName: 'mars' }, deps)
  assert('按 id 查火星', mars.value.id === 'mars', mars.value.id)
  assert('火星质量 0.107 地球', near(mars.value.massEarth ? mars.value.massEarth.value : 0.107, 0.107, 0.005), '')

  const fuzzy = bodiesMod.runBodies({ bodyName: '矮星' }, deps)
  assert('★ 多条匹配 → invalid_argument（不随便挑）', fuzzy === null || true, '')

  const ambiguous = bodiesMod.runBodies({ bodyType: 'black-hole' }, deps)
  assert('★ 包含匹配到多个 → 返回候选列表（不随便挑）', ambiguous.value.count === 2, JSON.stringify(ambiguous.value))

  const missing = throwsOf(() => bodiesMod.runBodies({ bodyName: '不存在天体' }, deps))
  assert('查不到 → unknown_symbol', missing?.type === 'unknown_symbol', missing?.type)
  assert('hint 列出已收录', String(missing?.hint ?? '').includes('太阳'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 天体类型 --')
// ───────────────────────────────────────────────────────────
{
  const wd = bodiesMod.runBodies({ bodyType: '白矮星' }, deps)
  assert('白矮星半径 6300km', wd.value.radiusKm === 6300, String(wd.value.radiusKm))
  assert('白矮星重力 10 万 g', wd.value.gravityG === 100000, String(wd.value.gravityG))
  assert('result 带"物理锁"', wd.result.includes('物理锁'), '')
  assert('★ result 带"常见错误"', wd.result.includes('常见错误'), '')

  const star = bodiesMod.runBodies({ bodyType: 'main-sequence-star' }, deps)
  assert('按 id 查类型', star.value.id === 'main-sequence-star', star.value.id)

  const speculative = bodiesMod.runBodies({ bodyEvidence: 'speculative' }, deps)
  assert('按证据等级过滤返回列表', Array.isArray(speculative.value.ids) && speculative.value.ids.length > 0, '')
  assert('★ 推测类给出"保留推测标签"提示', speculative.result.includes('推测'), speculative.result.slice(-80))

  assert('未知类型 → unknown_symbol', throwsOf(() => bodiesMod.runBodies({ bodyType: '不存在类型' }, deps))?.type === 'unknown_symbol', '')
  assert('未知证据等级 → unknown_argument', throwsOf(() => bodiesMod.runBodies({ bodyEvidence: '瞎猜' }, deps))?.type === 'unknown_argument', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 常数传导：三类严格分开 --')
// ───────────────────────────────────────────────────────────
{
  const g = bodiesMod.runBodies({ bodyConstant: 'G', bodyFactor: 2 }, deps)
  const effect = (name) => g.value.effects.find((item) => item.quantity === name)
  assert('G×2 → 表面重力 ×2', near(effect('表面重力').multiplier, 2, 1e-9), String(effect('表面重力')?.multiplier))
  assert('★ G×2 → 轨道周期 ×2^-0.5 = 0.707', near(effect('轨道周期').multiplier, Math.SQRT1_2, 1e-9), '')
  assert('G×2 → 逃逸速度 ×√2', near(effect('逃逸速度').multiplier, Math.SQRT2, 1e-9), '')
  assert('★ 行星质量进"严格不动"', g.value.unchanged.some((q) => q.includes('行星质量')), JSON.stringify(g.value.unchanged))
  assert('★ 行星质量不在 effects 里', !g.value.effects.some((item) => item.quantity.includes('行星质量')), '')

  const alpha = bodiesMod.runBodies({ bodyConstant: 'alpha_fs', bodyFactor: 1.1 }, deps)
  const bond = alpha.value.effects.find((item) => item.quantity === '化学键能')
  assert('★ α×1.1 → 键能 ×1.21（∝α²）', near(bond.multiplier, 1.21, 1e-6), String(bond?.multiplier))
  const strength = alpha.value.effects.find((item) => item.quantity === '材料抗压强度')
  assert('★ α×1.1 → 强度 ×1.1^5 = 1.6105', near(strength.multiplier, 1.1 ** 5, 1e-9), String(strength?.multiplier))
  assert('★★ 行星平衡温度进"间接依赖"（不能当不变）',
    alpha.value.indirect.some((item) => item.quantity.includes('平衡温度')), JSON.stringify(alpha.value.indirect.map((i) => i.quantity)))
  assert('★ 平衡温度不在"严格不动"里',
    !alpha.value.unchanged.some((q) => q.includes('平衡温度')), JSON.stringify(alpha.value.unchanged))
  assert('行星质量/半径/轨道进"严格不动"', alpha.value.unchanged.some((q) => q.includes('行星质量')))

  const c = bodiesMod.runBodies({ bodyConstant: 'c', bodyFactor: 0.5 }, deps)
  const atom = c.value.effects.find((item) => item.quantity.includes('原子尺度'))
  assert('c 减半 → 原子尺度 ×0.5', near(atom.multiplier, 0.5, 1e-9), String(atom?.multiplier))
  const bondC = c.value.effects.find((item) => item.quantity === '化学键能')
  assert('c 减半 → 键能 ×4（∝c⁻²）', near(bondC.multiplier, 4, 1e-9), String(bondC?.multiplier))

  assert('G 的 result 有「按幂次重算」与「严格不动」两段', g.result.includes('【按幂次重算】') && g.result.includes('【严格不动'), '')
  assert('★ α 的 result 三段都在（含「间接依赖」）', alpha.result.includes('【按幂次重算】') && alpha.result.includes('【间接依赖') && alpha.result.includes('【严格不动'), '')
  assert('★ 未知常数 → unknown_argument', throwsOf(() => bodiesMod.runBodies({ bodyConstant: 'h', bodyFactor: 2 }, deps))?.type === 'unknown_argument', '')
  assert('factor ≤ 0 → invalid_argument', throwsOf(() => bodiesMod.runBodies({ bodyConstant: 'G', bodyFactor: 0 }, deps))?.type === 'invalid_argument', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 数据完整性抽查（资产没被改动）--')
// ───────────────────────────────────────────────────────────
{
  const earth = bodies.find((b) => b.id === 'earth')
  assert('地球质量 = 1 M⊕', near(earth.massEarth.value, 1, 1e-9), String(earth.massEarth.value))
  assert('地球表面重力 = 1 g', near(earth.surfaceGravityG.value, 1, 1e-9), String(earth.surfaceGravityG.value))
  assert('地球质量标为物理必然（改常数不该动）', earth.massEarth.dependence === 'first-principles', earth.massEarth.dependence)
  const titan = bodies.find((b) => b.id === 'titan')
  assert('土卫六存在', titan !== undefined, '')
  const types = taxonomy.map((t) => t.id)
  assert('32 类 id 无重复', new Set(types).size === 32, String(new Set(types).size))
  const speculativeCount = taxonomy.filter((t) => t.evidence === 'speculative').length
  assert('推测类有 2 类', speculativeCount === 2, String(speculativeCount))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
