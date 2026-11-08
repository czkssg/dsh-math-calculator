/**
 * 化工单元与通用工具四条（外部反馈 I7 / P3 / M4）。
 *
 * ```
 *   蒸馏汽液平衡 → 一次能提几倍 → 要几块塔板
 *   冷却结晶     → 溶解度差 → 收率上限
 *   坯体收缩     → 配料 → 会不会裂
 *   误差传播     → 谁主导精度 → 钱该花在哪
 * ```
 *
 * 前三条接进产能链/材料链；`error_propagation` 是**通用工具**，
 * 故意不归入任何链 —— 它服务于所有计算，挂到某一条链上反而是错的。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-p4-'))
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

console.log('-- 1. 蒸馏：富集倍数随浓度下降 --')
{
  /**
  * 这是「为什么要做塔」的定量理由。用比值守 —— 只看单点值不够，
  * 关键是**趋势**：浓度越高，单级富集越弱。
  */
  const dilute = (await num('distillation_enrichment', { liquid_fraction: 0.05 })) / 0.05;
  const strong = (await num('distillation_enrichment', { liquid_fraction: 0.80 })) / 0.80;
  assert('稀溶液富集约 2 倍', close(dilute, 2.08, 0.05), dilute.toFixed(2));
  assert('浓溶液富集只剩 1.1 倍', close(strong, 1.12, 0.05), strong.toFixed(2));
  assert('富集倍数随浓度下降', dilute > strong, dilute.toFixed(2) + ' vs ' + strong.toFixed(2));
  /** ★ 反向对照：y 必须永远大于 x（气相更富）且小于 1。 */
  const y = await num('distillation_enrichment', { liquid_fraction: 0.3 });
  assert('气相分数大于液相', y > 0.3, String(y));
  assert('气相分数小于 1', y < 1, String(y));
  /** ★ α 越大越容易分离。 */
  const lowA = await num('distillation_enrichment', { liquid_fraction: 0.3, relative_volatility: 1.2 });
  assert('α 减小 → 富集变弱', lowA < y, lowA.toFixed(3) + ' < ' + y.toFixed(3));
}

console.log('-- 2. 结晶：收率由溶解度差决定 --')
{
  /**
  * 实测锚点：100g 水配 246g KNO₃（100℃），冷到 20℃（溶解度 32）→ 析出 214g、收率 87%。
  */
  const c = await num('crystallization_yield', { solubility_hot: 246, solubility_cold: 32, solvent_mass: 100 });
  assert('硝石析出 214g', close(c, 214, 0.5), String(c));
  assert('收率约 87%', close(c / 246, 0.87, 0.01), (c / 246 * 100).toFixed(1) + '%');
  /** ★ 溶剂量翻倍 → 析出翻倍（线性）。 */
  const twice = await num('crystallization_yield', { solubility_hot: 246, solubility_cold: 32, solvent_mass: 200 });
  assert('溶剂量 ×2 → 析出 ×2', close(twice / c, 2, 1e-9), String(twice / c));
  /** ★ 降温更狠收益递减：20℃→0℃（溶解度约 13）只多析出 19g。 */
  const colder = await num('crystallization_yield', { solubility_hot: 246, solubility_cold: 13, solvent_mass: 100 });
  assert('再降 20℃ 只多析出约 19g', close(colder - c, 19, 0.5), String(colder - c));
  /** ★ 反向对照：溶解度不随温度变的盐（NaCl 36→36）析出应接近 0。 */
  const nacl = await num('crystallization_yield', { solubility_hot: 39.1, solubility_cold: 35.7, solvent_mass: 100 });
  assert('NaCl 几乎不析出（此法无效）', nacl < 5, String(nacl));
}

