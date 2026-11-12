/**
 * 英制工业、市制细分、计数与角度单位测试。
 *
 * ## 三块内容
 *
 * ```
 *   ① 英制工业   psi/gpm/cfm/BTU/hp_boiler/thou/firkin/hogshead —— 蒸汽朋克核心
 *   ② 中国市制   市尺/市寸/市斤/市两/市钱/市亩/市分地 —— 近代细分
 *   ③ 计数角度   dozen/gross/ream/compass_point
 * ```
 *
 * ## ★ 本套件最要紧的两条
 *
 * ### ① `min` 被 mathjs 拆成 `m × in`
 *
 * ```
 *   1 L/min   →  报错
 *   1 L/minute →  正常
 * ```
 *
 * 而「每分钟」是最常用的工程单位组合。修法见 `unit-ambiguity.ts`。
 *
 * ### ② 「尺」有三义，必须分开
 *
 * ```
 *   营造尺（明清建筑）  32 cm     ← 古籍语境
 *   市尺（1929 市制）   33.33 cm  ← 现代语境
 *   各朝代尺            15.8–34 cm ← 历史语境（见 units-era）
 * ```
 */
import { buildEngine } from '../lib/core/engine.js'
import { IMPERIAL_AND_MISC_UNITS, COUNT_UNITS } from '../lib/core/units-imperial.js'
import { CN_MARKET_UNITS } from '../lib/core/units-cn-market.js'
import { countFactor } from '../lib/core/units-imperial-registry.js'
import { fixUnitAmbiguity } from '../lib/core/unit-ambiguity.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const engine = buildEngine()
const num = (expr) => Number(String(engine.evaluate(expr)).split(' ')[0])
const near = (expr, want, tol = 0.02) => Math.abs(num(expr) - want) / Math.abs(want) < tol

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ min 歧义（mathjs 把它拆成 m×in）--')
// ───────────────────────────────────────────────────────────
{
  /** 直接看 mathjs 的原始行为，说明为什么要修。 */
  const raw = engine.math
  let rawFails = false
  try { raw.evaluate('1 L/min') } catch { rawFails = true }
  assert('★ mathjs 原生 `1 L/min` 会失败', rawFails, '（不失败说明库行为变了，要重审）')

  /** 修正后正常。 */
  assert('修正后 1 L/min 能算', near('1 L/min to L/s', 0.016667, 0.01), '')
  assert('修正后 5 min = 300s', near('5 min to s', 300, 1e-9), '')
  assert('修正后 90 km/min 能算', near('90 km/min to km/h', 5400, 1e-6), '')

  /** 不能误伤含 min 的其他词。 */
  assert('minimum 不被误改', fixUnitAmbiguity('minimum') === 'minimum', fixUnitAmbiguity('minimum'))
  assert('admin 不被误改', fixUnitAmbiguity('admin') === 'admin', fixUnitAmbiguity('admin'))
  assert('min 独立词被改', fixUnitAmbiguity('L/min') === 'L/minute', fixUnitAmbiguity('L/min'))

  /** ha → hectare 也要修。 */
  assert('ha 被改成 hectare', fixUnitAmbiguity('5 ha') === '5 hectare', fixUnitAmbiguity('5 ha'))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 英制工业单位（蒸汽朋克核心）--')
// ───────────────────────────────────────────────────────────
{
  /** 压强：锅炉与真空。 */
  assert('1 psi = 6.895 kPa', near('1 psi to kPa', 6.895), '')
  assert('1 inHg ≈ 3.386 kPa', near('1 inwc to Pa', 249.1), '')
  /** 流量：泵与风机。 */
  assert('1 gpm = 3.785 L/min（美制）', near('1 gpm to L/min', 3.785), String(num('1 gpm to L/min')))
  assert('1 cfm = 28.32 L/min', near('1 cfm to L/min', 28.317), '')
  /** 能量与功率。 */
  assert('1 BTU = 1055 J', near('1 btu to J', 1055.06), '')
  assert('★ 1 锅炉马力 = 9.81 kW', near('1 hpboiler to kW', 9.8095), String(num('1 hpboiler to kW')))
  assert('1 机械马力 = 745.7 W', near('1 hp to W', 745.7), '')
  /** 长度：机械公差。 */
  assert('★ 1 thou = 25.4 µm', near('1 thou to mm', 0.0254), String(num('1 thou to mm')))
  assert('1 fathom = 1.829 m', near('1 fathom to m', 1.8288), '')
  assert('1 cable = 185.2 m', near('1 cable to m', 185.2), '')
  /** 质量：三套衡制。 */
  assert('1 slug = 14.59 kg', near('1 slug to kg', 14.59), '')
  assert('★ 1 长吨 = 1016 kg', near('1 tonlong to kg', 1016.05), String(num('1 tonlong to kg')))
  assert('★ 1 短吨 = 907 kg', near('1 tonshort to kg', 907.18), String(num('1 tonshort to kg')))
  assert('1 金衡盎司 = 31.1 g', near('1 troyounce to g', 31.1), '')
  assert('1 grain = 64.8 mg', near('1 grain to mg', 64.8, 0.05), String(num('1 grain to mg')))
  /** 容积：桶。 */
  assert('1 firkin = 40.9 L', near('1 firkin to L', 40.91), '')
  assert('1 hogshead = 238.5 L', near('1 hogshead to L', 238.48), '')
  assert('1 bushel = 36.37 L', near('1 bushel to L', 36.37), '')
  /** 速度。 */
  assert('1 knot = 0.514 m/s', near('1 knot to m/s', 0.5144), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 英制 vs 美制的关键差异 --')
// ───────────────────────────────────────────────────────────
{
  /** 加仑差 17%（蒸汽机耗水量以加仑计时必须区分）。 */
  const galImp = num('1 gallonimp to L')
  const galUs = num('1 gallonus to L')
  assert('英制加仑 = 4.546 L', Math.abs(galImp - 4.54609) < 0.01, String(galImp))
  assert('美制加仑 = 3.785 L', Math.abs(galUs - 3.78541) < 0.01, String(galUs))
  assert('★ 英制加仑比美制大 20%', Math.abs(galImp / galUs - 1.201) < 0.01, String(galImp / galUs))

  /** 英担。 */
  const cwtL = num('1 cwtlong to kg')
  const cwtS = num('1 cwtshort to kg')
  assert('长英担 = 50.8 kg', Math.abs(cwtL - 50.801) < 0.1, '')
  assert('短英担 = 45.36 kg', Math.abs(cwtS - 45.359) < 0.1, '')
  assert('★ 长英担比短英担重 12%', Math.abs(cwtL / cwtS - 1.12) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 「尺」的三义分开 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这是本批最容易错的一处：
   * ```
   *   营造尺 32cm（古籍建筑）
   *   市尺   33.33cm（1929 市制）
   * ```
   * 差 4%，若混用会静默算错。
   */
  assert('★ 市尺 = 33.33cm', near('1 市尺 to cm', 33.333, 0.001), String(num('1 市尺 to cm')))
  assert('★ 营造尺（裸「尺」）= 32cm', near('1 尺 to cm', 32, 0.001), String(num('1 尺 to cm')))
  /** 两者确实不同。 */
  assert('★ 市尺与营造尺差 4%', Math.abs(num('1 市尺 to cm') / num('1 尺 to cm') - 1.0417) < 0.01, '')
  /** 历史尺又是第三义。 */
  assert('汉尺 = 23.1cm（第三义）', near('1 汉尺 to cm', 23.1, 0.001), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 中国市制细分（十进制链）--')
// ───────────────────────────────────────────────────────────
{
  /** 长度：尺→寸→分→厘→毫→丝。 */
  assert('1 市尺 = 10 市寸', Math.abs(num('1 市尺 to cm') / num('1 市寸 to cm') - 10) < 0.01, '')
  assert('1 市寸 = 10 市分', Math.abs(num('1 市寸 to cm') / num('1 市分 to cm') - 10) < 0.01, '')
  /** 质量：16 两制。 */
  assert('1 市斤 = 16 市两', Math.abs(num('1 市斤 to g') / num('1 市两 to g') - 16) < 0.01, '')
  assert('1 市两 = 10 市钱', Math.abs(num('1 市两 to g') / num('1 市钱 to g') - 10) < 0.01, '')
  /** 容量：十进制。 */
  assert('1 市斗 = 10 市升', Math.abs(num('1 市斗 to L') / num('1 市升 to L') - 10) < 0.01, '')
  assert('1 市升 = 10 市合', Math.abs(num('1 市升 to mL') / num('1 市合 to mL') - 10) < 0.01, '')
  /** 面积：亩→分→厘。 */
  assert('1 市亩 = 10 市分地', Math.abs(num('1 市亩 to m2') / num('1 市分地 to m2') - 10) < 0.01, '')
  assert('1 市顷 = 100 市亩', Math.abs(num('1 市顷 to m2') / num('1 市亩 to m2') - 100) < 0.1, '')
  /** 真实场景：「三亩五分地」。 */
  assert('★ 三亩五分 = 2333 m²', near('3 市亩 + 5 市分地 to m2', 2333.3, 0.01), String(num('3 市亩 + 5 市分地 to m2')))
  /**
   * 真实场景：「二两七钱银」。
   *
   * ⚠ 期望值是 **84.375 g**，不是 115.6 —— 我第一版按「1 两 = 37.3g（清库平两）」
   * 算成 115.6，但**市制 1 两是 31.25 g**（1929 后 16 两制）。
   *
   * 这正是本项目反复强调的一点：**同一个词在不同时代不同值**，
   * 期望值必须说清是哪个时代的。
   */
  assert('★ 二两七钱（市制）= 84.375 g', near('2 市两 + 7 市钱 to g', 84.375, 0.001),
    String(num('2 市两 + 7 市钱 to g')))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 计数单位（不注册进 mathjs，走独立通道）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 打 = 12', countFactor('打')?.factor === 12, String(countFactor('打')?.factor))
  assert('1 罗 = 144', countFactor('罗')?.factor === 144, '')
  assert('1 令 = 500 张', countFactor('令')?.factor === 500, '')
  assert('dozen 也能查', countFactor('dozen')?.factor === 12, '')
  assert('gross 也能查', countFactor('gross')?.factor === 144, '')
  /**
   * 计数单位**不注册成 mathjs 单位** —— 否则 `1 打 + 3 米` 不报错。
   */
  const countInMath = (() => {
    try { engine.math.evaluate('1 打') } catch { return false }
    return true
  })()
  assert('★ 计数单位不在 mathjs 里（防量纲混淆）', countInMath === false, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 角度补全（航海）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 罗经点 = 11.25°', near('1 compasspoint to deg', 11.25, 0.01), String(num('1 compasspoint to deg')))
  assert('32 罗经点 = 360°', near('32 compasspoint to deg', 360, 0.01), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 数据质量 --')
// ───────────────────────────────────────────────────────────
{
  const all = [...IMPERIAL_AND_MISC_UNITS, ...CN_MARKET_UNITS]
  assert('新增单位 ≥70 条', all.length >= 70, String(all.length))
  assert('★ 每条都有说明', all.every((u) => typeof u.note === 'string' && u.note.length > 5), '')
  assert('每条都有量纲', all.every((u) => typeof u.dimension === 'string' && u.dimension.length > 0), '')
  assert('每条都有别名', all.every((u) => Array.isArray(u.aliases) && u.aliases.length > 0), '')
  /** name 必须唯一。 */
  const names = all.map((u) => u.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert('★ name 无重复', dup.length === 0, dup.join(','))
  /** 因子必须为正。 */
  assert('因子都是正数', all.every((u) => u.factor > 0), '')
  /** 计数单位条数。 */
  assert('计数单位 ≥10 条', COUNT_UNITS.length >= 10, String(COUNT_UNITS.length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 不破坏既有单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('2 m to cm = 200', near('2 m to cm', 200, 1e-9), '')
  assert('30 里 = 15 km', near('30 里 to km', 15, 1e-9), '')
  assert('1 斤（现代市斤）= 500g', near('1 斤 to g', 500, 1e-9), '')
  assert('1 汉尺 = 23.1cm', near('1 汉尺 to cm', 23.1, 0.001), '')
  assert('1 罗马尺 = 29.6cm', near('1 罗马尺 to cm', 29.6, 0.001), '')
  assert('100 km to mile', near('100 km to mile', 62.137, 0.001), '')
  /** 复合单位换算（mathjs 原生支持，之前误判为不支持）。 */
  assert('★ 90 km/h to cm/s = 2500', near('90 km/h to cm/s', 2500, 1e-6), String(num('90 km/h to cm/s')))
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
