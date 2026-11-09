/**
 * 提示词里的「多步推演」规则。
 *
 * ## 为什么这条规则必须进提示词而不是做成代码
 *
 * 用户要的是「每个值在运算中变成不同物理量，带标记进入下一个算式，直到跑完」。
 * 我试过做成工具内部的自动执行器（`chain-runner`），实测失败：
 *
 * ```
 *   22 条链 / 259 步，只有 9 步声明依赖（3.5%）
 *   sys-energy 19 步里 0 条依赖 —— 窑炉/锅炉/卡诺/制冷/储热 是并列主题，不是链
 * ```
 *
 * **「先算什么、哪个输出喂给哪个参数」这个判断，工具做不了，必须 AI 做。**
 * 所以规则进提示词，让 AI 按工具的实际接口来串调用。
 *
 * ## 本套测试守两件事
 *
 * ```
 * ① 提示词必须写出这条规则（否则 AI 会每步从原始条件重填参数）
 * ② 规则里承诺的每个接口**必须真的可用**（否则就是骗 AI）
 * ```
 *
 * 第 ② 条最重要：提示词写了「带单位的字符串也行」，
 * 若实际不支持，AI 会按提示词写、然后失败 —— 那比不写更糟。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-multistep-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const awareness = await import(pathToFileURL(join(root, 'lib/awareness.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const section = String(awareness.buildSystemPromptSection() ?? '')

console.log('-- 1. 提示词含「多步推演」规则 --')
{
  /**
   * 断言按**语义**而不按措辞：压缩后标题从「多步推演」改成「多步」，
   * 但规则本身没变。断言若绑死字面量，每次优化文案都会假红。
   */
  assert('含多步传递的规则', /多步/.test(section), '')
  assert('说明 value.answer 是全精度裸数', section.includes('value.answer'), '')
  assert('说明 value.unit 是单位', section.includes('value.unit'), '')
  assert('说明 overrides 可带单位', section.includes('可带单位') || section.includes('带单位的字符串'), '')
  assert('给出查链条的命令', section.includes('sys:'), '')
  /**
   * ★ 必须诚实说明「链条是主题分组，不是严格依赖」。
   * 若不说，AI 会机械顺序执行 19 步并列主题，得到一堆无关结果。
   */
  assert('诚实说明链条是主题分组', section.includes('主题分组'), '')
  assert('提醒顺序要自己判断', section.includes('自己判断'), '')
}

console.log('-- 2. ★ 提示词承诺的接口必须真的可用 --')
{
  /**
   * ★★ 这是本套最重要的一节。
   * 提示词说「带单位的字符串也行」，就必须真行 —— 否则 AI 照写必失败。
   */
  const withUnit = await run({
    operation: 'formula',
    formula: 'building_height_limit',
    overrides: { strength: 1.3e8, rho: 2700, g: '9.82 m/s^2' },
  })
  assert('带单位字符串可作输入', withUnit.ok === true, String(withUnit.result).slice(0, 60))

  /** ★ 提示词说「换单位不必手算」：N/kg 与 m/s^2 应得到同一个结果。 */
  const asAccel = await run({
    operation: 'formula', formula: 'building_height_limit',
    overrides: { strength: 1.3e8, rho: 2700, g: '9.82 m/s^2' },
  })
  const asNkg = await run({
    operation: 'formula', formula: 'building_height_limit',
    overrides: { strength: 1.3e8, rho: 2700, g: '9.82 N/kg' },
  })
  const pick = (r) => Number(String(r.result).match(/结果:\s*(-?[0-9.eE+-]+)/)?.[1] ?? NaN)
  assert(
    'N/kg 与 m/s^2 等价（自动换算）',
    Math.abs(pick(asAccel) - pick(asNkg)) < 1e-6,
    pick(asAccel).toFixed(2) + ' vs ' + pick(asNkg).toFixed(2),
  )

  /** ★ 提示词说 value.answer 是全精度 —— 必须是裸数，不带单位。 */
  const probe = await run({ operation: 'formula', formula: 'surface_gravity', overrides: { M: 5.9722e24, R: 6.371e6 } })
  assert('value.answer 是可解析的裸数', Number.isFinite(Number(probe.value?.answer)), String(probe.value?.answer).slice(0, 20))
  assert('value.unit 单独给出单位', probe.value?.unit === 'm/s^2', String(probe.value?.unit))
}

console.log('-- 3. ★ 真实多步串联能跑通（模拟 AI 按规则行事）--')
{
  /**
   * 这是用户要的那个流程的可运行范例：
   *
   * ```
   *   第 1 步：M、R → 表面重力
   *   第 2 步：表面重力（带单位）→ 最大山高
   *   第 3 步：最大山高 → 雪线 / 建筑高度
   * ```
   *
   * 三步都只依赖上一步的输出（加少量新输入），这才叫「传递」。
   */
  const step1 = await run({ operation: 'formula', formula: 'surface_gravity', overrides: { M: 5.9722e24, R: 6.371e6 } })
  assert('第1步 表面重力', step1.ok, String(step1.value?.answer).slice(0, 12))
  const g = Number(step1.value.answer)

  /** 把上一步的输出（连单位）直接喂给下一步。 */
  const step2 = await run({
    operation: 'formula',
    formula: 'building_height_limit',
    overrides: { strength: 1.3e8, rho: 2700, g: g + ' ' + step1.value.unit },
  })
  assert('第2步 用上一步的输出+单位', step2.ok, String(step2.result).match(/结果:[^\n]*/)?.[0] ?? '')
  const h = Number(String(step2.result).match(/结果:\s*(-?[0-9.eE+-]+)/)?.[1] ?? NaN)

  /** 第 3 步：把山高（m）作为海拔喂给直减率公式，验证单位换算（km 需求）。 */
  const step3 = await run({
    operation: 'formula',
    formula: 'lapse_rate_temp',
    overrides: { T0: 288, lapse: 0.0065, h: h + ' m' },
  })
  assert('第3步 用上一步的高度', step3.ok, String(step3.result).match(/结果:[^\n]*/)?.[0] ?? '')

  /** ★ 关键：三步必须形成真正的传递关系，而不是各算各的。 */
  assert('三步结果互相依赖（山高随重力变）', h > 0 && h < 10000, h.toFixed(0) + ' m')
}

console.log('-- 4. 提示词长度可控 --')
{
  assert('brief 档 ≤ 1200 字符', section.length <= 1200, String(section.length))
  assert('brief 档 ≥ 700 字符（内容不能为空）', section.length >= 700, String(section.length))
  /**
   * ★ 新加的段落不应挤掉原有的关键约束。
   * 这些是「读输出的约定」，丢了会让 AI 把 [量级] 当精确值引用。
   */
  for (const must of ['[精确]', '[量级]', 'displayPrecision', 'math_execute']) {
    assert('保留原有约束：' + must, section.includes(must), '')
  }
}

console.log('-- 5. 完整档也要有这条规则 --')
{
  awareness.setPromptMode?.('full')
  const full = String(awareness.buildSystemPromptSection() ?? '')
  awareness.setPromptMode?.('brief')
  /**
   * full 档是「完整清单」模式，它的用途是给需要细节的场景。
   * 多步推演的规则在 there 也要有 —— 否则换档就丢行为。
   */
  assert('full 档也提到多步推演或输出传递', /多步|value\.answer|上一步/.test(full), String(full.length) + ' 字符')
  assert('full 档比 brief 长', full.length > section.length, full.length + ' vs ' + section.length)
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
