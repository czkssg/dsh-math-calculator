/**
 * SI 与现代标准单位测试。
 *
 * ## 用户指出的疏漏
 *
 * > 现在的公制国际单位也应该全塞进去。**特别都塞古代单位把现代单位忘了**。
 *
 * 实测确认这个疏漏是真的 —— 之前补了 22 个古文明 234 条时代单位，
 * 而 **SI 22 个导出单位缺 7 个**：
 *
 * ```
 *   sr / lm / lx / Bq / Gy / Sv / kat    全缺
 *   天文三件套 au / ly / pc               全缺
 *   核与辐射 Ci / rad / rem / R           全缺
 *   d / dB / Np / rpm / kn / nmi / bps   全缺
 * ```
 *
 * ## 本套件守四件事
 *
 *   ① SI 22 个导出单位全部可用
 *   ② SI 词头能加在这些单位上（`mGy`/`mSv`/`kBq`）
 *   ③ 天文与核单位的换算正确
 *   ④ 对数量（分贝）**不注册进 mathjs**，且能解释为什么
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-si-'))
process.env.DSH_MATH_CALC_HOME = home

const { buildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const si = await import(pathToFileURL(join(root, 'lib/core/units-si.js')).href)
const siReg = await import(pathToFileURL(join(root, 'lib/core/units-si-registry.js')).href)

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
console.log('-- 1. ★ SI 7 个基本单位（应该早就有）--')
// ───────────────────────────────────────────────────────────
{
  const BASE = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']
  for (const unit of BASE) {
    let ok = false
    try { engine.evaluate('1 ' + unit); ok = true } catch { ok = false }
    assert('基本单位 ' + unit + ' 可用', ok, '')
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ SI 22 个导出单位（之前缺 7 个）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 完整清单（含之前缺的 7 个，标 ★）。
   */
  const DERIVED = [
    'rad', 'sr', 'Hz', 'N', 'Pa', 'J', 'W', 'C', 'V', 'F', 'ohm', 'S',
    'Wb', 'T', 'H', 'degC', 'lm', 'lx', 'Bq', 'Gy', 'Sv', 'kat',
  ]
  const missing = []
  for (const unit of DERIVED) {
    try {
      engine.evaluate('1 ' + unit)
    } catch {
      missing.push(unit)
    }
  }
  assert('★ 22 个 SI 导出单位全部可用', missing.length === 0, '缺：' + missing.join(','))
  assert('清单确实是 22 个', DERIVED.length === 22, String(DERIVED.length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ SI 词头（24 个，含 2022 新增的 ronna/quetta）--')
// ───────────────────────────────────────────────────────────
{
  /** SI 词头必须能加到导出的 SI 单位上。 */
  const PREFIXED = [
    ['mGy', 'Gy', 0.001], ['mSv', 'Sv', 0.001], ['kBq', 'Bq', 1000],
    ['kGy', 'Gy', 1000], ['mlm', 'lm', 0.001], ['klx', 'lx', 1000],
    ['mCi', 'Ci', 0.001], ['mkat', 'kat', 0.001],
  ]
  for (const [expr, target, want] of PREFIXED) {
    assert('★ 1 ' + expr + ' = ' + want + ' ' + target,
      Math.abs(num('1 ' + expr + ' to ' + target) - want) / want < 0.01,
      String(num('1 ' + expr + ' to ' + target)))
  }
  /** 新词头（2022 年 CGPM 加入）。 */
  assert('quetta (1e30) 可用', Math.abs(num('1 Qm to m') - 1e30) / 1e30 < 1e-10, String(num('1 Qm to m')))
  assert('quecto (1e-30) 可用', Math.abs(num('1 qm to m') - 1e-30) / 1e-30 < 1e-9, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 天文三件套 --')
// ───────────────────────────────────────────────────────────
{
  assert('1 au = 149,597,870.7 km', Math.abs(num('1 au to km') - 149597870.7) < 1, '')
  assert('1 ly = 9.4607e15 m',
    Math.abs(num('1 ly to m') / 9460730472580800 - 1) < 1e-9, '')
  assert('★ 1 pc = 3.2616 ly', Math.abs(num('1 pc to ly') - 3.26156) < 0.001,
    String(num('1 pc to ly')))
  /** 光年是长度不是时间。 */
  let isLength = false
  try { engine.evaluate('1 ly to m'); isLength = true } catch { isLength = false }
  assert('★ 光年能转成 m（是长度单位）', isLength, '')
  let isNotTime = false
  try { engine.evaluate('1 ly to s'); isNotTime = false } catch { isNotTime = true }
  assert('★ 光年不能转成 s（不是时间单位）', isNotTime, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 核与辐射（与 SI 差 100~10^10 倍）--')
// ───────────────────────────────────────────────────────────
{
  assert('1 Ci = 3.7e10 Bq', Math.abs(num('1 Ci to Bq') / 3.7e10 - 1) < 1e-9,
    String(num('1 Ci to Bq')))
  assert('★ 居里是贝可的 370 亿倍', Math.abs(num('1 Ci to Bq') / 3.7e10 - 1) < 1e-9, '')
  assert('1 rad = 0.01 Gy', Math.abs(num('1 radabsorbed to Gy') - 0.01) < 1e-12, '')
  assert('1 rem = 0.01 Sv', Math.abs(num('1 rem to Sv') - 0.01) < 1e-12, '')
  assert('1 R = 2.58e-4 C/kg', Math.abs(num('1 R to C/kg') - 0.000258) < 1e-9, '')
  /**
   * ★ 拉德的 `rad` 与角度的 `rad` 是**两回事** —— 这是本批最容易混的。
   */
  assert('★ 拉德 radabsorbed 与角度 rad 不同单位',
    num('1 radabsorbed to Gy') === 0.01 && Math.abs(num('1 rad to deg') - 57.29578) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. ★ 对数量（分贝）不注册进 mathjs --')
// ───────────────────────────────────────────────────────────
{
  const result = siReg.registerSiUnits(engine.math)
  assert('★ Np/bel/dB 走独立通道', result.independent.includes('dB'), result.independent.join(','))
  /**
   * 为什么不注册：对数量不是线性单位。
   * ```
   *   60 dB + 40 dB  ≠  100 dB    （应为 60.04 dB）
   *   10 × 60 dB     ≠  600 dB    （应为 80 dB）
   * ```
   * mathjs 的单位体系假定线性，装不下对数量。
   */
  let dbWorks = false
  try { engine.evaluate('1 dB'); dbWorks = true } catch { dbWorks = false }
  assert('★ dB 不能当线性单位用', dbWorks === false, '若可用则量纲体系被破坏')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 其他现代单位 --')
// ───────────────────────────────────────────────────────────
{
  assert('1 d = 24 h', Math.abs(num('1 d to h') - 24) < 1e-9, '')
  assert('1 rpm = 0.1047 rad/s', Math.abs(num('1 rpm to rad/s') - 0.10471976) < 1e-6, '')
  assert('1 节 = 0.5144 m/s', Math.abs(num('1 knotmodern to m/s') - 0.5144444) < 1e-6, '')
  assert('1 海里 = 1852 m', Math.abs(num('1 nmimodern to m') - 1852) < 1e-9, '')
  /** 海里与 statute mile 不同。 */
  assert('★ 海里(1852) ≠ 英里(1609.344)', Math.abs(num('1 nmimodern to m') - 1609.344) > 200, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 单位数量与数据质量 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * ⚠ 期望值是 **23** 条（不是 35）。我一开始按「SI 导出 + 天文 + 辐射 + 零零碎碎」估高了。
   *
   * 实际构成：
   * ```
   *   SI 导出补缺     7    sr/lm/lx/Bq/Gy/Sv/kat
   *   天文            3    au/ly/pc
   *   时间            1    d
   *   声学对数量      3    Np/bel/dB（走独立通道，不注册）
   *   核与辐射        4    Ci/radabsorbed/rem/R
   *   其他现代        5    rpm/bps/kn/nmi/lpm
   *                  ----
   *                  23
   * ```
   *
   * 这个数偏少恰恰说明**现代单位的底子本来就在**（mathjs 内置了大部分 SI），
   * 缺的是导出单位与专业领域的那几个。
   */
  assert('SI 补全表 ≥23 条', si.SI_MODERN_UNITS.length >= 23, String(si.SI_MODERN_UNITS.length))
  const all = si.SI_MODERN_UNITS
  assert('★ 每条都有说明', all.every((u) => u.note.length > 8), '')
  assert('每条都有别名', all.every((u) => Array.isArray(u.aliases) && u.aliases.length > 0), '')
  assert('每条都有量纲', all.every((u) => typeof u.dimension === 'string' && u.dimension.length > 0), '')
  /** name 唯一。 */
  const names = all.map((u) => u.name)
  const dup = names.filter((n, i) => names.indexOf(n) !== i)
  assert('name 无重复', dup.length === 0, dup.join(','))
  /** 因子必须为正。 */
  assert('因子都是正数', all.every((u) => u.factor > 0), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 与现代老表不冲突 --')
// ───────────────────────────────────────────────────────────
{
  /** 之前补的中文市制、英制、时代单位都还在。 */
  assert('市尺 = 33.33cm', Math.abs(num('1 市尺 to cm') - 33.333) < 0.01, '')
  assert('汉尺 = 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('1 里 = 500m', Math.abs(num('1 里 to m') - 500) < 1e-9, '')
  assert('1 吨 = 1000kg', Math.abs(num('1 吨 to kg') - 1000) < 1e-9, '')
  assert('1 psi = 6.895kPa', Math.abs(num('1 psi to kPa') - 6.8948) < 0.01, '')
  assert('1 gallon = 4.546L（国际标准）', Math.abs(num('1 gallon to L') - 4.54609) < 0.001, '')
  /** 公制内部换算。 */
  assert('1 m = 100 cm', Math.abs(num('1 m to cm') - 100) < 1e-9, '')
  assert('1 kg = 1000 g', Math.abs(num('1 kg to g') - 1000) < 1e-9, '')
  assert('1 L = 1000 mL', Math.abs(num('1 L to mL') - 1000) < 1e-9, '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
