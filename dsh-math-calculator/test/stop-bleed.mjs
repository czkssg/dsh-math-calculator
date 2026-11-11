/**
 * 止血三项的回归测试（E1 / A2 / A7+A19）。
 *
 * 这四项都是「返回 ok=true 但结果错」——最危险的一类。
 * 每条断言都守两个方向：**该拒绝的被拒绝**，且**合法输入不被误伤**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-stopbleed-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
let fail = 0
const failed = []
function assert(name, condition, detail) {
  if (condition) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fail += 1
    failed.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const run = (args) => runMathTool(args)
const txt = (r) => String(r.result ?? '')

// ═══════════════════════════════════════════════════════════
console.log('-- 1. E1 参数分片：跨 operation 传参必须报错 --')
// ═══════════════════════════════════════════════════════════
{
  /** 每一条都是「参数名合法、但不属于这个 operation」。 */
  const misplaced = [
    ['world', { operation: 'world', unitFrom: '里' }, 'units'],
    ['world', { operation: 'world', formula: 'kleiber' }, 'formula'],
    ['units', { operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km', planetMass: 2 }, 'world'],
    ['evaluate', { operation: 'evaluate', expression: '1+1', diffA: 'x' }, 'derivation'],
    ['stats', { operation: 'stats', data: [1, 2, 3], recurrence: 'P*2' }, 'recurrence'],
    ['solve', { operation: 'solve', expression: 'x=1', initial: { P: 1 } }, 'ode'],
  ]
  for (const [label, args, owner] of misplaced) {
    const r = await run(args)
    assert(
      `${label} 收 ${owner} 的参数被拒`,
      r.ok === false && /不属于/.test(txt(r)),
      r.ok ? 'ok=true（静默接受）' : txt(r).slice(0, 60),
    )
  }

  /** 报错必须点出「这个参数属于谁」——否则调用方不知道该改去哪儿。 */
  const r = await run({ operation: 'world', unitFrom: '里' })
  assert('报错点名归属 operation', /属于 units/.test(txt(r)), txt(r).slice(0, 80))
  assert('报错给了修法 hint', typeof r.error?.hint === 'string' && r.error.hint.length > 10, '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 2. E1 反向：合法调用不许被误伤 --')
// ═══════════════════════════════════════════════════════════
{
  const legit = [
    ['world 无参', { operation: 'world' }],
    ['world 嵌套', { operation: 'world', world: { planetMass: 2 } }],
    ['world 顶层简写', { operation: 'world', starMass: 10 }],
    ['world + terrain', { operation: 'world', planetMass: 2, terrain: { kind: 'coastal' } }],
    ['units 正常', { operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km' }],
    ['units 列清单', { operation: 'units' }],
    ['evaluate 批量', { operation: 'evaluate', expressions: [{ expr: '1+1' }], terse: true }],
    ['formula 正常', { operation: 'formula', formula: 'velocity_uniform', overrides: { s: 10, t: 2 } }],
    ['ode 正常', { operation: 'ode', expression: 'dP/dt=P', initial: { P: 1 }, from: 0, to: 2, at: [1] }],
    ['recurrence 正常', { operation: 'recurrence', recurrence: 'P*2', initial: { P: 1 }, periods: 5 }],
    ['stats 正常', { operation: 'stats', data: [1, 2, 3, 4, 5] }],
    ['dist 正常', { operation: 'dist', distribution: 'normal', params: [0, 1], x: 0 }],
    ['balance 正常', { operation: 'balance', balance: { grain: { demand: 100, supply: 120 } } }],
    ['feasibility 正常', { operation: 'feasibility' }],
    ['help 正常', { operation: 'help' }],
    ['help 分节', { operation: 'help', helpTopic: 'world' }],
    ['derivation 正常', {
      operation: 'derivation', derivation: 'backSolve', anchor: 'creatureHeight', anchorValue: 50,
    }],
  ]
  for (const [label, args] of legit) {
    const r = await run(args)
    assert(`${label} 不被误拦`, r.ok === true, txt(r).slice(0, 70))
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 3. A2 units 复合单位必须算对 --')
// ═══════════════════════════════════════════════════════════
{
  /** [标签, 参数, 期望值, 容差] —— 容差用于「本来就不是整数」的换算。 */
  const cases = [
    ['1000 kg/m^3 → g/cm^3', { unitValue: 1000, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }, 1, 0.01],
    ['1 kg/m^3 → g/cm^3', { unitValue: 1, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }, 0.001, 1e-6],
    ['1 m^2/s → cm^2/s', { unitValue: 1, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }, 10000, 1],
    ['7 m^2/s → cm^2/s', { unitValue: 7, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }, 70000, 1],
    ['5 W/m^2 → kW/m^2', { unitValue: 5, unitFrom: 'W/m^2', unitTo: 'kW/m^2' }, 0.005, 1e-6],
    ['3 mol/L → mol/m^3', { unitValue: 3, unitFrom: 'mol/L', unitTo: 'mol/m^3' }, 3000, 1],
    ['100 km/h → m/s', { unitValue: 100, unitFrom: 'km/h', unitTo: 'm/s' }, 27.7778, 0.01],
  ]
  for (const [label, args, expect, tol] of cases) {
    const r = await run({ operation: 'units', ...args })
    const got = Number(txt(r).match(/=\s*([\d.eE+-]+)/)?.[1])
    assert(
      `units ${label}`,
      r.ok === true && Math.abs(got - expect) <= tol,
      r.ok ? '得到 ' + got + '，期望 ' + expect : txt(r).slice(0, 60),
    )
  }

  /**
   * 核心不变式：`units` 与 `evaluate` 两条路径必须给同一个答案。
   * 修复前 units 给 1000、evaluate 给 1 —— 同一工具差 1000 倍。
   */
  const pairs = [
    ['1000 kg/m^3 to g/cm^3', { unitValue: 1000, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }],
    ['1 m^2/s to cm^2/s', { unitValue: 1, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }],
  ]
  for (const [expr, args] of pairs) {
    const a = Number(txt(await run({ operation: 'units', ...args })).match(/=\s*([\d.eE+-]+)/)?.[1])
    const bTxt = txt(await run({ operation: 'evaluate', expression: expr }))
    const b = Number(bTxt.match(/^\s*([\d.eE+-]+)/)?.[1] ?? bTxt.match(/([\d.eE+-]+)\s/)?.[1])
    assert(`路径一致：${expr}`, Math.abs(a - b) / Math.abs(b || 1) < 0.01, `units=${a} evaluate=${b}`)
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 4. A2 反向：别名单位不能被当成复合单位 --')
// ═══════════════════════════════════════════════════════════
{
  const aliases = [
    ['公顷 → m²', { unitValue: 1, unitFrom: '公顷', unitTo: 'm²' }, 10000],
    ['平方米 → m²', { unitValue: 1, unitFrom: '平方米', unitTo: 'm²' }, 1],
    ['里 → km', { unitValue: 1, unitFrom: '里', unitTo: 'km' }, 0.5],
    ['亩 → m²', { unitValue: 1, unitFrom: '亩', unitTo: 'm²' }, 666.67],
  ]
  for (const [label, args, expect] of aliases) {
    const r = await run({ operation: 'units', ...args })
    const got = Number(txt(r).match(/=\s*([\d.eE+-]+)/)?.[1])
    assert(
      `units ${label}（别名不走 mathjs）`,
      r.ok === true && Math.abs(got - expect) / expect < 0.01,
      r.ok ? '得到 ' + got : txt(r).slice(0, 60),
    )
  }
  /** 球面度是单字母代号，不能被正则误判成复合。 */
  const sr = await run({ operation: 'units', unitValue: 1, unitFrom: 'sr', unitTo: 'deg²' })
  assert('sr → deg² 可换算', sr.ok === true, txt(sr).slice(0, 60))
}

// ═══════════════════════════════════════════════════════════
console.log('-- 5. A7/A19 world 非法参数必须拒绝 --')
// ═══════════════════════════════════════════════════════════
{
  const illegal = [
    ['planetMass:-1（负重力）', { planetMass: -1 }],
    ['planetMass:0', { planetMass: 0 }],
    ['planetRadius:0（重力 Infinity）', { planetRadius: 0 }],
    ['planetRadius:-2', { planetRadius: -2 }],
    ['rotationHours:0（一天 0 小时）', { rotationHours: 0 }],
    ['orbitAU:0（一年 0 天）', { orbitAU: 0 }],
    ['starMass:-5', { starMass: -5 }],
    ['starRadius:0', { starRadius: 0 }],
  ]
  for (const [label, params] of illegal) {
    const r = await run({ operation: 'world', ...params })
    assert(`world ${label} 被拒`, r.ok === false, r.ok ? 'ok=true' : '')
    if (!r.ok) {
      assert(`world ${label} 报 invalid_argument`, r.error?.type === 'invalid_argument', String(r.error?.type))
      assert(`world ${label} 给了修法`, typeof r.error?.hint === 'string' && r.error.hint.length > 10, '')
    }
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 6. A7/A19 反向：合法极端参数不许被误拦 --')
// ═══════════════════════════════════════════════════════════
{
  const legal = [
    ['默认（地球）', {}],
    ['2 倍质量', { planetMass: 2 }],
    ['极小但为正 0.05', { planetMass: 0.05 }],
    ['巨行星 318/11.2', { planetMass: 318, planetRadius: 11.2 }],
    ['M 型恒星', { starMass: 0.122, starTemp: 3042, orbitAU: 0.0485 }],
    ['快速自转 3h', { rotationHours: 3 }],
    ['极远轨道 30AU', { orbitAU: 30 }],
  ]
  for (const [label, params] of legal) {
    const r = await run({ operation: 'world', ...params })
    assert(`world ${label} 正常出画像`, r.ok === true, txt(r).slice(0, 70))
    /** 合法世界不该出现 NaN / Infinity —— 那是静默污染的标志。 */
    if (r.ok) {
      assert(`world ${label} 输出不含 NaN/Infinity`, !/NaN|Infinity/.test(txt(r)), '')
    }
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 7. 诊断路径仍能看到坏世界（不被入口拦死） --')
// ═══════════════════════════════════════════════════════════
{
  /** `sum` 路由的职责是「把非法世界渲染成 invalid 诊断」，不是 400。 */
  const { deriveAll } = await import(pathToFileURL(join(root, 'lib/summary.js')).href)
  const bad = deriveAll({ planetRadius: 0 })
  assert('deriveAll 收到零半径不抛异常', typeof bad === 'object' && bad !== null, '')
  assert('deriveAll 把非法世界标成 invalid', bad.verdict?.level === 'invalid', String(bad.verdict?.level))
}

rmSync(home, { recursive: true, force: true })
console.log('')
console.log(`通过 ${pass}，失败 ${fail}`)
if (failed.length > 0) {
  console.log('失败项:')
  for (const item of failed) console.log('  - ' + item)
}
process.exit(fail === 0 ? 0 : 1)
