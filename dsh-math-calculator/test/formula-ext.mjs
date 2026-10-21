/**
 * 公式库扩展与符号消歧测试。
 *
 * 关键点：全局公式包是可写盘的（真正能扩展），并且校验必须挡住坏公式。
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 公式包读 $DSH_HOME，必须在 import 之前设定，避免污染真实家目录
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'formula-pack-'))

const { parseParamDesc, symbolMeanings, resolveSymbol, ambiguousSymbols, explainSymbol } =
  await import('../lib/symbols.js')
const { loadGlobalFormulas, packFilePath } = await import('../lib/formula-pack.js')
const mod = await import('../lib/index.js')

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}
const run = (args) => mod.runMathTool(args)

console.log('-- 1. 参数描述 → 概念 + 单位 --')
{
  assert('"质量1 kg"', JSON.stringify(parseParamDesc('质量1 kg')) === JSON.stringify({ concept: '质量1', unit: 'kg' }))
  assert('"距离 m"', JSON.stringify(parseParamDesc('距离 m')) === JSON.stringify({ concept: '距离', unit: 'm' }))
  assert('长单位优先（m/s 不被 s 截断）', parseParamDesc('速度 m/s').unit === 'm/s', parseParamDesc('速度 m/s').unit)
  assert('无单位', parseParamDesc('数组').unit === '')
}

console.log('-- 2. 符号索引与消歧 --')
{
  const meanings = symbolMeanings('m')
  assert('m 有多条含义', meanings.length > 5, String(meanings.length))
  assert('含义含单位', meanings.some((item) => item.unit === 'kg'))
  assert('含义含公式来源', meanings.every((item) => item.formulaId && item.formulaName))

  const massOnly = resolveSymbol('m', '质量')
  assert('按"质量"过滤有效', massOnly.length > 0 && massOnly.every((item) => item.concept.includes('质量')), String(massOnly.length))
  assert('按公式 id 过滤有效', resolveSymbol('m', 'hill_sphere').some((item) => item.formulaId === 'hill_sphere'))

  const ambiguous = ambiguousSymbols()
  assert('能列出多义符号', ambiguous.length > 10, String(ambiguous.length))
  assert('m 在列表里', ambiguous.some((item) => item.symbol === 'm'))
  assert('多义符号带解释', ambiguous.some((item) => item.note && item.note.includes('质量')))

  const text = explainSymbol('m').join('\n')
  assert('说明里含用法提示', text.includes('symbol:m@'), text.slice(0, 40))
}

console.log('-- 3. 公式检索里的符号查询 --')
{
  const one = run({ operation: 'formulas', query: 'symbol:m' })
  assert('symbol:m 有结果', String(one.result).includes('质量'), String(one.result).slice(0, 40))
  assert('返回结构化含义', Array.isArray(one.value.meanings) && one.value.meanings.length > 0)

  const all = run({ operation: 'formulas', query: 'symbol:*' })
  assert('symbol:* 列出多义符号', String(all.result).includes('多义符号'), String(all.result).slice(0, 30))
}

console.log('-- 4. 全局公式包：增删查 --')
{
  const before = loadGlobalFormulas()
  assert('初始为空', before.length === 0, String(before.length))

  const add = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: {
      id: 'my_weight_test',
      cat: 'physics/custom',
      name: '测试：重量',
      expr: 'm * g',
      params: { m: { value: 1, desc: '质量 kg' }, g: { value: 9.80665, desc: '重力加速度 m/s^2' } },
      unit: 'N',
      desc: 'F = mg，测试用。',
      keys: ['test', '测试'],
    },
  })
  assert('新增成功', !add.error, add.error ? add.error.message : '')
  assert('写盘成功', loadGlobalFormulas().some((item) => item.id === 'my_weight_test'))
  assert('文件落在 DSH_HOME 下', packFilePath().includes('formula-packs'))

  const call = run({ operation: 'formula', formula: 'my_weight_test', overrides: { m: 2 } })
  assert('新增公式立即可调用', !call.error && String(call.result).includes('19.6'), call.error ? call.error.message : String(call.result).slice(0, 30))

  const list = run({ operation: 'formula-table', tableAction: 'global-list' })
  assert('global-list 能看到', String(list.result).includes('my_weight_test'))

  const remove = run({ operation: 'formula-table', tableAction: 'global-remove', formulaId: 'my_weight_test' })
  assert('移除成功', String(remove.result).includes('已从全局公式包移除'))
  assert('移除后不可调用', Boolean(run({ operation: 'formula', formula: 'my_weight_test' }).error))
}

console.log('-- 5. 校验必须挡住坏公式 --')
{
  const badId = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: { id: 'Bad-ID', cat: 'x', name: '坏', expr: 'm', params: { m: { value: 1, desc: '质量 kg' } }, desc: 'x' },
  })
  assert('非法 id 被拒', Boolean(badId.error) && badId.error.message.includes('id'))

  const badExpr = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: { id: 'bad_expr', cat: 'x', name: '坏', expr: 'm *', params: { m: { value: 1, desc: '质量 kg' } }, desc: 'x' },
  })
  assert('坏表达式被拒', Boolean(badExpr.error))

  const unknownSymbol = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: {
      id: 'bad_symbol',
      cat: 'x',
      name: '坏',
      expr: 'm * typo_symbol',
      params: { m: { value: 1, desc: '质量 kg' } },
      desc: 'x',
    },
  })
  assert('未定义符号被拒', Boolean(unknownSymbol.error) && unknownSymbol.error.message.includes('typo_symbol'), unknownSymbol.error ? unknownSymbol.error.message.slice(0, 60) : '')

  const missingDesc = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: {
      id: 'missing_desc',
      cat: 'x',
      name: '坏',
      expr: 'm',
      params: { m: { value: 1, desc: '' } },
      desc: 'x',
    },
  })
  assert('参数缺描述被拒', Boolean(missingDesc.error))

  const duplicate = run({
    operation: 'formula-table',
    tableAction: 'global-add',
    customFormula: { id: 'gravitation', cat: 'x', name: '重名', expr: 'G', params: {}, desc: 'x' },
  })
  assert('与内置公式重名被拒', Boolean(duplicate.error), duplicate.error ? duplicate.error.message.slice(0, 40) : '')
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
