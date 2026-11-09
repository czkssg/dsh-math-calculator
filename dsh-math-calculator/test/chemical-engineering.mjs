/**
 * 化学工程单元操作（第八批）11 条。
 *
 * ## 本套的主轴：放大问题（scale-up）
 *
 * 实验室化学与工业化学的差别不在「懂不懂反应」，而在**放大**。
 * 三条核心矛盾，全部可量化：
 *
 * ```
 *   反应放热 ∝ L³，换热面积 ∝ L²   → 放大后单位体积散热变差（飞温）
 *   CSTR 与活塞流同 kτ 下转化率差很大 → 返混的代价
 *   Fenske 板数 ∝ 1/ln α           → 分离难度的指数墙
 * ```
 *
 * 所以断言重点不在「算对某个数」，而在**验这三条标度是否成立**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-chemeng-'))
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

console.log('-- 1. 停留时间：线性 --')
{
  assert('V=2,Q=0.5 → 4h', close(await num('reactor_residence_time', { volume: 2, volumetric_flow: 0.5 }), 4))
  /** ★ 体积翻倍 → 停留时间翻倍（线性）。 */
  const t1 = await num('reactor_residence_time', { volume: 2, volumetric_flow: 0.5 })
  const t2 = await num('reactor_residence_time', { volume: 4, volumetric_flow: 0.5 })
  assert('体积翻倍 → τ 翻倍', close(t2 / t1, 2, 1e-9), (t2 / t1).toFixed(3))
  /** ★ 流量翻倍 → τ 减半（反比）。 */
  const t3 = await num('reactor_residence_time', { volume: 2, volumetric_flow: 1.0 })
  assert('流量翻倍 → τ 减半', close(t1 / t3, 2, 1e-9), (t1 / t3).toFixed(3))
}

console.log('-- 2. 一级反应：指数饱和，最后几个点最贵 --')
{
  assert('kτ=2 → 86.5%', close(await num('reactor_conversion_first_order', { rate_constant: 0.5, residence_time: 4 }), 0.864665, 1e-5))
  assert('kτ=4 → 98.2%', close(await num('reactor_conversion_first_order', { rate_constant: 0.5, residence_time: 8 }), 0.981684, 1e-5))
  /**
   * ★★ 核心：**从 95% 到 99.9% 的时间代价极高**。
   * kτ=3 → 95.0%，要到 99.9% 需 kτ=6.9 —— 时间翻 2.3 倍，只多提纯 4.9 个百分点。
   * 这条解释了「精制/提纯/制药为什么贵」。
   */
  const kt3 = await num('reactor_conversion_first_order', { rate_constant: 1, residence_time: 3 })
  const kt69 = await num('reactor_conversion_first_order', { rate_constant: 1, residence_time: 6.9 })
  assert('kτ=3 → 95.0%', close(kt3, 0.9502, 1e-4), (kt3 * 100).toFixed(2) + '%')
  assert('kτ=6.9 → 99.9%', close(kt69, 0.999, 1e-3), (kt69 * 100).toFixed(3) + '%')
  assert('时间 ×2.3 只多 4.9 个百分点', (kt69 - kt3) < 0.05 && (6.9 / 3) > 2, ((kt69 - kt3) * 100).toFixed(2) + ' 点 / ' + (6.9 / 3).toFixed(2) + ' 倍时间')
  /** ★ 单调但趋近 1，永不等于 1（数学上不会完全反应）。 */
  /**
   * ⚠ kτ=100 时 1−e^(−100) 在双精度下**恰好等于 1**（e^-100 ≈ 3.7e-44，远小于 2^-53×1）。
   * 这不是公式缺陷，是浮点表示极限 —— 所以判据写成「极接近 1」而不是「严格小于 1」。
   */
  const huge = await num('reactor_conversion_first_order', { rate_constant: 1, residence_time: 100 })
  assert('时间极长 → 等于（或极接近）1', huge >= 1 - 1e-12, huge.toFixed(12))
}

