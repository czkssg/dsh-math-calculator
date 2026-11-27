/** 复合单位的显示归约 + 带单位结果的非有限拦截。
 *
 * 2026-11-27 审计发现两个真缺陷：
 * ① `1 kg*m/s^2` 显示成 `0.00010197 tonf`、`1 J/s` → `erg_per_s`、`1 N/m^2` → `Ba`、
 *    `1 m^3/s` → `cfm`——数值对但读者看不懂（踩坑表 1.4/1.5 的第三次复发）；
 * ② `1 m / 0 s` 返回 `Infinity 日行里快`——**带单位的除零没被拦**（裸 1/0 会拦）。
 *
 * 修法：result 与 value 两条路径共用 format.ts 的 normalizeDisplayedUnit；
 * evaluate 补 Unit 的 magnitude 非有限检查。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-composite-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const tool = toolMod.mathExecuteTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. 复合单位应归约到标准 SI（result 与 value 同源）--')
{
  const cases = [
    ['1 kg*m/s^2', 'N', 'tonf'],
    ['1 J/s', 'W', 'erg'],
    ['1 N/m^2', 'Pa', 'Ba'],
    ['1 m^3/s', 'm^3', 'cfm'],
  ]
  for (const [expr, wantUnit, badName] of cases) {
    const r = await run({ operation: 'evaluate', expression: expr })
    const result = String(r.result || '')
    const valueText = JSON.stringify(r.value || '')
    assert(expr + ' → ' + wantUnit, r.ok === true && result.includes(wantUnit) && !result.includes(badName), result.slice(0, 60))
    assert(expr + ' 的 value 也不再是冷门名', !valueText.includes(badName) && valueText.includes(wantUnit), valueText.slice(0, 80))
  }
}

console.log('-- 2. 带单位的除零必须报错（不静默给 Infinity）--')
{
  for (const expr of ['1 m / 0 s', '1 kg / 0 m^3']) {
    const r = await run({ operation: 'evaluate', expression: expr })
    const bad = r.ok === false || /Infinity/.test(String(r.result || '')) === false && r.ok === false
    const text = r.ok === true ? String(r.result) : String((r.error && r.error.message) || '')
    assert(expr + ' 报错而非给 Infinity', r.ok === false && !/Infinity/.test(text) === true || (r.ok === false && /有限|non_finite/.test(text)), text.slice(0, 70))
  }
}

console.log('-- 3. 不误伤用户显式单位 --')
{
  const cases = [
    ['5 m/s', 'm'],
    ['5 m/s to km/h', 'km'],
    ['1 kg to 担', '担'],
    ['100 degC to degF', 'degF'],
    ['10 hp to kW', 'kW'],
    ['1 里 to m', 'm'],
    ['1 mile to km', 'km'],
  ]
  for (const [expr, want] of cases) {
    const r = await run({ operation: 'evaluate', expression: expr })
    const result = String(r.result || '')
    assert(expr + ' 保留 ' + want, r.ok === true && result.includes(want), result.slice(0, 60))
  }
}

console.log('-- 4. 已知 SI 与单位换算仍正确 --')
{
  const checks = [
    ['1 m to cm', '100'],
    ['1 kWh to J', '3600000'],
    ['1 N*m to J', '1'],
    ['1 bar to kPa', '100'],
    ['1 时辰 to hour', '2'],
    ['1 亩 to m^2', '666'],
  ]
  for (const [expr, want] of checks) {
    const r = await run({ operation: 'evaluate', expression: expr })
    assert(expr + ' 含 ' + want, r.ok === true && String(r.result).includes(want), String(r.result).slice(0, 60))
  }
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
