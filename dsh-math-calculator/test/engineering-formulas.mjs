/**
 * 工程 / 生物 / 宏观经济公式（第九、十批，共 29 条）。
 *
 * ## 这批测试守什么
 *
 * 新增公式最容易出的错不是「算错」，而是**算出一个看着正常的错数**：
 * 参数默认值落在定义域外（除零、log 负数），或者单位没写对导致量纲差几个数量级。
 * 所以这里每条都**手算核对**，并把「scaling 律」写进断言 ——
 * 那些式子（跨度的四次方、风速的三次方、营养级的十分之一）
 * 正是作者最容易记错、也最容易在本项目里被验证的部分。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-eng-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const { FORMULAS } = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 取公式的结果数值。 */
async function compute(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides })
  return { ok: r.ok, value: r.ok ? Number(r.value?.answer) : null, text: String(r.result || '') }
}

console.log('-- 1. 工程结构：手算核对 --')
{
  /** W = b·h²/6，b=0.2 h=0.4 → 0.2×0.16/6 = 0.0053333 */
  const w = await compute('beam_section_modulus', { b: 0.2, h: 0.4 })
  assert('抗弯截面系数', Math.abs(w.value - 0.00533333) < 1e-7, String(w.value))

  /** I = b·h³/12 = 0.2×0.064/12 = 0.0010667 */
  const i = await compute('rect_inertia', { b: 0.2, h: 0.4 })
  assert('矩形惯性矩', Math.abs(i.value - 0.00106667) < 1e-7, String(i.value))

  /** σ = M/W = 50000/0.0053333 = 9.375e6 Pa = 9.375 MPa */
  const s = await compute('beam_bending_stress', { M: 50000, b: 0.2, h: 0.4 })
  assert('弯曲应力 9.375 MPa', Math.abs(s.value - 9.375) < 1e-6, String(s.value))

  /**
   * ★ 这条守的是「跨度的四次方」——结构工程最陡的一条 scaling。
   * 跨度翻倍，挠度应该正好 16 倍。手算核对很难，但比值一比就出来了。
   */
  const d1 = await compute('beam_uniform_load_deflection', { q: 1000, L: 5, I: 0.00106667 })
  const d2 = await compute('beam_uniform_load_deflection', { q: 1000, L: 10, I: 0.00106667 })
  assert('挠度随跨度四次方（翻倍 16 倍）', Math.abs(d2.value / d1.value - 16) < 1e-6,
    (d2.value / d1.value).toFixed(4))

  /** 自重弯矩是跨度的平方律：翻倍变 4 倍 */
  const m1 = await compute('beam_self_weight_moment', { b: 0.2, h: 0.4, L: 5 })
  const m2 = await compute('beam_self_weight_moment', { b: 0.2, h: 0.4, L: 10 })
  assert('自重弯矩随跨度平方（翻倍 4 倍）', Math.abs(m2.value / m1.value - 4) < 1e-6,
    (m2.value / m1.value).toFixed(4))
}

console.log('-- 2. 热机：效率上限与 scaling --')
{
  /** 卡诺：1 - 373/773 = 0.5175 */
  const c = await compute('thermal_efficiency_carnot', { Th: 773, Tc: 373 })
  assert('卡诺效率 0.5175', Math.abs(c.value - 0.517464) < 1e-5, String(c.value))

  /** 等温时效率为 0 —— 边界必须正确，不能给负数 */
  const zero = await compute('thermal_efficiency_carnot', { Th: 300, Tc: 300 })
  assert('同温效率为 0', Math.abs(zero.value) < 1e-12, String(zero.value))

  /** 煤耗与功率成正比：功率翻倍，煤耗翻倍 */
  const coal1 = await compute('boiler_coal_rate', { P: 1e6 })
  const coal2 = await compute('boiler_coal_rate', { P: 2e6 })
  assert('煤耗与功率成正比', Math.abs(coal2.value / coal1.value - 2) < 1e-9,
    (coal2.value / coal1.value).toFixed(4))

  /** 保温材料的 k 比钢小 1000 倍 —— 这是「隔热」的核心比值 */
  const rockwool = await compute('conduction_wall_loss', { k: 0.04, A: 10, dT: 20, d: 0.1 })
  const steel = await compute('conduction_wall_loss', { k: 45, A: 10, dT: 20, d: 0.1 })
  assert('岩棉比钢隔热 1125 倍', Math.abs(steel.value / rockwool.value - 1125) < 1e-6,
    (steel.value / rockwool.value).toFixed(1))
}

