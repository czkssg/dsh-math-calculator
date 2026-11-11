/**
 * ledger（台账闭合）的测试。
 *
 * 这个能力的价值全部在「判断」上，而不在「求和」上 ——
 * 求和用 evaluate 就能做。所以测试重点验三件事：
 *
 *   ① 闭合/不闭合判定对不对（含容差边界）
 *   ② 可疑项定位准不准（三类判据：量级笔误 / 漏项 / 整数异常）
 *   ③ **不越权**：工具只能给可疑度排序，不能替作者决定改哪一项
 *
 * 第三条是设计约束，测试守的是「它没有假装知道」。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-ledger-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { opLedger } = await import(pathToFileURL(join(root, 'lib/ops/ledger-op.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const run = (args) => runMathTool({ operation: 'ledger', ...args })
const txt = (r) => String(r.result ?? '')

// ───────────────────────────────────────────────────────────
console.log('-- 1. 占比简写：闭合与不闭合 --')
// ───────────────────────────────────────────────────────────
{
  /** 士农工商：1+85+10+4 = 100，闭合。这是推演段最常见的用法。 */
  const ok = await run({ ledger: { 士: 1, 农: 85, 工: 10, 商: 4 } })
  assert('占比合计 100 判闭合', ok.ok === true && ok.value?.closed === true, String(ok.value?.closed))
  assert('闭合时 sum=100', ok.value?.sum === 100, String(ok.value?.sum))
  assert('闭合时 diff=0', ok.value?.diff === 0, String(ok.value?.diff))
  assert('闭合时不给可疑项', (ok.value?.suspicious ?? []).length === 0, '')

  /**
   * ★ 这是 W02 的真实硬伤：占比合计 99.011%。
   * 工具必须检出「不闭合」，并指出 0.01 那一项疑似差 100 倍。
   */
  const bad = await run({ ledger: { 贵族: 0.01, 平民: 15, 农奴: 74, 自由民: 10, 其他: 0.001 } })
  assert('99.011% 判不闭合', bad.value?.closed === false, String(bad.value?.closed))
  assert('检出差额 −0.989', Math.abs((bad.value?.diff ?? 0) + 0.989) < 1e-6, String(bad.value?.diff))
  assert('指出贵族疑似差 100 倍',
    (bad.value?.suspicious ?? []).some((s) => s.name === '贵族' && /100 倍/.test(s.reason)),
    JSON.stringify((bad.value?.suspicious ?? []).map((s) => s.name)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 显式形态：分项 vs 总量 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({
    ledger: { parts: [{ name: '甲', value: 120 }, { name: '乙', value: 80 }, { name: '丙', value: 50 }], total: 300 },
  })
  assert('分项 250 vs 总量 300 判不闭合', r.value?.closed === false, '')
  assert('sum=250', r.value?.sum === 250, String(r.value?.sum))
  assert('diff=−50', r.value?.diff === -50, String(r.value?.diff))
  /** 差额恰好等于丙的值 → 提示「漏了一项同值分项」。 */
  assert('指出差额等于丙的值',
    (r.value?.suspicious ?? []).some((s) => s.name === '丙' && /漏了一项|重复/.test(s.reason)),
    JSON.stringify((r.value?.suspicious ?? []).map((s) => s.name)))

  /** 精确闭合的边界：容差 0.1%，差 0.05 应算闭合。 */
  const near = await run({ ledger: { parts: [{ name: 'a', value: 100 }, { name: 'b', value: 100 }], total: 200.1 } })
  assert('相对差 0.05% 在容差内算闭合', near.value?.closed === true, String(near.value?.relative))

  /** 超出容差：差 1% 应不闭合。 */
  const far = await run({ ledger: { parts: [{ name: 'a', value: 100 }, { name: 'b', value: 101 }], total: 200 } })
  assert('相对差 0.5% 超出容差算不闭合', far.value?.closed === false, String(far.value?.relative))

  /** 自定义容差。 */
  const loose = await run({ ledger: { parts: [{ name: 'a', value: 100 }, { name: 'b', value: 101 }], total: 200, tolerance: 0.01 } })
  assert('自定义 tolerance 生效', loose.value?.closed === true, String(loose.value?.relative))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 三类可疑判据 --')
// ───────────────────────────────────────────────────────────
{
  /** 判据一：10 倍笔误。 */
  const tenX = await run({ ledger: { parts: [{ name: '甲', value: 10 }, { name: '乙', value: 30 }], total: 130 } })
  assert('10 倍笔误被检出',
    (tenX.value?.suspicious ?? []).some((s) => /10 倍/.test(s.reason)),
    JSON.stringify((tenX.value?.suspicious ?? []).map((s) => s.reason).slice(0, 1)))

  /**
   * 判据二：整数异常（其余都带小数）。
   *
   * 注意总量要**真的不等于**分项和 —— 33.3+33.4+40 = 106.7 恰好闭合，
   * 那样根本进不到可疑项判定（第一版测试就是这么写错的）。
   */
  const intOdd = await run({
    ledger: { parts: [{ name: '甲', value: 33.3 }, { name: '乙', value: 33.4 }, { name: '丙', value: 40 }], total: 110 },
  })
  assert('整数异常被提示',
    (intOdd.value?.suspicious ?? []).some((s) => /整数/.test(s.reason)),
    JSON.stringify((intOdd.value?.suspicious ?? []).map((s) => s.name)))

  /** 找不到解释时必须**明说**，不能瞎猜。 */
  const opaque = await run({
    ledger: { parts: [{ name: '甲', value: 7.77 }, { name: '乙', value: 13.33 }], total: 99.9 },
  })
  assert('找不到解释时明说「没有单一分项能解释」', /没有单一分项能解释/.test(txt(opaque)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 不越权：工具只给可疑度，不替作者决定 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ ledger: { parts: [{ name: '甲', value: 10 }, { name: '乙', value: 30 }], total: 130 } })
  assert('明说差额确定、该改哪项不确定', /差额本身是确定的/.test(txt(r)), '')
  assert('提醒判断权交给作者', /交给作者|只有作者知道|只有你知道/.test(txt(r)), '')
  /** 不许出现「必须改成」这种替人决定的措辞。 */
  assert('不用祈使「必须改」', !/必须改成|应该改成/.test(txt(r)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 错误处理与边界 --')
// ───────────────────────────────────────────────────────────
{
  const empty = await run({ ledger: {} })
  assert('空 ledger 报错', empty.ok === false, String(empty.ok))
  assert('报错给了两种写法', /占比简写|parts/.test(empty.error?.hint ?? ''), '')

  const missing = await run({})
  assert('不给 ledger 报错', missing.ok === false, String(missing.ok))

  /** 负数与零也要能处理（收支场景有负值）。 */
  const neg = await run({ ledger: { parts: [{ name: '收', value: 100 }, { name: '支', value: -30 }], total: 70 } })
  assert('负数分项能闭合', neg.value?.closed === true && neg.value?.sum === 70, String(neg.value?.sum))

  /** 单分项。 */
  const one = await run({ ledger: { 全部: 100 } })
  assert('单分项闭合', one.value?.closed === true, '')

  /** 单位透传。 */
  const withUnit = await run({ ledger: { parts: [{ name: '甲', value: 60 }, { name: '乙', value: 40 }], total: 100, unit: '万吨' } })
  assert('单位被写进输出', /万吨/.test(txt(withUnit)), '')
  assert('单位进结构化字段', withUnit.value?.unit === '万吨', String(withUnit.value?.unit))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 结构化输出可直接被程序消费 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ ledger: { 甲: 60, 乙: 40 } })
  for (const key of ['sum', 'total', 'diff', 'relative', 'closed', 'tolerance', 'suspicious', 'parts']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('parts 保留原始分项', Array.isArray(r.value?.parts) && r.value.parts.length === 2, '')
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 与 balance 的分工没被搞混 --')
// ───────────────────────────────────────────────────────────
{
  /** balance 是 demand/supply，ledger 是分项/总量。两者都调得到。 */
  const bal = await runMathTool({ operation: 'balance', balance: { grain: { demand: 100, supply: 120 } } })
  assert('balance 仍可用', bal.ok === true, txt(bal).slice(0, 50))
  const led = await runMathTool({ operation: 'ledger', ledger: { 甲: 60, 乙: 40 } })
  assert('ledger 可用', led.ok === true, '')
  /** 把 balance 的入参喂给 ledger 应报错（形态不同），不能静默算成别的。 */
  const cross = await runMathTool({ operation: 'ledger', ledger: { grain: { demand: 100, supply: 120 } } })
  assert('把 balance 形态喂给 ledger 不会静默算错',
    cross.ok === false || /没有可检查的分项/.test(txt(cross)),
    cross.ok ? 'ok=true 但分项被误读' : String(cross.error?.type))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
