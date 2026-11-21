/**
 * 地图模型（save/load/list）与地图导出（txt/md/json）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-mapmodel-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
const BASE = { operation: 'world-map', mapWidth: 200, mapHeight: 100, mapSeed: 7, nationCount: 4 }
console.log('-- 1. 地图模型 --')
{
  const save = await run({ ...BASE, mapModel: 'save', modelName: '北境地图' })
  assert('★ save 成功', save.ok === true && String(save.result).includes('北境地图'), String(save.error?.message))
  const load = await run({ operation: 'world-map', mapModel: 'load', modelName: '北境地图' })
  assert('★ load 重建出图', load.ok === true && String(load.result).includes('北境地图') && String(load.result).includes('比例尺'), String(load.error?.message))
  const list = await run({ operation: 'world-map', mapModel: 'list' })
  assert('★ list 列出模型', list.ok === true && list.value?.models?.some((m) => m.name === '北境地图'), JSON.stringify(list.value?.models))
  const missing = await run({ operation: 'world-map', mapModel: 'load', modelName: '不存在' })
  assert('未知模型 → unknown_symbol', missing.ok === false && missing.error?.type === 'unknown_symbol', String(missing.error?.type))
  const bad = await run({ operation: 'world-map', mapModel: 'nope', modelName: 'x' })
  assert('未知动作 → unknown_argument', bad.ok === false && bad.error?.type === 'unknown_argument', String(bad.error?.type))
}
console.log('-- 2. 地图导出 --')
{
  const md = await run({ ...BASE, export: 'md' })
  assert('★ 导出 md 文件', md.ok === true && existsSync(String(md.value?.exportPath)), String(md.value?.exportPath))
  const text = readFileSync(String(md.value?.exportPath), 'utf8')
  assert('★ 文件含标题与地图代码块', text.includes('# 世界地图') && text.includes('比例尺'), '')
  const json = await run({ ...BASE, export: 'json' })
  assert('★ 导出 json 文件', json.ok === true && existsSync(String(json.value?.exportPath)), '')
  const earth = await run({ operation: 'world-map', earthEra: '1500', export: 'md' })
  assert('★ 地球时期图也能导出', earth.ok === true && existsSync(String(earth.value?.exportPath)), '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
