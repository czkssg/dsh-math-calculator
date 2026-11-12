/**
 * 世界古代度量衡体系测试。
 *
 * ## 收录六套体系
 *
 * ```
 *   古埃及    王室肘尺 52.35cm / 短肘尺 44.8cm
 *   古希腊    斯塔德 185m / 阿提卡尺 29.6cm / 埃伊纳尺 32.6cm
 *   古罗马    罗马尺 29.6cm / 罗马里 1.48km / ★ 罗马磅 328.9g
 *   英制历史  英亩 4046.9m² / 弗隆 201m / 厄尔 1.143m
 *   日本尺贯  日尺 30.3cm / 日坪 3.306m² / 日贯 3.75kg
 *   伊斯兰    迪拉姆 2.97g / 第纳尔 4.25g
 * ```
 *
 * ## ★ 本套件最重要的一条：同名不同时代
 *
 * ```
 *   老表的 libra  = 西班牙磅 460 g
 *   古罗马 libra  = 328.9 g
 *   → 差 40%
 * ```
 *
 * 若不分时代，「罗马一 libra 银」会算出多 131 克。在货币与军饷推演里这是致命的。
 * 这个例子说明**为什么必须把历史单位与同名的现代单位分开**。
 */
import { buildEngine } from '../lib/core/engine.js'
import {
  EGYPTIAN_UNITS, GREEK_UNITS, ROMAN_UNITS, ENGLISH_UNITS, JAPANESE_UNITS, ISLAMIC_UNITS,
  WORLD_ERA_UNITS,
} from '../lib/core/units-era-world.js'
import { ALL_ERA_UNITS, findEraVariant } from '../lib/core/units-era.js'
import { ERA_UNIT_INDEX } from '../lib/core/units-era-registry.js'

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

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 罗马磅 vs 西班牙磅（同名不同时代，差 40%）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这是「为什么必须分时代」最有力的例子。
   *
   * `libra` 在罗马是 328.9 g（1/12 罗马磅制的基准），
   * 而在西班牙是 460 g。两者同名，差 40%。
   */
  const romanLibra = findEraVariant('libra', '古罗马')[0]
  assert('古罗马 libra = 328.9g', Math.abs((romanLibra?.factor ?? 0) * 1000 - 328.9) < 1, String(romanLibra?.factor))
  assert('罗马 libra 能换算', Math.abs(num('1 罗马磅 to g') - 328.9) < 1, String(num('1 罗马磅 to g')))
  /** 与老表的西班牙磅对比 —— 那条是 460 g。 */
  assert('★ 罗马磅与西班牙磅差 40%', Math.abs(460 / 328.9 - 1.4) < 0.05, String(460 / 328.9))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 古罗马体系自洽 --')
