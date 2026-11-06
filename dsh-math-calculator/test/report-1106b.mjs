/**
 * 2026-11-06 第二份实测反馈（99 层架空世界观设定推演）。
 *
 * 这份报告的 P0 是「中文量级词不支持」—— 而这正是上一轮修中文单位时**漏掉的一环**：
 * 单位表里收了「里/丈/亩/斤」，却没收入「万/亿/万亿」。
 *
 * 报告作者两次把「吨」当成「亿吨」，起因就是必须手写 `/1e8`：
 * **「两步除法」是错误源**，而工具原本可以替他消掉这一步。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-rpt1106b-'))
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

console.log('-- 1. 中文量级词（报告 P0）--')
{
  const cases = [
    ['2.66亿 * 330', /^87780000000$/, '亿 = 10⁸'],
    ['1.5万', /^15000$/, '万 = 10⁴'],
    ['3万亿', /^3000000000000$/, '长词优先，万亿 = 10¹²'],
    ['2.66亿人', /^266000000$/, '人 是计数说明词，不参与运算'],
    /**
     * 2.66 亿吨 = 2.66×10⁸ × 1000 kg = 2.66×10¹¹ kg = 266 Tg。
     * 断言写成「含 266 且末尾补出亿吨参照」——那正是量级词闭环的样子：
     * 输入用「亿吨」，输出用 SI 前缀，并注回中文量级。
     */
    /**
     * 2.66 亿吨 = 2.66×10¹¹ kg = 2.66e8 t = **266 Mt**。
     *
     * 质量先归到「吨」档（不会给 `Tg` 这种冷门组合），
     * 再在吨上叠 SI 前缀升到 Mt —— `266 Mt`（2.66 亿吨）是可读写法。
     */
    ['2.66亿吨', /^266 Mt$/, '亿吨 = 亿 + 吨，升到 Mt 档'],
  ]
  for (const [expr, re, note] of cases) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('量级词可算: ' + expr, re.test(t), t + '  (' + note + ')')
  }
  /**
   * 报告里最重要的那条：比值必须**无量纲**。
   * 踩过：展开成 `(450 * 1e8) * 1000 kg / (31.39 * 1e8) * 1000 kg`，
   * 乘除左结合变成先除再乘，结果带 `Mg^2` 量纲 —— 数值对、量纲错。
   */
  const ratio = (await text({ operation: 'evaluate', expression: '450 亿吨 / 31.39 亿吨' })).trim()
  assert('亿吨比值无量纲', !/kg|Mg|g\b/.test(ratio), ratio)
  assert('亿吨比值数值正确', Math.abs(Number(ratio) - 14.3358) < 0.001, ratio)
}

console.log('-- 2. 数字数组不再静默失败（报告 P0）--')
{
  const r = await run({ operation: 'evaluate', expressions: [0.5, 9.9, 10] })
  assert('数字元素被接受', r.ok === true, '')
  assert('三条都算出', /0\.5 = 0\.5/.test(String(r.result)) && /10 = 10/.test(String(r.result)), '')
}

console.log('-- 3. 非法变量键不再中止整批（报告 P1）--')
{
  const r = await run({ operation: 'evaluate', expressions: ['P*330', 'Q+1'], variables: { P: 1000, Q: 5, 人口: 1 } })
  assert('粗体：合法算式仍然算出', r.ok === true, String(r.ok))
  assert('P*330 = 330000', /330000/.test(String(r.result)), '')
  assert('告知哪个键被跳过', /人口/.test(String(r.notice)), String(r.notice).slice(0, 60))
  /** 单条路径也要有这条提示 */
  const single = await run({ operation: 'evaluate', expression: 'P*2', variables: { P: 10, 粮食: 1 } })
  assert('单条也告知', /粮食/.test(String(single.notice)), '')
}

console.log('-- 4. 语法错误给子类型与位置（报告 P1）--')
{
  const comma = await run({ operation: 'evaluate', expression: '1,000 * 2' })
  assert('千分位逗号被识别', /千分位逗号/.test(String(comma.error && comma.error.hint)), '')
  const opAt = await run({ operation: 'evaluate', expression: '/ 112.5e8' })
  assert('运算符位置被识别', /运算符位置/.test(String(opAt.error && opAt.error.hint)), '')
  const cn = await run({ operation: 'evaluate', expression: '某中文*2' })
  /**
   * 这条是本次修的最隐蔽的一个 bug：
   * 旧正则写的是 `SyntaxError`（无空格），而 mathjs 报的是 `Syntax error`（有空格），
   * 于是这类错误落到兜底分支 —— 类型对、但没有任何 hint。
   * 靠对照实验才揪出来（`1+*2` 有提示而 `某中文*2` 没有）。
   */
  assert('中文语法错给提示（Syntax error 也要命中）', /中文/.test(String(cn.error && cn.error.hint)), '')
  const paren = await run({ operation: 'evaluate', expression: '(1+2)/3)' })
  assert('括号诊断仍然工作', /没有对应的左括号/.test(String(paren.error && paren.error.hint)), '')
}

