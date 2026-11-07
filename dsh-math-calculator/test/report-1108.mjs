/**
 * 2026-11-08 实测报告（《末日最小移动居所设计》项目，约 90 次调用）。
 *
 * ## 这份报告的特点
 *
 * 它列的 18 条里，**只有 7 条是真缺陷**，其余是设计取舍、误判或自己标注「未测试」的推测。
 * 所以本套测试不是逐条照做，而是只守**复核确认过真有问题**的那几条 ——
 * 并且每条都带反向对照，防止「修 A 坏 B」。
 *
 * ## 有一条报告判断是错的
 *
 * 报告问题 1 说「workspaceVariables 在 evaluate 完全不生效」。
 * 实测：**它需要两步** —— 先 `workspace action2:set` 打开开关，再在 evaluate 里用。
 * 这是「操作不直观」，不是「功能不存在」。本套把正确用法钉死，
 * 将来谁想改这条语义，测试会拦。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-r1108-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. formula 的 unitFrom 真的参与计算（报告 P0-1）--')
{
  /**
   * 报告实测：`overrides:{V:324375}, unitFrom:"L"` 与不传 unitFrom 结果**完全相同**，
   * 因为 opFormula 里压根没读这两个参数。
   *
   * 而 V 声明的单位是 m³，用户按 L 给数 → 结果虚高 1000 倍，
   * 数字看着完全正常（11353125 分钟 ≈ 21 年，荒谬但不像错）。
   */
  const bare = await text({ operation: 'formula', formula: 'oxygen_depletion', overrides: { V: 324375, n: 20 } })
  const withL = await text({ operation: 'formula', formula: 'oxygen_depletion', overrides: { V: 324375, n: 20 }, unitFrom: 'L' })
  const numOf = (s) => Number((s.match(/结果: ([0-9.e+-]+)/) ?? [])[1])
  assert('不传 unitFrom 按 m³ 算（11353125）', Math.abs(numOf(bare) - 11353125) < 1, String(numOf(bare)))
  assert('传 unitFrom=L 后缩小 1000 倍（11353.1）', Math.abs(numOf(withL) - 11353.125) < 0.01, String(numOf(withL)))
  assert('两条结果确实不同（unitFrom 生效了）', numOf(bare) !== numOf(withL), bare.length + ' vs ' + withL.length)

  /** 带单位的值与 unitFrom 是两条等价路径，结果必须一致。 */
  const byValue = await text({ operation: 'formula', formula: 'oxygen_depletion', overrides: { V: '324375 L', n: 20 } })
  assert('带单位值 与 unitFrom 结果一致', Math.abs(numOf(byValue) - numOf(withL)) < 0.01,
    numOf(byValue) + ' vs ' + numOf(withL))

  /**
   * ★ 反向对照：无量纲参数不许被 unitFrom 波及。
   *
   * 这是本轮最隐蔽的 bug：`unitTo` 有兜底逻辑，在参数**没有声明单位**时
   * 让 unitTo 也生效，于是「人数 n=20」被当成 `20 L` 换算成 `0.02 m³`，
   * 结果虚高 1000 倍。
   */
  const withTo = await text({ operation: 'formula', formula: 'oxygen_depletion', overrides: { V: 324375, n: 20 }, unitFrom: 'L', unitTo: 'm^3' })
  assert('加 unitTo 不改变结果（无量纲参数不被波及）', Math.abs(numOf(withTo) - numOf(withL)) < 0.01,
    numOf(withTo) + ' vs ' + numOf(withL))

  /** 量纲不符必须报错，不许静默按原数算。 */
  const mismatch = await run({ operation: 'formula', formula: 'oxygen_depletion', overrides: { V: 324375, n: 20 }, unitFrom: 'kg' })
  assert('unitFrom 量纲不符时报错', mismatch.ok === false, String(mismatch.ok))
  assert('报错说明两边量纲', /质量|体积/.test(String(mismatch.error?.message)), String(mismatch.error?.message).slice(0, 60))

  /** 不传 unitFrom 时，其它公式的结果不许被影响。 */
  const plain = await text({ operation: 'formula', formula: 'kinetic_energy', overrides: { m: 2, v: 10 } })
  assert('不带 unitFrom 的普通公式不受影响', /100 J/.test(plain), plain.split('\n').find((l) => l.startsWith('结果')) ?? '')
}

