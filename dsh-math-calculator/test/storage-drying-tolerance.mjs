/**
 * 储备损耗 / 干燥时间 / 公差叠加（外部反馈 A6 / A10 / P12）。
 *
 * ## 三条的共同点：都在补「中间那一段」
 *
 * 库里原本每一步都有，但**步与步之间缺一段**：
 *
 * ```
 *   总产 ──(缺)── 能吃的        干燥未干透 → 入仓发霉；不计损耗 → 储备算多
 *   单件精度 ──(缺)── 装配精度  只有「±0.05mm」，没有「装起来会怎样」
 * ```
 *
 * ## 本套最重要的一条断言：指数衰减不能写成线性
 *
 * 线性式 N₀·(1−r·t) 在 t > 1/r 时变负 —— 损耗永远拿不光存量。
 * 这是最容易犯的错，因为 t 小时两者几乎重合。
 *
 * ## 第二条：均方根叠加不是无条件的
 *
 * √n·σ 的前提是误差**独立且随机**。同人同机同批料做出的一批件，
 * 误差同向偏（共因），这时必须退回 n·σ。所以守两个方向：
 * 独立时 RMS 小于线性；共因时本式不适用（写成说明与断言双向守住）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-sto-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-9)

console.log('-- 1. 储备损耗：指数而不是线性 --')
{
  /** 手算：1000 · 0.96² = 921.6；1000 · 0.85³ = 614.125 */
  const barn = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 2 })
  const open = await num('storage_loss', { initial: 1000, loss_rate: 0.15, years: 3 })
  assert('谷仓 2 年剩 921.6', close(barn, 921.6, 0.1), String(barn))
  assert('露天 3 年剩 614.1', close(open, 614.125, 0.01), String(open))

  /** ★ 反向对照：线性式在 1/r 年之后会变负，指数式永远为正。 */
  const far = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 50 })
  assert('50 年后仍为正（线性式早该负数）', far > 0, String(far))
  const linear50 = 1000 * (1 - 0.04 * 50)
  assert('线性式此时已为负', linear50 < 0, String(linear50))

  /** 单调递减，且 t=0 恰好等于入储量。 */
  const zero = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 0 })
  assert('t=0 剩 1000（没损耗）', close(zero, 1000), String(zero))
  const y1 = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 1 })
  const y5 = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 5 })
  assert('5 年少于 1 年', y5 < y1, y5 + ' < ' + y1)
}

console.log('-- 2. 储备损耗：损耗率减半胜过储量翻倍 --')
{
  /**
   * 这是本节真正想说的结论。
   * 存 5 年：谷仓（0.04）剩 81.5%、露天（0.15）剩 44.4%。
   */
  const barn5 = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 5 })
  const open5 = await num('storage_loss', { initial: 1000, loss_rate: 0.15, years: 5 })
  assert('谷仓 5 年 ≈ 815', close(barn5, 815.4, 1), String(barn5))
  assert('露天 5 年 ≈ 444', close(open5, 443.7, 1), String(open5))
  /** 差距随年数扩大：3 年差 ~31 点，5 年差 ~37 点。 */
  const barn3 = await num('storage_loss', { initial: 1000, loss_rate: 0.04, years: 3 })
  const open3 = await num('storage_loss', { initial: 1000, loss_rate: 0.15, years: 3 })
  const gap3 = barn3 - open3
  const gap5 = barn5 - open5
  assert('差距随储存年数扩大', gap5 > gap3, gap5.toFixed(1) + ' > ' + gap3.toFixed(1))
}

console.log('-- 3. 干燥时间：先快后慢，且目标趋近平衡时发散 --')
{
  /** 手算：(0.14−0.12)/(0.25−0.12)=0.1538 → −ln/0.30 = 6.24 天 */
  const sun = await num('drying_time', { m_initial: 0.25, m_equilibrium: 0.12, m_final: 0.14, k_dry: 0.30 })
  assert('日晒 6.24 天', close(sun, 6.2393, 1e-3), String(sun))

  /** k 减到 1/3 → 时间 ×3（线性反比，这是「升温比延长有效」的另一面）。 */
  const shade = await num('drying_time', { m_initial: 0.25, m_equilibrium: 0.12, m_final: 0.14, k_dry: 0.10 })
  assert('k 三倍慢 → 时间三倍长', close(shade, sun * 3, 1e-6), shade + ' vs ' + sun * 3)

  /** ★ 反向对照：目标越接近平衡含水率，时间急剧增加（发散）。 */
  const t121 = await num('drying_time', { m_initial: 0.25, m_equilibrium: 0.12, m_final: 0.121, k_dry: 0.30 })
  const t1201 = await num('drying_time', { m_initial: 0.25, m_equilibrium: 0.12, m_final: 0.1201, k_dry: 0.30 })
  assert('0.121 → 16.2 天', close(t121, 16.225, 0.01), String(t121))
  assert('0.1201 → 23.9 天', close(t1201, 23.900, 0.01), String(t1201))
  assert('目标再降一个数量级，时间仍在涨', t1201 > t121, t1201 + ' > ' + t121)

  /** 边界：目标 = 平衡含水率时，理论上需要无限长时间。 */
  const never = await num('drying_time', { m_initial: 0.25, m_equilibrium: 0.12, m_final: 0.12, k_dry: 0.30 })
  assert('目标=平衡值 → 非有限（干不到）', !Number.isFinite(never) || never > 1e6, String(never))
}

