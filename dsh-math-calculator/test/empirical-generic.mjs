/**
 * 经验公式的底层原理拆解与三级适用性标注。
 *
 * ## 这套测试守什么（2026-10-26 重写）
 *
 * 上一版把 `hull_speed` 标成「可泛化」，等于宣称 Fr=0.4 换世界也精确成立。
 * 复核后发现两件事：
 *
 * 1. **Fr≈0.4 有物理内核**：深水重力波色散 c=√(gλ/2π)，取 λ≈船长得
 *    v≈√(gL/2π)≈0.4√(gL)。**0.4 ≈ 1/√(2π)**（实测 0.3989 ≈ 0.4），
 *    所以它不是拟合，是色散关系的推论。
 *
 * 2. **但 0.4 的数值仍依赖介质**：隐含「类水液体 + 表面张力可忽略 +
 *    兴波阻力主导」。换液氨/岩浆时临界 Fr 会移动。
 *
 * 所以分级从两级改成三级：
 *
 * | 级别 | 含义 |
 * |---|---|
 * | `dimensionless` | 形式与数值都跨世界成立（克莱伯 0.75） |
 * | `scalable-with-caveat` | **形式**可泛化，**系数**需重验（Fr=0.4） |
 * | `earth-only` | 形式本身就是地球拟合，换世界无意义（Mifflin） |
 *
 * ## 另一个重点：earth-only 必须明确标注
 *
 * 作者最容易被坑的是「看起来像普适物理、实际是人类样本回归」的式子：
 * 风寒指数、酷热指数、Du Bois 表面积、Mifflin 代谢、220-年龄心率。
 * 这些必须有显眼标注，不能让人误以为能换世界用。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-empirical2-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const emp = await import(pathToFileURL(join(root, 'lib/empirical-decomposition.js')).href)
const { FORMULA_INDEX } = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一条公式。 */
async function calc(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return { ok: false, text: String(r.result).slice(0, 120) }
  return { ok: true, answer: Number(r.value && r.value.answer), text: String(r.result) }
}

console.log('-- 1. 三级分类必须齐全且不混 --')
{
  const notes = emp.EMPIRICAL_NOTES
  assert('拆解条目 ≥ 14', notes.length >= 14, String(notes.length))

  for (const kind of ['dimensionless', 'scalable-with-caveat', 'earth-only']) {
    const list = emp.notesByKind(kind)
    assert('有「' + emp.KIND_LABEL[kind] + '」类', list.length > 0, String(list.length))
  }

  // 关键：hull_speed 必须降级到 middle 档，不能留在 dimensionless
  const hull = emp.empiricalNoteOf('hull_speed')
  assert('hull_speed 归为「形式可泛化但系数需重验」',
    hull.kind === 'scalable-with-caveat', hull.kind)
  assert('hull_speed **不再**被标为无量纲通用',
    hull.kind !== 'dimensionless', hull.kind)

  // 每条都必须有底层原理
  for (const note of notes) {
    assert(note.id + ' 有底层原理',
      typeof note.principle === 'string' && note.principle.length > 20,
      note.principle ? note.principle.slice(0, 30) : '(缺失)')
  }
}

console.log('-- 2. 底层原理必须真的说对 --')
{
  // 1.34 的来源：Fr≈0.4 来自色散关系 1/√(2π)
  const hull = emp.empiricalNoteOf('hull_speed')
  assert('hull_speed 原理提到色散关系', /色散|c\s*=\s*√|2π/.test(hull.principle),
    hull.principle.slice(0, 60))
  assert('hull_speed 原理提到 1/√(2π)', /1\/√\(2π\)|2π/.test(hull.principle), '')
  // 并且要说明系数仍依赖介质
  assert('hull_speed 说明了介质依赖',
    /类水|介质|表面张力/.test(hull.retuneNeeded), hull.retuneNeeded.slice(0, 60))

  // 数学自证：0.4 ≈ 1/√(2π) = 0.3989
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI)
  assert('1/√(2π) ≈ 0.3989（与 Fr≈0.4 吻合）',
    Math.abs(invSqrt2Pi - 0.4) < 0.005, invSqrt2Pi.toFixed(4))

  // 宜居带的 √L 来自平方反比
  const hz = emp.empiricalNoteOf('habitable_zone')
  assert('宜居带原理提到平方反比', /平方反比|r²|辐照/.test(hz.principle), hz.principle.slice(0, 60))
  assert('宜居带说明了 1.1 依赖大气', /大气|温室/.test(hz.retuneNeeded), hz.retuneNeeded.slice(0, 50))

  // 露点的底层是 Clausius-Clapeyron
  const dew = emp.empiricalNoteOf('dew_point_magnus')
  assert('露点原理提到 Clausius-Clapeyron',
    /Clausius|克劳修斯|汽化潜热/.test(dew.principle), dew.principle.slice(0, 50))

  // 风寒的底层是对流换热
  const wc = emp.empiricalNoteOf('wind_chill')
  assert('风寒原理提到对流换热', /对流|换热|散热/.test(wc.principle), wc.principle.slice(0, 50))
}