console.log('-- 2. formula 支持 terse（报告问题 9）--')
{
  const full = await text({ operation: 'formula', formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 9000000 } })
  const terse = await text({ operation: 'formula', formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 9000000 }, terse: true })
  assert('terse 确实更短', terse.length < full.length / 2, terse.length + ' vs ' + full.length)
  assert('terse 仍给出结果与单位', /kleiber = .* W/.test(terse), terse.split('\n')[0])
  assert('terse 保留覆盖提示', /覆盖/.test(terse), '')

  /**
   * ★ 反向对照：terse 砍的是标题与参数表，**风险提示绝不砍**。
   * 经验式的【适用域】是「这个系数只在 1g 世界成立」的唯一提示，
   * 砍掉就等于让人在非地球世界里照抄。
   */
  const empirical = await text({ operation: 'formula', formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 9000000 }, terse: true })
  assert('terse 保留经验式适用域', /适用域/.test(empirical), '')

  /** 未生效的 key 也必须保留 —— 它会直接改变结论。 */
  const bogus = await text({ operation: 'formula', formula: 'kleiber', overrides: { B0: 1000, m0: 1, m: 9000000, bogus: 1 }, terse: true })
  assert('terse 保留未生效 key 警告', /未生效/.test(bogus) && /bogus/.test(bogus), '')

  /** terse 不许改变数值。 */
  const numOf = (s) => Number((s.match(/([0-9]{6,}\.[0-9]+)/) ?? [])[1])
  assert('terse 不改变数值', numOf(full) === numOf(terse), numOf(full) + ' vs ' + numOf(terse))
}

console.log('-- 3. Math.xxx 报错指向修复方向（报告问题 5）--')
{
  const r = await run({ operation: 'evaluate', expression: 'Math.min(3,5)' })
  assert('Math.min 仍报错（不支持该命名空间）', r.ok === false, '')
  assert('错误类型是 unknown_symbol', r.error?.type === 'unknown_symbol', String(r.error?.type))
  assert('提示指出了具体函数名', /Math\.min/.test(String(r.error?.message)), String(r.error?.message))
  assert('指向修复方向（去掉前缀）', /去掉 Math\. 前缀/.test(String(r.error?.hint)), String(r.error?.hint).slice(0, 60))

  /** 反向对照：不带前缀的写法必须照常可用。 */
  assert('min(3,5) 正常', (await text({ operation: 'evaluate', expression: 'min(3,5)' })).trim() === '3', '')
  assert('abs(-3) 正常', (await text({ operation: 'evaluate', expression: 'abs(-3)' })).trim() === '3', '')
}

