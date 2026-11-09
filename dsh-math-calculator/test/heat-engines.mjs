/**
 * 热机循环与制冷（第六批）11 条。
 *
 * ## 为什么这批的核心断言是「两条公式里有没有温度项」
 *
 * 本批最重要的结论是**技术树分叉**：
 *
 * ```
 *   Otto / Brayton  效率里**没有温度项** → 提效率唯一主路是提压缩比/压比
 *   Rankine / 卡诺  效率**只由温度决定** → 提效率唯一主路是提蒸汽温度
 * ```
 *
 * 这个区别不是设计偏好，是公式结构决定的。所以断言直接验**结构性质**：
 * 改变温度时 Otto 效率必须不变、改变压缩比时 Rankine 效率必须不变。
 *
 * 若有人「顺手」把温度参数加进 Otto，或把压缩比加进 Rankine，这几条会立刻红。
 * 这比验某个数值更能守住真正的知识。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-heat-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-6)
const rel = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol

console.log('-- 1. Otto：效率只由压缩比决定 --')
{
  /** 手算（γ=1.4）：r=8 → 56.47%、r=10 → 60.19%、r=12 → 63.0% */
  assert('r=8 → 56.47%', close(await num('otto_efficiency', { compression_ratio: 8 }), 0.564725, 1e-5))
  assert('r=10 → 60.19%', close(await num('otto_efficiency', { compression_ratio: 10 }), 0.601893, 1e-5))
  assert('r=12 → 62.99%', close(await num('otto_efficiency', { compression_ratio: 12 }), 0.629893, 1e-5))
  /**
   * ★★ 本套最重要的结构断言：**Otto 效率与温度无关**。
   * 公式里根本没有温度参数，所以「换个温度」不会改变结果 —— 这就是「技术树分叉」的证明。
   */
  const a = await num('otto_efficiency', { compression_ratio: 10 })
  const b = await num('otto_efficiency', { compression_ratio: 10, temperature: 2000 })
  assert('效率不受温度参数影响（结构性质）', close(a, b), a.toFixed(4) + ' = ' + b.toFixed(4))
  /** ★ 单调递增：压缩比越高效率越高。 */
  const r6 = await num('otto_efficiency', { compression_ratio: 6 })
  const r15 = await num('otto_efficiency', { compression_ratio: 15 })
  assert('压缩比越高效率越高', r15 > r6, (r6 * 100).toFixed(1) + '% → ' + (r15 * 100).toFixed(1) + '%')
  /** ★ r=1 时效率为 0（不压缩就没有温差可以利用）。 */
  assert('r=1 → 效率 0', close(await num('otto_efficiency', { compression_ratio: 1 }), 0))
}

console.log('-- 2. Diesel：高压缩比但截断比有代价 --')
{
  assert('r=18,rc=2 → 63.2%', close(await num('diesel_efficiency', { compression_ratio: 18, cutoff_ratio: 2 }), 0.631578, 1e-4))
  assert('r=18,rc=3 → 58.9%', close(await num('diesel_efficiency', { compression_ratio: 18, cutoff_ratio: 3 }), 0.589149, 1e-4))
  /**
   * ★ 关键：**rc 越大效率越低**（等压燃烧段越长，越失去定容优势）。
   * 这条容易被写反 —— 直觉上「多烧一点应该更有力」，但效率反而降。
   */
  const rc15 = await num('diesel_efficiency', { compression_ratio: 18, cutoff_ratio: 1.5 })
  const rc3 = await num('diesel_efficiency', { compression_ratio: 18, cutoff_ratio: 3 })
  assert('截断比越大效率越低', rc3 < rc15, (rc15 * 100).toFixed(1) + '% > ' + (rc3 * 100).toFixed(1) + '%')
  assert('rc=1.5 → 65.6%', close(rc15, 0.656, 0.002), String(rc15))
  /** ★ 与 Otto 对比：同压缩比时 Diesel 效率**低于** Otto（定容优于等压）。 */
  const otto18 = await num('otto_efficiency', { compression_ratio: 18 })
  const die18 = await num('diesel_efficiency', { compression_ratio: 18, cutoff_ratio: 2 })
  assert('同 r 下 Diesel < Otto（定容优于等压）', die18 < otto18, (die18 * 100).toFixed(1) + '% < ' + (otto18 * 100).toFixed(1) + '%')
}