console.log('-- 3. 流体与能量：平方律与三次方律 --')
{
  /** Q = v·π·d²/4，d=0.3 v=1.5 → 0.1060 */
  const q = await compute('pipe_flow_rate', { v: 1.5, d: 0.3 })
  assert('管道流量 0.106', Math.abs(q.value - 0.106029) < 1e-5, String(q.value))

  /** 管径翻倍流量变 4 倍 */
  const q2 = await compute('pipe_flow_rate', { v: 1.5, d: 0.6 })
  assert('管径翻倍流量变 4 倍', Math.abs(q2.value / q.value - 4) < 1e-9,
    (q2.value / q.value).toFixed(4))

  /** 水头损失是流速平方律 */
  const h1 = await compute('darcy_head_loss', { f: 0.02, L: 100, d: 0.3, v: 1.5 })
  const h2 = await compute('darcy_head_loss', { f: 0.02, L: 100, d: 0.3, v: 3.0 })
  assert('水头损失随流速平方', Math.abs(h2.value / h1.value - 4) < 1e-6,
    (h2.value / h1.value).toFixed(4))

  /** 风功率是风速三次方律 —— 最反直觉的一条 */
  const w1 = await compute('wind_power_available', { A: 1000, v: 5 })
  const w2 = await compute('wind_power_available', { A: 1000, v: 10 })
  assert('风功率随风速三次方（翻倍 8 倍）', Math.abs(w2.value / w1.value - 8) < 1e-9,
    (w2.value / w1.value).toFixed(4))

  /** 水轮机与水泵：同一组数，η 一个乘一个除 */
  const pump = await compute('pump_power', { Q: 0.1, H: 20 })
  const turbine = await compute('water_turbine_power', { Q: 0.1, H: 20 })
  const ratio = (pump.value / turbine.value).toFixed(4)
  assert('水泵/水轮机 = 1/η²', Math.abs(Number(ratio) - 1 / (0.7 * 0.85)) < 1e-3, ratio)
}

console.log('-- 4. 生态：载畜量与十分之一定律 --')
{
  /** 400 ha、3000 kg/(ha·年)、利用率 0.5、牛 50 kg/日 → 32.88 头 */
  const g = await compute('grazing_capacity', { area: 400, yield_per_ha: 3000, intake: 50 })
  assert('载畜量 32.88 头', Math.abs(g.value - 32.8767) < 1e-3, String(g.value))

  /** 面积翻倍，载畜量翻倍（线性） */
  const g2 = await compute('grazing_capacity', { area: 800, yield_per_ha: 3000, intake: 50 })
  assert('载畜量随面积线性', Math.abs(g2.value / g.value - 2) < 1e-9,
    (g2.value / g.value).toFixed(4))

  /** 营养级每升一级剩 10% —— 1000 kg 草到第 3 级只剩 1 kg */
  const t3 = await compute('trophic_chain_support', { primary: 1000, level: 3 })
  assert('三级营养级剩 1 kg', Math.abs(t3.value - 1) < 1e-9, String(t3.value))
  const t4 = await compute('trophic_chain_support', { primary: 1000, level: 4 })
  assert('四级剩 0.1 kg', Math.abs(t4.value - 0.1) < 1e-9, String(t4.value))

  /** 出栏天数：(110-1.5)/0.8 = 135.6 */
  const growth = await compute('livestock_growth_time', { target_weight: 110, birth_weight: 1.5, adg: 0.8 })
  assert('出栏 135.6 日', Math.abs(growth.value - 135.625) < 1e-6, String(growth.value))

  /** 料肉比 280/100 = 2.8 */
  const fcr = await compute('feed_conversion_ratio', { feed_consumed: 280, weight_gain: 100 })
  assert('料肉比 2.8', Math.abs(fcr.value - 2.8) < 1e-9, String(fcr.value))
}

