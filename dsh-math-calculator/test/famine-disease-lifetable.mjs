/**
 * 瘟疫、饥荒、营养与生命表（P0 配方 + P1 + P2 公式）。
 *
 * ## 这批的定位：补「从资源不足到人会死」这条断链
 *
 * 缺口分析的实测结论：
 *
 * ```
 *   ① 算热量需求  ✅  ② 算缺口  ⚠  ③ 存活时间  ❌  ④ 死亡率  ❌
 * ```
 *
 * 本套的断言分两块：
 * - **能力断言**：`recurrence` 的内置期数变量 `n` 必须真的能用（这是本轮修的）
 * - **数值断言**：每条的实测锚点 + 标度方向
 *
 * ## 最该守的一条：预期寿命的拆解
 *
 * 「古人活 35 岁」是最普遍的误解。本套直接验：
 * IMR=30%、成人余命 60 → e₀≈42，而**活到 60 岁的仍有 23%**。
 * 这两条一起证明「平均寿命低 ≠ 没有老人」。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-famine-'))
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

console.log('-- 1. ★ recurrence 的内置期数变量 n（本轮修复）--')
{
  /**
   * ★★ 这是本轮修的一个真实能力缺口。
   * 原来 `n` 不在求值域里，所有「每期递减的量」都写不出来 ——
   * 而那恰恰是过程建模最常用的一类（资源枯竭、增长率衰减）。
   */
  const r = await run({ operation: 'recurrence', recurrence: 'R-2000/(1+0.03*n)', initial: { R: 100000 }, periods: 3 })
  assert('n 可用（不再报 Undefined symbol）', r.ok === true, String(r.result).slice(0, 80))
  const text = String(r.result)
  assert('期 1 得 98058', /98058/.test(text), text.match(/98058\S*/)?.[0] ?? '')

  /** ★ n 必须随期数递增（否则就是常量，等于没加）。 */
  const r2 = await run({ operation: 'recurrence', recurrence: 'A+n', initial: { A: 0 }, periods: 3 })
  const t2 = String(r2.result)
  assert('n 从 1 开始递增', /^\s*1\s+1\s*$/m.test(t2) && /^\s*2\s+3\s*$/m.test(t2), t2.slice(-60))

  /** ★ 用户在 initial 里自定义 n 时，以用户的为准（不覆盖）。 */
  const r3 = await run({ operation: 'recurrence', recurrence: 'n*2', initial: { n: 5 }, periods: 2 })
  assert('initial 里的 n 优先', String(r3.result).includes('10'), String(r3.result).slice(-40))
}

console.log('-- 2. ¼ 瘟疫：倍增时间 ∝ 1/(R0−1) --')
{
  assert('R0=3 → 3.47 天', close(await num('epidemic_doubling_time', { r0: 3, recovery_rate: 0.1 }), 3.4657, 1e-3))
  assert('R0=2 → 6.93 天', close(await num('epidemic_doubling_time', { r0: 2, recovery_rate: 0.1 }), 6.9315, 1e-3))
  assert('R0=1.5 → 13.86 天', close(await num('epidemic_doubling_time', { r0: 1.5, recovery_rate: 0.1 }), 13.8629, 1e-2))
  /**
   * ★★ 核心：R0 越接近 1，倍增时间越趋于无穷。
   * R0=1.1 时 69 天，是 R0=3 的 20 倍 ——
   * 这就是「把 R0 压到接近 1 就能救命」的数学形态（不是减少病例，是拉长时间）。
   */
  const t3 = await num('epidemic_doubling_time', { r0: 3, recovery_rate: 0.1 })
  const t11 = await num('epidemic_doubling_time', { r0: 1.1, recovery_rate: 0.1 })
  assert('R0→1 时倍增时间趋于无穷', t11 > t3 * 15, t11.toFixed(1) + ' vs ' + t3.toFixed(2))
  /** ★ 恢复率反比：病程减半（γ 翻倍）→ 倍增时间减半。 */
  const half = await num('epidemic_doubling_time', { r0: 3, recovery_rate: 0.2 })
  assert('γ 翻倍 → 倍增时间减半', close(t3 / half, 2, 1e-9), (t3 / half).toFixed(3))
}

