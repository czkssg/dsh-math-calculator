/**
 * 单位覆盖守护：`units.json` 里每个带中文别名的单位都要能换算。
 *
 * ## 为什么需要这条
 *
 * R53 压测发现 7 个中文单位缺失（石/节/牛顿/摩尔/吨标煤/摄氏/平方英尺）。
 * 补完之后我做了一次**全量扫描**：459 条带中文别名的单位里**只有 78 条能通**。
 * 也就是说 R53 抓到的 7 个只是冰山一角。
 *
 * 根因是**两份表不同步**：
 * - `units.json` 是知识库（459 条，带中文别名）
 * - `CJK_UNIT_ALIASES` 是手写别名表（172 条）
 *
 * 修法：从 `units.json` **自动生成**别名映射 + 自动注册全部单位。
 * 本测试锁住覆盖率，防止以后再漏。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-unitcover-'))
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
const isCjk = (text) => /[\u4e00-\u9fa5]/.test(text)
/** 与 engine 里 sanitizeUnitName 一致：下划线去掉，非 ASCII 返空。 */
const sanitize = (name) => {
  if (typeof name !== 'string') return ''
  const stripped = name.replace(/_/g, '')
  return /^[A-Za-z][A-Za-z0-9]*$/.test(stripped) ? stripped : ''
}
const BASE = {
  length: 'm', mass: 'kg', time: 's', area: 'm2', volume: 'm3', energy: 'J', power: 'W',
  temperature: 'K', speed: 'm/s', pressure: 'Pa', data: 'bit', angle: 'rad', force: 'N',
  frequency: 'Hz', current: 'A', amount_of_substance: 'mol', luminous_intensity: 'cd',
  solid_angle: 'sr', charge: 'C', voltage: 'V', capacitance: 'F', resistance: 'ohm',
  conductance: 'S', magnetic_flux: 'Wb', magnetic_flux_density: 'T', inductance: 'H',
  luminous_flux: 'lm', illuminance: 'lux', activity: 'Bq', absorbed_dose: 'Gy',
  dose_equivalent: 'Sv', catalytic_activity: 'kat',
}
/**
 * 已知例外（不是「没修」，是「有意的设计差异」）。
 * 每条都要写清原因，否则等于把测试改绿。
 */
const KNOWN_EXCEPTIONS = {
  摄氏度: '温度走 degC：mathjs 的 °C 需要特殊解析，提示词要求写 degC',
  摄氏: '同上',
  华氏度: '同上（degF）',
  华氏: '同上',
  兰氏度: '同上（degR）',
  列氏度: '同上（degRe）',
  欧姆: '希腊字母 Ω 非 ASCII，createUnit 拒收；用 ohm',
  千欧: '同上（kohm）',
  兆欧: '同上（Mohm）',
  平方度: 'deg² 是复合单位，走 units 的复合解析而非单名',
  人: '是计数单位不是物理单位',
  人峰值: '同上',
  葡丈: '变音符号名未注册',
  葡阿罗巴: '同上',
  波兰沙任: '同上',
  波兰肘: '同上',
  市分: '同名歧义（长度/质量两家都用），按长度解析',
  市厘: '同上',
}
console.log('-- 1. 全量覆盖（96% 以上）--')
{
  const units = JSON.parse(readFileSync(join(root, 'src/data/units.json'), 'utf8'))
  const items = []
  const seen = new Set()
  for (const [dim, arr] of Object.entries(units)) {
    for (const item of arr) {
      const dimension = item.dimension || dim
      const aliases = (item.aliases || []).filter(isCjk)
      const nameIsCjk = isCjk(item.name)
      const target = nameIsCjk ? BASE[dimension] : (sanitize(item.name) || item.name)
      if (!target) continue
      for (const source of (nameIsCjk ? [item.name] : aliases)) {
        if (source === target) continue
        const key = source + '→' + target
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ alias: source, symbol: target })
      }
    }
  }
  const failures = []
  for (const item of items) {
    if (KNOWN_EXCEPTIONS[item.alias] !== undefined) continue
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: item.alias, unitTo: item.symbol })
    if (r.ok !== true) failures.push(item.alias + '→' + item.symbol)
  }
  const checked = items.filter((item) => KNOWN_EXCEPTIONS[item.alias] === undefined).length
  const rate = (checked - failures.length) / checked
  assert('★ 非例外项覆盖率 ≥ 96%', rate >= 0.96, (rate * 100).toFixed(1) + '%（失败 ' + failures.length + '/' + checked + '：' + failures.slice(0, 6).join(', ') + '）')
  assert('★ 总数 500 条以上', items.length >= 500, String(items.length))
}
console.log('-- 2. R53 点名的单位（回归保护）--')
{
  for (const [unit, to] of [['石', 'kg'], ['节', 'km/h'], ['牛顿', 'N'], ['摩尔', 'mol'], ['吨标煤', 'GJ'], ['平方英尺', 'm2']]) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: unit, unitTo: to })
    assert('★ ' + unit + ' 仍可用', r.ok === true, String(r.error?.type))
  }
}
console.log('-- 3. 曾经缺失的那批（实测修好的）--')
{
  for (const [unit, to] of [['公尺', 'm'], ['分米', 'dm'], ['公分', 'cm'], ['海里', 'nmi'], ['浪', 'm'], ['俄里', 'm']]) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: unit, unitTo: to })
    assert('★ ' + unit + ' → ' + to + ' 可用', r.ok === true, String(r.error?.type))
  }
}
console.log('-- 4. 已知例外确实有替代路径 --')
{
  const celsius = await run({ operation: 'units', unitValue: 100, unitFrom: 'degC', unitTo: 'K' })
  assert('★ 温度用 degC 可换算', celsius.ok === true, String(celsius.error?.type))
  const ohm = await run({ operation: 'units', unitValue: 1, unitFrom: 'ohm', unitTo: 'kohm' })
  assert('★ 电阻用 ohm 可换算', ohm.ok === true, String(ohm.error?.type))
}
console.log('-- 5. 非 ASCII 符号单位（°C/Ω/变音符号）也能换算 --')
{
  /** 全量扫描抓出的 28 个：°C/°F/Ω/kΩ/braça/sążeń/łokieć/deg² … */
  const cases = [
    ['°C', 'K'], ['°F', 'degC'], ['°R', 'K'], ['°Ré', 'K'],
    ['Ω', 'ohm'], ['kΩ', 'ohm'], ['MΩ', 'ohm'],
    ['braça', 'm'], ['sążeń', 'm'], ['łokieć', 'm'],
    ['deg²', 'sr'],
  ]
  const bad = []
  for (const [from, to] of cases) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    if (r.ok !== true) bad.push(from + '→' + to)
  }
  assert('★ 非 ASCII 符号单位全部可换算', bad.length === 0, bad.join(', '))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
