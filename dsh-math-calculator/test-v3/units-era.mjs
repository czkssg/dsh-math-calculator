/**
 * 带时代的单位体系测试。
 *
 * ## 为什么单独一套
 *
 * 这一层解决一个老单位表没解决的问题：
 *
 * ```
 *   老表：市尺 factor 0.32  note "历代不同：商约16cm、汉约23cm、明清约32cm"
 *        → 查「汉代的尺」拿不到数，只有一句文本
 *
 *   新层：尺有 20 个变体，每个带时代/年代区间/因子/可信度/依据
 *        → 「1 汉尺 to cm」= 23.1，可算
 * ```
 *
 * ## 本套件守四件事
 *
 *   ① **年代序列正确**（尺从商 15.8 → 清 32，不是单调变化）
 *   ② **同代多变体各自可查**（唐有大尺/小尺、明有三把尺）
 *   ③ **无变体写法落到日常主变体**（「唐朝的尺」= 大尺 30，不是小尺 24.6）
 *   ④ **可信度如实标注**（exact / typical / range 三级，不把常用值说成精确值）
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { buildEngine } from '../lib/core/engine.js'
import {
  CHINESE_ERA_UNITS, findEraVariant, eraTimeline,
} from '../lib/core/units-era.js'
import { ERA_UNIT_INDEX, ERA_ALIAS, normalizeEraUnit, lookupEraFactor } from '../lib/core/units-era-registry.js'

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
/** 取换算结果的数值部分。 */
const num = (expr) => Number(String(engine.evaluate(expr)).split(' ')[0])

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 尺的年代序列（不是单调变化）--')
// ───────────────────────────────────────────────────────────
{
  const timeline = eraTimeline('尺')
  assert('尺有 ≥18 个时代变体', timeline.length >= 18, String(timeline.length))
  /**
   * 关键判据：**商短、汉中等、元最长、明清回落**。
   * 若实现把「后面的一定更长」当规律，元（34）与清（32）的顺序会错。
   */
  assert('商尺最短（≈15.8cm）', Math.abs(num('1 商尺 to cm') - 15.8) < 0.1, String(num('1 商尺 to cm')))
  assert('汉尺 ≈23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, String(num('1 汉尺 to cm')))
  assert('元尺最长（34cm）', Math.abs(num('1 元尺 to cm') - 34) < 0.1, String(num('1 元尺 to cm')))
  assert('清尺回落到 32cm', Math.abs(num('1 清营造尺 to cm') - 32) < 0.1, String(num('1 清营造尺 to cm')))
  /** 元 > 清 —— 这条能抓住「以为越晚越长」的错误。 */
  assert('★ 元尺比清尺长', num('1 元尺 to cm') > num('1 清营造尺 to cm'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 同一朝代多个变体各自可查 --')
// ───────────────────────────────────────────────────────────
{
  /** 唐有大尺（日常）与小尺（调律），差 5.4cm。 */
  assert('唐大尺 = 30cm', Math.abs(num('1 唐大尺 to cm') - 30) < 0.1, String(num('1 唐大尺 to cm')))
  assert('唐小尺 = 24.6cm', Math.abs(num('1 唐小尺 to cm') - 24.6) < 0.1, String(num('1 唐小尺 to cm')))
  assert('★ 唐大尺与唐小尺差 5.4cm', Math.abs((num('1 唐大尺 to cm') - num('1 唐小尺 to cm')) - 5.4) < 0.1, '')

  /** 明有三把尺。 */
  assert('明营造尺 = 32cm', Math.abs(num('1 明营造尺 to cm') - 32) < 0.1, '')
  assert('明裁衣尺 = 34cm', Math.abs(num('1 明裁衣尺 to cm') - 34) < 0.1, '')
  assert('明量地尺 = 32.7cm', Math.abs(num('1 明量地尺 to cm') - 32.7) < 0.1, '')

  /** 宋有两把。 */
  assert('宋营造尺 = 31.2cm', Math.abs(num('1 宋营造尺 to cm') - 31.2) < 0.1, '')
  assert('宋布帛尺 = 27.2cm', Math.abs(num('1 宋布帛尺 to cm') - 27.2) < 0.1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 无变体写法落到日常主变体 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这条是最容易错的：多个变体抢同一个别名，后注册的会覆盖先注册的。
   * 实测踩过 —— 宋的「宋朝尺」被布帛尺覆盖，算出 27.2 而不是 31.2。
   */
  assert('★「唐朝的尺」= 大尺 30', Math.abs(num('1 唐朝的尺 to cm') - 30) < 0.1,
    String(num('1 唐朝的尺 to cm')))
  assert('★「宋朝的尺」= 营造尺 31.2', Math.abs(num('1 宋朝的尺 to cm') - 31.2) < 0.1,
    String(num('1 宋朝的尺 to cm')))
  assert('「明朝的尺」= 营造尺 32', Math.abs(num('1 明朝的尺 to cm') - 32) < 0.1, '')
  assert('「清朝的尺」= 营造尺 32', Math.abs(num('1 清朝的尺 to cm') - 32) < 0.1, '')
  /** 无变体的朝代直接给值。 */
  assert('「汉朝的尺」= 23.1', Math.abs(num('1 汉朝的尺 to cm') - 23.1) < 0.1, '')
  assert('「商朝尺」= 15.8', Math.abs(num('1 商朝尺 to cm') - 15.8) < 0.1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 斤的变化（商 120g → 清 596.8g，差 5 倍）--')
// ───────────────────────────────────────────────────────────
{
  assert('汉斤 ≈254g', Math.abs(num('1 汉斤 to g') - 254) < 2, String(num('1 汉斤 to g')))
  assert('唐斤 ≈668g', Math.abs(num('1 唐斤 to g') - 668) < 2, '')
  assert('清斤 = 596.8g', Math.abs(num('1 清斤 to g') - 596.8) < 0.5, '')
  assert('现代市斤 = 500g', Math.abs(num('1 斤 to g') - 500) < 0.5, '')
  /** 商→清 差 5 倍，这是「用现代斤写汉代设定」会差多少。 */
  assert('★ 清斤是商斤的约 5 倍', num('1 清斤 to g') / 120 > 4.5, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 容量变化（汉升 200mL → 明升 1073mL）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * ⚠ 单位换算：factor 是「换算到基准单位 m³」，要换成 mL 需乘 **1e6**，不是 1000。
   * 第一版乘 1000 于是得到 0.2 与 1.073，被断言的 200/1073 判红 —— 是测试算错，不是数据错。
   */
  const hanSheng = (findEraVariant('升', '秦汉')[0]?.factor ?? 0) * 1e6
  const mingSheng = (findEraVariant('升', '明')[0]?.factor ?? 0) * 1e6
  assert('汉升 ≈200mL', Math.abs(hanSheng - 200) < 30, String(hanSheng))
  assert('明升 ≈1073mL', Math.abs(mingSheng - 1073) < 30, String(mingSheng))
  assert('★ 明升是汉升的 5 倍多', mingSheng / hanSheng > 5, String(mingSheng / hanSheng))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. ★ 可信度如实标注（不把常用值说成精确值）--')
// ───────────────────────────────────────────────────────────
{
  const all = CHINESE_ERA_UNITS.flatMap((u) => u.variants)
  const byLevel = { exact: 0, typical: 0, range: 0 }
  for (const v of all) byLevel[v.confidence] += 1
  assert('有 exact 级（官定标准）', byLevel.exact > 0, String(byLevel.exact))
  assert('有 typical 级（学界常用值）', byLevel.typical > 0, String(byLevel.typical))
  assert('有 range 级（只有区间）', byLevel.range > 0, String(byLevel.range))
  /** 每条都必须有依据。 */
  assert('★ 每条变体都标了依据', all.every((v) => typeof v.source === 'string' && v.source.length > 5), '')
  /** 区间型必须有上界。 */
  const rangeVariants = all.filter((v) => v.confidence === 'range')
  assert('区间型都给了上界', rangeVariants.every((v) => v.factorHigh !== undefined), '')

  /** 现代市制必须是 exact（它是法定标准）。 */
  const modernChi = findEraVariant('尺', '现代')[0]
  assert('现代市尺是 exact 级', modernChi?.confidence === 'exact', String(modernChi?.confidence))
  /** 商尺只能是 range（考古推算）。 */
  const shangChi = findEraVariant('尺', '商')[0]
  assert('商尺是 range 级（考古推算）', shangChi?.confidence === 'range', String(shangChi?.confidence))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 查询接口 --')
// ───────────────────────────────────────────────────────────
{
  const hanChi = findEraVariant('尺', '汉')
  assert('findEraVariant 能按时代查', hanChi.length > 0, String(hanChi.length))
  const tangDa = findEraVariant('尺', '唐', '大尺')
  assert('能按变体查', tangDa.length === 1, String(tangDa.length))

  const factor = lookupEraFactor('尺', '汉')
  assert('lookupEraFactor 给因子', factor !== null && factor.factor > 0, '')
  assert('lookupEraFactor 带依据', (factor?.source ?? '').length > 5, '')
  assert('查不存在的时代返回 null', lookupEraFactor('尺', '古埃及') === null, '')

  /** 归一接口。 */
  assert('normalizeEraUnit 认「汉尺」', normalizeEraUnit('汉尺') !== null, '')
  assert('normalizeEraUnit 认「清营造尺」', normalizeEraUnit('清营造尺') !== null, '')
  assert('normalizeEraUnit 认不出给 null', normalizeEraUnit('不存在的单位') === null, '')

  /** 注册表规模。 */
  assert('注册了 ≥60 个时代单位', ERA_UNIT_INDEX.size >= 60, String(ERA_UNIT_INDEX.size))
  assert('别名单词 ≥100 条', ERA_ALIAS.size >= 100, String(ERA_ALIAS.size))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 不破坏现代单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('30 里 = 15km', Math.abs(num('30 里 to km') - 15) < 1e-9, '')
  assert('1 斤 = 500g', Math.abs(num('1 斤 to g') - 500) < 1e-9, '')
  assert('2 时辰 = 4h', Math.abs(num('2 时辰 to h') - 4) < 1e-9, '')
  assert('100 km to mile 正常', Math.abs(num('100 km to mile') - 62.1371) < 0.001, '')
  /** 时代单位能与普通单位混算。 */
  const mixed = engine.evaluate('1 汉尺 + 10 cm')
  assert('汉尺与 cm 能相加', mixed !== undefined, String(mixed))
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
