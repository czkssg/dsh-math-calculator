/**
 * 恒星结构（S3）测试。
 *
 * 锚点：
 *   太阳：L=1, R=1, T=5778K, 寿命 10 Gyr, 宜居带 0.95–1.67 AU, 峰值 501nm
 *   0.3 M☉：M 型矮星，寿命约 200 Gyr
 *   10 M☉：B 型，寿命约 30 Myr
 */
import { describeStarStructure, massLuminosity, massRadius, mainSequenceLifetime, uvFractionOf } from '../lib/stellar.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}

const sun = describeStarStructure(1)

console.log('-- 1. 太阳必须被复现（回归锚）--')
{
  assert('质光关系 L(1)=1', Math.abs(massLuminosity(1) - 1) < 1e-12)
  assert('质径关系 R(1)=1', Math.abs(massRadius(1) - 1) < 1e-12)
  assert('有效温度 ≈ 5778 K', Math.abs(sun.effectiveTempK - 5778) < 20, sun.effectiveTempK.toFixed(0))
  assert('主序寿命 = 10 Gyr', Math.abs(sun.lifetimeGyr - 10) < 1e-9)
  assert('宜居带 0.95–1.67 AU', Math.abs(sun.habitableZoneAU[0] - 0.95) < 0.01 && Math.abs(sun.habitableZoneAU[1] - 1.67) < 0.01)
  assert('峰值波长 ≈ 501 nm', Math.abs(sun.peakWavelengthNm - 501) < 6, sun.peakWavelengthNm.toFixed(1))
  // 5778K 黑体在 400nm 以下的能量占比约 9–13%（真实太阳更低，因谱线吸收）
  assert('黑体紫外占比 ≈ 9–13%', sun.uvFraction > 0.08 && sun.uvFraction < 0.14, (sun.uvFraction * 100).toFixed(1) + '%')
  assert('描述含宜居带', sun.description.includes('宜居带'))
}

console.log('-- 1b. 显式半径/光度优先（避免同一输出两套数字）--')
{
  const forced = describeStarStructure(1, 7.2973525693e-3, { radiusSun: 2 })
  assert('显式 R=2 → 有效温度降为 1/√2', Math.abs(forced.effectiveTempK / sun.effectiveTempK - 1 / Math.SQRT2) < 1e-9, forced.effectiveTempK.toFixed(0))
  assert('显式 R=2 → 光度仍按质量关系', Math.abs(forced.luminositySun - 1) < 1e-12)

  const bright = describeStarStructure(1, 7.2973525693e-3, { luminositySun: 4 })
  assert('显式 L=4 → 宜居带外移 ×2', Math.abs(bright.habitableZoneAU[0] / sun.habitableZoneAU[0] - 2) < 1e-9)
}

console.log('-- 2. 质量把恒星推到正确的类型 --')
{
  const mDwarf = describeStarStructure(0.3)
  assert('0.3 M☉ → M 型', mDwarf.effectiveTempK < 3700, mDwarf.effectiveTempK.toFixed(0))
  assert('0.3 M☉ 寿命 > 100 Gyr', mDwarf.lifetimeGyr > 100, mDwarf.lifetimeGyr.toFixed(0))
  assert('0.3 M☉ 基本不辐射紫外', uvFractionOf(mDwarf.effectiveTempK) < 0.01)

  const bStar = describeStarStructure(10)
  assert('10 M☉ → B 型', bStar.effectiveTempK >= 10000, bStar.effectiveTempK.toFixed(0))
  assert('10 M☉ 寿命 < 0.1 Gyr', bStar.lifetimeGyr < 0.1, bStar.lifetimeGyr.toFixed(3))
  assert('高温星紫外占比高', uvFractionOf(bStar.effectiveTempK) > 0.3, (uvFractionOf(bStar.effectiveTempK) * 100).toFixed(0) + '%')

  assert('质量越小寿命越长', mDwarf.lifetimeGyr > sun.lifetimeGyr && sun.lifetimeGyr > bStar.lifetimeGyr)
  assert('质量越大越亮', bStar.luminositySun > sun.luminositySun)
}

