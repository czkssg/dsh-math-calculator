/**
 * 收尾补齐项测试：复数根、扩展函数、help 清单、世界输出完整性。
 */
import * as mod from '../lib/index.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}
const run = (args) => mod.runMathTool(args)

console.log('-- 1. 三次方程必须给复数根 --')
{
  const r = run({ operation: 'solve', expression: 'x^3-1=0' })
  assert('解出 3 个根', String(r.result).includes('共 3 个'), String(r.result))
  assert('含复数根标记', String(r.result).includes('复数根'))
  assert('给出 ±0.866i', String(r.result).includes('0.866'))
  assert('value 是结构化根', Array.isArray(r.value) && typeof r.value[0] === 'object' && 're' in r.value[0])

  const pure = run({ operation: 'solve', expression: 'x^2+1=0' })
  assert('纯虚根写作 ±1i', String(pure.result).includes('-1i') && String(pure.result).includes('1i'), String(pure.result))

  const real = run({ operation: 'solve', expression: 'x^2-5x+6=0' })
  assert('纯实根不标复数', !String(real.result).includes('复数根'), String(real.result))
  assert('纯实根 value 仍是数字数组', Array.isArray(real.value) && typeof real.value[0] === 'number')
}

console.log('-- 2. 扩展函数在表达式里可用 --')
{
  assert('rank', String(run({ operation: 'evaluate', expression: 'rank([[1,2],[2,4]])' }).result).trim() === '1')
  assert('nullspace', String(run({ operation: 'evaluate', expression: 'nullspace([[1,2],[2,4]])' }).result).includes('-2'))
  assert('svd', String(run({ operation: 'evaluate', expression: 'svd([[1,2],[3,4]])' }).result).includes('5.46'))
  assert('factorize', String(run({ operation: 'evaluate', expression: 'factorize(360)' }).result).includes('5'))
  const nsolve = run({ operation: 'evaluate', expression: 'nsolve("x^2-2", 1)' })
  assert('nsolve', Math.abs(Number(nsolve.result) - Math.SQRT2) < 1e-9, String(nsolve.result))
}

console.log('-- 3. help 清单必须提到新能力 --')
{
  const help = String(run({ operation: 'help' }).result)
  assert('提到 rank/nullspace/svd', help.includes('rank(') && help.includes('nullspace(') && help.includes('svd('))
  assert('提到 factorize', help.includes('factorize('))
  assert('提到 nsolve', help.includes('nsolve('))
  assert('提到天空/恒星', help.includes('天空') && help.includes('恒星'))
  assert('提到生命闸门', help.includes('生命闸门'))
  assert('提到跨模块一致性', help.includes('一致性'))
  // UI 已于 2026-10-25 全部移除。help 里不该再出现「侧栏」「图形化管理」这类指引，
  // 否则 AI 会告诉作者去点一个不存在的面板（真机实测踩到过）。
  assert('help 不再提已删的侧栏入口', !help.includes('侧栏'), '')
  assert('help 说明没有图形界面', /没有图形界面|无图形界面/.test(help), '')
}

console.log('-- 4. world 输出完整性 --')
{
  const world = run({ operation: 'world' })
  assert('有 life 字段', Boolean(world.value.life && world.value.life.gate))
  assert('有 checks 字段', Array.isArray(world.value.checks) && world.value.checks.length >= 4)
  assert('有 sky 字段', Boolean(world.value.sky && world.value.sky.night))
  assert('有 stellar 字段', Boolean(world.value.stellar && world.value.stellar.lifetimeGyr))
  assert('有 provenance 字段', Boolean(world.value.provenance && world.value.provenance.summary))
  assert('默认世界无矛盾', !world.value.checks.some((c) => c.status === 'contradiction'))
}

console.log('-- 5. 矩阵画像 --')
{
  const m = run({ operation: 'matrix', matrix: [[1, 2], [3, 4]] })
  assert('只给矩阵不报错', !m.error)
  assert('给出秩', String(m.result).includes('秩 2'))
  assert('给出奇异值', Array.isArray(m.value.singularValues))
  assert('给出逆矩阵', Array.isArray(m.value.inverse))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
