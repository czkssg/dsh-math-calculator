/**
 * 非有限结果的处理策略：数值型算错误，分析型算信息。
 *
 * ## 为什么需要这一套
 *
 * 原先判断「结果里有 Infinity/NaN 就报错」用的是**黑名单**：
 * `help` / `stats` / `impact` 三个例外。于是每加一个分析型 operation
 * 就要补一条，补漏了就出事 —— `chaos` 正是被漏掉的那个：
 *
 *     derivation="chaos" 正确判出「进入混沌区、38.4 个特征时间后不可预测」，
 *     但概率云里的区间边界是 Infinity，于是整个分析被报成
 *     `[non_finite] 计算结果非有限`，AI 会以为混沌分析失败、把结论丢掉。
 *
 * 现在反过来：只有「目的就是给一个数」的 operation 才算错误。
 * 分析型 operation 里的无穷是**结论的一部分**（不可预测、无解、分母为零）。
 *
 * ## 两侧都要守住
 *
 *   · 分析型：绝不能因为无穷而报错丢掉结论；
 *   · 数值型：仍然必须报错 —— 否则 `1/0` 会被当成合法答案给出去。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-nonfinite-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 分析型：算出无穷也必须返回成功（不能丢结论）--')
{
  // chaos 的概率云边界是 Infinity，但结论「不可预测」正是我们要的
  const chaos = await run({ operation: 'derivation', derivation: 'chaos', lyapunov: 0.3 })
  assert('chaos 返回成功', chaos.ok === true,
    chaos.ok ? '' : 'type=' + (chaos.error && chaos.error.type))
  assert('chaos 给出不可预测结论', String(chaos.result).includes('不可预测'), '')
  assert('chaos 给出可预测时间上限', /38\.4|特征时间/.test(String(chaos.result)), '')
  assert('chaos 不再被标成 non_finite',
    !(chaos.error && chaos.error.type === 'non_finite'), String(chaos.error && chaos.error.type))

  // impact 会跑 355 条公式，必然有分母为零的
  const impact = await run({ operation: 'impact', constants: { G: 7e-11 } })
  assert('impact 返回成功', impact.ok === true, String(impact.error && impact.error.type))
  assert('impact 给出了受影响公式数', /受影响公式/.test(String(impact.result)), '')

  // heatmap 在极端参数下会有「无解」格
  const heat = await run({ operation: 'derivation', derivation: 'heatmap' })
  assert('heatmap 返回成功', heat.ok === true, String(heat.error && heat.error.type))
}

console.log('-- 2. 分析型：反解与判定同样不该因无穷失败 --')
{
  const back = await run({ operation: 'derivation', derivation: 'backSolve', anchor: 'creatureHeight', anchorValue: 50 })
  assert('backSolve 返回成功', back.ok === true, String(back.error && back.error.type))

  const dead = await run({ operation: 'derivation', derivation: 'dead', world: { orbitAU: 5 } })
  assert('dead 返回成功', dead.ok === true, String(dead.error && dead.error.type))
  assert('dead 给出判定等级', /勉强|正常|死寂/.test(String(dead.result)), '')

  const flip = await run({ operation: 'derivation', derivation: 'flip', flipClaim: 'rocket' })
  assert('flip 返回成功', flip.ok === true, String(flip.error && flip.error.type))

  const world = await run({ operation: 'world' })
  assert('world 返回成功', world.ok === true, String(world.error && world.error.type))
}

console.log('-- 3. 数值型：非有限仍然必须报错 --')
{
  const cases = [
    ['1/0', 'evaluate'],
    ['log(0)', 'evaluate'],
    ['1/(1-1)', 'evaluate'],
    ['0^(-1)', 'evaluate'],
  ]
  for (const [expr, operation] of cases) {
    const r = await run({ operation, expression: expr })
    assert(operation + ' "' + expr + '" 报错', r.ok === false, r.ok ? '算出了 ' + r.result : '')
    assert(operation + ' "' + expr + '" 错误类型是 non_finite',
      r.error && r.error.type === 'non_finite', String(r.error && r.error.type))
    assert(operation + ' "' + expr + '" 给了修复方向',
      Boolean(r.error && r.error.hint), String(r.error && r.error.hint).slice(0, 60))
  }

  // 注意：tan(pi/2) 在 64 位精度下不是 Infinity（pi/2 无法精确表示），
  // 会得到一个巨大的有限数。那是 BigNumber 的正常行为，不该判错。
  const bigTan = await run({ operation: 'evaluate', expression: 'tan(pi/2)' })
  assert('tan(pi/2) 给有限大数（不是误报非有限）',
    bigTan.ok === true || (bigTan.error && bigTan.error.type !== 'non_finite'),
    bigTan.ok ? String(bigTan.result).slice(0, 30) : String(bigTan.error && bigTan.error.type))

  // 正常数值不该被误伤
  const okExpr = await run({ operation: 'evaluate', expression: '2+2' })
  assert('正常表达式仍然成功', okExpr.ok === true, '')
}

console.log('-- 4. 公式求值属于数值型 --')
{
  // escape_velocity 若半径给 0 会算出 Infinity，应当报错而不是给出去
  // （注意 M 与 r 都是必填，只给一个会先报 missing_params）
  const bad = await run({
    operation: 'formula', formula: 'escape_velocity', overrides: { M: 8.958e24, r: 0 },
  })
  assert('公式算出无穷时报错', bad.ok === false, bad.ok ? '算出了 ' + bad.result : '')
  assert('错误类型是 non_finite', bad.error && bad.error.type === 'non_finite',
    String(bad.error && bad.error.type) + ' / ' + String(bad.error && bad.error.message).slice(0, 40))

  const good = await run({ operation: 'formula', formula: 'escape_velocity', overrides: { M: 8.958e24, r: 6371000 } })
  assert('合理参数仍给出 13.7 km/s', good.ok && String(good.result).includes('13699'),
    good.ok ? String(good.result).split('\n').pop() : '')
}

console.log('-- 5. 所有 derivation 子命令都不因无穷而失败 --')
{
  // 逐个跑：任何子命令都不该以 non_finite 理由失败
  const subs = [
    'stack', 'cards', 'dimensionless', 'units', 'sensitivity', 'flip', 'phase',
    'checklist', 'pipeline', 'anchors', 'backSolve', 'archive', 'history',
    'compare', 'fantasy', 'civilization', 'trace', 'impact', 'cost', 'graph',
    'heatmap', 'whitepaper', 'timeline', 'observer', 'dead', 'chaos', 'inherit',
    'diff', 'tables',
  ]
  let broken = []
  for (const sub of subs) {
    const r = await run({ operation: 'derivation', derivation: sub })
    // 缺参数导致的 invalid_argument 是合理的；non_finite 不是
    if (r.ok === false && r.error && r.error.type === 'non_finite') broken.push(sub)
  }
  assert('没有任何子命令因 non_finite 失败', broken.length === 0, broken.join(', ') || '无')
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
