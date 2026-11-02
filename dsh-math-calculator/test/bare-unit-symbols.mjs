/**
 * 单字母标识符：不能悄悄被当成单位符号。
 *
 * ## 为什么这是最危险的一类问题
 *
 * 实测反馈（`实践文档/math_execute_实测问题与改进建议.md` 的 P0-2）：
 *
 *     rho=2035; rho*V  → 2.035 kV    ← V 被当成伏特
 *     rho=2035; rho*m  → 2.035 km    ← m 被当成米
 *     rho=2035; rho*g  → 2.035 kg    ← g 被当成克
 *
 * **不报错、不警告**，而且 `2.035` 是个看起来完全正常的数。
 * 而物理推演里最规范的变量名恰恰都是单字母：m / V / W / T / L / P / A / C / h / g。
 * 工具在惩罚最规范的命名习惯。
 *
 * 文档的原话是：「如果只能改一件事，让未定义的单字母标识符报错，而不是猜它是单位。」
 *
 * ## 难点：语法上无法区分
 *
 * mathjs 把两者解析成**完全相同**的 AST：
 *
 *     5 V    → OperatorNode(*) [ConstantNode(5), SymbolNode(V)]
 *     rho*V  → OperatorNode(*) [SymbolNode(rho), SymbolNode(V)]
 *
 * 所以只能用上下文判据：
 *   · 放行 → 符号处「单位位置」：父是乘法且兄弟含数字（`5 V`、`9.81 m`），
 *            或父是幂且指数是数字（`s^2`）
 *   · 报错 → 与**已定义变量同级**（`rho*V` 的兄弟 rho 已定义），或**单独出现**
 *   · 其它 → 放行（纯单位表达式 `9.81 m/s^2`）
 *
 * ## 本套测试守什么
 *
 * 1. 静默错误必须被拦（21 个 mathjs 单字母单位都试）
 * 2. **真单位用法一个都不能坏**（这是修复的主要风险）
 * 3. 变量已定义时行为不变
 * 4. 报错信息要能指导下一步
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-bareunit-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次，返回 { failed, text, errorType }。批量里看「是否有任何一条失败」。 */
async function probe(args) {
  const r = await run(args)
  const text = String(r.result || '')
  const failed = !r.ok || /失败\[/.test(text) || /\bundefined\b/.test(text) === false && false
  return {
    ok: r.ok,
    failed: !r.ok || /失败\[/.test(text),
    text,
    errorType: r.error?.type,
    hint: r.error?.hint,
  }
}

/** 单字母单位全集（实测 mathjs 内置的 20 个）。 */
const UNIT_LETTERS = 'ABCFHJKLNSTVWbghlmst'.split('')

console.log('-- 1. 静默错误必须被拦：rho * <单字母> --')
{
  for (const L of UNIT_LETTERS) {
    const r = await probe({ operation: 'evaluate', expressions: ['rho=2035', 'rho*' + L] })
    assert('rho*' + L + ' 报错而非静默算成单位', r.failed, r.text.split('\n').slice(-2).join(' ').slice(0, 60))
  }
}

console.log('-- 2. 单独出现的未定义单字母也要报错 --')
{
  for (const L of ['V', 'm', 'g', 'T', 'W']) {
    const r = await probe({ operation: 'evaluate', expressions: [L] })
    assert('单独 ' + L + ' 报错', r.failed, r.text.split('\n').slice(-2).join(' ').slice(0, 50))
  }
}

console.log('-- 3. 真单位用法一个都不能坏（修复的主要风险）--')
{
  const MUST_WORK = [
    '5 V',
    '5 V + 3 V',
    '9.81 m/s^2',
    '100 km/h',
    '5 cm to inch',
    '2 m * 3 m',
    '1 h',
    '60 s',
    '1 A',
    '2 kg',
    '3 L',
    '1 T',
    '5 W',
  ]
  for (const expr of MUST_WORK) {
    const r = await probe({ operation: 'evaluate', expressions: [expr] })
    assert('单位用法可用: ' + expr, !r.failed, r.text.split('\n').slice(-2).join(' ').slice(0, 50))
  }
}

console.log('-- 4. 变量已定义时行为不变 --')
{
  const defined = [
    ['V=2; rho*V', ['V=2', 'rho=2035', 'rho*V'], '4070'],
    ['m=5; m*2', ['m=5', 'm*2'], '10'],
  ]
  for (const [label, exprs, expected] of defined) {
    const r = await probe({ operation: 'evaluate', expressions: exprs })
    assert(label + ' 正常求值', !r.failed && r.text.includes(expected), r.text.split('\n').slice(-1)[0].slice(0, 40))
  }

  // variables 传参同样优先
  const viaVars = await probe({
    operation: 'evaluate',
    expression: 'rho*V',
    variables: { rho: 2035, V: 100 },
  })
  assert('variables 传参时单字母当变量', !viaVars.failed && viaVars.text.includes('203500'),
    viaVars.text.split('\n')[0].slice(0, 40))
}

console.log('-- 5. 多字母标识符不受影响 --')
{
  const multi = await probe({ operation: 'evaluate', expressions: ['vol=1.2312e11', 'rho=2035', 'rho*vol'] })
  assert('多字母变量正常', !multi.failed && multi.text.includes('250549200000000'),
    multi.text.split('\n').slice(-1)[0].slice(0, 40))

  const unknown = await probe({ operation: 'evaluate', expressions: ['xyz'] })
  assert('未定义多字母照旧报 unknown_symbol', unknown.failed, '')
}

console.log('-- 6. 报错信息要能指导下一步 --')
{
  const r = await run({ operation: 'evaluate', expressions: ['rho=2035', 'rho*V'] })
  // 批量的错误在每条的文本里；单条才有 error.hint
  const single = await run({ operation: 'evaluate', expressions: ['V'] })
  const hint = String(single.error?.hint || '')
  const singleText = String(single.result || '')
  const combined = hint + ' ' + singleText

  assert('说明它既是变量名也是单位符号', /既是变量名也是单位符号|未定义/.test(combined), combined.slice(0, 50))
  assert('给出单位写法（带数字）', /5 V|带数字/.test(combined), combined.slice(0, 70))
  assert('给出变量写法（赋值或 variables）', /variables|赋值/.test(combined), combined.slice(0, 90))
  // 措辞不反驳作者
  assert('不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(combined), '')
  void r
}

console.log('-- 7. 不误伤：数字与单位的各种组合 --')
{
  const SAFE = [
    '1.5 m',
    '2.5e3 m',
    '9.8 m/s^2',
    '1 m^2',
    '3 s^-1',
    '(2+3) V',
    '2 * 5 V',
    '1/2 h',
  ]
  for (const expr of SAFE) {
    const r = await probe({ operation: 'evaluate', expressions: [expr] })
    assert('不误伤: ' + expr, !r.failed, r.text.split('\n').slice(-2).join(' ').slice(0, 50))
  }
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