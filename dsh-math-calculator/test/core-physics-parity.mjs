/**
 * 守卫测试：`core-physics` 与公式库的 expr **必须算出同一个数**。
 *
 * ## 为什么需要它
 *
 * 公式库的公式是 **mathjs 表达式字符串**（`'G * M / R^2'`），
 * 而 `world` 用的是 `core-physics.ts` 的**函数**。
 *
 * ```
 *   同一个物理量，两种形式：
 *     core-physics.ts   surfaceGravity(G, M, R)      ← 函数，world 用
 *     formula-library   expr: 'G * M / R^2'          ← 字符串，对外暴露
 * ```
 *
 * 不可能让 expr 调用函数（mathjs 不认），所以**两者必然是两份文本**。
 * 那么怎么保证它们不漂移？—— **靠这条测试。**
 *
 * 这是本项目的既定做法：**当结构上无法合并时，用断言把它们钉在一起**
 * （如同 `formula-systems` 里「接点公式必须在目标链的步骤里」那条）。
 *
 * ## 覆盖范围
 *
 * 只覆盖 `core-physics` 里已经抽出来的那些（world 真正在用的）。
 * 不做全库对账 —— 那没有意义（大部分公式与 world 无关）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-core-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const core = await import(pathToFileURL(join(root, 'lib/core-physics.js')).href)
const { CONSTANTS } = await import(pathToFileURL(join(root, 'lib/formula-library.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 用公式库算一条。 */
const viaFormula = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}

const rel = (a, b, tol) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12) <= tol

console.log('-- 1. 函数与公式 expr 逐项一致 --')
{
  /**
   * 统一取一组地球参数。用 1e8 而不是默认值，是为了让「输入口径」显式 ——
   * 这正是本项目反复强调的那一点。
   */
  const G = CONSTANTS.G
  const M = 5.9722e24
  const R = 6.371e6

  const pairs = [
    {
      name: 'surface_gravity',
      fn: () => core.surfaceGravity(G, M, R),
      formula: 'surface_gravity',
      overrides: { G, M, R },
    },
    {
      name: 'escape_velocity',
      fn: () => core.escapeVelocity(G, M, R),
      formula: 'escape_velocity',
      overrides: { G, M, r: R },
    },
    {
      name: 'orbital_velocity',
      fn: () => core.orbitalVelocity(G, CONSTANTS.Msun, CONSTANTS.AU),
      formula: 'orbital_velocity',
      overrides: { G, M: CONSTANTS.Msun, r: CONSTANTS.AU },
    },
    {
      name: 'orbital_period',
      fn: () => core.orbitalPeriod(G, CONSTANTS.Msun, CONSTANTS.AU),
      formula: 'orbital_period',
      overrides: { G, M: CONSTANTS.Msun, r: CONSTANTS.AU },
    },
    {
      name: 'mean_density（公式库无对应，只验数值）',
      fn: () => core.meanDensity(M, R),
      /** 公式库没有 mean_density，用解析值反守。 */
      expect: M / ((4 / 3) * Math.PI * R ** 3),
    },
    {
      name: 'horizon_distance',
      fn: () => core.horizonDistance(R, 1.7),
      /** 公式库参数名是 h / R。 */
      formula: 'horizon_distance',
      overrides: { h: 1.7, R },
    },
    {
      name: 'stellar_luminosity',
      fn: () => core.stellarLuminosity(CONSTANTS.sigma, CONSTANTS.Rsun, 5778),
      formula: 'stellar_luminosity',
      overrides: { sigma: CONSTANTS.sigma, R: CONSTANTS.Rsun, T: 5778 },
    },
    {
      name: 'centrifugal_ratio',
      fn: () => core.centrifugalRatio((2 * Math.PI) / (23.93 * 3600), R, 9.82),
      formula: 'centrifugal_ratio',
      overrides: { omega: (2 * Math.PI) / (23.93 * 3600), R, g: 9.82 },
    },
    {
      name: 'building_height_limit',
      fn: () => core.buildingHeightLimit(1.3e8, 2700, 9.82),
      formula: 'building_height_limit',
      overrides: { strength: 1.3e8, rho: 2700, g: 9.82 },
    },
  ]

  for (const item of pairs) {
    const fromFn = item.fn()
    const fromFormula = item.formula ? await viaFormula(item.formula, item.overrides) : item.expect
    assert(
      item.name + '：函数与公式一致',
      /**
       * 容差 1e-6 而不是 1e-9：公式库的输出按 displayPrecision 截到 8 位小数，
       * 而函数返回全精度。像 0.00345116 vs 0.0034511628692… 的差是**显示截断**，
       * 不是计算差异。
       */
      Number.isFinite(fromFn) && Number.isFinite(fromFormula) && rel(fromFn, fromFormula, 1e-6),
      'fn=' + fromFn.toExponential(6) + ' formula=' + (fromFormula === undefined ? '?' : fromFormula.toExponential(6)),
    )
  }
}

