/**
 * 本轮新增能力的三条守卫：未知参数不静默、displayPrecision 0 生效、括号错给定位。
 *
 * ## 为什么这三条要放在一起
 *
 * 它们都是「实测反馈暴露出来的静默类问题」，而且是同类：
 * **调用方以为某个东西生效了，实际没有**，或者**报错说了等于没说**。
 *
 * · 未知参数：`{expression:'1+3', foo:1}` 曾经静默成功并返回 3
 * · displayPrecision:0：曾经被当成「没给」，照旧输出 8 位
 * · 括号错：曾经只有一句「检查括号是否配对」，长公式等于没说
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-arg-guard-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(args) {
  const r = await run(args)
  return { text: String(r.result || ''), ok: r.ok, hint: r.error && r.error.hint, type: r.error && r.error.type }
}

console.log('-- 1. 认不出的参数名必须报错，绝不静默吞掉 --')
{
  const r = await call({ operation: 'evaluate', expression: '1+3', foo_bar_baz: 1 })
  assert('未知参数导致调用失败', !r.ok, '')
  assert('错误类型是 unknown_argument', r.type === 'unknown_argument', String(r.type))
  assert('点名是哪个参数', /foo_bar_baz/.test(r.text), r.text.slice(0, 80))
  assert('说清「本次没有生效」', /没有生效|已被忽略/.test(r.text), '')
}

console.log('-- 2. 文档提过但没做的参数，不能假装做了 --')
{
  const r1 = await call({ operation: 'evaluate', expression: '1/3', format: 'narrative' })
  assert('format 不静默', !r1.ok && /format/.test(r1.text), r1.text.slice(0, 60))
  const r2 = await call({ operation: 'evaluate', expression: '1/3', sigfigs: 4 })
  assert('sigfigs 不静默', !r2.ok && /sigfigs/.test(r2.text), r2.text.slice(0, 60))
}

console.log('-- 3. 大小写变体也报错（放行却不生效比报错更糟）--')
{
  const r = await call({ operation: 'evaluate', expression: '1/3', DisplayPrecision: 3 })
  assert('DisplayPrecision 报错而非静默', !r.ok && /DisplayPrecision/.test(r.text), r.text.slice(0, 60))
}

console.log('-- 4. 正常调用一个都不误伤 --')
{
  const cases = [
    ['基础求值', { operation: 'evaluate', expression: '1+1' }],
    ['批量', { operation: 'evaluate', expressions: ['1/7', '2+2'] }],
    ['terse', { operation: 'evaluate', expressions: ['1+1'], terse: true }],
    ['variables', { operation: 'evaluate', expression: 'm*2', variables: { m: 500 } }],
    ['world 顶层简写', { operation: 'world', starMass: 10 }],
    ['world 嵌套', { operation: 'world', world: { planetMass: 0.75 } }],
    ['units', { operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' }],
    ['workspace', { operation: 'workspace', action2: 'list' }],
    ['formula', { operation: 'formula', formula: 'escape_velocity', overrides: { M: 100, r: 1 } }],
    ['help', { operation: 'help' }],
  ]
  for (const [name, args] of cases) {
    const r = await call(args)
    assert('不误伤: ' + name, r.ok, r.ok ? '' : r.text.slice(0, 100))
  }
}

console.log('-- 5. world 顶层简写是合法输入（白名单不能只认接口）--')
{
  /**
   * 这条守的是白名单自身的一个坑：第一版只从 MathArgs 接口取键，
   * 而 starMass 等简写键**不在接口里**，于是合法调用被自己的校验拦下。
   */
  const r = await call({ operation: 'world', starMass: 10 })
  assert('world 顶层 starMass 可用', r.ok, r.text.slice(0, 60))
  const r2 = await call({ operation: 'world', starTemperatureTypo: 5000 })
  assert('world 里真拼错的键仍报错', !r2.ok, r2.text.slice(0, 60))
}

console.log('-- 6. displayPrecision: 0 是「0 位小数」，不是「没给」--')
{
  const zero = await call({ operation: 'evaluate', expression: '22/7', displayPrecision: 0 })
  assert('dp=0 生效（只留整数）', zero.ok && zero.text.trim() === '3', zero.text.slice(0, 40))
  const one = await call({ operation: 'evaluate', expression: '22/7', displayPrecision: 1 })
  assert('dp=1 得 3.1（对照）', one.ok && one.text.trim() === '3.1', one.text.slice(0, 40))
  const big = await call({ operation: 'evaluate', expression: '4140000*2204.62/2240', displayPrecision: 0 })
  assert('dp=0 取整后不带小数点', big.ok && /^4074610$/.test(big.text.trim()), big.text.slice(0, 40))
  const normal = await call({ operation: 'evaluate', expression: '1/7' })
  assert('不传时仍是默认 8 位', normal.ok && normal.text.trim() === '0.14285714', normal.text.slice(0, 40))
}

