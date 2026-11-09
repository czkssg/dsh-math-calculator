/**
 * 冷战—千禧年学科扩充（一、二）：控制论/信息论/信号处理 + 运筹学/系统工程/博弈。
 *
 * ## 为什么这两批要合在一个测试里
 *
 * 它们共用同一套判据，而且**共用同样的三个失效方式**：
 *
 * ```
 *   ① 系数记错（4/(ζω) 的 4 写成 3；2^η−1 当成 η）
 *   ② 标度律写反（把 √L 写成 L、把 R^n 写成 nR）
 *   ③ 边界没处理（ρ≥1 时排队论无意义；ζ≥1 时超调无定义）
 * ```
 *
 * 每一条断言都是对着这三类错误写的，不是「跑一遍看看等于几」。
 *
 * ## 最值得守的一条：ρ/(1−ρ) 的悬崖
 *
 * 排队论整门课的价值，一半在「ρ 从 0.9 到 0.95 只多 5% 负载，
 * 等待时间却翻一倍」这件事上。它推翻了「人多一倍就慢一倍」的直觉。
 * 所以断言里直接验证放大倍数，而不是只验单个数值。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-coldwar-'))
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
  const m = String(r.result).match(/结果:\s*(-?[0-9.eE+]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-9)

console.log('-- 1. 控制论：反馈把残差压多少 --')
{
  /** 手算：0.1/(1+9)=0.01；0.1/(1+0)=0.1（无反馈不减） */
  const k9 = await num('open_loop_error', { disturbance: 0.1, loop_gain: 9 })
  const k0 = await num('open_loop_error', { disturbance: 0.1, loop_gain: 0 })
  assert('增益 9 → 残差压到 1/10', close(k9, 0.01), String(k9))
  assert('增益 0 → 残差原样', close(k0, 0.1), String(k0))
  /** ★ 核心：残差 ∝ 1/(1+K)，所以增益翻倍残差减半（不是线性减）。 */
  const k1 = await num('open_loop_error', { disturbance: 0.1, loop_gain: 1 })
  const k3 = await num('open_loop_error', { disturbance: 0.1, loop_gain: 3 })
  assert('增益 1 → 0.05', close(k1, 0.05), String(k1))
  assert('增益 3 → 0.025', close(k3, 0.025), String(k3))
}

console.log('-- 2. 稳定性上限：延迟是硬约束 --')
{
  /** 手算：1/(0.5*2)=1；1/(0.05*2)=10 */
  const slow = await num('loop_stability_limit', { delay: 0.5, bandwidth: 2 })
  const fast = await num('loop_stability_limit', { delay: 0.05, bandwidth: 2 })
  assert('τ=0.5 → K_max=1', close(slow, 1), String(slow))
  assert('τ=0.05 → K_max=10', close(fast, 10), String(fast))
  /**
   * ★ 反向对照：延迟减 10 倍 → 增益上限涨 10 倍。
   * 若把式子写成 1/(τ+ω) 或 1/(τ·ω²)，这个比例关系会立刻破掉。
   */
  assert('延迟 ÷10 → 增益上限 ×10', close(fast / slow, 10), String(fast / slow))
}

