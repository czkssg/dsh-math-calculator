/**
 * R62 数字形态矩阵（consistency）
 *
 * R61 实测 10 种形态全部抽 0；这里逐种锁住「抽取条数 + 判定」。
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

console.log('-- 抽取 + 判定矩阵 --')
{
  const cases = [
    ['负数', ['反应焓变 -876 kJ/mol', '反应焓变 -324 kJ/mol'], true, '2.7'],
    ['科学计数', ['储量 1e12 吨', '储量 1e13 吨'], true, '10'],
    ['区间（点在区间内）', ['产能 50-60 吨', '产能 55 吨'], false, ''],
    ['中文大写', ['储备 壹仟贰佰 吨', '储备 二千 吨'], true, '1.7'],
    ['百分比（50% = 0.5）', ['税率 50%', '税率 0.5'], false, ''],
    ['倍（2 倍 = 200%）', ['增长 2 倍', '增长 200%'], false, ''],
    ['单位混用（1 km = 1000 m）', ['距离 1 km', '距离 1000 m'], false, ''],
    ['复合单位（25 MJ/kg = 25000 kJ/kg）', ['热值 25 MJ/kg', '热值 25000 kJ/kg'], false, ''],
    ['亿万（1 亿 = 10000 万）', ['人口 1 亿', '人口 10000 万'], false, ''],
    ['负区间（-7 在 -10~-5）', ['温度 -10~-5', '温度 -7'], false, ''],
  ]
  for (const [name, texts, expectConflict, ratioText] of cases) {
    const r = await run({ operation: 'consistency', consistency: { sections: texts.map((text, index) => ({ number: index + 1, text })) } })
    assert(name + ' 抽出 2 条', r.value.claimCount === 2, JSON.stringify(r.value.claimCount))
    const conflict = String(r.result).includes('口径冲突')
    assert(name + (expectConflict ? ' 判冲突' : ' 判相容'), conflict === expectConflict, String(r.result).slice(0, 110))
    if (ratioText !== '') assert(name + ' 倍数 ≈ ' + ratioText, String(r.result).includes('差 ' + ratioText), String(r.result).slice(0, 130))
  }
}

console.log('-- 边界 --')
{
  const opposite = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '功率 +876 W' }, { number: 2, text: '功率 -876 W' }] } })
  assert('正负相反 → 冲突', String(opposite.result).includes('口径冲突'), opposite.result.slice(0, 110))
  const zero = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '库存 0 件' }, { number: 2, text: '库存 0 件' }] } })
  assert('同值不报', !String(zero.result).includes('口径冲突'), zero.result.slice(0, 100))
  const rangeOut = await run({ operation: 'consistency', consistency: { sections: [{ number: 1, text: '产能 50-60 吨' }, { number: 2, text: '产能 90 吨' }] } })
  assert('点落在区间外 → 冲突', String(rangeOut.result).includes('口径冲突'), rangeOut.result.slice(0, 120))
  const empty = await run({ operation: 'consistency', consistency: { sections: [] } })
  assert('空片段 → missing_params', empty.ok === false && empty.error?.type === 'missing_params', JSON.stringify(empty.error))
}

console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
