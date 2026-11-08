/**
 * 工艺级工程公式 14 条 + 两处护栏修复（2026-11-08 外部反馈）。
 *
 * ## 来源
 *
 * 《极限工程》项目实测反馈两份：
 *   · math_execute_问题与建议.md（8 个问题 + 10 条建议）
 *   · 工程公式缺口与公式库扩展建议.md（工艺公式缺口）
 *
 * ## 核实后只做真问题
 *
 * 逐条实测后：多数已在此前版本修好，本批只做两处真缺陷 + 补工艺公式。
 *
 * ```
 *   真缺陷 2.3  precision 调低后结果被截成 0，却 ok=true + notice 空
 *   真缺陷 2.1  label 括号内是「输入条件」却被当成「结果单位」误报
 *   已修 2.4/2.6  value 已含 items 与 magnitudeWarnings（此前修过）
 *   已修 2.7  workspace 回显已列变量名（文档说的「变量 11 个」是旧版）
 * ```
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-proc-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const guards = await import(pathToFileURL(join(root, 'lib/guards.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) pass++
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果: (-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (a, b, tol) => Math.abs(a - b) <= Math.abs(tol ?? 1e-9);

console.log('-- 1. precision 静默算错（反馈 2.3，本轮修复）--')
{
  /**
   * 修复前的原话：「precision=20 时结果静默变成 0，ok 依然是 true，notice 为空」。
   *
   * 根因不是「没检查」，而是**检查只看了输出**：结果被截成 0 后只有 1 位，
   * 判据「整数位数 > precision」立刻放行 —— 越离谱的结果越容易逃过检查。
   */
  const r = await run({ operation: 'evaluate', expression: '(10^20+1)-(10^20)', precision: 20 })
  assert('结果确实被截成 0', String(r.result) === '0', String(r.result));
  assert('但 notice 非空（不再静默）', /precision/.test(String(r.notice)), JSON.stringify(String(r.notice).slice(0, 60)));
  assert('notice 点明了结果 0', /结果 0/.test(String(r.notice)), String(r.notice).slice(0, 80));

  /** 结果装不下时仍照旧提示（不能因为新增判据就把老的丢了）。 */
  const big = await run({ operation: 'evaluate', expression: '10^20+1', precision: 8 })
  assert('p=8 大数仍提示', /precision=8/.test(String(big.notice)), '');
  const longAdd = await run({ operation: 'evaluate', expression: '12345678901234567890+1', precision: 16 })
  assert('p=16 长整数仍提示', /precision=16/.test(String(longAdd.notice)), '');

  /** ★ 反向对照：不该提示的一个都不许提示（否则变成噪声）。 */
  const quiet = await Promise.all([
    run({ operation: 'evaluate', expression: '1+1', precision: 8 }),
    run({ operation: 'evaluate', expression: '1/7', precision: 8 }),
    run({ operation: 'evaluate', expression: '12345*2', precision: 8 }),
    run({ operation: 'evaluate', expression: '10^20+1' }),
    run({ operation: 'evaluate', expression: '10^19+1', precision: 20 }),
  ])
  assert('默认精度不提示', quiet[3].notice === undefined || !/precision/.test(String(quiet[3].notice)), String(quiet[3].notice));
  assert('小算式不提示', /precision/.test(String(quiet[0].notice || '')) === false, String(quiet[0].notice));
  assert('小数不提示', /precision/.test(String(quiet[1].notice || '')) === false, String(quiet[1].notice));
  assert('未超界的 10^19 不提示', /precision/.test(String(quiet[4].notice || '')) === false, String(quiet[4].notice));
}

