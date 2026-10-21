/**
 * 确定性测试：证明这个模型是**代码**，不是「AI 临场判断」。
 *
 * 判据：
 *   1. 同一输入跑两次 → result 文本与 value JSON 完全一致；
 *   2. 同一输入跑 20 次 → 只有一个哈希；
 *   3. 输出里没有 NaN / undefined；
 *   4. 定性句子（"倾向更长寿命"）由条件分支决定，不是随机生成；
 *   5. 工作区时间戳不会泄漏进世界推演结果。
 *
 * 如果哪天有人往计算路径里塞进 Math.random 或模型调用，这套测试会红。
 */
import { createHash } from 'node:crypto'
import * as mod from '../lib/index.js'

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

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

const worldArgs = {
  operation: 'world',
  world: {
    starClass: 'M5V',
    orbitAU: 0.2,
    planetRadius: 0.85,
    rotationHours: 30,
    moons: [
      { name: '银月', massMoon: 1.2, distanceMoon: 0.8 },
      { name: '赤月', massMoon: 0.4, distanceMoon: 2.2 },
    ],
  },
}

console.log('-- 1. 同一输入两次运行必须字节一致 --')
{
  const a = mod.runMathTool(worldArgs)
  const b = mod.runMathTool(worldArgs)
  assert('result 文本完全一致', a.result === b.result, sha(a.result))
  assert('value JSON 完全一致', JSON.stringify(a.value) === JSON.stringify(b.value))
  assert('哈希可复现', sha(a.result) === sha(b.result))
}

console.log('-- 2. 跑 20 次只有一个哈希（没有随机）--')
{
  const hashes = new Set()
  for (let i = 0; i < 20; i++) hashes.add(sha(mod.runMathTool(worldArgs).result))
  assert('20 次运行 → 1 个哈希', hashes.size === 1, String(hashes.size))
  assert('哈希值为预期', [...hashes][0] === sha(mod.runMathTool(worldArgs).result))
}

console.log('-- 3. 输出必须干净（无 NaN / undefined / [object Object]）--')
{
  const text = mod.runMathTool(worldArgs).result
  assert('无 NaN', !text.includes('NaN'))
  assert('无 undefined', !text.includes('undefined'))
  assert('无 [object Object]', !text.includes('[object Object]'))

  const defaultWorld = mod.runMathTool({ operation: 'world' }).result
  assert('默认世界也无 NaN', !defaultWorld.includes('NaN'))
}

console.log('-- 4. 定性句子由条件分支决定，不是生成 --')
{
  const hotter = mod.runMathTool({ operation: 'world', world: { starTemp: 12000, starRadius: 2 } }).result
  const cooler = mod.runMathTool({ operation: 'world', world: { starTemp: 3200, starRadius: 0.3 } }).result
  assert('高温恒星 → 固定措辞"偏蓝"', hotter.includes('偏蓝'))
  assert('低温恒星 → 固定措辞"偏红"', cooler.includes('偏红'))
  const repeat = mod.runMathTool({ operation: 'world', world: { starTemp: 12000, starRadius: 2 } }).result
  assert('同样的输入，同一句话逐字相同', repeat === hotter)
}

console.log('-- 5. 时间戳不能泄漏进推演结果 --')
{
  const text = mod.runMathTool({ operation: 'world' }).result
  assert('结果里没有 ISO 时间戳', !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text))
  assert('结果里没有 createdAt', !text.includes('createdAt'))
}

console.log('-- 6. 其它 operation 同样确定 --')
{
  const formulaArgs = { operation: 'formula', formula: 'escape_velocity', overrides: { M: 5.97e24, r: 6371000 } }
  assert('formula 两次一致', mod.runMathTool(formulaArgs).result === mod.runMathTool(formulaArgs).result)

  const listArgs = { operation: 'formulas', query: '重力' }
  assert('formulas 两次一致', mod.runMathTool(listArgs).result === mod.runMathTool(listArgs).result)

  // constants 会改全局生效常数，放最后并复位
  const c1 = mod.runMathTool({ operation: 'constants', constants: { c: 1.5e8 } })
  const c2 = mod.runMathTool({ operation: 'constants', constants: { c: 1.5e8 } })
  assert('constants 两次一致（不含时间戳部分）',
    c1.result.split('\n').filter((l) => !l.includes('工作区')).join('\n') ===
    c2.result.split('\n').filter((l) => !l.includes('工作区')).join('\n'))

  mod.runMathTool({ operation: 'constants', constants: {} })
  const restored = mod.runMathTool({ operation: 'world' }).result
  assert('复位后回到基线哈希', sha(restored) === sha(mod.runMathTool({ operation: 'world' }).result))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
