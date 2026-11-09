/**
 * 守卫测试：**`world` 的每个物理量必须与公式库独立复算一致**。
 *
 * ## 为什么需要这条测试
 *
 * 实测确认：`src/world.ts` 完全不 import 公式库（只引 `CONSTANTS` 常量表），
 * 它**自己算了一套** surfaceGravity / escapeVelocity / maxMountainHeight…
 *
 * 而公式库里也有同一批公式。两边目前数字一致 —— 但那是因为「当初抄对了」，
 * **不是因为结构上保证一致**。
 *
 * 本项目已经吃过一次同类的亏（README 写 404 条而代码 442 条：
 * 手抄的数字对不齐只是时间问题）。
 *
 * ## 这条测试守什么
 *
 * ```
 *   world 输出的值  ==  公式库同一公式独立复算的值
 * ```
 *
 * 一旦有人改了公式库而忘了 world（或反过来），这里立刻红。
 *
 * ## 一个必须注意的坑（实测踩过）
 *
 * 最大山高：公式库 `building_height_limit` 默认 `strength=2e8`，
 * 而 world 用的是 **1.3e8**（由精细结构常数 α 推出的材料强度，ADR-0001 S2）。
 *
 * ```
 * 用默认值复算 → 7.54 km
 * world 实际   → 4.90 km     ← 差 54%
 * ```
 *
 * **所以对账时必须传 world 实际使用的输入值**，不能用公式库默认值 ——
 * 否则会误判成「不一致」。这正是本测试最有价值的部分：
 * 它把「输入从哪来」这个隐含假设暴露成了显式的参数。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-world-guard-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)
const { CONSTANTS } = await import(pathToFileURL(join(root, 'lib/formula-library.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 从 world 的文本输出里取一个数。 */
const grab = (text, re) => {
  const m = text.match(re)
  return m ? Number(m[1]) : NaN
}

/** 用公式库独立复算一个公式。 */
const calc = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}

/** 地球基准值 —— 用来验证「当参数是地球时，world 与公式库必须完全对上」。 */
const EARTH = {
  mass: 5.9722e24,
  radius: 6.371e6,
  g: 9.80665,
  /** world 里由 α 推出的材料强度（ADR-0001 S2）。实测值，不是默认 2e8。 */
  materialStrength: 1.3e8,
  materialDensity: 2700,
}

const worldText = String((await run({ operation: 'world', starMass: 1, orbitAU: 1 })).result ?? '')

console.log('-- 1. world 输出可解析 --')
{
  assert('world 有输出', worldText.length > 1000, String(worldText.length))
  assert('world 含表面重力一行', /表面重力/.test(worldText), '')
  assert('world 含最大山高一行', /最大山高/.test(worldText), '')
}

console.log('-- 2. ★ 逐项对账：world 的值 == 公式库独立复算 --')
{
  /**
   * 每一项写成 { name, 从 world 文本抓取的正则, 公式 id, overrides, 容差 }。
   *
   * ★ 容差取「相对 1%」：world 的输出只显示 2 位小数，
   *   而公式库给全精度 —— 差异全部来自显示精度，不是计算差异。
   */
  const cases = [
    {
      name: '表面重力',
      re: /表面重力 ([\d.]+) m\/s²/,
      formula: 'surface_gravity',
      overrides: { M: EARTH.mass, R: EARTH.radius },
      /** world 显示 9.82，公式给 9.8203 —— 相对误差 3e-5。 */
      scale: 1,
      tol: 0.01,
    },
    {
      name: '逃逸速度',
      re: /逃逸速度 ([\d.]+) km\/s/,
      formula: 'escape_velocity',
      overrides: { M: EARTH.mass, r: EARTH.radius },
      /** 单位换算：公式给 m/s，world 显示 km/s。 */
      scale: 1 / 1000,
      tol: 0.01,
    },
    {
      name: '地平线距离',
      re: /地平线距离（1.7m 眼高）([\d.]+) km/,
      formula: 'horizon_distance',
      overrides: { h: 1.7, R: EARTH.radius },
      scale: 1 / 1000,
      tol: 0.01,
    },
    {
      name: '最大山高',
      re: /材料能支撑的最大山高 ([\d.]+) km/,
      formula: 'building_height_limit',
      /**
       * ★★ 这里是最容易踩的地方：必须传 world 实际用的强度 1.3e8，
       * 不能用公式库默认的 2e8（那会算出 7.54 km，与 4.9 差 54%）。
       */
      overrides: { strength: EARTH.materialStrength, rho: EARTH.materialDensity, g: 9.82 },
      scale: 1 / 1000,
      tol: 0.01,
    },
  ]

  for (const item of cases) {
    const fromWorld = grab(worldText, item.re)
    const fromFormula = (await calc(item.formula, item.overrides)) * item.scale
    assert(
      item.name + '：world 与公式库一致',
      Number.isFinite(fromWorld) && Number.isFinite(fromFormula) &&
        Math.abs(fromWorld - fromFormula) / Math.max(Math.abs(fromFormula), 1e-9) <= item.tol,
      'world=' + fromWorld + ' formula=' + fromFormula.toFixed(4),
    )
  }
}

