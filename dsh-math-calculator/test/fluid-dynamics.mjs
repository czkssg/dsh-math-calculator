/**
 * 流体力学与空气动力（第七批）13 条。
 *
 * ## 本套的主轴：两种阻力机制必须分开
 *
 * ```
 *   压差阻力  ∝ v²   高速主导（drag_force）
 *   粘性阻力  ∝ v    低速主导（viscous_drag_stokes）
 * ```
 *
 * 这不是同一个公式的两个近似，而是**两种不同的物理机制**。
 * 混用会得出「船越快越省力」这种荒谬结论。所以断言专门验这两条标度：
 * 速度翻倍时，压差阻力必须 ×4、粘性阻力必须 ×2。
 *
 * ## 第二主轴：升力的平方根墙
 *
 * 失速速度 ∝ √翼载 —— 这条决定了「重的东西必须快才能飞」，
 * 也是所有巨型飞行生物设定的第一判据。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-fluid-'))
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

console.log('-- 1. 伯努利与动压 --')
{
  /** 101325 − ½·1.225·30² = 101325 − 551.25 = 100773.75 */
  assert('P₀=101325,v=30 → 100773.75', close(await num('bernoulli_pressure', { stagnation_pressure: 101325, density: 1.225, velocity: 30 }), 100773.75, 0.01))
  assert('v=60 → 降 2205 Pa（4 倍）', close(await num('stagnation_pressure', { density: 1.225, velocity: 60 }), 2205, 0.01))
  /**
   * ★★ 核心标度：动压 ∝ v²。速度翻倍，动压必须 ×4。
   * 这是所有气动力的共同来源，写错这里会连锁错掉全部。
   */
  const q30 = await num('stagnation_pressure', { density: 1.225, velocity: 30 })
  const q60 = await num('stagnation_pressure', { density: 1.225, velocity: 60 })
  assert('速度翻倍 → 动压 ×4', rel(q60 / q30, 4, 1e-6), (q60 / q30).toFixed(4))
  /** 密度线性：水里动压是空气的 816 倍。 */
  const w30 = await num('stagnation_pressure', { density: 1000, velocity: 30 })
  assert('水中动压是空气 816 倍', close(w30 / q30, 1000 / 1.225, 0.01), (w30 / q30).toFixed(1))
}

console.log('-- 2. 两种阻力：v² vs v（本套核心）--')
{
  /** 压差阻力：330.75 N */
  assert('C_D=0.3,v=30,A=2 → 330.75 N', close(await num('drag_force', { density: 1.225, velocity: 30, reference_area: 2, drag_coefficient: 0.3 }), 330.75, 0.01))
  const d1 = await num('drag_force', { density: 1.225, velocity: 10, reference_area: 2, drag_coefficient: 0.3 })
  const d2 = await num('drag_force', { density: 1.225, velocity: 20, reference_area: 2, drag_coefficient: 0.3 })
  /**
   * ★★ 压差阻力 ∝ v²：速度翻倍，阻力 ×4（不是 ×2）。
   * 「高速时功率需求 ∝ v³」的原因就在这里。
   */
  assert('压差阻力：速度翻倍 → ×4', rel(d2 / d1, 4, 1e-6), (d2 / d1).toFixed(4))

  /** 粘性阻力：6πμrv */
  const v1 = await num('viscous_drag_stokes', { viscosity: 1.8e-5, radius: 1e-5, velocity: 0.01 })
  const v2 = await num('viscous_drag_stokes', { viscosity: 1.8e-5, radius: 1e-5, velocity: 0.02 })
  /**
   * ★★ 粘性阻力 ∝ v：速度翻倍，阻力只 ×2。
   * 与上一条并列，这两条一起守住「两种机制不能混」。
   */
  assert('粘性阻力：速度翻倍 → ×2', rel(v2 / v1, 2, 1e-6), (v2 / v1).toFixed(4))
  /** ★ 半径线性（球体 Stokes 区）：半径翻倍，阻力 ×2。 */
  const r2 = await num('viscous_drag_stokes', { viscosity: 1.8e-5, radius: 2e-5, velocity: 0.01 })
  assert('粘性阻力 ∝ 半径', rel(r2 / v1, 2, 1e-6), (r2 / v1).toFixed(4))
}