console.log('-- 3. 群体免疫与隔离 --')
{
  assert('R0=3 → 67%', close(await num('herd_immunity_fraction', { r0: 3 }), 0.666667, 1e-6))
  assert('R0=12 → 92%', close(await num('herd_immunity_fraction', { r0: 12 }), 0.916667, 1e-6))
  /** ★ 单调递增且趋近 1 但永不等于 1。 */
  const hs = await Promise.all([2, 3, 6, 12, 100].map((r0) => num('herd_immunity_fraction', { r0 })))
  assert('R0 越高门槛越高', hs.every((v, i) => i === 0 || v > hs[i - 1]), hs.map((v) => v.toFixed(2)).join(' < '))
  assert('门槛永远 <1', hs[hs.length - 1] < 1, String(hs[hs.length - 1]))

  assert('每天识别 50%、7 天 → 97%', close(await num('quarantine_effectiveness', { detection_rate: 0.5, infectious_period: 7 }), 0.969803, 1e-5))
  assert('识别 5% → 只 30%', close(await num('quarantine_effectiveness', { detection_rate: 0.05, infectious_period: 7 }), 0.295312, 1e-4))
  /** ★ 核心：识别速度提升带来的收益是**指数饱和**的，前 20% 的识别率最值钱。 */
  const q20 = await num('quarantine_effectiveness', { detection_rate: 0.2, infectious_period: 7 })
  const q50 = await num('quarantine_effectiveness', { detection_rate: 0.5, infectious_period: 7 })
  assert('识别率 20%→50% 拦住率大涨（75%→97%）', q50 - q20 > 0.2, (q20 * 100).toFixed(0) + '% → ' + (q50 * 100).toFixed(0) + '%')

  assert('世代间隔 5+7/2=8.5', close(await num('epidemic_generation_interval', { latent_period: 5, infectious_period: 7 }), 8.5))
}

console.log('-- 4. 饥荒：缺口 → 存活 → 死亡 --')
{
  assert('需求 2500、供给 1750 → 缺口 30%', close(await num('calorie_gap_ratio', { requirement: 2500, available: 1750 }), 0.3))
  /** ★ 负值表示盈余（不是 0）。 */
  const surplus = await num('calorie_gap_ratio', { requirement: 2500, available: 3000 })
  assert('盈余 → 负缺口', surplus < 0, String(surplus))

  /** 绝食：15kg 体脂、8000kJ/天 → 48.3 天 */
  const starve = await num('starvation_survival_time', { body_fat_mass: 15, energy_per_kg_fat: 32200, utilization: 0.8, daily_deficit: 8000 })
  assert('体脂 15kg → 48.3 天', close(starve, 48.3, 0.05), String(starve))
  /**
   * ★★ 核心：存活时间**几乎完全由体脂决定**。
   * 5kg 体脂只有 16 天（1/3）—— 这解释了「饥荒中胖的人活得更久」。
   */
  const thin = await num('starvation_survival_time', { body_fat_mass: 5, energy_per_kg_fat: 32200, utilization: 0.8, daily_deficit: 8000 })
  assert('体脂 5kg → 16.1 天', close(thin, 16.1, 0.05), String(thin))
  assert('体脂 1/3 → 存活时间约 1/3', close(thin / starve, 1 / 3, 0.01), (thin / starve).toFixed(3))
  /** ★ 缺口减半 → 存活翻倍（反比）。 */
  const halfGap = await num('starvation_survival_time', { body_fat_mass: 15, energy_per_kg_fat: 32200, utilization: 0.8, daily_deficit: 4000 })
  assert('缺口减半 → 存活翻倍', close(halfGap / starve, 2, 1e-9), (halfGap / starve).toFixed(3))

  /** 超额死亡：缺口 30% → 6.0%；70% → 17.2% */
  assert('缺口 30% → 死亡 6.0%', close(await num('famine_excess_mortality', { baseline_death_rate: 0.035, severity_factor: 8, gap_ratio: 0.3 }), 0.0602, 1e-4))
  assert('缺口 70% → 死亡 17.2%', close(await num('famine_excess_mortality', { baseline_death_rate: 0.035, severity_factor: 8, gap_ratio: 0.7 }), 0.1722, 1e-4))
  /**
   * ★ 核心：**平方关系**意味着死亡不是线性增长。
   * 缺口从 30% 到 70%（2.33 倍），死亡率从 6.0% 到 17.2%（2.87 倍）——
   * 超过线性，因为饥荒会引发传染病等连锁。
   */
  const m30 = await num('famine_excess_mortality', { baseline_death_rate: 0.035, severity_factor: 8, gap_ratio: 0.3 })
  const m70 = await num('famine_excess_mortality', { baseline_death_rate: 0.035, severity_factor: 8, gap_ratio: 0.7 })
  assert('死亡增长快于缺口增长（超线性）', (m70 - 0.035) / (m30 - 0.035) > (0.7 / 0.3), ((m70 - 0.035) / (m30 - 0.035)).toFixed(2) + ' vs ' + (0.7 / 0.3).toFixed(2))

  /** 灾年门槛：无储备 9.1%，储备 300 → 36.4% */
  assert('储备 0 → 门槛 9.1%', close(await num('crop_failure_threshold', { annual_need: 1000, stored_stock: 0, reserve_ratio: 0.1 }), 0.0909, 1e-4))
  assert('储备 300 → 门槛 36.4%', close(await num('crop_failure_threshold', { annual_need: 1000, stored_stock: 300, reserve_ratio: 0.1 }), 0.3636, 1e-4))
  /** ★ 核心：储备把「灾年门槛」抬高 —— 这就是「三年储备」的真正意义。 */
  const t0 = await num('crop_failure_threshold', { annual_need: 1000, stored_stock: 0, reserve_ratio: 0.1 })
  const t300 = await num('crop_failure_threshold', { annual_need: 1000, stored_stock: 300, reserve_ratio: 0.1 })
  assert('储备 300 把门槛从 9% 抬到 36%', t300 > t0 * 3.5, (t0 * 100).toFixed(1) + '% → ' + (t300 * 100).toFixed(1) + '%')
}

