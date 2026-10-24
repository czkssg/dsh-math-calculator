/**
 * 自创常数 / 新物理量测试。
 *
 * 覆盖：定义、校验（必带量纲）、量纲检查、派生量求解、安全求值。
 */
import {
  validateCustomConstant, dimensionText, sameDimension, checkDimension,
  resolveCustomConstants, createSafeEvaluator, BASE_DIMENSIONS,
} from '../lib/custom-constants.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const goodDef = {
  name: 'aetherPressure', label: '以太压', value: 1.2e6, unit: 'Pa',
  meaning: '决定能否超光速通信', origin: 'author', dimension: { M: 1, L: -1, T: -2 },
}

console.log('-- 1. 定义校验 --')
{
  assert('完整定义通过', validateCustomConstant(goodDef).length === 0,
    validateCustomConstant(goodDef).join(';'))

  assert('缺量纲被拒',
    validateCustomConstant({ ...goodDef, dimension: undefined }).some((e) => e.includes('dimension')))
  assert('缺单位被拒',
    validateCustomConstant({ ...goodDef, unit: '' }).some((e) => e.includes('unit')))
  assert('缺含义被拒',
    validateCustomConstant({ ...goodDef, meaning: '' }).some((e) => e.includes('meaning')))
  assert('非法量名被拒',
    validateCustomConstant({ ...goodDef, name: '1bad' }).some((e) => e.includes('标识符')))
  assert('保留字被拒',
    validateCustomConstant({ ...goodDef, name: 'c' }).some((e) => e.includes('保留字')))
  assert('派生必须给表达式',
    validateCustomConstant({ ...goodDef, origin: 'derived' }).some((e) => e.includes('derive')))
  assert('量纲指数必须是数字',
    validateCustomConstant({ ...goodDef, dimension: { M: 'x' } }).some((e) => e.includes('量纲')))
}

console.log('-- 2. 量纲运算 --')
{
  assert('压力的量纲文本', dimensionText({ M: 1, L: -1, T: -2 }) === 'L^-1·M·T^-2',
    dimensionText({ M: 1, L: -1, T: -2 }))
  assert('无量纲', dimensionText({}) === '无量纲', dimensionText({}))
  assert('同量纲判定', sameDimension({ M: 1 }, { M: 1 }) === true)
  assert('异量纲判定', sameDimension({ M: 1 }, { L: 1 }) === false)
}

console.log('-- 3. 量纲检查 --')
{
  const dims = { ...BASE_DIMENSIONS, aetherPressure: { M: 1, L: -1, T: -2 } }
  // 压力 × 体积 = 能量
  const energy = checkDimension('aetherPressure * length^3', dims, { M: 1, L: 2, T: -2 })
  assert('压力×体积=能量（应为真）', energy.ok === true, energy.problems.join(';'))

  // 压力 × 质量 = 不是能量
  const wrong = checkDimension('aetherPressure * mass', dims, { M: 1, L: 2, T: -2 })
  assert('压力×质量≠能量（应判错）', wrong.ok === false, 'ok=' + wrong.ok)

  // 压力量纲本身
  const pressure = checkDimension('aetherPressure', dims, { M: 1, L: -1, T: -2 })
  assert('单量量纲正确', pressure.ok === true, pressure.problems.join(';'))

  // 未知量
  const unknown = checkDimension('mysteryVar * 2', dims)
  assert('未知量被抓出', unknown.problems.some((p) => p.includes('未知量')), unknown.problems.join(';'))

  // 不给期望时只报告不当判
  const noExpect = checkDimension('aetherPressure * length^3', dims)
  assert('无期望时结果量纲正确',
    dimensionText(noExpect.resultDimension) === 'L^2·M·T^-2',
    dimensionText(noExpect.resultDimension))
}

console.log('-- 4. 派生量求解 --')
{
  const customs = [
    { name: 'aetherPressure', label: '以太压', value: 1.2e6, unit: 'Pa', meaning: 'x',
      origin: 'author', dimension: { M: 1, L: -1, T: -2 }, createdAt: '' },
    { name: 'psiDensity', label: '灵能密度', value: 0, unit: 'J/m3', meaning: 'y',
      origin: 'derived', dependsOn: ['aetherPressure', 'c'], derive: 'aetherPressure * 1e-8 * c',
      dimension: { M: 1, L: -1, T: -2 }, createdAt: '' },
  ]
  const resolved = resolveCustomConstants(customs, { c: 299792458 })
  assert('author 量直接取值', resolved.values.aetherPressure === 1.2e6, String(resolved.values.aetherPressure))
  assert('derived 量被算出来', typeof resolved.values.psiDensity === 'number' && resolved.values.psiDensity > 0,
    String(resolved.values.psiDensity))
  assert('派生结果正确', Math.abs(resolved.values.psiDensity - 1.2e6 * 1e-8 * 299792458) < 1,
    String(resolved.values.psiDensity))
  assert('无求解错误', resolved.errors.length === 0, resolved.errors.join(';'))

  // 依赖缺失应报错
  const missing = resolveCustomConstants([
    { name: 'bad', label: 'b', value: 0, unit: 'x', meaning: 'm',
      origin: 'derived', dependsOn: ['nonexistent'], derive: 'nonexistent * 2',
      dimension: {}, createdAt: '' },
  ], {})
  assert('依赖缺失被报出', missing.errors.length > 0, missing.errors.join(';'))
}

console.log('-- 5. 安全求值器 --')
{
  const values = { a: 2, b: 3, c: 299792458 }
  const fn = createSafeEvaluator(values)
  assert('基本运算', fn('a + b') === 5, String(fn('a + b')))
  assert('幂运算', fn('a^3') === 8, String(fn('a^3')))
  // 科学计数法：曾经把 1e-8 里的 e 当变量名
  // 1e-8 × c = 1e-8 × 299792458 ≈ 2.9979（曾把 1e-8 的 e 当变量名而报错）
  assert('科学计数法可用', Math.abs(fn('1e-8 * c') - 2.99792458) < 1e-6, String(fn('1e-8 * c')))
  assert('未知变量被拒', (() => { try { fn('zzz * 2'); return false } catch { return true } })())
  assert('非法字符被拒', (() => { try { fn('a; alert(1)'); return false } catch { return true } })())
  assert('函数调用被拒', (() => { try { fn('alert(1)'); return false } catch { return true } })())
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
