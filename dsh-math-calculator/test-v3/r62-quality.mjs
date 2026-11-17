/**
 * R62 质量维度：性能基线 + 错误可读性 + 回溯对口性。
 *
 * 官方套件此前三块都是盲区（R61/R62 实测：无 performance/error-quality/backtrace-alignment）。
 * 性能阈值按本机实测放宽到 5 s，目的是「防秒级退化」，不是跑分。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-r62q-'))
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
async function timed(args) { const startedAt = Date.now(); const result = await run(args); return { result, ms: Date.now() - startedAt } }

console.log('-- 1. 性能底线（≤5 s，防秒级退化）--')
{
  const stats = await timed({ operation: 'stats', data: Array.from({ length: 100000 }, (_, index) => index % 1000) })
  assert('stats 10 万点 ≤5s，且成功', stats.result.ok === true && stats.ms <= 5000, stats.ms + 'ms')

  const nodes = Array.from({ length: 5000 }, (_, index) => ({ id: "n" + index, lat: (index % 90) - 45, lon: (index % 180) - 90 }))
  const edges = Array.from({ length: 4999 }, (_, index) => ({ from: "n" + index, to: "n" + (index + 1) }))
  const model = await timed({ operation: 'topology', topology: { action: 'model', nodes, edges } })
  assert('topology model 5000 节点 ≤5s', model.result.ok === true && model.ms <= 5000, model.ms + 'ms')

  const conflict = await timed({ operation: 'conflict', actors: [{ id: 'A', wealth: 100 }, { id: 'B', wealth: 80 }], edges: [{ from: 'A', to: 'B', type: 'trade' }], steps: 500, seed: 1 })
  assert('conflict 500 步 ≤5s', conflict.result.ok === true && conflict.ms <= 5000, conflict.ms + 'ms')

  const extract = await timed({ operation: 'extract_numbers', text: '人口 920 亿，兵力 80 万，粮仓 300 万石。'.repeat(2500) })
  assert('extract 约 5 万字 ≤5s', extract.result.ok === true && extract.ms <= 5000, extract.ms + 'ms')

  const longExpr = Array.from({ length: 8000 }, () => '1').join('+')
  const tooLong = await run({ operation: 'evaluate', expression: longExpr })
  assert('超长表达式明确拒绝（invalid_argument）', tooLong.ok === false && tooLong.error?.type === 'invalid_argument', JSON.stringify(tooLong.error?.type))
}

console.log('-- 2. 错误可读性 --')
{
  const missing = await run({ operation: 'evaluate', expression: '' })
  assert('缺参：missing_params + hint', missing.ok === false && missing.error?.type === 'missing_params' && typeof missing.error?.hint === 'string', JSON.stringify(missing.error).slice(0, 100))

  const noFormula = await run({ operation: 'formula', formula: 'no_such_formula_xyz' })
  assert('未知公式：unknown_formula + hint 指路', noFormula.ok === false && noFormula.error?.type === 'unknown_formula' && String(noFormula.error?.hint).includes('formulas'), JSON.stringify(noFormula.error).slice(0, 100))

  const badArg = await run({ operation: 'formula', formula: 'kinetic_energy', overrides: { foo: 1 } })
  assert('错参数名：明确报，且 hint 提示正确参数 m/v', badArg.ok === false && ['unknown_argument', 'missing_params'].includes(String(badArg.error?.type)) && /\bm\b/.test(String(badArg.error?.hint)) && /\bv\b/.test(String(badArg.error?.hint)), JSON.stringify(badArg.error).slice(0, 140))

  const unitBad = await run({ operation: 'formula', formula: 'beam_section_modulus', overrides: { b: '1 kg', h: '0.15 m' } })
  assert('量纲不符：unit_mismatch 且写期望/收到', unitBad.ok === false && unitBad.error?.type === 'unit_mismatch' && String(unitBad.error?.message).includes('期望') && String(unitBad.error?.message).includes('收到'), JSON.stringify(unitBad.error).slice(0, 120))

  const errors = [missing, noFormula, badArg, unitBad]
  assert('所有错误都有 type 与 message', errors.every((r) => typeof r.error?.type === 'string' && typeof r.error?.message === 'string'), '')
  assert('没有 [object Object]', errors.every((r) => !String(r.result).includes('[object Object]')), '')
}

console.log('-- 3. 回溯对口 --')
{
  const kiln = await run({ operation: 'backtrace', target: '这座窑一天烧多少煤' })
  assert('窑 → 第一命中窑炉热平衡', kiln.value.matches[0].id === 'kiln_heat_balance', JSON.stringify(kiln.value.matches.slice(0, 3).map((m) => m.id)))
  assert('推荐链含窑炉', String(kiln.result).includes('窑炉热平衡'), String(kiln.result).slice(0, 110))

  const people = await run({ operation: 'backtrace', target: '这片土地能养活多少人' })
  assert('养多少人 → 命中人口/承载相关', people.ok === true && (String(people.result).includes('养活') || String(people.result).includes('人口') || String(people.result).includes('承载')), String(people.result).slice(0, 140))

  const none = await run({ operation: 'backtrace', target: 'xyzzy plugh frobnicate' })
  assert('无匹配 → 明确说没找到，不硬编', none.ok === true && String(none.result).includes('没找到匹配公式'), String(none.result).slice(0, 120))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
