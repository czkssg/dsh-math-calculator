/**
 * 精度不足的提醒。
 *
 * ## 为什么需要
 *
 * 显示精度截断是**悄悄的**：8 位小数对 `1/7` 毫无影响（误差 1e-9），
 * 但对 `0.00000123456789` 只留下 3 位有效数字，相对误差 0.37%。
 * 作者看到 `0.00000123` 会以为那是精确值。
 *
 * 所以要在**真的丢了精度**时提醒一句，让模型/作者知道该调高 displayPrecision。
 *
 * ## 判据：相对误差，不是绝对位数
 *
 * 这是本套测试的核心。用绝对小数位判断会误报：
 *   `123456.789012345` 用 8 位小数 → 只丢 5e-9，相对误差 4e-14，**完全不用提醒**
 * 而小数值则会真的失真：
 *   `0.00000123456789` 用 8 位小数 → 相对误差 0.37%，**该提醒**
 *
 * 所以阈值卡在万分之一（1e-4）。
 *
 * ## 什么时候不提醒
 *
 * 调用方自己指定 `displayPrecision` 时不提 —— 那是他的选择，再啰嗦就是噪音。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-loss-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const pr = await import(pathToFileURL(join(root, 'lib/precision-report.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 取一次调用。 */
async function call(args) {
  const r = await run(args)
  return { result: String(r.result || '').split('\n')[0], notice: String(r.notice || '') }
}

console.log('-- 1. 相对误差模块本身 --')
{
  assert('阈值是万分之一', pr.PRECISION_LOSS_THRESHOLD === 1e-4, String(pr.PRECISION_LOSS_THRESHOLD))

  pr.reportPrecisionLoss(0.001)
  assert('记录后能取出', Math.abs(pr.consumePrecisionLoss() - 0.001) < 1e-12, '')
  assert('取出后清零', pr.consumePrecisionLoss() === 0, '')

  // 只保留最大值
  pr.reportPrecisionLoss(0.001)
  pr.reportPrecisionLoss(0.05)
  pr.reportPrecisionLoss(0.002)
  assert('保留最大误差', Math.abs(pr.consumePrecisionLoss() - 0.05) < 1e-12, '')

  // 非有限值不该污染统计
  pr.reportPrecisionLoss(Number.NaN)
  pr.reportPrecisionLoss(Number.POSITIVE_INFINITY)
  assert('非有限值被忽略', pr.consumePrecisionLoss() === 0, '')
}

console.log('-- 2. 精度足够时不提醒（相对误差小）--')
{
  // 这些在 8 位小数下相对误差都远小于 1e-4
  const SAFE = ['1/7', '2^0.5', '12345.678901234', '1/3', '100/7']
  for (const expr of SAFE) {
    const r = await call({ operation: 'evaluate', expression: expr })
    assert(expr + ' 不报精度不足', !/相对误差/.test(r.notice),
      r.notice ? r.notice.slice(0, 40) : '(无提示)')
  }
}

console.log('-- 3. 相对误差大时：自动改用科学计数法 + 说明 --')
{
  /**
   * 小数值是重灾区：8 位小数只留下很少的有效数字。
   */
  /**
   * 小数值是重灾区：8 位小数只留下很少的有效数字。
   *
   * 2026-11-02 起不再只是「提醒」，而是**自动换成科学计数法**保住数据 ——
   * 提醒只能让读者警觉，换格式才是真的不丢精度。
   */
  const RISKY = [
    ['0.00000123456789', '1.23456789e-6'],
    ['0.000000123456789', '1.23456789e-7'],
  ]
  for (const [expr, expected] of RISKY) {
    const r = await call({ operation: 'evaluate', expression: expr })
    assert(expr + ' 自动改用科学计数法', r.result === expected, r.result + '（期望 ' + expected + '）')
    assert(expr + ' 提示说明原因', /科学计数法/.test(r.notice), r.notice.slice(0, 50))
    assert(expr + ' 提示给了建议位数', /displayPrecision:\d+/.test(r.notice), r.notice.slice(0, 66))
  }
}