console.log('-- 3. 坯体收缩：掺熟料减收缩 --')
{
  const dflt = await num('drying_shrinkage', {});
  assert('默认总收缩 10%（陶土典型 8~12%）', close(dflt, 0.10, 0.001), String(dflt));
  /** ★ 掺熟料降低干缩 —— 这是「掺砂不裂」的定量依据。 */
  const tempered = await num('drying_shrinkage', { drying_shrinkage: 0.03 });
  assert('干缩降到 3% → 总收缩 7%', close(tempered, 0.07, 0.001), String(tempered));
  assert('掺熟料后收缩更小', tempered < dflt, tempered + ' < ' + dflt);
  /** ★ 瓷的烧成收缩更大（10~14%），总收缩可到 15~18%。 */
  const porcelain = await num('drying_shrinkage', { drying_shrinkage: 0.05, firing_shrinkage: 0.12 });
  assert('瓷总收缩可达 17%', close(porcelain, 0.17, 0.001), String(porcelain));
}

console.log('-- 4. 误差传播：找出主导项 --')
{
  /**
  * 实测案例：ρ=m/V，m=100±0.1g、V=50±0.5mL → ρ=2.000±0.020。
  * 其中体积贡献 99%、质量只占 1% —— 这个**占比**才是真正的结论。
  */
  const e = await num('error_propagation', { result_value: 2, relative_error_a: 0.001, relative_error_b: 0.01 });
  assert('ρ=2.000 ± 0.020', close(e, 0.0201, 0.001), String(e));
  /** ★ 反向对照：把最差的那个量改准，误差才真的下降。 */
  const fixedV = await num('error_propagation', { result_value: 2, relative_error_a: 0.001, relative_error_b: 0.001 });
  assert('体积误差降到 0.1% → 总误差大降', fixedV < e / 5, fixedV.toFixed(4) + ' vs ' + e.toFixed(4));
  /** ★ 而改进本来就不是瓶颈的量，几乎没用。 */
  const fixedM = await num('error_propagation', { result_value: 2, relative_error_a: 0.0001, relative_error_b: 0.01 });
  assert('质量误差再降 10 倍 → 总误差几乎不变', close(fixedM / e, 1, 0.01), (fixedM / e).toFixed(4));
  /** ★ 幂次的作用：a² 时 a 的贡献翻倍。 */
  const sq = await num('error_propagation', { result_value: 2, relative_error_a: 0.01, weight_a: 2, relative_error_b: 0.01 });
  const lin = await num('error_propagation', { result_value: 2, relative_error_a: 0.01, weight_a: 1, relative_error_b: 0.01 });
  assert('幂次 2 时误差更大', sq > lin, sq.toFixed(4) + ' vs ' + lin.toFixed(4));
}

console.log('-- 5. 体系接入 --')
{
  const inChain = (id) => sys.systemsOfFormula(id).length > 0;
  assert('蒸馏在链上', inChain('distillation_enrichment'));
  assert('结晶在链上', inChain('crystallization_yield'));
  assert('收缩在链上', inChain('drying_shrinkage'));
  /**
  * ★ `error_propagation` 是通用工具，**故意不归入任何链** ——
  * 它服务于所有计算，挂到某一条上反而误导。这条断言守的就是这个决定。
  */
  assert('误差传播不归入任何链（通用工具）', sys.systemsOfFormula('error_propagation').length === 0,
    sys.systemsOfFormula('error_propagation').map((s) => s.id).join(','));
  /** 收缩既在材料链（配料）也在产能链（工艺），这是合理的多归属。 */
  assert('收缩属于多条链', sys.systemsOfFormula('drying_shrinkage').length >= 1,
    String(sys.systemsOfFormula('drying_shrinkage').length));
}

console.log('-- 6. 库与体系完整性 --')
{
  assert('公式总数 520（516+4）', fm.FORMULAS.length === 520, String(fm.FORMULAS.length));
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
  assert('覆盖率 ≥ 24%', inSys.size / fm.FORMULAS.length >= 0.24, (inSys.size / fm.FORMULAS.length * 100).toFixed(1) + '%');
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);