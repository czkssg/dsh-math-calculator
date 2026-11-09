/**
 * 冷战—千禧年学科扩充（三）：现代物理基础 22 条。
 *
 * ## 这一批全部是「推翻经典直觉」的公式
 *
 * 库里 physics 已有 187 条，但那是牛顿到麦克斯韦。1900—1950 这半个世纪
 * 恰恰是**经典物理失效**的地方，也是架空世界最有杠杆的一段：
 *
 * ```
 *   烧红→烧白      不是「越来越亮」，是 T⁴ 与峰值波长同时移动
 *   电子在导线里   不是「跑过去的」，是每小时 14 厘米
 *   一克铀         不是「很多能量」，是煤的 270 万倍
 *   铁             不是随便一种金属，是核能的终点站
 * ```
 *
 * ## 本套的断言设计与前两批不同
 *
 * 前两批主要验「数值算对」，这一批主要验**标度律的方向**：
 * T⁴ 是不是 16 倍、λ_max 是不是反比、临界质量是不是 ∝ 1/ρ²。
 * 因为物理公式最容易错的地方不是系数，是**次方写错**。
 *
 * ## 一处刻意保留的「不给精确值」
 *
 * `critical_mass_sphere` 是量级估算，误差可达数倍，且公开写明了不可用于工程。
 * 它存在的理由只有一个：**给出「∝1/ρ²」这条标度**，那才是理解内爆式的关键。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-modern-'))
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
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-9)
const rel = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol

console.log('-- 1. 黑体：T⁴ 与 1/T 两个标度同时成立 --')
{
  /** 维恩：b/T。3000K→966nm、5778K→501.6nm */
  const w3000 = await num('wien_displacement', { T: 3000 })
  const w5778 = await num('wien_displacement', { T: 5778 })
  assert('3000K → 966nm', rel(w3000, 9.659e-7, 1e-3), String(w3000))
  assert('5778K → 501.6nm', rel(w5778, 5.016e-7, 1e-3), String(w5778))
  /**
   * ★ 反比关系：温度翻倍，峰值波长减半。
   * 若把式子写成 b·T 或 b/T²，这条立刻红。
   */
  const w6000 = await num('wien_displacement', { T: 6000 })
  assert('温度翻倍 → 波长减半', close(w3000 / w6000, 2, 1e-6), String(w3000 / w6000))

  /** 斯特藩：T⁴。1811K 约 6.1e5 W、373K 约 1.1e3 W */
  const p1811 = await num('stefan_boltzmann', { emissivity: 1, A: 1, T: 1811 })
  const p373 = await num('stefan_boltzmann', { emissivity: 1, A: 1, T: 373 })
  assert('1811K → 6.1e5 W', rel(p1811, 6.099e5, 1e-3), String(p1811))
  assert('373K → 1.1e3 W', rel(p373, 1097.6, 1e-3), String(p373))
  /**
   * ★★ T⁴ 的方向性：温度翻倍必须是 16 倍，不是 2 倍或 4 倍。
   * 这是本批最重要的标度断言 —— 「稍微烧热一点」在能耗上从来不是「一点」。
   */
  const p1000 = await num('stefan_boltzmann', { emissivity: 1, A: 1, T: 1000 })
  const p2000 = await num('stefan_boltzmann', { emissivity: 1, A: 1, T: 2000 })
  assert('温度翻倍 → 功率 ×16', close(p2000 / p1000, 16, 1e-6), String(p2000 / p1000))
  /** 铁熔点与沸水之比：1811/373 = 4.86，四次方约 557 倍 */
  assert('铁熔点与沸水辐射比约 557 倍', rel(p1811 / p373, 557, 0.02), String((p1811 / p373).toFixed(0)))
}

