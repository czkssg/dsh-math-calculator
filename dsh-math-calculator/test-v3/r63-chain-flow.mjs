/**
 * 公式体系：链的物理量流（dataFlow）。
 *
 * 标准：上一步的输出物理量 → 下一步的同量参数；fromStep 必须小于当前步。
 * 锁三件事：结构合法、映射数量、四条链真的把值传下去了。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const systems = JSON.parse(readFileSync(join(root, 'src/data/systems.json'), 'utf8'))
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const chains = Array.isArray(systems) ? systems : (systems.systems || [])
const { buildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const { runChainNumeric } = await import(pathToFileURL(join(root, 'lib/features/formulas/chain-run.js')).href)
const engine = buildEngine()

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. 结构合法性 --')
{
  let mapped = 0
  const bad = []
  for (const chain of chains) {
    chain.steps.forEach((step, index) => {
      for (const [param, mapping] of Object.entries(step.dataFlow || {})) {
        mapped += 1
        const formula = formulas.find((f) => f.id === step.formula)
        if (!formula?.params?.[param]) bad.push(chain.id + '#' + (index + 1) + '.' + param + ' 不是参数')
        if (mapping.fromStep < 1 || mapping.fromStep >= index + 1) bad.push(chain.id + '#' + (index + 1) + '.' + param + ' fromStep=' + mapping.fromStep)
        if (!chain.steps[mapping.fromStep - 1]) bad.push(chain.id + ' fromStep 越界')
      }
    })
  }
  assert('★ 所有 dataFlow 合法（参数存在、fromStep 顺向）', bad.length === 0, bad.slice(0, 4).join(' | '))
  assert('★ 物理量流映射 ≥ 15 条', mapped >= 15, String(mapped))
}

console.log('-- 2. 结构链：惯性矩 → 挠度/屈曲 --')
{
  const init = {
    b: 0.2, h: 0.4, E: 2e11, eps: 0.001, rho: 7850, g: 9.81, L: 6, q: 5000, I: 1, K: 1,
    n: 1, tau: 1.4e8, d: 0.02, F: 5000, sigma_b: 3e7, p: 1e6, r: 0.5, t: 0.01,
    alpha: 1.2e-5, dT: 30, total_area: 100, delta_T: 20, r_value: 2, ventilation_loss: 0,
    sigma_y: 2.35e8, A: 0.04,
  }
  const out = runChainNumeric(formulas, chains, 'sys-structure', engine, init)
  const steps = out.value.steps
  const step3 = steps[2].value
  for (const [index, param] of [[5, 'I'], [6, 'I'], [9, 'I']]) {
    const entry = steps[index - 1]
    assert('第 ' + index + ' 步 I ← 第 3 步', entry?.linked?.I?.fromStep === 3, JSON.stringify(entry?.linked))
    assert('第 ' + index + ' 步 I 值一致', Math.abs(entry.linked.I.value - step3) < 1e-9, '')
  }
}

console.log('-- 3. 能源链：热损 → 锅炉功率、炉效 → 锅炉效率 --')
{
  const init = {
    mass: 1000, energy_density: 2.9e7, flue_loss: 0.35, wall_loss: 0.08, unburnt_loss: 0.04,
    ware_mass: 100, ware_specific_heat: 1000, delta_T: 1080, shell_loss_ratio: 12, heating_rate: 150,
    total_area: 200, r_value: 2, ventilation_loss: 0, P: 1, coal_cv: 2.93e7, eta: 0.7,
    Th: 800, Tc: 300, carnot_cop: 2, isentropic_efficiency: 0.6,
    specific_heat: 4186, temperature_span: 30, k: 0.5, A: 10, dT: 20, L: 0.2,
    rho: 1000, g: 9.81, Q: 0.1, H: 10, diffusion_coeff: 2e-9, area: 100, delta_conc: 10,
    thickness: 1e-6, mdot: 1, dh: 2e6, d: 0.05, sigma: 5.670374419e-8, T: 800, emissivity: 1,
    resistance: 100, capacitance: 1e-6, v: 8, cp: 0.45,
  }
  const out = runChainNumeric(formulas, chains, 'sys-energy', engine, init)
  const steps = out.value.steps
  const step2 = steps[1].value
  const step5 = steps[4].value
  const step6 = steps[5]
  assert('★ 锅炉 P ← 第 5 步热损', step6?.linked?.P?.fromStep === 5, JSON.stringify(step6?.linked))
  assert('锅炉 eta ← 第 2 步炉效', step6?.linked?.eta?.fromStep === 2, JSON.stringify(step6?.linked))
  assert('P 值 = 第 5 步输出', Math.abs(step6.linked.P.value - step5) < 1e-6, '')
  assert('eta 值 = 第 2 步输出', Math.abs(step6.linked.eta.value - step2) < 1e-9, '')
}

console.log('-- 4. 生物链：体表面积 → 扩散面积 --')
{
  const init = {
    mass: 70, surface_coeff: 0.11, diffusion_coeff: 2e-9, delta_conc: 10, thickness: 1e-6,
    distance: 1e-3, length: 0.01, velocity: 0.01, vmax: 100, km: 5, substrate: 10, W: 70,
    asymptote: 100, shape: 0.1, rate: 0.05, t: 10,
  }
  const out = runChainNumeric(formulas, chains, 'sys-body', engine, init)
  const steps = out.value.steps
  const step1 = steps[0].value
  const step3 = steps[2]
  assert('★ 扩散面积 ← 第 1 步表面积', step3?.linked?.area?.fromStep === 1, JSON.stringify(step3?.linked))
  assert('面积值一致', Math.abs(step3.linked.area.value - step1) < 1e-9, '')
}

console.log('-- 5. 食物链：总产 → 入储 → 可用粮 → 劳力 --')
{
  const init = {
    rate_ref: 1, temperature: 20, temp_ref: 10, excess_daily_temp: 10, days: 120,
    NPP: 1500, area: 200, hi: 0.4, area_hectare: 100, kg_per_hectare: 3000,
    m_initial: 0.25, m_final: 0.13, k_dry: 0.15, loss_rate: 0.04, years: 2,
    food_mass: 1000, rack_area: 20, loading_density: 5,
    kcal_per_kg: 3500, kcal_per_person_day: 2200, consumed: 1e5,
    Tmax: 30, Tmin: 18, Tbase: 10, area_ha: 100, yield_per_ha: 3000, food_kcal: 1e9,
    heads: 10, daily_feed_kg: 5, labor_days_per_ha: 20, W: 70,
    k: 70, exponent: 0.75, util: 0.5, intake: 5, area_m2: 1e5, depth_mm: 50, mass: 70,
    stock: 2000, input: 200, uptake: 150, leach: 20,
    participation: 0.5, primary: 1e6, eff: 0.1, level: 2, r: 0.1, population: 1e5, carrying_capacity: 2e5,
  }
  const out = runChainNumeric(formulas, chains, 'sys-food', engine, init)
  const steps = out.value.steps
  const step4 = steps[3].value
  const step5 = steps[4].value
  const step6 = steps[5].value
  assert('★ 入储量 ← 第 4 步总产', steps[5]?.linked?.initial?.fromStep === 4, JSON.stringify(steps[5]?.linked))
  assert('入储量值 = 第 4 步折损', Math.abs(step6 - step4 * (1 - 0.04) ** 2) < 1e-6, String(step6))
  assert('★ 可用粮 ← 第 6 步存后剩余', steps[8]?.linked?.grain_kg?.fromStep === 6, JSON.stringify(steps[8]?.linked))
  assert('可用粮值 = 第 6 步', Math.abs(steps[8].linked.grain_kg.value - step6) < 1e-9, '')
  assert('剩余率 yield ← 第 4 步', steps[9]?.linked?.yield?.fromStep === 4, JSON.stringify(steps[9]?.linked))
  assert('能量供给 mass_kg ← 第 12 步', steps[13]?.linked?.mass_kg?.fromStep === 12, JSON.stringify(steps[13]?.linked))
  assert('熏房 drying_days ← 第 5 步', steps[7]?.linked?.drying_days?.fromStep === 5, JSON.stringify(steps[7]?.linked))
  assert('晾干天数被熏房使用', steps[7].linked.drying_days.value === step5, '')
  assert('劳力 population ← 第 9 步', steps[22]?.linked?.population?.fromStep === 9, JSON.stringify(steps[22]?.linked))
}

console.log('-- 6. 单位歧义不拆标识符（回归）--')
{
  const { fixUnitAmbiguity } = await import(pathToFileURL(join(root, 'lib/core/unit-ambiguity.js')).href)
  assert('★ area_ha 不被改写', fixUnitAmbiguity('area_ha * yield_per_ha') === 'area_ha * yield_per_ha', fixUnitAmbiguity('area_ha'))
  assert('minutes_per_page 不被改写', fixUnitAmbiguity('minutes_per_page') === 'minutes_per_page', fixUnitAmbiguity('minutes_per_page'))
  assert('5 min 仍换成 minute', fixUnitAmbiguity('5 min') === '5 minute', fixUnitAmbiguity('5 min'))
  assert('L/min 仍换成 L/minute', fixUnitAmbiguity('L/min') === 'L/minute', fixUnitAmbiguity('L/min'))
  const { callFormula } = await import(pathToFileURL(join(root, 'lib/features/formulas/function.js')).href)
  const crop = callFormula(formulas, 'crop_total_yield', engine, { area_ha: 100, yield_per_ha: 3000 })
  assert('★ crop_total_yield 能正常调用（参数名含 ha）', String(crop.result).includes('300000'), String(crop.result).slice(-40))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
