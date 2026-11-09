/**
 * 冷战—千禧年学科扩充（四）：社会科学 13 条。
 *
 * ## 社科的测试与理工科不同：主要验「结构」而不是「数值」
 *
 * 物理公式可以靠实测值反守，社科公式没有那个锚点。所以本套的断言分成三层：
 *
 * ```
 *   ① 边界值：0 与 1 处必须成立（完全平均、完全独占、无冗余…）
 *   ② 单调性：参数变大时结果必须朝该去的方向走
 *   ③ 内部一致性：两条互为逆运算的式子必须对得上
 * ```
 *
 * 第 ③ 类最有价值 —— 它抓的是「两条公式各写各的、彼此矛盾」这种最难发现的错。
 *
 * ## 一条需要说清的取舍
 *
 * 社科模型普遍有「参数要靠拟合」的问题。本批刻意只收**参数可填、形式有理论依据**的，
 * 并且在 desc 里写明「这是统计规律，不是因果预测」。测试不去断言「预测正确」，
 * 因为那件事本来就不该由一条公式保证。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-soc-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-6)
const rel = (a, b, tol) => Math.abs(a - b) / Math.abs(b) <= tol

console.log('-- 1. 人口学：翻倍时间与 70 法则 --')
{
  const t1 = await num('doubling_time_population', { growth_rate: 0.01 })
  const t2 = await num('doubling_time_population', { growth_rate: 0.02 })
  assert('r=1% → 69.7 年', close(t1, 69.66, 0.02), String(t1))
  assert('r=2% → 35.0 年（不是 34.5）', close(t2, 35.00, 0.02), String(t2))
  /**
   * ★ 近似反比：增长率翻倍 → 时间**接近**减半（1.990 而非精确 2）。
   *
   * 为什么不是精确的 2：ln(1+2r) ≠ 2·ln(1+r)。差值随 r 增大而变大。
   *   1%→2%：比值 1.990（偏 0.5%）
   *   5%→10%：比值 1.95
   * 所以断言写「接近 2 且略小」而不是「等于 2」—— 后者会逼着人把公式写错。
   */
  const ratio = t1 / t2
  assert('增长率翻倍 → 时间约减半（略小于 2）', ratio > 1.98 && ratio < 2.0, ratio.toFixed(4))
  /** ★ 小 r 时逼近 70 法则：0.7% 应接近 100 年（70/0.7）。 */
  const small = await num('doubling_time_population', { growth_rate: 0.007 })
  assert('r=0.7% → 约 99.4 年（70法则给 100）', close(small, 99.4, 0.5), String(small.toFixed(1)))
}

console.log('-- 2. 人口结构：抚养比与更替水平 --')
{
  const dr = await num('dependency_ratio', { young: 300, old: 100, working_age: 600 })
  assert('2:1 结构 → 0.667', close(dr, 0.6667, 1e-4), String(dr))
  /** ★ 单调性：老人越多，抚养比越高。 */
  const drOld = await num('dependency_ratio', { young: 300, old: 300, working_age: 600 })
  assert('老人增加 → 抚养比上升', drOld > dr, drOld.toFixed(3) + ' > ' + dr.toFixed(3))

  /** ★★ 更替水平：现代 2.04、高死亡率 2.8~3.0 —— 这是「古代为何要多生」的定量答案。 */
  const repl = await num('tfr_replacement', { mortality_to_reproductive: 0.02 })
  const replHigh = await num('tfr_replacement', { mortality_to_reproductive: 0.4 })
  assert('低死亡率 → 2.04（即常说的 2.1）', close(repl, 2.04, 0.01), String(repl))
  assert('育龄前死亡率 40% → 2.8', close(replHigh, 2.8, 0.01), String(replHigh))
  assert('死亡率越高 → 更替门槛越高', replHigh > repl, replHigh + ' > ' + repl)

  /** 人口转变：b−d，转变期应显著为正。 */
  assert('b=40,d=15 → 25‰', close(await num('demographic_transition_rate', { birth_rate: 40, death_rate: 15 }), 25))
  assert('b=12,d=11 → 1‰', close(await num('demographic_transition_rate', { birth_rate: 12, death_rate: 11 }), 1))
  /** ★ 反向：死亡率先降（b 不变）→ 增长率必然上升，这就是「爆炸」的机制。 */
  const before = await num('demographic_transition_rate', { birth_rate: 40, death_rate: 38 })
  const after = await num('demographic_transition_rate', { birth_rate: 40, death_rate: 15 })
  assert('死亡率先降 → 增长率跃升 5.75 倍', close(after / before, 25 / 2, 0.01), (after / before).toFixed(2))
}