console.log('-- 2. label 括号内输入条件误报（反馈 2.1，本轮修复）--')
{
  /**
   * 反馈原话：label「煤储量/年耗 可支撑年数(2万吨)」被警告「若按字面读成万则为 1.47e8」。
   * 而作者真实意思是「2 万吨煤能支撑多少年」—— 括号里是输入口径，不是结果单位。
   */
  assert('括号内输入条件不再误报',
    guards.checkLabelMagnitude('煤储量/年耗 可支撑年数(2万吨)', '14662.75659824') === '',
    guards.checkLabelMagnitude('煤储量/年耗 可支撑年数(2万吨)', '14662.75659824'));
  /** ★ 反向对照：真正的「结果单位是亿」仍须报警。 */
  const real = guards.checkLabelMagnitude('年发电量（亿）', '2.88e8')
  assert('结果单位「亿」仍报警', /label 含「亿」/.test(real), real.slice(0, 60));
  /** 旧版已修的两类误报，守它别回退。 */
  assert('1亿棵树日产台 不误报', guards.checkLabelMagnitude('1亿棵树日产台', '2500000000000') === '', '');
  assert('年耗H2O万吨 不误报（化学式下标）', guards.checkLabelMagnitude('年耗H2O万吨', '2133.41184') === '', '');
}

console.log('-- 3. 结构化输出（反馈 2.4/2.6，此前已修，守它别回退）--')
{
  /**
   * 反馈说「批量失败原因只在文本里，value 不含逐条状态」。
   * 实测**已经修好**：value.items 逐条带 ok/result/error。
   */
  const b = await run({ operation: 'evaluate', terse: true, expressions: ['2+2', '1/0', 'foo(3)'] })
  const v = b.value ?? {}
  assert('value 含 items 数组', Array.isArray(v.items), JSON.stringify(Object.keys(v)));
  assert('items 逐条带 ok', v.items.every((item) => typeof item.ok === 'boolean'), '');
  assert('失败条带 error 类型', v.items.filter((item) => !item.ok).every((item) => typeof item.error === 'string'), '');
  assert('非有限值被标为失败', v.items[1].error === 'non_finite', String(v.items[1].error));
  assert('未知函数被标为失败', v.items[2].error === 'unknown_symbol', String(v.items[2].error));
  assert('ok=false + partial=true', b.ok === false && b.partial === true, b.ok + '/' + b.partial);

  /** sanity 越界同理：value.magnitudeWarnings 应大于 0。 */
  const s = await run({ operation: 'evaluate', terse: true, expressions: [{ label: 'x', expr: '999999', sanity: { max: 1000, note: 'n' } }] })
  assert('sanity 越界计入 magnitudeWarnings', (s.value ?? {}).magnitudeWarnings > 0, JSON.stringify((s.value ?? {}).magnitudeWarnings));
}

console.log('-- 4. 工艺公式：能源链（反馈 P1/P2/I4）--')
{
  /**
   * 窑炉热平衡是反馈点名的「全库第一缺口」：
   * 有了它，「单窑耗煤 8kg」这类孤立经验数才能验算。
   */
  const q = await num('kiln_heat_balance', { ware_mass: 100, delta_T: 1080 });
  assert('100kg 坯升温 97MJ 坯体热，含损比后 1263.6MJ', close(q, 97.2 * 13, 1), String(q));
  /** ★ 关键：损比是第一杠杆 —— 减半后总热几乎减半。 */
  const low = await num('kiln_heat_balance', { ware_mass: 100, delta_T: 1080, shell_loss_ratio: 5 });
  assert('损比 12→5 总热降一半以上', (low / q) < 0.55, String(low / q));

  const t = await num('kiln_firing_time', { delta_T: 1080 });
  assert('1080K @200K/h = 5.4h', close(t, 5.4, 0.01), String(t));
  const slow = await num('kiln_firing_time', { delta_T: 1080, heating_rate: 100 });
  assert('升温率减半 → 时间翻倍', close(slow, 10.8, 0.02), String(slow));

  const w = await num('wall_heat_loss', { total_area: 64, delta_T: 25, r_value: 9.34 });
  assert('64㎡/R=9.34/25K → 171W', close(w, 64 * 25 / 9.34, 0.5), String(w));
  const w2 = await num('wall_heat_loss', { total_area: 64, delta_T: 25, r_value: 1 });
  assert('R 降到 1 → 热损涨 9 倍', close(w2 / w, 9.34, 0.1), String(w2 / w));
}