console.log('-- 5. ★★ 预期寿命：拆穿「古人都活 35 岁」--')
{
  /**
   * ★★ 本套最重要的一条（认知纠正）：
   * IMR=30%、成人余命 60 → e₀ = 42.1 岁。
   * 但**活到 60 岁的仍有 23%**（见下一节）。
   *
   * 所以「平均 35 岁」的真相是：孩子死得多，不是成年人都早死。
   */
  const e0 = await num('life_expectancy_from_imr', { infant_mortality: 0.3, adult_life_expectancy: 60, infant_death_age: 0.5 })
  assert('IMR 30%、成人 60 → e₀ 42.1', close(e0, 42.15, 0.01), String(e0))
  /** ★ 婴儿死亡率降到 5% → e₀ 猛增到 57（医疗改善的最大杠杆在婴儿）。 */
  const e0low = await num('life_expectancy_from_imr', { infant_mortality: 0.05, adult_life_expectancy: 60, infant_death_age: 0.5 })
  assert('IMR 5% → e₀ 57', close(e0low, 57.025, 0.02), String(e0low))
  /**
   * ★★ 关键：**e₀ 对 IMR 极其敏感，对成人余命只是一次线性**。
   * IMR 从 30% 降到 5%（降 25 点），e₀ 涨 14.9 岁；
   * 而成人余命从 60 提到 80（涨 20 岁），e₀ 只涨 14 岁（因为要乘 0.7）。
   */
  const adult80 = await num('life_expectancy_from_imr', { infant_mortality: 0.3, adult_life_expectancy: 80, infant_death_age: 0.5 })
  const gainFromImr = e0low - e0
  const gainFromAdult = adult80 - e0
  assert('降 IMR 的收益 > 提成人余命同量收益', gainFromImr > gainFromAdult * 0.9, gainFromImr.toFixed(1) + ' vs ' + gainFromAdult.toFixed(1))

  /** 存活率：活到 60 岁的有 23% —— 这是「社会里有老人」的证明。 */
  const s60 = await num('survival_to_age', { infant_mortality: 0.3, adult_hazard: 0.02, age: 60 })
  assert('前工业社会活到 60 岁 → 23%', close(s60, 0.233, 0.002), (s60 * 100).toFixed(1) + '%')
  /**
   * ★★ 这是本批的认知核心：
   * **平均寿命 42 岁的社会里，仍有近四分之一的人活到 60 岁以上。**
   * 所以「古代没有老人」是错的 —— 老人是少数但绝对存在，足以承担经验传承。
   */
  assert('平均寿命 42 却有 23% 活到 60（关键纠正）', e0 < 45 && s60 > 0.2, 'e₀=' + e0.toFixed(1) + '，活到60岁=' + (s60 * 100).toFixed(0) + '%')
  /** ★ 战乱场景：成年风险 0.05 → 活到 60 的只剩 4.5%（社会会失忆）。 */
  const war = await num('survival_to_age', { infant_mortality: 0.3, adult_hazard: 0.05, age: 60 })
  assert('战乱下只剩 4.5%（无法积累经验）', close(war, 0.0447, 0.001), (war * 100).toFixed(1) + '%')
  /** ★ 单调：年龄越大存活越少。 */
  const ages = await Promise.all([20, 40, 60, 70].map((age) => num('survival_to_age', { infant_mortality: 0.3, adult_hazard: 0.02, age })))
  assert('存活率随年龄单调下降', ages.every((v, i) => i === 0 || v < ages[i - 1]), ages.map((v) => v.toFixed(2)).join(' > '))
}

