/**
 * 预存拓扑模板 + 1914 欧洲数据精修。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-tpl-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. 内置拓扑模板 --')
{
  const list = await run({ operation: 'topology', topology: { action: 'templates' } })
  assert('★ templates 列出 4 个', list.ok === true && list.value?.templates?.length === 4, String(list.value?.templates?.length))
  const load = await run({ operation: 'topology', topology: { action: 'load', modelKey: 'mine-supply' } })
  assert('★ load 内置模板（免 save）', load.ok === true && load.value?.nodes?.length === 7 && load.value?.template === true, JSON.stringify(load.error ?? null))
  const route = await run({ operation: 'topology', topology: { action: 'route', from: '矿场', to: '港口', nodes: load.value.nodes, edges: load.value.edges } })
  assert('★ 载入后可直接算最短路', route.ok === true && String(route.result).includes('km'), String(route.error?.message))
  const bad = await run({ operation: 'topology', topology: { action: 'load', modelKey: 'no-such' } })
  assert('未知模型 → not_found', bad.ok === false && bad.error?.type === 'not_found', String(bad.error?.type))
}
console.log('-- 2. 1914 欧洲数据精修 --')
{
  const out = await run({ operation: 'world-map', earthNode: 'pre-ww1', layers: ['powers'], asciiWidth: 90, asciiHeight: 45, viewBox: [-12, 60, 45, 33] })
  assert('★ pre-ww1 可出欧洲图', out.ok === true, String(out.error?.message))
  const cells = out.value?.cells ?? {}
  assert('★ 德意志帝国占格 > 200', (cells['德意志帝国'] ?? 0) > 200, String(cells['德意志帝国']))
  assert('★ 奥匈帝国 > 100', (cells['奥匈帝国'] ?? 0) > 100, String(cells['奥匈帝国']))
  assert('★ 俄罗斯帝国 > 500', (cells['俄罗斯帝国'] ?? 0) > 500, String(cells['俄罗斯帝国']))
  /** 巴尔干小国在图上有位置 */
  for (const name of ['塞尔维亚', '保加利亚', '罗马尼亚', '希腊']) {
    assert('★ ' + name + ' 可见', (cells[name] ?? 0) > 0, String(cells[name]))
  }
  assert('★ 政权数 ≥ 20（按史实细化）', Object.keys(cells).length >= 15, String(Object.keys(cells).length))
}
console.log('-- 3. 全球殖民地归属（对照 1914 世界图）--')
{
  const world = await run({ operation: 'world-map', earthNode: 'pre-ww1', layers: ['powers'], asciiWidth: 100, asciiHeight: 44 })
  const cells = world.value?.cells ?? {}
  /** 英帝国应最大之一（含印度、非洲、澳洲、加拿大） */
  assert('★ 英国占格 > 200（殖民地）', (cells['英国'] ?? 0) > 200, String(cells['英国']))
  assert('★ 俄罗斯帝国 > 200', (cells['俄罗斯帝国'] ?? 0) > 200, String(cells['俄罗斯帝国']))
  assert('★ 法兰西 > 60（非洲殖民地）', (cells['法兰西'] ?? 0) > 60, String(cells['法兰西']))
  /** 拉丁美洲独立国应成组出现 */
  assert('★ 拉丁美洲（独立）> 80', (cells['拉丁美洲（独立）'] ?? 0) > 80, String(cells['拉丁美洲（独立）']))
  /** 半独立/独立国 */
  for (const name of ['波斯', '暹罗', '阿富汗', '埃塞俄比亚']) {
    assert('★ ' + name + ' 独立可见', (cells[name] ?? 0) > 0, String(cells[name]))
  }
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