console.log('-- 4. 公差叠加：均方根 vs 线性 --')
{
  /** 手算：√(5·0.05²)=0.1118；√(20·0.05²)=0.2236 */
  const n5 = await num('tolerance_stack', { n: 5, tolerance: 0.05 })
  const n20 = await num('tolerance_stack', { n: 20, tolerance: 0.05 })
  assert('5 件 ±0.1118', close(n5, 0.111803, 1e-5), String(n5))
  assert('20 件 ±0.2236', close(n20, 0.223607, 1e-5), String(n20))

  /** ★ 核心对照：均方根永远小于线性叠加，且比值 = √n。 */
  assert('5 件：RMS < 线性(0.25)', n5 < 0.25, n5 + ' < 0.25')
  assert('20 件：RMS < 线性(1.00)', n20 < 1.0, n20 + ' < 1.00')
  /**
   * 比值 = √n 只证到「显示精度」为止：result 里的小数被截到 8 位，
   * 再由 0.05 反算会把误差放大 20 倍，所以容差取 1e-5 而不是 1e-9。
   * （要更严就传 displayPrecision，但这里要证的是形式，不是位数。）
   */
  assert('比值 = √n（5 件）', close(n5 / 0.05, Math.sqrt(5), 1e-5), String(n5 / 0.05))
  assert('比值 = √n（20 件）', close(n20 / 0.05, Math.sqrt(20), 1e-5), String(n20 / 0.05))

  /** n 越大，均方根的相对优势越大（这是「互换性」的经济价值）。 */
  const adv5 = 0.25 / n5
  const adv20 = 1.0 / n20
  assert('件数越多优势越大', adv20 > adv5, adv20.toFixed(2) + 'x > ' + adv5.toFixed(2) + 'x')

  /** 单件（n=1）时两者相同 —— 不该凭空收紧。 */
  const n1 = await num('tolerance_stack', { n: 1, tolerance: 0.05 })
  assert('n=1 时不收紧', close(n1, 0.05), String(n1))
}

console.log('-- 5. 已接进体系（而不是孤立存在）--')
{
  const food = sys.FORMULA_SYSTEMS.find((s) => s.id === 'sys-food')
  const foodIds = food.steps.map((s) => s.formula)
  assert('食物链含 drying_time', foodIds.includes('drying_time'))
  assert('食物链含 storage_loss', foodIds.includes('storage_loss'))
  /** 顺序有语义：先干（入仓前），再存（入仓后）。反了说明链条没想清。 */
  assert('先干燥后储存',
    foodIds.indexOf('drying_time') < foodIds.indexOf('storage_loss'),
    foodIds.indexOf('drying_time') + ' < ' + foodIds.indexOf('storage_loss'))
  /** 储存必须发生在「总产之后」—— 不可能先算存量再算产量。 */
  assert('储存排在总产之后',
    foodIds.indexOf('grain_yield_total') < foodIds.indexOf('storage_loss'), '')

  const time = sys.FORMULA_SYSTEMS.find((s) => s.id === 'sys-time')
  const timeIds = time.steps.map((s) => s.formula)
  assert('时间链含 tolerance_stack', timeIds.includes('tolerance_stack'))
  assert('公差排在传动比之前',
    timeIds.indexOf('tolerance_stack') < timeIds.indexOf('gear_geometry'), '')
}

console.log('-- 6. 元信息完整（检索质量）--')
{
  for (const id of ['storage_loss', 'drying_time', 'tolerance_stack']) {
    const f = fm.FORMULA_INDEX.get(id)
    assert(id + ' 已入库', !!f)
    assert(id + ' 有 desc', !!f?.desc && f.desc.length > 200, String(f?.desc?.length))
    assert(id + ' 有 keys', Array.isArray(f?.keys) && f.keys.length >= 5, String(f?.keys?.length))
    assert(id + ' 有单位', !!f?.unit, String(f?.unit))
    /** 硬要求：每条工艺公式都要写局限。 */
    assert(id + ' 标了局限', /⚠/.test(f?.desc ?? ''), '')
  }
  assert('公式总数 ≥ 528', fm.FORMULAS.length >= 528, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)