console.log('-- 5. 宏观经济：恒等式与推导 --')
{
  /** 劳力 = 人口 × 参与率 */
  const lf = await compute('labor_force', { population: 1e6 });
  assert('劳力 = 100 万 × 0.5', Math.abs(lf.value - 500000) < 1e-6, String(lf.value))

  /** 资本产出比 = 储蓄率/增长率：0.2/0.05 = 4 */
  const cor = await compute('capital_output_ratio', { savings_rate: 0.2, growth_rate: 0.05 })
  assert('资本产出比 4', Math.abs(cor.value - 4) < 1e-9, String(cor.value))

  /** 通胀 ≈ (货币增速 - 产出增速)×100 = 12% */
  const inf = await compute('inflation_from_money_growth', { money_growth: 0.15, output_growth: 0.03 })
  assert('通胀 12%', Math.abs(inf.value - 12) < 1e-9, String(inf.value))

  /** 货币供应 = 基础货币 × 乘数 */
  const ms = await compute('money_supply_from_base', { base_money: 1e9 });
  assert('货币供应 5 倍基础货币', Math.abs(ms.value - 5e9) < 1, String(ms.value))

  /** 产出 = 劳力 × 人均产出 */
  const gdp = await compute('gdp_from_labor', { labor: 500000, output_per_worker: 2000 })
  assert('总产出 1e9', Math.abs(gdp.value - 1e9) < 1e-3, String(gdp.value))
}

console.log('-- 6. 全部新公式必须有单位与域标签 --')
{
  /**
   * 限定在**本批新增的 id**，而不是整个目录 ——
   * `econ/macro` 里还有两条既有条目（`money_multiplier`、`gdp_growth`）本来就没写单位和标签，
   * 那是历史遗留，不该让本批的测试替它们背锅。
   */
  const NEW_IDS = [
    'beam_section_modulus', 'beam_bending_stress', 'beam_self_weight_moment',
    'beam_uniform_load_deflection', 'rect_inertia', 'bolt_shear_capacity', 'weld_throat_capacity',
    'thermal_efficiency_carnot', 'steam_power_output', 'boiler_coal_rate',
    'heat_exchanger_duty', 'conduction_wall_loss',
    'pipe_flow_rate', 'darcy_head_loss', 'pump_power', 'orifice_discharge',
    'wind_power_available', 'water_turbine_power',
    'grazing_capacity', 'livestock_growth_time', 'feed_conversion_ratio',
    'crop_yield_npp', 'trophic_chain_support',
    'labor_force', 'gdp_from_labor', 'macro_savings_rate', 'capital_output_ratio',
    'money_supply_from_base', 'inflation_from_money_growth',
  ]
  const batch = FORMULAS.filter((f) => NEW_IDS.includes(f.id))
  assert('本批新增 29 条全部在库里', batch.length === 29, String(batch.length))
  const noUnit = batch.filter((f) => !f.unit)
  assert('每条都声明单位', noUnit.length === 0, noUnit.map((f) => f.id).join(','))
  const noDomain = batch.filter((f) => !f.domains || f.domains.length === 0)
  assert('每条都标学科领域', noDomain.length === 0, noDomain.map((f) => f.id).join(','))
  const noFreq = batch.filter((f) => !f.frequency)
  assert('每条都标频次', noFreq.length === 0, noFreq.map((f) => f.id).join(','))
  /** id 必须唯一（后批次覆盖同名 id 是允许的，但这一批不许撞现有 id）。 */
  const ids = new Set(batch.map((f) => f.id))
  assert('本批 id 唯一', ids.size === batch.length, String(ids.size))
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)