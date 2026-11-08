/**
 * 第十三批公式（宏观/财政/材料/生物通用，共 28 条）+ 一处索引缺陷修复。
 *
 * ## 这一批与前几批的关键区别
 *
 * 前几批（工程/生物生态）多是经验式，需要标「这是量级估计」；
 * 这一批以**恒等式与严格推导**为主，所以断言方式也不同：
 *
 * ```
 *   恒等式 → 断言精确相等（98 就是 98）
 *   推导式 → 断言手算值（0.042 就是 0.042）
 *   标度律 → 断言比值而非绝对值（这是抓「次方写反」的唯一办法）
 * ```
 *
 * 为什么比值断言重要：绝对值错了可能只是参数差异，
 * **比值错了说明公式形式本身写错了**（比如把 1/2 写成 2）。
 *
 * ## 顺带修的一个真实缺陷
 *
 * `EM_OPTICAL_NUCLEAR_FORMULAS` 在构建 `FORMULA_INDEX` 时被漏掉，
 * 导致 38 条电学/光学/核公式不在索引里。
 * 后果很隐蔽：**单独调用能用**（`opFormula` 走的是 FORMULAS 数组），
 * **但写进 pipeline/bridge 就说找不到** —— 换个入口就不一样。
 * 这类缺陷最难发现，所以本套也守它。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-f13-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const formulasMod = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) pass++
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 调用一条公式，返回数值（失败返回 NaN）。 */
async function num(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果: (-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-9);

console.log('-- 1. 宏观恒等式（断言精确相等）--')
{
  /**
   * 支出法 GDP 是**会计恒等式**：所有产出都被某人用掉了。
   * 算术上必须精确 —— 60+25+15+10−12 = 98，没有近似余地。
   */
  assert('GDP 恒等式 98', (await num('gdp_expenditure', { consumption: 60, investment: 25, gov_spending: 15, export_value: 10, import_value: 12 })) === 98);
  /** 反向对照：净出口为负（进口多于出口）时结果仍应正确。 */
  assert('净进口为负时 = 60+25+15−20 = 80', (await num('gdp_expenditure', { consumption: 60, investment: 25, gov_spending: 15, export_value: 5, import_value: 25 })) === 80);
  /**
   * 增长核算：0.02 + 0.3×0.05 + 0.7×0.01 = 0.02+0.015+0.007 = 0.042
   * ★ 这个式子最有用的一点是「人口与资本都停时只剩 g_A」——见下一条断言。
   */
  assert('增长核算 0.042', close(await num('growth_accounting', { g_a: 0.02, alpha: 0.3, g_k: 0.05, g_l: 0.01 }), 0.042));
  assert('人口与资本都停 → 增长=技术进步', close(await num('growth_accounting', { g_a: 0.02, alpha: 0.3, g_k: 0, g_l: 0 }), 0.02));
  assert('资本翻倍增速 → 贡献按 α 缩放', close(await num('growth_accounting', { g_a: 0, alpha: 0.3, g_k: 0.1, g_l: 0 }), 0.03));
  /** 趋同速度 λ=(1−α)(n+δ+g) = 0.7×0.08 = 0.056 */
  assert('趋同速度 0.056', close(await num('convergence_speed', { alpha: 0.3, n: 0.01, delta: 0.05, gx: 0.02 }), 0.056));
  /** ★ 反向对照：α 越大（资本份额越高）→ 收敛越慢。这是 Solow 模型的核心性质。 */
  const fast = await num('convergence_speed', { alpha: 0.2, n: 0.01, delta: 0.05, gx: 0.02 });
  const slow = await num('convergence_speed', { alpha: 0.5, n: 0.01, delta: 0.05, gx: 0.02 });
  assert('α 越大收敛越慢', fast > slow, fast + ' vs ' + slow);
  /** 费雪方程 MV=PY：100×5 = 500 */
  assert('费雪方程 500', (await num('fisher_money', { money: 100, velocity: 5 })) === 500);
}

console.log('-- 2. 财政（含「帝国会不会崩」的判据）--')
{
  assert('赤字 = 10−15 = −5', (await num('fiscal_balance', { revenue: 10, expenditure: 15 })) === -5);
  assert('盈余 = 20−15 = 5', (await num('fiscal_balance', { revenue: 20, expenditure: 15 })) === 5);
  /**
   * ★ 基本余额是判断「有没有救」的核心：PB = T −(G−利息)。
   * 收入 10、支出 15（含利息 3）→ PB = 10 − 12 = −2。
   */
  assert('基本余额 −2（结构性亏损）', (await num('primary_balance', { revenue: 10, expenditure: 15, interest: 3 })) === -2);
  /** 反向对照：经营赚钱但被旧债利息拖垮 —— 这就是「可救」的情形。 */
  const rescue = await num('primary_balance', { revenue: 15, expenditure: 16, interest: 4 });
  assert('收入15支出16利息4 → PB=+3（可救）', rescue === 3, String(rescue));
  /**
   * 财政可持续：Δd = (i−g)·d − PB = (0.08−0.02)×0.8 − (−0.02) = 0.048+0.02 = 0.068
   * ★ 正值意味着债务负担在加重 —— 这是「帝国死亡螺旋」的定量形式。
   */
  assert('i>g 时债务加重 0.068', close(await num('fiscal_sustainability', { interest_rate: 0.08, growth_rate: 0.02, debt_ratio: 0.8, primary_balance: -0.02 }), 0.068));
  /** 反向对照：i<g 且基本盈余 → 债务负担减轻（负值）。 */
  const improve = await num('fiscal_sustainability', { interest_rate: 0.01, growth_rate: 0.05, debt_ratio: 1, primary_balance: 0.02 });
  assert('i<g 且有盈余 → 负担改善', improve < 0, String(improve));
  /** 铸币税 = 通胀 × 实际货币余额 = 0.15×0.3 = 0.045 */
  assert('铸币税 0.045', close(await num('seigniorage', { inflation: 0.15, real_money_balance: 0.3 }), 0.045));
  assert('零通胀 → 零铸币税', (await num('seigniorage', { inflation: 0, real_money_balance: 0.3 })) === 0);
  /** 有效税率 50/500 = 0.1 */
  assert('ETR 0.1', close(await num('effective_tax_rate', { actual_revenue: 50, gdp: 500 }), 0.1));
  /** ★ 反向对照：ETR 应严格小于 1（税收不可能超过全部产出）。 */
  assert('ETR 是比值不是绝对额', (await num('effective_tax_rate', { actual_revenue: 50, gdp: 500 })) < 1);
  /** 财政自由度 = 1 − 0.85 = 0.15 */
  assert('财政自由度 0.15', close(await num('fiscal_autonomy', { rigid_share: 0.85 }), 0.15));
  assert('无刚性支出 → 完全自由', close(await num('fiscal_autonomy', { rigid_share: 0 }), 1));
}

console.log('-- 3. 材料本构（比例关系是关键）--')
{
  /** 胡克 σ = E·ε = 2e11 × 1e-3 = 2e8 Pa = 200 MPa */
  assert('胡克 200 MPa', close(await num('hooke_law', { E: 2e11, eps: 1e-3 }), 2e8, 1));
  /** ★ 反向对照：应变减半 → 应力减半（线性本构，这是最该守的性质）。 */
  const half = await num('hooke_law', { E: 2e11, eps: 5e-4 });
  assert('应变减半 → 应力减半', close(half, 1e8, 1), String(half));
  /** 许用应力 = 235/1.5 = 156.67 MPa */
  assert('许用应力 156.67 MPa', close(await num('safety_factor_check', { yield_strength: 235e6 }), 235e6 / 1.5, 1000));
  /** 安全系数越大，许用应力越低 —— 这条方向不能反。 */
  const n3 = await num('safety_factor_check', { yield_strength: 235e6, safety_factor: 3 });
  assert('n=3 时许用更低', n3 < 235e6 / 1.5, String(n3));
  /**
  /**
   * ★ 断裂韧性用**比值**断言（这是抓「次方写错」的唯一可靠办法）：
   * σ_c ∝ 1/√a，所以裂纹从 1mm 到 1cm（×10）→ 承载降 √10 ≈ 3.162 倍。
   */
  const split = (await num('fracture_kic', { kic: 30e6, crack_length: 0.001 })) / (await num('fracture_kic', { kic: 30e6, crack_length: 0.01 }));
  assert('裂纹 ×10 → 承载降 √10 倍', close(split, Math.sqrt(10), 1e-6), String(split));
  assert('绝对核对 239.36 MPa', close(await num('fracture_kic', { kic: 30e6, crack_length: 0.005 }), 30e6 / Math.sqrt(Math.PI * 0.005), 1000));
  /** Ashby：E^½/ρ = √2e11/7850 = 56.97 */
  assert('Ashby 56.97', close(await num('ashby_index', { E: 2e11, rho: 7850, exponent_e: 0.5 }), Math.sqrt(2e11) / 7850, 0.01));
  /** ★ 反向对照：密度翻倍 → 指数减半（ρ 在分母且指数 1）。 */
  const dense = await num('ashby_index', { E: 2e11, rho: 15700, exponent_e: 0.5 });
  assert('密度翻倍 → 指数减半', close(dense, Math.sqrt(2e11) / 15700, 0.01), String(dense));
}

console.log('-- 4. 材料属性的微观决定 --')
{
  assert('理论强度 = E/10 = 2e10', close(await num('ideal_strength', { E: 2e11 }), 2e10, 1));
  assert('E/5 时更大', (await num('ideal_strength', { E: 2e11, factor: 5 })) === 4e10);
  /** Lindemann：T_m = 2E_k/(3k_B) = 2×4e-19/(3×1.380649e-23) = 19314.6 K */
  assert('熔点 19314.6 K', close(await num('melting_from_cohesive', { cohesive_energy: 4e-19 }), 4e-19 * 2 / (3 * 1.380649e-23), 1));
  /** ★ 反向对照：结合能翻倍 → 熔点翻倍（标度关系的核心）。 */
  const doubleE = await num('melting_from_cohesive', { cohesive_energy: 8e-19 });
  assert('结合能 ×2 → 熔点 ×2', close(doubleE, 4e-19 * 2 / (3 * 1.380649e-23) * 2, 2), String(doubleE));
  /** Pugh：G/K = 8e10/1.6e11 = 0.5 → 偏韧（< 0.57） */
  assert('Pugh 0.5（偏韧）', close(await num('pugh_ductility', { shear_modulus: 8e10, bulk_modulus: 1.6e11 }), 0.5));
  /** ★ 反向对照：G/K > 0.57 应判偏脆 —— 阈值方向不能反。 */
  const brittle = await num('pugh_ductility', { shear_modulus: 1.2e11, bulk_modulus: 1.6e11 });
  assert('G/K=0.75 → 偏脆区', brittle > 0.57, String(brittle));
  /** Grüneisen：α = γ·Cv/(3KV) = 1.5×24/(3×1.6e11×7e-6) = 1.0714e-5 */
  assert('Grüneisen 1.07e-5', close(await num('gruneisen_expansion', { heat_capacity: 24, bulk_modulus: 1.6e11, volume: 7e-6 }), 1.5 * 24 / (3 * 1.6e11 * 7e-6), 1e-9));
  /** Hall-Petch：70e6 + 0.4e6/√1e-5 = 70e6 + 126.49e6 = 196.49e6 */
  assert('Hall-Petch 196.49 MPa', close(await num('hall_petch', { grain_size: 1e-5 }), 70e6 + 0.4e6 / Math.sqrt(1e-5), 100));
  /** ★ 反向对照：晶粒减半 → 强度上升（d^(-1/2) 的符号不能反）。 */
  const finer = await num('hall_petch', { grain_size: 5e-6 });
  assert('晶粒减半 → 更强', finer > 70e6 + 0.4e6 / Math.sqrt(1e-5), String(finer));
  /** Wiedemann-Franz：κ = L₀·T·σ = 2.44e-8×300×6e7 = 439.2 */
  assert('WF 439.2', close(await num('wiedemann_franz', { temperature: 300, electrical_conductivity: 6e7 }), 2.44e-8 * 300 * 6e7, 0.1));
  assert('温度翻倍 → 导热翻倍', close(await num('wiedemann_franz', { temperature: 600, electrical_conductivity: 6e7 }), 2.44e-8 * 600 * 6e7, 0.1));
}

console.log('-- 5. 生物通用（跨世界安全）--')
{
  /** 表面积 A = 0.11·M^(2/3)；M=9e6 → 0.11×43267.49 = 4759.42 */
  assert('巨型体表面积 4759.4 m²', close(await num('sa_volume_ratio', { mass: 9e6 }), 0.11 * Math.pow(9e6, 2 / 3), 0.1));
  /** ★ 核心断言用**比值**：体重 ×8 → 面积 ×4。这是「为什么巨兽会过热」的定量根源。 */
  const a1 = await num('sa_volume_ratio', { mass: 1000 });
  const a8 = await num('sa_volume_ratio', { mass: 8000 });
  assert('体重 ×8 → 表面积 ×4', close(a8 / a1, 4, 1e-6), String(a8 / a1));
  /** ★ 进而是「单位体重面积」÷2 —— 这才是过热/缺氧的判据。 */
  assert('单位体重面积 ÷2', close((a8 / 8000) / (a1 / 1000), 0.5, 1e-6));
  /** Fick：J = D·A·ΔC/δ = 2e-9×1×1/0.001 = 2e-6 */
  assert('Fick 通量 2e-6', close(await num('fick_diffusion', { diffusion_coeff: 2e-9, area: 1, delta_conc: 1, thickness: 0.001 }), 2e-6, 1e-12));
  /** ★ 反向对照：屏障厚度翻倍 → 通量减半。 */
  const thick = await num('fick_diffusion', { diffusion_coeff: 2e-9, area: 1, delta_conc: 1, thickness: 0.002 });
  assert('厚度翻倍 → 通量减半', close(thick, 1e-6, 1e-12), String(thick));
  /** 扩散时间 t = 0.1²/(2×1e-10) = 5e7 s */
  assert('扩散时间 5e7 s', close(await num('diffusion_time', { distance: 0.1, diffusion_coeff: 1e-10 }), 5e7, 1));
  /** ★ 关键比值：距离 ×2 → 时间 ×4（平方律，这抓住「线性 vs 平方」的写错）。 */
  const t2 = await num('diffusion_time', { distance: 0.2, diffusion_coeff: 1e-10 });
  assert('距离 ×2 → 时间 ×4', close(t2 / 5e7, 4, 1e-9), String(t2 / 5e7));
  /** Pe = L·u/D = 0.001×0.0003/2e-9 = 150 */
  assert('Péclet 150', close(await num('peclet_number', { length: 0.001, velocity: 0.0003, diffusion_coeff: 2e-9 }), 150, 0.1));
  /** ★ 判别用途：Pe<1 扩散主导、Pe>1 对流主导 —— 两侧都要能区分。 */
  const diffusive = await num('peclet_number', { length: 1e-6, velocity: 1e-5, diffusion_coeff: 2e-9 });
  assert('微尺度 Pe<1（扩散主导）', diffusive < 1, String(diffusive));
  /** Hardy-Weinberg 恒等于 1（p+q=1 时） */
  assert('HW 恒为 1', close(await num('hardy_weinberg', { p: 0.9, q: 0.1 }), 1, 1e-12));
  /** ★ 携带者比例 2pq = 0.18，而表现型 q²=0.01 —— 两者差 18 倍。 */
  assert('HW p=q=0.5 → 1', close(await num('hardy_weinberg', { p: 0.5, q: 0.5 }), 1, 1e-12));
  /** Gompertz：t=0 时 a·exp(−b) = 5000×exp(−2) = 676.68 */
  assert('Gompertz 676.68', close(await num('gompertz_growth', { asymptote: 5000, shape: 2, rate: 0.5, t: 0 }), 5000 * Math.exp(-2), 0.01));
  /** ★ 关键性质：t→∞ 时趋近 asymptote（渐近上限必须真的收敛）。 */
  const later = await num('gompertz_growth', { asymptote: 5000, shape: 2, rate: 0.5, t: 200 });
  assert('t 很大 → 逼近上限 5000', close(later, 5000, 0.01), String(later));
  /** 米氏：v = Vmax·S/(Km+S) = 10×2/4 = 5 */
  assert('米氏 5', (await num('michaelis_menten', { vmax: 10, km: 2, substrate: 2 })) === 5);
  /** ★ 两条渐近行为：S≪Km 近线性、S≫Km 近饱和 —— 这是「饱和动力学」的定义。 */
  const sat = await num('michaelis_menten', { vmax: 10, km: 2, substrate: 200 });
  assert('S≫Km → 逼近 Vmax', close(sat, 10, 0.1), String(sat));
  assert('S=0 → 速率为 0', (await num('michaelis_menten', { vmax: 10, km: 2, substrate: 0 })) === 0);
  /** Q10：+10°C → ×Q10 */
  assert('Q10 温差 0 → 1', (await num('q10_temperature', { rate_ref: 1, temperature: 10, temp_ref: 10 })) === 1);
  assert('Q10 温差 +10 → 2.5', (await num('q10_temperature', { rate_ref: 1, temperature: 20, temp_ref: 10 })) === 2.5);
  /** ★ 反向对照：降温应小于 1（温度系数的方向不能反）。 */
  const colder = await num('q10_temperature', { rate_ref: 1, temperature: 0, temp_ref: 10 });
  assert('降温 10° → 1/2.5', close(colder, 0.4, 1e-9), String(colder));
}

console.log('-- 6. 索引完整性（修掉的真实缺陷）--')
{
  /**
   * ★ 这是本轮修的一个真实缺陷：`EM_OPTICAL_NUCLEAR_FORMULAS` 在构建索引时被漏掉，
   * 38 条电学/光学/核公式不在 `FORMULA_INDEX` 里。
   * 单独调用能用（走 FORMULAS 数组），但 pipeline/bridge 说找不到。
   */
  const em = await import(pathToFileURL(join(root, 'lib/formula-library-em.js')).href);
  const missing = em.EM_OPTICAL_NUCLEAR_FORMULAS.filter((f) => !formulasMod.FORMULA_INDEX.has(f.id));
  assert('EM 公式全部进入索引', missing.length === 0, missing.map((f) => f.id).slice(0, 5).join(','));
  /**
   * 索引 vs 数组的差值只允许是「历史重复 id」。
   * 现在应有 4 个（city_wall_perimeter / lc_resonance / thermal_stress / spring_energy），
   * 它们被后批次覆盖，属预期行为；若差更多说明又有批次漏登。
   */
  const diff = formulasMod.FORMULAS.length - formulasMod.FORMULA_INDEX.size;
  assert('数组与索引差 ≤ 4（仅历史重复）', diff <= 4, '差 ' + diff);
  /** 反向对照：索引里每条都能真的调用（抽查 30 条）。 */
  const ids = [...formulasMod.FORMULA_INDEX.keys()].slice(0, 30);
  assert('索引内的 id 可解析', ids.every((id) => formulasMod.resolveFormulaStrict(formulasMod.FORMULAS, id) !== undefined), ids.filter((id) => formulasMod.resolveFormulaStrict(formulasMod.FORMULAS, id) === undefined).join(','));
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);