console.log('-- 3. earth-only 必须明确标注且不能给假普适形式 --')
{
  const earthOnly = emp.notesByKind('earth-only')
  const EXPECTED = [
    'bmr_mifflin', 'human_body_surface_area', 'wind_chill',
    'heat_index', 'dew_point_magnus', 'max_heart_rate', 'widmark_bac',
  ]
  const ids = earthOnly.map((n) => n.id)
  for (const id of EXPECTED) {
    assert('标为仅地球成立: ' + id, ids.includes(id), '')
  }

  // earth-only 不能有「可沿用的形式」——有就是误导
  const withGeneric = earthOnly.filter((n) => n.genericForm)
  assert('earth-only 不声称「可沿用的形式」',
    withGeneric.length === 0, withGeneric.map((n) => n.id).join(',') || '无')

  // 但必须说清「换世界怎么办」
  for (const note of earthOnly) {
    assert(note.id + ' 给了替代路径或说明',
      note.advice.length > 20 && Boolean(note.breaksWhen), '')
  }
}

console.log('-- 4. 普适版公式：形式对，且真的随参数变 --')
{
  // 船速：地球 vs 1.5g
  const earth = await calc('hull_speed_generic', { g: 9.80665, length: 100 })
  const heavy = await calc('hull_speed_generic', { g: 14.71, length: 100 })
  assert('地球 100 m 船约 24.4 节', Math.abs(earth.answer - 24.35) < 0.2, String(earth.answer))
  assert('1.5 g 同一艘船约 29.8 节', Math.abs(heavy.answer - 29.83) < 0.2, String(heavy.answer))
  // 但关键是：这个 22% 差异**只在地球介质的 Fr=0.4 下成立**
  assert('1.5 g 与 1 g 的比值 = √1.5（因为 √g 标度）',
    Math.abs(heavy.answer / earth.answer - Math.sqrt(1.5)) < 1e-3,
    (heavy.answer / earth.answer).toFixed(4))

  // 宜居带：√L 标度
  const hz1 = await calc('habitable_zone_generic', {})
  const hz4 = await calc('habitable_zone_generic', { luminosity: 4 })
  assert('L=1 → 0.95 AU', Math.abs(hz1.answer - 0.9535) < 0.01, String(hz1.answer))
  assert('L=4 → 1.91 AU（√4=2 倍）',
    Math.abs(hz4.answer / hz1.answer - 2) < 1e-6, (hz4.answer / hz1.answer).toFixed(4))
}

console.log('-- 5. 拆出来的基础件自洽 --')
{
  const solar = await calc('solar_flux_at_1au', {})
  assert('太阳常数 1361 W/m²', solar.answer === 1361, String(solar.answer))

  const flux = await calc('inverse_square_flux', { flux0: 1361, distance0: 1, distance: 2 })
  assert('2 AU 处辐照是 1/4', Math.abs(flux.answer - 340.25) < 0.1, String(flux.answer))

  // 饱和蒸气压：水在 373.15 K = 1 atm
  const sat = await calc('evaporation_saturation_generic', { T: 373.15 })
  assert('水在沸点 1 atm', Math.abs(sat.answer - 101325) < 10, String(sat.answer))
  // 换溶剂：氨
  const nh3 = await calc('evaporation_saturation_generic',
    { T: 239.8, latent: 23400, T0: 239.8 })
  assert('氨在它的沸点也是 1 atm', Math.abs(nh3.answer - 101325) < 10, String(nh3.answer))

  // 对流：稀薄大气散热差
  const thick = await calc('convective_cooling_generic', { v: 1, density: 1.225 })
  const thin = await calc('convective_cooling_generic', { v: 1, density: 0.12 })
  assert('0.1 atm 散热系数约地球 15%',
    thin.answer / thick.answer > 0.1 && thin.answer / thick.answer < 0.2,
    (thin.answer / thick.answer).toFixed(3))
}

console.log('-- 6. 工具输出必须带三级标注 --')
{
  // middle 档：船速
  const hull = await calc('hull_speed', { L: 100 })
  assert('hull_speed 输出标「形式可泛化」',
    /形式可泛化/.test(hull.text), '')
  assert('hull_speed 输出含「底层原理」', /底层原理/.test(hull.text), '')
  assert('hull_speed 输出含「必须重新标定的」', /必须重新标定的/.test(hull.text), '')

  // earth-only：Mifflin
  const bmr = await calc('bmr_mifflin', { m: 70, h: 175, age: 30 })
  assert('Mifflin 输出标「仅在现实」，',
    /仅在现实/.test(bmr.text), '')
  assert('Mifflin 输出说明换物种失效', /换物种/.test(bmr.text), '')

  // dimensionless：克莱伯（参数名是 B0/m0/m，不是 M）
  const kleiber = await calc('kleiber', { B0: 70, m0: 1, m: 70 })
  assert('克莱伯输出标「无量纲通用」', /无量纲通用/.test(kleiber.text),
    kleiber.ok ? kleiber.text.slice(-120) : kleiber.text.slice(0, 80))

  // 普通公式不受打扰
  const plain = await calc('kinetic_energy', { m: 2, v: 10 })
  assert('普通公式不追加大段说明', !/适用域：/.test(plain.text), '')
}

console.log('-- 7. 新旧并存，且旧版被正确「祛魅」--')
{
  assert('旧版 hull_speed 仍在（工程界标准）', FORMULA_INDEX.has('hull_speed'), '')
  assert('新版 hull_speed_generic 也在', FORMULA_INDEX.has('hull_speed_generic'), '')

  // 100 ft = 30.48 m，两版在地球重力下应一致
  const oldOne = await calc('hull_speed', { L: 100 })
  const newOne = await calc('hull_speed_generic', { g: 9.80665, length: 30.48 })
  assert('两版在 100 ft 处结果一致（同一条船）',
    Math.abs(oldOne.answer - newOne.answer) < 0.3,
    oldOne.answer.toFixed(2) + ' vs ' + newOne.answer.toFixed(2))
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
