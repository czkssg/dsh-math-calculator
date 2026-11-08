/**
 * 三份实践文档的缺口补齐（2026-11-08）。
 *
 * 文档：《不足清单》17 条 + 《能力评估》4 处真缺口 + 《结构性不足》8 条。
 * 逐条核实后，**多数已在 2.3.0~2.3.2 修复**，本套只守真正还缺的那几项：
 *
 * ```
 *   不足 5    马力族单位（shp/ihp/bhp/PS/hp(metric)）
 *   结构性 4  formula 批量调用（formulas 数组）
 *   能力 3.1  recurrence 离散递推
 *   能力 3.3  ode 的 at 指定采样时点
 * ```
 *
 * 每项都配反向对照 —— 这几项的共同风险是「加新能力时把老路径改坏」，
 * 尤其 `result` 构造处被改动过（批量字段要搬过去），单条路径必须复查。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-gap-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) pass++
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result ?? '')

console.log('-- 1. 马力族单位（不足 5）--')
{
  /**
   * 文档原话：「轴马力与指示马力差 5–10%，工具分不出，使用者只能手工乘系数」。
   * 而手算 745.7 正是那四起千倍级事故里三起的源头。
   */
  const w = async (expr) => text({ operation: 'evaluate', expression: expr });
  assert('shp 可用', (await w('1 shp to W')).trim() === '745.69987158 W', await w('1 shp to W'));
  assert('ihp 可用', (await w('1 ihp to W')).trim() === '745.69987158 W', await w('1 ihp to W'));
  assert('bhp 可用', (await w('1 bhp to W')).trim() === '745.69987158 W', await w('1 bhp to W'));
  /**
   * ★ 公制马力两种写法都要能用，且**必须是 735 而不是 745**。
   * 这两个差 1.4%，写车题材时撞上就错。
   */
  assert('hp(metric) 归一化为公制马力', (await w('1 hp(metric) to W')).trim() === '735.49875 W', await w('1 hp(metric) to W'));
  assert('PS 归一化为公制马力（PS 在 mathjs 里是电导单位）', (await w('1 PS to W')).trim() === '735.49875 W', await w('1 PS to W'));
  /** ★ 反向对照：英制马力不许被归一化改坏（仍应是 745.7）。 */
  assert('hp 仍是 745.7', (await w('1 hp to W')).trim() === '745.69987154 W', await w('1 hp to W'));
  assert('10 hp to kW 正确', (await w('10 hp to kW')).trim() === '7.45699872 kW', await w('10 hp to kW'));
  /** 反向对照：PS 归一化不能误伤含 PS 的其它单位（hPa 是 h+Pa）。 */
  assert('hPa 未被误改', (await w('1 hPa to Pa')).trim() === '100 Pa', await w('1 hPa to Pa'));
}

console.log('-- 2. formula 批量（结构性不足 4）--')
{
  /**
   * 文档原话：「需要对 22 条公式做批量调用，但 formula 不支持数组，
   * 每次只能拆成单条 evaluate，等于放弃了公式库的全部价值。」
   */
  const batch = await run({
    operation: 'formula',
    formulas: [
      { formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 100 }, label: '大鼠' },
      { formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 9000000 }, label: '巨兽' },
    ],
  })
  assert('批量调用成功', batch.ok === true, String(batch.ok));
  assert('两条都有数值', /大鼠（kleiber） = 31622\.77660168 W/.test(String(batch.result)) && /巨兽（kleiber） = 164316767/.test(String(batch.result)), String(batch.result).slice(0, 160));
  /** ★ 反向对照：label 必须出现（否则批量看不出哪条是哪条）。 */
  assert('label 生效', /大鼠/.test(String(batch.result)) && /巨兽/.test(String(batch.result)));
  /** ★ 反向对照：批量与单条算出的数值必须一致。 */
  const single = await text({ operation: 'formula', formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 100 } })
  assert('批量与单条数值一致', /31622\.77660168/.test(single), single.split('\n').find((l) => l.startsWith('结果')) ?? '');

  /**
   * ★ 部分失败：一条错不能中断整批，但汇总必须如实报。
   * 这是 evaluate 批量已经确立的语义（1107 报告修过），批量公式要一致。
   */
  const partial = await run({
    operation: 'formula',
    formulas: [
      { formula: 'michaelis_menten', overrides: { vmax: 10, km: 2, substrate: 2 } },
      { formula: 'nosuchformula' },
    ],
  })
  assert('部分失败时 ok=false', partial.ok === false, String(partial.ok));
  assert('partial=true', partial.partial === true, String(partial.partial));
  assert('failed=1', partial.failed === 1, String(partial.failed));
  assert('succeeded=1', partial.succeeded === 1, String(partial.succeeded));
  assert('失败条点名原因', /nosuchformula → 失败\[unknown_formula\]/.test(String(partial.result)), '');
  /** ★ 成功的那条仍要有数值（不能因为另一条错就丢掉）。 */
  assert('成功条仍给出数值', /5 与 vmax 同单位/.test(String(partial.result)) || /半饱和/ .test(String(partial.result)), String(partial.result).slice(0, 100));
}

