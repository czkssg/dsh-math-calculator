/**
 * 电学、光学、化学、核物理的 SI 单位（补齐量纲断层）。
 *
 * ## 这批为什么必须测
 *
 * 原来的单位表只有 4 个 SI 基本单位（m/kg/s/K），缺 A/mol/cd ——
 * 于是整个电学、光学、化学、核物理**无法换算**。
 *
 * 补齐后最危险的不是「算错」，而是**结构问题**：
 *   · 新量纲的基准单位写错 → 所有该量纲的换算静默偏掉
 *   · rad 撞名 → 查弧度永远命中辐射剂量（或反过来）
 *   · 欧姆只收一个 Unicode 码位 → 从不同来源粘贴的文字有一半认不出
 *
 * 所以本套的重点是结构不变量，不是逐个数值。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-si-'))
process.env.DSH_MATH_CALC_HOME = home

const unitsMod = await import(pathToFileURL(join(root, 'lib/units.js')).href)
const indexMod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { findUnit, UNITS, BASE_UNIT, DIMENSION_LABEL } = unitsMod
const run = indexMod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
function factorOf(name) {
  const hit = findUnit(name)
  return hit ? hit.factor : undefined
}
function near(a, b, tol = 1e-4) {
  return typeof a === 'number' && Math.abs(a / b - 1) < tol
}

console.log('-- 1. 量纲覆盖到 32 个，7 个 SI 基本单位全齐 --')
{
  const dims = new Set(UNITS.map(function (u) { return u.dimension }))
  assert('量纲总数 32', dims.size === 32, String(dims.size))
  // 七个 SI 基本单位各自的量纲，都必须有基准单位
  const seven = [['A', 'current'], ['mol', 'amount_of_substance'], ['cd', 'luminous_intensity'],
    ['m', 'length'], ['kg', 'mass'], ['s', 'time'], ['K', 'temperature']]
  for (const [unit, dim] of seven) {
    assert('基本单位 ' + unit + ' 存在且属 ' + dim, Boolean(findUnit(unit)) && BASE_UNIT[dim] === unit,
      findUnit(unit) ? findUnit(unit).dimension : '缺')
  }
  // 每个量纲都必须有中文名与基准单位
  for (const d of dims) {
    assert('量纲 ' + d + ' 有中文名', typeof DIMENSION_LABEL[d] === 'string' && DIMENSION_LABEL[d] !== '', '')
  }
}

console.log('-- 2. 新量纲的基准单位就是 SI 具名单位，且 factor = 1 --')
{
  const bases = [
    ['A', 'current'], ['C', 'charge'], ['V', 'voltage'], ['F', 'capacitance'],
    ['Ω', 'resistance'], ['S', 'conductance'], ['Wb', 'magnetic_flux'],
    ['T', 'magnetic_flux_density'], ['H', 'inductance'], ['sr', 'solid_angle'],
    ['cd', 'luminous_intensity'], ['lm', 'luminous_flux'], ['lx', 'illuminance'],
    ['mol', 'amount_of_substance'], ['Bq', 'activity'], ['Gy', 'absorbed_dose'],
    ['Sv', 'dose_equivalent'], ['kat', 'catalytic_activity'],
  ]
  for (const [unit, dim] of bases) {
    const u = findUnit(unit)
    assert(unit + ' 是 ' + dim + ' 的基准（factor=1）', u && u.dimension === dim && u.factor === 1,
      u ? u.dimension + ' f=' + u.factor : '缺')
  }
}

console.log('-- 3. rad 不许撞名：弧度归角度，辐射剂量用 rad_dose --')
{
  const angleRad = findUnit('rad')
  assert('rad 仍是平面角弧度', angleRad && angleRad.dimension === 'angle' && angleRad.factor === 1,
    angleRad ? angleRad.dimension : '缺')
  const dose = findUnit('rad (dose)')
  assert('rad (dose) 指向 rad_dose', dose && dose.name === 'rad_dose' && dose.dimension === 'absorbed_dose',
    dose ? dose.name + '/' + dose.dimension : '缺')
  assert('辐射 rad = 0.01 Gy（精确）', near(factorOf('rad (dose)'), 0.01), String(factorOf('rad (dose)')))
  // 反证：若撞名，查 rad 会得到剂量
  assert('查 rad 不会拿到剂量单位', angleRad && angleRad.dimension !== 'absorbed_dose', '')
}

console.log('-- 4. 欧姆两个 Unicode 码位都要认 --')
{
  /**
   * U+03A9（希腊字母 Omega）与 U+2126（欧姆符号）是两个不同码位。
   * 从不同来源粘贴的文字会带不同码位，只收一个就有一半认不出。
   */
  const greek = findUnit('\u03A9')
  const ohmSign = findUnit('\u2126')
  assert('U+03A9 可查', greek && greek.name === '\u03A9', greek ? greek.name : '缺')
  assert('U+2126 可查', ohmSign && ohmSign.name === '\u03A9', ohmSign ? ohmSign.name : '缺')
  assert('两个码位指向同一单位', greek && ohmSign && greek.name === ohmSign.name, '')
  assert('U+03A9 = U+2126 = 1 欧姆', near(greek.factor, 1) && near(ohmSign.factor, 1), '')
}

