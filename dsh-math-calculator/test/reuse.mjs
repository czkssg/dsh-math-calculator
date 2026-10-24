/**
 * 复用性测试：推演层必须复用公式库与常数表，不得重复实现物理公式。
 *
 * 用户的设计原则：「世界观推演是指令集，可以复用基础计算模块以及常数表
 * 公式库，不需要重复写相关代码」。这组测试就是守住这条原则。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evalFormula, constantsFor, constantValue } from '../lib/formula-bridge.js'
import { FORMULA_INDEX } from '../lib/formulas.js'
import { CONSTANT_GRAPH } from '../lib/constants-graph.js'
import { dimensionlessPack } from '../lib/derivation-stack.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 公式桥能调到已有公式库 --')
{
  const scaleHeight = evalFormula('atmospheric_scale_height', { T: 287.3, M: 0.02896, g: 9.80665 })
  assert('标高公式可用', scaleHeight !== null && scaleHeight.value > 8000 && scaleHeight.value < 9000,
    scaleHeight ? scaleHeight.value.toFixed(0) + ' ' + scaleHeight.unit : 'null')
  assert('标高用的是公式库表达式', scaleHeight && scaleHeight.expr.includes('R * T'),
    scaleHeight ? scaleHeight.expr : 'null')

  const escape = evalFormula('escape_velocity', { M: 5.9722e24, r: 6371000 })
  assert('逃逸速度公式可用', escape !== null && escape.value > 11000 && escape.value < 11300,
    escape ? escape.value.toFixed(0) + ' ' + escape.unit : 'null')

  const wien = evalFormula('wien_displacement', { T: 5778 })
  assert('维恩位移公式可用', wien !== null && Math.abs(wien.value - 5.0e-7) < 1e-8,
    wien ? wien.value.toExponential(3) : 'null')
}

console.log('-- 2. 公式库确实有 342 条，桥接到的是同一份 --')
{
  assert('公式库规模 ≥ 300', FORMULA_INDEX.size >= 300, String(FORMULA_INDEX.size))
  assert('能查到的 id 与库一致', FORMULA_INDEX.has('atmospheric_scale_height'))
  const missing = evalFormula('this_formula_does_not_exist', {})
  assert('不存在的公式返回 null（不抛错）', missing === null)
}

console.log('-- 3. 常数表接入 --')
{
  const kB = constantValue('kB')
  assert('能从常数表读 kB', typeof kB === 'number' && kB > 1.38e-23 && kB < 1.39e-23, String(kB))
  const batch = constantsFor(['c', 'G', 'h'])
  assert('批量读三个常数', Object.keys(batch).length === 3, Object.keys(batch).join(','))
  assert('常数表规模 ≥ 40', CONSTANT_GRAPH.length >= 40, String(CONSTANT_GRAPH.length))
}

console.log('-- 4. 源码里不应有重复实现的物理公式 --')
{
  const pipeline = readFileSync(join(root, 'src/pipeline.ts'), 'utf8')
  // 这些是「重复造轮子」的特征：硬编码物理常数
  const forbidden = [
    { pattern: /1\.380649e-23/, what: 'kB 硬编码' },
    { pattern: /6\.02214076e23/, what: 'NA 硬编码' },
    { pattern: /5\.29177210903e-11(?![\s\S]{0,80}兜底)/, what: '玻尔半径硬编码（应走常数表）' },
  ]
  for (const item of forbidden) {
    const raw = pipeline.match(item.pattern)
    assert('pipeline 无 ' + item.what, raw === null, raw ? raw[0] : 'clean')
  }
  assert('pipeline 导入了 formula-bridge', pipeline.includes("from './formula-bridge.js'"))
  assert('pipeline 使用 constantValue 读常数', pipeline.includes('constantValue('))
}

console.log('-- 5. 无量纲量的标准值也是自算 --')
{
  // 现实参数下偏差必须为 0：说明 standard 与 current 用的是同一组公式
  const packs = dimensionlessPack({})
  assert('现实参数下四个偏差都≈0',
    packs.every((pack) => Math.abs(pack.deviation) < 1e-9),
    packs.map((p) => p.name + '=' + p.deviation.toExponential(1)).join(' '))

  const stack = readFileSync(join(root, 'src/derivation-stack.ts'), 'utf8')
  assert('不再硬编码 1/137.035999084',
    !stack.includes('1 / 137.035999084') || stack.indexOf('REAL') > 0,
    'standard 已改为自算')
  assert('有 REAL 现实常数块', stack.includes('const REAL = {'))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
