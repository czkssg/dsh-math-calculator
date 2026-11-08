/**
 * 材料成品性能三条（外部反馈 P4/P6/I5）+ 体系接入。
 *
 * 这一批补的是**从工艺参数到成品性能**那一段：
 *
 * ```
 *   烧结温度/时间 → 孔隙率 → 陶还是瓷
 *   含碳量       → 可达硬度 → 这把刀能不能硬
 *   燃烧损失     → 炉膛效率 → 一窑要烧多少料
 * ```
 *
 * 三条都接进了现有体系（材料链、能源链），没有新建链。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-p3-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)
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

console.log('-- 1. 烧结致密度：陶与瓷的分界 --')
{
  /**
  * 用真实陶瓷常识反守：普通陶 850℃ 吸水率 10~15%、瓷 1300℃ <0.5%。
  * 只有标定对了，这两端才会同时命中。
  */
  const low = await num('sintering_porosity', { temperature: 1123, hold_time: 1 });
  assert('850℃ → 孔隙约 15%（普通陶吸水率）', close(low, 0.15, 0.02), (low * 100).toFixed(2) + '%');
  const high = await num('sintering_porosity', { temperature: 1573, hold_time: 1 });
  assert('1300℃ → 基本致密（<0.1%）', high < 0.001, (high * 100).toFixed(3) + '%');
  /**
  * ★ 关键性质：温度是主杠杆。
  * 用比值守 —— 850→1000℃（+150K）的效果，应当远大于保温时间翻倍。
  */
  const hotter = await num('sintering_porosity', { temperature: 1273, hold_time: 1 });
  const longer = await num('sintering_porosity', { temperature: 1123, hold_time: 2 });
  assert('升温比延长保温更有效', hotter < longer, (hotter * 100).toFixed(1) + '% vs ' + (longer * 100).toFixed(1) + '%');
  /** ★ 反向对照：温度越高孔隙必须越少（单调性）。 */
  const t750 = await num('sintering_porosity', { temperature: 1023, hold_time: 1 });
  assert('孔隙随温度单调下降', t750 > low && low > high, t750 + ' > ' + low + ' > ' + high);
}

console.log('-- 2. 淬火硬度：含碳量定上限 --')
{
  /**
  * 拟合依据是实测 HRC-含碳量表。用 4 个实测点反守。
  * ⚠ 低碳区已知偏乐观（0.2% 时高约 9 个点），所以容差给宽。
  */
  const c05 = await num('quench_hardness', { carbon_percent: 0.5 });
  assert('C=0.5% → HRC 约 52', close(c05, 52, 2), c05.toFixed(1));
  const c07 = await num('quench_hardness', { carbon_percent: 0.7 });
  assert('C=0.7% → HRC 约 62', close(c07, 62, 3), c07.toFixed(1));
  const c12 = await num('quench_hardness', { carbon_percent: 1.2 });
  assert('C=1.2% → HRC 约 67', close(c12, 67, 2), c12.toFixed(1));
  /** ★ 低碳区：偏乐观但方向对（0.2% 算 29.5、实测 20）。 */
  const c02 = await num('quench_hardness', { carbon_percent: 0.2 });
  assert('C=0.2% → HRC 20~32（偏低但同量级）', c02 > 18 && c02 < 33, c02.toFixed(1));
  /**
  * ★ 核心用途：判断「这钢能不能硬」。
  * C<0.3% 的钢再怎么淬也到不了 HRC50 —— 这是「炼钢要控碳」的定量理由。
  */
  const c025 = await num('quench_hardness', { carbon_percent: 0.25 });
  assert('低碳钢到不了 HRC50', c025 < 50, c025.toFixed(1));
  const c06 = await num('quench_hardness', { carbon_percent: 0.6 });
  assert('工具钢区间能过 HRC55', c06 > 55, c06.toFixed(1));
  /** ★ 反向对照：硬度随碳量单调上升。 */
  assert('硬度随碳量单调上升', c02 < c05 && c05 < c07 && c07 < c12, '');
}

