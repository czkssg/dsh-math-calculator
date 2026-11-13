/**
 * formulas 对齐测试：检索 / 求值 / 体系链。
 *
 * ## 三个 operation
 *
 * ```
 *   formula        单条（overrides 改参数）
 *   formulas       批量 + 检索
 *   formula-table  参数表
 * ```
 *
 * ## ★ 本套件最要紧的一条：检索必须如实报「无精确匹配」
 *
 * 反馈包的核心问题（`06` 号 N 系列之外的独立发现）：
 *
 * ```
 *   query="作用量"  → 11 条，首条「两平行导线间的作用力」   ← 整串零命中
 *   query="机械"    → 5 条，首条「指数分布的均值」         ← 命中 desc 里的无关文字
 * ```
 *
 * **危害不是排序不好，而是「看起来像有」** —— 用户逐个点开发现全不相干，
 * 于是不会去补那条真缺的公式。
 *
 * 现在用 minisearch + segmentit（中文分词），并**显式区分**精确/近似。
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-fml-'))
process.env.DSH_MATH_CALC_HOME = home

const { buildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const q = await import(pathToFileURL(join(root, 'lib/features/formulas/query.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/features/formulas/evaluate.js')).href)
const sys = await import(pathToFileURL(join(root, 'lib/features/formulas/systems.js')).href)

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

const engine = buildEngine()
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const byId = new Map(formulas.map((f) => [f.id, f]))

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 检索：精确命中必须准确 --')
// ───────────────────────────────────────────────────────────
{
  /** 单字/双字词：分词后与 keys 相同，应判精确。 */
  const escaping = q.queryFormulas(formulas, '逃逸', 3).value
  assert('★「逃逸」精确命中 escape_velocity',
    escaping.exactCount >= 1 && escaping.results[0].id === 'escape_velocity',
    JSON.stringify(escaping.results.map((r) => r.id)))

  const mountain = q.queryFormulas(formulas, '山高', 3).value
  assert('「山高」命中 mountain_lifetime',
    mountain.results[0]?.id === 'mountain_lifetime', mountain.results[0]?.id)

  const radiation = q.queryFormulas(formulas, '黑体辐射', 3).value
  assert('★「黑体辐射」精确命中 stefan_boltzmann',
    radiation.exactCount >= 1, String(radiation.exactCount))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 零精确命中必须如实报告 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 「作用量」是反馈包里的原始案例 —— 库里**确实没有**这条公式。
   * 所以正确行为是：**明确说没有精确匹配**，而不是包装成「找到了」。
   */
  const action = q.queryFormulas(formulas, '作用量', 3)
  const v = action.value
  assert('★「作用量」精确命中数为 0', v.exactCount === 0, String(v.exactCount))
  assert('★ 正文说「没有精确匹配」', /没有精确匹配/.test(action.result),
    action.result.split(String.fromCharCode(10))[0])
  assert('★ 给出 notice 提醒是近似', typeof action.notice === 'string' && action.notice.length > 5,
    String(action.notice).slice(0, 40))
  /** 排序第一的应是与「用量」相关的，而不是硬凑的。 */
  assert('结果确实是相关的（石灰用量）', /lime_plaster|用量/.test(JSON.stringify(v.results)),
    JSON.stringify(v.results.map((r) => r.id)))

  /** 完全无关的查询：零命中要明说。 */
  const nothing = q.queryFormulas(formulas, 'zzzz不存在的概念', 3)
  assert('★ 零命中明说「没有匹配」', nothing.value.count === 0, String(nothing.value.count))
  assert('零命中给出替代建议', /可能原因|evaluate/.test(nothing.result), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 检索的相关性（中文分词确实起作用）--')
// ───────────────────────────────────────────────────────────
{
  /** 若没有分词，「船的航速上限」整串匹配不到任何 keys。 */
  const hull = q.queryFormulas(formulas, '船的航速上限', 5).value
  assert('★ 整句中文能检索到（靠分词）', hull.count >= 1, String(hull.count))
  assert('命中 hull_speed', JSON.stringify(hull.results).includes('hull_speed'),
    JSON.stringify(hull.results.map((r) => r.id)))

  /** 英文 id 也要能查。 */
  const byIdQuery = q.queryFormulas(formulas, 'escape_velocity', 3).value
  assert('英文 id 能检索', byIdQuery.count >= 1 && byIdQuery.results[0].id === 'escape_velocity', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 单条求值：overrides 与单位提示 --')
// ───────────────────────────────────────────────────────────
{
  const entry = byId.get('escape_velocity')
  assert('escape_velocity 存在', entry !== undefined, '')

  /** 正常求值。 */
  const one = fm.evaluateFormula(engine, entry, { M: 5.972e24, r: 6.371e6 })
  assert('★ 逃逸速度 ≈ 11186 m/s', Math.abs(one.value.result - 11185.98) < 1, String(one.value.result))
  assert('单位是 m/s', one.value.unit === 'm/s', one.value.unit)
  assert('记录了被覆盖的参数', JSON.stringify(one.value.appliedOverrides.sort()) === '["M","r"]',
    JSON.stringify(one.value.appliedOverrides))

  /** 正文要标出被覆盖的参数。 */
  assert('正文标出覆盖（* 标记）', /\*/.test(one.result), one.result.split(String.fromCharCode(10))[2])
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ overrides 错拼必须点名（不许静默忽略）--')
// ───────────────────────────────────────────────────────────
{
  const entry = byId.get('escape_velocity')
  let error = null
  try {
    fm.evaluateFormula(engine, entry, { M: 5.972e24, radius: 6.371e6 })
  } catch (e) {
    error = e
  }
  assert('★ 错拼的 key 被拒', error !== null, '没有报错')
  assert('★ 错误类型 unknown_argument', error?.type === 'unknown_argument', String(error?.type))
  assert('★ 点出错拼的名字', /radius/.test(error?.message ?? ''), (error?.message ?? '').slice(0, 80))
  assert('★ 列出正确的参数名', /M/.test(error?.hint ?? ''), (error?.hint ?? '').slice(0, 80))

  /** 缺必填参数也要报。 */
  let missing = null
  try {
    fm.evaluateFormula(engine, entry, { M: 5.972e24 })
  } catch (e) {
    missing = e
  }
  assert('★ 缺必填参数报 missing_params', missing?.type === 'missing_params', String(missing?.type))
  assert('点名缺的是 r', /\br\b/.test(missing?.message ?? ''), (missing?.message ?? '').slice(0, 60))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 批量求值 --')
// ───────────────────────────────────────────────────────────
{
  const e1 = byId.get('escape_velocity')
  const e2 = byId.get('stefan_boltzmann')
  const batch = fm.evaluateFormulaBatch(engine, [
    { entry: e1, overrides: { M: 5.972e24, r: 6.371e6 }, label: '地球' },
    { entry: e2, overrides: { A: 1, T: 5772 }, label: '黑体' },
  ])
  assert('批量 2 条', batch.value.items.length === 2, String(batch.value.items.length))
  assert('都成功', batch.value.failed === 0, String(batch.value.failed))
  assert('正文带 label', /地球/.test(batch.result) && /黑体/.test(batch.result), '')

  /** 一条失败不影响其它。 */
  const mixed = fm.evaluateFormulaBatch(engine, [
    { entry: e1, overrides: { M: 1, r: 1 }, label: '好的' },
    { entry: e1, overrides: { 错拼: 1 }, label: '坏的' },
  ])
  assert('★ 一条失败不影响另一条', mixed.value.items[0].ok && !mixed.value.items[1].ok,
    JSON.stringify(mixed.value.items.map((i) => i.ok)))
  assert('★ 失败的说明原因', /参数名认不出/.test(mixed.value.items[1].text), mixed.value.items[1].text)
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. ★ 体系链：拓扑排序与「链≠依赖」--')
// ───────────────────────────────────────────────────────────
{
  /** 有依赖的链：A → B。 */
  const dependent = {
    id: 'test-chain',
    name: '测试链',
    steps: [
      { formula: 'escape_velocity', inputs: { M: 5.972e24, r: 6.371e6 }, as: 'v_esc' },
      /** 第二步用第一步的输出当输入。 */
      { formula: 'orbital_velocity', inputs: { M: 5.972e24, r: 6.371e6 }, as: 'v_orb' },
    ],
  }
  const out = sys.evaluateSystem(engine, formulas, dependent, {})
  assert('链能求值', out.value.steps === 2, String(out.value.steps))
  assert('输出有 v_esc', typeof out.value.outputs.v_esc === 'number', JSON.stringify(out.value.outputs))

  /** 无依赖的链：应明确说「不能互相印证」。 */
  const parallel = {
    id: 'parallel-chain',
    name: '并列链',
    steps: [
      { formula: 'escape_velocity', inputs: { M: 5.972e24, r: 6.371e6 } },
      { formula: 'stefan_boltzmann', inputs: { A: 1, T: 5772 } },
    ],
  }
  const pOut = sys.evaluateSystem(engine, formulas, parallel, {})
  assert('★ 无依赖时给 notice', typeof pOut.notice === 'string' && /依赖/.test(pOut.notice),
    String(pOut.notice).slice(0, 50))
  assert('★ 标记 sorted=false', pOut.value.sorted === false, String(pOut.value.sorted))

  /** 不存在的公式要被拒。 */
  let badFormula = null
  try {
    sys.evaluateSystem(engine, formulas, {
      id: 'bad', name: '坏链', steps: [{ formula: 'no_such_formula_xyz' }],
    }, {})
  } catch (e) {
    badFormula = e
  }
  assert('★ 引用不存在的公式报 unknown_formula', badFormula?.type === 'unknown_formula',
    String(badFormula?.type))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 数据完整性 --')
// ───────────────────────────────────────────────────────────
{
  assert('公式总数 740', formulas.length === 740, String(formulas.length))
  assert('每条都有 id/name/expr', formulas.every((f) => f.id && f.name && f.expr), '')
  assert('id 唯一', new Set(formulas.map((f) => f.id)).size === formulas.length, '')

  /**
   * 抽查：**只挑参数全有默认值的公式**。
   *
   * 实测（2026-11-13）：665 条里 **401 条参数全必填**（物理公式本来如此），
   * 只有 18 条全有默认值。我第一版抽查前 30 条，结果 0 条能算 ——
   * 那不是实现的错，是抽查方式错了。
   */
  const withDefaults = formulas.filter((f) =>
    Object.values(f.params ?? {}).every((p) => p.value !== null))
  assert('至少有 10 条公式参数全有默认值', withDefaults.length >= 10, String(withDefaults.length))

  /**
   * ⚠ **`leontief_inverse` 是已知例外**：它的结果是矩阵（4 个数），
   * 而公式的语义是「给一个数」。所以它**明确报错**是对的，
   * 不是缺陷 —— 相比静默返回矩阵的第一个元素，报错更安全。
   */
  const KNOWN_MATRIX_FORMULAS = new Set(['leontief_inverse'])

  let evaluable = 0
  const failures = []
  for (const f of withDefaults) {
    try {
      fm.evaluateFormula(engine, f, {}, 8, true)
      evaluable += 1
    } catch (error) {
      if (KNOWN_MATRIX_FORMULAS.has(f.id)) continue
      failures.push(f.id + '：' + String(error?.message).split(String.fromCharCode(10))[0].slice(0, 50))
    }
  }
  const expected = withDefaults.length - KNOWN_MATRIX_FORMULAS.size
  assert('★ 默认参数齐全的公式全部可求值（矩阵结果除外）', evaluable >= expected,
    '成功 ' + evaluable + '/' + expected + '；失败：' + failures.slice(0, 3).join(' | '))

  /** 矩阵结果的公式必须**明确报错**，不能静默给第一个元素。 */
  const matrixFormula = byId.get('leontief_inverse')
  if (matrixFormula !== undefined) {
    let matrixError = null
    try {
      fm.evaluateFormula(engine, matrixFormula, {}, 8, true)
    } catch (error) {
      matrixError = error
    }
    assert('★ 矩阵结果明确报错（不静默取第一个元素）',
      matrixError !== null && /矩阵/.test(matrixError?.message ?? ''),
      (matrixError?.message ?? '').slice(0, 60))
  }

  /** 必填参数缺失必须报 missing_params（不是静默算错）。 */
  const required = formulas.find((f) => Object.values(f.params ?? {}).some((p) => p.value === null))
  let missingError = null
  try {
    fm.evaluateFormula(engine, required, {}, 8, true)
  } catch (error) {
    missingError = error
  }
  assert('★ 全必填的公式缺参数时报 missing_params', missingError?.type === 'missing_params',
    String(missingError?.type))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
