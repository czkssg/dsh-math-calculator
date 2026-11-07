/**
 * 2026-11-07 实测反馈报告（第三份：《使用问题与改进建议》）。
 *
 * 这份报告的落点是「工具把安全性放在了错误的位置：它校验式子能不能算，
 * 却不校验结果对不对」。所以本套守的是**三对语义必须一致**：
 *
 *   1. 单条与批量对「非有限值」的判断必须一致（报告的 P0-2）
 *   2. 写出来的目标单位必须真的生效（本轮实测发现回归）
 *   3. to 的内部报错必须分类到可行动的提示（报告的 P1-4）
 *
 * 另有两条本轮实测发现、报告没提的：
 *   · `(1/0)*2 kg` 这类带单位非有限值溜过了单条检查
 *   · `evaluate` 与 `units` 两套单位表没打通（报告 P1-5 说对了一半）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-rpt1107-'))
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

console.log('-- 1. 单条与批量对非有限值的判断必须一致（报告 P0-2）--')
{
  /**
   * 报告原文：「单条调用会拦住 1/0；批量调用却宣告『4 条全部求值成功』，
   * 其中就包括 1/0 和 log(0)」。
   *
   * 这是本报告最核心的一条：同一个式子换个调用方式就从「错」变成「对」，
   * 而批量恰恰是 AI 最常用的形态。
   */
  for (const expr of ['1/0', 'log(0)', '0/0']) {
    const one = await run({ operation: 'evaluate', expression: expr })
    assert('单条 ' + expr + ' 报错', one.ok === false, '')
    assert('单条 ' + expr + ' 类型是 non_finite',
      one.error && one.error.type === 'non_finite', String(one.error && one.error.type))

    const batch = await run({ operation: 'evaluate', expressions: [expr] })
    assert('批量 ' + expr + ' 也报错（与单条一致）', batch.ok === false,
      'ok=' + batch.ok + ' result=' + String(batch.result).slice(0, 50))
  }

  /** 成败计数必须如实：报告问题 3 说「两套判定标准」。 */
  const mixed = await run({ operation: 'evaluate', expressions: ['1+1', '1/0', 'sqrt(-1)', 'log(0)'] })
  assert('混合批 ok=false', mixed.ok === false, String(mixed.ok))
  assert('混合批 partial=true', mixed.partial === true, String(mixed.partial))
  assert('混合批 failed=2', mixed.failed === 2, String(mixed.failed))
  assert('混合批 succeeded=2', mixed.succeeded === 2, String(mixed.succeeded))
  assert('混合批正文不宣称全部成功', !/算式全部求值成功/.test(String(mixed.result)),
    String(mixed.result).slice(-40))

  /** 复数不算非有限 —— sqrt(-1) 是 0+1i，那是正常结果。 */
  const complex = await run({ operation: 'evaluate', expressions: ['sqrt(-1)', '2i+3'] })
  assert('复数是正常结果，不算失败', complex.ok === true, String(complex.result).slice(0, 50))

  /** 有限的大数不能被误判：1e400 转双精度才溢出，BigNumber 自己是有限的。 */
  for (const expr of ['1e400', '2^1024']) {
    const big = await run({ operation: 'evaluate', expression: expr })
    assert('有限大数 ' + expr + ' 不误判', big.ok === true,
      big.ok ? String(big.result).slice(0, 20) : String(big.error && big.error.type))
  }

  /**
   * 带单位的非有限值 —— 报告没提，本轮实测发现的。
   *
   * `containsNonFinite` 只认**恰好等于** "Infinity" 的字符串，
   * 而 `Infinity g` 不是。于是 (1/0)*2 kg 宣告成功。
   */
  for (const expr of ['(1/0)*2 kg', '(2/0) kg to g', '1/0*1 s']) {
    const r = await run({ operation: 'evaluate', expression: expr })
    assert('带单位非有限 ' + expr + ' 报错', r.ok === false,
      r.ok ? String(r.result).slice(0, 40) : '')
  }
  const unitBatch = await run({ operation: 'evaluate', expressions: ['2 kg', '(1/0)*2 kg'] })
  assert('带单位非有限在批量里也报错', unitBatch.ok === false, String(unitBatch.ok))

  /** terse 也不能藏：省的是标题与统计，不是风险。 */
  const terseBatch = await run({ operation: 'evaluate', terse: true, expressions: ['1+1', '1/0'] })
  assert('terse 批量仍如实报失败', terseBatch.ok === false, String(terseBatch.ok))
  assert('terse 批量写明哪条失败', /失败\[non_finite\]/.test(String(terseBatch.result)),
    String(terseBatch.result).slice(0, 60))
}