console.log('-- 3. recurrence 离散递推（能力 3.1）--')
{
  /**
   * 文档给了具体对照：离散 2^19 = 524,288 而连续 e^(0.693×19) = 522,824，差 0.28%。
   * 写作时写的是整数，所以必须给离散值。
   */
  const r20 = await run({ operation: 'recurrence', recurrence: 'P*2', initial: { P: 1 }, periods: 20 })
  assert('20 期可算', r20.ok === true, String(r20.ok));
  const txt = String(r20.result)
  const rowOf = (period) => {
    const line = txt.split('\n').find((l) => {
      const parts = l.trim().split(/\s+/);
      return parts.length >= 2 && parts[0] === String(period)
    });
    return line ? Number(line.trim().split(/\s+/)[1]) : NaN;
  };
  /** ★ 这是核心断言：整数一位不丢（2^20 = 1048576，不是 1.048576e6）。 */
  assert('第 20 期 = 1048576（整数完整）', rowOf(20) === 1048576, String(rowOf(20)));
  assert('第 19 期 = 524288', rowOf(19) === 524288, String(rowOf(19)));
  assert('第 5 期 = 32', rowOf(5) === 32, String(rowOf(5)));
  assert('第 0 期 = 1', rowOf(0) === 1, String(rowOf(0)));
  /**
  /**
   * ★ 带 min 约束 —— 这条踩过一个真 bug：BigNumber 引擎下 `min()` 返回普通 number，
   * 相乘时 mathjs 报「Cannot implicitly convert ... >15 significant digits」。
   * 改用 Number 引擎后正常，且必须**真的收敛到上限**。
   */
  const capped = await run({ operation: 'recurrence', recurrence: 'P*min(1.2, 1000/P)', initial: { P: 1 }, periods: 40 })
  assert('带 min 约束可算', capped.ok === true, String(capped.error && capped.error.type));
  assert('收敛到上限 1000', /P\(40\) = 1000/.test(String(capped.result)), String(capped.result).split('\n').slice(-3).join(' | '));

  /** 边界：空递推式、空初值都要报错，不许给个空表。 */
  const noExpr = await run({ operation: 'recurrence', initial: { P: 1 }, periods: 5 })
  assert('空递推式报错', noExpr.ok === false && noExpr.error?.type === 'invalid_argument', String(noExpr.error?.type));
  const noInit = await run({ operation: 'recurrence', recurrence: 'P*2', initial: {}, periods: 5 })
  assert('空初值报错', noInit.ok === false && noInit.error?.type === 'missing_params', String(noInit.error?.type));
}

console.log('-- 4. ode 的 at 指定采样（能力 3.3）--')
{
  /**
   * 文档原话：「我要第 5 年、第 10 年、第 20 年的值，ode 给的是均匀采样
   * t = 1, 2.9, 4.8, ... —— 没有一年是我要的。」
   */
  const r = await run({ operation: 'ode', expression: 'dP/dt=0.693*P', initial: { P: 1 }, from: 0, to: 20, at: [5, 10, 15, 20] })
  const txt = String(r.result)
  assert('at 生效（有「指定时点」段）', /指定时点/.test(txt));
  /** ★ 核心：得到的必须是**我要求的时点**，不是 4.8/10.5。 */
  for (const point of [5, 10, 15, 20]) {
    const line = txt.split('\n').find((l) => {
      const parts = l.trim().split(/\s+/);
      return parts.length >= 2 && parts[0] === String(point)
    });
    assert('输出含 t=' + point, line !== undefined, '');
  }
  /** ★ 数值核对：0.693 与 ln2 的固有差异约 0.1~0.3%，所以按相对误差守。 */
  const valueAt = (point) => {
    const seg = txt.split('指定时点')[1] ?? ''
    const line = seg.split('\n').find((l) => {
      const parts = l.trim().split(/\s+/);
      return parts.length >= 2 && parts[0] === String(point)
    });
    return line ? Number(line.trim().split(/\s+/)[1]) : NaN;
  };
  assert('t=5 约 32（2^5）', Math.abs(valueAt(5) - 32) / 32 < 0.02, String(valueAt(5)));
  assert('t=20 约 1048576（2^20）', Math.abs(valueAt(20) - 1048576) / 1048576 < 0.02, String(valueAt(20)));
  /** ★ 反向对照：不传 at 时不许出现「指定时点」段（否则每次都多一段噪音）。 */
  const plain = await run({ operation: 'ode', expression: 'dP/dt=0.693*P', initial: { P: 1 }, from: 0, to: 20 })
  assert('不传 at 时无该段', !/指定时点/.test(String(plain.result)));
}

console.log('-- 5. ok 语义未被批量改动破坏（关键反向对照）--')
{
  /**
   * ★ 本轮改动了 `result` 的构造处（批量字段要搬过去），
   * 这是**所有 operation 共用的一条路径**，必须逐类复查。
   */
  const okOf = async (args) => (await run(args)).ok;
  assert('单条 evaluate 仍 ok=true', (await okOf({ operation: 'evaluate', expression: '1+1' })) === true);
  assert('单条 formula 仍 ok=true', (await okOf({ operation: 'formula', formula: 'michaelis_menten', overrides: { vmax: 10, km: 2, substrate: 2 } })) === true);
  assert('units 仍 ok=true', (await okOf({ operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km' })) === true);
  assert('solve 仍 ok=true', (await okOf({ operation: 'solve', expression: '2x+3=7' })) === true);
  assert('1/0 仍 ok=false', (await okOf({ operation: 'evaluate', expression: '1/0' })) === false);
  assert('未知参数仍 ok=false', (await okOf({ operation: 'evaluate', expression: '1', bogus: 1 })) === false);
  /** evaluate 批量（既有能力）不许被破坏。 */
  const eb = await run({ operation: 'evaluate', expressions: ['1+1', '1/0'] })
  assert('evaluate 批量含失败仍 ok=false', eb.ok === false && eb.failed === 1, eb.ok + '/' + eb.failed);
  const eb2 = await run({ operation: 'evaluate', expressions: ['1+1', '2+2'] })
  assert('evaluate 批量全成功 ok=true', eb2.ok === true && eb2.partial === undefined, eb2.ok + '/' + eb2.partial);
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);