console.log('-- 5. 工艺公式：材料与传动链（P5/P8/I1/I6）--')
{
  const m = await num('metallurgy_yield', { ore_mass: 15, grade: 0.3, recovery: 0.9 });
  assert('15kg×0.3×0.9 = 4.05kg 铁', close(m, 4.05, 1e-9), String(m));
  const cu = await num('metallurgy_yield', { ore_mass: 5, grade: 0.57, recovery: 0.8 });
  assert('5kg 孔雀石 → 2.28kg 铜', close(cu, 2.28, 1e-9), String(cu));

  /**
  /**
   * ★ 渗碳的关键性质：温度是平方级杠杆、时间是线性。
   * 用比值守它 —— 绝对值错了可能只是 D₀ 取值不同，比值错说明形式写错。
   */
  const base = await num('case_depth', { temperature: 1173, hold_time: 10800 });
  assert('900℃/3h ≈ 0.42mm', close(base, 0.00042, 0.0001), String(base));
  const hotter = await num('case_depth', { temperature: 1223, hold_time: 10800 });
  const longer = await num('case_depth', { temperature: 1173, hold_time: 18000 });
  assert('温度 +50K 的增益大于时间 ×1.67', (hotter / base) > (longer / base), (hotter / base).toFixed(3) + ' vs ' + (longer / base).toFixed(3));
  assert('时间 ×1.67 → 层深 ×√1.67', close(longer / base, Math.sqrt(18000 / 10800), 0.001), String(longer / base));

  const g = await num('gear_geometry', { gear_module: 4, teeth: 30 });
  assert('m4 z30 → d=120mm', close(g, 120, 1e-9), String(g));
  const gs = await num('gear_bending_strength', { tangential_force: 294, face_width: 0.03, gear_module: 0.004 });
  assert('齿根应力约 7.7 MPa', close(gs, 7656250, 1000), String(gs));
  /** ★ 反向对照：模数减到 2.5 → 应力按 1/2.5 涨（不是 1/2.5²，因为韧性只在 b·m 一阶）。 */
  const g20 = await num('gear_bending_strength', { tangential_force: 294, face_width: 0.03, gear_module: 0.0025 });
  assert('模数减小 → 应力上升', g20 > gs, String(g20));

  const wt = await num('water_turbine_output', { flow: 0.01, head: 3, efficiency: 0.6 });
  assert('水轮 176W', close(wt, 176.5197, 1), String(wt));
  const wt2 = await num('water_turbine_output', { flow: 0.1, head: 6, efficiency: 0.6 });
  assert('流量×10 水头×2 → 功率×20', close(wt2 / wt, 20, 0.1), String(wt2 / wt));
}

console.log('-- 6. 工艺公式：自洽检查与时间精度（P9/I2）--')
{
  /**
   * 这条的用途不是算新数，而是**检查设定自不自洽**：
   * 625J、8W、12 分钟各自「看着合理」，拼起来才发现差数量级。
   */
  const sec = await num('gravity_storage_discharge', { mass: 25, height: 2.5, power: 8 });
  assert('25kg×2.5m 只能供 8W 共 76.6 秒', close(sec, 76.614453125, 0.5), String(sec));
  assert('远不到设定的 12 分钟（720 秒）', sec < 720 / 8, String(sec));
  /** 反推：要 12 分钟需多少配重。 */
  const need = 8 * 720 / (9.80665 * 2.5);
  assert('需约 235kg 配重（或加高 10 倍）', close(need, 234.9, 1), String(need));

  const drift = await num('pendulum_clock_drift', { length_change_ratio: 2.4e-4 });
  assert('钢摆冬夏温差 20℃ → 每天慢 10.4s', close(drift, -10.368, 0.1), String(drift));
  /** ★ 反向：周期与 √L 有关，所以摆长误差的影响被压掉一半。 */
  const half = await num('pendulum_clock_drift', { length_change_ratio: 1.2e-4 });
  assert('摆长变化减半 → 漂移减半（比值应为 0.5）', close(half / drift, 0.5, 1e-9), String(half / drift));
}

