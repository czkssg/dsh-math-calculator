/**
 * 工作区作用域测试：数据表跟着「会话工作目录」走。
 *
 * 依据 dsh-memory 的做法（lib/util.js 的 scopeOf）：
 * 作用域 = 会话 cwd 的 basename，而不是「工作区列表的第一项」。
 * 这条链路坏了的表现是：无论切到哪个工作区，数据表永远是 default。
 */
import { switchWorkspace, currentWorkspace, workspaceDirectory, resetActiveWorkspace, scopeFromCwd, cwdOfExec } from '../lib/workspace.js'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

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

console.log('-- 1. scopeFromCwd：cwd → 表名 --')
{
  assert('D:\\0cengxu\\5 → 5', scopeFromCwd('D:\\0cengxu\\5') === '5', scopeFromCwd('D:\\0cengxu\\5'))
  assert('POSIX 路径也能取末段', scopeFromCwd('/home/u/mathlab') === 'mathlab', scopeFromCwd('/home/u/mathlab'))
  assert('带空格转连字符', scopeFromCwd('D:\\a b\\with space') === 'with-space', scopeFromCwd('D:\\a b\\with space'))
  assert('中文目录回落 default', scopeFromCwd('D:\\中文目录') === 'default', scopeFromCwd('D:\\中文目录'))
  assert('空 cwd 回落 default', scopeFromCwd('') === 'default', scopeFromCwd(''))
  assert('非字符串回落 default', scopeFromCwd(null) === 'default', String(scopeFromCwd(null)))
  assert('尾斜杠不影响', scopeFromCwd('D:/proj/x/') === 'x', scopeFromCwd('D:/proj/x/'))
  assert('同一目录每次结果相同', scopeFromCwd('D:\\a\\b') === scopeFromCwd('D:\\a\\b'))
}

console.log('-- 2. cwdOfExec：从执行上下文取 cwd --')
{
  assert('agent.meta.cwd（宿主实际形状）', cwdOfExec({ agent: { meta: { cwd: 'D:\\p' } } }) === 'D:\\p')
  assert('agent.cwd 兼容', cwdOfExec({ agent: { cwd: 'D:\\q' } }) === 'D:\\q')
  assert('session.cwd 兼容', cwdOfExec({ session: { cwd: 'D:\\r' } }) === 'D:\\r')
  assert('顶层 cwd 兼容', cwdOfExec({ cwd: 'D:\\s' } ) === 'D:\\s')
  assert('空对象返回空串', cwdOfExec({}) === '', cwdOfExec({}))
  assert('undefined 返回空串', cwdOfExec(undefined) === '')
}

console.log('-- 3. 不同工作区 = 不同表，互不影响 --')
{
  resetActiveWorkspace()
  const dir = workspaceDirectory()
  const names = ['scope_alpha', 'scope_beta']
  for (const n of names) {
    const f = join(dir, n + '.json')
    if (existsSync(f)) switchWorkspace('default')
    if (existsSync(f)) rmSync(f, { force: true })
  }

  switchWorkspace('scope_alpha')
  assert('切到 alpha', currentWorkspace() === 'scope_alpha', currentWorkspace())
  assert('alpha 表已落盘', existsSync(join(dir, 'scope_alpha.json')))

  switchWorkspace('scope_beta')
  assert('切到 beta', currentWorkspace() === 'scope_beta', currentWorkspace())
  assert('beta 表已落盘', existsSync(join(dir, 'scope_beta.json')))
  assert('两张表都在（不是覆盖）',
    existsSync(join(dir, 'scope_alpha.json')) && existsSync(join(dir, 'scope_beta.json')))

  // 模拟「跟着 cwd 走」的切换序列
  const seq = ['scope_alpha', 'scope_beta', 'scope_alpha']
  const seen = seq.map((n) => { switchWorkspace(n); return currentWorkspace() })
  assert('切换序列正确跟随', seen.join(',') === 'scope_alpha,scope_beta,scope_alpha', seen.join(','))

  switchWorkspace('default')
  for (const n of names) rmSync(join(dir, n + '.json'), { force: true })
}

console.log('')
if (fails.length === 0) {
  console.log('全部通过：' + pass + ' 项')
  process.exit(0)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