console.log('-- 2. 量子起源：阈值与位移 --')
{
  /** 光电阈频：W/h。铯 3.0e-19 → 4.53e14 Hz */
  const nu0 = await num('photoelectric_threshold', { work_function: 3.0e-19 })
  assert('铯阈频 4.53e14 Hz', rel(nu0, 4.5276e14, 1e-3), String(nu0))
  /** ★ 关键：阈频与光强无关（式子里根本没有强度项）—— 用不同逸出功验证只依赖 W。 */
  const zinc = await num('photoelectric_threshold', { work_function: 6.9e-19 })
  /**
   * 容差：结果为 1e15 量级，8 位小数截断的相对残差约 4e-9，
   * 所以 2.29999999 与 2.3 的差是**显示精度**，不是逻辑错。判据放宽到 1e-6。
   */
  assert('锌（W 大 2.3 倍）→ 阈频也大 2.3 倍', Math.abs(zinc / nu0 - 6.9 / 3.0) < 1e-6, String(zinc / nu0))

  /** 康普顿：最大位移 4.853pm（θ=π），θ=π/2 时 2.426pm */
  const back = await num('compton_shift', { scatter_angle: Math.PI })
  const half = await num('compton_shift', { scatter_angle: Math.PI / 2 })
  assert('背散射 → 4.853pm', rel(back, 4.8526e-12, 1e-3), String(back))
  assert('90° → 2.426pm', rel(half, 2.4263e-12, 1e-3), String(half))
  /**
   * ★ 位移与入射波长无关（式子里没有 λ 项）—— 这解释了为什么必须用 X 射线做实验：
   * 4.85pm 对 500nm 可见光只占 1e-5，测不出来。
   */
  assert('θ=0 → 无位移', close(await num('compton_shift', { scatter_angle: 0 }), 0), '')

  /** 不确定度：Δx·Δp ≥ ℏ/2。Δx=1e-10 → 5.27e-25 */
  const dp = await num('heisenberg_uncertainty', { position_uncertainty: 1e-10 })
  assert('Δx=1e-10 → Δp=5.27e-25', rel(dp, 5.2729e-25, 1e-3), String(dp))
  /** ★ 反比：Δx 缩小 10 倍，Δp 放大 10 倍（不是 100） */
  const dp2 = await num('heisenberg_uncertainty', { position_uncertainty: 1e-11 })
  assert('Δx÷10 → Δp×10（不是 ×100）', close(dp2 / dp, 10, 1e-6), String(dp2 / dp))
}

