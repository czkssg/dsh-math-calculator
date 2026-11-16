/**
 * 扩展地形（R49）：ocean/volcano/ice/gas/urban/hive/sea/cave/sky/space 都要能传且有效应。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-terrain-'))
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
const NEW_KINDS = ['ocean', 'sea', 'ice', 'volcano', 'gas', 'urban', 'hive', 'cave', 'sky', 'space']
console.log('-- 1. 10 种新地形全部可用 --')
{
  let bad = []
  for (const kind of NEW_KINDS) {
    const r = await run({ operation: 'world', terrain: { kind } })
    if (r.ok !== true) bad.push(kind + ':' + (r.error?.type ?? '?'))
    else if (!String(r.result).includes('局地地形气候')) bad.push(kind + ':无局地段')
    else if (r.value === undefined || r.value.localClimate === undefined) bad.push(kind + ':value 缺')
  }
  assert('★ 10 种全部可传且带局地气候', bad.length === 0, bad.join(', '))
}
console.log('-- 2. 效应真的出现（不只是参数被接受）--')
{
  const volcano = await run({ operation: 'world', terrain: { kind: 'volcano' } })
  assert('★ 火山提到地热/硫化物', String(volcano.result).includes('地热') || String(volcano.result).includes('硫'), '')
  const urban = await run({ operation: 'world', terrain: { kind: 'urban' } })
  assert('★ 城市提到热岛', String(urban.result).includes('热岛'), '')
  const ice = await run({ operation: 'world', terrain: { kind: 'ice' } })
  assert('★ 冰原提到反照率', String(ice.result).includes('反照率'), '')
  const hive = await run({ operation: 'world', terrain: { kind: 'hive' } })
  assert('★ 蜂巢提到人工通风/照明', String(hive.result).includes('通风') || String(hive.result).includes('照明'), '')
}
console.log('-- 3. 无地表环境不输出陆地气候量（R49 自相矛盾修复）--')
{
  const space = await run({ operation: 'world', terrain: { kind: 'space' } })
  const text = String(space.result)
  assert('★ 太空站不印「年均温 X°C」', !text.includes('年均温 '), text.slice(text.indexOf('局地地形气候'), text.indexOf('局地地形气候') + 120))
  assert('★ 太空站说「不适用」', text.includes('不适用'), '')
  assert('★ 太空站提到真空/辐射散热', text.includes('真空') || text.includes('辐射'), '')
  const gas = await run({ operation: 'world', terrain: { kind: 'gas' } })
  assert('★ 气态巨行星也不印年均温', !String(gas.result).includes('年均温 '), '')
  assert('★ 气态巨行星提到浮力/无固体表面', String(gas.result).includes('浮力') || String(gas.result).includes('没有固体表面'), '')
}
console.log('-- 4. 洞窟不露天（不输出海滨/降水充沛）--')
{
  const cave = await run({ operation: 'world', terrain: { kind: 'cave' } })
  const text = String(cave.result)
  assert('★ 洞窟年降水 0', text.includes('年降水 0 mm'), '')
  assert('★ 洞窟不说「降水充沛/淋溶」', !text.includes('降水充沛') && !text.includes('淋溶'), '')
  assert('★ 洞窟不说「海滨晨雾」', !text.includes('海滨'), '')
}
console.log('-- 5. 拼错仍要报错（不静默）--')
{
  const bad = await run({ operation: 'world', terrain: { kind: 'coastel' } })
  assert('★ 拼错 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', String(bad.error?.type))
  assert('hint 列出可用地形', String(bad.error.hint).includes('ocean'), String(bad.error.hint).slice(0, 60))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