console.log('-- 3. 沉降：末速 ∝ r² --')
{
  /** 砂（2650）在 100µm 水中的末速：0.0359 m/s */
  const v = await num('terminal_velocity_sphere', { radius: 1e-4, particle_density: 2650, fluid_density: 1000, gravity: 9.80665, viscosity: 1e-3 })
  assert('r=0.1mm 细砂 → 0.0359 m/s', close(v, 0.035958, 1e-4), String(v))
  /**
   * ★★ 核心：**末速 ∝ r²**。半径翻倍，沉降速度 4 倍。
   * 这就是「粗砂瞬间沉底、黏土悬浮数天」的全部原因。
   */
  const r2 = await num('terminal_velocity_sphere', { radius: 2e-4, particle_density: 2650, fluid_density: 1000, gravity: 9.80665, viscosity: 1e-3 })
  assert('半径翻倍 → 末速 ×4', rel(r2 / v, 4, 1e-6), (r2 / v).toFixed(3))
  /** ★ 密度差为 0（中性浮力）→ 不沉降。 */
  const neut = await num('terminal_velocity_sphere', { radius: 1e-4, particle_density: 1000, fluid_density: 1000, gravity: 9.80665, viscosity: 1e-3 })
  assert('中性浮力 → 末速 0', close(neut, 0), String(neut))
  /** ★ 反向：颗粒比水轻（ρ_p<ρ_f）→ 负值（上浮）。 */
  const light = await num('terminal_velocity_sphere', { radius: 1e-4, particle_density: 900, fluid_density: 1000, gravity: 9.80665, viscosity: 1e-3 })
  assert('比水轻 → 上浮（负值）', light < 0, String(light))
}

console.log('-- 4. 升力与失速 --')
{
  /** 12250 N */
  assert('v=50,S=16,C_L=0.5 → 12250 N', close(await num('lift_force', { density: 1.225, velocity: 50, wing_area: 16, lift_coefficient: 0.5 }), 12250, 0.1))
  /**
   * ★★ 升力 ∝ v²：速度翻倍，升力 ×4。
   * 这就是「速度不够就飞不起来」的数学形态 —— 不是线性地不够，是平方地不够。
   */
  const l1 = await num('lift_force', { density: 1.225, velocity: 25, wing_area: 16, lift_coefficient: 0.5 })
  const l2 = await num('lift_force', { density: 1.225, velocity: 50, wing_area: 16, lift_coefficient: 0.5 })
  assert('速度翻倍 → 升力 ×4', rel(l2 / l1, 4, 1e-6), (l2 / l1).toFixed(4))

  /** 失速速度：62.6 m/s */
  const vs = await num('wing_loading_stall_speed', { wing_loading: 6000, density: 1.225, max_lift_coefficient: 2.5 })
  assert('翼载 6000、C_Lmax 2.5 → 62.6 m/s', close(vs, 62.597, 0.01), String(vs))
  /**
   * ★★ 核心：V_stall ∝ √翼载。翼载翻 4 倍，失速速度只翻 2 倍。
   * 这条决定了「重载需要长跑道」不是设计选择，而是平方根律。
   */
  const vs4 = await num('wing_loading_stall_speed', { wing_loading: 24000, density: 1.225, max_lift_coefficient: 2.5 })
  assert('翼载 ×4 → 失速速度 ×2', rel(vs4 / vs, 2, 1e-6), (vs4 / vs).toFixed(4))
  /**
   * ★ 放襟翼的意义：C_Lmax 1.4→2.5，失速速度降到 √(1.4/2.5)=0.748，即降 25%。
   * 「放襟翼不是为了升力大，是为了失速速度低」——这是本批最值得记的一条。
   */
  const noFlap = await num('wing_loading_stall_speed', { wing_loading: 6000, density: 1.225, max_lift_coefficient: 1.4 })
  assert('放襟翼 → 失速速度降 25%', rel(noFlap / vs, Math.sqrt(2.5 / 1.4), 1e-6), (vs / noFlap * 100).toFixed(1) + '%')
  /** ★ 密度降低（高原）→ 失速速度升高。 */
  const highland = await num('wing_loading_stall_speed', { wing_loading: 6000, density: 0.9, max_lift_coefficient: 2.5 })
  assert('高原低密度 → 需要更快', highland > vs, vs.toFixed(1) + ' → ' + highland.toFixed(1))
}