console.log('-- 5. 质量 SI 前缀补中文量级参照（报告 P1）--')
{
  /**
   * 质量归到吨档后升 SI 前缀：`2.66e8*330 kg` = 8778 万吨 = **87.78 Mt**。
   * 不再出现 `Tg`（太克）—— 那正是要修的问题。
   */
  const t = (await text({ operation: 'evaluate', expression: '2.66e8*330 kg' })).trim()
  assert('大质量给 Mt 而不是太克', /Mt$/.test(t) && !/Tg|Gg|Pg/.test(t), t)
  /** 低量级不注（注了反而吵） */
  const low = (await text({ operation: 'evaluate', expression: '1e9 g' })).trim()
  assert('Gg 不注（1000 吨本就好懂）', !/（=/.test(low), low)
  /** 非质量单位不注 */
  const km = (await text({ operation: 'evaluate', expression: '3 km' })).trim()
  assert('长度单位不注', !/（=/.test(km), km)
}

console.log('-- 6. 大整数补千分位（报告 P2）--')
{
  /**
   * 批量的显示行补千分位分组（纯视觉，不改值）。
   * 单条的 `result` 数据通道保持完整整数 —— 两条断言一起守。
   */
  const t = (await text({ operation: 'evaluate', terse: true, expressions: [{ label: 'x', expr: '1e20*3' }] }))
  assert('大数带千分位', /300,000,000,000,000,000,000/.test(t), t.slice(0, 90))
  /** 数据通道必须干净：整数一位不少、不加逗号、不改科学计数法 */
  const r = await run({ operation: 'evaluate', expression: '10^20+5' })
  assert('result 数据通道不加逗号', r.result.trim() === '100000000000000000005', String(r.result))
}

console.log('-- 6.5 三角函数弧度提示（报告 P2）--')
{
  /**
   * 中文工程语境里 `sin(30)` 的默认读法是 30 度，而工具按弧度给 `-0.988`——
   * 数字看着正常，用户不会察觉。这条走 `notice`，不动 `result`。
   */
  const r = await run({ operation: 'evaluate', expression: 'sin(30)' })
  assert('裸数字角度给弧度提示', /弧度/.test(String(r.notice)), '')
  assert('result 保持干净', r.result.trim() === '-0.98803162', String(r.result))
  /** 判据要保守：这三类不该注 */
  const deg = await run({ operation: 'evaluate', expression: 'sin(30 deg)' })
  assert('写了 deg 就不注', !/弧度/.test(String(deg.notice || '')), '')
  const zero = await run({ operation: 'evaluate', expression: 'sin(0)' })
  assert('sin(0) 不注（两种单位下都是 0）', !/弧度/.test(String(zero.notice || '')), '')
  const huge = await run({ operation: 'evaluate', expression: 'sin(1e6)' })
  assert('超角度范围的裸数字不注', !/弧度/.test(String(huge.notice || '')), '')
  /** 提示里要用实际函数名，不能硬写 sin */
  const cos = await run({ operation: 'evaluate', expression: 'cos(45)' })
  assert('提示用的是实际函数名', /cos\(45\)/.test(String(cos.notice)), String(cos.notice).slice(0, 50))
}

console.log('-- 7. 既有能力一个不能坏 --')
{
  const cases = [
    ['(10^20 + 1) - 10^20', /^1$/],
    ['2**3', /^8$/],
    ['sin(30 deg)', /^0\.5$/],
    ['1 里 + 3 米', /^503 m$/],
    ['5 亩 + 100 m²', /^3433/],
    ['9.81 m/s^2', /9\.81/],
    ['5 cm to inch', /inch/],
  ]
  for (const [expr, re] of cases) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('不坏: ' + expr, re.test(t), t.slice(0, 40))
  }
  const solve = await text({ operation: 'solve', expression: 'x^2-5x+6=0' })
  assert('solve 仍给精确解', /x = 2|2，3|2, 3/.test(solve.replace(/\s/g, ' ')), solve.slice(0, 60))
  /** 登记过的中文单位换算仍要能用 */
  const u = await run({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('units 里→km 仍可用', u.ok === true && /15 km/.test(String(u.result)), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
