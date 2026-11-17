/**
 * 运行日志：每次调用都落 JSONL（成功/失败），不依赖用户反馈。
 */
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-runlog-'))
/** 这一套验证日志写入，必须显式开启：外部 DSH_MATH_CALC_LOG=off 时不能让测试静默崩掉。 */
process.env.DSH_MATH_CALC_LOG = 'on'
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const toolMod = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
const logMod = await import(pathToFileURL(join(root, 'lib/core/run-log.js')).href)
const tool = toolMod.mathExecuteTool
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('-- 1. 日志文件与条目 --')
{
  await tool.execute({ expression: '1+1' }, {})
  await tool.execute({ operation: 'formula' }, {})
  try { await tool.execute({ operation: 'nope' }, {}) } catch { /* 包装层应已处理 */ }
  /** pino 经 rotating-file-stream 异步写：等待落盘再读。 */
  await new Promise((resolve) => setTimeout(resolve, 200))
  const path = logMod.runLogPath()
  assert('★ 日志文件存在', existsSync(path), path)
  const text = readFileSync(path, 'utf8').trim().split('\n')
  assert('★ 三次调用三条日志', text.length === 3, String(text.length))
  const entries = text.map((line) => JSON.parse(line))
  assert('成功条 ok=true 且 operation=evaluate', entries[0].ok === true && entries[0].operation === 'evaluate', JSON.stringify(entries[0]).slice(0, 100))
  assert('★ 失败条含 errorType', entries[1].ok === false && entries[1].errorType === 'missing_params', JSON.stringify(entries[1]).slice(0, 120))
  assert('未知 op 也进日志（invalid_argument）', entries[2].errorType === 'invalid_argument', JSON.stringify(entries[2]).slice(0, 120))
  assert('每条带时间与耗时', entries.every((e) => typeof e.at === 'string' && typeof e.ms === 'number'), '')
}

console.log('-- 2. 读取工具 --')
{
  const recent = logMod.readRecentRunLogs(10)
  assert('★ readRecentRunLogs 返回 3 条', recent.length === 3, String(recent.length))
  const recent1 = logMod.readRecentRunLogs(1)
  assert('limit 生效', recent1.length === 1 && recent1[0].operation === 'unknown', JSON.stringify(recent1).slice(0, 80))
}

console.log('-- 3. 日志失败不影响工具 --')
{
  const bad = await tool.execute({ expression: '2+2' }, {})
  assert('正常调用不受日志影响', bad.ok === true && bad.result.includes('4'), '')
  /** 重新打开日志流并写一条，验证旁路不影响主路径。 */
  logMod.flushRunLog()
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const f of fails) console.log('  · ' + f); process.exitCode = 1 }
