/**
 * R62 声明符合性（sanity / 多步链 / help 节名）
 *
 * 官方套件从无「该警告」与「声明了要做」类断言（R61/R62 建议 P0-1）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r62-'))
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

console.log('-- 1. sanity 三态 --')
{
  const big = await run({ operation: 'evaluate', expressions: [{ label: '大', expr: '1e12', sanity: { max: 1e10, note: '上限' } }] })
  assert('★ 超上限 → 警告（第三态）', big.result.includes('超出锚点上限') && big.result.includes('达 100 倍'), big.result.slice(0, 120))
  assert('violated 落进 value', big.value.items[0].sanityStatus === 'violated', JSON.stringify(big.value.items[0].sanityStatus))
  const low = await run({ operation: 'evaluate', expressions: [{ label: '小', expr: '1', sanity: { min: 10 } }] })
  assert('低于下限 → 警告', low.result.includes('低于锚点下限'), low.result.slice(0, 120))
  const mag = await run({ operation: 'evaluate', expressions: [{ label: '量级', expr: '1e3', sanity: { expect: 6 } }] })
  assert('量级差 3 个数级 → 警告', mag.result.includes('与锚点量级'), mag.result.slice(0, 120))
  const ok = await run({ operation: 'evaluate', expressions: [{ label: '正常', expr: '100', sanity: { max: 1000 } }] })
  assert('未越界 → 不打扰且 passed', ok.value.items[0].sanityStatus === 'passed' && !ok.result.includes('锚点'), ok.result.slice(0, 100))
  const none = await run({ operation: 'evaluate', expressions: [{ label: '无判据', expr: '1e12' }] })
  assert('不声明 → 零提示', !none.result.includes('锚点'), '')
}

console.log('-- 2. 多步链 --')
{
  const chain = await run({ operation: 'evaluate', expressions: [{ label: '赋值', expr: 'u=5' }, { label: '小计', expr: 'u*3' }] })
  assert('★ 前一条赋值对后一条可见（u=5 → u*3 = 15）', chain.result.includes('= 15'), chain.result.slice(0, 160))
  const failMid = await run({ operation: 'evaluate', expressions: [{ label: '坏', expr: 'v=' }, { label: '下游', expr: 'v*2' }] })
  assert('中游失败 → 下游明确报错（非虚成功）', failMid.value.items[1].ok === false && failMid.result.includes('失败'), failMid.result.slice(0, 140))
  const multi = await run({ operation: 'evaluate', expressions: [{ label: 'a', expr: 'x=2' }, { label: 'b', expr: 'y=x+3' }, { label: 'c', expr: 'y*2' }] })
  assert('三段链全部成功', multi.value.succeeded === 3 && multi.result.includes('= 10'), multi.result.slice(0, 160))
}

console.log('-- 3. help 节覆盖（声明了就要能查到）--')
{
  const topics = [
    ['拓扑', 'topology'], ['单位', 'units'], ['公式', 'formula'], ['星球', 'world'],
    ['推演', 'derivation'], ['天文', 'astro'], ['历史', 'history'], ['冲突', 'conflict'],
    ['同一量', 'consistency'], ['账本', 'ledger'], ['区间', 'interval'], ['回溯', 'backtrace'],
    ['help', 'help'], ['工作区', 'workspace'], ['常数', 'constants'], ['编制', 'hierarchy'],
  ]
  for (const [query, expect] of topics) {
    const r = await run({ operation: 'help', helpQuery: query })
    assert('helpQuery「' + query + '」命中 ' + expect, String(r.result).includes(expect), String(r.result).slice(0, 90))
  }
  const topo = await run({ operation: 'help', helpTopic: '拓扑' })
  assert('★ helpTopic「拓扑」取到全文', String(topo.result).includes('【拓扑】'), String(topo.result).slice(0, 90))
  const dir = await run({ operation: 'help' })
  assert('目录列出 topology 节', String(dir.result).includes('topology'), '')
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