console.log('-- 3b. 文档 P0-1 的核心案例：σ 不能丢精度 --')
{
  /**
   * 实测反馈里最危险的一条：斯特藩-玻尔兹曼常数 σ = 5.670374419e-8。
   *
   * 旧行为在 8 位小数下显示成  —— 相对误差 **5.8%**，
   * 而那个数字看起来完全正常，不会引起怀疑。
   */
  const sigma = await call({ operation: 'evaluate', expression: '5.670374419e-8' })
  assert('σ 不再显示成 0.00000006', sigma.result !== '0.00000006', sigma.result)
  assert('σ 用科学计数法', /e-8$/.test(sigma.result), sigma.result)
  const shown = Number(sigma.result)
  const rel = Math.abs(shown - 5.670374419e-8) / 5.670374419e-8
  assert('σ 显示值的相对误差 < 1e-6', rel < 1e-6, rel.toExponential(2))
}

console.log('-- 4. 关键判据：用相对误差而非绝对小数位 --')
{
  /**
   * `123456.789012345` 用 8 位小数虽然只保留 8 位小数，
   * 但相对误差是 4e-14 —— 精度完全够，**不该提醒**。
   *
   * 如果实现改用「小数位数绝对值」判断，这条就会误报。
   */
  const big = await call({ operation: 'evaluate', expression: '123456.789012345' })
  assert('大数 8 位小数不提示（相对误差仅 4e-14）', !/科学计数法/.test(big.notice), big.notice.slice(0, 40))
  assert('大数确实保留了 8 位小数', /123456\.\d{8}/.test(big.result), big.result)
}

console.log('-- 5. 显式指定时尊重用户（不擅自改格式）--')
{
  const explicit = await call({
    operation: 'evaluate',
    expression: '0.00000123456789',
    displayPrecision: 8,
  })
  assert('显式指定时结果按该位数给出（0.37% 损失不改格式）', explicit.result === '0.00000123', explicit.result)
  assert('显式且损失 < 1% 时不提示', explicit.notice === '', explicit.notice || '(无)')

  // 但传够位数后结果应准确
  const enough = await call({
    operation: 'evaluate',
    expression: '0.00000123456789',
    displayPrecision: 16,
  })
  assert('16 位小数给出完整值', enough.result === '0.00000123456789', enough.result)
}

console.log('-- 6. 提示内容有实际指导性 --')
{
  const r = await call({ operation: 'evaluate', expression: '0.00000123456789' })
  assert('说明已改用科学计数法', /已改用科学计数法/.test(r.notice), r.notice.slice(0, 40))
  assert('说明是按几位小数定点会丢精度', /按 8 位小数定点/.test(r.notice), r.notice.slice(0, 50))
  assert('给出具体误差百分比', /丢约 [\d.]+% 的精度/.test(r.notice), r.notice.slice(0, 54))
  assert('建议值比当前大', (() => {
    const m = r.notice.match(/displayPrecision:(\d+)/)
    return m && Number(m[1]) > 8
  })(), r.notice.slice(0, 70))
  // 措辞不反驳作者
  assert('措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(r.notice), '')
}

console.log('-- 7. 尾随零不该留着（可读性）--')
{
  const r = await call({ operation: 'evaluate', expression: '0.00000123456789', displayPrecision: 16 })
  assert('16 位下无尾随零', r.result === '0.00000123456789', r.result)

  const t = await call({ operation: 'evaluate', expression: '1.5', displayPrecision: 8 })
  assert('1.5 不写成 1.50000000', t.result === '1.5', t.result)

  const third = await call({ operation: 'evaluate', expression: '1/3', precision: 30 })
  assert('1/3 在 precision=30 下给 30 位', /^0\.3{30}$/.test(third.result), third.result.slice(0, 40))
}

console.log('-- 8. 整数永远不触发精度提醒 --')
{
  for (const expr of ['10^20+5', 'factorial(20)', '2+2']) {
    const r = await call({ operation: 'evaluate', expression: expr })
    assert(expr + ' 无精度提示', !/相对误差/.test(r.notice), r.notice.slice(0, 30))
  }
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
