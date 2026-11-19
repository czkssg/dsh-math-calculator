/**
 * 批量 calls 的 label：显示在每条结果头、写进 value.results、不再报「认不出来」。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-label-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (args) => mathExecuteTool.execute(args, {})
console.log('-- 1. calls 带 label --')
{
  const out = await run({ calls: [
    { operation: 'evaluate', label: '电解·耗电', expression: '(400 kW * (2 s / 1)) to MJ', displayPrecision: 4 },
    { operation: 'units', label: '换算 200MJ', unitFrom: 'MJ', unitTo: 'kWh', unitValue: 200 },
    { operation: 'evaluate', expression: '1+1' },
  ] })
  assert('★ 全部成功', out.ok === true && out.succeeded === 3, String(out.succeeded))
  assert('★ 不再报「认不出来」', !String(out.result).includes('认不出来'), '')
  assert('★ 结果头带标签', /\[1\] evaluate（电解·耗电）/.test(String(out.result)), String(out.result).split('\n').find((l) => l.startsWith('── ')) ?? '')
  const labels = (out.value?.results ?? []).map((item) => item.label)
  assert('★ value.results 带 label', labels[0] === '电解·耗电' && labels[1] === '换算 200MJ', JSON.stringify(labels))
  assert('无 label 的条目不产生 label 键', labels[2] === undefined, JSON.stringify(labels[2]))
}
console.log('-- 2. expressions 的 label --')
{
  const out = await run({ operation: 'evaluate', expressions: [{ label: '甲', expr: '1+1' }, { label: '乙', expr: '2+2' }] })
  assert('★ expressions 带 label 可算', out.ok === true, String(out.error?.type))
  assert('结果里能看到标签', String(out.result).includes('甲') && String(out.result).includes('乙'), String(out.result).slice(0, 80))
}
console.log('-- 3. 单条带 label 不报错 --')
{
  const out = await run({ operation: 'evaluate', label: '单条标签', expression: '1+1' })
  assert('单条 label 被接受（不警告）', out.ok === true && !String(out.notice ?? '').includes('认不出来'), String(out.notice).slice(0, 60))
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }