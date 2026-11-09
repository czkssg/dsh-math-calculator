/**
 * 生态：逻辑斯谛增长与最大可持续猎获（反馈 A9）。
 *
 * ## 为什么不只是「rK/4 一条式子」
 *
 * 反馈原文问的是「取用率上限到底多少才不崩」。这需要两个量：
 *
 * ```
 *   今年多出来多少         → r·N·(1−N/K)
 *   长期每年能拿走多少     → r·K/4（N=K/2 处的增量峰值）
 * ```
 *
 * 两者必须**内部一致**：MSY 应当恰好等于「N=K/2 时算出来的增长率」。
 * 如果实现里 4 被写成 2，这条断言立刻红 —— 这正是本套的核心守则。
 *
 * ## 反向对照（比正向更重要）
 *
 * 「猎走 K/2 只」在直觉上（种群减半）像是保守做法，
 * 但 rK/4 ≪ K/2：前者是**增量**，后者是**本金**。取本金必崩。
 * 所以断言 MSY < K/2，且两者相差一个 1/r 量级 —— 防守「把存量当产量」。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-msy-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

const num = (r) => Number(String(r.result).match(/结果:\s*([-\d.eE+]+)/)?.[1])

/** 单项公式求值（参数走 overrides，与 test/basic-formulas.mjs 同口径）。 */
async function calc(formula, overrides) {
  const r = await run({ operation: 'formula', formula, overrides })
  if (!r.ok) throw new Error(formula + ' 失败：' + String(r.result))
  return num(r)
}

console.log('-- 1. 公式已入库且可检索 --')
{
  assert('logistic_growth_rate 在库中', fm.FORMULA_INDEX.has('logistic_growth_rate'))
  assert('sustainable_harvest 在库中', fm.FORMULA_INDEX.has('sustainable_harvest'))
  /** 反向对照：拼错的 id 不应命中，防止断言本身空转。 */
  assert('拼错 id 不命中', !fm.FORMULA_INDEX.has('sustainable_harvest_typo'))

  const found = String((await run({ operation: 'formulas', query: '逻辑斯谛' })).result ?? '')
  assert('中文名可检索', found.includes('逻辑斯谛增长'), found.slice(0, 60))
  const msy = String((await run({ operation: 'formulas', query: 'MSY' })).result ?? '')
  assert('MSY 可检索', msy.includes('最大可持续猎获量'), msy.slice(0, 60))
}

console.log('-- 2. 逻辑斯谛：三点定形 --')
{
  /**
   * 鹿：r=0.4/年、K=400。手算三个点：
   *   N= 50 → 0.4·50·(1−0.125) = 17.5
   *   N=200 → 0.4·200·(1−0.5) = 40     ← 峰值
   *   N=350 → 0.4·350·(1−0.875) = 17.5
   */
  const n50 = await calc('logistic_growth_rate', { r: 0.4, population: 50, carrying_capacity: 400 })
  const n200 = await calc('logistic_growth_rate', { r: 0.4, population: 200, carrying_capacity: 400 })
  const n350 = await calc('logistic_growth_rate', { r: 0.4, population: 350, carrying_capacity: 400 })

  assert('N=50 → 17.5', Math.abs(n50 - 17.5) < 1e-9, String(n50))
  assert('N=200 → 40', Math.abs(n200 - 40) < 1e-9, String(n200))
  assert('N=350 → 17.5', Math.abs(n350 - 17.5) < 1e-9, String(n350))
  /** 对称性：N 与 K−N 交换后速率相同（式子关于 K/2 对称）。 */
  assert('K/2 对称', Math.abs(n50 - n350) < 1e-9, n50 + ' vs ' + n350)
  assert('K/2 处最大', n200 > n50 && n200 > n350, n200 + ' > ' + n50 + '/' + n350)
}

console.log('-- 3. 边界：到容纳量就停 --')
{
  const atK = await calc('logistic_growth_rate', { r: 0.4, population: 400, carrying_capacity: 400 })
  assert('N=K → 0（不是负增长）', Math.abs(atK) < 1e-12, String(atK))

  /** 超过 K 会是负数 —— 这是模型外推，应如实呈现而不是钳到 0。 */
  const over = await calc('logistic_growth_rate', { r: 0.4, population: 500, carrying_capacity: 400 })
  assert('N>K → 负值（过载会减员）', over < 0, String(over))

  const empty = await calc('logistic_growth_rate', { r: 0.4, population: 0, carrying_capacity: 400 })
  assert('N=0 → 0（没有个体就没有增长）', Math.abs(empty) < 1e-12, String(empty))
}

