/**
 * units_audit 行为测试：组内量纲一致性 + 裸数字护栏。
 *
 * 这个 op 是反馈包 N12 新增的（老插件里没有），所以测的是需求本身：
 *   · 同一个量在不同位置给了不同量纲 → 报 conflict，且不判断哪个对；
 *   · 数字后面没有单位 → 进裸数字护栏；
 *   · 不认识的单位 → unknown-unit，不静默当无量纲。
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-units-audit-'))
const mod = await import(pathToFileURL(join(root, 'lib/features/graph/units-audit.js')).href)
const units = JSON.parse(readFileSync(join(root, 'src/data/units.json'), 'utf8')).ALL_UNITS

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
function throwsOf(fn) { try { fn(); return null } catch (error) { return error } }

console.log('-- 1. 单位解析 --')
{
  assert('吨 → mass', mod.dimensionOf(new Map([['吨', { name: '吨', dimension: 'mass' }]]), '吨') === 'mass', '')
  const out = mod.runUnitsAudit({ claims: [{ name: '年产量', unit: '吨' }] }, units)
  assert('吨认识 → ok', out.value.findings[0].status === 'ok', out.value.findings[0].status)
  const compound = mod.runUnitsAudit({ claims: [{ name: '年产量', unit: '吨/年' }] }, units)
  assert('★ 吨/年 → mass/time', compound.value.findings[0].dimension === 'mass/time', compound.value.findings[0].dimension)
  const unknown = mod.runUnitsAudit({ claims: [{ name: '奇怪量', unit: 'xyz' }] }, units)
  assert('★ 不认识单位 → unknown-unit', unknown.value.findings[0].status === 'unknown-unit', unknown.value.findings[0].status)
}

console.log('-- 2. ★ 组内量纲冲突 --')
{
  const out = mod.runUnitsAudit({
    claims: [
      { name: '年产量', unit: '吨' },
      { name: '年产量', unit: '米' },
    ],
  }, units)
  assert('★ 同名量两处量纲不同 → conflict', out.value.findings.every((f) => f.status === 'conflict'), JSON.stringify(out.value.findings.map((f) => f.status)))
  assert('消息列出两种量纲', out.value.findings[0].message.includes('mass') && out.value.findings[0].message.includes('length'), out.value.findings[0].message)
  assert('★ 不判断哪个对', out.result.includes('不判断哪个对'), out.result)
}

console.log('-- 3. 裸数字护栏 --')
{
  const out = mod.runUnitsAudit({ text: '年产量 2.66，人口 3 万，军队 5 万人。' }, units)
  assert('★ 检出裸数字 2.66', out.value.bareNumbers.some((item) => item.raw === '2.66'), JSON.stringify(out.value.bareNumbers))
  assert('★ 「3 万」不算裸数字（量级词是单位线索）', !out.value.bareNumbers.some((item) => item.raw === '3'), JSON.stringify(out.value.bareNumbers.map((b) => b.raw)))
  assert('裸数字带上下文', out.value.bareNumbers[0].context.includes('年产量'), out.value.bareNumbers[0].context)
  assert('result 有护栏段', out.result.includes('裸数字护栏'), '')
  assert('notice 提示裸数字数', (out.notice ?? '').includes('裸数字'), String(out.notice))
}

console.log('-- 4. expect 判据 --')
{
  const ok = mod.runUnitsAudit({ claims: [{ name: '人口', unit: '吨', expect: ['mass'] }] }, units)
  assert('expect 命中 → ok', ok.value.findings[0].status === 'ok', ok.value.findings[0].status)
  const bad = mod.runUnitsAudit({ claims: [{ name: '长度', unit: '吨', expect: ['length'] }] }, units)
  assert('★ expect 不符 → mismatch', bad.value.findings[0].status === 'mismatch', bad.value.findings[0].status)
  assert('mismatch 消息给两边量纲', bad.value.findings[0].message.includes('mass') && bad.value.findings[0].message.includes('length'), bad.value.findings[0].message)
}

console.log('-- 5. 边界 --')
{
  assert('无输入 → missing_params', throwsOf(() => mod.runUnitsAudit(undefined, units))?.type === 'missing_params', '')
  assert('空 claims 且无 text → missing_params', throwsOf(() => mod.runUnitsAudit({ claims: [] }, units))?.type === 'missing_params', '')
  assert('claim 缺 name → invalid_argument', throwsOf(() => mod.runUnitsAudit({ claims: [{ unit: '吨' }] }, units))?.type === 'invalid_argument', '')
  const missing = mod.runUnitsAudit({ claims: [{ name: '人口' }] }, units)
  assert('★ 没给单位 → missing-unit（不当无量纲）', missing.value.findings[0].status === 'missing-unit', missing.value.findings[0].status)
  const multiSlash = mod.runUnitsAudit({ claims: [{ name: '怪量', unit: 'a/b/c' }] }, units)
  assert('两次以上斜杠 → unknown-unit（不猜）', multiSlash.value.findings[0].status === 'unknown-unit', multiSlash.value.findings[0].status)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