console.log('-- 3. 二阶指标：ζ 的两端代价 --')
{
  /** 手算：4/(0.7*0.5)=11.4286 */
  const ts = await num('second_order_settling', { damping_ratio: 0.7, natural_freq: 0.5 })
  assert('建立时间 11.43 s', close(ts, 11.4286, 1e-3), String(ts))

  /** 超调：exp(-πζ/√(1-ζ²))，ζ=0.7 → 4.60%，ζ=0.5 → 16.3%，ζ=0.3 → 37.2% */
  const o7 = await num('overshoot_from_damping', { damping_ratio: 0.7 })
  const o5 = await num('overshoot_from_damping', { damping_ratio: 0.5 })
  const o3 = await num('overshoot_from_damping', { damping_ratio: 0.3 })
  assert('ζ=0.7 → 4.60%', close(o7, 0.045988, 1e-5), String(o7))
  assert('ζ=0.5 → 16.3%', close(o5, 0.163034, 1e-5), String(o5))
  assert('ζ=0.3 → 37.2%', close(o3, 0.372326, 1e-5), String(o3))

  /**
   * ★ 两条指标反向：ζ 越小 → 超调↑但建立时间↓（更快但更冲）。
   * 这是控制设计里最根本的取舍，断言它比断言数值更能抓住「式子写反」。
   */
  /**
   * ★ 两条指标的关系比「反向」更微妙，这里必须写清楚：
   *
   *   超调       ζ 越小 → 越大（ζ=0.3 时 37%）
   *   建立时间   ζ 越小 → **越长**（4/(ζω_n)，ζ=0.3 时 26.7s，ζ=0.9 时 8.9s）
   *
   * 所以「欠阻尼 = 又快又冲」是**错的**。欠阻尼是「又冲又慢」：
   * 因为它要振荡好几次才衰减进误差带。
   *
   * 这是我第一版断言写反的地方（写成「ζ 小 → 建立快」），
   * 而它恰好是本项目一直在防的那类错：式子看着对、方向记反了。
   */
  const ts3 = await num('second_order_settling', { damping_ratio: 0.3, natural_freq: 0.5 })
  const ts9 = await num('second_order_settling', { damping_ratio: 0.9, natural_freq: 0.5 })
  assert('ζ 小 → 超调大', o3 > o5 && o5 > o7, o3 + ' > ' + o5 + ' > ' + o7)
  assert('ζ 小 → 建立更慢（振荡衰减慢）', ts3 > ts9, ts3 + ' > ' + ts9)
  /** ζ=1（临界阻尼）反而最慢？不是 —— 4/(1·0.5)=8，比 ζ=0.9 的 8.9 还快，但已无超调。 */
  const ts1 = await num('second_order_settling', { damping_ratio: 1, natural_freq: 0.5 })
  assert('ζ=1 建立 8s（无超调且不慢）', close(ts1, 8), String(ts1))
}

console.log('-- 4. 信道容量：线性 vs 对数 --')
{
  /** 手算：3000·log2(1001)=29901.7；3000·log2(11)=10378.3 */
  const snr1000 = await num('channel_capacity', { bandwidth: 3000, signal_to_noise: 1000 })
  const snr10 = await num('channel_capacity', { bandwidth: 3000, signal_to_noise: 10 })
  assert('30dB → 29.9 kbit/s', close(snr1000, 29901.7, 0.5), String(snr1000))
  assert('10dB → 10.38 kbit/s', close(snr10, 10378.3, 0.5), String(snr10))

  /** ★ 带宽线性：B 翻倍容量翻倍（这条守「带宽在分子外」）。 */
  const bw2 = await num('channel_capacity', { bandwidth: 6000, signal_to_noise: 1000 })
  assert('带宽翻倍 → 容量翻倍', close(bw2 / snr1000, 2, 1e-6), String(bw2 / snr1000))

  /** ★ 信噪比对数：S/N 翻倍只多 1 个 log2 项，远不到翻倍。 */
  const snr2000 = await num('channel_capacity', { bandwidth: 3000, signal_to_noise: 2000 })
  assert('S/N 翻倍 → 容量增幅远小于 2 倍', snr2000 / snr1000 < 1.15, String(snr2000 / snr1000))
  assert('S/N 翻倍确实有增长', snr2000 > snr1000, String(snr2000))
}

console.log('-- 5. 采样与量化 --')
{
  const ny = await num('nyquist_rate', { highest_frequency: 4000 })
  assert('4kHz → 8kHz 采样', close(ny, 8000), String(ny))

  /** 量化：6.02n+1.76。16 位 98.08、8 位 49.92、24 位 146.24 */
  const q8 = await num('quantization_snr', { bits: 8 })
  const q16 = await num('quantization_snr', { bits: 16 })
  const q24 = await num('quantization_snr', { bits: 24 })
  assert('8 位 → 49.92 dB', close(q8, 49.92, 1e-6), String(q8))
  assert('16 位 → 98.08 dB', close(q16, 98.08, 1e-6), String(q16))
  assert('24 位 → 146.24 dB', close(q24, 146.24, 1e-6), String(q24))
  /** ★ 每加一位固定 +6.02dB —— 这是本式唯一的用法，必须守。 */
  assert('每加一位 +6.02dB', close(q16 - q8, 8 * 6.02, 1e-6), String(q16 - q8))
}