console.log('-- 7. 括号错要给位置与层级，不能只说「检查括号」--')
{
  const r = await call({ operation: 'evaluate', expression: '((1+2)/3' })
  assert('缺左括号：点名未闭合的位置', /第 1 字符/.test(r.hint || ''), String(r.hint).slice(0, 90))
  assert('给出可操作方向（补几个）', /补上/.test(r.hint || ''), '')

  const r2 = await call({ operation: 'evaluate', expression: '(1+2)/3)' })
  assert('多右括号：点名位置', /第 8 个字符/.test(r2.hint || ''), String(r2.hint).slice(0, 90))
  assert('提示多是前面漏了左括号', /漏了一个/.test(r2.hint || ''), '')

  const r3 = await call({ operation: 'evaluate', expression: '4*pi*(a*b)^1.6+(a*c)^1.6)/3)^(1/1.6)' })
  assert('长公式带层级标记', /括号层级/.test(r3.hint || ''), String(r3.hint).slice(0, 60))

  /**
   * ## 契约变更（2026-11-06）
   *
   * 旧行为：非括号类语法错一律落到通用提示「检查括号是否配对、运算符是否连续」。
   * 新行为：先认**具体误因**（千分位逗号 / 中文 / 运算符位置），
   * 都认不出才退到括号诊断与通用提示。
   *
   * 报告原话：「`1,000 * 2` 的真实原因是逗号，提示却说查括号 —— **误导**。」
   * 所以这条断言的**实质要求**变了：不再要求「说查括号」，
   * 而是要求「说出真正的误因」，同时**不允许**套用括号诊断（那才是旧的偷懒做法）。
   */
  const r4 = await call({ operation: 'evaluate', expression: '2+*3' })
  assert('非括号类语法错说出真实误因（运算符位置）', /运算符位置/.test(r4.hint || ''), String(r4.hint).slice(0, 60))
  assert('且不套用括号诊断', !/括号层级/.test(r4.hint || ''), '')
}

console.log('-- 8. 措辞不出现「错误/禁止/必须」（项目硬约束）--')
{
  const r = await call({ operation: 'evaluate', expression: '1+1', nonexistent_param: 1 })
  const wording = String(r.hint || '')
  assert('hint 不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(wording), wording.slice(0, 60))
  const r2 = await call({ operation: 'evaluate', expression: '((1+2)/3' })
  assert('括号诊断不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(String(r2.hint || '')), '')
}

console.log('-- 9. 新增单位可换算 --')
{
  const cases = [
    ['磅→长吨', { unitValue: 107000, unitFrom: 'lb', unitTo: 'longton' }, /47\.7|47\.77|1016/],
    ['psi→bar', { unitValue: 14.7, unitFrom: 'psi', unitTo: 'bar' }, /1\.0|6894|1013/],
    ['BTU→GJ', { unitValue: 1260000, unitFrom: 'BTU', unitTo: 'GJ' }, /1\.33|1055/],
    ['短吨→长吨', { unitValue: 1, unitFrom: 'shortton', unitTo: 'longton' }, /0\.89|907/],
    ['mmHg→Pa', { unitValue: 760, unitFrom: 'mmHg', unitTo: 'Pa' }, /1013|133/],
  ]
  for (const [name, args, re] of cases) {
    const r = await call({ operation: 'units', ...args })
    assert('换算可用: ' + name, r.ok && re.test(String(r.text)), r.ok ? String(r.text).split('\n')[2] : r.text.slice(0, 80))
  }
  const bad = await call({ operation: 'units', unitValue: 1, unitFrom: 'longton', unitTo: 'bar' })
  assert('跨量纲仍报错', !bad.ok, bad.text.slice(0, 60))
}

console.log('-- 10. help 含 derivation 全部子命令与账本闭合配方 --')
{
  const h = String((await run({ operation: 'help' })).result || '')
  assert('help 列出 derivation', /derivation/.test(h), '')
  assert('help 含继承参数名', /inherit/i.test(h), '')
  assert('help 含账本闭合配方', /账本闭合/.test(h), '')
  assert('help 总长仍受控', h.length <= 6000, String(h.length))
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
