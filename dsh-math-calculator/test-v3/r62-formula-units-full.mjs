/**
 * R62 P1-2：公式「带单位」全矩阵。
 *
 * 官方公式测试只验证表达式能解析；这里对**每条可执行公式**，按参数声明的量纲
 * 构造「数值 + SI 基单位」字符串真的调用一次，断言不出现 unit_mismatch——
 * 这是唯一能抓住「量纲标注与解析不一致」（R56 五连错）的测法。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const { buildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const { compileAll } = await import(pathToFileURL(join(root, 'lib/features/formulas/function.js')).href)

const engine = buildEngine()
const functions = compileAll(formulas, engine)

const BASE_UNIT = { M: 'kg', L: 'm', T: 's', I: 'A', Theta: 'K', J: 'cd', N: 'mol' }
function unitOf(dimension) {
  const parts = []
  for (const [key, power] of Object.entries(dimension || {})) {
    if (power === 0) continue
    parts.push(BASE_UNIT[key] + (power === 1 ? '' : '^' + power))
  }
  return parts.join('*')
}
function valuesFor(entry) {
  const values = {}
  for (const [name, spec] of Object.entries(entry.params || {})) {
    const unit = unitOf(spec.dimension)
    const numeric = spec.value !== null && spec.value !== undefined ? spec.value : 1
    if (unit === '') { values[name] = numeric; continue }
    values[name] = String(numeric) + ' ' + unit
  }
  return values
}

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1 }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + ' :: ' + detail) }
}

let called = 0
let ok = 0
let skipped = 0
const unitMismatch = []
const otherErrors = {}
const started = Date.now()
for (const entry of formulas) {
  const fn = functions.get(entry.id)
  if (!fn) { skipped += 1; continue }
  called += 1
  try {
    fn.call(valuesFor(entry))
    ok += 1
  } catch (error) {
    const type = error?.type || 'internal'
    if (type === 'unit_mismatch') unitMismatch.push(entry.id + ' :: ' + String(error.message).slice(0, 90))
    else otherErrors[type] = (otherErrors[type] || 0) + 1
  }
}
const ms = Date.now() - started
assert('全部可执行公式都跑到（' + called + ' 条，跳过展示式 ' + skipped + '）', called >= 800, String(called))
assert('★ 没有 unit_mismatch（量纲标注与解析一致）', unitMismatch.length === 0, unitMismatch.slice(0, 6).join(' | '))
console.log('  成功 ' + ok + ' | 其它错误（参数值 1 触发的约束/非有限）' + JSON.stringify(otherErrors) + ' | 耗时 ' + ms + 'ms')

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