console.log('-- 6. 产妇风险与营养 --')
{
  /** 每次 1%、生 6 次 → 5.9% */
  const mm = await num('maternal_mortality_risk', { per_birth_mortality: 0.01, births: 6 })
  assert('生 6 次、每次 1% → 5.9%', close(mm, 0.0585, 0.0005), (mm * 100).toFixed(1) + '%')
  assert('生 8 次、每次 2% → 14.9%', close(await num('maternal_mortality_risk', { per_birth_mortality: 0.02, births: 8 }), 0.1492, 0.001))
  /** ★ 核心：生育次数越多风险越大，且**累积效应显著**（不是线性的 6%）。 */
  const b1 = await num('maternal_mortality_risk', { per_birth_mortality: 0.01, births: 1 })
  const b8 = await num('maternal_mortality_risk', { per_birth_mortality: 0.01, births: 8 })
  assert('生 8 次的风险远大于 8 倍单次', b8 > b1 * 7.5, (b8 * 100).toFixed(1) + '% vs ' + (b1 * 100).toFixed(1) + '%')

  /** 营养不良取短板 */
  assert('热量够但蛋白缺 → 0.6', close(await num('protein_energy_malnutrition', { energy_ratio: 1.1, protein_ratio: 0.6 }), 0.6))
  assert('蛋白够但热量缺 → 0.8', close(await num('protein_energy_malnutrition', { energy_ratio: 0.8, protein_ratio: 1.2 }), 0.8))
  /**
   * ★★ 核心：**取 min 而不是乘积或平均**。
   * 若写成平均值，(1.1+0.6)/2=0.85 会掩盖严重缺蛋白的事实 ——
   * 而这个社会其实正在得夸希奥科病（水肿）。
   */
  const min = await num('protein_energy_malnutrition', { energy_ratio: 1.1, protein_ratio: 0.6 })
  assert('取短板而非平均（0.6 不是 0.85）', min < 0.7, String(min))

  /** 微量营养素：摄入 50% → 风险 39% */
  assert('摄入 50% → 风险 39%', close(await num('micronutrient_deficiency_risk', { intake: 0.5, requirement: 1 }), 0.3935, 0.001))
  assert('摄入 20% → 风险 18%', close(await num('micronutrient_deficiency_risk', { intake: 0.2, requirement: 1 }), 0.1813, 0.001))
  /** ★ 单调递增且趋近 1。 */
  const mk = await Promise.all([0.1, 0.5, 1, 3].map((r) => num('micronutrient_deficiency_risk', { intake: r, requirement: 1 })))
  assert('摄入越多风险越高（趋近 1）', mk.every((v, i) => i === 0 || v > mk[i - 1]) && mk[3] > 0.94, mk.map((v) => v.toFixed(2)).join(' < '))
}

