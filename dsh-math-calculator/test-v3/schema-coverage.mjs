/**
 * schema 覆盖率守护（实测记录 R45/R46 的根因测试）。
 *
 * 真实缺陷：52 个键在 dispatch/WorldParams 里被读取，但 schema 未声明 →
 * 校验阶段被丢弃 → 参数静默忽略（starType、orbitAU、ledger 全是这个原因）。
 */
import { mkdtempSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
process.env.DSH_MATH_CALC_LOG = 'off'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-schema-'))
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
console.log('-- 1. schema 覆盖所有被读取的键 --')
{
  const toolSource = readFileSync(join(root, 'src/tool.ts'), 'utf8')
  const start = toolSource.indexOf('const PARAMETER_SPEC = {')
  const end = toolSource.indexOf('} as const', start)
  const specKeys = new Set([...toolSource.slice(start, end).matchAll(/(?:^|\n)\s{2,4}([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/g)].map((m) => m[1]))
  const dispatchSource = readFileSync(join(root, 'src/dispatch.ts'), 'utf8')
  const usedKeys = new Set()
  for (const m of dispatchSource.matchAll(/args\['([^']+)'\]/g)) usedKeys.add(m[1])
  const worldSource = readFileSync(join(root, 'src/features/deduction/world.ts'), 'utf8')
  const wi = worldSource.indexOf('export interface WorldParams')
  const wj = worldSource.indexOf('}', wi)
  for (const m of worldSource.slice(wi, wj).matchAll(/^  ([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)) usedKeys.add(m[1])
  const missing = [...usedKeys].filter((key) => !specKeys.has(key))
  assert('★ 使用键全部在 schema 里（缺 0 个）', missing.length === 0, missing.join(', '))
  assert('schema 键数 > 200', specKeys.size > 200, String(specKeys.size))
}
console.log('-- 2. 恒星参数：别名归一 + 未知提示 --')
{
  const byTemp = await run({ operation: 'world', starTemp: 4500 })
  assert('★ starTemp 4500 → K 型', byTemp.ok === true && byTemp.result.includes('K 型'), byTemp.result.slice(0, 40))
  const alias = await run({ operation: 'world', starType: 'K型' })
  assert('★ starType 别名生效（认成 K 型）', String(alias.result).includes('K 型'), String(alias.result).slice(0, 40))
  assert('★ 别名生效的同时仍提示原名不认识', String(alias.notice ?? '').includes('starType'), String(alias.notice ?? '').slice(0, 60))
  const unknown = await run({ operation: 'world', starLuminosity: 5 })
  assert('★ 未知参数必须报出来', String(unknown.notice ?? '').includes('starLuminosity'), String(unknown.notice ?? '').slice(0, 60))
  const clean = await run({ operation: 'world', starTemp: 4500 })
  assert('★ 不认识时才提示（starTemp 不提示）', !String(clean.notice ?? '').includes('认不出来'), String(clean.notice ?? '').slice(0, 60))
}
console.log('-- 3. 记录里点名的缺陷项 --')
{
  const starClass = await run({ operation: 'world', starClass: 'K5V' })
  assert('★ starClass 生效（K 型橙矮星）', starClass.ok === true && String(starClass.result).includes('K 型橙矮星'), String(starClass.result).slice(0, 50))
  const orbit = await run({ operation: 'world', orbitAU: 2 })
  assert('★ orbitAU 生效（一年约 1033 天）', String(orbit.result).includes('1033'), String(orbit.result).slice(0, 80))
  const ledger = await run({ operation: 'ledger', ledger: { 士: 1, 农: 85, 工: 10, 商: 4 } })
  assert('★ ledger 占比简写可用', ledger.ok === true && String(ledger.result).includes('闭合'), String(ledger.result).slice(0, 60))
  const ws = await run({ operation: 'workspace', workspace: 'list' })
  assert('★ workspace 传字符串可用', ws.ok === true, String(ws.result).slice(0, 50))
}
console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