console.log('-- 6. 信息量与冗余 --')
{
  /** log2(26)=4.7004；log2(64)=6 */
  const a26 = await num('shannon_hartley_bits', { states: 26 })
  const a64 = await num('shannon_hartley_bits', { states: 64 })
  assert('26 状态 → 4.7004 位', close(a26, 4.70044, 1e-4), String(a26))
  assert('64 状态 → 6 位', close(a64, 6, 1e-6), String(a64))

  const red = await num('redundancy_ratio', { entropy: 2.35, max_entropy: 4.7 })
  assert('熵减半 → 冗余 0.5', close(red, 0.5), String(red))
  /** ★ 边界：熵等于最大熵 → 无冗余；熵为 0 → 全冗余。 */
  const none = await num('redundancy_ratio', { entropy: 4.7, max_entropy: 4.7 })
  const full = await num('redundancy_ratio', { entropy: 0, max_entropy: 4.7 })
  assert('等概率 → 冗余 0', close(none, 0), String(none))
  assert('完全确定 → 冗余 1', close(full, 1), String(full))
}

console.log('-- 7. 香农极限与 dB 换算 --')
{
  /** 2^η−1：η=1→1、2→3、4→15、8→255 */
  for (const [eta, exp] of [[1, 1], [2, 3], [4, 15], [8, 255]]) {
    const v = await num('shannon_limit_min_snr', { spectral_efficiency: eta })
    assert(`η=${eta} → S/N=${exp}`, close(v, exp, 1e-6), String(v))
  }
  /**
   * ★ 最反直觉的一条：η<1 时 S/N 可以小于 1（信号弱于噪声仍可传）。
   * η=0.1 → 2^0.1−1 = 0.0718
   */
  const low = await num('shannon_limit_min_snr', { spectral_efficiency: 0.1 })
  assert('η=0.1 → S/N<1（弱信号可传）', low < 1 && close(low, 0.0717735, 1e-6), String(low))

  /** dB：1000 倍→30dB；2 倍→3.01dB；0.5 倍→−3.01dB */
  assert('1000 倍 → 30dB', close(await num('signal_to_noise_db', { signal_power: 1000, noise_power: 1 }), 30, 1e-9))
  assert('2 倍 → 3.01dB', close(await num('signal_to_noise_db', { signal_power: 2, noise_power: 1 }), 3.0103, 1e-4))
  /** ★ 反向对照：0.5 倍应为负 dB（信号弱于噪声），不是正数。 */
  const half = await num('signal_to_noise_db', { signal_power: 0.5, noise_power: 1 })
  assert('0.5 倍 → −3.01dB（负值）', half < 0 && close(half, -3.0103, 1e-4), String(half))
}

console.log('-- 8. 传播损耗与菲涅尔区 --')
{
  /** 20log10(4π·1000/1)=81.98；距离×10 → +20dB */
  const d1 = await num('path_loss_freespace', { distance: 1000, wavelength: 1 })
  const d10 = await num('path_loss_freespace', { distance: 10000, wavelength: 1 })
  assert('1km@1m → 81.98 dB', close(d1, 81.98, 0.01), String(d1))
  assert('距离×10 → +20dB', close(d10 - d1, 20, 1e-6), String(d10 - d1))
  /** 频率×10（波长÷10）同样 +20dB。 */
  const w01 = await num('path_loss_freespace', { distance: 1000, wavelength: 0.1 })
  assert('波长÷10 → +20dB', close(w01 - d1, 20, 1e-6), String(w01 - d1))

  /** 菲涅尔：λ=1、d=10km 中点 → 50m；λ=0.1 → 15.81m */
  const f1 = await num('fresnel_zone_radius', { wavelength: 1, distance1: 5000, distance2: 5000 })
  const f01 = await num('fresnel_zone_radius', { wavelength: 0.1, distance1: 5000, distance2: 5000 })
  assert('λ=1 → 50 m', close(f1, 50, 1e-6), String(f1))
  assert('λ=0.1 → 15.81 m', close(f01, 15.8114, 1e-3), String(f01))
  /** ★ r ∝ √λ：波长 ÷10 → 半径 ÷√10 ≈ 3.16，不是 ÷10。 */
  assert('r ∝ √λ（不是 ∝ λ）', close(f1 / f01, Math.sqrt(10), 1e-6), String(f1 / f01))
}