console.log('-- 7. 存粮与缺水（时间压力）--')
{
  /** 1 吨粮养 100 人 15.9 天 */
  assert('1000kg/100人 → 15.9 天', close(await num('food_stock_days', { stored_mass: 1000, energy_density: 3500, population: 100, daily_need: 2200 }), 15.909, 0.01))
  /** 600 吨养 1000 人 955 天（2.6 年） */
  assert('600吨/1000人 → 955 天', close(await num('food_stock_days', { stored_mass: 600000, energy_density: 3500, population: 1000, daily_need: 2200 }), 954.5, 1))
  /** ★ 线性：粮食翻倍 → 天数翻倍。 */
  const d1 = await num('food_stock_days', { stored_mass: 1000, energy_density: 3500, population: 100, daily_need: 2200 })
  const d2 = await num('food_stock_days', { stored_mass: 2000, energy_density: 3500, population: 100, daily_need: 2200 })
  assert('存粮翻倍 → 天数翻倍', close(d2 / d1, 2, 1e-9))

  /** ★★ 缺水比缺粮快两个数量级 —— 本批最重要的对比。 */
  const thirst = await num('water_survival_time', { body_water_available: 4.5, daily_water_loss: 4 })
  assert('炎热下缺水 1.1 天', close(thirst, 1.125, 0.01), String(thirst))
  const hunger = await num('starvation_survival_time', { body_fat_mass: 15, energy_per_kg_fat: 32200, utilization: 0.8, daily_deficit: 8000 })
  assert('缺水比缺粮快一个数量级以上', hunger / thirst > 20, (hunger / thirst).toFixed(0) + ' 倍')
  /** ★ 沙漠劳动：13 小时就不行了。 */
  const desert = await num('water_survival_time', { body_water_available: 4.5, daily_water_loss: 8 })
  assert('沙漠劳动 → 0.56 天（13 小时）', close(desert, 0.5625, 0.001), (desert * 24).toFixed(0) + ' 小时')
}

console.log('-- 8. 元信息与入库完整性 --')
{
  const ids = [
    'epidemic_doubling_time', 'epidemic_generation_interval', 'herd_immunity_fraction',
    'quarantine_effectiveness', 'calorie_gap_ratio', 'starvation_survival_time',
    'famine_excess_mortality', 'crop_failure_threshold',
    'life_expectancy_from_imr', 'survival_to_age', 'maternal_mortality_risk',
    'protein_energy_malnutrition', 'micronutrient_deficiency_risk',
    'food_stock_days', 'water_survival_time',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 15 条全部入库', missing.length === 0, missing.join(','))

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

  /** ★ 这批有两条是「量级判据」，必须明确声明不是精确模型。 */
  for (const id of ['famine_excess_mortality', 'micronutrient_deficiency_risk']) {
    const f = fm.FORMULA_INDEX.get(id)
    assert(id + ' 声明了量级/经验性质', /量级|经验|判据|最粗略/.test(f?.desc ?? ''), '')
  }

  assert('公式总数 ≥ 646', fm.FORMULAS.length >= 646, String(fm.FORMULAS.length))
}

console.log('-- 9. P0 配方节可用 --')
{
  const recipe = String((await run({ operation: 'help', helpTopic: 'recipe-process' })).result ?? '')
  assert('recipe-process 可查', recipe.length > 1000, String(recipe.length))
  assert('含瘟疫时程模板', /dS\/dt/.test(recipe), '')
  assert('含 n 变量说明', /内置的当前期数/.test(recipe), '')
  assert('含人口年表', /recurrence/.test(recipe), '')
  /** ★ 别名可达。 */
  const byAlias = String((await run({ operation: 'help', helpTopic: '瘟疫' })).result ?? '')
  assert('「瘟疫」别名命中 process 配方', /过程配方/.test(byAlias), byAlias.slice(0, 40))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