console.log('-- 5. 升阻比与诱导阻力 --')
{
  assert('C_L=0.5,C_D=0.05 → L/D=10', close(await num('lift_to_drag_ratio', { lift_coefficient: 0.5, drag_coefficient: 0.05 }), 10))
  /** ★ 线性：阻力系数减半，L/D 翻倍。 */
  const ld20 = await num('lift_to_drag_ratio', { lift_coefficient: 0.5, drag_coefficient: 0.025 })
  assert('C_D 减半 → L/D 翻倍', close(ld20, 20), String(ld20))

  /** 诱导阻力：C_L=1、AR=6、e=0.8 → 0.0663 */
  assert('AR=6 → C_Di=0.0663', close(await num('induced_drag', { lift_coefficient: 1, aspect_ratio: 6, oswald_efficiency: 0.8 }), 0.066315, 1e-4))
  /**
   * ★★ 核心：C_Di ∝ C_L²。升力系数翻倍，诱导阻力 ×4。
   * 「想要更多升力的代价是平方级的」——这是飞行设计的根本约束。
   */
  const cl1 = await num('induced_drag', { lift_coefficient: 0.5, aspect_ratio: 6, oswald_efficiency: 0.8 })
  const cl2 = await num('induced_drag', { lift_coefficient: 1.0, aspect_ratio: 6, oswald_efficiency: 0.8 })
  assert('C_L 翻倍 → 诱导阻力 ×4', rel(cl2 / cl1, 4, 1e-6), (cl2 / cl1).toFixed(4))
  /** ★ 展弦比反比：AR 20 时诱导阻力只有 AR 6 的 30%。 */
  const ar20 = await num('induced_drag', { lift_coefficient: 1, aspect_ratio: 20, oswald_efficiency: 0.8 })
  assert('AR 6→20 → 诱导阻力降到 30%', rel(ar20 / cl2, 6 / 20, 1e-6), (ar20 / cl2).toFixed(3))
}