console.log('-- 9. 排队论：ρ/(1−ρ) 的悬崖 --')
{
  assert('Little 定律 λ=3,W=4 → L=12', close(await num('little_law', { arrival_rate: 3, time_in_system: 4 }), 12))
  assert('ρ=3.8/4=0.95', close(await num('queue_utilization', { arrival_rate: 3.8, service_capacity: 4 }), 0.95))
  assert('M/M/1 ρ=0.9 → 等 9 倍服务时间', close(await num('mm1_wait_time', { service_time: 1, utilization: 0.9 }), 9))

  /**
   * ★★ 本套最重要的一条：ρ 从 0.9 到 0.95，
   * **等待时间翻倍（9→19）而负载只多 5.6%**。
   * 这条推翻了「人多一倍就慢一倍」的直觉，也是整门排队论的价值所在。
   */
  const w9 = await num('mm1_wait_time', { service_time: 1, utilization: 0.9 })
  const w95 = await num('mm1_wait_time', { service_time: 1, utilization: 0.95 })
  const loadRatio = 0.95 / 0.9
  const waitRatio = w95 / w9
  assert('负载 +5.6%，等待 ×2.1', waitRatio > 2 && loadRatio < 1.06,
    '等待×' + waitRatio.toFixed(2) + '，负载×' + loadRatio.toFixed(3))
  /** 反方向：ρ 降到 0.5 时等待只有 1 倍服务时间。 */
  const w5 = await num('mm1_wait_time', { service_time: 1, utilization: 0.5 })
  assert('ρ=0.5 → 等 1 倍', close(w5, 1), String(w5))
}

console.log('-- 10. 库存：平方根法则 --')
{
  assert('EOQ D=1000 → 100', close(await num('eoq', { annual_demand: 1000, order_cost: 10, holding_cost: 2 }), 100))
  /**
   * ★ 需求 ×4 → 批量只 ×2（平方根）。这条守住「不是线性」。
   */
  const q1 = await num('eoq', { annual_demand: 1000, order_cost: 10, holding_cost: 2 })
  const q4 = await num('eoq', { annual_demand: 4000, order_cost: 10, holding_cost: 2 })
  assert('需求 ×4 → 批量 ×2', close(q4 / q1, 2, 1e-6), String(q4 / q1))

  /** 安全库存：提前期 ×4 → 只 ×2（同样平方根）。 */
  const s4 = await num('safety_stock', { service_factor: 1.65, demand_std: 20, lead_time: 4 })
  const s16 = await num('safety_stock', { service_factor: 1.65, demand_std: 20, lead_time: 16 })
  assert('提前期 ×4 → 安全库存 ×2', close(s16 / s4, 2, 1e-6), String(s16 / s4))
  assert('σ=20,L=4,95% → 66', close(s4, 66), String(s4))
}

console.log('-- 11. 可靠性：串联 vs 并联 --')
{
  /** 0.95^6 = 0.7351；0.99^100 = 0.3660 */
  assert('串联 0.95^6 → 0.735', close(await num('reliability_series', { component_reliability: 0.95, stages: 6 }), 0.735092, 1e-6))
  assert('串联 0.99^100 → 0.366', close(await num('reliability_series', { component_reliability: 0.99, stages: 100 }), 0.366032, 1e-5))

  /** 并联：0.9 单件 → 2 份 0.99、3 份 0.999 */
  assert('并联 0.9×2 → 0.99', close(await num('reliability_parallel', { component_reliability: 0.9, copies: 2 }), 0.99))
  assert('并联 0.9×3 → 0.999', close(await num('reliability_parallel', { component_reliability: 0.9, copies: 3 }), 0.999))

  /**
   * ★ 反向对照：串联随环节数**单调下降**，并联**单调上升**。
   * 若把两个式子写反（或都写成 nR），这两条同时红。
   */
  const s3 = await num('reliability_series', { component_reliability: 0.9, stages: 3 })
  const s10 = await num('reliability_series', { component_reliability: 0.9, stages: 10 })
  const p3 = await num('reliability_parallel', { component_reliability: 0.9, copies: 3 })
  const p10 = await num('reliability_parallel', { component_reliability: 0.9, copies: 10 })
  assert('串联：环节越多越差', s10 < s3, s10 + ' < ' + s3)
  assert('并联：份数越多越好', p10 > p3, p10 + ' > ' + p3)
}

