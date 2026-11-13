/**
 * 跑全部 v3 套件（发版前用）。
 *
 * 老的 test/ 套件已随阶段 2 删除；这里跑 test-v3/*.mjs，逐个独立进程，
 * 汇总失败；有失败就以非零退出。
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dir = join(root, 'test-v3')
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort()
let failed = []
let total = 0
for (const file of files) {
  const run = spawnSync(process.execPath, [join(dir, file)], { cwd: root, encoding: 'utf8' })
  const last = (run.stdout ?? '').trim().split('\n').pop() ?? ''
  const m = /通过 (\d+)，失败 (\d+)/.exec(last)
  if (m) total += Number(m[1])
  if (run.status !== 0) failed.push(file)
  console.log((run.status === 0 ? 'ok   ' : 'FAIL ') + file + '  ' + last)
}
console.log('')
console.log('套件 ' + files.length + '，项 ' + total + '，失败套件 ' + failed.length)
if (failed.length > 0) {
  for (const f of failed) console.log('  - ' + f)
  process.exit(1)
}
