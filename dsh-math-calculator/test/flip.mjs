/**
 * 结论翻转判定（`derivation="flip"`）。
 *
 * ## 为什么这和敏感性分析不是一回事
 *
 * `sensitivity` 回答「数值变了多少」，`flip` 回答「**能不能**变了没有」。
 * 这两件事不能用变化率互相推导：
 *
 *   逃逸速度 11.2 → 11.4，只变 1.8%，但若 Δv 上限是 11.3，结论就颠倒了；
 *   逃逸速度 11.2 → 13.4，变 20%，但若上限是 20，结论一点没变。
 *
 * 作者真正想知道的是后者——「这个设定稳不稳、能不能放心写」。
 *
 * ## 期望值来源
 *
 * 内置判据（见 `flip-claims.ts`）：
 *   rocket  ：判据值 = 11.186 × 倍率；成立条件 < 9.4（化学火箭 Δv 上限）
 *   human   ：判据值 = 倍率（重力）；成立条件 < 3.5
 *   flight  ：判据值 = 10 × 倍率（kg）；成立条件 < 50
 *   atmosphere：判据值 = 11.186 × 倍率；成立条件 > 6
 *
 * 例：rocket 基线 1.0 → 判据值 11.186 > 9.4 → 不成立；
 *     下调 20% → 8.949 < 9.4 → 成立，**结论翻转**。
 *
 * ## 关键回归
 *
 * 余量二分搜索的上界曾写成 `eps × 8 = 1.6`，而比值 > 1 会让 `base × (1 − ratio)`
 * 变成负数、被 `> 0` 检查跳过，于是 5g 的人体判据明明 30% 就翻，却被报成
 * 「量程内都翻不了」。本套测试用 5g → 30% 余量钉住这一点。
 */
import { checkFlip } from '../lib/flip.js'
import { FLIP_CLAIMS } from '../lib/flip-claims.js'
import { runMathTool } from '../lib/index.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次翻转判定。 */
async function flip(args) {
  const result = await runMathTool({ operation: 'derivation', derivation: 'flip', ...args })
  return result
}

console.log('-- 1. 判据库完整性 --')
{
  assert('有 4 条内置判据', FLIP_CLAIMS.length === 4, String(FLIP_CLAIMS.length))
  for (const claim of FLIP_CLAIMS) {
    assert(claim.id + ' 有中文名', typeof claim.label === 'string' && claim.label.length > 4, claim.label)
    assert(claim.id + ' 有表达式说明', typeof claim.formula === 'string' && claim.formula.length > 10, '')
    assert(claim.id + ' evaluate 能算', Number.isFinite(claim.evaluate(1)), String(claim.evaluate(1)))
    assert(claim.id + ' judge 给布尔', typeof claim.judge(claim.evaluate(1)) === 'boolean', '')
  }
}

console.log('-- 2. 踩线场景：20% 内就翻转 --')
{
  // 化学火箭：基线 1.0（逃逸 11.186）飞不出去；下调到 0.8 就能飞出去
  const report = checkFlip(FLIP_CLAIMS[0].evaluate, FLIP_CLAIMS[0].judge, 1, { epsilon: 0.2 })
  assert('rocket 1.0 基线不成立', report.baseHolds === false, String(report.baseHolds))
  assert('rocket 1.0 判为 critical（踩线）', report.severity === 'critical', report.severity)
  assert('rocket 1.0 确实翻转了', report.flipped === true, '')
  const down = report.probes.find((p) => p.direction === -1)
  assert('下调方向翻转', down && down.flipped === true, down && String(down.flipped))
  assert('下调后判据值 8.949（< 9.4）', down && Math.abs(down.value - 8.9488) < 1e-3,
    down && String(down.value))

  // 人站立：3g 成立（< 3.5），上调 20% 到 3.6 就不成立
  const human = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 3, { epsilon: 0.2 })
  assert('human 3g 基线成立', human.baseHolds === true, String(human.baseHolds))
  assert('human 3g 判为 critical', human.severity === 'critical', human.severity)
  const up = human.probes.find((p) => p.direction === 1)
  assert('上调方向翻转（3.6 > 3.5）', up && up.flipped === true, up && String(up.value))
}

