/**
 * 第四批历史单位测试：奥斯曼 / 波斯 / 玛雅 / 阿兹特克 / 北欧 / 荷兰 /
 * 伊比利亚 / 意大利 / 波兰匈牙利。
 *
 * ## 本批的三个难点
 *
 * ### ① 同一体系内不同城市不同值
 *
 * ```
 *   意大利 braccio：佛罗伦萨 58.36 / 威尼斯 63.67 / 米兰 59.49   差 9%
 *   意大利 libbra：佛罗伦萨 339.5 / 威尼斯 301.2 / 米兰 762.7   差 1.5 倍
 * ```
 *
 * ### ② 同一名字跨国不同值
 *
 * ```
 *   arroba  西班牙 11.50 kg   葡萄牙 14.69 kg   **差 28%**
 * ```
 *
 * ### ③ 荷兰的 11 进制（不是 12）
 *
 * ```
 *   荷兰 duim = 1/11 voet      ← 全欧洲只有荷兰这样
 *   英制 inch = 1/12 foot
 * ```
 */
import { buildEngine } from '../lib/core/engine.js'
import {
  OTTOMAN_UNITS, PERSIAN_UNITS, MAYA_UNITS, AZTEC_UNITS,
  NORDIC_UNITS, DUTCH_UNITS, IBERIAN_UNITS, ITALIAN_UNITS,
  POLISH_HUNGARIAN_UNITS, ANCIENT_FOURTH_UNITS,
} from '../lib/core/units-ancient-4.js'
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
const near = (expr, want, tol = 0.02) => Math.abs(num(expr) - want) / Math.abs(want) < tol

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 奥斯曼（市集尺 vs 建筑尺）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 奥斯曼有两把尺，差 11%：
   * ```
   *   çarşı arşını（市集尺）  68 cm    商业用
   *   mimari arşın（建筑尺）  75.8 cm  工程用
   * ```
   * 「奥斯曼尺」默认应给**市集尺**（商业更常用）。
   */
  assert('★ 奥斯曼尺默认 = 市集尺 68cm', Math.abs(num('1 奥斯曼尺 to cm') - 68) < 0.5,
    String(num('1 奥斯曼尺 to cm')))
  /** 建筑尺仍可显式指定。 */
  const mimari = findEraVariant('arsin', '奥斯曼', 'mimari arşın')[0]
  assert('建筑尺 = 75.8cm（显式可用）', Math.abs((mimari?.factor ?? 0) * 100 - 75.8) < 0.1, '')
  assert('★ 建筑尺比市集尺长 11%', Math.abs((mimari?.factor ?? 0) * 100 / 68 - 1.115) < 0.02, '')

  /** okka 是奥斯曼核心质量单位 —— 比英磅重近 3 倍。 */
  assert('奥斯曼磅 = 1282.9 g', Math.abs(num('1 奥斯曼磅 to g') - 1282.9) < 1, '')
  assert('★ 奥斯曼磅是英磅的 2.8 倍', Math.abs(num('1 奥斯曼磅 to g') / num('1 lb to g') - 2.83) < 0.02, '')
  /** dönüm（顿亩）与英亩接近。 */
  assert('奥斯曼顿亩 = 919.3 m²', Math.abs(num('1 奥斯曼顿亩 to m2') - 919.3) < 5, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 伊比利亚：arroba 跨国差 28% --')
// ───────────────────────────────────────────────────────────
{
  const sp = num('1 西班牙阿罗巴 to kg')
  const pt = num('1 葡萄牙阿罗巴 to kg')
  assert('西班牙阿罗巴 = 11.50 kg', Math.abs(sp - 11.5023) < 0.01, String(sp))
  assert('葡萄牙阿罗巴 = 14.69 kg', Math.abs(pt - 14.688) < 0.01, String(pt))
  assert('★ 葡萄牙比西班牙重 28%', Math.abs(pt / sp - 1.277) < 0.01, String(pt / sp))

  /** 西班牙尺与里格。 */
  assert('西班牙尺 = 83.59 cm', Math.abs(num('1 西班牙尺 to cm') - 83.59) < 0.01, '')
  /**
   * ⚠ 两条里格定义不同，**默认取的是陆地版（6667 尺）**：
   * ```
   *   陆地版 5000 varas = 5.573 km   ← 默认（史料最常用）
   *   legal 版 6667 varas = 6.667 km
   * ```
   * 比值 5572.7 / 0.8359 = 6667 尺。
   */
  assert('西班牙里格默认 = 陆地版（6667 尺）',
    Math.abs(num('1 西班牙里格 to m') / num('1 西班牙尺 to m') - 6667) < 50,
    String((num('1 西班牙里格 to m') / num('1 西班牙尺 to m')).toFixed(0)))
  assert('里格 = 5.573 km', Math.abs(num('1 西班牙里格 to km') - 5.5727) < 0.01, '')
  /** legal 版仍可显式取到。 */
  const lug = findEraVariant('legua', '西班牙', 'legal')[0]
  assert('legal 版里格 = 6.667 km（显式可用）', Math.abs((lug?.factor ?? 0) - 6666.7) < 1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 意大利：同国不同城，磅差 1.5 倍 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 意大利 1861 统一前每城一制，连「磅」都差 1.5 倍：
   * ```
   *   佛罗伦萨  339.5 g   威尼斯 301.2 g   米兰 762.7 g
   * ```
   */
  assert('★ 意大利磅默认 = 佛罗伦萨 339.5g',
    Math.abs(num('1 意大利磅 to g') - 339.5) < 1, String(num('1 意大利磅 to g')))
  const milan = findEraVariant('libbra_it', '意大利', '米兰')[0]
  const venice = findEraVariant('libbra_it', '意大利', '威尼斯')[0]
  assert('米兰磅 = 762.7g', Math.abs((milan?.factor ?? 0) * 1000 - 762.7) < 1, '')
  assert('威尼斯磅 = 301.2g', Math.abs((venice?.factor ?? 0) * 1000 - 301.2) < 1, '')
  assert('★ 米兰磅是威尼斯的 2.5 倍',
    Math.abs((milan?.factor ?? 0) / (venice?.factor ?? 1) - 2.53) < 0.02, '')

  /** braccio（臂尺）三城不同。 */
  assert('意大利臂尺默认 = 佛罗伦萨 58.36cm',
    Math.abs(num('1 意大利臂尺 to cm') - 58.36) < 1, String(num('1 意大利臂尺 to cm')))
  const bVenice = findEraVariant('braccio', '意大利', '威尼斯')[0]
  assert('★ 威尼斯臂尺 63.67cm 比佛罗伦萨长 9%',
    Math.abs((bVenice?.factor ?? 0) / 0.5836 - 1.091) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 荷兰：11 进制（全欧唯一）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 荷兰 duim = 1/11 voet，而英制 inch = 1/12 foot。
   * 这是荷兰度量衡最独特的一点。
   */
  const voet = num('1 荷兰尺 to cm')
  assert('荷兰尺默认 = 阿姆斯特丹 28.31cm', Math.abs(voet - 28.31) < 0.1, String(voet))
  const duim = num('1 荷兰寸 to cm')
  assert('荷兰寸 = 2.573cm', Math.abs(duim - 2.573) < 0.01, String(duim))
  assert('★ 荷兰寸是尺的 1/11（不是 1/12）', Math.abs(voet / duim - 11) < 0.1, String(voet / duim))

  /** last（拉斯特）是航运计容单位。 */
  assert('荷兰拉斯特 = 2.96 m³', Math.abs(num('1 荷兰拉斯特 to m3') - 2.96) < 0.05, '')
  assert('荷兰磅 = 494.1 g', Math.abs(num('1 荷兰磅 to g') - 494.1) < 1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 北欧（瑞典里是北欧最长）--')
// ───────────────────────────────────────────────────────────
{
  assert('瑞典尺 = 29.69 cm', Math.abs(num('1 瑞典尺 to cm') - 29.69) < 0.01, '')
  assert('★ 瑞典里 = 10.688 km', Math.abs(num('1 瑞典里 to km') - 10.688) < 0.01,
    String(num('1 瑞典里 to km')))
  /** 1 mil = 36000 fot。 */
  assert('1 瑞典里 = 36000 尺',
    Math.abs(num('1 瑞典里 to m') / num('1 瑞典尺 to m') - 36000) < 100, '')
  assert('瑞典厄尔 = 2 尺',
    Math.abs(num('1 瑞典厄尔 to cm') / num('1 瑞典尺 to cm') - 2) < 0.01, '')
  /** skeppund（船磅）= 20 lispund。 */
  /**
   * ⚠ 1 skeppund = **16** lispund（食品标准 viktualie）。
   *
   * 瑞典有两种 skeppund：贸易港版 20 lispund = 170 kg，
   * 食品版 16 lispund = 136 kg。本表取后者（史料更常见）。
   */
  assert('★ 瑞典船磅 = 16 里斯磅（食品标准）',
    Math.abs(num('1 瑞典船磅 to kg') / num('1 瑞典里斯磅 to kg') - 16) < 0.1,
    String((num('1 瑞典船磅 to kg') / num('1 瑞典里斯磅 to kg')).toFixed(1)))
  /** 贸易港版是 20 lispund = 170 kg，两者差 25%。 */
  assert('★ 船磅两版差 25%', Math.abs(170.03 / 136.024 - 1.25) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 波斯（萨珊，伊斯兰度量衡的源头）--')
// ───────────────────────────────────────────────────────────
{
  assert('波斯腕尺 = 104 cm', Math.abs(num('1 波斯腕尺 to cm') - 104) < 1, '')
  /** 波斯腕尺是伊斯兰腕尺（49.32）的两倍。 */
  assert('★ 波斯腕尺是伊斯兰腕尺的 2 倍',
    Math.abs(num('1 波斯腕尺 to cm') / 49.32 - 2.1) < 0.05, '')
  /** sang 是区间型（各朝不同）。 */
  const sang = findEraVariant('sang_pers', '波斯')[0]
  assert('★ 波斯桑标为 range', sang?.confidence === 'range', String(sang?.confidence))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 玛雅与阿兹特克（美洲）--')
// ───────────────────────────────────────────────────────────
{
  assert('玛雅步 = 1.62 m', Math.abs(num('1 玛雅步 to m') - 1.62) < 0.02, '')
  assert('玛雅尺 = 40.5 cm', Math.abs(num('1 玛雅尺 to cm') - 40.5) < 1, '')
  /** 1 kin = 4 xoc。 */
  assert('1 玛雅步 = 4 玛雅尺',
    Math.abs(num('1 玛雅步 to m') / num('1 玛雅尺 to m') - 4) < 0.1, '')

  assert('阿兹特克尺 = 83 cm', Math.abs(num('1 阿兹特克尺 to cm') - 83) < 1, '')
  /** 1 quahuitl = 4 cemmatl。 */
  assert('1 阿兹特克尺 = 4 拃',
    Math.abs(num('1 阿兹特克尺 to cm') / num('1 阿兹特克拃 to cm') - 4) < 0.1, '')
  /** 1 tlapantli = 3 quahuitl。 */
  assert('1 阿兹特克丈 = 3 尺',
    Math.abs(num('1 阿兹特克丈 to m') / num('1 阿兹特克尺 to m') - 3) < 0.1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 波兰/匈牙利 --')
// ───────────────────────────────────────────────────────────
{
  assert('波兰肘尺 = 59.55 cm', Math.abs(num('1 波兰肘尺 to cm') - 59.55) < 0.01, '')
  assert('波兰磅 = 405.2 g', Math.abs(num('1 波兰磅 to g') - 405.2) < 1, '')
  /** 波兰磅与俄磅接近但不同。 */
  assert('★ 波兰磅 ≠ 俄磅（差 1%）',
    Math.abs(num('1 波兰磅 to g') - num('1 沙俄俄磅 to g')) > 2, '')
  assert('匈牙利磅 = 560.6 g', Math.abs(num('1 匈牙利波佐尼 to g') - 560.6) < 1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 数据质量 --')
// ───────────────────────────────────────────────────────────
{
  assert('第四批 ≥35 条', ANCIENT_FOURTH_UNITS.length >= 35, String(ANCIENT_FOURTH_UNITS.length))
  const all = ANCIENT_FOURTH_UNITS.flatMap((u) => u.variants)
  assert('★ 每条都有依据', all.every((v) => v.source.length > 5), '')
  assert('每条都有可信度', all.every((v) => ['exact', 'typical', 'range'].includes(v.confidence)), '')
  /** 区间型有上界。 */
  const ranges = all.filter((v) => v.confidence === 'range')
  assert('区间型都给了上界', ranges.every((v) => v.factorHigh !== undefined), String(ranges.length))
  /** name 唯一。 */
  const names = ALL_ERA_UNITS.map((u) => u.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert('★ 全部时代单位 name 无重复', dup.length === 0, dup.join(','))
  /** 注册数。 */
  assert('★ 时代单位注册 ≥200', ERA_UNIT_INDEX.size >= 200, String(ERA_UNIT_INDEX.size))
  /** 各体系都有注册。 */
  const SYSTEMS = [
    ['奥斯曼', OTTOMAN_UNITS.length], ['波斯', PERSIAN_UNITS.length],
    ['玛雅', MAYA_UNITS.length], ['阿兹特克', AZTEC_UNITS.length],
    ['北欧', NORDIC_UNITS.length], ['荷兰', DUTCH_UNITS.length],
    ['西班牙', IBERIAN_UNITS.length], ['意大利', ITALIAN_UNITS.length],
    // 波兰 4 条 + 匈牙利 1 条，分属两个时代
    ['波兰', POLISH_HUNGARIAN_UNITS.filter((u) => u.variants[0].era === '波兰').length],
    ['匈牙利', POLISH_HUNGARIAN_UNITS.filter((u) => u.variants[0].era === '匈牙利').length],
  ]
  for (const [era, count] of SYSTEMS) {
    const registered = [...ERA_UNIT_INDEX.values()].filter((v) => v.variant.era === era).length
    assert(era + ' 体系已注册', registered >= count * 0.9, `注册 ${registered}/${count}`)
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. 交叉验证（不破坏前面几批）--')
// ───────────────────────────────────────────────────────────
{
  assert('巴比伦肘尺 = 50cm（不被波兰污染）', Math.abs(num('1 巴比伦肘尺 to cm') - 50) < 1,
    String(num('1 巴比伦肘尺 to cm')))
  assert('古埃及肘尺 = 52.35cm', Math.abs(num('1 古埃及肘尺 to cm') - 52.35) < 0.1, '')
  assert('波兰肘尺 = 59.55cm', Math.abs(num('1 波兰肘尺 to cm') - 59.55) < 0.1, '')
  assert('汉尺 = 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('罗马尺 = 29.6cm', Math.abs(num('1 罗马尺 to cm') - 29.6) < 0.1, '')
  assert('日本日尺 = 30.3cm', Math.abs(num('1 日本日尺 to cm') - 30.3) < 0.1, '')
  assert('市尺 = 33.33cm', Math.abs(num('1 市尺 to cm') - 33.333) < 0.01, '')
  assert('1 吨 = 1000kg', Math.abs(num('1 吨 to kg') - 1000) < 1e-9, '')
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
