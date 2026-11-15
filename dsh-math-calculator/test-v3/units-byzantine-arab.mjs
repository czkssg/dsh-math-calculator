/**
 * 第五批测试：拜占庭细分 + 阿拉伯帝国。
 *
 * ## 两套体系的共同难点
 *
 * 它们的单位**在时间/空间上都不是常量**：
 *
 * ```
 *   拜占庭 litra   早期 327.45 → 中期 320 → 晚期 318 g   千年里变三次
 *   阿拉伯 ratl    巴格达 406 → 埃及 468 → 叙利亚 562 g   差 38%
 * ```
 *
 * ## ★ 本套件最要紧的两点
 *
 * ### ① 宗教计量是「精确」的，商业计量是「模糊」的
 *
 * ```
 *   saa / mudd   zakat 天课用 → 教法定量 → confidence: 'exact'
 *   ratl / qafiz 商业用      → 各地不同 → confidence: 'typical' / 'range'
 * ```
 *
 * 这个区分不是学究气：**教法单位可以直接算，商业单位必须指明地点**。
 *
 * ### ② 拜占庭的 gramma 不是英制的 grain
 *
 * ```
 *   拜占庭 gramma  3.411 g     ← 「格令」，但大 52 倍
 *   英制 grain     0.0648 g
 * ```
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { buildEngine } from '../lib/core/engine.js'
import { BYZANTINE_DETAIL_UNITS, ARAB_UNITS, BYZANTINE_ARAB_UNITS } from '../lib/core/units-byzantine-arab.js'
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
console.log('-- 1. ★ 拜占庭 litra 的千年演变 --')
// ───────────────────────────────────────────────────────────
{
  const early = num('1 拜占庭磅 to g')
  assert('★ 拜占庭磅默认 = 早期 327.45g', Math.abs(early - 327.45) < 1, String(early))

  /** 三个时期都要能查到。 */
  const e = findEraVariant('litra', '拜占庭', '早期')[0]
  const m = findEraVariant('litra', '拜占庭', '中期')[0]
  const l = findEraVariant('litra', '拜占庭', '晚期')[0]
  assert('早期 327.45g', Math.abs((e?.factor ?? 0) * 1000 - 327.45) < 1, '')
  assert('中期 320g', Math.abs((m?.factor ?? 0) * 1000 - 320) < 1, '')
  assert('晚期 318g', Math.abs((l?.factor ?? 0) * 1000 - 318) < 1, '')
  /** 单调递减（重量在千年里缓慢下降）。 */
  assert('★ 早期 > 中期 > 晚期',
    (e?.factor ?? 0) > (m?.factor ?? 0) && (m?.factor ?? 0) > (l?.factor ?? 0), '')
  /** 与罗马 libra 只差 0.4%。 */
  assert('★ 拜占庭磅承罗马 libra（差 <1%）',
    Math.abs((e?.factor ?? 0) * 1000 / 328.9 - 1) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 拜占庭 gramma ≠ 英制 grain（大 52 倍）--')
// ───────────────────────────────────────────────────────────
{
  const gramma = num('1 拜占庭格令 to g')
  const grain = num('1 grain to g')
  assert('拜占庭格令 = 3.411 g', Math.abs(gramma - 3.411) < 0.01, String(gramma))
  assert('英制 grain = 0.0648 g', Math.abs(grain - 0.0648) < 0.001, '')
  assert('★ 拜占庭格令是英制 grain 的 52 倍',
    Math.abs(gramma / grain - 52.6) < 1, String((gramma / grain).toFixed(1)))
  /** 但两者的 keration/克拉 是同一个量级。 */
  assert('拜占庭角豆 = 0.218 g（克拉词源）',
    Math.abs(num('1 拜占庭角豆 to g') - 0.218) < 0.005, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 拜占庭长度链自洽 --')
// ───────────────────────────────────────────────────────────
{
  assert('拜占庭尺 = 31.14 cm', Math.abs(num('1 拜占庭尺 to cm') - 31.14) < 0.1, '')
  assert('拜占庭寻 = 6 尺',
    Math.abs(num('1 拜占庭寻 to m') / num('1 拜占庭尺 to m') - 6) < 0.1, '')
  assert('拜占庭剑尺 = 1/6 寻',
    Math.abs(num('1 拜占庭寻 to m') / num('1 拜占庭剑尺 to m') - 6) < 0.1, '')
  /** 拜占庭尺比罗马 pes 长 5%。 */
  assert('★ 拜占庭尺比罗马尺长 5%',
    Math.abs(num('1 拜占庭尺 to cm') / num('1 罗马尺 to cm') - 1.052) < 0.01, '')
  /** 拜占庭里 = 7.5 斯塔德。 */
  assert('拜占庭里 = 1.574 km', Math.abs(num('1 拜占庭里 to km') - 1.574) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 阿拉伯 ratl 三地差 38% --')
// ───────────────────────────────────────────────────────────
{
  const baghdad = num('1 阿拉伯磅 to g')
  assert('★ 阿拉伯磅默认 = 巴格达 406.25g', Math.abs(baghdad - 406.25) < 2, String(baghdad))

  const misr = findEraVariant('ratl', '阿拉伯', '埃及')[0]
  const sham = findEraVariant('ratl', '阿拉伯', '叙利亚')[0]
  assert('埃及 ratl = 468g', Math.abs((misr?.factor ?? 0) * 1000 - 468.1) < 2, '')
  assert('叙利亚 ratl = 562.5g', Math.abs((sham?.factor ?? 0) * 1000 - 562.5) < 2, '')
  assert('★ 叙利亚比巴格达重 38%',
    Math.abs((sham?.factor ?? 0) / (baghdad / 1000) - 1.385) < 0.02,
    String(((sham?.factor ?? 0) / (baghdad / 1000)).toFixed(3)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 宗教计量是精确的（教法定量）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * saa 与 mudd 是 zakat（天课）的计量单位，教法有严格定义，
   * 所以它们标 `exact` 而不是 `typical`。
   */
  const saa = findEraVariant('saa', '阿拉伯')[0]
  const mudd = findEraVariant('mudd', '阿拉伯')[0]
  assert('★ saa 标为 exact（教法定量）', saa?.confidence === 'exact', String(saa?.confidence))
  assert('★ mudd 标为 exact', mudd?.confidence === 'exact', String(mudd?.confidence))
  assert('saa = 2.172 L', Math.abs(num('1 阿拉伯萨阿 to L') - 2.172) < 0.01, '')
  assert('mudd = 0.543 L', Math.abs(num('1 阿拉伯莫德 to L') - 0.543) < 0.005, '')
  assert('★ 1 saa = 4 mudd',
    Math.abs(num('1 阿拉伯萨阿 to L') / num('1 阿拉伯莫德 to L') - 4) < 0.05, '')

  /** 而商业单位不是精确的。 */
  const qafiz = findEraVariant('qafiz', '阿拉伯')[0]
  assert('★ qafiz 标为 range（商业，各地不同）', qafiz?.confidence === 'range', String(qafiz?.confidence))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 阿拉伯长度与货币 --')
// ───────────────────────────────────────────────────────────
{
  assert('阿拉伯法尔萨赫 = 5.76 km', Math.abs(num('1 阿拉伯法尔萨赫 to km') - 5.76) < 0.01, '')
  /** farsakh 比罗马里长 4 倍。 */
  assert('★ 法尔萨赫是罗马里的 3.9 倍',
    Math.abs(num('1 阿拉伯法尔萨赫 to m') / num('1 罗马里 to m') - 3.89) < 0.05, '')
  assert('阿拉伯英里 = 1.92 km', Math.abs(num('1 阿拉伯英里 to km') - 1.92) < 0.01, '')
  assert('★ 阿拉伯英里 ≠ 英制英里（1.92 vs 1.609）',
    Math.abs(num('1 阿拉伯英里 to km') - 1.609344) > 0.3, '')

  /** mithqal（金）与 dirham（银）的比例决定金银比价。 */
  const miskal = num('1 阿拉伯米斯卡尔 to g')
  const dirham = num('1 伊斯兰迪拉姆 to g')
  assert('米斯卡尔 = 4.25 g', Math.abs(miskal - 4.25) < 0.01, '')
  assert('★ 米斯卡尔是 dirham 的 1.43 倍',
    Math.abs(miskal / dirham - 1.43) < 0.05, String((miskal / dirham).toFixed(2)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. qintar 的区间（取决于哪个 ratl）--')
// ───────────────────────────────────────────────────────────
{
  const q = findEraVariant('qintar_arab', '阿拉伯')[0]
  assert('阿拉伯坎塔尔标为 range', q?.confidence === 'range', String(q?.confidence))
  assert('给了区间上界', q?.factorHigh !== undefined, '')
  /** 100 巴格达 ratl ≈ 40.6 kg。 */
  assert('★ 100 巴格达 ratl ≈ 坎塔尔下界',
    Math.abs((q?.factor ?? 0) - num('1 阿拉伯磅 to g') * 100 / 1000) < 1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 数据质量与去重 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * ⚠ 期望值是 **19** 条，不是我最初估计的 25。
   *
   * 拜占庭 10 条 + 阿拉伯 9 条。我一开始按「两套体系各十几条」估，
   * 实际数下来每套不到十个 —— 因为它们覆盖的是**维度**（长/质/容/面积）
   * 而不是穷举变体。变体的丰富度体现在 `variants` 数组里
   * （如 litra 有 3 个时期、ratl 有 3 个地区）。
   */
  assert('第五批 ≥19 条', BYZANTINE_ARAB_UNITS.length >= 19, String(BYZANTINE_ARAB_UNITS.length))
  const all = BYZANTINE_ARAB_UNITS.flatMap((u) => u.variants)
  assert('★ 每条都有依据', all.every((v) => v.source.length > 5), '')
  assert('每条都有可信度', all.every((v) => ['exact', 'typical', 'range'].includes(v.confidence)), '')
  const ranges = all.filter((v) => v.confidence === 'range')
  assert('区间型都给了上界', ranges.every((v) => v.factorHigh !== undefined), String(ranges.length))

  /**
   * ★ name 全局唯一 —— 这一条抓出过一次真重复：
   * `litra` 与 `orgyia` 在第二与第五批各定义一次，
   * 导致「晚期 litra」永远查不到（`find` 只取第一个）。
   */
  const names = ALL_ERA_UNITS.map((u) => u.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert('★ 全部时代单位 name 无重复', dup.length === 0, dup.join(','))

  assert('★ 时代单位注册 ≥230', ERA_UNIT_INDEX.size >= 230, String(ERA_UNIT_INDEX.size))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 不破坏既有体系 --')
// ───────────────────────────────────────────────────────────
{
  assert('汉尺 = 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('罗马尺 = 29.6cm', Math.abs(num('1 罗马尺 to cm') - 29.6) < 0.1, '')
  assert('罗马磅 = 328.9g', Math.abs(num('1 罗马磅 to g') - 328.9) < 0.1, '')
  assert('奥斯曼尺 = 68cm', Math.abs(num('1 奥斯曼尺 to cm') - 68) < 0.5, '')
  assert('西班牙里格 = 5.573km', Math.abs(num('1 西班牙里格 to km') - 5.5727) < 0.01, '')
  assert('伊斯兰迪拉姆 = 2.97g', Math.abs(num('1 伊斯兰迪拉姆 to g') - 2.97) < 0.05, '')
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