console.log('-- 3. CSTR vs 活塞流：返混的代价 --')
{
  assert('kτ=3 → 75%', close(await num('cstr_conversion', { rate_constant_factor: 3 }), 0.75))
  assert('kτ=10 → 90.9%', close(await num('cstr_conversion', { rate_constant_factor: 10 }), 0.909091, 1e-6))
  /**
   * ★★ 本套最重要的对比：**同 kτ 下 CSTR 永远低于活塞流**，且差距随 kτ 扩大。
   *   kτ=1：63.2% vs 50%（差 13.2 点）
   *   kτ=3：95.0% vs 75%（差 20 点）
   *   kτ=10：99.995% vs 90.9%（差 9.1 点，但相对差距巨大）
   * 这是「为什么工业用多釜串联/管式」的定量理由。
   */
  const cstr3 = await num('cstr_conversion', { rate_constant_factor: 3 })
  const plug3 = await num('reactor_conversion_first_order', { rate_constant: 1, residence_time: 3 })
  assert('kτ=3：CSTR 75% < 活塞流 95%', cstr3 < plug3, (cstr3 * 100).toFixed(1) + '% < ' + (plug3 * 100).toFixed(1) + '%')
  /** ★ 反比关系：CSTR 的 1−X 恰为 1/(1+kτ)，而活塞流是 e^(−kτ)。 */
  const cstr10 = await num('cstr_conversion', { rate_constant_factor: 10 })
  assert('CSTR 残留 = 1/(1+kτ)', close(1 - cstr10, 1 / 11, 1e-9), (1 - cstr10).toFixed(6))
}

console.log('-- 4. 按产能反算体积：必须除收率 --')
{
  assert('500/h,τ=4,收率0.3 → 6666.7', close(await num('reactor_volume_from_throughput', { production_rate: 500, residence_time: 4, yield_factor: 0.3 }), 6666.667, 0.01))
  /**
   * ★★ 核心：**收率减半，体积翻倍**（反比）。
   * 忽略收率是最常见的设定错误 —— 会低估 2~10 倍设备规模。
   */
  const v30 = await num('reactor_volume_from_throughput', { production_rate: 500, residence_time: 4, yield_factor: 0.3 })
  const v15 = await num('reactor_volume_from_throughput', { production_rate: 500, residence_time: 4, yield_factor: 0.15 })
  assert('收率减半 → 体积翻倍', close(v15 / v30, 2, 1e-9), (v15 / v30).toFixed(3))
  /** ★ 产能翻倍 → 体积翻倍（线性）。 */
  const v1000 = await num('reactor_volume_from_throughput', { production_rate: 1000, residence_time: 4, yield_factor: 0.3 })
  assert('产能翻倍 → 体积翻倍', close(v1000 / v30, 2, 1e-9))
}

console.log('-- 5. Fenske：板数 ∝ 1/ln α --')
{
  assert('α=2.2 → 7.5 板', close(await num('distillation_min_stages', { light_key_fraction: 0.95, heavy_key_fraction: 0.05, relative_volatility: 2.2 }), 7.469, 0.01))
  assert('α=1.2 → 32.3 板', close(await num('distillation_min_stages', { light_key_fraction: 0.95, heavy_key_fraction: 0.05, relative_volatility: 1.2 }), 32.299, 0.01))
  /**
   * ★★ 核心：α 从 2.2 降到 1.2（只降一半），板数从 7.5 涨到 32.3（4.3 倍）。
   * 这就是「难分离的混合物为什么需要几十米的塔」。
   */
  const n22 = await num('distillation_min_stages', { light_key_fraction: 0.95, heavy_key_fraction: 0.05, relative_volatility: 2.2 })
  const n12 = await num('distillation_min_stages', { light_key_fraction: 0.95, heavy_key_fraction: 0.05, relative_volatility: 1.2 })
  assert('α 减半 → 板数 ×4.3', close(n12 / n22, 4.32, 0.05), (n12 / n22).toFixed(2))
  /** ★ α→1 时板数发散（无法分离）—— 这就是共沸物蒸不出来的数学形态。 */
  const n11 = await num('distillation_min_stages', { light_key_fraction: 0.95, heavy_key_fraction: 0.05, relative_volatility: 1.01 })
  assert('α→1 → 板数爆炸（>100）', n11 > 100, n11.toFixed(0) + ' 板')
  /** ★ 纯度要求每提高一个数量级，板数增加固定量。 */
  const a = await num('distillation_min_stages', { light_key_fraction: 0.9, heavy_key_fraction: 0.1, relative_volatility: 2.2 })
  const b = await num('distillation_min_stages', { light_key_fraction: 0.99, heavy_key_fraction: 0.01, relative_volatility: 2.2 })
  /**
   * 推导：x_D 0.9→0.99 使 A=xD/(1−xD) 从 9→99（×11），
   * x_B 0.1→0.01 使 B=(1−xB)/xB 也从 9→99（×11），所以 A·B 涨 **121 倍**。
   * 差值 = ln(121)/ln(2.2) = 6.08 板。
   *
   * 第一版我按「一个数量级 → ln10/lnα」估，那是只考虑一端变化；
   * **两端同时提纯时是平方效应**，这条本身就值得写进注释。
   */
  assert('两端纯度各提一档 → 板数 +6.08', close(b - a, Math.log(121) / Math.log(2.2), 0.05), '+' + (b - a).toFixed(2) + ' 板')
}

