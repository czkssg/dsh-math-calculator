/**
 * overrides 里拼错的参数名**不能静默忽略**。
 *
 * ## 为什么这条值得单独测
 *
 * 实测反馈原话：
 *
 *   「overrides 的 key 与公式参数名不匹配时静默忽略，导致推演结果『合理但错误』。
 *     本会话中焦土能量账曾因参数拼写问题导致一次『236 倍缺口』误判。」
 *
 * 这类错最难发现：公式照常出数、数字看着正常，只是那个没生效的参数
 * 悄悄用了默认值。调用方以为「我把它改成 1.5 倍了」，实际还是 1 倍。
 *
 * ## 判据要分清两件事
 *
 * · **错拼**（`typos`、`Temp`、`greenhosue`）→ 必须警告
 * · **合法常数名**（`g`、`c`、`G`）→ 不能警告
 *
 * 后者是公式可以引用的世界常数（如 `escape_velocity` 里的 `G`），
 * 拿它当 overrides 的 key 覆盖默认值是正常用法。混在一起告警会变成噪音。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-overrides-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

async function call(args) {
  const r = await run(args)
  return { text: String(r.result || ''), ok: r.ok, value: r.value }
}

console.log('-- 1. 拼错的 key 必须被点名 --')
{
  const r = await call({
    operation: 'formula',
    formula: 'escape_velocity',
    overrides: { M: 5.972e24, r: 6371000, typos: 999 },
  })
  assert('调用仍成功（不抛错）', r.ok, '')
  assert('指出 typos 被忽略', /typos/.test(r.text), r.text.slice(-80))
  assert('说明「已被忽略」', /已被忽略/.test(r.text), '')
  assert('列出该公式的真实参数', /G、M、r|G, M, r|M、r/.test(r.text), r.text.slice(-70))
  assert('提醒可能已偏', /拼写错误|已偏/.test(r.text), '')
}

console.log('-- 2. 多个错拼都点名 --')
{
  const r = await call({
    operation: 'formula',
    formula: 'escape_velocity',
    overrides: { M: 5.972e24, r: 6371000, foo: 1, bar: 2 },
  })
  assert('两个都被点名', /foo/.test(r.text) && /bar/.test(r.text), r.text.slice(-80))
}

console.log('-- 3. 正常调用不该有这个提示（防噪音）--')
{
  const r = await call({
    operation: 'formula',
    formula: 'escape_velocity',
    overrides: { M: 5.972e24, r: 6371000 },
  })
  assert('无「已被忽略」字样', !/已被忽略/.test(r.text), r.text.slice(-60))
}

console.log('-- 4. 合法常数名不该告警 --')
{
  /**
   * 公式可以引用世界常数（`g`、`c`、`G`）。用它们覆盖默认值是正常用法，
   * 与「拼错参数名」是两回事。
   */
  const r = await call({
    operation: 'formula',
    formula: 'projectile_range_vacuum',
    overrides: { v: 20, theta: 0.785, g: 14.71 },
  })
  assert('用 g 覆盖后成功', r.ok, '')
  assert('不把 g 当成错拼', !/已被忽略/.test(r.text), r.text.slice(-60))
  // 数值确实变了（1.5g 下射程变短）
  const normal = await call({
    operation: 'formula',
    formula: 'projectile_range_vacuum',
    overrides: { v: 20, theta: 0.785 },
  })
  assert('改 g 后结果确实不同', r.text !== normal.text, '')
}

console.log('-- 5. 部分自定义公式里，未知 key 也要报 --')
{
  // 换一条公式，确认不是只对 escape_velocity 生效
  const r = await call({
    operation: 'formula',
    formula: 'kinetic_energy',
    overrides: { m: 2, v: 10, extra: 5 },
  })
  assert('kinetic_energy 也报 extra', /extra/.test(r.text), r.text.slice(-70))
}

console.log('-- 6. 措辞不反驳作者 --')
{
  const r = await call({
    operation: 'formula',
    formula: 'escape_velocity',
    overrides: { M: 5.972e24, r: 6371000, wrong: 1 },
  })
  assert('不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(r.text), '')
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)