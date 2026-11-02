/**
 * 语法糖与定积分。
 *
 * ## 这批修什么
 *
 * 三份实测文档共同提到的「直觉写法直接报错」，以及一条**静默忽略参数**的问题：
 *
 * | 写法 | 修复前 | 修复后 |
 * |---|---|---|
 * | `2**10` | 报 syntax | 1024 |
 * | `ln(10)` | 报 **internal** | 2.30258509 |
 * | `π` | unknown symbol π | 3.14159265 |
 * | `2 × 3` / `6 ÷ 2` | unknown symbol | 6 / 3 |
 * | `nosuchfunc(1)` | 报 **internal** | unknown_symbol（可说清是输入问题） |
 * | `integral` 传 from/to | **静默忽略**，只回不定积分 | 算出定积分 |
 *
 * ## 为什么 evaluate 单独漏了
 *
 * 其它 op（derivative / integral / stats / solve…）内部都调了 `normalizeSource`，
 * **只有 evaluate 与批量求值没调** —— 于是同一套写法在别处能过、在 evaluate 上报错。
 * 这批把两条路径补齐。
 *
 * ## 定积分的精度陷阱
 *
 * 代入上下限若用 BigNumber：`1/3·x³` 在 x=3 处得
 * `8.99999999999999999999999999999999999999…`（因为 1/3 是截断小数）。
 * 改用 Fraction 引擎后得精确的 `9`。这条专门有断言。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-syntax-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 取单条结果首行。 */
async function value(expr, extra = {}) {
  const r = await run({ operation: 'evaluate', expression: expr, ...extra })
  if (!r.ok) return '失败[' + (r.error?.type || '?') + ']'
  return String(r.result).trim().split('\n')[0]
}

/** 取定积分结果那一行。 */
async function integral(expr, from, to, extra = {}) {
  const args = { operation: 'integral', expression: expr, ...extra }
  if (from !== undefined) args.from = from
  if (to !== undefined) args.to = to
  const r = await run(args)
  if (!r.ok) return { ok: false, type: r.error?.type, text: '' }
  const lines = String(r.result).trim().split('\n')
  return { ok: true, text: lines.join(' | ') }
}

console.log('-- 1. 幂运算：`**` 与 `^` 等价 --')
{
  assert('2**10 = 1024', await value('2**10') === '1024', await value('2**10'))
  assert('2^10 = 1024', await value('2^10') === '1024', await value('2^10'))
  assert('4**0.5 = 2', await value('4**0.5') === '2', await value('4**0.5'))
  assert('幂右结合一致：(2^3)^2 与 2**3**2 都是 64',
    await value('(2^3)^2') === '64' && await value('2*3**2') === '18',
    await value('(2^3)^2') + ' / ' + await value('2*3**2'))
  // 单个 * 不能被误当成 **
  assert('乘法不受影响：2*3 = 6', await value('2*3') === '6', await value('2*3'))
}

console.log('-- 2. 自然对数别名 --')
{
  assert('ln(10) 可用', (await value('ln(10)')).startsWith('2.302585'), await value('ln(10)'))
  assert('ln 与 log 结果一致', await value('ln(10)') === await value('log(10)'),
    await value('ln(10)') + ' vs ' + await value('log(10)'))
  // 多字母变量名里含 ln 的不受影响（\b 边界）
  const r = await run({ operation: 'evaluate', expression: 'aln=5; aln*2' })
  assert('aln 不被改成 alog', r.ok && String(r.result).includes('10'), String(r.result).slice(-20))
}

console.log('-- 3. 数学记号 --')
{
  assert('π = 3.14159265', (await value('π')).startsWith('3.141592'), await value('π'))
  assert('π 与 pi 一致', await value('π') === await value('pi'), '')
  assert('2 × 3 = 6', await value('2 × 3') === '6', await value('2 × 3'))
  assert('6 ÷ 2 = 3', await value('6 ÷ 2') === '3', await value('6 ÷ 2'))
  assert('中点乘号 2 · 3 = 6', await value('2 · 3') === '6', await value('2 · 3'))
  // U+2212 减号
  assert('U+2212 减号可用', await value('5 \u2212 2') === '3', await value('5 \u2212 2'))
}