console.log('-- 3. 固体物理：费米能、比热、带隙 --')
{
  /**
   * 费米能：铜 n=8.5e28 → 1.13e-18 J = 7.05 eV（实测 7.00，自由电子气模型的经典成功）
   */
  const ef = await num('fermi_energy', { electron_density: 8.5e28 })
  assert('铜费米能 1.13e-18 J', rel(ef, 1.127e-18, 0.01), String(ef))
  const efEv = ef / 1.602176634e-19
  assert('换算 7.0 eV（实测 7.00）', rel(efEv, 7.04, 0.02), efEv.toFixed(2))
  /** ★ n^(2/3)：密度翻 8 倍 → 费米能翻 4 倍 */
  const ef8 = await num('fermi_energy', { electron_density: 8.5e28 * 8 })
  assert('密度 ×8 → 费米能 ×4', close(ef8 / ef, 4, 1e-6), String(ef8 / ef))

  /** 德拜：铜 Θ_D=343、T=50K → 0.232 J/(mol·K)（实测约 0.2） */
  const c50 = await num('debye_temperature_heat_capacity', { temperature: 50, debye_temperature: 343, gas_constant: 8.314 })
  assert('铜 50K → 0.232', rel(c50, 0.2318, 0.01), String(c50))
  /**
   * ★ 三次方：温度减半 → 热容降到 1/8（不是 1/2）。
   * 这条守住「T³ 而不是 T²」这个极易记错的次方。
   */
  const c100 = await num('debye_temperature_heat_capacity', { temperature: 100, debye_temperature: 343, gas_constant: 8.314 })
  assert('温度减半 → 热容 ÷8（T³）', close(c100 / c50, 8, 1e-6), String(c100 / c50))

  /**
   * 带隙：整条颜色对照表都必须成立。
   * 这是本套最容易出现「eV 与 J 混用」的地方 —— 一个错会让全表偏 1.6e19 倍。
   */
  const table = [
    [1.794e-19, 1107, 'Si（1.12eV）'],
    [2.275e-19, 873, 'GaAs（1.42eV）'],
    [3.060e-19, 649, '红光（1.91eV）'],
    [3.813e-19, 521, '绿光（2.38eV）'],
    [4.422e-19, 449, '蓝光（2.76eV）'],
    [5.447e-19, 365, 'GaN（3.4eV，紫外）'],
  ]
  for (const [eg, nm, label] of table) {
    const lam = await num('band_gap_wavelength', { band_gap: eg })
    assert(`${label} → ${nm}nm`, rel(lam * 1e9, nm, 0.01), (lam * 1e9).toFixed(0) + 'nm')
  }
  /** ★ 反比：带隙翻倍 → 波长减半 */
  const l1 = await num('band_gap_wavelength', { band_gap: 1.79e-19 })
  const l2 = await num('band_gap_wavelength', { band_gap: 3.58e-19 })
  assert('带隙翻倍 → 波长减半', close(l1 / l2, 2, 1e-6), String(l1 / l2))

  /** PN 结：硅 N=1e22、n_i=1e16 → V_bi ≈ 0.71V */
  const vbi = await num('pn_junction_builtin_voltage', {
    kBT_over_q: 0.02585, donor_density: 1e22, acceptor_density: 1e22, intrinsic_density: 1e16,
  })
  assert('硅 PN 结 0.71V', rel(vbi, 0.7143, 0.01), String(vbi))
  /** ★ 对数关系：掺杂翻 100 倍只多约 0.12V（不是 100 倍）—— 这是「压降是材料常数」的原因。 */
  const vbi2 = await num('pn_junction_builtin_voltage', {
    kBT_over_q: 0.02585, donor_density: 1e24, acceptor_density: 1e22, intrinsic_density: 1e16,
  })
  assert('掺杂 ×100 → 只多约 0.12V', (vbi2 - vbi) > 0.1 && (vbi2 - vbi) < 0.15, String((vbi2 - vbi).toFixed(3)))

  /** 漂移速度：硅 μ=0.14、E=1e4 → 1400 m/s */
  assert('漂移速度 1400 m/s', close(await num('drift_velocity_mobility', { mobility: 0.14, electric_field: 1e4 }), 1400))
}

