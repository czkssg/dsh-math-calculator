/**
 * 参数读取模块：小接口 + 深实现。
 *
 * 这 5 个函数替换 dispatch.ts 里 151 处 typeof 三目。
 * 测的是**接口行为**（调用方和测试跨同一道 seam），不是内部实现。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const { num, str, bool, rec, strList } = await import(pathToFileURL(join(root, 'lib/core/args.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
console.log('-- 1. num：只认有限数 --')
{
  assert('★ 正常数', num({ a: 42 }, 'a') === 42, String(num({ a: 42 }, 'a')))
  assert('★ 0 不是缺省（关键）', num({ a: 0 }, 'a') === 0, String(num({ a: 0 }, 'a')))
  assert('★ 负数', num({ a: -3.5 }, 'a') === -3.5, '')
  assert('★ NaN → undefined', num({ a: NaN }, 'a') === undefined, String(num({ a: NaN }, 'a')))
  assert('★ Infinity → undefined', num({ a: Infinity }, 'a') === undefined, '')
  assert('★ 字符串数字不认', num({ a: '42' }, 'a') === undefined, '')
  assert('★ 缺失 → undefined', num({}, 'a') === undefined, '')
  assert('★ null → undefined', num({ a: null }, 'a') === undefined, '')
}
console.log('-- 2. str：trim 且空串归一 --')
{
  assert('★ 正常串', str({ a: 'hello' }, 'a') === 'hello', '')
  assert('★ 自动 trim', str({ a: '  hi  ' }, 'a') === 'hi', JSON.stringify(str({ a: '  hi  ' }, 'a')))
  assert('★ 全空白 → undefined', str({ a: '   ' }, 'a') === undefined, '')
  assert("★ 空串 → undefined（不是 ''）", str({ a: '' }, 'a') === undefined, JSON.stringify(str({ a: '' }, 'a')))
  assert('★ 数字不认', str({ a: 42 }, 'a') === undefined, '')
}
console.log('-- 3. bool：严格 --')
{
  assert('★ true', bool({ a: true }, 'a') === true, '')
  assert('★ false 不是缺省', bool({ a: false }, 'a') === false, '')
  assert("★ 字符串 'true' 不认", bool({ a: 'true' }, 'a') === undefined, '')
  assert('★ 1 不认', bool({ a: 1 }, 'a') === undefined, '')
}
console.log('-- 4. rec：拒绝数组与 null --')
{
  assert('★ 普通对象', JSON.stringify(rec({ a: { x: 1 } }, 'a')) === '{"x":1}', '')
  assert('★ 空对象可用', JSON.stringify(rec({ a: {} }, 'a')) === '{}', '')
  assert('★ 数组 → undefined', rec({ a: [1, 2] }, 'a') === undefined, '')
  assert('★ null → undefined', rec({ a: null }, 'a') === undefined, '')
  assert('★ 字符串 → undefined', rec({ a: 'x' }, 'a') === undefined, '')
}
console.log('-- 5. strList：逐项转字符串 --')
{
  assert('★ 正常数组', JSON.stringify(strList({ a: ['x', 'y'] }, 'a')) === '["x","y"]', '')
  assert('★ 数字转字符串', JSON.stringify(strList({ a: [1, 2] }, 'a')) === '["1","2"]', '')
  assert('★ 跳过 null/undefined', JSON.stringify(strList({ a: ['x', null, undefined, 'y'] }, 'a')) === '["x","y"]', '')
  assert('★ 非数组 → undefined', strList({ a: 'x' }, 'a') === undefined, '')
}
console.log('-- 6. 与旧写法的等价性（抽样）--')
{
  /** 旧写法：typeof args['x'] === 'number' ? args['x'] : undefined */
  const old = (args, k) => (typeof args[k] === 'number' ? args[k] : undefined)
  const samples = [{ x: 5 }, { x: 0 }, { x: -1 }, { x: 'a' }, {}, { x: null }]
  for (const s of samples) {
    const a = old(s, 'x'), b = num(s, 'x')
    assert('★ num 与旧写法一致：' + JSON.stringify(s), a === b, a + ' vs ' + b)
  }
  /** 唯一差异：num 额外拒绝 NaN/Infinity（旧的会漏过去） */
  assert('★ num 比旧写法更严：NaN 被拦住', Number.isNaN(old({ x: NaN }, 'x')) && num({ x: NaN }, 'x') === undefined, '')
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
