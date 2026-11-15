/**
 * 二次加工原料：LCG PRNG（Psychohistory）+ 纪元划分（WorldBuilding/extrema）。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-history-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const prngMod = await import(pathToFileURL(join(root, 'lib/core/prng.js')).href)
const histMod = await import(pathToFileURL(join(root, 'lib/features/deduction/history.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
async function run(args) { return tool.execute(args, {}) }

console.log('-- 1. LCG 确定性（同种子同序列）--')
{
  const a = prngMod.createPrng(prngMod.seedFrom(500, 4000))
  const b = prngMod.createPrng(prngMod.seedFrom(500, 4000))
  const seqA = [0, 1, 2, 3, 4].map(() => prngMod.roll(a))
  const seqB = [0, 1, 2, 3, 4].map(() => prngMod.roll(b))
  assert('★ 同种子 → 同序列（可复现）', JSON.stringify(seqA) === JSON.stringify(seqB), '')
  const c = prngMod.createPrng(prngMod.seedFrom(500, 4001))
  assert('不同种子 → 不同序列', seqA[0] !== prngMod.roll(c), '')
  assert('取值落在 [0,1)', seqA.every((x) => x >= 0 && x < 1), '')
  assert('rollInt 落在区间内', [1, 2, 3].every(() => { const s = prngMod.createPrng(7); const v = prngMod.rollInt(s, 10, 20); return v >= 10 && v <= 20 }), '')
}

console.log('-- 2. 纪元划分 --')
{
  const r = histMod.buildEpochs({ series: [{ year: 0, value: 100 }, { year: 20, value: 130 }, { year: 40, value: 90 }, { year: 60, value: 150 }, { year: 80, value: 120 }], events: [{ year: 10, label: '瘟疫' }, { year: 50, label: '新王朝' }] })
  assert('★ 四个纪元', r.epochs.length === 4, String(r.epochs.length))
  assert('★ rise/fall 交替', r.epochs.map((e) => e.turn).join(',') === 'rise,fall,rise,fall', r.epochs.map((e) => e.turn).join(','))
  assert('事件归入正确纪元', r.epochs[0].events.length === 1 && r.epochs[0].events[0].label === '瘟疫', JSON.stringify(r.epochs[0].events))
  assert('转折年被检出（20/40/60）', r.turningPoints.includes(20) && r.turningPoints.includes(40), JSON.stringify(r.turningPoints))
}

console.log('-- 3. 最小纪元长度过滤噪声 --')
{
  const noisy = Array.from({ length: 40 }, (_, i) => ({ year: i, value: 100 + (i % 2 === 0 ? 5 : -5) }))
  const r = histMod.buildEpochs({ series: noisy, minEpochYears: 10 })
  assert('★ 高频噪声不切碎纪元（仍较大段）', r.epochs.length <= 5, String(r.epochs.length))
}

console.log('-- 4. 经 tool --')
{
  const out = await run({ operation: 'history', series: [{ year: 0, value: 100 }, { year: 20, value: 130 }, { year: 40, value: 90 }], events: [{ year: 10, label: '瘟疫' }] })
  assert('★ history 经 tool', out.ok === true && out.result.includes('历史纪元划分'), out.result.slice(0, 60))
  const bad = await run({ operation: 'history', series: [{ year: 0, value: 1 }] })
  assert('少于 2 点 → invalid_argument', bad.ok === false && bad.error.type === 'invalid_argument', '')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
