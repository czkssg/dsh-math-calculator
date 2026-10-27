/**
 * 基础运算扩展测试：秩/零空间/奇异值/质因数分解/数值求根，以及矩阵操作修复。
 *
 * 这些是"纯代码能算"的部分——用户要的是覆盖更多能算的东西，不是更多花活。
 */
import * as mod from '../lib/index.js'
import { rankOf, nullspaceOf, singularValuesOf, factorizeInt, makeNsolve } from '../lib/numeric.js'

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
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

console.log('-- 1. 秩 --')
{
  assert('[[1,2],[2,4]] 秩 = 1', rankOf([[1, 2], [2, 4]]) === 1)
  assert('单位阵 3×3 秩 = 3', rankOf([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) === 3)
  assert('零矩阵秩 = 0', rankOf([[0, 0], [0, 0]]) === 0)
  assert('非方阵秩 = 2', rankOf([[1, 2, 3], [4, 5, 6]]) === 2)
}

console.log('-- 2. 零空间 --')
{
  const basis = nullspaceOf([[1, 2], [2, 4]])
  assert('零空间维数 = 1', basis.length === 1, String(basis.length))
  assert('基向量与行向量正交', Math.abs(dot(basis[0], [1, 2])) < 1e-9, JSON.stringify(basis[0]))
  assert('满秩矩阵零空间为空', nullspaceOf([[1, 0], [0, 1]]).length === 0)
}

console.log('-- 3. 奇异值 --')
{
  const diag = singularValuesOf([[3, 0], [0, 4]])
  assert('diag(3,4) 奇异值 = [4,3]', Math.abs(diag[0] - 4) < 1e-9 && Math.abs(diag[1] - 3) < 1e-9, JSON.stringify(diag))
  const sv = singularValuesOf([[1, 2], [3, 4]])
  assert('[[1,2],[3,4]] 最大奇异值 ≈ 5.4650', Math.abs(sv[0] - 5.4649857) < 1e-4, sv[0].toFixed(4))
  assert('最小奇异值 ≈ 0.3660', Math.abs(sv[1] - 0.3659662) < 1e-4, sv[1].toFixed(4))
}

console.log('-- 4. 质因数分解 --')
{
  assert('360 = 2³·3²·5', JSON.stringify(factorizeInt(360)) === JSON.stringify([2, 2, 2, 3, 3, 5]))
  assert('97 是质数', JSON.stringify(factorizeInt(97)) === JSON.stringify([97]))
  assert('1 会报错（不是质数也不是合数）', (() => { try { factorizeInt(1); return false } catch { return true } })())
}

console.log('-- 5. 数值求根 --')
{
  const solve = makeNsolve((text) => {
    // 用插件自己的引擎解析
    const r = run({ operation: 'evaluate', expression: 'x^2-2', variables: { x: 1 } })
    return { evaluate: () => Number(String(r.result)) }
  })
  assert('nsolve 在引擎里可用（表达式形式）', typeof run({ operation: 'evaluate', expression: 'nsolve("x^2-2", 1)' }).result === 'string')
}

console.log('-- 6. 表达式里直接用新函数 --')
{
  const rank = run({ operation: 'evaluate', expression: 'rank([[1,2],[2,4]])' })
  assert('rank(...) 可求值', String(rank.result).trim() === '1', String(rank.result))

  const fac = run({ operation: 'evaluate', expression: 'factorize(360)' })
  assert('factorize(360) 可求值', String(fac.result).includes('5') && String(fac.result).includes('3'), String(fac.result))

  /**
   * 要验 1e-9 级精度，必须显式要够显示位。
   *
   * 默认显示精度是「小数点后 8 位」，8 位小数与 √2 的差约 2.4e-9，
   * 正好卡在 1e-9 容差外 —— 不显式传会误判成算错（实际只是显示截断）。
   */
  const ns = run({ operation: 'evaluate', expression: 'nsolve("x^2-2", 1)', displayPrecision: 16 })
  assert('nsolve 求 √2', Math.abs(Number(ns.result) - Math.SQRT2) < 1e-9, String(ns.result))

  const svd = run({ operation: 'evaluate', expression: 'svd([[1,2],[3,4]])' })
  assert('svd 可求值', !svd.error, String(svd.result).slice(0, 40))
}

console.log('-- 7. 矩阵操作修复（只给 matrix 不再报错）--')
{
  const m = run({ operation: 'matrix', matrix: [[1, 2], [3, 4]] })
  assert('只给矩阵不报错', !m.error, m.error ? String(m.error.message) : '')
  assert('给出秩 2', String(m.result).includes('秩 2'), String(m.result).split('\n')[0])
  assert('给出行列式 -2', String(m.result).includes('-2'), String(m.result).split('\n')[1])
  assert('给出迹 5', String(m.result).includes('迹 5'))
  assert('给出逆矩阵', m.value && Array.isArray(m.value.inverse), JSON.stringify(m.value?.inverse))
  assert('给出奇异值', m.value && Array.isArray(m.value.singularValues))

  const singular = run({ operation: 'matrix', matrix: [[1, 2], [2, 4]] })
  assert('奇异矩阵：秩 1', String(singular.result).includes('秩 1'))
  assert('奇异矩阵：提示逆不存在', String(singular.result).includes('逆不存在'))
  assert('奇异矩阵：没有 inverse', !singular.value.inverse)
}

console.log('-- 8. 错误仍是结构化的（不抛异常）--')
{
  const bad = run({ operation: 'evaluate', expression: 'factorize(1)' })
  assert('factorize(1) 返回结构化错误', Boolean(bad.error), bad.error ? bad.error.type : '')
  const badRank = run({ operation: 'evaluate', expression: 'rank([[1,2],[3]])' })
  assert('不规则矩阵返回结构化错误', Boolean(badRank.error))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
