/**
 * 土壤养分平衡 + 投资回本期（外部反馈 A4 / M1 通用化版）。
 *
 * 反馈原列三条，用户判断后只留两条：「M1 作用量」「I10 单人产能」太特化。
 *   M1 S=W×T      → 那是某本书的情节框架；但「投资回本期」通用且缺失 → 通用化后做
 *   I10 单人产能   → 「单人」是设定；min(a,b,c) 是四则运算 → 不做公式，写成配方
 *   A4 土壤养分    → 真缺口（leaching_residue 是浸提去单宁，与土壤无关）→ 做
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-p5-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) pass++
  else { fails.push(name); console.log('  FAIL ' + name + ' :: ' + (detail ?? '')) }
}
const num = async (id, overrides) => {
  const r = await run({ operation: 'formula', formula: id, overrides })
  if (!r.ok) return NaN
  const m = String(r.result).match(/结果: (-?[0-9.eE+-]+)/)
  return m ? Number(m[1]) : NaN
}
const close = (x, y, tol) => Math.abs(x - y) <= Math.abs(tol ?? 1e-9);

console.log('-- 1. 土壤养分平衡 --')
{
  const cont = await num('soil_nutrient_balance', { input: 15, uptake: 60, leach: 20, years: 10 });
  assert('连作 10 年：2000 到 1350', close(cont, 1350, 1), String(cont));
  const green = await num('soil_nutrient_balance', { input: 80, uptake: 60, leach: 25, years: 10 });
  assert('施绿肥 10 年：2000 到 1950', close(green, 1950, 1), String(green));
  const fallow = await num('soil_nutrient_balance', { input: 40, uptake: 10, leach: 15, years: 10 });
  assert('休耕 10 年：2000 到 2150', close(fallow, 2150, 1), String(fallow));
  const exhausted = await num('soil_nutrient_balance', { input: 15, uptake: 60, leach: 20, years: 31 });
  assert('连作 31 年接近耗尽', Math.abs(exhausted) < 20, String(exhausted));
  assert('连作库存下降', cont < 2000, String(cont));
  assert('休耕库存上升', fallow > 2000, String(fallow));
  const dflt = await num('soil_nutrient_balance', { input: 15, uptake: 60, leach: 20 });
  assert('years 有默认值', Number.isFinite(dflt) && dflt < 2000, String(dflt));
}

console.log('-- 2. 可持续投入 --')
{
  const need = await num('nutrient_sustainable_input', { uptake: 60, leach: 20 });
  assert('吸收 60 + 淋失 20 = 80', close(need, 80, 1e-9), String(need));
  assert('与连作投入的缺口是 65', close(need - 15, 65, 1e-9), String(need - 15));
  const clay = await num('nutrient_sustainable_input', { uptake: 60, leach: 10 });
  assert('黏土淋失减半，所需投入少 10', close(need - clay, 10, 1e-9), String(need - clay));
}

console.log('-- 3. 投资回本期 --')
{
  const axe = await num('payback_period', { upfront_cost: 40, annual_saving: 20 });
  assert('铁斧 2 年回本', close(axe, 2, 1e-9), String(axe));
  const kiln = await num('payback_period', { upfront_cost: 480, annual_saving: 120 });
  assert('第二座窑 4 年回本', close(kiln, 4, 1e-9), String(kiln));
  const wall = await num('payback_period', { upfront_cost: 336, annual_saving: 24 });
  assert('终极墙 14 年回本', close(wall, 14, 1e-9), String(wall));
  const faster = await num('payback_period', { upfront_cost: 40, annual_saving: 40 });
  assert('年节省翻倍，回本期减半', close(faster / axe, 0.5, 1e-9), String(faster / axe));
  assert('14 年的投在乱世是高风险', wall > 10, String(wall));
}

console.log('-- 4. 体系接入 --')
{
  assert('土壤养分在食物链上', sys.systemsOfFormula('soil_nutrient_balance').some((s) => s.id === 'sys-food'),
    sys.systemsOfFormula('soil_nutrient_balance').map((s) => s.id).join(','));
  assert('可持续投入在链上', sys.systemsOfFormula('nutrient_sustainable_input').length > 0);
  assert('回本期在产能链上', sys.systemsOfFormula('payback_period').some((s) => s.id === 'sys-capacity'),
    sys.systemsOfFormula('payback_period').map((s) => s.id).join(','));
}

console.log('-- 5. I10 写成配方而非公式 --')
{
  const names = fm.FORMULAS.map((f) => f.name).join('|');
  assert('没有单人产能类公式', !/单人.{0,2}产能|单人产出/.test(names), '');
  const recipe = String((await run({ operation: 'help', helpTopic: 'recipe' })).result ?? '');
  assert('配方里有瓶颈排查', /瓶颈排查/.test(recipe), recipe.slice(0, 40));
  assert('配方说明了为何不做公式', /四则运算/.test(recipe), '');
  assert('配方讲了瓶颈随规模移动', /瓶颈会随规模移动/.test(recipe), '');
}

console.log('-- 6. 库与体系完整性 --')
{
  assert('公式总数 >= 523', fm.FORMULAS.length >= 523, String(fm.FORMULAS.length));
  const badRef = [];
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) if (!fm.FORMULA_INDEX.has(step.formula)) badRef.push(system.id + '->' + step.formula);
    for (const b of system.bridges ?? []) if (!fm.FORMULA_INDEX.has(b.formula)) badRef.push(system.id + '*' + b.formula);
  }
  assert('体系引用全部有效', badRef.length === 0, badRef.slice(0, 4).join(','));
  const pairs = [];
  for (const s of sys.FORMULA_SYSTEMS) for (const b of s.bridges ?? []) pairs.push(b.formula);
  assert('接点仍双向可达', pairs.every((f) => sys.systemsOfFormula(f).length >= 2), '');
  const inSys = new Set();
  for (const s of sys.FORMULA_SYSTEMS) { for (const st of s.steps) inSys.add(st.formula); for (const b of s.bridges ?? []) inSys.add(b.formula) }
  assert('覆盖率 >= 24%', inSys.size / fm.FORMULAS.length >= 0.24, (inSys.size / fm.FORMULAS.length * 100).toFixed(1) + '%');
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);