console.log('-- 3. 稳的场景：扰动内不翻，且余量足够 --')
{
  // 逃逸速度只有地球一半（5.59），远低于 9.4 上限
  const report = checkFlip(FLIP_CLAIMS[0].evaluate, FLIP_CLAIMS[0].judge, 0.5, { epsilon: 0.2 })
  assert('rocket 0.5 判为 stable', report.severity === 'stable', report.severity)
  assert('rocket 0.5 没翻转', report.flipped === false, '')
  assert('给出了余量', typeof report.margin === 'number', String(report.margin))
  // 翻转点在 9.4/11.186 ≈ 0.8404，相对基线 0.5 是 68.1%
  assert('余量约 68%', report.margin !== undefined && Math.abs(report.margin - 0.6809) < 0.01,
    report.margin !== undefined ? (report.margin * 100).toFixed(1) + '%' : 'undefined')
}

console.log('-- 4. 关键回归：5g 人体判据余量 30%（曾误报「翻不了」）--')
{
  // 5g 现在不成立；下调 30% 到 3.5g 恰好跨过（严格小于 3.5 才成立）
  const report = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 5, { epsilon: 0.2 })
  assert('5g 基线不成立', report.baseHolds === false, String(report.baseHolds))
  assert('5g 20% 扰动内没翻', report.flipped === false, '')
  // 这是那个 bug：上界写 1.6 导致 base×(1-1.6) 为负、被跳过，误报「量程内都翻不了」
  assert('5g 能算出余量（不是 undefined）', report.margin !== undefined,
    report.margin === undefined ? 'undefined —— 这就是那个 bug' : '')
  assert('余量约 30%', report.margin !== undefined && Math.abs(report.margin - 0.3) < 0.01,
    report.margin !== undefined ? (report.margin * 100).toFixed(1) + '%' : '')
  assert('判为 fragile（余量薄）', report.severity === 'fragile', report.severity)
  assert('措辞说明当前不成立', report.verdict.includes('现在不成立'), report.verdict)
}

console.log('-- 5. 措辞必须区分「现在成立」与「现在不成立」--')
{
  // 2.9g 成立（< 3.5），上调 20% 到 3.48 仍 < 3.5 —— 不翻，但余量薄
  // 注意 3.2g 上调 20% 是 3.84 > 3.5，那是会翻的（critical），不能拿来测 fragile
  const holdsThin = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 2.9, { epsilon: 0.2 })
  assert('2.9g 成立', holdsThin.baseHolds === true, '')
  assert('2.9g 20% 内不翻（3.48 仍 < 3.5）', holdsThin.flipped === false,
    JSON.stringify(holdsThin.probes.map((p) => p.value)))
  assert('2.9g 判 fragile（余量薄）', holdsThin.severity === 'fragile', holdsThin.severity)
  assert('2.9g 措辞说「现在成立」', holdsThin.verdict.includes('现在成立'), holdsThin.verdict)

  // 不成立且余量薄
  const noHoldsThin = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 5, { epsilon: 0.2 })
  assert('5g 措辞说「现在不成立」', noHoldsThin.verdict.includes('现在不成立'), noHoldsThin.verdict)

  // 反向确认：3.2g 上调 20% 到 3.84 确实会翻，应当判 critical
  const flipAt32 = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 3.2, { epsilon: 0.2 })
  assert('3.2g 上调到 3.84 会翻 → critical', flipAt32.severity === 'critical', flipAt32.severity)
}

console.log('-- 6. 结论由别的量决定（这个参数翻不动）--')
{
  // 1g 的人体判据：翻到 3.5 需要 250% 的扰动，远超量程
  const report = checkFlip(FLIP_CLAIMS[1].evaluate, FLIP_CLAIMS[1].judge, 1, { epsilon: 0.2 })
  assert('1g 判 stable', report.severity === 'stable', report.severity)
  assert('1g 在量程内翻不了（margin 为 undefined）', report.margin === undefined,
    String(report.margin))
  assert('措辞说明取决于别的量', report.verdict.includes('别的量'), report.verdict)
}