console.log('-- 4. 复合单位与 min 撞名（报告问题 6）--')
{
  /**
   * 报告说 units 不支持复合单位 —— 确实。但 `evaluate` 本来就能算，
   * 只是 `L/min` 因为 `min` 撞上 mathjs 的函数名而失败。
   * 所以这里守的是「evaluate 里的复合单位可用」，而不是给 units 加复合量纲。
   */
  const cases = [
    ['1 MJ/day to kW', /^0\.011574/, '热量速率'],
    ['1 g/dL to kg/m^3', /^10 kg \/ m\^3$/, '浓度'],
    ['1 kg/m^3 to g/cm^3', /^0\.001/, '密度'],
    ['60 s to min', /^1 minute$/, 'min 作为单位'],
  ]
  for (const [expr, re, note] of cases) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('复合单位: ' + expr, re.test(t), t + '  (' + note + ')')
  }

  /**
   * `L/min` 那条：min 在单位位置要当分钟，不能当函数。
   * 数值核对：1 L/min = 0.001 m³ / 60 s = 1.6667e-5 m³/s。
   */
  const flow = (await text({ operation: 'evaluate', expression: '1 L/min to m^3/s' })).trim()
  assert('L/min 可算出结果', /m\^3 \/ s$/.test(flow), flow.slice(-14))
  assert('L/min 数值正确（1.67e-5）', /1\.66[0-9]*e-5/.test(flow), flow.slice(0, 20))
  assert('结果**带单位**（不许只剩数字）', /m\^3/.test(flow), flow.slice(-12))

  /** ★ 反向对照：min() 作为函数绝不许被改成 minute()。 */
  assert('min(3,5) 未被误改', (await text({ operation: 'evaluate', expression: 'min(3,5)' })).trim() === '3', '')
  assert('min(3,5,1) 未被误改', (await text({ operation: 'evaluate', expression: 'min(3,5,1)' })).trim() === '1', '')
  assert('2*min(4,7) 未被误改', (await text({ operation: 'evaluate', expression: '2*min(4,7)' })).trim() === '8', '')
}

console.log('-- 5. precision 调低导致截断时提示（报告问题 4）--')
{
  const p8 = await run({ operation: 'evaluate', expression: '10^20+1', precision: 8 })
  assert('p=8 大数确实被截', p8.result === '100000000000000000000', String(p8.result))
  assert('p=8 大数给出精度提示', /precision=8/.test(String(p8.notice)), String(p8.notice).slice(0, 50))
  assert('提示说明了失真位数', /失真/.test(String(p8.notice)), '');

  /** ★ 反向对照：结果装得下时不许念。 */
  const small = await run({ operation: 'evaluate', expression: '1+1', precision: 8 })
  assert('p=8 的小结果不提示', small.notice === undefined || !/precision=8/.test(String(small.notice)),
    String(small.notice))
  const frac = await run({ operation: 'evaluate', expression: '1/7', precision: 8 })
  assert('p=8 的小数不提示', frac.notice === undefined || !/precision=8/.test(String(frac.notice)), '')

  /** 默认 64 位不许提示（那是正常用法）。 */
  const dflt = await run({ operation: 'evaluate', expression: '10^20+1' })
  assert('默认 64 位无精度提示', dflt.notice === undefined || !/precision=/.test(String(dflt.notice)), '')
  assert('默认 64 位结果精确', dflt.result === '100000000000000000001', String(dflt.result))
}

console.log('-- 6. 报告的两条误判：实测确认正确用法 --')
{
  /**
   * 报告问题 1：「workspaceVariables 在 evaluate 完全不生效」。
   * 实测是**两步式**：先开开关，再用。这里把正确用法钉死。
   */
  await run({ operation: 'workspace', action2: 'set', workspaceVariables: { O2: 324375, F: 25.554 } })
  const off = await run({ operation: 'evaluate', expression: 'F * O2 / 10000' })
  assert('未开开关时变量不可用（这是设计，不是缺陷）', off.ok === false, String(off.ok))

  await run({ operation: 'workspace', action2: 'set', useWorkspaceVariables: true })
  const on = await run({ operation: 'evaluate', expression: 'F * O2 / 10000' })
  assert('开开关后变量可用', on.ok === true, String(on.error?.type))
  assert('数值正确（25.554*324375/10000 ≈ 828.9）', Math.abs(Number(on.result) - 828.907875) < 0.01, String(on.result))

  /**
   * 报告问题 7：「system 不支持 expression 字符串」。
   * 这是设计取舍 —— solve 完全覆盖同一场景，且能自动判定退化。
   */
  const solved = await text({ operation: 'solve', expression: '2x+y=10, x-y=1', terse: true })
  assert('solve 能解方程组（system 的等价能力）', /x =/.test(solved) && /y =/.test(solved), solved.slice(0, 40))
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)