/**
 * 提示词承诺的单位必须真的可用（R53 后续：用户要求「优先用英语专业符号」）。
 *
 * 背景：提示词写「单位优先用国际符号」，那这些符号就必须**真的能换算**，
 * 否则 AI 照做会撞 unknown_symbol —— 比不提示更糟。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-symbols-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }
/** 提示词里点名的符号 + 常见国际符号，必须全部可用。 */
const MUST_WORK = [
  ['kg', 'g'], ['kW', 'W'], ['km', 'm'], ['h', 's'], ['Pa', 'kPa'],
  ['N', 'kN'], ['mol', 'kmol'], ['degC', 'K'], ['J', 'kJ'], ['GJ', 'MJ'],
  ['kcal', 'kJ'], ['kn', 'km/h'],
]
/** 分组的常见符号（防漏）。 */
const GROUPS = {
  长度: [['cm', 'm'], ['mm', 'm'], ['km', 'mi'], ['ft', 'm'], ['inch', 'cm'], ['nmi', 'km'], ['AU', 'km'], ['ly', 'km']],
  质量: [['tonne', 'kg'], ['lb', 'kg'], ['oz', 'g']],
  时间: [['min', 's'], ['day', 'h'], ['year', 'day']],
  速度: [['m/s', 'km/h'], ['mph', 'km/h']],
  力: [['kgf', 'N'], ['lbf', 'N']],
  压强: [['bar', 'Pa'], ['psi', 'Pa'], ['atm', 'Pa'], ['mmHg', 'Pa'], ['MPa', 'Pa']],
  能量: [['kWh', 'MJ'], ['cal', 'J'], ['BTU', 'kJ'], ['eV', 'J']],
  功率: [['hp', 'W'], ['MW', 'kW']],
  温度: [['degF', 'degC']],
  面积: [['m2', 'ha'], ['sqft', 'm2'], ['acre', 'ha']],
  体积: [['L', 'mL'], ['m3', 'L'], ['gal', 'L']],
  电学: [['V', 'mV'], ['A', 'mA'], ['ohm', 'kohm'], ['F', 'uF']],
  数据: [['B', 'bit'], ['GB', 'MB']],
}
console.log('-- 1. 提示词点名的符号全部可用 --')
{
  const bad = []
  for (const [from, to] of MUST_WORK) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    if (r.ok !== true) bad.push(from + '→' + to)
  }
  assert('★ 提示词承诺的 12 个符号都通', bad.length === 0, bad.join(', '))
}
console.log('-- 2. 常见国际符号无遗漏 --')
{
  const bad = []
  for (const [group, pairs] of Object.entries(GROUPS)) {
    for (const [from, to] of pairs) {
      const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
      if (r.ok !== true) bad.push(group + ':' + from + '→' + to)
    }
  }
  assert('★ 13 组常见符号全部可换算', bad.length === 0, bad.join(', '))
}
console.log('-- 3. 提示词本身确实写入 --')
{
  const aw = await import(pathToFileURL(join(root, 'lib/awareness.js')).href)
  const text = String(aw.TOOL_DESCRIPTION)
  assert('★ 提示词含「优先用国际符号」', text.includes('优先用国际符号'), '')
  assert('★ 提示词说明温度要写 degC（裸 C 是库仑）', text.includes('degC') && text.includes('库仑'), '')
  assert('★ 提示词说明光速是常量不是单位', text.includes('常量'), '')
}
console.log('-- 4. 中文别名仍可用（兜底不失效）--')
{
  for (const [unit, to] of [['米', 'm'], ['公里', 'm'], ['斤', 'kg'], ['石', 'kg'], ['节', 'km/h'], ['牛顿', 'N']]) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: unit, unitTo: to })
    assert('★ 中文别名「' + unit + '」仍可用', r.ok === true, String(r.error?.type))
  }
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