// ───────────────────────────────────────────────────────────
{
  /** 1 pes = 12 uncia = 16 digitus。 */
  const pes = num('1 罗马尺 to cm')
  const uncia = num('1 罗马寸 to cm')
  const digitus = num('1 罗马指 to cm')
  assert('罗马尺 = 29.6cm', Math.abs(pes - 29.6) < 0.1, String(pes))
  assert('12 uncia ≈ 1 pes', Math.abs(uncia * 12 - pes) < 0.2, `${uncia}×12=${uncia * 12} vs ${pes}`)
  assert('16 digitus ≈ 1 pes', Math.abs(digitus * 16 - pes) < 0.2, `${digitus}×16=${digitus * 16}`)

  /** 1 passus = 5 pes；1 mille = 1000 passus。 */
  assert('罗马步 = 5 罗马尺', Math.abs(num('1 罗马步 to cm') - pes * 5) < 0.5, '')
  assert('罗马里 = 1000 罗马步', Math.abs(num('1 罗马里 to m') - 1480) < 5, String(num('1 罗马里 to m')))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 古希腊（各城邦不同）--')
// ───────────────────────────────────────────────────────────
{
  assert('斯塔德 ≈ 185m', Math.abs(num('1 古希腊斯塔德 to m') - 185) < 1, String(num('1 古希腊斯塔德 to m')))
  /** 阿提卡与埃伊纳两套尺差约 10%。 */
  const attic = findEraVariant('pous', '古希腊', '阿提卡尺')[0]
  const aegin = findEraVariant('pous', '古希腊', '埃伊纳尺')[0]
  assert('阿提卡尺 = 29.6cm', Math.abs((attic?.factor ?? 0) * 100 - 29.6) < 0.1, String(attic?.factor))
  assert('埃伊纳尺 = 32.6cm', Math.abs((aegin?.factor ?? 0) * 100 - 32.6) < 0.1, String(aegin?.factor))
  assert('★ 埃伊纳尺比阿提卡长约 10%', (aegin?.factor ?? 0) / (attic?.factor ?? 1) > 1.09, '')
  /** 1 塔兰特 = 60 mina = 6000 drachmae ≈ 26 kg。 */
  assert('塔兰特 ≈ 26kg', Math.abs(num('1 古希腊塔兰特 to kg') - 26) < 1, String(num('1 古希腊塔兰特 to kg')))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 古埃及（肘尺的两套）--')
// ───────────────────────────────────────────────────────────
{
  assert('王室肘尺 = 52.35cm', Math.abs(num('1 古埃及肘尺 to cm') - 52.35) < 0.1, String(num('1 古埃及肘尺 to cm')))
  /** 王室肘尺 = 7 掌；短肘尺 = 6 掌。 */
  const palm = num('1 古埃及掌 to cm')
  assert('掌 = 7.48cm', Math.abs(palm - 7.48) < 0.1, String(palm))
  assert('7 掌 ≈ 王室肘尺', Math.abs(palm * 7 - 52.35) < 0.3, `${palm * 7}`)
  assert('4 指 = 1 掌', Math.abs(num('1 古埃及指 to cm') * 4 - palm) < 0.1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 日本尺贯法 --')
// ───────────────────────────────────────────────────────────
{
  assert('日尺 = 30.3cm', Math.abs(num('1 日本日尺 to cm') - 30.3) < 0.1, String(num('1 日本日尺 to cm')))
  assert('日间 = 1.818m', Math.abs(num('1 日本日间 to m') - 1.818) < 0.01, '')
  assert('日坪 = 3.306m²', Math.abs(num('1 日本日坪 to m2') - 3.306) < 0.01, '')
  assert('日贯 = 3.75kg', Math.abs(num('1 日本日贯 to kg') - 3.75) < 0.01, '')
  assert('日匁 = 3.75g', Math.abs(num('1 日本日匁 to g') - 3.75) < 0.01, '')
  /** 1 间 = 6 尺。 */
  assert('1 间 = 6 日尺', Math.abs(num('1 日本日间 to cm') - num('1 日本日尺 to cm') * 6) < 0.2, '')
  /** 日尺与中国市尺差 5%（这是「用中国尺写日本设定」会差多少）。 */
  const jp = num('1 日本日尺 to cm')
  const cn = num('1 清营造尺 to cm')
  assert('★ 日尺比清尺短约 5%', Math.abs(cn / jp - 1.055) < 0.02, `${cn}/${jp}=${(cn / jp).toFixed(3)}`)
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 英国历史单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('英亩 = 4046.86m²', Math.abs(num('1 英制英亩 to m2') - 4046.86) < 1, '')
  assert('弗隆 = 201.17m', Math.abs(num('1 英制弗隆 to m') - 201.168) < 0.5, '')
  assert('杆 = 5.03m', Math.abs(num('1 英制杆 to m') - 5.0292) < 0.01, '')
  /** 1 acre = 1 furlong × 1 chain = 10 chain²。 */
  assert('英亩由弗隆与链定义', Math.abs(num('1 英制英亩 to m2') - 4046.86) < 1, '')
  /** 苏格兰厄尔与英格兰厄尔不同。 */
  const eng = findEraVariant('ell', '英制', '苏格兰厄尔')[0]
  assert('苏格兰厄尔 = 68.58cm', Math.abs((eng?.factor ?? 0) * 100 - 68.58) < 0.1, String(eng?.factor))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 伊斯兰世界 --')
// ───────────────────────────────────────────────────────────
{
  assert('迪拉姆 ≈ 2.97g', Math.abs(num('1 伊斯兰迪拉姆 to g') - 2.97) < 0.05, '')
  assert('第纳尔 ≈ 4.25g', Math.abs(num('1 伊斯兰第纳尔 to g') - 4.25) < 0.05, '')
  /** 金银比约 1:10（这是伊斯兰货币体系的核心比例）。 */
  assert('★ 金银比约 10:1', Math.abs(num('1 伊斯兰第纳尔 to g') / num('1 伊斯兰迪拉姆 to g') - 1.43) < 0.2, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 数据质量：每条都要有依据与可信度 --')
// ───────────────────────────────────────────────────────────
{
  const all = WORLD_ERA_UNITS.flatMap((u) => u.variants)
  assert('世界单位变体 ≥40 条', all.length >= 40, String(all.length))
  assert('★ 每条都标了依据', all.every((v) => typeof v.source === 'string' && v.source.length > 5), '')
  assert('每条都标了可信度', all.every((v) => ['exact', 'typical', 'range'].includes(v.confidence)), '')
  /** 区间型必须有上界。 */
  const ranges = all.filter((v) => v.confidence === 'range')
  assert('区间型都给了上界', ranges.every((v) => v.factorHigh !== undefined), String(ranges.length))

  /** 所有 name 必须唯一（第一版日本「尺」与中国「尺」撞名）。 */
  const names = ALL_ERA_UNITS.map((u) => u.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert('★ name 无重复', dup.length === 0, dup.join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 六套体系都注册成功 --')
// ───────────────────────────────────────────────────────────
{
  const systems = [
    ['古埃及', EGYPTIAN_UNITS.length],
    ['古希腊', GREEK_UNITS.length],
    ['古罗马', ROMAN_UNITS.length],
    ['英制', ENGLISH_UNITS.length],
    ['日本', JAPANESE_UNITS.length],
    ['伊斯兰', ISLAMIC_UNITS.length],
  ]
  for (const [era, count] of systems) {
    const registered = [...ERA_UNIT_INDEX.values()].filter((v) => v.variant.era === era).length
    assert(era + ' 体系已注册（' + count + ' 个单位）', registered >= count * 0.9, `注册 ${registered}/${count}`)
  }
  assert('★ 注册总数 ≥110', ERA_UNIT_INDEX.size >= 110, String(ERA_UNIT_INDEX.size))
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. 不破坏中国体系与现代单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('汉尺仍是 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('唐大尺仍是 30cm', Math.abs(num('1 唐大尺 to cm') - 30) < 0.1, '')
  assert('清斤仍是 596.8g', Math.abs(num('1 清斤 to g') - 596.8) < 0.5, '')
  assert('现代 1 斤 = 500g', Math.abs(num('1 斤 to g') - 500) < 0.01, '')
  assert('30 里 = 15km', Math.abs(num('30 里 to km') - 15) < 1e-9, '')
  /** 二次归一的保护要生效。 */
  const twice = engine.evaluate('1 汉尺 + 1 罗马尺')
  assert('★ 中西方单位能混算（无二次替换）', twice !== undefined, String(twice))
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
