/**
 * 经验公式的拆解与泛化。
 *
 * ## 这套测试守什么
 *
 * 公式库里有一批经验式把常数**烘焙进了系数**：
 *
 *   船舶极限航速 = 1.34 × sqrt(L_ft)   ← 1.34 里藏着 g=9.81，L 还是英尺
 *   宜居带内边界 = sqrt(L / 1.1)        ← 1.1 是地球温室条件下的辐照阈值
 *   硬度估强度  = 3 × H × 9.80665e6    ← 9.8 是地球重力换算
 *
 * 在地球上它们都对。但作者写 1.5 倍重力的星球时照抄就错，而且错得**隐蔽**：
 * 数字看着正常，只是用了地球的常数。
 *
 * 本套测试验两件事：
 *   1. 拆解表把「可泛化 / 无量纲通用 / 纯拟合」分清，且每条都说明藏了什么、何时失效
 *   2. 普适版公式真的能换参数——1.5 g 下船速确实变快 22%
 *
 * ## 核心判据
 *
 * 可泛化 ≠ 更精确。它只意味着「系数能拆成已知量，因此能随世界变」。
 * 纯拟合式（Mifflin 代谢）不是「不好」，只是**没有物理内核可拆**——
 * 换世界只能重新拟合。这个区别必须说清，否则作者会以为有个普适版可用却没有。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-empirical-'))
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

/** 跑一条公式取数值。 */
async function calc(id, overrides) {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return { ok: false, text: String(r.result).slice(0, 100) }
  return { ok: true, answer: Number(r.value && r.value.answer), text: String(r.result) }
}

console.log('-- 1. 拆解表完整性 --')
{
  const notes = emp.EMPIRICAL_NOTES
  assert('拆解条目 ≥ 10', notes.length >= 10, String(notes.length))

  for (const kind of ['scalable', 'dimensionless', 'noscalable']) {
    assert('有「' + emp.KIND_LABEL[kind] + '」类条目',
      emp.notesByKind(kind).length > 0, String(emp.notesByKind(kind).length))
  }

  // 每条都必须说清藏了什么 / 何时失效 / 建议
  for (const note of notes) {
    assert(note.id + ' 有 bakedIn', typeof note.bakedIn === 'string' && note.bakedIn.length > 10, '')
    assert(note.id + ' 有 breaksWhen', typeof note.breaksWhen === 'string' && note.breaksWhen.length > 10, '')
    assert(note.id + ' 有 advice', typeof note.advice === 'string' && note.advice.length > 10, '')
  }

  // 已收录的 id 必须真的在公式库里
  const ghost = notes.filter((note) => !FORMULA_INDEX.has(note.id))
  assert('拆解条目都对应真实公式', ghost.length === 0, ghost.map((n) => n.id).join(',') || '无')
}