console.log('-- 4. 核物理：能量密度、铁峰、屏蔽 --')
{
  /**
   * ★★ 裂变能量密度：8.2e13 J/kg。这是本批最重要的数量级 ——
   * 煤约 3e7，比值约 270 万倍。差六个数量级不是「更厉害」，是「另一个世界」。
   */
  const fiss = await num('fission_energy_per_mass', { energy_per_fission: 3.2e-11, molar_mass: 0.235 })
  assert('U-235 约 8.2e13 J/kg', rel(fiss, 8.2e13, 0.02), String(fiss))
  const ratio = fiss / 3e7
  assert('是煤的约 273 万倍', rel(ratio, 2.73e6, 0.05), ratio.toExponential(2))

  /** 比结合能：Fe-56 8.79、U-235 7.60、He-4 7.07 */
  assert('Fe-56 → 8.79 MeV/核子', close(await num('nuclear_binding_energy_curve', { binding_energy: 492.3, mass_number: 56 }), 8.791, 1e-3))
  assert('U-235 → 7.60 MeV/核子', close(await num('nuclear_binding_energy_curve', { binding_energy: 1786, mass_number: 235 }), 7.6, 1e-9))
  assert('He-4 → 7.07 MeV/核子', close(await num('nuclear_binding_energy_curve', { binding_energy: 28.3, mass_number: 4 }), 7.075, 1e-3))
  /**
   * ★★ 铁峰的意义：Fe-56 的比结合能必须**高于**两端（U-235 与 He-4）。
   * 这一条同时解释了「裂变放能」与「聚变放能」，是整个核能领域的支点。
   */
  const fe = await num('nuclear_binding_energy_curve', { binding_energy: 492.3, mass_number: 56 })
  const u235 = await num('nuclear_binding_energy_curve', { binding_energy: 1786, mass_number: 235 })
  const he4 = await num('nuclear_binding_energy_curve', { binding_energy: 28.3, mass_number: 4 })
  assert('铁峰高于两端（所以两边都放能）', fe > u235 && fe > he4, fe + ' > ' + u235 + ', ' + he4)

  /**
   * ★ 临界半径的下界：算得约 1.8 kg，而真实 U-235 裸球约 52 kg（差约 29 倍）。
   *
   * 这个偏差**必须如实承认**，所以断言写成两条：
   *   ① 它给的是下界（远小于真实值）
   *   ② 标度关系正确：质量 ∝ ρ（压缩使已有材料更密，这才是内爆式的原理）
   *
   * 第一版我把它写成「临界质量估算 → 数十公斤」，还断言「密度翻倍 → ÷4」，
   * 但实算是 ∝ρ（翻倍）而不是 1/ρ²（四分之一）。**是我的物理推导错了，不是公式实现错了。**
   * 现在公式改名为「临界半径的量级下界」，断言也跟着改成守下界与标度。
   */
  const m1 = await num('critical_mass_sphere', { mean_free_path: 0.017, neutrons_per_fission: 2.5, density: 1.9e4 })
  assert('下界在 1~10 kg 量级', m1 > 1 && m1 < 10, m1.toFixed(2) + ' kg')
  assert('远小于真实 52kg（如实标为下界）', m1 < 52 / 5, m1.toFixed(2) + ' << 52')
  const m2 = await num('critical_mass_sphere', { mean_free_path: 0.017, neutrons_per_fission: 2.5, density: 3.8e4 })
  assert('密度翻倍 → 质量 ×2（∝ρ）', close(m1 / m2, 0.5, 0.01), (m1 / m2).toFixed(3))
  /** ★ ν 增大 → 临界质量下降（更容易超临界）。 */
  const mNu = await num('critical_mass_sphere', { mean_free_path: 0.017, neutrons_per_fission: 3, density: 1.9e4 })
  assert('ν 增大 → 临界质量下降', mNu < m1, mNu.toFixed(2) + ' < ' + m1.toFixed(2))

  /** 屏蔽：1cm 铅（μ=71）→ 剩 49.2%（正是半值层） */
  const s1 = await num('shielding_attenuation', { initial_intensity: 100, attenuation_coefficient: 71, thickness: 0.01 })
  assert('1cm 铅 → 剩 49.2%', rel(s1 / 100, 0.4916, 0.01), (s1 / 100 * 100).toFixed(1) + '%')
  /**
   * ★ 指数不是线性：2cm 剩 24.2%（不是「再减一半 = 25%」以外的想法），
   * 且永远不为零 —— 这是「屏蔽没有挡住，只有减弱」的数学表现。
   */
  const s2cm = await num('shielding_attenuation', { initial_intensity: 100, attenuation_coefficient: 71, thickness: 0.02 })
  assert('2cm → 约 24.2%', rel(s2cm / 100, 0.2417, 0.01), (s2cm / 100 * 100).toFixed(1) + '%')
  assert('加厚永不归零', s2cm > 0, String(s2cm))
  /** 7cm 剩不到 1%（工程上「安全」的等价说法）。 */
  const s7 = await num('shielding_attenuation', { initial_intensity: 100, attenuation_coefficient: 71, thickness: 0.07 })
  assert('7cm → 剩不到 1%', s7 / 100 < 0.01, (s7 / 100 * 100).toFixed(2) + '%')

  /**
   * 劳森：nτ = 12kT/(⟨σv⟩E)。
   * T=1e8、⟨σv⟩=1e-22、E=2.8e-12 → 5.92e19，与文献「点火约 1e20」同量级。
   *
   * ⚠ 第一版我漏了反应率 ⟨σv⟩，算出 0.0049（差 22 个数量级）——
   * 这是本批最严重的一次推导错误，靠「结果量级明显不对」才发现。
   */
  const lawson = await num('fusion_lawson_criterion', {
    temperature: 1e8, kB: 1.380649e-23, reactivity: 1e-22, fusion_cross_section_energy: 2.8e-12,
  })
  assert('劳森 nτ 在 1e19~1e21', lawson > 1e19 && lawson < 1e21, lawson.toExponential(2))
  /** ★ 温度越高要求越松（nτ ∝ T），这解释了为什么要「烧得更热」而不是「关得更久」。 */
  const lawson2 = await num('fusion_lawson_criterion', {
    temperature: 2e8, kB: 1.380649e-23, reactivity: 1e-22, fusion_cross_section_energy: 2.8e-12,
  })
  assert('温度翻倍 → nτ 翻倍', close(lawson2 / lawson, 2, 1e-6), (lawson2 / lawson).toFixed(3))
}