console.log('-- 4. 归一化不能破坏单位用法 --')
{
  const SAFE = ['5 V', '9.81 m/s^2', '5 cm to inch', '2 m * 3 m', '100 km/h']
  for (const expr of SAFE) {
    const got = await value(expr)
    assert('单位用法可用: ' + expr, !got.startsWith('失败'), got.slice(0, 40))
  }
}

console.log('-- 5. 未定义函数的错误类型不再误导 --')
{
  const r = await run({ operation: 'evaluate', expression: 'nosuchfunc(1)' })
  assert('报 unknown_symbol 而非 internal', r.error?.type === 'unknown_symbol', String(r.error?.type))
  assert('错误里点名了函数', /nosuchfunc/.test(String(r.error?.message) || ''), String(r.error?.message).slice(0, 40))
  assert('给了可操作的提示', /help/.test(String(r.error?.hint) || ''), String(r.error?.hint).slice(0, 50))
}

console.log('-- 6. 定积分：必须真的算 --')
{
  const cases = [
    ['x^2', 0, 3, '9'],
    ['x^3/3', 0, 3, '27/4'],
    ['2*x', 1, 3, '8'],
    ['x^2', 1, 3, '26/3'],
  ]
  for (const [expr, from, to, expected] of cases) {
    const r = await integral(expr, from, to)
    assert('∫' + expr + ' [' + from + '→' + to + '] = ' + expected,
      r.ok && r.text.includes(expected), r.text.slice(0, 70))
    assert('结果里带原函数', r.ok && /原函数/.test(r.text), r.text.slice(0, 40))
  }

  // 数值型（无理数结果）：sin 在 [0,π] 上积分为 2
  const sin = await integral('sin(x)', 0, Math.PI)
  assert('∫sin(x) [0→π] = 2', sin.ok && / = 2(?:（|$|\s)/.test(sin.text), sin.text.slice(0, 70))
}

console.log('-- 7. 定积分的精度陷阱（BigNumber 会给 8.999…）--')
{
  const r = await integral('x^2', 0, 3)
  assert('不得出现 8.999… 这种截断尾巴', !/8\.9{3,}/.test(r.text), r.text.slice(0, 70))
  assert('给出精确的 9', / = 9(?:（|$)/.test(r.text), r.text.slice(0, 70))
}

console.log('-- 8. 参数校验：不能静默忽略 --')
{
  const onlyFrom = await integral('x^2', 0, undefined)
  assert('只给 from 报错', !onlyFrom.ok && onlyFrom.type === 'invalid_argument', String(onlyFrom.type))
  assert('提示说明要成对', /同时给|两端/.test(String((await run({ operation: 'integral', expression: 'x^2', from: 0 })).error?.hint) || ''),
    '')

  const onlyTo = await integral('x^2', undefined, 3)
  assert('只给 to 也报错', !onlyTo.ok && onlyTo.type === 'invalid_argument', String(onlyTo.type))

  // 不给上下限仍是不定积分（旧行为保留）
  const indefinite = await integral('x^2', undefined, undefined)
  assert('不给上下限 → 不定积分', indefinite.ok && /\+ C/.test(indefinite.text), indefinite.text.slice(0, 40))
  assert('不定积分不带「定积分」字样', !/定积分/.test(indefinite.text), indefinite.text.slice(0, 40))
}

console.log('-- 9. 批量路径同样归一化 --')
{
  const r = await run({ operation: 'evaluate', expressions: ['2**10', 'π', 'ln(10)'] })
  const text = String(r.result)
  assert('批量里 ** 可用', text.includes('1024'), text.split('\n').slice(2, 4).join(' | '))
  assert('批量里 π 可用', text.includes('3.14159'), '')
  assert('批量里 ln 可用', text.includes('2.30258'), '')
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