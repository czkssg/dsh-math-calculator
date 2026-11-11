/**
 * interval（区间运算）的测试。
 *
 * ## 为什么这个能力的测试要特别严
 *
 * 反馈包 15 号的核心判断：
 * > 点值运算会把区间硬压成单值，**这正是 AI 推演失真的源头之一**。
 *
 * 所以本套件重点验三件事：
 *
 *   ① **端点算术正确**（尤其乘法的四点验证 —— 只取两端的实现在负区间上会错）
 *   ② **不确定度分档说得出口径**（相对半宽 → 能不能写进设定）
 *   ③ **不猜分布**：只知道上下界时，不许假装知道「中间最可能是什么」
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-interval-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

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

const run = (interval) => runMathTool({ operation: 'interval', interval })
const txt = (r) => String(r.result ?? '')
/** 浮点比较：区间运算会有尾差，不能要求精确相等。 */
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 1e-9)

// ───────────────────────────────────────────────────────────
console.log('-- 1. 四则运算的端点算术 --')
// ───────────────────────────────────────────────────────────
{
  const add = await run({ a: [20, 50], op: '+', b: [10, 20] })
  assert('加法 [20,50]+[10,20] = [30,70]', add.value?.low === 30 && add.value?.high === 70,
    `[${add.value?.low},${add.value?.high}]`)

  const sub = await run({ a: [20, 50], op: '-', b: [10, 20] })
  assert('减法 [20,50]−[10,20] = [0,40]', sub.value?.low === 0 && sub.value?.high === 40,
    `[${sub.value?.low},${sub.value?.high}]`)

  const mul = await run({ a: [21, 25], op: '*', b: [2000, 2500] })
  assert('乘法 [21,25]×[2000,2500] = [42000,62500]',
    mul.value?.low === 42000 && mul.value?.high === 62500,
    `[${mul.value?.low},${mul.value?.high}]`)

  const div = await run({ a: [100, 200], op: '/', b: [2, 4] })
  assert('除法 [100,200]÷[2,4] = [25,100]',
    div.value?.low === 25 && div.value?.high === 100,
    `[${div.value?.low},${div.value?.high}]`)
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 负区间乘法必须验四个端点 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这是本套件最重要的一条。
   *
   * 只取两端 `low*low` 与 `high*high` 的实现会给出 **[3, 8]**，
   * 而正确答案是 **[-12, 8]** —— 漏了 −12 与 −2 两个交叉项。
   *
   * 后果：一个本该「可能为负」的结果被报成「恒为正」，
   * 而 AI 会照着正数继续推演。
   */
  const neg = await run({ a: [-2, 3], op: '*', b: [-4, 1] })
  assert('[-2,3]×[-4,1] = [-12,8]（四点验证）',
    neg.value?.low === -12 && neg.value?.high === 8,
    `[${neg.value?.low},${neg.value?.high}]，只取两端会得 [3,8]`)

  const bothNeg = await run({ a: [-3, -1], op: '*', b: [-2, -1] })
  assert('双负区间 [-3,-1]×[-2,-1] = [1,6]',
    bothNeg.value?.low === 1 && bothNeg.value?.high === 6,
    `[${bothNeg.value?.low},${bothNeg.value?.high}]`)

  /** 跨零结果必须被标出来 —— 符号都不确定，不能写成「一定是正数」。 */
  assert('跨零结果被标记', neg.value?.crossesZero === true, String(neg.value?.crossesZero))
  assert('文本明说跨零', /跨零/.test(txt(neg)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 除法：除数跨零必须报错 --')
// ───────────────────────────────────────────────────────────
{
  const bad = await run({ a: [1, 2], op: '/', b: [-1, 1] })
  assert('除数跨零报错', bad.ok === false, String(bad.ok))
  assert('报错说清了为什么', /跨零|无界/.test(bad.error?.message ?? ''), bad.error?.message?.slice(0, 40))
  assert('报错给了修法', /缩小|反比|乘方/.test(bad.error?.hint ?? ''), '')

  /** 除数恰好从 0 开始也要拦（0 作除数）。 */
  const fromZero = await run({ a: [1, 2], op: '/', b: [0, 2] })
  assert('除数含 0 也拦', fromZero.ok === false, String(fromZero.ok))

  /** 全正除数正常。 */
  const ok = await run({ a: [1, 2], op: '/', b: [1, 4] })
  assert('全正除数正常', ok.ok === true && near(ok.value?.low, 0.25), String(ok.value?.low))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 输入形态（最自然的写法都要认） --')
// ───────────────────────────────────────────────────────────
{
  const bracket = await run({ expr: '[20,50] * [2000,2500]' })
  assert('方括号形态 "[20,50] * [2000,2500]"', bracket.ok === true && bracket.value?.low === 40000,
    String(bracket.value?.low))

  const dash = await run({ expr: '20-50 * 2000-2500' })
  assert('连字符形态', dash.ok === true && dash.value?.low === 40000, String(dash.value?.low))

  const tilde = await run({ a: '20~50', op: '*', b: '2~3' })
  assert('波浪形态', tilde.ok === true && tilde.value?.low === 40, String(tilde.value?.low))

  const cn = await run({ a: '20 到 50', op: '*', b: '2 到 3' })
  assert('中文「到」形态', cn.ok === true && cn.value?.low === 40, String(cn.value?.low))

  const obj = await run({ a: { low: 20, high: 50 }, op: '*', b: { low: 2, high: 3 } })
  assert('对象形态 {low,high}', obj.ok === true && obj.value?.low === 40, String(obj.value?.low))

  const scalar = await run({ a: 20, op: '*', b: 3 })
  assert('单值当退化区间', scalar.ok === true && scalar.value?.low === 60 && scalar.value?.high === 60, '')

  /** 上下界写反了要自动纠正，不能算成负区间。 */
  const reversed = await run({ a: [50, 20], op: '+', b: [0, 0] })
  assert('上下界写反自动纠正', reversed.value?.low === 20 && reversed.value?.high === 50,
    `[${reversed.value?.low},${reversed.value?.high}]`)
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 不确定度分档（这是区间相对点值多出来的唯一信息） --')
// ───────────────────────────────────────────────────────────
{
  /** ±5% 以内：可以直接写进设定。 */
  const tight = await run({ a: [95, 105], op: '*', b: [1, 1] })
  assert('±5% 判「较紧」', /较紧/.test(txt(tight)), '')
  assert('相对半宽约 5%', Math.abs((tight.value?.relativeHalfWidth ?? 0) - 0.05) < 0.01,
    String(tight.value?.relativeHalfWidth))

  /** ±20% 左右：建议给区间。 */
  const mid = await run({ a: [80, 120], op: '*', b: [1, 1] })
  assert('±20% 判「中等」', /中等/.test(txt(mid)), '')

  /** ±50% 左右：只适合当量级。 */
  const loose = await run({ a: [50, 150], op: '*', b: [1, 1] })
  assert('±50% 判「较松」', /较松/.test(txt(loose)), '')

  /** 极宽：只能当方向。 */
  const wide = await run({ a: [1, 100], op: '*', b: [1, 1] })
  assert('极宽判「很松」', /很松/.test(txt(wide)), '')

  /** 点值（宽度 0）不该报「把握」，因为没有不确定度可报。 */
  const point = await run({ a: [5, 5], op: '+', b: [0, 0] })
  assert('点值不出把握分档', !/把握/.test(txt(point)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 阈值判定：跨过门槛时必须说「可能成立可能不成立」 --')
// ───────────────────────────────────────────────────────────
{
  /** 整个区间在门槛下方。 */
  const below = await run({ a: [10, 20], op: '+', b: [0, 0], against: 25 })
  assert('全在门槛下方', below.value?.verdict === 'below', String(below.value?.verdict))

  /** 整个区间在门槛上方。 */
  const above = await run({ a: [30, 40], op: '+', b: [0, 0], against: 25 })
  assert('全在门槛上方', above.value?.verdict === 'above', String(above.value?.verdict))

  /** 跨过门槛：结论取决于取哪一端 —— 这时不能给确定结论。 */
  const cross = await run({ a: [20, 50], op: '+', b: [0, 0], against: 25 })
  assert('跨过门槛', cross.value?.verdict === 'crosses', String(cross.value?.verdict))
  assert('跨门槛时明说「可能成立可能不成立」', /可能成立|可能不成立/.test(txt(cross)), '')
  assert('跨门槛时要求更窄输入', /更窄/.test(txt(cross)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 不猜分布 / 不越权 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ a: [20, 50], op: '+', b: [0, 0] })
  /**
   * 中点只是算术中点，**不是「最可能的值」**。
   * 只说 mid，不说「期望/最可能」——那是编的。
   */
  assert('用「中点」而不是「期望值」', /中点/.test(txt(r)) && !/期望值|最可能/.test(txt(r)), '')
  assert('不声明概率分布', !/正态|均匀分布|置信/.test(txt(r)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ a: [21, 25], op: '*', b: [2000, 2500], unit: '元' })
  for (const key of ['low', 'high', 'mid', 'halfWidth', 'relativeHalfWidth', 'crossesZero', 'input']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('单位进结构化字段', r.value?.unit === '元', String(r.value?.unit))
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 错误处理 --')
// ───────────────────────────────────────────────────────────
{
  const noInput = await runMathTool({ operation: 'interval' })
  assert('完全不给区间时报错', noInput.ok === false, String(noInput.ok))

  const badArray = await run({ a: [1, 2, 3], op: '+', b: [0, 0] })
  assert('三元数组报错', badArray.ok === false, String(badArray.ok))

  const badOp = await run({ a: [1, 2], op: '^', b: [2, 3] })
  assert('不认识的运算符报错', badOp.ok === false, String(badOp.ok))
  assert('报错列出支持的运算符', /\+|−|×|÷|加|减|乘|除/.test(badOp.error?.hint ?? ''), '')

  const badExpr = await run({ expr: '完全不是表达式' })
  assert('无法解析的 expr 报错', badExpr.ok === false, String(badExpr.ok))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
