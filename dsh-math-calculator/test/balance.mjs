/**
 * 收支盘点与最短板（`operation="balance"`）。
 *
 * ## 为什么需要
 *
 * 插件此前只能算**单项上限**（`feasibility`：城市人口上限、帝国控制半径、
 * 建筑高度），答不了作者最常问的那类问题：
 *
 *   「我这个王国，两百万人口、二十万兵，养得起吗？」
 *
 * 这类问题不是「某项超没超」，而是**几项一起看、最紧的那项说了算**（木桶效应）。
 * 对应 WorldForge-Q 方案 FR-07 的 `K = min(K粮, K水, K能)`。
 *
 * ## 期望值来源
 *
 *   grain 2.7e6/3.1e6 → 覆盖 114.8%，判「紧」（1—1.5 之间）
 *   water 1.2e6/1.05e6 → 覆盖 87.5%，判「不够」，缺口 1.5e5
 *   army  3e7/3e8     → 覆盖 1000%，判「充裕」
 *   最短板 = 水（覆盖率最低）
 *
 * ## 关键设计：容差不是 1
 *
 * 覆盖率 >= 1.5 才算「充裕」，1—1.5 算「紧」。因为真实社会没有余量的系统
 * 经不起任何波动（一次歉收就崩），所以「刚好够」在推演里等同于危险。
 */
import { checkBalance, BALANCE_ITEMS } from '../lib/balance.js'
import { opBalance } from '../lib/ops/balance-op.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次盘点。 */
function run(inputs) {
  return checkBalance(inputs)
}

/** 跑 op 层（走文本渲染）。 */
function runOp(balance) {
  try {
    return { ok: true, ...opBalance({ balance }) }
  } catch (error) {
    return { ok: false, type: error.type, message: error.message, hint: error.hint }
  }
}

console.log('-- 1. 单项判定分档 --')
{
  // 覆盖率 2.0 → 充裕
  const ample = run({ grain: { demand: 100, supply: 200 } })
  assert('覆盖 200% → 充裕', ample.checks[0].status === 'ample', ample.checks[0].status)
  assert('覆盖率 = 2', Math.abs(ample.checks[0].coverage - 2) < 1e-9, String(ample.checks[0].coverage))
  assert('充裕时缺口 = 0', ample.checks[0].gap === 0, String(ample.checks[0].gap))

  // 覆盖率 1.2 → 紧（不是充裕）
  const tight = run({ grain: { demand: 100, supply: 120 } })
  assert('覆盖 120% → 紧（不是充裕）', tight.checks[0].status === 'tight', tight.checks[0].status)

  // 覆盖率 1.0 恰好够 → 紧
  const exact = run({ grain: { demand: 100, supply: 100 } })
  assert('覆盖恰 100% → 紧', exact.checks[0].status === 'tight', exact.checks[0].status)
  assert('恰好够时缺口 = 0', exact.checks[0].gap === 0, String(exact.checks[0].gap))

  // 覆盖率 0.5 → 不够，缺 50
  const short = run({ grain: { demand: 100, supply: 50 } })
  assert('覆盖 50% → 不够', short.checks[0].status === 'short', short.checks[0].status)
  assert('缺口 = 50', short.checks[0].gap === 50, String(short.checks[0].gap))
}

console.log('-- 2. 最短板是覆盖率最低的那一项 --')
{
  const report = run({
    grain: { demand: 2.7e6, supply: 3.1e6, unit: 'kg/年' },
    water: { demand: 1.2e6, supply: 1.05e6, unit: 'm³/年' },
    army: { demand: 3e7, supply: 3e8, unit: '钱' },
  })
  assert('三项都被检查', report.checks.length === 3, String(report.checks.length))
  assert('最短板是水', report.bottleneck && report.bottleneck.key === 'water',
    report.bottleneck && report.bottleneck.key)
  assert('最短板覆盖率 87.5%', report.bottleneck && Math.abs(report.bottleneck.coverage - 0.875) < 1e-9,
    report.bottleneck && String(report.bottleneck.coverage))
  assert('缺口 1.5e5', report.bottleneck && Math.abs(report.bottleneck.gap - 1.5e5) < 1e-6,
    report.bottleneck && String(report.bottleneck.gap))
  assert('整体判为不可持续', report.sustainable === false, String(report.sustainable))
  // 结论里必须点名最短板
  assert('结论点名水', report.verdict.includes('水'), report.verdict)

  // 换一个场景：全部充裕时，最短板是余量最小那个
  const allGood = run({
    grain: { demand: 100, supply: 160 },
    water: { demand: 100, supply: 400 },
  })
  assert('全充裕时仍给最短板（grain，覆盖 160%）',
    allGood.bottleneck && allGood.bottleneck.key === 'grain', allGood.bottleneck && allGood.bottleneck.key)
  assert('全充裕时判可持续', allGood.sustainable === true, String(allGood.sustainable))
}

console.log('-- 3. 没给的项要明确列出，不能让人以为都查过了 --')
{
  const report = run({ grain: { demand: 100, supply: 200 } })
  assert('未检查项有 6 项', report.unchecked.length === 6, String(report.unchecked.length))
  assert('未检查项含「财政」', report.unchecked.includes('财政'), report.unchecked.join(','))
  assert('未检查项含「军费」', report.unchecked.includes('军费'), report.unchecked.join(','))
  const text = runOp({ grain: { demand: 100, supply: 200 } })
  assert('渲染里说明「只覆盖查过的项」', text.result.includes('只覆盖'), '')
}