console.log('-- 12. 可用度：修得快 = 不容易坏 --')
{
  assert('MTBF=200/MTTR=20 → 0.909', close(await num('mtbf_availability', { mtbf: 200, mttr: 20 }), 0.909091, 1e-6))
  /**
   * ★ 核心等价性：MTTR 减半 与 MTBF 翻倍 效果相同。
   * 手算：200/(200+10)=0.95238；400/(400+20)=0.95238 —— 完全相等。
   */
  const halfRepair = await num('mtbf_availability', { mtbf: 200, mttr: 10 })
  const doubleMtbf = await num('mtbf_availability', { mtbf: 400, mttr: 20 })
  assert('MTTR 减半 ≡ MTBF 翻倍', close(halfRepair, doubleMtbf, 1e-9), halfRepair + ' vs ' + doubleMtbf)

  assert('备件期望：20×2000/500=80', close(await num('spares_required', { usage_rate: 20, time_horizon: 2000, mtbf: 500 }), 80))
}

console.log('-- 13. 决策：期望值与保本概率互为逆 --')
{
  assert('EV: p=.5,G=100,L=40 → 30', close(await num('expected_value_decision', { probability: 0.5, gain: 100, loss: 40 }), 30))
  assert('EV: p=.2,G=100,L=40 → −12', close(await num('expected_value_decision', { probability: 0.2, gain: 100, loss: 40 }), -12))

  /**
   * ★★ 内部一致性：把 breakeven_probability 算出的 p* 代回 EV，必须恰好为 0。
   * 这是两条式子「互为逆运算」的证明，比各验一个数更严。
   */
  const pStar = await num('breakeven_probability', { gain: 100, loss: 40 })
  assert('p* = 40/140 = 0.2857', close(pStar, 0.285714, 1e-6), String(pStar))
  const evAtPStar = await num('expected_value_decision', { probability: pStar, gain: 100, loss: 40 })
  /**
   * 容差取 1e-6 而不是 1e-9：p* 被 displayPrecision 截到 8 位小数，
   * 再乘回 gain=100 会放大成 1e-6 量级 —— 这是显示精度的残差，不是逻辑错。
   * （要更严就传 displayPrecision，但那测的是位数不是关系。）
   */
  assert('把 p* 代回 EV → 0', close(evAtPStar, 0, 1e-6), String(evAtPStar))
  /** 且 p* 是最小值：略低于它 EV 转负。 */
  const below = await num('expected_value_decision', { probability: pStar * 0.99, gain: 100, loss: 40 })
  assert('p 略低于 p* → EV 为负', below < 0, String(below))
}

console.log('-- 14. 贝叶斯：假阳性压倒真阳性 --')
{
  /**
   * ★★ 本套第二重要的一条：1% 发生率 + 90%/90% 检测 → 阳性后只有 8.33%。
   * 这个数字违反几乎所有直觉（「准确率九成」听起来该是九成把握）。
   */
  const low = await num('bayes_posterior', { prior: 0.01, sensitivity: 0.9, specificity: 0.9 })
  assert('发病率 1% → 阳性后仅 8.33%', close(low, 0.0833333, 1e-6), String(low))

  const mid = await num('bayes_posterior', { prior: 0.3, sensitivity: 0.9, specificity: 0.9 })
  assert('发病率 30% → 79.4%', close(mid, 0.794118, 1e-5), String(mid))

  /** ★ 基础率越低，后验越接近「假阳性比例」——单调性必须成立。 */
  const mid2 = await num('bayes_posterior', { prior: 0.1, sensitivity: 0.9, specificity: 0.9 })
  assert('先验越高 → 后验越高', low < mid2 && mid2 < mid, low + ' < ' + mid2 + ' < ' + mid)

  /** ★ 基础率忽视的高估倍数应与上述后验互为倒数。 */
  const over = await num('base_rate_neglect_error', { prior: 0.01, sensitivity: 0.9, specificity: 0.9 })
  assert('高估倍数 = 1/后验', close(over, 1 / low, 1e-6), over + ' vs ' + 1 / low)
  assert('高估 12 倍', close(over, 12, 1e-6), String(over))

  /** 证据强度：Se=Sp=0.9 → log10(0.9/0.1)=0.954 */
  assert('证据强度 0.954 分', close(await num('bayes_evidence_strength', { sensitivity: 0.9, specificity: 0.9 }), 0.954243, 1e-5))
  /** ★ 弱证据：Se=0.8、Sp=0.5 → log10(0.8/0.5)=0.204（约 1.6 倍），几乎无说服力。 */
  const weak = await num('bayes_evidence_strength', { sensitivity: 0.8, specificity: 0.5 })
  assert('弱证据仅 0.204 分', close(weak, 0.204120, 1e-5), String(weak))
}

