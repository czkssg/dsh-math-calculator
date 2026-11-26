/** 多状态 ODE：SIR 三状态 / 简谐 / 二阶降阶。
 *
 * help 明确承诺「一阶方程组（SIR / 捕食模型）与二阶方程（自动降阶）都能解」，
 * 但 test-v3 里所有 ode 用例都是单状态（dy/dt = -y），多状态从未被守护——
 * 导致 SIR 示例实际不可用。本套件按定义性质断言（守恒、单调、周期），不背数值。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-ode-multi-'))
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

console.log('-- 1. 单状态回归（修复不能破坏旧行为）--')
{
  const r = await run({ operation: 'ode', expression: 'dy/dt = -y', initial: { y: 1 }, from: 0, to: 1, steps: 2000 })
  assert('dy/dt=-y 可解', r.ok === true, r.error && r.error.message)
  assert('y(1) ≈ e^-1', r.ok && near(r.value.final.y, Math.exp(-1), 1e-3), r.value && String(r.value.final.y))
}

console.log('-- 2. SIR 三状态（逗号分隔，help 里的写法）--')
{
  const sir = await run({
    operation: 'ode',
    expression: 'dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I, dR/dt=0.1*I',
    initial: { S: 999, I: 1, R: 0 }, from: 0, to: 60, steps: 4000, samples: 120,
  })
  assert('SIR 三状态可解', sir.ok === true, sir.error && sir.error.message)
  if (sir.ok) {
    const pts = sir.value.points
    const peak = Math.max(...pts.map((p) => p.I))
    assert('I 有爆发峰（峰值 > 初值 1.1）', peak > 1.1, String(peak))
    assert('峰值比例落在 20%~40%', peak / 1000 > 0.2 && peak / 1000 < 0.4, String(peak / 1000))
    const last = pts[pts.length - 1]
    assert('S+I+R 守恒（=1000）', near(last.S + last.I + last.R, 1000, 1), String(last.S + last.I + last.R))
    assert('S 末值显著低于初值', last.S < 500, String(last.S))
    assert('R 末值显著上升', last.R > 400, String(last.R))
  }
  const semi = await run({
    operation: 'ode', expression: "dS/dt=-0.3*S*I/1000; dI/dt=0.3*S*I/1000-0.1*I",
    initial: { S: 999, I: 1 }, from: 0, to: 20, steps: 2000,
  })
  assert('分号分隔与逗号等价（可解）', semi.ok === true, semi.error && semi.error.message)
}

console.log('-- 3. initial 顺序无关 --')
{
  const a = await run({ operation: 'ode', expression: "dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I", initial: { S: 999, I: 1 }, from: 0, to: 20, steps: 2000 })
  const b = await run({ operation: 'ode', expression: "dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I", initial: { I: 1, S: 999 }, from: 0, to: 20, steps: 2000 })
  const same = a.ok && b.ok && near(a.value.final.S, b.value.final.S, 1e-9) && near(a.value.final.I, b.value.final.I, 1e-9)
  assert('initial 写成 {I,S} 结果不变', same, a.error && a.error.message)
}

console.log('-- 4. 简谐（二阶方程的降阶写法）--')
{
  const r = await run({ operation: 'ode', expression: "x'=y; y'=-x", initial: { x: 1, y: 0 }, from: 0, to: 6.283185307179586, steps: 4000, samples: 200 })
  assert('x\'=y; y\'=-x 可解', r.ok === true, r.error && r.error.message)
  if (r.ok) {
    assert('x(2π) ≈ x(0) = 1（周期）', near(r.value.final.x, 1, 2e-2), String(r.value.final.x))
    const energies = r.value.points.map((p) => p.x * p.x + p.y * p.y)
    const drift = Math.max(...energies) - Math.min(...energies)
    assert('能量 x²+y² 守恒（漂移 < 0.02）', drift < 0.02, String(drift))
  }
  const second = await run({ operation: 'ode', expression: "y'=yd; yd'=-y", initial: { y: 1, yd: 0 }, from: 0, to: 6.283185307179586, steps: 4000 })
  assert('二阶降阶 y\'=yd; yd\'=-y 可解', second.ok === true, second.error && second.error.message)
  assert('降阶后 y(2π) ≈ 1', second.ok && near(second.value.final.y, 1, 2e-2), second.value && String(second.value.final.y))
}

console.log('-- 5. 自定义自变量（dy/dx）--')
{
  const r = await run({ operation: 'ode', expression: 'dy/dx = -y', initial: { y: 1 }, from: 0, to: 1, steps: 2000 })
  assert('dy/dx 可解', r.ok === true, r.error && r.error.message)
  assert('变量名是 x', r.ok && r.value.variable === 'x', r.value && String(r.value.variable))
  assert('y(1) ≈ e^-1', r.ok && near(r.value.final.y, Math.exp(-1), 1e-3), r.value && String(r.value.final.y))
}

console.log('-- 6. at 精确取点与极值（help 承诺）--')
{
  const r = await run({
    operation: 'ode',
    expression: 'dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I, dR/dt=0.1*I',
    initial: { S: 999, I: 1, R: 0 }, from: 0, to: 60, steps: 1200, samples: 24, at: [10, 20, 30, 40],
  })
  assert('带 at 可解', r.ok === true, r.error && r.error.message)
  if (r.ok) {
    const at = r.value.at || []
    assert('at 返回 4 个时点', at.length === 4, String(at.length))
    assert('at 的 t 精确等于请求值', at.map((p) => p.t).join(',') === '10,20,30,40', at.map((p) => p.t).join(','))
    assert('at 点落在轨迹范围内（S 递减）', at[0].S > at[3].S, String(at[0].S) + ' -> ' + String(at[3].S))
    const ext = r.value.extrema || {}
    assert('extrema 有 I 的峰值', ext.I !== undefined && ext.I.max > 1.1, ext.I === undefined ? 'missing' : String(ext.I.max))
    assert('I 峰值时刻在 30~50', ext.I !== undefined && ext.I.maxT > 30 && ext.I.maxT < 50, ext.I === undefined ? 'missing' : String(ext.I.maxT))
    assert('S 的极小值远低于初值', ext.S !== undefined && ext.S.min < 500, ext.S === undefined ? 'missing' : String(ext.S.min))
  }
}

console.log('-- 7. 缺初值要报清楚，不能静默给错 --')
{
  const r = await run({ operation: 'ode', expression: "dS/dt=-0.3*S*I/1000, dI/dt=0.3*S*I/1000-0.1*I", initial: { S: 999 }, from: 0, to: 5, steps: 500 })
  assert('方程里出现但 initial 缺失的状态 → 报 missing_params', r.ok === false && String(r.error && r.error.message).includes('I'), r.ok ? '未报错' : String(r.error && r.error.message))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