console.log('-- 2. 写出来的目标单位必须真的生效（本轮回归）--')
{
  /**
   * 这一条是本次最难发现的回归：单位归位（`normalizeUnitPrefix`）不看用户意图，
   * 只看 `unit.value`，把**显式换算的目标**按阶梯重新挑了一遍 —— 恰好挑回出发点。
   *
   * ```
   *   2 m to cm   →  200 cm   （mathjs 算对了）
   *               →  2 m      （归位把它改回来了）
   * ```
   *
   * 数字看着完全合法（2 m 是个正经长度），所以不会有人怀疑。
   */
  const conversions = [
    ['2 m to cm', /^200 cm$/],
    ['1 t to kg', /^1000 kg$/],
    ['1 km to m', /^1000 m$/],
    ['2.5 m to mm', /^2500 mm$/],
    ['0.5 m to cm', /^50 cm$/],
    ['2000 m to km', /^2 km$/],
    ['1 kg to g', /^1000 g$/],
  ]
  for (const [expr, re] of conversions) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('显式换算生效: ' + expr, re.test(t), t)
  }

  /** 批量的每一条也各自尊重自己的目标单位。 */
  const batchConv = await text({ operation: 'evaluate', expressions: ['2 m to cm', '1 t to kg'] })
  assert('批量里换算也生效', /200 cm/.test(batchConv) && /1000 kg/.test(batchConv),
    batchConv.split('\n').filter(Boolean)[1] ?? '')

  /**
   * 反向对照：**没写**目标单位时必须照旧归位。
   * 否则「尊重显式单位」会退化成「一律不归位」，那上一轮的工作就白做了。
   */
  assert('未写单位仍归位: 1e6 m', /^1 Mm$/.test((await text({ operation: 'evaluate', expression: '1e6 m' })).trim()), '')
  assert('未写单位仍归位: 1e12 g', /^1 Mt$/.test((await text({ operation: 'evaluate', expression: '1e12 g' })).trim()), '')
  assert('未写单位仍归位: 2.66e8*330 kg', /^87.78 Mt$/.test((await text({ operation: 'evaluate', expression: '2.66e8*330 kg' })).trim()), '')

  /**
   * 显式换算时小数位也必须按 displayPrecision 收。
   *
   * 归位路径走 `formatScalar` 只给 6 位，掩盖了「Unit 值不过 displayPrecision」；
   * 一旦跳开归位，`5 cm to inch` 会吐出 21 位小数。
   */
  const inch = (await text({ operation: 'evaluate', expression: '5 cm to inch' })).trim()
  const decimals = inch.split(' ')[0].split('.')[1] ?? ''
  assert('显式换算的小数位被收住', decimals.length <= 10, inch)

  /** 面积/体积这类「基准本身带幂」的维度不能被注入的单位改写（见下节）。 */
  assert('面积基准不变: 1 m^2', /^1 m\^2$/.test((await text({ operation: 'evaluate', expression: '1 m^2' })).trim()), String((await text({ operation: 'evaluate', expression: '1 m^2' })).trim()))
  assert('体积基准不变: 2 m^3', /^2 m\^3$/.test((await text({ operation: 'evaluate', expression: '2 m^3' })).trim()), String((await text({ operation: 'evaluate', expression: '2 m^3' })).trim()))
  assert('速度基准不变: 9.81 m/s^2', /^9\.81 m \/ s\^2$/.test((await text({ operation: 'evaluate', expression: '9.81 m/s^2' })).trim()), '')
}