console.log('-- 15. 议价与赢家诅咒 --')
{
  /** 纳什：surplus=100、双方退路 20 → 各 50 */
  assert('对称议价 → 各得 50', close(await num('nash_bargaining_split', { outside_option: 20, outside_a: 20, outside_b: 20, surplus: 100 }), 50))
  /** 甲方退路 60 → 得 60+(100-80)/2=70 */
  assert('甲方退路 60 → 得 70', close(await num('nash_bargaining_split', { outside_option: 60, outside_a: 60, outside_b: 20, surplus: 100 }), 70))
  /**
   * ★ 核心性质：分的是「剩余」，所以退路提高 40 → 多得 20（一半）。
   * 这条说明「提高退路」的收益被对半分走 —— 反直觉但正是纳什解的定义。
   */
  const a20 = await num('nash_bargaining_split', { outside_option: 20, outside_a: 20, outside_b: 20, surplus: 100 })
  const a60 = await num('nash_bargaining_split', { outside_option: 60, outside_a: 60, outside_b: 20, surplus: 100 })
  assert('退路 +40 → 多得 20（对半分）', close(a60 - a20, 20), String(a60 - a20))

  assert('赢家诅咒 σ=100,n=5 → 120', close(await num('winner_curse_markup', { estimation_error: 100, bidders: 5 }), 120))
  /** ★ n 越大，高估系数越接近 σ（(n+1)/n → 1），从 2σ 降到 ~1σ。 */
  const n1 = await num('winner_curse_markup', { estimation_error: 100, bidders: 1 })
  const n10 = await num('winner_curse_markup', { estimation_error: 100, bidders: 10 })
  assert('n=1 → 2σ', close(n1, 200), String(n1))
  assert('n=10 → 1.1σ', close(n10, 110), String(n10))
  assert('人数越多高估越接近 σ', n10 < n1 && n10 > 100, n10 + ' 在 (100,200)')
}

console.log('-- 16. 元信息与入库完整性 --')
{
  const ids = [
    'open_loop_error', 'loop_stability_limit', 'second_order_settling', 'overshoot_from_damping',
    'channel_capacity', 'nyquist_rate', 'quantization_snr', 'shannon_hartley_bits',
    'redundancy_ratio', 'shannon_limit_min_snr', 'rc_cutoff_frequency', 'signal_to_noise_db',
    'path_loss_freespace', 'fresnel_zone_radius',
    'little_law', 'queue_utilization', 'mm1_wait_time', 'mmc_queue_length',
    'eoq', 'safety_stock', 'reliability_series', 'reliability_parallel',
    'mtbf_availability', 'spares_required',
    'expected_value_decision', 'breakeven_probability', 'winner_curse_markup',
    'nash_bargaining_split', 'bayes_posterior', 'bayes_evidence_strength', 'base_rate_neglect_error',
  ]
  let missing = []
  for (const id of ids) if (!fm.FORMULA_INDEX.has(id)) missing.push(id)
  assert('本批 31 条全部入库', missing.length === 0, missing.join(','))

  /** 每条都要有单位、关键词与局限说明（项目硬要求）。 */
  let noUnit = [], noKeys = [], noCaveat = [], shortDesc = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    if (!f) continue
    if (!f.unit) noUnit.push(id)
    if (!Array.isArray(f.keys) || f.keys.length < 3) noKeys.push(id)
    if (!/⚠/.test(f.desc || '')) noCaveat.push(id)
    if ((f.desc || '').length < 100) shortDesc.push(id)
  }
  assert('都有单位', noUnit.length === 0, noUnit.join(','))
  assert('都有 ≥3 个关键词', noKeys.length === 0, noKeys.join(','))
  assert('都标了局限（⚠）', noCaveat.length === 0, noCaveat.join(','))
  assert('desc 都不短于 100 字', shortDesc.length === 0, shortDesc.join(','))

  /** ★ 反向对照：doccheck 守的「不许用 ln」在这批里也不能破。 */
  const usesLn = ids.filter((id) => /\bln\s*\(/.test(fm.FORMULA_INDEX.get(id)?.expr ?? ''))
  assert('表达式不用 ln（本库无此函数）', usesLn.length === 0, usesLn.join(','))

  assert('公式总数 ≥ 559', fm.FORMULAS.length >= 559, String(fm.FORMULAS.length))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