console.log('-- 4. 自定义键名也能算（扩展性）--')
{
  const report = run({
    grain: { demand: 100, supply: 200 },
    木材: { demand: 500, supply: 300, unit: '根/年' },
  })
  assert('自定义项被纳入', report.checks.length === 2, String(report.checks.length))
  assert('自定义项成为最短板', report.bottleneck && report.bottleneck.key === '木材',
    report.bottleneck && report.bottleneck.key)
}

console.log('-- 5. 输入校验：坏数据要说清，不静默 --')
{
  const bad1 = runOp({ grain: 'abc' })
  assert('收支项不是对象 → 报错', bad1.ok === false, bad1.ok ? '' : '')
  assert('报错点名是哪个键', bad1.ok === false && bad1.message.includes('grain'), bad1.ok ? '' : bad1.message)

  const bad2 = runOp({ grain: { demand: 'x', supply: 100 } })
  assert('demand 非数字 → 报错', bad2.ok === false, bad2.ok ? '' : '')
  assert('报错说清收到什么', bad2.ok === false && bad2.message.includes('demand'), bad2.ok ? '' : bad2.message)

  const bad3 = runOp({ grain: { demand: -5, supply: 100 } })
  assert('负需求 → 报错', bad3.ok === false, bad3.ok ? '' : '')
  assert('提示缺口用正数表达', bad3.ok === false && bad3.hint.includes('负数'), bad3.ok ? '' : bad3.hint)

  const bad4 = runOp(undefined)
  assert('完全没给 balance → 报错并给示例', bad4.ok === false && bad4.hint.includes('demand'),
    bad4.ok ? '' : bad4.hint)
}

console.log('-- 6. 渲染要能直接给作者看 --')
{
  const r = runOp({
    grain: { demand: 2.7e6, supply: 3.1e6, unit: 'kg/年' },
    water: { demand: 1.2e6, supply: 1.05e6, unit: 'm³/年' },
  })
  assert('有表格标题', r.result.includes('收支盘点'), '')
  assert('有覆盖率百分比', r.result.includes('115%') && r.result.includes('88%'), '')
  assert('有状态标记', r.result.includes('不够') && r.result.includes('紧'), '')
  assert('有最短板小节', r.result.includes('最短板'), '')
  assert('说明了与 feasibility 的分工', r.result.includes('feasibility'), '')
  // 铁律：不反驳用户设定
  assert('措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(r.result), '')
  // 结构化值
  assert('value.checks 是数组', Array.isArray(r.value.checks), String(r.value.checks.length))
  assert('value.bottleneck.key = water', r.value.bottleneck && r.value.bottleneck.key === 'water',
    r.value.bottleneck && r.value.bottleneck.key)
  assert('value 给出可用键名清单', Array.isArray(r.value.availableItems),
    String(r.value.availableItems && r.value.availableItems.length))
}

console.log('-- 7. 边界情形 --')
{
  // demand = 0（不需求）：覆盖率应为 Infinity，且不该成为最短板
  const zero = run({
    grain: { demand: 0, supply: 100 },
    water: { demand: 100, supply: 50 },
  })
  const grain = zero.checks.find((c) => c.key === 'grain')
  assert('demand=0 时覆盖率为无限', grain && grain.coverage === Infinity, grain && String(grain.coverage))
  assert('demand=0 不抢最短板', zero.bottleneck && zero.bottleneck.key === 'water',
    zero.bottleneck && zero.bottleneck.key)

  // 全空
  const empty = run({})
  assert('空输入不崩', empty.checks.length === 0, String(empty.checks.length))
  assert('空输入给说明', empty.verdict.includes('至少给一组'), empty.verdict)

  // 内置键清单完整性
  assert('内置键名 7 个', BALANCE_ITEMS.length === 7, String(BALANCE_ITEMS.length))
  const keys = BALANCE_ITEMS.map((i) => i.key)
  for (const expected of ['grain', 'water', 'energy', 'land', 'fiscal', 'army', 'info']) {
    assert('内置键含 ' + expected, keys.includes(expected), keys.join(','))
  }
  // 每项都要有补救方向（否则结论帮不上忙）
  assert('每项都写了补救方向',
    BALANCE_ITEMS.every((i) => typeof i.remedy === 'string' && i.remedy.length > 5), '')
}

console.log('-- 8. 与公式库联动：算出「养不养得起」--')
{
  // 用真实场景串起来：百万人口、2 万兵
  // 财政 = 1e6 × 3000 × 0.1 = 3e8；军饷 = 2e4 × 1500 = 3e7
  // 粮食 = 1000 公顷 × 3000 × 0.9 = 2.7e6；人均 2200 kcal 需 1e6×2200×365/3500 = 2.29e8 kg → 远不够
  const report = run({
    fiscal: { demand: 3e7, supply: 3e8, unit: '钱/年' },
    grain: { demand: 2.294e8, supply: 2.7e6, unit: 'kg/年' },
  })
  assert('财政够（1000%）', report.checks.find((c) => c.key === 'fiscal').status === 'ample', '')
  assert('粮食远不够，成为最短板', report.bottleneck && report.bottleneck.key === 'grain',
    report.bottleneck && report.bottleneck.key)
  assert('结论说明「撑不住」', report.verdict.includes('撑不住'), report.verdict)
  // 这正是木桶效应：财政再宽裕也补不上粮食的窟窿
  assert('结论只认最短板，不因财政宽裕而说撑得住', report.sustainable === false, '')
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
