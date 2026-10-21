/**
 * 模型出处（provenance）与常数传导测试。
 *
 * 两件事：
 *   1. 每一条经验系数都必须能回答"它凭什么可信、什么时候失效"；
 *   2. 热容 ∝ α² 必须真的改变季节振幅，且现实常数下保持不变。
 */
import { MODEL_CONSTANTS, provenanceSummary, describeProvenance } from '../lib/provenance.js'
import { computeIrradiance, computeSeason } from '../lib/climate.js'

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

console.log('-- 1. 登记表完整性 --')
{
  const ids = MODEL_CONSTANTS.map((x) => x.id)
  assert('无重复 id', new Set(ids).size === ids.length)
  assert(
    '所有来源都是三类之一',
    MODEL_CONSTANTS.every((x) => ['first-principles', 'calibrated', 'contingent'].includes(x.source)),
  )
  assert('每条都有适用域', MODEL_CONSTANTS.every((x) => typeof x.domain === 'string' && x.domain.length > 2))
  assert('每条都有说明', MODEL_CONSTANTS.every((x) => typeof x.note === 'string' && x.note.length > 5))
  assert('至少有 5 条地球标定', provenanceSummary().calibrated >= 5, String(provenanceSummary().calibrated))
  assert('至少有 1 条第一性原理', provenanceSummary().firstPrinciples >= 1)
  assert('至少有 2 条设定自由', provenanceSummary().contingent >= 2)
  assert('至少有 3 条随 α 缩放', MODEL_CONSTANTS.filter((x) => x.scalesWithAlpha).length >= 3)
}

console.log('-- 2. 说明文本可用 --')
{
  const lines = describeProvenance()
  const text = lines.join('\n')
  assert('含三类统计', text.includes('第一性原理') && text.includes('地球标定') && text.includes('设定自由'))
  assert('列出地球标定项', text.includes('granite-strength'), text.slice(0, 60))
  assert('列出设定自由项', text.includes('moon-albedo'))
  assert('每条标定项都有适用域', text.includes('适用域'))
}

console.log('-- 3. 热容 ∝ α²：季节振幅必须跟着变 --')
{
  const irradiance = computeIrradiance(3.828e26, 1.495978707e11, 0.0167, 0.306)
  const args = [23.44, 0.0167, irradiance, 33, 101325, true, 288.15]
  const base = computeSeason(...args)
  const withAlpha = computeSeason(...args, 7.2973525693e-3)
  const strongerAlpha = computeSeason(...args, 7.2973525693e-3 * 1.1)

  assert('缺省 alpha 与显式现实值一致', Math.abs(base.eccentricityTempAmplitude - withAlpha.eccentricityTempAmplitude) < 1e-15)
  const ratio = strongerAlpha.eccentricityTempAmplitude / base.eccentricityTempAmplitude
  assert('α×1.1 → 季节振幅缩小到 1/1.21', Math.abs(ratio - 1 / 1.21) < 1e-9, ratio.toFixed(4))
  assert('α 变大 → 季节更温和', strongerAlpha.eccentricityTempAmplitude < base.eccentricityTempAmplitude)
}

console.log('-- 4. 无海洋时阻尼基准不同，但仍随 α 缩放 --')
{
  const irradiance = computeIrradiance(3.828e26, 1.495978707e11, 0.0167, 0.306)
  const args = [23.44, 0.0167, irradiance, 33, 101325, false, 288.15]
  const dry = computeSeason(...args)
  const dryHot = computeSeason(...args, 7.2973525693e-3 * 1.1)
  assert('干燥星球季节振幅更大（阻尼弱）', dry.eccentricityTempAmplitude > computeSeason(23.44, 0.0167, irradiance, 33, 101325, true, 288.15).eccentricityTempAmplitude)
  assert('干燥星球同样随 α 缩放', Math.abs(dryHot.eccentricityTempAmplitude / dry.eccentricityTempAmplitude - 1 / 1.21) < 1e-9)
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
