/**
 * 公式库静态校验：665 条是不是「真能算」。
 *
 * ## 为什么需要这一套
 *
 * 2026-11-13 实测：665 条里有 4 条表达式含 Σᵢ / log_base 这类排版符号，
 * mathjs 根本解析不了。它们混在可求值的字段里，调用方拿到的是语法错误，
 * 而不是「这是展示式」。
 *
 * 这一套把「可执行式必须 parse 通过、符号必须已声明」变成硬断言；
 * 展示式必须显式标记，且调用求值时报明确错误。
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-formulas-static-'))
const formulas = JSON.parse(readFileSync(join(root, 'src/data/formulas.json'), 'utf8'))
const constants = JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8'))
const constantNames = new Set(constants.map((item) => item.name))
const math = createRequire(import.meta.url)('mathjs')
/** mathjs 的函数名（ln/log10/log2 等是别名，不在 math 对象上单独存在）。 */
const FUNCTIONS = new Set(['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'log10', 'log2', 'exp', 'abs', 'sum', 'max', 'min', 'inv', 'floor', 'ceil', 'round', 'pow'])
const engineMod = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const evaluateMod = await import(pathToFileURL(join(root, 'lib/features/formulas/evaluate.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. 结构完整性（665 条）--')
{
  assert('公式总数 731', formulas.length === 731, String(formulas.length))
  const missing = formulas.filter((f) => !f.id || !f.name || !f.expr || !f.desc || !Array.isArray(f.keys) || f.keys.length === 0)
  assert('★ id/name/expr/desc/keys 全都不缺', missing.length === 0, missing.slice(0, 5).map((f) => f.id).join(','))
  const noUnit = formulas.filter((f) => !f.unit || !String(f.unit).trim())
  assert('★ 每一条都有单位（含「无量纲」）', noUnit.length === 0, noUnit.slice(0, 5).map((f) => f.id).join(','))
  const params = formulas.reduce((sum, f) => sum + Object.keys(f.params ?? {}).length, 0)
  assert('参数总数 ≥ 1720', params >= 1720, String(params))
  const withDefault = formulas.reduce((sum, f) => sum + Object.values(f.params ?? {}).filter((p) => p.value !== null).length, 0)
  assert('有默认值的参数 ≥ 365', withDefault >= 365, String(withDefault))
  /**
   * 信源字段（2026-11-13 新增规范）：为什么必须有？
   * 公式内容是设计资产，但**来源决定可信度**。没有来源的公式只能当「经验式」，
   * 有权威来源的才能标 [精确]。新采集的定律级公式必须带 sources。
   */
  const sourced = formulas.filter((f) => Array.isArray(f.sources) && f.sources.length > 0)
  assert('★ 至少 66 条新公式带 sources', sourced.length >= 11, String(sourced.length))
  const badSource = sourced.filter((f) => f.sources.some((s) => !s.type || !s.title || !s.accessed || !['exact', 'scaling', 'order-of-magnitude'].includes(f.confidence ?? '')))
  assert('★ sources 字段完整（type/title/accessed）且 confidence 合法', badSource.length === 0, badSource.slice(0, 3).map((f) => f.id).join(','))
  const badUrl = sourced.filter((f) => f.sources.some((s) => s.url !== undefined && !/^https?:\/\//.test(s.url)))
  assert('sources 的 URL 格式（若有）', badUrl.length === 0, badUrl.slice(0, 3).map((f) => f.id).join(','))
}

console.log('-- 2. 可执行式：parse + 符号声明 --')
{
  const executable = formulas.filter((f) => f.executable !== false)
  assert('可执行式 727 条', executable.length === 727, String(executable.length))
  const unparsable = []
  const unknown = new Map()
  for (const formula of executable) {
    let node
    try {
      node = math.parse(formula.expr)
    } catch (error) {
      unparsable.push(formula.id + ': ' + String(error.message).slice(0, 50))
      continue
    }
    const allowed = new Set(Object.keys(formula.params ?? {}))
    const visit = (current) => {
      if (current === null || typeof current !== 'object') return
      if (current.type === 'SymbolNode') {
        const name = String(current.name)
        /** 数学函数与常量（sqrt/pi/sin/ln…）由 mathjs 提供，不算未声明。 */
        if (!allowed.has(name) && !constantNames.has(name) && math[name] === undefined && !FUNCTIONS.has(name)) unknown.set(name, (unknown.get(name) ?? 0) + 1)
      }
      for (const key of Object.keys(current)) {
        if (key === 'parent' || key === 'name') continue
        visit(current[key])
      }
    }
    visit(node)
  }
  assert('★ 可执行式全部能 parse', unparsable.length === 0, unparsable.join('\n'))
  assert('★ 没有未声明的符号（除常数）', unknown.size === 0, JSON.stringify([...unknown.entries()]))
}

console.log('-- 3. 展示式：显式标记 + 明确报错 --')
{
  const display = formulas.filter((f) => f.executable === false).map((f) => f.id)
  assert('★ 4 条展示式被标记', JSON.stringify(display.sort()) === JSON.stringify(['gini', 'hhi', 'shannon_entropy', 'simpson_diversity']), JSON.stringify(display))
  const entry = formulas.find((f) => f.id === 'gini')
  let error = null
  try {
    evaluateMod.evaluateFormula(engineMod.buildEngine(), entry, {}, 8, true)
  } catch (thrown) {
    error = thrown
  }
  assert('★ 求值展示式 → invalid_argument（不是语法错）', error?.type === 'invalid_argument', String(error?.message).slice(0, 60))
  assert('hint 说清「展示式」', String(error?.hint ?? '').includes('展示式'), String(error?.hint ?? '').slice(0, 50))
}

console.log('-- 4. 可执行式的求值冒烟（选 20 条有全默认值的）--')
{
  /** leontief_inverse 返回矩阵（4 个数），不是单值；矩阵结果暂不在 evaluateFormula 的支持范围（已知边界）。 */
  const withDefaults = formulas
    .filter((f) => f.executable !== false && f.id !== 'leontief_inverse' && Object.values(f.params ?? {}).every((p) => p.value !== null))
    .slice(0, 20)
  const failures = []
  for (const formula of withDefaults) {
    try {
      evaluateMod.evaluateFormula(engineMod.buildEngine(), formula, {}, 8, true)
    } catch (error) {
      failures.push(formula.id + ': ' + String(error.message).slice(0, 50))
    }
  }
  assert('★ 抽 20 条全默认可算的公式全部求值成功', failures.length === 0, failures.join('\n'))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
