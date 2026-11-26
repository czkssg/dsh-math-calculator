/** 过程层最小可用集：峰值比例与空间蔓延速度。
 *
 * 两条都是闭式近似，所以**必须用数值解交叉验证**，不能只看公式本身：
 * - 峰值比例 vs `ode` 解出的 SIR 轨迹极值；
 * - 波速 vs 一维 Fisher—KPP 反应扩散方程的显式差分解。
 * 断言用「两个独立路径一致」，而不是背某个数。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-process-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol

async function peakFormula(R0) {
  const r = await run({ operation: 'formula', formula: 'epidemic_peak_fraction', overrides: { R0 } })
  return r.ok === true ? r.value.result : NaN
}
async function odePeakFraction(R0, to) {
  const beta = R0 * 0.1
  const r = await run({
    operation: 'ode',
    expression: 'dS/dt=-' + beta + '*S*I/1000, dI/dt=' + beta + '*S*I/1000-0.1*I, dR/dt=0.1*I',
    initial: { S: 999, I: 1, R: 0 }, from: 0, to, steps: 2000,
  })
  return r.ok === true ? r.value.extrema.I.max / 1000 : NaN
}

console.log('-- 1. 峰值比例公式可求值 --')
{
  const v = await peakFormula(3)
  assert('R0=3 → 0.3005（手算 1-(1+ln3)/3）', near(v, 0.30046, 1e-4), String(v))
}

console.log('-- 2. 边界：R0 ≤ 1 不应给正值 --')
{
  const atOne = await peakFormula(1)
  const below = await peakFormula(0.5)
  assert('R0=1 → 0（不流行）', atOne === 0, String(atOne))
  assert('R0=0.5 → 0（不能给 0.386 这种假峰值）', below === 0, String(below))
}

console.log('-- 3. 峰值比例 vs ode 数值解（两条独立路径）--')
{
  for (const [R0, to] of [[2, 240], [3, 150], [4, 100]]) {
    const closed = await peakFormula(R0)
    const numeric = await odePeakFraction(R0, to)
    const rel = Math.abs(closed - numeric) / numeric
    assert('R0=' + R0 + ' 闭式 vs 数值（相对差 < 3%）', rel < 0.03, '闭式 ' + closed.toFixed(4) + ' / 数值 ' + numeric.toFixed(4))
  }
}

console.log('-- 4. 波速公式可求值 --')
{
  const r = await run({ operation: 'formula', formula: 'spread_wave_speed', overrides: { D: 1, r: 0.25 } })
  assert('D=1、r=0.25 → 2*sqrt(0.25)=1.0', r.ok === true && near(r.value.result, 1, 1e-9), r.ok ? String(r.value.result) : r.error && r.error.message)
  const scale = await run({ operation: 'formula', formula: 'spread_wave_speed', overrides: { D: 100, r: 0.2 } })
  assert('D 放大 100 倍 → 速度放大 10 倍（平方根）', scale.ok === true && near(scale.value.result, 8.9443, 1e-3), scale.ok ? String(scale.value.result) : '')
}

console.log('-- 5. 波速 vs 一维 Fisher—KPP 数值解 --')
{
  /** 显式差分：u_t = D·u_xx + r·u(1-u)，初始中间一段。 */
  const D = 1, r = 0.25, dx = 1, dt = 0.05, steps = 4000
  const size = 800
  const center = Math.floor(size / 2)
  let u = new Float64Array(size)
  for (let i = center - 3; i <= center + 3; i += 1) u[i] = 0.5
  const marks = []
  for (let s = 0; s <= steps; s += 1) {
    if (s % 100 === 0) {
      let far = center
      for (let i = center; i < size - 1; i += 1) if (u[i] >= 0.25) far = i
      marks.push({ t: s * dt, x: (far - center) * dx })
    }
    const next = new Float64Array(size)
    for (let i = 1; i < size - 1; i += 1) {
      next[i] = u[i] + dt * (D * (u[i + 1] - 2 * u[i] + u[i - 1]) / (dx * dx) + r * u[i] * (1 - u[i]))
    }
    u = next
  }
  /** 只回归后半段（前半段是初始条件加速的过程）。 */
  const tail = marks.filter((m) => m.t >= 60)
  const n = tail.length
  const meanT = tail.reduce((s, m) => s + m.t, 0) / n
  const meanX = tail.reduce((s, m) => s + m.x, 0) / n
  let num = 0, den = 0
  for (const m of tail) { num += (m.t - meanT) * (m.x - meanX); den += (m.t - meanT) ** 2 }
  const measured = num / den
  const predicted = 2 * Math.sqrt(D * r)
  assert('PDE 实测前沿速度 ≈ 2√(D·r)（相对差 < 10%）', Math.abs(measured - predicted) / predicted < 0.1, '实测 ' + measured.toFixed(3) + ' / 预测 ' + predicted.toFixed(3))
}

console.log('-- 6. 谣言传遍时间：反解（solveRange）--')
{
  const r = await run({ operation: 'formula', formula: 'information_propagation', params: { N: 100000, k: 0.1 }, solveFor: 't', targetValue: 90000, solveRange: { min: 0, max: 1000 } })
  const solved = r.ok === true && Array.isArray(r.value.solutions) && r.value.solutions.length > 0
  assert('10 万人、k=0.1、传遍 90% → 可反解', solved, r.ok ? '无解' : r.error && r.error.message)
  if (solved) {
    assert('t ≈ ln(10)/k = 23.026 天', near(r.value.solutions[0], Math.log(10) / 0.1, 1e-3), String(r.value.solutions[0]))
  }
  const noRange = await run({ operation: 'formula', formula: 'information_propagation', params: { N: 100000, k: 0.1 }, solveFor: 't', targetValue: 90000 })
  const text = noRange.ok === true ? String(noRange.result) : String((noRange.error && noRange.error.message) || '')
  assert('无区间时的提示写 solveRange（不是 range，会误导）', text.includes('solveRange'), text.slice(0, 120))
}

console.log('-- 7. 技术扩散与饥荒链：已有能力直接串起来 --')
{
  const tech = await run({ operation: 'formula', formula: 'diffusion_s_curve', params: { rate: 0.3, t: 30, t_mid: 20 } })
  assert('技术普及：30 年、半程 20 年 → 95.3%', tech.ok === true && near(tech.value.result, 0.9526, 1e-3), tech.ok ? String(tech.value.result) : '')
  const gap = await run({ operation: 'formula', formula: 'calorie_gap_ratio', params: { requirement: 1000, available: 700 } })
  assert('饥荒缺口 = 30%', gap.ok === true && near(gap.value.result, 0.3, 1e-9), gap.ok ? String(gap.value.result) : '')
  const survive = await run({ operation: 'formula', formula: 'starvation_survival_time', params: { body_fat_mass: 15, energy_per_kg_fat: 32200, utilization: 0.8, daily_deficit: 8000 } })
  assert('体脂 15kg、日缺口 8000kJ → 约 48 天', survive.ok === true && near(survive.value.result, 48.3, 0.5), survive.ok ? String(survive.value.result) : '')
  const death = await run({ operation: 'formula', formula: 'famine_excess_mortality', params: { baseline_death_rate: 0.035, severity_factor: 8, gap_ratio: 0.3 } })
  assert('缺口 30% → 超额死亡率 6.0%', death.ok === true && near(death.value.result, 0.0602, 1e-3), death.ok ? String(death.value.result) : '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