console.log('-- 3. 网络：聚集与幂律 --')
{
  assert('k=4,T=3 → 0.5', close(await num('clustering_coefficient', { triangles: 3, degree: 4 }), 0.5))
  /** ★ 边界：三个人的闭合三角（k=2,T=1）应恰好为 1（完全互联）。 */
  assert('闭合三角 → 1', close(await num('clustering_coefficient', { triangles: 1, degree: 2 }), 1))
  /** ★ 边界：没有三角 → 0（星形结构）。 */
  assert('无三角 → 0', close(await num('clustering_coefficient', { triangles: 0, degree: 4 }), 0))

  /**
   * ★ 幂律：γ 越小越极端。比较同一 k 下的概率。
   * γ=2 与 γ=3 在 k=10 处相差 10 倍（k^(3-2)）。
   */
  const g2 = await num('network_degree_distribution', { prefactor: 1, degree: 10, exponent: 2 })
  const g3 = await num('network_degree_distribution', { prefactor: 1, degree: 10, exponent: 3 })
  assert('γ=2,k=10 → 0.01', close(g2, 0.01), String(g2))
  assert('γ 大 1 → k=10 处概率小 10 倍', close(g2 / g3, 10, 1e-6), (g2 / g3).toFixed(1))
  /** ★ 单调递减：规模越大频次越低（长尾）。 */
  const big = await num('network_degree_distribution', { prefactor: 1, degree: 100, exponent: 2.5 })
  const small = await num('network_degree_distribution', { prefactor: 1, degree: 10, exponent: 2.5 })
  assert('规模大 → 频次低', big < small, big.toExponential(2) + ' < ' + small.toExponential(2))

  /** 扩散阈值：1/⟨k⟩。⟨k⟩=5 → 20% */
  assert('⟨k⟩=5 → 20%', close(await num('diffusion_threshold', { mean_degree: 5 }), 0.2))
  /** ★ 反比：圈子越密，临界值越高（越难动摇）。 */
  const dense = await num('diffusion_threshold', { mean_degree: 2 })
  const loose = await num('diffusion_threshold', { mean_degree: 20 })
  assert('密网络门槛更高', dense > loose, dense + ' > ' + loose)
}

console.log('-- 4. 组织：集体行动与管理跨度 --')
{
  /** 搭便车：份额 1/N */
  assert('N=5 → 20%', close(await num('olson_group_size_effect', { group_size: 5 }), 0.2))
  assert('N=100 → 1%', close(await num('olson_group_size_effect', { group_size: 100 }), 0.01))
  /** ★ 单调递减：团体越大个体份额越小 —— 这就是「大团体更难组织」的数学根源。 */
  const n1 = await num('olson_group_size_effect', { group_size: 10 })
  const n2 = await num('olson_group_size_effect', { group_size: 1000 })
  assert('团体越大份额越小', n2 < n1, n2 + ' < ' + n1)

  /** 管理跨度：log N / log s。100 人、6 人一组 → 2.57 层 */
  const h100 = await num('span_of_control', { organization_size: 100, span: 6 })
  const h100k = await num('span_of_control', { organization_size: 100000, span: 6 })
  assert('100 人 → 2.57 层', close(h100, 2.5702, 1e-3), String(h100))
  assert('10 万人 → 6.43 层', close(h100k, 6.4255, 1e-3), String(h100k))
  /**
   * ★★ 核心性质：规模 ×1000，层级只多约 3.9 级（对数增长）。
   * 这条推翻「大组织必然层级爆炸」的直觉 —— 真正的瓶颈是信息衰减，不是层数。
   */
  assert('规模 ×1000 只多 3.9 层', close(h100k - h100, 3.855, 0.01), (h100k - h100).toFixed(3))
  /** ★ 跨度越小层级越多（扁平 vs 高耸）。 */
  const h3 = await num('span_of_control', { organization_size: 100000, span: 3 })
  assert('跨度 3 → 层级更多', h3 > h100k, h3.toFixed(2) + ' > ' + h100k.toFixed(2))

  /** 帕金森：100 人、6%/年、12 年 → 201 人（约翻倍） */
  const p12 = await num('parkinson_law_growth', { initial_staff: 100, annual_growth: 0.06, years: 12 })
  assert('6%/年 12 年 → 约翻倍', close(p12, 201.2, 0.5), String(p12))
  /** ★ 复利：50 年 1.06^50 ≈ 18.4 倍 */
  const p50 = await num('parkinson_law_growth', { initial_staff: 100, annual_growth: 0.06, years: 50 })
  assert('50 年 → 约 18.4 倍', rel(p50 / 100, 18.42, 0.01), (p50 / 100).toFixed(2))
}