console.log('-- 3. ★ 反向对照：用错输入必须能发现差异 --')
{
  /**
   * ★★ 这条守的是「本测试真的能抓到不一致」。
   *
   * 如果我上面用了公式库默认的 strength=2e8，本该红却「通过」，
   * 说明测试本身是假的。所以这里故意用错的值算一次，断言它确实不同。
   */
  const correct = await calc('building_height_limit', { strength: EARTH.materialStrength, rho: EARTH.materialDensity, g: 9.82 })
  const wrong = await calc('building_height_limit', { strength: 2e8, rho: EARTH.materialDensity, g: 9.82 })
  assert(
    '用默认强度会得到不同的值（证明对账有效）',
    Math.abs(correct - wrong) / correct > 0.4,
    (correct / 1000).toFixed(2) + ' km vs ' + (wrong / 1000).toFixed(2) + ' km',
  )
  /** ★ 且 world 的值应接近「正确」而不是「错误」的那个。 */
  const fromWorld = grab(worldText, /材料能支撑的最大山高 ([\d.]+) km/) * 1000
  assert(
    'world 用的是 1.3e8 而不是默认 2e8',
    Math.abs(fromWorld - correct) / correct < 0.01,
    'world=' + (fromWorld / 1000).toFixed(2) + ' km，正确=' + (correct / 1000).toFixed(2) + ' km',
  )
}

console.log('-- 4. ★ 重力与山高的反比关系必须一致 --')
{
  /**
   * 换一个星球（1.5 倍重力），看 world 与公式库是否**同步**变化。
   *
   * 单点比对可能碰巧一致；两点比对才能验证「两边用的是同一个式子」。
   * 质量不变、半径缩小 → 重力上升 → 山高下降（反比）。
   */
  const heavy = String((await run({ operation: 'world', starMass: 1, orbitAU: 1, planetMass: 1, planetRadius: 0.82 })).result ?? '')
  const gHeavy = grab(heavy, /表面重力 ([\d.]+) m\/s²/)
  const mHeavy = grab(heavy, /材料能支撑的最大山高 ([\d.]+) km/)

  /** 公式库复算：半径 0.82 倍 → 重力 = g/0.82² */
  const radiusHeavy = EARTH.radius * 0.82
  const fgHeavy = await calc('surface_gravity', { M: EARTH.mass, R: radiusHeavy })
  assert('1.5 倍重力星：重力值一致', Math.abs(gHeavy - fgHeavy) / fgHeavy < 0.01, 'world=' + gHeavy + ' formula=' + fgHeavy.toFixed(4))

  const fmHeavy = await calc('building_height_limit', { strength: EARTH.materialStrength, rho: EARTH.materialDensity, g: fgHeavy })
  assert('1.5 倍重力星：山高一致', Math.abs(mHeavy - fmHeavy / 1000) / (fmHeavy / 1000) < 0.02,
    'world=' + mHeavy + ' formula=' + (fmHeavy / 1000).toFixed(2))

  /** ★ 核心：重力上升 → 山高必须下降（反比），两边都要体现。 */
  const gEarth = grab(worldText, /表面重力 ([\d.]+) m\/s²/)
  const mEarth = grab(worldText, /材料能支撑的最大山高 ([\d.]+) km/)
  assert('重力上升 → 山高下降（world）', gHeavy > gEarth && mHeavy < mEarth,
    mEarth + ' → ' + mHeavy + ' km')
}

