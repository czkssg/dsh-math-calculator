/**
 * 扩充批测试：英制工业补充 + 更多古文明。
 *
 * ## 数据源
 *
 * | 来源 | 内容 |
 * |---|---|
 * | [UCUM 官方单位表](https://github.com/ucum-org/ucum/blob/main/ucum-ci.units) | 英制三套变体、六种 BTU、药衡、干量、印刷、纺织 |
 * | 历史文献 | 巴比伦（汉谟拉比法典）、印度（政事论）、拜占庭、沙俄、德意志、法国旧制 |
 *
 * ## ★ 本套件守的三个「差一点点」陷阱
 *
 * ```
 *   ① 美制英尺 vs 国际英尺        差 0.6 ppm（大地测量会累积到米级）
 *   ② 六种 BTU                    差 0.5%（锅炉燃料计算有意义）
 *   ③ 干量加仑 vs 液量加仑        差 16%（谷物与液体不能混）
 * ```
 */
import { buildEngine } from '../lib/core/engine.js'
import { IMPERIAL_EXT_UNITS, ENERGY_VARIANTS, IMPERIAL_VOLUME_EXT } from '../lib/core/units-imperial-ext.js'
import { ANCIENT_MORE_UNITS } from '../lib/core/units-ancient-more.js'
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
console.log('-- 1. ★ 英制三套长度（差 0.6 ppm）--')
// ───────────────────────────────────────────────────────────
{
  const ftI = num('1 国际英尺 to m')
  const ftUs = num('1 美制英尺 to m')
  const ftBr = num('1 英制英尺 to m')
  assert('国际英尺 = 0.3048 m（精确）', Math.abs(ftI - 0.3048) < 1e-12, String(ftI))
  assert('美制英尺 = 0.30480061 m', Math.abs(ftUs - 0.30480061) < 1e-8, String(ftUs))
  assert('英制英尺 ≈ 0.3048 m', Math.abs(ftBr - 0.30479999) < 1e-7, String(ftBr))
  /**
   * 差异极小（0.6 ppm），但**真实存在**。
   * 判据：美制英尺比国际英尺长，差在 1e-7 量级。
   */
  const ppm = (ftUs - ftI) / ftI * 1e6
  assert('★ 美制比国际长 2 ppm 以内', ppm > 0.5 && ppm < 3, String(ppm))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 六种 BTU（差 0.5%）--')
// ───────────────────────────────────────────────────────────
{
  const variants = ['btu39', 'btu59', 'btu60', 'btumean', 'btuit', 'btuth']
  const values = variants.map((v) => num('1 ' + v + ' to J'))
  assert('六种 BTU 全可查', values.every((v) => v > 1050 && v < 1060), values.map((v) => v.toFixed(1)).join(','))
  /**
   * 国际表 BTU（最常用）与 39°F BTU（Watt 原始定义）差 0.44%。
   * 这个差在「锅炉消耗万吨煤」的账上会是几十吨。
   */
  const diff = Math.abs(num('1 btu39 to J') - num('1 btuit to J')) / num('1 btuit to J')
  assert('★ 39°F BTU 与国际表 BTU 差 0.4%', diff > 0.003 && diff < 0.006, String(diff))
  /** 卡路里变体。 */
  assert('热化学卡 = 4.184 J（精确）', Math.abs(num('1 calth to J') - 4.184) < 1e-9, '')
  assert('国际表卡 = 4.1868 J', Math.abs(num('1 calit to J') - 4.1868) < 1e-9, '')
  assert('★ 国际表卡比热化学卡大 0.067%', Math.abs(num('1 calit to J') / num('1 calth to J') - 1.00067) < 1e-4, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 干量 vs 液量（差 16%）--')
// ───────────────────────────────────────────────────────────
{
  const galLiquid = num('1 gallonus to L')
  const galDry = num('1 温彻斯特加仑 to L')
  assert('美制液量加仑 = 3.785 L', Math.abs(galLiquid - 3.78541) < 0.001, String(galLiquid))
  assert('温彻斯特加仑 = 4.405 L', Math.abs(galDry - 4.40488) < 0.001, String(galDry))
  assert('★ 干量加仑比液量重 16%', Math.abs(galDry / galLiquid - 1.164) < 0.01, String(galDry / galLiquid))

  /** 美制蒲式耳与英制蒲式耳不同。 */
  const buUs = num('1 美制蒲式耳 to L')
  const buBr = num('1 bushel to L')
  assert('美制蒲式耳 = 35.24 L', Math.abs(buUs - 35.239) < 0.01, '')
  assert('英制蒲式耳 = 36.37 L', Math.abs(buBr - 36.369) < 0.01, '')
  assert('★ 英制蒲式耳比美制大 3.2%', Math.abs(buBr / buUs - 1.032) < 0.005, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 药衡 apothecary vs 金衡 troy --')
// ───────────────────────────────────────────────────────────
{
  /** 磅与盎司相同（都是 12 oz = 5760 grain）。 */
  assert('药衡磅 = 金衡磅（都 373.24 g）',
    Math.abs(num('1 药衡磅 to g') - num('1 金衡磅 to g')) < 1e-6, '')
  assert('药衡盎司 = 金衡盎司（都 31.103 g）',
    Math.abs(num('1 药衡盎司 to g') - num('1 金衡盎司 to g')) < 1e-6, '')
  /** 但细分链不同：药衡 1 oz = 8 dram = 24 scruple；金衡 1 oz = 20 dwt。 */
  assert('药衡 1 盎司 = 8 打兰', Math.abs(num('1 药衡盎司 to g') / num('1 药衡打兰 to g') - 8) < 0.01, '')
  assert('药衡 1 打兰 = 3 斯克鲁普', Math.abs(num('1 药衡打兰 to g') / num('1 斯克鲁普 to g') - 3) < 0.01, '')
  assert('1 斯克鲁普 = 20 grain', Math.abs(num('1 斯克鲁普 to g') / num('1 grain to g') - 20) < 0.01, '')
  /** 常衡与金衡的磅不同。 */
  assert('★ 常衡磅（453.6g）≠ 金衡磅（373.2g）',
    Math.abs(num('1 lb to g') / num('1 金衡磅 to g') - 1.215) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 印刷与纺织（蒸汽朋克的出版业）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 印刷派卡 = 12 印刷点',
    Math.abs(num('1 印刷派卡 to mm') / num('1 印刷点 to mm') - 12) < 0.01, '')
  assert('1 西塞罗 = 12 迪多点',
    Math.abs(num('1 西塞罗 to mm') / num('1 迪多点 to mm') - 12) < 0.01, '')
  /** PostScript 点与传统印刷点略有差异。 */
  assert('PostScript 点 ≈ 0.3528 mm', Math.abs(num('1 point to mm') - 0.3528) < 0.001, '')
  assert('传统印刷点 ≈ 0.3515 mm', Math.abs(num('1 印刷点 to mm') - 0.3515) < 0.001, '')
  /** 纺织。 */
  assert('1 tex = 1 g/km', Math.abs(num('1 特克斯 to kg/m') - 1e-6) < 1e-12, '')
  assert('★ 1 denier = 1 g/9km（tex 的 1/9）',
    Math.abs(num('1 但尼尔 to kg/m') * 9 - num('1 特克斯 to kg/m')) < 1e-12, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 蒸汽朋克货运（木材与电线）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 板英尺 = 2.36 L', Math.abs(num('1 板英尺 to L') - 2.3597) < 0.01, '')
  assert('1 考得 = 3.625 m³', Math.abs(num('1 考得 to m3') - 3.6246) < 0.01, '')
  /** 圆密尔是 AWG 电线规格的基础。 */
  assert('1 圆密尔 ≈ 5.067e-10 m²', Math.abs(num('1 圆密尔 to mm2') - 5.067e-4) < 1e-6, '')
  /** 公制马力与机械马力不同。 */
  assert('公制马力 = 735.5 W', Math.abs(num('1 公制马力 to W') - 735.5) < 0.1, '')
  assert('★ 公制比机械马力小 1.4%', Math.abs(num('1 hp to W') / num('1 公制马力 to W') - 1.0139) < 0.001, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. ★ 古巴比伦（六十进制与银本位）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 巴比伦米纳 = 500 g', near('1 巴比伦米纳 to g', 500), String(num('1 巴比伦米纳 to g')))
  assert('1 舍客勒 = 米纳的 1/60', Math.abs(num('1 巴比伦米纳 to g') / num('1 巴比伦舍客勒 to g') - 60) < 0.5, '')
  assert('1 巴比伦塔兰特 = 60 米纳', Math.abs(num('1 巴比伦塔兰特 to kg') / num('1 巴比伦米纳 to g') * 1000 - 60) < 0.5, '')
  /** 尼达 = 12 肘尺。 */
  assert('1 尼达 = 12 巴比伦肘尺',
    Math.abs(num('1 巴比伦尼达 to m') / num('1 巴比伦肘尺 to m') - 12) < 0.1, '')
  assert('1 巴比伦肘尺 = 30 指',
    Math.abs(num('1 巴比伦肘尺 to m') / num('1 巴比伦指 to m') - 30) < 0.5, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. ★ 拜占庭（克拉的词源）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 拜占庭磅 ≈ 327.45 g', near('1 拜占庭磅 to g', 327.45, 0.01), String(num('1 拜占庭磅 to g')))
  /**
   * keration（角豆籽）是「克拉」的词源。
   * 但它与钻石克拉（200 mg）**不是同一个值** —— 这是词源而非同单位。
   */
  const ker = num('1 拜占庭凯拉顿 to g')
  assert('1 凯拉顿 ≈ 0.218 g', Math.abs(ker - 0.218) < 0.01, String(ker))
  assert('★ 凯拉顿 ≠ 钻石克拉（200mg）', Math.abs(ker - 0.2) > 0.01, String(ker))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 沙俄/德意志/法国旧制 --')
// ───────────────────────────────────────────────────────────
{
  /** 沙俄：sazhen = 7 ft，arshin = 28 in。 */
  assert('1 沙绳 = 2.1336 m', Math.abs(num('1 沙俄沙绳 to m') - 2.1336) < 0.001, '')
  assert('1 俄尺 = 0.7112 m', Math.abs(num('1 沙俄俄尺 to m') - 0.7112) < 0.001, '')
  assert('1 俄里 = 500 沙绳', Math.abs(num('1 沙俄俄里 to m') / num('1 沙俄沙绳 to m') - 500) < 0.5, '')
  assert('1 俄磅 = 409.5 g', Math.abs(num('1 沙俄俄磅 to g') - 409.512) < 0.5, '')
  assert('★ 1 普特 = 40 俄磅', Math.abs(num('1 沙俄普特 to kg') / num('1 沙俄俄磅 to g') * 1000 - 40) < 0.5, '')
  /** 德意志：Rhein-Fuß（普鲁士 1816 标准）。 */
  assert('1 莱茵尺 = 31.385 cm', Math.abs(num('1 德意志莱茵尺 to cm') - 31.385) < 0.01, '')
  assert('★ 1 德里 ≈ 7.53 km（比英里长 4.7 倍）',
    Math.abs(num('1 德意志德里 to km') / 1.609344 - 4.68) < 0.1, '')
  /** 法国：pied du roi 是米制的起点。 */
  assert('★ 1 国王尺 = 32.484 cm', Math.abs(num('1 法国旧制国王尺 to cm') - 32.484) < 0.01, '')
  assert('1 法丈 = 6 国王尺', Math.abs(num('1 法国旧制法丈 to m') / num('1 法国旧制国王尺 to m') - 6) < 0.01, '')
  assert('1 法磅 = 489.5 g', Math.abs(num('1 法国旧制法磅 to g') - 489.5) < 0.5, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. 古印度（yojana 的值有争议）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 托拉 ≈ 11.664 g', near('1 古印度托拉 to g', 11.664, 0.01), '')
  assert('1 芒德 = 40 西尔', Math.abs(num('1 古印度芒德 to kg') / num('1 古印度西尔 to kg') - 40) < 0.5, '')
  /** yojana 是区间型，值争议大。 */
  const yoj = findEraVariant('yojana', '古印度')[0]
  assert('★ yojana 标为 range（值有争议）', yoj?.confidence === 'range', String(yoj?.confidence))
  assert('yojana 给了区间上界', yoj?.factorHigh !== undefined, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 11. 数据质量 --')
// ───────────────────────────────────────────────────────────
{
  assert('英制补充 ≥50 条', IMPERIAL_EXT_UNITS.length >= 50, String(IMPERIAL_EXT_UNITS.length))
  assert('古文明补充 ≥35 条', ANCIENT_MORE_UNITS.length >= 35, String(ANCIENT_MORE_UNITS.length))
  assert('★ 英制补充每条都有说明', IMPERIAL_EXT_UNITS.every((u) => (u.note ?? '').length > 5), '')
  assert('★ 古文明每条都有依据', ANCIENT_MORE_UNITS.flatMap((u) => u.variants).every((v) => v.source.length > 5), '')
  assert('古文明可信度都标了', ANCIENT_MORE_UNITS.flatMap((u) => u.variants)
    .every((v) => ['exact', 'typical', 'range'].includes(v.confidence)), '')
  /** name 唯一。 */
  const eraNames = ALL_ERA_UNITS.map((u) => u.name)
  const dup = eraNames.filter((n, i) => eraNames.indexOf(n) !== i)
  assert('★ 时代单位 name 无重复', dup.length === 0, dup.join(','))
  /** 注册总数。 */
  assert('★ 时代单位注册 ≥150', ERA_UNIT_INDEX.size >= 150, String(ERA_UNIT_INDEX.size))
}

// ───────────────────────────────────────────────────────────
console.log('-- 12. 不破坏既有 --')
// ───────────────────────────────────────────────────────────
{
  assert('1 汉尺 = 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('1 罗马磅 = 328.9g', Math.abs(num('1 罗马磅 to g') - 328.9) < 0.1, '')
  assert('1 市尺 = 33.33cm', Math.abs(num('1 市尺 to cm') - 33.333) < 0.01, '')
  assert('1 psi = 6.895 kPa', Math.abs(num('1 psi to kPa') - 6.8948) < 0.01, '')
  assert('1 gpm = 3.785 L/min', Math.abs(num('1 gpm to L/min') - 3.7854) < 0.01, '')
  assert('30 里 = 15 km', Math.abs(num('30 里 to km') - 15) < 1e-9, '')
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