console.log('-- 3. to 的报错必须分类到可行动的提示（报告 P1-4）--')
{
  /**
   * 报告问题 6：`(0.907 kg / (10 hp * 0.475)) to min` 报
   * `[internal] Unexpected type of argument in function to`。
   *
   * `internal` 在本项目的约定里意思是**工具自己坏了** —— 会让人去重试。
   * 而真实原因全是写法问题，四类各有各的修法。
   */
  const conflict = await run({ operation: 'evaluate', expression: '1 s to min' })
  assert('min 撞函数名时给出专属类型', conflict.error && conflict.error.type === 'unit_name_conflict',
    String(conflict.error && conflict.error.type))
  assert('并给出替代写法', /minute|hour|second|units/.test(String(conflict.error && conflict.error.hint)),
    String(conflict.error && conflict.error.hint).slice(0, 70))

  const notQuantity = await run({ operation: 'evaluate', expression: '(1/0) to kW' })
  assert('裸数字换算给出 not_a_quantity', notQuantity.error && notQuantity.error.type === 'not_a_quantity',
    String(notQuantity.error && notQuantity.error.type))
  assert('并说明该用 units', /units/.test(String(notQuantity.error && notQuantity.error.hint)),
    String(notQuantity.error && notQuantity.error.hint).slice(0, 60))

  /** 任何 to 的错误都不该再落进 internal。 */
  for (const expr of ['5 to s', '0.5 to kW', 'sqrt(-1) to kW', '(1+2) to kW']) {
    const r = await run({ operation: 'evaluate', expression: expr })
    assert('to 的错误不再标 internal: ' + expr,
      !(r.error && r.error.type === 'internal'), String(r.error && r.error.type))
  }

  /** 正常换算不受影响。 */
  assert('正常换算仍然成功', (await text({ operation: 'evaluate', expression: '5 cm to inch' })).includes('inch'), '')
}

console.log('-- 4. 两套单位表打通（报告 P1-5）--')
{
  /**
   * 报告问题 7 列的正是这些：`mph`/`kn`/`rpm`/`inHg` 在 `units` 里认得、
   * 在 `evaluate` 里报 Undefined symbol。
   *
   * 危险在于：表不通就逼人**手填系数**（`10*745.7`），而那正是报告那四起
   * 千倍级事故的共同源头。
   */
  const engineering = [
    ['1 mph to m/s', /^0\.44704/],
    ['1 kn to m/s', /^0\.514444/],
    ['1 rpm to Hz', /^0\.0166666/],
    ['1 inHg to Pa', /^3386\.389/],
    ['1 cal to J', /^4\.184/],
    ['1 kcal to J', /^4184/],
    ['1 gauss to T', /^1e-4/],
    ['1 slug to kg', /^14\.59/],
    ['1 shortton to kg', /^907\.18/],
    ['1 longton to kg', /^1016\.04/],
    ['1 ha to m^2', /^10000/],
  ]
  for (const [expr, re] of engineering) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('工程单位可用: ' + expr, re.test(t), t)
  }

  /** 报告里那条真实算式：320 lbf * 8 mph to kW —— 以前 mph 不认，整条算不了。 */
  const reportCase = await text({ operation: 'evaluate', expression: '320 lbf * 8 mph to kW' })
  assert('报告里的复合算式能算', /kW|W/.test(reportCase), reportCase.trim())

  /**
   * 注入的三条取舍必须守住：
   *   · 单字母单位不收（否则变量 c/G 被吃掉）
   *   · 既有单位不被改写
   *   · 函数名不被覆盖
   */
  assert('单字母变量 c 不被当单位', (await run({ operation: 'evaluate', expression: 'c^2' })).ok === false, '')
  assert('单字母常量 G 不被当单位', (await run({ operation: 'evaluate', expression: 'G*2' })).ok === false, '')
  assert('既有单位 hp 不被改写', /^745\.6998715/.test((await text({ operation: 'evaluate', expression: '1 hp to W' })).trim()),
    String((await text({ operation: 'evaluate', expression: '1 hp to W' })).trim()))
  assert('既有单位 psi 不被改写', /^6894\.757/.test((await text({ operation: 'evaluate', expression: '1 psi to Pa' })).trim()), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)