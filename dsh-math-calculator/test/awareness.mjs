/**
 * 模型感知（awareness）测试。
 *
 * 核心验证：
 *   1. description 必须枚举全部 operation（漏一个模型就不知道它存在）
 *   2. description 必须写「何时该用」而不只是「能做什么」
 *   3. 系统提示注入必须每轮都生成，且能反映当前工作区状态
 *   4. 错误时给出 operation 建议
 *   5. 档位切换有效
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempHome = mkdtempSync(join(tmpdir(), 'dsh-aware-test-'))
process.env.DSH_MATH_CALC_HOME = tempHome

const mod = await import('../lib/index.js')
const awareness = await import('../lib/awareness.js')
const exec = (a) => mod.runMathTool(a)

// 注册工具，拿到模型实际看到的那份定义
const registered = []
mod.apply({ tools: { register: (d) => registered.push(d) } })
const tool = registered[0]

let pass = 0
const fails = []
function ok(n, d) { pass++; console.log('  ok   ' + n + (d ? ': ' + d : '')) }
function bad(n, d) { fails.push({ n, d }); console.log('  FAIL ' + n + '\n         ' + d) }
function assert(n, c, d) { if (c) ok(n, d); else bad(n, d || '') }

console.log('-- 1. description 必须枚举全部 operation --')
{
  const description = tool.description
  const expected = [
    'evaluate', 'solve', 'system', 'derivative', 'integral', 'simplify', 'expand',
    'roots', 'matrix', 'eigen', 'stats', 'dist', 'regression', 'ode', 'formula',
    'formulas', 'world', 'constants', 'quantities', 'impact', 'workspace',
    'formula-table', 'help',
  ]
  const missing = expected.filter((op) => !description.includes(op))
  assert('全部 ' + expected.length + ' 个 operation 都被提到', missing.length === 0,
    '未提到: ' + missing.join(', '))
  console.log('       description 长度: ' + description.length + ' 字符')
}

console.log('-- 2. description 必须写「何时该用」--')
{
  const description = tool.description
  assert('有"必须调用"类指令', /必须调用|应当调用|必须使用/.test(description), '')
  assert('有"不要心算"类指令', /不要心算|而非心算|避免心算/.test(description), '')
  assert('有触发场景词', /触发|典型|凡是/.test(description), '')
  assert('提到节省 token 或精度优势', /精度|BigNumber|token/.test(description), '')
}

console.log('-- 3. 系统提示注入 --')
{
  // brief（默认）
  awareness.setPromptMode('brief')
  const brief = awareness.buildSystemPromptSection()
  assert('brief 档有内容', brief.length > 0, String(brief.length))
  assert('brief 提到 math_execute', brief.includes('math_execute'))
  assert('brief 要求不要心算', /不要心算|必须/.test(brief))
  assert('brief 提到 help 自查', brief.includes('help'))
  console.log('       brief 长度: ' + brief.length + ' 字符')

  // full
  awareness.setPromptMode('full')
  const full = awareness.buildSystemPromptSection()
  assert('full 档更长', full.length > brief.length, full.length + ' > ' + brief.length)
  assert('full 列出具体 operation', full.includes('evaluate') && full.includes('world'))

  // off
  awareness.setPromptMode('off')
  const off = awareness.buildSystemPromptSection()
  assert('off 档为空', off === '', JSON.stringify(off.slice(0, 20)))

  awareness.setPromptMode('brief')
}

console.log('-- 4. 注入内容要反映工作区状态（动态）--')
{
  awareness.setPromptMode('brief')
  const before = awareness.buildSystemPromptSection()
  assert('未改常数时不提"已改动常数"', !before.includes('已改动常数'), before.slice(-80))

  // 建工作区 + 改常数
  exec({ operation: 'workspace', action2: 'create', workspace: 'aware-test' })
  exec({ operation: 'constants', constants: { c: 1.5e8 } })

  const after = awareness.buildSystemPromptSection()
  assert('改常数后提醒"已改动常数"', after.includes('已改动常数'), after.slice(-150))
  assert('提醒里带工作区名', after.includes('aware-test'))
  assert('提醒里列了 c', after.includes('c'))

  // 加自定义公式后也要有提示
  exec({
    operation: 'formula-table',
    tableAction: 'add',
    customFormula: { id: 'aw_custom', name: '测试', expression: 'k*x', params: { k: { value: 1 }, x: { value: null } } },
  })
  const withFormula = awareness.buildSystemPromptSection()
  assert('有自定义公式后提醒', withFormula.includes('自定义公式'), withFormula.slice(-150))
}

console.log('-- 5. 错误时的 operation 建议 --')
{
  // 用 evaluate 传方程，建议 solve
  const r1 = exec({ operation: 'evaluate', expression: '3x + 2y = 10' })
  if (r1.ok === false) {
    assert('方程误用 evaluate 时给出 solve 建议',
      (r1.error?.hint ?? '').includes('solve'), r1.error?.hint ?? '（无 hint）')
  } else {
    console.log('       （该输入被自动识别为 solve，无需建议）')
  }

  // 求导需求
  const r2 = exec({ operation: 'evaluate', expression: '求导 x^3' })
  if (r2.ok === false) {
    assert('求导需求给出 derivative 建议',
      (r2.error?.hint ?? '').includes('derivative'), r2.error?.hint ?? '（无 hint）')
  }

  // 直接测试 suggestOperation 纯函数
  assert('suggestOperation 识别方程', (awareness.suggestOperation('x^2 = 4', 'evaluate') ?? '').includes('solve'))
  assert('suggestOperation 识别特征值',
    (awareness.suggestOperation('求特征值', 'evaluate') ?? '').includes('eigen'))
  assert('suggestOperation 对正常表达式不误报',
    awareness.suggestOperation('1+2*3', 'evaluate') === undefined)
}

console.log('-- 6. 档位切换 operation --')
{
  const full = exec({ promptMode: 'full' })
  assert('切到 full 成功', full.ok, full.error?.message)
  assert('返回预览', full.result.includes('预览'), full.result.slice(0, 80))
  assert('档位已生效', awareness.getPromptMode() === 'full', awareness.getPromptMode())

  const brief = exec({ promptMode: 'brief' })
  assert('切回 brief', brief.ok && awareness.getPromptMode() === 'brief')

  const badMode = exec({ promptMode: 'nonsense' })
  assert('非法档位被拒', badMode.ok === false, badMode.error?.message ?? 'ok=true')
}

console.log('-- 7. help 输出完整 --')
{
  const help = exec({ operation: 'help' })
  assert('help 可用', help.ok)
  const expected = ['evaluate', 'solve', 'derivative', 'integral', 'ode', 'formula', 'world', 'constants', 'workspace']
  const missing = expected.filter((op) => !help.result.includes(op))
  assert('help 覆盖主要 operation', missing.length === 0, '未提到: ' + missing.join(', '))
}

rmSync(tempHome, { recursive: true, force: true })

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  - ' + f.n + ': ' + f.d)
  process.exitCode = 1
}