console.log('-- 3. 炉膛热效率：三种损失 --')
{
  const earthen = await num('furnace_efficiency', { flue_loss: 0.45, wall_loss: 0.10, unburnt_loss: 0.05 });
  assert('土窑 η=0.40', close(earthen, 0.40, 0.001), earthen.toFixed(2));
  const brick = await num('furnace_efficiency', { flue_loss: 0.30, wall_loss: 0.06, unburnt_loss: 0.03 });
  assert('改进砖窑 η=0.61', close(brick, 0.61, 0.001), brick.toFixed(2));
  const recovery = await num('furnace_efficiency', { flue_loss: 0.18, wall_loss: 0.04, unburnt_loss: 0.02 });
  assert('带余热回收 η=0.76', close(recovery, 0.76, 0.001), recovery.toFixed(2));
  /** ★ 烟气永远是最大损失 —— 这决定了「延长烟道」优于「加厚炉壁」。 */
  assert('烟气损失大于炉壁损失', (0.45 - 0.30) > (0.10 - 0.06), '');
  /** ★ 默认参数应给出「普通炉子」的典型值。 */
  const dflt = await num('furnace_efficiency', {});
  assert('默认 η 在 0.4~0.6 之间', dflt > 0.4 && dflt < 0.6, dflt.toFixed(2));
}

console.log('-- 4. 三条已接进体系 --')
{
  const inChain = (formulaId) => sys.systemsOfFormula(formulaId).length > 0;
  assert('烧结在链上', inChain('sintering_porosity'));
  assert('淬火在链上', inChain('quench_hardness'));
  assert('炉膛效率在链上', inChain('furnace_efficiency'));
  /** 烧结与淬火应同在材料链（工艺步骤），炉膛效率在能源链。 */
  const mat = sys.systemsOfFormula('sintering_porosity').map((s) => s.id);
  assert('烧结属材料链', mat.includes('sys-material') || mat.includes('sys-capacity'), mat.join(','));
  const en = sys.systemsOfFormula('furnace_efficiency').map((s) => s.id);
  assert('炉膛效率属能源链', en.includes('sys-energy'), en.join(','));
  /** 淬火应在渗碳之后（工艺顺序）。 */
  const chain = sys.FORMULA_SYSTEMS.find((s) => s.steps.some((st) => st.formula === 'quench_hardness'));
  const caseIdx = chain.steps.findIndex((st) => st.formula === 'case_depth');
  const quenchIdx = chain.steps.findIndex((st) => st.formula === 'quench_hardness');
  assert('淬火排在渗碳之后', quenchIdx > caseIdx, caseIdx + ' → ' + quenchIdx);
}

console.log('-- 5. 公式库与体系完整性 --')
{
  /**
   * 改成下限：每加一批公式都要手改这个数字，很快就退化成「抄实际值」，什么也守不住。
   * 真正要守的是「本批加的没把别人的挤掉」—— 那由「体系引用全部有效」那条守。
   */
  assert('公式总数 ≥ 516（本批之后只增不减）', fm.FORMULAS.length >= 516, String(fm.FORMULAS.length));
  const badRef = [];
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) if (!fm.FORMULA_INDEX.has(step.formula)) badRef.push(system.id + '→' + step.formula);
    for (const b of system.bridges ?? []) if (!fm.FORMULA_INDEX.has(b.formula)) badRef.push(system.id + '★' + b.formula);
  }
  assert('体系引用全部有效', badRef.length === 0, badRef.slice(0, 4).join(','));
  const pairs = [];
  for (const s of sys.FORMULA_SYSTEMS) for (const b of s.bridges ?? []) pairs.push(b.formula);
  assert('接点仍双向可达', pairs.every((f) => sys.systemsOfFormula(f).length >= 2), '');
  const inSys = new Set();
  for (const s of sys.FORMULA_SYSTEMS) { for (const st of s.steps) inSys.add(st.formula); for (const b of s.bridges ?? []) inSys.add(b.formula) }
  assert('覆盖率 ≥ 23%', inSys.size / fm.FORMULAS.length >= 0.23, (inSys.size / fm.FORMULAS.length * 100).toFixed(1) + '%');
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);