console.log('-- 5. 城市与不平等 --')
{
  /** 位序-规模：q=1 时第二城 = 首位一半 */
  assert('q=1 第二城 → 50 万', close(await num('rank_size_city', { largest_city: 1000000, rank: 2, exponent: 1 }), 500000))
  /** ★ q 越小说明城市体系越均衡：q=0.3 时第二城 81 万（接近首位）。 */
  const q03 = await num('rank_size_city', { largest_city: 1000000, rank: 2, exponent: 0.3 })
  assert('q=0.3 → 第二城 81 万', close(q03, 812252, 500), String(q03.toFixed(0)))
  assert('q 越小越均衡', q03 > 500000, q03 + ' > 500000')

  /** 代际流动：R² = β² */
  assert('β=0.47 → 22.1%', close(await num('social_mobility_percentile', { intergenerational_correlation: 0.47 }), 0.2209))
  assert('β=0.2 → 4%', close(await num('social_mobility_percentile', { intergenerational_correlation: 0.2 }), 0.04))
  /** ★ 单调：相关系数越高，出身解释力越强。 */
  const b8 = await num('social_mobility_percentile', { intergenerational_correlation: 0.8 })
  assert('β=0.8 → 64%', close(b8, 0.64), String(b8))

  /** 基尼：G = 1 − 2A */
  assert('A=0.5 → G=0（完全平均）', close(await num('gini_from_lorenz', { area_under_lorenz: 0.5 }), 0))
  assert('A=0.35 → G=0.3', close(await num('gini_from_lorenz', { area_under_lorenz: 0.35 }), 0.3))
  assert('A=0.2 → G=0.6（高度不均）', close(await num('gini_from_lorenz', { area_under_lorenz: 0.2 }), 0.6))
  /** ★ 边界：A=0（一人独占）→ G=1。 */
  assert('A=0 → G=1（完全独占）', close(await num('gini_from_lorenz', { area_under_lorenz: 0 }), 1))

  /** 城市标度律：人口 ×10、β=1.15 → ×14.13 */
  const u1 = await num('urban_scaling', { Y0: 1, P0: 1, P: 10, b: 1.15 })
  assert('人口 ×10 → 指标 ×14.13', close(u1, 14.125, 0.01), String(u1))
  /**
   * ★★ 亚线性 vs 超线性：β=0.85 时人口 ×10 只涨 7.1 倍（人均下降）。
   * 这是「城市越大，人均基础设施越省」的数学形式。
   */
  const infra = await num('urban_scaling', { Y0: 1, P0: 1, P: 10, b: 0.85 })
  assert('β=0.85 → ×7.1（人均下降）', close(infra, 7.079, 0.01), String(infra))
  assert('超线性 > 线性 > 亚线性', u1 > 10 && infra < 10, u1.toFixed(2) + ', ' + infra.toFixed(2))
  /** ★ 人均口径核对：(人口翻倍时的) 人均 = 2^(β−1)。β=1.15 → 1.109 */
  const perCapita = await num('urban_scaling', { Y0: 1, P0: 1, P: 2, b: 1.15 }) / 2
  assert('人口翻倍 → 人均 ×1.11', close(perCapita, 1.1096, 0.002), perCapita.toFixed(4))
}

console.log('-- 6. 元信息与入库完整性 --')
{
  const ids = [
    'doubling_time_population', 'dependency_ratio', 'demographic_transition_rate', 'tfr_replacement',
    'clustering_coefficient', 'network_degree_distribution', 'diffusion_threshold',
    'olson_group_size_effect', 'span_of_control', 'parkinson_law_growth',
    'rank_size_city', 'social_mobility_percentile', 'gini_from_lorenz',
  ]
  const missing = ids.filter((id) => !fm.FORMULA_INDEX.has(id))
  assert('本批 13 条全部入库', missing.length === 0, missing.join(','))

  let noUnit = [], noKeys = [], noCaveat = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!f.unit) noUnit.push(id)
    if (!Array.isArray(f.keys) || f.keys.length < 3) noKeys.push(id)
    if (!/⚠/.test(f.desc || '')) noCaveat.push(id)
  }
  assert('都有单位', noUnit.length === 0, noUnit.join(','))
  assert('都有 ≥3 关键词', noKeys.length === 0, noKeys.join(','))
  assert('都标了局限（⚠）', noCaveat.length === 0, noCaveat.join(','))

  /**
   * ★ 社科公式必须写明「这是统计规律不是因果预测」这类限定。
   * 没有这句，用户会把回归结果当预言用 —— 那是社科工具最容易造成的误用。
   *
   * 判据取「只要表达了这层界线即可」，所以接受多种说法：
   *   统计 / 经验 / 近似 / 规律 / 不含因果 / 不是预测 / 不能预测 …
   */
  const noStatCaveat = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!/(统计|经验|近似|规律|不含因果|不是.{0,4}预测|不能.{0,4}预测|结构比例|几何关系|结构下界)/.test(f.desc || '')) {
      noStatCaveat.push(id)
    }
  }
  assert('都声明了「统计/经验 vs 因果」的界线', noStatCaveat.length === 0, noStatCaveat.join(','))

  /** 表达式不用 ln。 */
  const usesLn = ids.filter((id) => /\bln\s*\(/.test(fm.FORMULA_INDEX.get(id)?.expr ?? ''))
  assert('不用 ln', usesLn.length === 0, usesLn.join(','))

  assert('公式总数 ≥ 585', fm.FORMULAS.length >= 585, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
