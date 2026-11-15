/**
 * 默认指向策略测试。
 *
 * ## 用户规则
 *
 * > 一般情况下，英制单位用国标。**保留变体，但默认情况下用的国际标准。**
 *
 * ## 这条规则要修正的问题（实测抓出来的）
 *
 * 修正前，裸名指向**不一致**：
 *
 * ```
 *   1 ft   → 国际 0.3048    ✓
 *   1 lb   → 国际 453.59    ✓
 *   1 gallon → 美制 3.785   ✗
 *   1 pint   → 美制 473     ✗
 *   1 cwt    → 美制 45.4    ✗
 *   1 bushel → 英制 36.37   ✗ 与 gallon 口径不一致
 *   1 ton    → 美制 907     ✗ 中文「吨」应指 1000
 * ```
 *
 * 同为「英制」，长度用国际、容积用美制、干量用英制 —— **作者无从预期**。
 *
 * ## 本套件守两件事
 *
 *   ① 裸名默认指向国际标准（GB 3100 / 1959 协定）
 *   ② **变体一个都没删** —— 需要时显式调用仍能拿到别的值
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { buildEngine } from '../lib/core/engine.js'
import { REBINDS, verifyRebinds } from '../lib/core/units-default-rebind.js'
import { DEFAULT_DECISIONS, defaultFor, defaultNotice } from '../lib/core/units-default-policy.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const engine = buildEngine()
const num = (expr) => Number(String(engine.evaluate(expr)).split(' ')[0])

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 裸名默认 = 国际标准 --')
// ───────────────────────────────────────────────────────────
{
  const results = verifyRebinds(engine.math)
  assert('重绑定表覆盖 ≥8 个单位', results.length >= 8, String(results.length))
  for (const r of results) {
    assert('裸名 ' + r.name + ' 指向国际标准', r.ok, String(r.value))
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 变体全部保留（没被删掉）--')
// ───────────────────────────────────────────────────────────
{
  /** 每一对「默认 vs 变体」都要能分别取到。 */
  const PAIRS = [
    ['1 gallon to L', 4.54609, '1 美制加仑 to L', 3.785411784, '加仑'],
    ['1 pint to mL', 568.26125, '1 美制品脱 to mL', 473.176473, '品脱'],
    ['1 quart to L', 1.1365225, '1 美制夸脱 to L', 0.946352946, '夸脱'],
    ['1 fluidounce to mL', 28.4130625, '1 美制液盎司 to mL', 29.5735295625, '液盎司'],
  ]
  for (const [defExpr, defWant, varExpr, varWant, label] of PAIRS) {
    assert('★ ' + label + '默认是国际标准', Math.abs(num(defExpr) - defWant) < 0.001,
      String(num(defExpr)))
    assert('★ ' + label + '美制变体仍可用', Math.abs(num(varExpr) - varWant) < 0.001,
      String(num(varExpr)))
    assert('★ ' + label + '两者确实不同', Math.abs(num(defExpr) - num(varExpr)) > 0.001, '')
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 吨的三义（差 12%，最容易算错）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 中文语境「一吨」= 1000 kg。
   * 若默认成美制短吨 907，「年产 300 万吨」会变成 272 万吨，差 10% 而不报错。
   */
  assert('★ 裸名 ton = 1000 kg（公制）', Math.abs(num('1 ton to kg') - 1000) < 1e-9,
    String(num('1 ton to kg')))
  assert('★ 中文「吨」= 1000 kg', Math.abs(num('1 吨 to kg') - 1000) < 1e-9, '')
  assert('长吨 = 1016.05 kg', Math.abs(num('1 长吨 to kg') - 1016.0469088) < 0.001, '')
  assert('短吨 = 907.18 kg', Math.abs(num('1 短吨 to kg') - 907.18474) < 0.001, '')
  assert('★ 长吨比短吨重 12%', Math.abs(num('1 长吨 to kg') / num('1 短吨 to kg') - 1.12) < 0.001, '')
  /** 三者互不相同。 */
  const three = [num('1 吨 to kg'), num('1 长吨 to kg'), num('1 短吨 to kg')]
  assert('★ 吨的三义互不相同', new Set(three).size === 3, three.join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 英担与蒲式耳的默认 --')
// ───────────────────────────────────────────────────────────
{
  assert('裸名 cwt = 长英担 50.80 kg', Math.abs(num('1 cwt to kg') - 50.80234544) < 0.001,
    String(num('1 cwt to kg')))
  assert('短英担变体仍可用', Math.abs(num('1 短英担 to kg') - 45.359237) < 0.001, '')
  assert('裸名 bushel = 英制 36.37 L', Math.abs(num('1 bushel to L') - 36.36872) < 0.001, '')
  assert('美制蒲式耳变体仍可用', Math.abs(num('1 美制蒲式耳 to L') - 35.23907) < 0.001, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 行业固定值不受"国际标准"影响 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 石油桶固定美制 42 加仑 —— 这是行业定义，不是变体选择。
   */
  assert('★ 石油桶 = 158.987 L（固定美制）',
    Math.abs(num('1 bbl to L') - 158.987294928) < 0.001, String(num('1 bbl to L')))
  /** 机械马力固定 745.7 W。 */
  assert('★ 机械马力 = 745.7 W（固定）', Math.abs(num('1 hp to W') - 745.6998715823) < 0.001, '')
  /** 国际表 BTU 固定。 */
  assert('★ BTU 默认国际表 = 1055.0559 J', Math.abs(num('1 btu to J') - 1055.05585262) < 0.001, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 策略表完整性 --')
// ───────────────────────────────────────────────────────────
{
  assert('策略表 ≥10 条', DEFAULT_DECISIONS.length >= 10, String(DEFAULT_DECISIONS.length))
  /** 每条都要有依据与理由 —— 否则「为什么默认这个」无从回答。 */
  assert('★ 每条都有 basis', DEFAULT_DECISIONS.every((d) => d.basis !== undefined), '')
  assert('★ 每条都有 reason（≥15 字）', DEFAULT_DECISIONS.every((d) => d.reason.length >= 15), '')
  /** 重绑定表的每一项都要在策略表里有对应决定。 */
  const bareNames = new Set(DEFAULT_DECISIONS.map((d) => d.bare))
  const missing = REBINDS.filter((r) => !bareNames.has(r.name)).map((r) => r.name)
  assert('★ 每个重绑定都有策略依据', missing.length === 0, missing.join(','))
  /** 查询接口。 */
  assert('defaultFor(gallon) 有结果', defaultFor('gallon') !== null, '')
  assert('defaultFor(不存在) 返回 null', defaultFor('不存在') === null, '')
  assert('defaultNotice(gallon) 给说明', defaultNotice('gallon').length > 10, '')
  assert('defaultNotice(无争议) 给空串', defaultNotice('xyz') === '', '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 不破坏公制与中文单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('1 kg = 1000 g', Math.abs(num('1 kg to g') - 1000) < 1e-9, '')
  assert('1 m = 100 cm', Math.abs(num('1 m to cm') - 100) < 1e-9, '')
  assert('1 市斤 = 500 g', Math.abs(num('1 市斤 to g') - 500) < 1e-9, '')
  assert('1 汉尺 = 23.1 cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('1 罗马尺 = 29.6 cm', Math.abs(num('1 罗马尺 to cm') - 29.6) < 0.1, '')
  assert('30 里 = 15 km', Math.abs(num('30 里 to km') - 15) < 1e-9, '')
  assert('1 psi = 6.895 kPa', Math.abs(num('1 psi to kPa') - 6.8948) < 0.01, '')
  assert('1 gpm = 3.785 L/min', Math.abs(num('1 gpm to L/min') - 3.7854) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 重绑定后的换算链仍自洽 --')
// ───────────────────────────────────────────────────────────
{
  /** 1 加仑 = 4 夸脱 = 8 品脱（英制内部一致）。 */
  assert('1 加仑 = 4 夸脱', Math.abs(num('1 gallon to L') / num('1 quart to L') - 4) < 0.01, '')
  assert('1 加仑 = 8 品脱', Math.abs(num('1 gallon to L') / num('1 pint to L') - 8) < 0.01, '')
  assert('1 加仑 = 160 液盎司', Math.abs(num('1 gallon to mL') / num('1 fluidounce to mL') - 160) < 0.5, '')
  /** 1 蒲式耳 = 4 配克（英制）。 */
  assert('1 英制蒲式耳 = 4 配克', Math.abs(num('1 bushel to L') / num('1 配克 to L') - 4) < 0.05, '')
}

console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