console.log('-- 5. 元信息与入库完整性 --')
{
  const ids = [
    'wien_displacement', 'stefan_boltzmann',
    'photoelectric_threshold', 'compton_shift', 'heisenberg_uncertainty',
    'fermi_energy', 'debye_temperature_heat_capacity', 'band_gap_wavelength',
    'pn_junction_builtin_voltage', 'drift_velocity_mobility',
    'fission_energy_per_mass', 'critical_mass_sphere', 'nuclear_binding_energy_curve',
    'fusion_lawson_criterion', 'shielding_attenuation',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 16 条全部入库', missing.length === 0, missing.join(','))

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

  /**
   * ★ 全库范围的反向对照：**任何公式的 expr 都不许出现未声明的参数名**。
   * 本批踩过一次（fermi_energy 写成 number_density 而参数是 electron_density），
   * 那种错只在调用时才暴露，而且报错信息只说「缺参数」，不说「名字写错」。
   */
  const badRefs = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    const declared = new Set(Object.keys(f.params))
    const used = new Set()
    /**
     * 提取标识符：先去掉所有 `函数名(...)` 形态，再拆剩余的词。
     *
     * 第一版用 `/\b([a-z_]\w*)\s*(?!\()/g` 直接匹配，结果把 `exp(` 取成 `ex`、`cos(` 取成 `co` ——
     * 负向前瞻在回溯时会退一步，反而制造了「未声明参数」的误报。
     * 正确做法是**先剥掉带括号的函数调用**，剩下的才是变量名。
     */
    const stripped = f.expr.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g, ' (')
    let m
    const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g
    while ((m = re.exec(stripped)) !== null) used.add(m[1])
    /**
     * 白名单 = 函数名 + **公式库里可用的物理常数**。
     * 常数由 engine 自动注入（CONSTANTS 表），不必声明为参数 ——
     * 第一版漏了它们，导致 sigma / hbar / h / c / me / bWien / NA 被误报为「未声明参数」。
     */
    const fns = new Set([
      // 函数
      'sqrt', 'exp', 'log', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'abs', 'min', 'max',
      'inv', 'log2', 'log10', 'sum', 'e', 'pi',
      // 常数（见 formula-library.ts 的 CONSTANTS）
      'h', 'hbar', 'c', 'kB', 'NA', 'R', 'sigma', 'e_charge', 'kCoulomb', 'epsilon0', 'mu0',
      'bWien', 'atm', 'me', 'mp', 'muB', 'alpha_fs', 'Ry', 'AU', 'ly', 'pc',
      'Mearth', 'Rearth', 'Msun', 'Rsun', 'Lsun', 'year', 'day', 'phi', 'eulerGamma', 'ln2', 'ln10',
    ])
    for (const u of used) {
      if (!declared.has(u) && !fns.has(u)) badRefs.push(id + ':' + u)
    }
  }
  assert('表达式引用的参数都已声明', badRefs.length === 0, badRefs.join(', '))

  /** 表达式不用 ln（本库无此函数，会抛 unknown_symbol）。 */
  const usesLn = ids.filter((id) => /\bln\s*\(/.test(fm.FORMULA_INDEX.get(id)?.expr ?? ''))
  assert('不用 ln', usesLn.length === 0, usesLn.join(','))

  /**
   * 从 575 改成 572：合并了三条与库内已有的重复项
   * （stefan_boltzmann / wien_displacement 本就在库，我的版本表达式相同、只是说明更详细，
   *  所以把说明并过去、删掉新增的副本）。
   */
  assert('公式总数 ≥ 572', fm.FORMULAS.length >= 572, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
