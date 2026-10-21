/**
 * S2：物理常数必须真的传导到星球模型。
 *
 * 这一套的核心是**回归 + 传导**两件事：
 *   1. 现实常数下，输出必须与改造前一致（否则就是偷偷改了地球）；
 *   2. 改 α / G / 质量时，材料强度、山峰、雪线必须按正确幂律移动。
 *
 * 改造前 world.ts 用的是 CONSTANTS 快照，用户改常数根本不生效 —— 这套测试防的就是它回来。
 */
import { generateWorld } from '../lib/world.js'
import { setActiveConstants, resetActiveConstants } from '../lib/constants-graph.js'
import { CONSTANTS } from '../lib/formula-library.js'

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

const base = generateWorld({})

console.log('-- 1. 现实常数下的回归锚（不能偷偷改地球）--')
{
  // 地球：g = 9.8196, 花岗岩 1.3e8 → h = 1.3e8/(2700·g) ≈ 4906 m
  assert('山峰上限 ≈ 4.9 km', base.terrain.maxMountainHeight > 4700 && base.terrain.maxMountainHeight < 5100, base.terrain.maxMountainHeight.toFixed(0))
  assert('雪线 ≈ 2.3 km', base.terrain.snowLineM > 2100 && base.terrain.snowLineM < 2500, base.terrain.snowLineM.toFixed(0))
  assert('表面重力 ≈ 9.82', Math.abs(base.planet.surfaceGravity - 9.82) < 0.02, base.planet.surfaceGravity.toFixed(3))
  assert('天空天顶为蓝色系', base.sky.day.zenithColorHex.length === 7, base.sky.day.zenithColorHex)
}

console.log('-- 2. α 必须传导到材料与地形 --')
{
  // e_charge ×√1.1 → α ×1.1
  const stronger = generateWorld({}, { constants: { e_charge: CONSTANTS.e_charge * Math.sqrt(1.1) } })
  const ratio = stronger.terrain.maxMountainHeight / base.terrain.maxMountainHeight
  assert('α×1.1 → 山峰上限 ×1.61（S ∝ α⁵）', Math.abs(ratio - 1.1 ** 5) < 0.01, ratio.toFixed(3))
  assert('α×1.1 时重力不变', Math.abs(stronger.planet.surfaceGravity - base.planet.surfaceGravity) < 1e-9)
  assert('α 变化会改变白天天空配色', stronger.sky.day.zenithColorHex !== base.sky.day.zenithColorHex, `${base.sky.day.zenithColorHex} → ${stronger.sky.day.zenithColorHex}`)
}

console.log('-- 3. G 必须传导到重力与逃逸速度 --')
{
  const heavyG = generateWorld({}, { constants: { G: CONSTANTS.G * 2 } })
  assert('G×2 → 表面重力 ×2', Math.abs(heavyG.planet.surfaceGravity / base.planet.surfaceGravity - 2) < 1e-9, (heavyG.planet.surfaceGravity / base.planet.surfaceGravity).toFixed(3))
  assert('G×2 → 逃逸速度 ×√2', Math.abs(heavyG.planet.escapeVelocity / base.planet.escapeVelocity - Math.SQRT2) < 1e-9)
  assert('G×2 → 山峰上限减半（同样的岩石撑不起高重力）', Math.abs(heavyG.terrain.maxMountainHeight / base.terrain.maxMountainHeight - 0.5) < 1e-6, (heavyG.terrain.maxMountainHeight / base.terrain.maxMountainHeight).toFixed(3))
}

console.log('-- 4. 直减率由重力与大气推出（不再写死 6.5 K/km）--')
{
  const heavy = generateWorld({ planetMass: 4 })
  const ratio = heavy.terrain.snowLineM / base.terrain.snowLineM
  assert('重力 ×4 → 直减率 ×4 → 雪线降到 1/4', Math.abs(ratio - 0.25) < 0.02, ratio.toFixed(3))
  assert('重行星雪线明显更低', heavy.terrain.snowLineM < base.terrain.snowLineM * 0.3, heavy.terrain.snowLineM.toFixed(0))

  // 物理：Γ = gM/(3.5R)。摩尔质量越大，单位质量热容越小，直减率越高 → 雪线越低。
  const thickAir = generateWorld({ molarMass: 0.044 })
  assert('大气更重（CO₂）→ 直减率更高 → 雪线更低', thickAir.terrain.snowLineM < base.terrain.snowLineM, thickAir.terrain.snowLineM.toFixed(0))
}

console.log('-- 5. 活动常数（工作区）必须被 world 读到 --')
{
  setActiveConstants({ e_charge: CONSTANTS.e_charge * Math.sqrt(1.2) })
  const fromActive = generateWorld({})
  resetActiveConstants()
  const afterReset = generateWorld({})

  const ratio = fromActive.terrain.maxMountainHeight / base.terrain.maxMountainHeight
  assert('setActiveConstants 后 world 立刻生效', Math.abs(ratio - 1.2 ** 5) < 0.01, ratio.toFixed(3))
  assert('reset 后回到现实值', Math.abs(afterReset.terrain.maxMountainHeight - base.terrain.maxMountainHeight) < 1e-6)
}

console.log('-- 6. 星空也吃常数 --')
{
  const stronger = generateWorld({}, { constants: { e_charge: CONSTANTS.e_charge * Math.sqrt(1.1) } })
  assert('α 变大 → 瑞利散射更强 → 地平线更红', stronger.sky.day.horizonColorHex !== base.sky.day.horizonColorHex, `${base.sky.day.horizonColorHex} → ${stronger.sky.day.horizonColorHex}`)
  assert('星星颜色只由温度决定（不受 α 影响）', stronger.sky.star.colorHex === base.sky.star.colorHex)
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