console.log('-- 2. ★ 反向对照：改参数后仍然一致（证明用的是同一式子）--')
{
  /**
   * 单点一致可能是巧合。换一组参数再比一次 —— 只有**形式相同**才会继续一致。
   * 若某一边写成 `R^2` 而另一边写成 `R`，地球参数下也许蒙对，换参数必露。
   */
  const G = CONSTANTS.G
  const cases = [
    { M: 3.3e23, R: 2.44e6 },      // 火星
    { M: 1.9e27, R: 7.15e7 },      // 木星
    { M: 1e24, R: 5e6 },           // 虚构小行星
  ]
  for (const c of cases) {
    const fnG = core.surfaceGravity(G, c.M, c.R)
    const fmG = await viaFormula('surface_gravity', { G, M: c.M, R: c.R })
    assert(
      'M=' + c.M.toExponential(1) + ' 重力一致',
      rel(fnG, fmG, 1e-6),
      fnG.toFixed(4) + ' vs ' + fmG.toFixed(4),
    )
    const fnE = core.escapeVelocity(G, c.M, c.R)
    const fmE = await viaFormula('escape_velocity', { G, M: c.M, r: c.R })
    assert(
      'M=' + c.M.toExponential(1) + ' 逃逸速度一致',
      rel(fnE, fmE, 1e-6),
      (fnE / 1000).toFixed(3) + ' vs ' + (fmE / 1000).toFixed(3) + ' km/s',
    )
  }
}

console.log('-- 3. 已知的物理事实（防止两边一起错）--')
{
  /**
   * ★ 只对账还不够 —— 若两边同时写错，对账仍会通过。
   * 所以补几条**独立于实现的物理事实**做锚。
   */
  const G = CONSTANTS.G
  /** 地球表面重力必须 ≈ 9.8 m/s²（这是定义性的）。 */
  const gEarth = core.surfaceGravity(G, 5.9722e24, 6.371e6)
  assert('地球表面重力 ≈ 9.8', Math.abs(gEarth - 9.8) < 0.05, gEarth.toFixed(4))
  /** 地球逃逸速度必须 ≈ 11.2 km/s。 */
  const vEarth = core.escapeVelocity(G, 5.9722e24, 6.371e6)
  assert('地球逃逸速度 ≈ 11.2 km/s', Math.abs(vEarth / 1000 - 11.2) < 0.1, (vEarth / 1000).toFixed(2))
  /** 地球公转周期必须 ≈ 365.25 天。 */
  const T = core.orbitalPeriod(G, CONSTANTS.Msun, CONSTANTS.AU)
  assert('地球公转周期 ≈ 365.25 天', Math.abs(T / 86400 - 365.25) < 1, (T / 86400).toFixed(2))
  /** 太阳光度必须 ≈ 3.828e26 W（由 Lsun 反守）。 */
  const L = core.stellarLuminosity(CONSTANTS.sigma, CONSTANTS.Rsun, 5778)
  assert('太阳光度 ≈ Lsun', rel(L, CONSTANTS.Lsun, 0.01), (L / CONSTANTS.Lsun).toFixed(4) + ' 倍')
  /** 地平线 1.7m 眼高 ≈ 4.65 km。 */
  const d = core.horizonDistance(6.371e6, 1.7)
  assert('地平线 1.7m ≈ 4.65 km', Math.abs(d / 1000 - 4.65) < 0.05, (d / 1000).toFixed(3) + ' km')
  /**
   * 地球赤道离心比 ≈ **0.00345**（离心力只有重力的 0.35%）。
   *
   * ⚠ 我第一版写成 0.034（差 10 倍）—— 这正是这类断言的价值：
   * 它对账时能发现「我的记忆」与「实现」不一致。
   * 校验方法：赤道自转线速度 ωR = 464.7 m/s（应为 465），
   * 则 v²/(Rg) = 465²/(6.371e6 × 9.82) ≈ 0.00345。
   */
  const c = core.centrifugalRatio((2 * Math.PI) / (23.93 * 3600), 6.371e6, 9.82)
  assert('地球离心比 ≈ 0.00345', Math.abs(c - 0.00345) < 0.0005, c.toFixed(5))
}

console.log('-- 4. core-physics 是纯函数层（无状态、无副作用）--')
{
  /**
   * ★ 这条守的是「它真的可以被两边安全共用」。
   * 纯函数意味着：同输入必同输出，不依赖全局状态。
   */
  const a = core.surfaceGravity(CONSTANTS.G, 1e24, 5e6)
  const b = core.surfaceGravity(CONSTANTS.G, 1e24, 5e6)
  assert('同输入同输出（纯函数）', a === b, String(a))
  /** 调用顺序不影响结果。 */
  core.escapeVelocity(CONSTANTS.G, 2e24, 6e6)
  const c = core.surfaceGravity(CONSTANTS.G, 1e24, 5e6)
  assert('调用其它函数不影响结果', c === a, String(c))
  /** 不修改入参。 */
  const params = { G: CONSTANTS.G, M: 1e24, R: 5e6 }
  core.surfaceGravity(params.G, params.M, params.R)
  assert('不修改入参', params.M === 1e24 && params.R === 5e6, '')
}

console.log('-- 5. 导出齐全 --')
{
  const required = [
    'surfaceGravity', 'escapeVelocity', 'orbitalVelocity', 'orbitalPeriod',
    'meanDensity', 'horizonDistance', 'stellarLuminosity', 'equilibriumTemperature',
    'centrifugalRatio', 'buildingHeightLimit', 'dryLapseRate',
  ]
  const missing = required.filter((name) => typeof core[name] !== 'function')
  assert('11 个函数全部导出', missing.length === 0, missing.join(','))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