console.log('-- 7. 工艺公式：农业与化工（A2/A5/A7/A8）--')
{
  assert('GDD 积温 2000', (await num('gdd_accumulated', { excess_daily_temp: 10, days: 200 })) === 2000);
  /** ★ 积温线性于天数 —— 这是「无霜期长 10 天能多种什么」的判据。 */
  const more = await num('gdd_accumulated', { excess_daily_temp: 10, days: 210 });
  assert('多 10 天 = 多 100 度日', close(more - 2000, 100, 1e-9), String(more));

  const lea = await num('leaching_residue', { initial_concentration: 1, residual_ratio: 0.6, changes: 4 });
  assert('换水 4 次残留 13%', close(lea, 0.1296, 1e-9), String(lea));
  /** ★ 指数衰减：第 6 次只再降 3 个点，收益递减。 */
  const six = await num('leaching_residue', { initial_concentration: 1, residual_ratio: 0.6, changes: 6 });
  assert('换 6 次 4.7%', close(six, 0.046656, 1e-9), String(six));

  const ferm = await num('fermentation_time', { initial_sugar: 1, target_residual: 0.05, rate_constant: 0.07 });
  assert('降到 5% 需 42.8 天', close(ferm, 42.79617533648558, 0.01), String(ferm));
  /** ★ 关键：k 减半 → 时间翻倍（低温延长的定量答案）。 */
  const cold = await num('fermentation_time', { initial_sugar: 1, target_residual: 0.05, rate_constant: 0.035 });
  assert('k 减半 → 时间翻倍', close(cold / ferm, 2, 1e-9), String(cold / ferm));

  const sy = await num('syrup_concentration', { juice_volume: 40, initial_brix: 2.5, final_brix: 66 });
  assert('40L 熬到 Brix66 → 1.52L', close(sy, 1.5151515151, 0.01), String(sy));
  /** ★ 得率只由糖度比决定，与锅和火无关。 */
  const sy2 = await num('syrup_concentration', { juice_volume: 20, initial_brix: 2.5, final_brix: 66 });
  assert('原汁减半 → 成品减半（比例不变）', close(sy2 / sy, 0.5, 1e-9), String(sy2 / sy));
}

console.log('-- 8. 公式库完整性（新增 14 条不破坏既有）--')
{
  assert('公式总数 ≥ 513（499+14 工艺批，其后还有材料成品三条）', fm.FORMULAS.length >= 513, String(fm.FORMULAS.length));
  assert('索引与数组差 ≤ 4（仅历史重复）', fm.FORMULAS.length - fm.FORMULA_INDEX.size <= 4, String(fm.FORMULAS.length - fm.FORMULA_INDEX.size));
  /** 全部 14 条都在索引里（能被 formula 调）。 */
  const ids = ['kiln_heat_balance','kiln_firing_time','wall_heat_loss','metallurgy_yield','case_depth',
    'gear_bending_strength','gear_geometry','pendulum_clock_drift','gravity_storage_discharge',
    'water_turbine_output','gdd_accumulated','leaching_residue','fermentation_time','syrup_concentration']
  assert('14 条全部进入索引', ids.every((id) => fm.FORMULA_INDEX.has(id)), ids.filter((id) => !fm.FORMULA_INDEX.has(id)).join(','));
  /** 每条都必须能求出结果（不能有参数填不满的空壳）。 */
  const unfillable = []
  for (const id of ids) {
    const f = fm.FORMULA_INDEX.get(id)
    const args = {}
    for (const [k, v] of Object.entries(f.params)) if (v.value === null) args[k] = 1
    const r = await run({ operation: 'formula', formula: id, overrides: args })
    if (!r.ok) unfillable.push(id + ':' + (r.error && r.error.type))
  }
  assert('14 条全部可求值', unfillable.length === 0, unfillable.join(','));
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);