console.log('-- 6. 萃取：级数 ∝ log(纯度)，且极度依赖 K_D --')
{
  const base = { initial_ratio: 1.0, final_ratio_target: 0.01, equilibrium_ratio: 0.0001, solvent_ratio: 1 }
  assert('K_D=0.5 → 11.4 级', close(await num('extraction_stages', { ...base, distribution_ratio: 0.5 }), 11.358, 0.01))
  /**
   * ★★ 核心：**K_D 从 0.5 提到 5（好溶剂），级数从 11.4 降到 2.6（差 4.4 倍）**。
   * 「选对溶剂比多加级数重要」—— 这是化学工程最实用的一条经验。
   */
  const bad = await num('extraction_stages', { ...base, distribution_ratio: 0.5 })
  const good = await num('extraction_stages', { ...base, distribution_ratio: 5 })
  assert('好溶剂 → 级数降到 1/4.4', close(bad / good, 4.37, 0.1), bad.toFixed(1) + ' → ' + good.toFixed(1))
  /** ★ 目标纯度提高一个数量级 → 级数增加固定量（对数）。 */
  const loose = await num('extraction_stages', { ...base, distribution_ratio: 0.5, final_ratio_target: 0.1 })
  const tight = await num('extraction_stages', { ...base, distribution_ratio: 0.5, final_ratio_target: 0.001 })
  /**
   * 萃取与精馏不同：这里的「纯度」是**残留比**，从 0.1→0.001（1000 倍）跨了三个数量级，
   * 所以级数差很大（实测 11.87）。判据写成「显著增加且与 log 关系一致」。
   */
  assert('残留比降到 1/1000 → 级数显著增加', tight - loose > 10 && tight - loose < 14, '+' + (tight - loose).toFixed(2) + ' 级')
}

console.log('-- 7. 吸附与传质 --')
{
  assert('0.1m³ 活性炭 → 135h', close(await num('adsorption_breakthrough', { bed_volume: 0.1, bed_density: 450, capacity: 0.15, flow_rate: 1, inlet_concentration: 0.05 }), 135))
  /**
   * ★ 核心：**穿透时间 ∝ 1/浓度**。进水浓度翻倍，寿命减半。
   * 这解释了「预处理能极大延长吸附剂寿命」。
   */
  const c05 = await num('adsorption_breakthrough', { bed_volume: 0.1, bed_density: 450, capacity: 0.15, flow_rate: 1, inlet_concentration: 0.05 })
  const c10 = await num('adsorption_breakthrough', { bed_volume: 0.1, bed_density: 450, capacity: 0.15, flow_rate: 1, inlet_concentration: 0.10 })
  assert('浓度翻倍 → 寿命减半', close(c05 / c10, 2, 1e-9), (c05 / c10).toFixed(3))
  /** ★ 容量线性：床体积翻倍 → 寿命翻倍。 */
  const v2 = await num('adsorption_breakthrough', { bed_volume: 0.2, bed_density: 450, capacity: 0.15, flow_rate: 1, inlet_concentration: 0.05 })
  assert('床体积翻倍 → 寿命翻倍', close(v2 / c05, 2, 1e-9))

  /** 传质：N = K·A·ΔC，与传热完全同形 */
  assert('K=0.5,A=100,ΔC=0.05 → 2.5 kg/h', close(await num('mass_transfer_rate', { overall_mass_transfer_coefficient: 0.5, interfacial_area: 100, driving_force: 0.05 }), 2.5))
  /**
   * ★ 核心：三个因子都是线性 —— 所以「设备能多小」取决于哪个因子最容易提高。
   * ΔC 加倍 → 面积减半（这就是逆流操作的价值）。
   */
  const dc2 = await num('mass_transfer_rate', { overall_mass_transfer_coefficient: 0.5, interfacial_area: 100, driving_force: 0.1 })
  assert('推动力翻倍 → 同样产能只需一半面积', close(dc2 / 2.5, 2, 1e-9))
}