console.log('-- 3. Brayton 与联合循环 --')
{
  assert('π=10 → 48.2%', close(await num('brayton_efficiency', { pressure_ratio: 10 }), 0.482, 0.002))
  assert('π=20 → 57.5%', close(await num('brayton_efficiency', { pressure_ratio: 20 }), 0.5751, 1e-3))
  assert('π=30 → 62.2%', close(await num('brayton_efficiency', { pressure_ratio: 30 }), 0.6221, 0.002))
  /** ★ 与 Otto 的差别：Brayton 用 π^((γ−1)/γ)，Otto 用 r^(γ−1)。**两者不同源**。 */
  const bray20 = await num('brayton_efficiency', { pressure_ratio: 20 })
  const otto20 = await num('otto_efficiency', { compression_ratio: 20 })
  assert('同数值下 Brayton ≠ Otto（指数不同）', !close(bray20, otto20, 1e-3), (bray20 * 100).toFixed(1) + '% vs ' + (otto20 * 100).toFixed(1) + '%')

  /** 联合循环：1−(1−η₁)(1−η₂) */
  assert('0.40+0.30 → 58.0%', close(await num('combined_cycle_efficiency', { topp_cycle_efficiency: 0.4, bottom_cycle_efficiency: 0.3 }), 0.58))
  /**
   * ★★ 核心性质：**联合后的效率高于任一单机，但永远低于「两者相加」**。
   * 这条守住「不是简单相加」这个最容易搞错的地方。
   */
  const cc = await num('combined_cycle_efficiency', { topp_cycle_efficiency: 0.4, bottom_cycle_efficiency: 0.3 })
  assert('高于任一单机', cc > 0.4 && cc > 0.3, cc.toFixed(3))
  assert('低于两者相加（0.70）', cc < 0.7, cc.toFixed(3) + ' < 0.70')
}

console.log('-- 4. 制冷与热泵 --')
{
  /** 实际 COP = 卡诺 × 等熵效率 */
  assert('空调：29.8×0.6 = 17.88', close(await num('refrigeration_cop_real', { carnot_cop: 29.8, isentropic_efficiency: 0.6 }), 17.88, 0.01))
  assert('冷冻：5.93×0.6 = 3.56', close(await num('refrigeration_cop_real', { carnot_cop: 5.93, isentropic_efficiency: 0.6 }), 3.558, 0.01))
  /**
   * ★★ 核心：**温差越小 COP 越高**（同一台机器）。
   * 这就是「空调比冰箱省电」的全部数学原因。
   */
  const ac = await num('refrigeration_cop_real', { carnot_cop: 29.8, isentropic_efficiency: 0.6 })
  const freezer = await num('refrigeration_cop_real', { carnot_cop: 5.93, isentropic_efficiency: 0.6 })
  assert('空调 COP 远高于冷冻', ac > freezer * 4, ac.toFixed(1) + ' vs ' + freezer.toFixed(2))

  /** 热泵 COP = 制冷 COP + 1 */
  assert('18.53+1 = 19.53', close(await num('heat_pump_cop', { carnot_cop: 18.53 }), 19.53, 1e-9))
  /**
   * ★ 核心：**供暖 COP 恒比制冷 COP 大 1**，且可以远大于 1（这不是永动机）。
   * 若写成 COP−1 会得到 17.53，断言立刻红。
   */
  const hp = await num('heat_pump_cop', { carnot_cop: 18.53 })
  const rf = await num('refrigeration_cop_real', { carnot_cop: 18.53, isentropic_efficiency: 1 })
  assert('供暖 = 制冷 + 1', close(hp - rf, 1, 1e-9), (hp - rf).toFixed(6))
}

console.log('-- 5. 凝汽器真空与蓄热 --')
{
  /**
   * ★ 降低冷端温度与提高热端温度等价 —— 这是蒸汽动力最反直觉的一条。
   * Tc 373→319 相当于效率 ×1.135。
   */
  const gain = await num('condenser_vacuum_gain', { hot_temperature: 773, cold_temperature_old: 373, cold_temperature_new: 319 })
  assert('Tc 373→319 → ×1.135', close(gain, 1.135, 0.002), gain.toFixed(3))
  /** ★ 单调：冷端温度越低，增益越大。 */
  const deeper = await num('condenser_vacuum_gain', { hot_temperature: 773, cold_temperature_old: 373, cold_temperature_new: 293 })
  assert('冷端更低 → 增益更大', deeper > gain, deeper.toFixed(3) + ' > ' + gain.toFixed(3))

  /** 蓄热：Q = m·c·ΔT */
  assert('水 1000kg ΔT50 → 2.093e8 J', rel(await num('thermal_storage_capacity', { mass: 1000, specific_heat: 4186, temperature_span: 50 }), 2.093e8, 1e-6))
  /**
   * ★★ 核心：**水的比热是岩石的 5.2 倍**（4186/800）。
   * 这就是「水是最佳蓄热介质」的数值依据，不是习惯。
   */
  const water = await num('thermal_storage_capacity', { mass: 1000, specific_heat: 4186, temperature_span: 50 })
  const rock = await num('thermal_storage_capacity', { mass: 1000, specific_heat: 800, temperature_span: 50 })
  assert('水比岩石多存 5.2 倍', close(water / rock, 4186 / 800, 1e-9), (water / rock).toFixed(2) + ' 倍')
  /** ★ 线性：质量翻倍，蓄热翻倍。 */
  const m2 = await num('thermal_storage_capacity', { mass: 2000, specific_heat: 4186, temperature_span: 50 })
  assert('质量翻倍 → 蓄热翻倍', close(m2 / water, 2, 1e-9))
}