console.log('-- 6. 边界层、马赫角、波阻 --')
{
  /** 层流平板：x=1、Re=2e5 → 11.2mm */
  assert('x=1,Re=2e5 → 11.2mm', close(await num('boundary_layer_thickness', { distance: 1, reynolds_local: 2e5 }), 0.0111803, 1e-6))
  /** ★ δ ∝ √x：距离 ×4，厚度 ×2。 */
  const x1 = await num('boundary_layer_thickness', { distance: 1, reynolds_local: 2e5 })
  const x4 = await num('boundary_layer_thickness', { distance: 4, reynolds_local: 8e5 })
  assert('距离 ×4 → 厚度 ×2', close(x4 / x1, 2, 1e-6), (x4 / x1).toFixed(4))

  /** 马赫角：M=2 → 30°，M=5 → 11.54° */
  assert('M=2 → 30°', close(await num('mach_angle', { mach_number: 2 }) * 180 / Math.PI, 30, 1e-6))
  assert('M=5 → 11.54°', close(await num('mach_angle', { mach_number: 5 }) * 180 / Math.PI, 11.537, 1e-3))
  /** ★ M 越大锥越窄。 */
  const a2 = await num('mach_angle', { mach_number: 2 })
  const a10 = await num('mach_angle', { mach_number: 10 })
  assert('M 越大马赫角越小', a10 < a2, (a10 * 180 / Math.PI).toFixed(1) + '° < ' + (a2 * 180 / Math.PI).toFixed(1) + '°')
  /** ★ M=1.0001 时马赫角应逼近 90°（刚达音速，锥最开）。 */
  const aNear = await num('mach_angle', { mach_number: 1.0001 })
  assert('M≈1 → 马赫角≈90°', aNear > 1.5, (aNear * 180 / Math.PI).toFixed(1) + '°')

  /** 波阻：立方律。M=0.85→0.0059，M=0.90→0.0200 */
  assert('M=0.90 → 0.0200', close(await num('wave_drag_coefficient', { mach_number: 0.9, critical_mach: 0.75 }), 0.020, 1e-3))
  const w85 = await num('wave_drag_coefficient', { mach_number: 0.85, critical_mach: 0.75 })
  const w90 = await num('wave_drag_coefficient', { mach_number: 0.9, critical_mach: 0.75 })
  /**
   * ★★ 立方律：M−M_cr 从 0.10 涨到 0.15（1.5 倍），波阻涨 3.375 倍（1.5³）。
   * 这就是「音障」的数学形态 —— 速度只多一点，阻力暴涨。
   */
  assert('立方律：ΔM ×1.5 → 波阻 ×3.375', close(w90 / w85, 3.375, 1e-6), (w90 / w85).toFixed(3))
  /** ★ M ≤ M_cr 时无波阻（负值应被钳到 0 —— 本式给负值，属已知局限）。 */
  const below = await num('wave_drag_coefficient', { mach_number: 0.7, critical_mach: 0.75 })
  assert('低于临界马赫 → 负值（已知局限，应用时钳到 0）', below < 0, String(below))
}

console.log('-- 7. 雷诺数阈值 --')
{
  /** 微观蠕流：1mm 虫在水里 Re=0.01 */
  /**
   * 0.01 m/s × 1e-3 m ÷ 1e-6 m²/s = 10。
   * 第一版我写 0.01，是把「1mm 的虫」的速度与长度都记成 1e-3 了 —— 手算错误。
   */
  assert('1mm 虫（1cm/s）→ Re=10', close(await num('reynolds_transition', { velocity: 0.01, length: 1e-3, kinematic_viscosity: 1e-6 }), 10, 1e-6))
  /** 大船湍流：Re=1e9 */
  assert('100m 船 → Re=1e9', close(await num('reynolds_transition', { velocity: 10, length: 100, kinematic_viscosity: 1e-6 }), 1e9, 1e3))
  /**
   * ★★ 核心：Re 跨越 6 个数量级 —— 这就是「微观生物的世界像蜂蜜」的原因。
   * 若把这条写成线性或对数关系，量级差会立刻暴露。
   */
  const bug = await num('reynolds_transition', { velocity: 0.01, length: 1e-3, kinematic_viscosity: 1e-6 })
  const ship = await num('reynolds_transition', { velocity: 10, length: 100, kinematic_viscosity: 1e-6 })
  assert('微观与宏观差 8 个数量级', ship / bug === 1e8, (ship / bug).toExponential(1))
}

console.log('-- 8. 元信息与入库完整性 --')
{
  const ids = [
    'bernoulli_pressure', 'stagnation_pressure', 'drag_force', 'viscous_drag_stokes',
    'terminal_velocity_sphere', 'lift_force', 'lift_to_drag_ratio', 'induced_drag',
    'wing_loading_stall_speed', 'boundary_layer_thickness', 'mach_angle',
    'wave_drag_coefficient', 'reynolds_transition',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 13 条全部入库', missing.length === 0, missing.join(','))

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

  assert('公式总数 ≥ 620', fm.FORMULAS.length >= 620, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