console.log('-- 3. 宜居带是精确关系（∝ √L）--')
{
  const bright = describeStarStructure(2)
  const ratio = bright.habitableZoneAU[0] / sun.habitableZoneAU[0]
  const expected = Math.sqrt(massLuminosity(2))
  assert('宜居带边界 ∝ √L（2 M☉ → ×3.98）', Math.abs(ratio - expected) < 1e-9, ratio.toFixed(3))
  assert('内外边界同时外移', bright.habitableZoneAU[1] > sun.habitableZoneAU[1])
}

console.log('-- 4. 常数敏感度：分层标注 --')
{
  assert('敏感度有 5 条', sun.sensitivity.length === 5, String(sun.sensitivity.length))
  assert('每条都有置信度与适用域', sun.sensitivity.every((x) => x.confidence && x.domain))
  const opacity = sun.sensitivity.find((x) => x.id === 'thomson-opacity')
  assert('汤姆孙不透明度标为精确', opacity.confidence === 'exact')
  const ignition = sun.sensitivity.find((x) => x.id === 'ignition-temperature')
  assert('点火温度标为量级', ignition.confidence === 'order-of-magnitude')
  const lifetime = sun.sensitivity.find((x) => x.id === 'main-sequence-lifetime')
  assert('寿命净效应已给出量级（不再仅方向）', lifetime.confidence === 'order-of-magnitude', lifetime.confidence)

  const hot = describeStarStructure(1, 7.2973525693e-3 * 1.1)
  const hotOpacity = hot.sensitivity.find((x) => x.id === 'thomson-opacity')
  assert('α×1.1 → 不透明度 ×1.21', hotOpacity.magnitude.includes('1.210'), hotOpacity.magnitude)
  const hotIgnition = hot.sensitivity.find((x) => x.id === 'ignition-temperature')
  assert('α×1.1 → 点火温度 ×1.21', hotIgnition.magnitude.includes('1.210'), hotIgnition.magnitude)
  assert('α 变大时方向描述变化', hotIgnition.direction.includes('升高'), hotIgnition.direction)
}

console.log('-- 5. α 对寿命的净效应（量级，不再只给方向）--')
{
  const A = 7.2973525693e-3
  const sunHot = describeStarStructure(1, A * 1.1)
  assert('1 M☉：τ ∝ α² → 寿命 ×1.21', Math.abs(sunHot.lifetimeAlphaGyr / sun.lifetimeGyr - 1.21) < 1e-9, sunHot.lifetimeAlphaGyr.toFixed(2))
  assert('1 M☉：指数为 2', sunHot.lifetimeAlphaExponent === 2)

  const big = describeStarStructure(10, A * 1.1)
  assert('10 M☉：受爱丁顿极限保护，指数 0.5', big.lifetimeAlphaExponent === 0.5)
  assert('10 M☉：寿命 ×1.049', Math.abs(big.lifetimeAlphaGyr / big.lifetimeGyr - Math.sqrt(1.1)) < 1e-9, big.lifetimeAlphaGyr.toFixed(4))

  assert('最小点火质量 ×1.21', Math.abs(sunHot.minIgnitionMassSun / 0.08 - 1.21) < 1e-9, sunHot.minIgnitionMassSun.toFixed(4))

  const sens = sunHot.sensitivity.find((x) => x.id === 'main-sequence-lifetime')
  assert('寿命敏感度已升级为量级', sens.confidence === 'order-of-magnitude', sens.confidence)
  assert('敏感度里给出倍数', sens.magnitude.includes('1.210'), sens.magnitude)
  assert('新增点火质量条目', sunHot.sensitivity.some((x) => x.id === 'ignition-mass'))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