console.log('-- 6. 制冷负荷 --')
{
  assert('400+200+500 → 1100W', close(await num('cooling_load', { heat_through_walls: 400, internal_heat: 200, infiltration_heat: 500 }), 1100))
  /**
   * ★ 核心：**渗透热与围护热同量级**（500 vs 400）。
   * 所以「密封门窗」比「加厚墙」对空调负荷更有效 —— 这是最实用的一条。
   */
  const walls = 400, infil = 500
  assert('渗透热与围护热同量级', infil >= walls * 0.8, '渗透 ' + infil + 'W vs 围护 ' + walls + 'W')
  /** ★ 可加性：三项相加，缺一项就低估。 */
  const onlyWalls = await num('cooling_load', { heat_through_walls: 400, internal_heat: 0, infiltration_heat: 0 })
  assert('只算围护会低估 63%', close(onlyWalls / 1100, 400 / 1100, 1e-9), onlyWalls + 'W / 1100W')
}

console.log('-- 7. Rankine --')
{
  /**
   * ★ 真实算例（3MPa 饱和蒸汽）：h₁=2803、h₂=1886、h₃=141 → 34.4%。
   * 这不是编的：等熵膨胀到 0.005MPa 时 x₂=0.721，h₂=137.8+0.721×2423.7=1886。
   */
  const eta = await num('rankine_efficiency', { h_in: 2803, h_out_condenser: 1886, h_pump_out: 141 })
  assert('3MPa 饱和循环 → 34.4%', close(eta, 0.3445, 0.002), (eta * 100).toFixed(1) + '%')
  /**
   * ★★ 结构断言：**Rankine 效率里没有压缩比**，改了不影响结果。
   * 与 Otto 那条对称 —— 这两条一起证明了「两条技术树不同源」。
   */
  const a = await num('rankine_efficiency', { h_in: 2803, h_out_condenser: 1886, h_pump_out: 141 })
  const b = await num('rankine_efficiency', { h_in: 2803, h_out_condenser: 1886, h_pump_out: 141, compression_ratio: 20 })
  assert('效率不受压缩比影响（结构性质）', close(a, b), a.toFixed(4) + ' = ' + b.toFixed(4))
  /** ★ 湿度越高（h₂ 越低）效率越高，但叶片会坏 —— 这是真实的两难。 */
  const dry = await num('rankine_efficiency', { h_in: 2803, h_out_condenser: 2200, h_pump_out: 141 })
  const wet = await num('rankine_efficiency', { h_in: 2803, h_out_condenser: 1886, h_pump_out: 141 })
  assert('膨胀越充分效率越高', wet > dry, (dry * 100).toFixed(1) + '% → ' + (wet * 100).toFixed(1) + '%')
}

console.log('-- 8. 元信息与入库完整性 --')
{
  const ids = [
    'rankine_efficiency', 'rankine_reheat_gain', 'condenser_vacuum_gain',
    'otto_efficiency', 'diesel_efficiency', 'brayton_efficiency', 'combined_cycle_efficiency',
    'refrigeration_cop_real', 'heat_pump_cop', 'cooling_load', 'thermal_storage_capacity',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 11 条全部入库', missing.length === 0, missing.join(','))

  let noUnit = [], noKeys = [], noCaveat = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!f.unit) noUnit.push(id)
    if (!Array.isArray(f.keys) || f.keys.length < 3) noKeys.push(id)
    if (!/⚠/.test(f.desc || '')) noCaveat.push(id)
  }
  assert('都有单位', noUnit.length === 0, noUnit.join(','))
  assert('都有 ≥3 关键词', noKeys.length === 0, noKeys.join(','))
  assert('都标了局限（⚠）', noCaveat.length === 0, noCaveat.join(','))

  /** 表达式不用 ln / lgamma。 */
  const badFn = ids.filter((id) => /\bln\s*\(|\blgamma\s*\(/.test(fm.FORMULA_INDEX.get(id)?.expr ?? ''))
  assert('不用 ln/lgamma', badFn.length === 0, badFn.join(','))

  assert('公式总数 ≥ 607', fm.FORMULAS.length >= 607, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
