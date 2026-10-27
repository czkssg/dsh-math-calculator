/**
 * 读者视角高频公式（第 4 批）测试。
 *
 * 目标不是"条数变多"，而是：**故事里真正会遇到的量**必须能算，
 * 且实时评估频率分布是否合理（高频不能太少，也不能什么都算高频）。
 */
import * as mod from '../lib/index.js'
import { FORMULAS, formulaFrequency, listFormulasByFrequency } from '../lib/formulas.js'
import { resolveSymbol } from '../lib/symbols.js'

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
const run = (args) => mod.runMathTool(args)
const call = (id, overrides) => run({ operation: 'formula', formula: id, overrides })

console.log('-- 1. 规模与频次分布 --')
{
  const total = FORMULAS.length
  assert('公式总数 ≥ 300', total >= 300, String(total))
  const high = listFormulasByFrequency('high').length
  const medium = listFormulasByFrequency('medium').length
  const low = listFormulasByFrequency('low').length
  /**
   * 频次分档的规模约束：**按比例判断，不写死绝对值**。
   *
   * 原来写死「高频 50–130 条」，于是公式库从 355 增到 395 就误报失败 ——
   * 断言的本意是「高频不应该失控到占满全库」，那是比例问题，不是绝对数问题。
   * 写死数字会让每次扩容都来改一次测试，属于虚假警报。
   */
  assert('高频占 20%—60%', high / total >= 0.2 && high / total <= 0.6,
    (high / total * 100).toFixed(0) + '%（' + high + '/' + total + '）')
  assert('中频 > 20%', medium / total > 0.2, (medium / total * 100).toFixed(0) + '%')
  assert('低频 ≤ 25%', low / total <= 0.25, (low / total * 100).toFixed(0) + '%')
  assert('三档之和 = 总数', high + medium + low === total, `${high}+${medium}+${low}=${total}`)
}

console.log('-- 2. 频次查询 --')
{
  const high = run({ operation: 'formulas', query: 'freq:high' })
  assert('freq:high 可用', String(high.result).includes('高频'), String(high.result).slice(0, 30))
  assert('高频里含材料/结构', String(high.result).includes('materials/structures') || JSON.stringify(high.value.categories).includes('materials'), JSON.stringify(high.value.categories).slice(0, 80))

  const low = run({ operation: 'formulas', query: 'freq:low' })
  assert('freq:low 可用', String(low.result).includes('低频'))

  const zh = run({ operation: 'formulas', query: '频率:高' })
  assert('中文别名可用', String(zh.result).includes('高频'))
}

console.log('-- 3. 新增公式必须算得对 --')
{
  const hoop = call('hoop_stress', { p: 1e6, r: 1, t: 0.01 })
  assert('环向应力 = 1e8 Pa', !hoop.error && String(hoop.result).includes('100000000'), hoop.error ? hoop.error.message : '')

  const hull = call('hull_speed', { L: 100 })
  assert('100 ft 船体航速 ≈ 13.4 kn', String(hull.result).includes('13.4'), String(hull.result).slice(0, 40))

  const range = call('projectile_range_vacuum', { v: 20, theta: Math.PI / 4 })
  assert('20 m/s、45° 射程 ≈ 40.8 m', String(range.result).includes('40.78'), String(range.result).slice(0, 40))

  const buckle = call('buckling_euler', { E: 2e11, I: 8e-6, L: 3 })
  /**
   * π²·2e11·8e-6/3² ≈ 1.7546e6 N
   *
   * 断言按**数值**比较，不再匹配 '1.7545e6' 这种科学计数法字面量：
   * 显示精度改成「小数点后 8 位」后，大数会写成 1754593.4 而不是 1.7545e6。
   * 两者都对，只是写法不同，所以比较数值更稳。
   */
  const buckleValue = Number(String(buckle.result).match(/(-?[\d.]+(?:e[+-]?\d+)?)\s*N/)?.[1] ?? NaN)
  assert('欧拉屈曲 ≈ 1.7546e6 N',
    Math.abs(buckleValue - 1754593.4) < 10, String(buckle.result).slice(0, 60))

  const gdd = call('growing_degree_days', { Tmax: 28, Tmin: 16, Tbase: 10 })
  assert('生长度日 = 12', String(gdd.result).includes('12'), String(gdd.result).slice(0, 30))

  const bsa = call('human_body_surface_area', { W: 70, H: 175 })
  assert('70kg/175cm 体表面积 ≈ 1.85', String(bsa.result).includes('1.848'), String(bsa.result).slice(0, 40))

  const dew = call('dew_point_magnus', { T: 25, RH: 60 })
  assert('25°C/60% 露点 ≈ 16.7', String(dew.result).includes('16.6'), String(dew.result).slice(0, 40))
}

console.log('-- 4. 每一条新公式都可解释 --')
{
  const storyIds = ['buckling_euler', 'wind_chill', 'echo_distance', 'hull_speed', 'growing_degree_days', 'widmark_bac']
  for (const id of storyIds) {
    const formula = FORMULAS.find((item) => item.id === id)
    assert(id + ' 存在', Boolean(formula))
    assert(id + ' 有说明', Boolean(formula && formula.desc.length > 8))
    assert(id + ' 参数都有描述', Boolean(formula && Object.values(formula.params).every((p) => p.desc && p.desc.length > 2)))
    assert(id + ' 有频次', Boolean(formula && ['high', 'medium', 'low'].includes(formulaFrequency(formula))), formula && formulaFrequency(formula))
  }
}

console.log('-- 5. 新公式要进符号索引 --')
{
  const sigma = resolveSymbol('sigma_b')
  assert('sigma_b 有含义', sigma.length > 0, String(sigma.length))
  const T = resolveSymbol('T', '气温')
  assert('T 能按"气温"消歧', T.length > 0, String(T.length))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