console.log('-- 4. MSY 与增长率必须内部一致（核心守则）--')
{
  /**
   * 这是本套最重要的一条：MSY 不能是另拍的系数，
   * 它必须是「N=K/2 处的增长率」。把 4 写成 2，这里立刻红。
   */
  const msy = await calc('sustainable_harvest', { r: 0.4, carrying_capacity: 400 })
  const peak = await calc('logistic_growth_rate', { r: 0.4, population: 200, carrying_capacity: 400 })
  assert('MSY = N(K/2) 处增长率', Math.abs(msy - peak) < 1e-9, msy + ' vs ' + peak)
  assert('鹿 MSY = 40 只/年', Math.abs(msy - 40) < 1e-9, String(msy))

  /** 野猪：r=0.8、K=180 → 36 只/年（手算 0.8·180/4）。 */
  const boar = await calc('sustainable_harvest', { r: 0.8, carrying_capacity: 180 })
  assert('野猪 MSY = 36 只/年', Math.abs(boar - 36) < 1e-9, String(boar))

  /** r 翻倍则 MSY 翻倍（线性，便于反推「这地方的繁殖力大概多少」）。 */
  const double = await calc('sustainable_harvest', { r: 0.8, carrying_capacity: 400 })
  assert('r 翻倍 → MSY 翻倍', Math.abs(double - msy * 2) < 1e-9, double + ' vs ' + msy * 2)
}

console.log('-- 5. 反向对照：增量 vs 本金 --')
{
  /**
   * 「种群减半」听上去保守，但 K/2 是**存量**，rK/4 才是**年增量**。
   * 取存量会连本金一起吃 —— 这正是过度猎获的数学形态。
   */
  const msy = await calc('sustainable_harvest', { r: 0.4, carrying_capacity: 400 })
  assert('MSY 远小于 K/2 存量', msy < 400 / 2 * 0.25, msy + ' < ' + 200)
  /** 比值 = r/2：r=0.4 → 0.2，即「每年只能拿走存量的两成」。 */
  const ratio = msy / (400 / 2)
  assert('MSY/(K/2) = r/2', Math.abs(ratio - 0.2) < 1e-12, String(ratio))

  /** 设定集口径：鹿猎 15~25 只/年 = 38%~63% MSY。 */
  const lo = 15 / msy
  const hi = 25 / msy
  assert('设定 15~25 只落在 MSY 之下', hi < 1, (lo * 100).toFixed(0) + '%~' + (hi * 100).toFixed(0) + '%')
}

console.log('-- 6. 已接进食物链（体系连通）--')
{
  const food = sys.FORMULA_SYSTEMS.find((s) => s.id === 'sys-food')
  const ids = food.steps.map((s) => s.formula)
  assert('食物链含 logistic_growth_rate', ids.includes('logistic_growth_rate'))
  assert('食物链含 sustainable_harvest', ids.includes('sustainable_harvest'))
  /** 先后顺序有语义：先算增量，再取上限。反了说明链没想清。 */
  assert('增量在上、上限在下',
    ids.indexOf('logistic_growth_rate') < ids.indexOf('sustainable_harvest'),
    ids.indexOf('logistic_growth_rate') + ' < ' + ids.indexOf('sustainable_harvest'))

  const q = String((await run({ operation: 'formulas', query: 'sys:sys-food' })).result ?? '')
  assert('链查询能列出 MSY', q.includes('最大可持续猎获量'), q.slice(-200))
}

console.log('-- 7. 新增公式没有破坏既有口径 --')
{
  /** 总公式数与 FOOD 阈值未变；新增两条只加不减。 */
  assert('公式总数 ≥ 525', fm.FORMULAS.length >= 525, String(fm.FORMULAS.length))
  /** 每条新公式都要有 desc 与 keys（检索质量）。 */
  for (const id of ['logistic_growth_rate', 'sustainable_harvest']) {
    const f = fm.FORMULA_INDEX.get(id)
    assert(id + ' 有 desc', !!f.desc && f.desc.length > 40, String(f.desc?.length))
    assert(id + ' 有 keys', Array.isArray(f.keys) && f.keys.length >= 3, String(f.keys?.length))
    assert(id + ' 有单位', !!f.unit, String(f.unit))
  }
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)