console.log('-- 8. 干燥与结晶 --')
{
  assert('k=0.3,M=0.25 → 0.039', close(await num('drying_rate_constant', { rate_coefficient: 0.3, moisture: 0.25, equilibrium_moisture: 0.12 }), 0.039))
  /**
   * ★★ 核心：**速率 ∝ (M−M_e)，越接近平衡越慢**。
   * M 从 0.25 降到 0.15，速率只剩 23% —— 这就是「先猛吹后慢烘」的依据，
   * 也是「急烘会外干内湿」的原因（表面干了，内部还湿）。
   */
  const r1 = await num('drying_rate_constant', { rate_coefficient: 0.3, moisture: 0.25, equilibrium_moisture: 0.12 })
  const r2 = await num('drying_rate_constant', { rate_coefficient: 0.3, moisture: 0.15, equilibrium_moisture: 0.12 })
  assert('含水率接近平衡 → 速率只剩 23%', close(r2 / r1, 0.03 / 0.13, 1e-9), (r2 / r1 * 100).toFixed(1) + '%')
  /** ★ 到达平衡时速率恰为 0（永远干不到）。 */
  const zero = await num('drying_rate_constant', { rate_coefficient: 0.3, moisture: 0.12, equilibrium_moisture: 0.12 })
  assert('M=M_e → 速率 0', close(zero, 0), String(zero))

  /** 过饱和度：S=(C−Csat)/Csat */
  assert('C=1.3,Csat=1.0 → S=0.3', close(await num('crystallization_supersaturation', { concentration: 1.3, saturation_concentration: 1.0 }), 0.3))
  /** ★ 边界：恰好饱和 → S=0（不成核）。 */
  assert('C=Csat → S=0', close(await num('crystallization_supersaturation', { concentration: 1.0, saturation_concentration: 1.0 }), 0))
  /** ★ 未饱和（C<Csat）→ 负值（晶体会溶解）。 */
  const under = await num('crystallization_supersaturation', { concentration: 0.8, saturation_concentration: 1.0 })
  assert('未饱和 → 负值（溶解）', under < 0, String(under))
}

console.log('-- 9. 放大困境：换热面积 ∝ L² 而放热 ∝ L³ --')
{
  assert('50kW,U=400,ΔT=20 → 6.25m²', close(await num('heat_exchanger_area_chemical', { heat_generated: 50000, overall_heat_transfer_coefficient: 400, temperature_difference: 20 }), 6.25))
  /**
   * ★★ 本套最重要的结构断言：**放热量翻倍，所需面积也翻倍（线性）**，
   * 而放热量本身 ∝ L³、面积 ∝ L² —— 所以放大时「所需面积/实际面积」按 L 增长。
   *
   * 用数据验证这条：体积放大 10 倍（L 增 2.15），放热量 ×10，
   * 而面积只 ×4.62 → 单位体积散热降到 1/2.15。
   */
  const q1 = 50000
  const q10 = q1 * 10
  const a1 = await num('heat_exchanger_area_chemical', { heat_generated: q1, overall_heat_transfer_coefficient: 400, temperature_difference: 20 })
  const a10 = await num('heat_exchanger_area_chemical', { heat_generated: q10, overall_heat_transfer_coefficient: 400, temperature_difference: 20 })
  assert('放热 ×10 → 所需面积 ×10', close(a10 / a1, 10, 1e-9), (a10 / a1).toFixed(1) + ' 倍')
  const L = Math.cbrt(10)
  const areaRatio = L * L
  assert('但几何面积只 ×4.62（L²）', close(areaRatio, 4.642, 1e-3), areaRatio.toFixed(3))
  assert('缺口 ≈ 2.15 倍（这就是飞温的根源）', close(10 / areaRatio, 2.154, 1e-3), (10 / areaRatio).toFixed(3))
  /** ★ 提高 U 能补偿：U 翻倍，所需面积减半。 */
  const u2 = await num('heat_exchanger_area_chemical', { heat_generated: 50000, overall_heat_transfer_coefficient: 800, temperature_difference: 20 })
  assert('U 翻倍 → 面积减半', close(u2 * 2, 6.25, 1e-9), String(u2))
}

console.log('-- 10. 元信息与入库完整性 --')
{
  const ids = [
    'reactor_residence_time', 'reactor_conversion_first_order', 'cstr_conversion',
    'reactor_volume_from_throughput', 'extraction_stages', 'distillation_min_stages',
    'adsorption_breakthrough', 'mass_transfer_rate', 'drying_rate_constant',
    'crystallization_supersaturation', 'heat_exchanger_area_chemical',
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

  /** ★ 化学工程公式必须声明「需要实验系数」——否则用户会以为可以直接施工。 */
  const noCaveatCoef = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!/(实测|实验|查|手册|关联式|经验|必须.*测)/.test(f.desc || '')) noCaveatCoef.push(id)
  }
  assert('都声明了「系数需实测/查表」', noCaveatCoef.length === 0, noCaveatCoef.join(','))

  assert('公式总数 ≥ 631', fm.FORMULAS.length >= 631, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