console.log('-- 5. 电学常用单位可换算 --')
{
  const cases = [
    ['1000 mAh → Ah', 1000, 'mAh', 'Ah', 1],
    ['12 V → mV', 12, 'V', 'mV', 12000],
    ['2.2 kΩ → Ω', 2.2, 'kΩ', '欧姆', 2200],
    ['1 MΩ → kΩ', 1, 'MΩ', 'kΩ', 1000],
    ['1 T → gauss', 1, 'T', 'gauss', 10000],
    ['1 gauss → T', 10000, 'G', 'T', 1],
    ['1 Ah → C', 1, 'Ah', 'C', 3600],
  ]
  for (const [label, v, from, to, expect] of cases) {
    const r = await run({ operation: 'units', unitValue: v, unitFrom: from, unitTo: to })
    assert(label, r.ok && near(r.value.result, expect), r.ok ? String(r.value.result) : (r.error && r.error.message))
  }
}

console.log('-- 6. 光学与立体角 --')
{
  assert('整球 = 4π sr', near(factorOf('sphere'), 4 * Math.PI), String(factorOf('sphere')))
  assert('1 sr = 3282.8 deg²', near(factorOf('deg²') * 0 + 1 / factorOf('deg²'), 3282.806), String(1 / factorOf('deg²')))
  const r = await run({ operation: 'units', unitValue: 1, unitFrom: 'sphere', unitTo: 'sr' })
  assert('整球 → sr 可换算', r.ok && near(r.value.result, 12.566370614359172), '')
  const r2 = await run({ operation: 'units', unitValue: 1, unitFrom: 'sr', unitTo: 'deg²' })
  assert('sr → deg² 可换算', r2.ok && near(r2.value.result, 3282.806), r2.ok ? String(r2.value.result) : '')
}

console.log('-- 7. 化学与核物理 --')
{
  assert('1 mmol = 1e-3 mol', near(factorOf('mmol'), 1e-3), String(factorOf('mmol')))
  assert('1 µmol = 1e-6 mol', near(factorOf('µmol'), 1e-6), String(factorOf('µmol')))
  assert('1 Ci = 3.7e10 Bq（精确）', findUnit('Ci').factor === 37000000000, String(findUnit('Ci').factor))
  assert('1 U ≈ 1.6667e-8 kat', near(factorOf('U'), 1.6666666666666667e-8), String(factorOf('U')))
  const r = await run({ operation: 'units', unitValue: 1000, unitFrom: 'mmol', unitTo: 'mol' })
  assert('1000 mmol = 1 mol', r.ok && near(r.value.result, 1), '')
  const r2 = await run({ operation: 'units', unitValue: 1, unitFrom: 'Ci', unitTo: 'Bq' })
  assert('1 Ci → Bq', r2.ok && r2.value.result === 37000000000, String(r2.ok && r2.value.result))
}

console.log('-- 8. 跨量纲必须被拒（不能"看起来能算"）--')
{
  const cases = [
    ['A → C', 'A', 'C'],
    ['F → C', 'F', 'C'],
    ['H → Wb', 'H', 'Wb'],
    ['S → kΩ', 'S', 'kΩ'],
    ['cd → lm', 'cd', 'lm'],
    ['Gy → Sv', 'Gy', 'Sv'],
  ]
  for (const [label, from, to] of cases) {
    const r = await run({ operation: 'units', unitFrom: from, unitTo: to })
    assert('跨量纲被拒: ' + label, !r.ok, r.ok ? '算出了 ' + r.value.result : '')
  }
}

console.log('-- 9. 无重名、无重别名、factor 合法 --')
{
  const seenName = new Set()
  const dupName = []
  for (const u of UNITS) {
    if (seenName.has(u.name)) dupName.push(u.name)
    seenName.add(u.name)
  }
  assert('单位名不重复', dupName.length === 0, dupName.join(','))
  const seenAlias = new Set()
  const dupAlias = []
  for (const u of UNITS) {
    for (const a of u.aliases || []) {
      if (seenAlias.has(a)) dupAlias.push(a)
      seenAlias.add(a)
    }
  }
  assert('别名不重复（含跨量纲）', dupAlias.length === 0, dupAlias.join(','))
  const bad = UNITS.filter(function (u) { return !Number.isFinite(u.factor) || u.factor <= 0 })
  assert('所有 factor 是正有限数', bad.length === 0, bad.map(function (u) { return u.name }).join(','))
  const badCat = UNITS.filter(function (u) { return u.category !== undefined && u.category !== 'measure' && u.category !== 'science' })
  assert('category 只用 measure/science', badCat.length === 0, badCat.map(function (u) { return u.name }).join(','))
}

console.log('-- 10. 列表输出包含新量纲 --')
{
  const t = String((await run({ operation: 'units' })).result || '')
  assert('摘要含「电流」', t.includes('电流'), '')
  assert('摘要含「物质的量」', t.includes('物质的量'), '')
  assert('摘要含「吸收剂量」', t.includes('吸收剂量'), '')
  const e = String((await run({ operation: 'units', unitScale: 'voltage' })).result || '')
  assert('unitScale=voltage 可展开', e.includes('V') && e.includes('电压'), e.slice(0, 80))
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
