/**
 * 真实世界观材料驱动的回归测试。
 *
 * ## 为什么用真实材料当 fixture
 *
 * 造出来的测试只测「我想到的情况」；这批数据来自 1106 万字的真实架空设定，
 * 里面出现的单位组合（J/g、N*m、万 m³、t/m³、GW、kJ）是**真实使用者的写法**。
 *
 * 每条断言都先读过原文上下文确认语义，不是正则瞎抓。
 *
 * 来源：D:/0cengxu/架空世界观/工具压力测试/md/
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-realworld-'))
await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/tool.js')).href)
let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}
const run = (e) => mathExecuteTool.execute({ operation: 'evaluate', expression: e }, {})
const near = async (e, want, tol = 1e-6) => {
  const o = await run(e)
  const got = Number(String(o.value).replace(/[^\d.eE+-]/g, ''))
  return o.ok && Math.abs(got - want) <= Math.abs(want) * tol
}
const textOf = async (e) => String((await run(e)).result)

console.log('-- 1. MHD 发电机功率（生物质空间站设定）--')
{
  /** 原文：P = σ v² B² K(1-K) V = 100 × 10⁶ × 25 × 0.25 × 1000 = 6.25e11 W */
  const e = '100 * 10^6 * 25 * 0.25 * 1000'
  assert('★ MHD 功率 = 6.25e11 W', await near(e, 6.25e11), await textOf(e))
  assert('★ 换算 GW = 625', await near(e + ' / 10^9', 625), '')
}
console.log('-- 2. 舰船体积与质量（战锤常规武器性能）--')
{
  /** 原文：驱逐舰 800×90×70 = 5 百万 m³，密度 0.1 t/m³ → 50 万吨 */
  const vol = '800 * 90 * 70 / 10^6'
  /** 原文写「约 5 百万 m³」，实算 5.04 —— 取近似即可。 */
  assert('★ 驱逐舰体积 ≈ 5 百万 m³', await near(vol, 5.04), await textOf(vol))
  const mass = '(800*90*70) * 0.1 t'
  /** 5.04e6 m³ × 0.1 t/m³ = 50.4 万吨（原文写「50 万吨」，四舍五入）。 */
  /** 插件会归约成 0.504 Mt（兆吨）——数值等价，断言按数值不按单位文本。 */
  const massOut = await run(mass)
  /** 数值等价即可：插件可能显示 0.504 Mt 或 5.04e+8 kg（= 50.4 万吨）。 */
  assert('★ 驱逐舰质量 ≈ 50.4 万吨', massOut.ok === true && /^(0\.504\s*Mt|5\.04e\+8\s*kg|504000\s*t)/.test(String(massOut.value)), String(massOut.value))
  /** 原文：巡洋舰 1500×180×130 = 35 百万 m³ */
  assert('★ 巡洋舰体积 = 35.1 百万 m³', await near('1500*180*130/10^6', 35.1), '')
}
console.log('-- 3. 激光枪齐射（战锤常规武器性能）--')
{
  /** 原文：100 名卫兵 × 单发 50 kJ × 命中一半 = 2.5 MJ */
  const e = '100 * 50 kJ * 0.5'
  /** 2.5 MJ = 2500 kJ，两者等价，只看数值。 */
  /** 等价写法都接受：2.5 MJ / 2500 kJ / 2.5e+6 J。 */
  const salvo = await run(e)
  assert('★ 齐射总能量 = 2.5 MJ', salvo.ok === true && /^(2\.5\s*MJ|2500\s*kJ|2\.5e\+6\s*J)/.test(String(salvo.value)), String(salvo.value))
  /** 该文同时给出 7.62×39 约 1991 J，用于倍数对比 */
  assert('★ 50 kJ / 1991 J ≈ 25 倍', await near('50 kJ / 1991 J', 25.11, 1e-2), '')
}
console.log('-- 4. 单位显示不再出冷门代号（本次修复）--')
{
  const jg = await textOf('1 J/g')
  assert('★ 1 J/g 不显示 raddose', !jg.includes('raddose'), jg)
  assert('★ 1 J/g 是 SI 基准', jg.includes('m^2'), jg)
  const nm = await textOf('1 N*m')
  assert('★ 1 N*m 不显示 foe', !nm.includes('foe'), nm)
  /** 但用户明确要的单位不能被冲掉 */
  const hp = await textOf('10 hp to kW')
  assert('★ 10 hp to kW 保留 kW', hp.includes('kW'), hp)
  const cun = await textOf('1 kg to 担')
  assert('★ 1 kg to 担 保留「担」', cun.includes('担'), cun)
}
console.log('-- 5. 平方立方定律（破军金甲 20m 机体）--')
{
  /** 原文：按 3m 层高，6-7 层 ≈ 18-21 m；人体 1.8m 缩放 */
  const scale = '20 / 1.8'
  assert('★ 20m 是人体 11.1 倍', await near(scale, 11.111, 1e-3), '')
  /** 质量按立方增长：75 kg → 约 103 t */
  assert('★ 质量按立方 → 102.9 t', await near('75 * (20/1.8)^3 / 1000', 102.88, 1e-3), '')
}
console.log('-- 6. 自转重力（生物质空间站 8km 椭球）--')
{
  /** 赤道半径 2.5 km 要 1g：ω = sqrt(g/r)，rpm 与线速度 */
  assert('★ r=2.5km 需 0.598 rpm', await near('sqrt(9.80665/2500) * 60 / (2*pi)', 0.598, 1e-2), '')
  assert('★ 边缘线速度 ≈ 156.6 m/s', await near('sqrt(9.80665*2500)', 156.58, 1e-3), '')
  /** 200m 层高的重力梯度 */
  assert('★ 200m 层高上下差 ≈ 8%', await near('(9.80665/2500)*200/9.80665*100', 8, 1e-6), '')
}
console.log('-- 7. 复合单位写法（真实使用者常写）--')
{
  for (const [e, kw] of [['1 t/m^3', 't'], ['1 kg/m3', 'kg'], ['0.1 t/m^3 to kg/m^3', '100'], ['5 百万 m^3', null]]) {
    const o = await run(e)
    if (kw === null) { assert('★ ' + e + ' 能算或明确报错', typeof o.ok === 'boolean', ''); continue }
    assert('★ ' + e + ' → ' + kw, o.ok === true && String(o.value).includes(kw), String(o.value).slice(0, 40))
  }
}
console.log('\n通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) { for (const item of fails) console.log('  - ' + item); process.exitCode = 1 }