console.log('-- 5. ★ 公式库里必须有 world 用的每一个式子 --')
{
  /**
   * 这一条守的是「单一数据源」的前提：**公式库里得真有对应的公式**。
   * 若某个量 world 在用而公式库没有，那就不是「重复实现」，而是「公式库缺一条」。
   */
  const required = ['surface_gravity', 'escape_velocity', 'horizon_distance', 'building_height_limit']
  const missing = required.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('world 用到的公式全部在库中', missing.length === 0, missing.join(','))

  /**
   * ★ 并且它们的表达式要真的对应 world 的算法（抽查两条最容易写错的）。
   */
  const sg = fm.FORMULA_INDEX.get('surface_gravity')
  assert('surface_gravity 是 G·M/R²', /G\s*\*\s*M\s*\/\s*R\^2/i.test(sg?.expr ?? ''), sg?.expr ?? '')
  const ev = fm.FORMULA_INDEX.get('escape_velocity')
  assert('escape_velocity 是 √(2GM/r)', /sqrt\(2\s*\*\s*G\s*\*\s*M/i.test(ev?.expr ?? ''), ev?.expr ?? '')
  const bh = fm.FORMULA_INDEX.get('building_height_limit')
  assert('building_height_limit 是 strength/(ρ·g)', /strength\s*\/\s*\(\s*rho\s*\*\s*g\s*\)/i.test(bh?.expr ?? ''), bh?.expr ?? '')
}

console.log('-- 6. 密度与平衡温度（world 内部算，公式库也应有）--')
{
  /** 平均密度：M / (4/3·πR³) */
  const rhoWorld = grab(worldText, /平均密度 ([\d.]+) kg\/m³/)
  const rhoCalc = EARTH.mass / ((4 / 3) * Math.PI * EARTH.radius ** 3)
  assert('平均密度一致', Math.abs(rhoWorld - rhoCalc) / rhoCalc < 0.01, rhoWorld + ' vs ' + rhoCalc.toFixed(0))

  /**
   * 辐射平衡温度：公式库的 equilibrium_temp 需要 Tstar/Rstar/d，
   * 而 world 内部用的是另一种形式（含 1/4π 的写法）。
   * 这里只验证「公式库能算出同量级」，不强制逐位相等 ——
   * 因为两者的输入口径不同（world 用轨道距，公式库用恒星参数）。
   */
  const r = await run({ operation: 'formula', formula: 'equilibrium_temp', overrides: { Tstar: 5778, Rstar: CONSTANTS.Rsun, d: CONSTANTS.AU, albedo: 0.3 } })
  assert('equilibrium_temp 对地球参数可求值', r.ok, String(r.result).slice(0, 60))
  if (r.ok) {
    const tEq = Number(String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)?.[1] ?? NaN)
    /** 地球实测约 255K（无温室），world 报 254.3K。 */
    assert('平衡温度落在 250~260K', tEq > 250 && tEq < 260, String(tEq))
  }
}

console.log('-- 7. ★ 耦合产物：推导链与下一步衔接 --')
{
  /**
   * 层二的产物：world 输出里必须能回答「这个数从哪来」与「接下来能算什么」。
   * 这两段是「公式库与推导耦合」的可见证据 —— 没有它们，world 仍是个黑箱。
   */
  assert('输出含【推导链】段', /【推导链】/.test(worldText), '')
  assert('推导链给出重力式子', worldText.includes('G·M/R²'), '')
  assert('推导链显式标注 strength 来源', /由 α 推出/.test(worldText), '')
  assert('推导链提示 core-physics 共用', /core-physics/.test(worldText), '')

  assert('输出含【接着往下推】段', /【接着往下推】/.test(worldText), '')
  assert('衔接段给出可复制的 overrides', /overrides={/.test(worldText), '')
  assert('衔接段指向体系查询', worldText.includes('formulas query='), '')
  assert('衔接段指向复合路径', worldText.includes('sys:compound'), '')

  /**
   * ★ 衔接段里提到的公式**必须真的存在**（否则是死引用）。
   * 这与 formula-systems 那条「接点公式必须在目标链里」同一思路。
   */
  const mentioned = ['kleiber', 'q10_temperature', 'lift_force', 'buckling_euler', 'wind_power_available', 'sediment_trap_efficiency']
  const missing = mentioned.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('衔接段引用的公式全部存在', missing.length === 0, missing.join(','))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