console.log('-- 7. 上下调都要检查，不能只看一个方向 --')
{
  // atmosphere：逃逸 11.186×0.6 = 6.71 > 6 → 成立；下调 20% 到 5.37 < 6 就翻
  // 所以 0.6 在 20% 扰动下**确实会翻**，判 critical 是对的
  const report = checkFlip(FLIP_CLAIMS[3].evaluate, FLIP_CLAIMS[3].judge, 0.6, { epsilon: 0.2 })
  assert('atmosphere 0.6（逃逸 6.71）成立', report.baseHolds === true, String(report.baseValue))
  assert('atmosphere 0.6 判 critical（下调 20% 到 5.37 就翻）', report.severity === 'critical',
    report.severity)
  assert('确实是下调方向翻的',
    report.probes.find((p) => p.direction === -1).flipped === true, '')

  // 换个更稳的基线：0.7（逃逸 7.83），下调 20% 到 6.27 仍 > 6，不翻
  const stable = checkFlip(FLIP_CLAIMS[3].evaluate, FLIP_CLAIMS[3].judge, 0.7, { epsilon: 0.2 })
  assert('atmosphere 0.7 不翻', stable.flipped === false, '')
  // 翻转点 11.186x = 6 → x = 0.5364；相对 0.7 是 23.4%
  assert('atmosphere 0.7 余量约 23.4%',
    stable.margin !== undefined && Math.abs(stable.margin - 0.2337) < 0.01,
    stable.margin !== undefined ? (stable.margin * 100).toFixed(1) + '%' : 'undefined')

  const probes = report.probes
  assert('两个方向都探测了', probes.length === 2, String(probes.length))
  assert('探测含下调方向', probes.some((p) => p.direction === -1), '')
  assert('探测含上调方向', probes.some((p) => p.direction === 1), '')
}

console.log('-- 8. 工具层：子命令可用，坏判据要报错 --')
{
  const ok = await flip({ flipClaim: 'rocket', flipBase: 1 })
  assert('flip 子命令跑通', ok.ok === true, ok.ok ? '' : ok.result)
  assert('渲染含「结论翻转」', ok.result.includes('结论翻转'), '')
  assert('渲染含判定档', ok.result.includes('踩线'), '')
  assert('value.flip 存在', ok.value && ok.value.flip, '')
  assert('value.claim.id = rocket', ok.value && ok.value.claim && ok.value.claim.id === 'rocket',
    ok.value && ok.value.claim && ok.value.claim.id)
  // 与 sensitivity 的分工要在输出里说清
  assert('渲染说明与 sensitivity 的分工', ok.result.includes('sensitivity'), '')
  // 铁律：不出现命令式措辞
  assert('措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(ok.result), '')

  const bad = await flip({ flipClaim: 'nonsense' })
  assert('未知判据被拒', bad.ok === false, bad.ok ? '跑通了' : '')
  // hint 在 error.hint 里（result 只有一句话结论），可用判据要能查到
  assert('hint 列出可用判据',
    bad.ok === false && String(bad.error && bad.error.hint).includes('rocket'),
    bad.ok ? '' : String(bad.error && bad.error.hint).slice(0, 150))
}

console.log('-- 9. 自定义扰动幅度 --')
{
  // 5% 扰动下，rocket 1.0（11.186）离上限 9.4 还远，不翻
  const tight = checkFlip(FLIP_CLAIMS[0].evaluate, FLIP_CLAIMS[0].judge, 1, { epsilon: 0.05 })
  assert('5% 扰动下 rocket 1.0 不翻', tight.flipped === false, '')
  // 50% 扰动下翻
  const wide = checkFlip(FLIP_CLAIMS[0].evaluate, FLIP_CLAIMS[0].judge, 1, { epsilon: 0.5 })
  assert('50% 扰动下 rocket 1.0 翻转', wide.flipped === true, '')
  assert('翻转只发生在下调方向', wide.probes.find((p) => p.direction === -1).flipped === true, '')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