console.log('-- 2. 可泛化的必须给出普适形式 --')
{
  const scalable = emp.notesByKind('scalable')
  for (const note of scalable) {
    assert(note.id + ' 有普适形式', typeof note.genericForm === 'string' && note.genericForm.length > 10, '')
    assert(note.id + ' 说明了需要哪些物理量',
      Array.isArray(note.needsFrom) && note.needsFrom.length > 0,
      JSON.stringify(note.needsFrom))
  }

  // 关键回归：hull_speed 的 1.34 里藏着 g，且 L 是英尺
  const hull = emp.empiricalNoteOf('hull_speed')
  assert('hull_speed 说明里点出 g=9.81', /9\.81|g\s*=|重力/.test(hull.bakedIn), '')
  assert('hull_speed 说明里点出英尺单位', /英尺|ft/.test(hull.bakedIn), hull.bakedIn.slice(0, 60))
  assert('hull_speed 的普适形式含 sqrt(g', /sqrt\(g/.test(hull.genericForm), hull.genericForm.slice(0, 50))

  // 宜居带的 1.1 必须被解释成辐照阈值
  const hz = emp.empiricalNoteOf('habitable_zone')
  assert('habitable_zone 的 1.1 被解释为辐照阈值', /辐照|flux|温室/.test(hz.bakedIn), hz.bakedIn.slice(0, 60))
}

console.log('-- 3. 纯拟合的必须明确说「不可泛化」--')
{
  const noScale = emp.notesByKind('noscalable')
  // 代谢、表面积、风寒、酷热、露点、心率、酒精 都要在这类
  const EXPECTED = ['bmr_mifflin', 'human_body_surface_area', 'wind_chill', 'heat_index', 'dew_point_magnus']
  const ids = noScale.map((n) => n.id)
  for (const id of EXPECTED) assert('标为纯拟合: ' + id, ids.includes(id), ids.join(','))

  // 这类不该给出 genericForm（给了会误导：以为有普适版）
  const withGeneric = noScale.filter((n) => n.genericForm)
  assert('纯拟合类不提供普适形式', withGeneric.length === 0, withGeneric.map((n) => n.id).join(',') || '无')

  // 但要说清「换个世界怎么办」
  for (const note of noScale) {
    assert(note.id + ' 给了替代方案或说明', note.advice.length > 20, '')
  }
}

console.log('-- 4. 普适版公式：真的能换参数 --')
{
  // 船舶：地球重力 vs 1.5 g
  const earth = await calc('hull_speed_generic', { g: 9.80665, length: 100 })
  const heavy = await calc('hull_speed_generic', { g: 14.71, length: 100 })
  assert('地球重力下 100 m 船约 24.4 节', Math.abs(earth.answer - 24.35) < 0.1, String(earth.answer))
  assert('1.5 g 下同一艘船约 29.8 节', Math.abs(heavy.answer - 29.83) < 0.1, String(heavy.answer))
  // 关键：两者比值应是 sqrt(1.5) ≈ 1.2247
  assert('航速随 sqrt(g) 变化（比值 ≈ √1.5）',
    Math.abs(heavy.answer / earth.answer - Math.sqrt(1.5)) < 1e-3,
    (heavy.answer / earth.answer).toFixed(4))

  // 宜居带：L=1 得 0.95 AU（与原式一致）
  const hz1 = await calc('habitable_zone_generic', {})
  assert('L=1 时内边界 0.95 AU', Math.abs(hz1.answer - 0.9535) < 0.001, String(hz1.answer))
  // 并且与原式一致
  const hzOld = await calc('habitable_zone', { L: 1 })
  assert('普适版与原式在 L=1 时一致',
    Math.abs(hz1.answer - hzOld.answer) < 0.001,
    hz1.answer + ' vs ' + hzOld.answer)
  // L=25（F5 巨星）→ 4.77 AU
  const hz25 = await calc('habitable_zone_generic', { luminosity: 25 })
  assert('L=25 时内边界 4.77 AU（与星际迷航那种设定对得上）',
    Math.abs(hz25.answer - 4.767) < 0.01, String(hz25.answer))
}

console.log('-- 5. 拆出来的基础件自洽 --')
{
  // 太阳常数 = 1361 W/m²
  const solar = await calc('solar_flux_at_1au', {})
  assert('太阳常数 1361 W/m²', solar.answer === 1361, String(solar.answer))

  // 平方反比：2 AU 处应得 1/4
  const flux = await calc('inverse_square_flux', { flux0: 1361, distance0: 1, distance: 2 })
  assert('2 AU 处辐照是 1/4', Math.abs(flux.answer - 340.25) < 0.01, String(flux.answer))

  // Froude 数：v=5 m/s、L=10 m → 0.505
  const fr = await calc('froude_number', { v: 5, g: 9.80665, length: 10 })
  assert('Froude 数算得对', Math.abs(fr.answer - 0.5049) < 0.001, String(fr.answer))

  // 饱和蒸气压：水在 373.15 K 应为 1 atm
  const sat = await calc('evaporation_saturation_generic', { T: 373.15 })
  assert('水在沸点饱和蒸气压 = 1 atm', Math.abs(sat.answer - 101325) < 1, String(sat.answer))
  // 换溶剂：氨的潜热不同
  const ammonia = await calc('evaporation_saturation_generic', { T: 239.8, latent: 23400, p0: 101325, T0: 239.8 })
  assert('氨在它的沸点也给出 1 atm', Math.abs(ammonia.answer - 101325) < 1, String(ammonia.answer))

  // 对流散热：稀薄大气散热差
  const thick = await calc('convective_cooling_generic', { v: 1, density: 1.225 })
  const thin = await calc('convective_cooling_generic', { v: 1, density: 0.12 })
  assert('0.1 atm 大气散热系数只有地球的约 15%',
    thin.answer / thick.answer > 0.1 && thin.answer / thick.answer < 0.2,
    (thin.answer / thick.answer).toFixed(3))
}

console.log('-- 6. 工具输出带适用域提示 --')
{
  // 用旧公式时，输出里必须出现警示
  const old = await run({ operation: 'formula', formula: 'hull_speed', overrides: { L: 100 } })
  const oldText = String(old.result)
  assert('旧公式输出含「适用域」', /适用域/.test(oldText), '')
  assert('旧公式输出点出 g=9.81', /9\.81/.test(oldText), '')
  assert('旧公式输出指向普适版', /hull_speed_generic|普适/.test(oldText), '')

  // 纯拟合公式也要警示
  const bmr = await run({ operation: 'formula', formula: 'bmr_mifflin', overrides: { m: 70, h: 175, age: 30 } })
  const bmrText = String(bmr.result)
  assert('Mifflin 输出含「纯拟合」标记', /纯拟合/.test(bmrText), '')
  assert('Mifflin 输出说明换物种失效', /换物种/.test(bmrText), '')

  // 普通公式不该被打扰
  const plain = await run({ operation: 'formula', formula: 'kinetic_energy', overrides: { m: 2, v: 10 } })
  assert('普通公式不追加大段适用域说明',
    !/适用域：/.test(String(plain.result)), '')
}

console.log('-- 7. 新旧并存：旧版保留（工程界标准）--')
{
  // hull_speed 不能被删——它是船舶工程界的标准式，写地球船时更快
  assert('旧版 hull_speed 仍在', FORMULA_INDEX.has('hull_speed'), '')
  assert('新版 hull_speed_generic 也在', FORMULA_INDEX.has('hull_speed_generic'), '')
  // 两条都可用
  const a = await calc('hull_speed', { L: 100 })
  const b = await calc('hull_speed_generic', { length: 30.48 })
  assert('旧版 100 ft 约 13.4 kn', Math.abs(a.answer - 13.4) < 0.1, String(a.answer))
  // 100 ft = 30.48 m，用地球 g 应该接近同一结果
  assert('两版在 100 ft 处结果接近（同一条船）',
    Math.abs(a.answer - b.answer) < 0.5, a.answer.toFixed(2) + ' vs ' + b.answer.toFixed(2))
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
