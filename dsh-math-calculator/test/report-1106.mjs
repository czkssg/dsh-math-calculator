/**
 * 2026-11-06 实测反馈报告里的真缺陷。
 *
 * 这份报告的特点是**先讲自己的错、再讲工具的缺陷**，每条都带复现。
 * 本次采纳的是其中 6 条真缺陷；另有 3 条误判没有照做（见 docs/ 里的评审记录）。
 *
 * 本套守的是四条最要紧的：
 *   1. 批量失败时顶层 ok 必须为 false（否则 if (r.ok) 永远为真）
 *   2. label 量级警告不许 100% 误报（上一轮引入的回归）
 *   3. 中文单位必须能参与运算（两条路径的单位表要打通）
 *   4. units 的代入过程不许有同义重复
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-rpt1106-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. 批量失败时 ok 契约（报告 2.8）--')
{
  const allOk = await run({ operation: 'evaluate', expressions: ['1+1', '2+2'] })
  assert('全成功时 ok=true', allOk.ok === true, '')
  assert('全成功时不带 partial', allOk.partial === undefined, String(allOk.partial))

  const mixed = await run({ operation: 'evaluate', expressions: [{ label: '坏', expr: 'unknown_var*2' }, '2+2'] })
  assert('有失败时 ok=false', mixed.ok === false, '这是本次最要紧的一条：以前恒为 true')
  assert('部分成功时 partial=true', mixed.partial === true, String(mixed.partial))
  assert('failed 计数正确', mixed.failed === 1, String(mixed.failed))
  assert('succeeded 计数正确', mixed.succeeded === 1, String(mixed.succeeded))

  const allFail = await run({ operation: 'evaluate', expressions: ['qqq1', 'qqq2'] })
  assert('全失败时 ok=false', allFail.ok === false, '')
  assert('全失败时 partial=false（没有可用结果）', allFail.partial === false, String(allFail.partial))

  /** 关键：if (!r.ok) 现在真的能判断出来了 */
  const callerSeesFailure = !mixed.ok
  assert('调用方用 if (!r.ok) 能识别失败', callerSeesFailure, '报告原话：得到的结果是「永远成功」')
}

console.log('-- 2. label 量级警告不许误报（报告 2.1）--')
{
  /**
   * 报告里的原复现：label 是「条件描述」，不是「结果单位」。
   * 以前 100% 误报，现在必须一条都不报。
   */
  const t = await text({
    operation: 'evaluate',
    terse: true,
    expressions: [
      { label: '1亿棵树日产台', expr: '1e8*25000' },
      { label: '24h百万步兵需求', expr: '1e6' },
    ],
  })
  assert('条件型 label 不产生警告', !/⚠/.test(t), t.slice(-60))
  assert('但量级标注仍在', /~10/.test(t), '')

  /**
   * 真该报的仍要报：label 声称单位是「亿」，而结果本身**已达 10⁸**。
   *
   * 判据方向：结果量级 ≥ 声称量级时才可疑
   * （288 只有 10²，本来就该是「288 亿」，没必要提醒）。
   * 危险的是这种：结果已经写出 288000000（10⁸），
   * 而 label 还说「亿」—— 那读成「288000000 亿」就是 2.88e16，差 8 个数量级。
   */
  const t2 = await text({
    operation: 'evaluate',
    terse: true,
    expressions: [{ label: '年发电量亿', expr: '288000000' }],
  })
  assert('单位型 label 且结果已达该量级时报警告', /⚠/.test(t2), t2.slice(-90))

  /** 括号形态也算单位型 */
  const t3 = await text({
    operation: 'evaluate',
    terse: true,
    expressions: [{ label: '产量（万件）', expr: '120000' }],
  })
  assert('括号内的量级词也算单位型', /⚠/.test(t3), t3.slice(-80))

  /** 结果量级远小于声称量级时不该报（288 亿 本来就是 288，没问题） */
  const t5 = await text({
    operation: 'evaluate',
    terse: true,
    expressions: [{ label: '年发电量亿', expr: '288' }],
  })
  assert('结果远小于声称量级时不报', !/⚠/.test(t5), t5.slice(-60))

  /** 条件描述即使含量级词也不报 */
  const t4 = await text({
    operation: 'evaluate',
    terse: true,
    expressions: [{ label: '一天产出1亿', expr: '1e8' }],
  })
  assert('含量级的条件描述不报', !/⚠/.test(t4), t4.slice(-60))
}

console.log('-- 3. 中文单位参与运算（报告 2.2）--')
{
  const cases = [
    ['1 里 + 3 米', /^503 m$/, '里 = 500 m'],
    ['3 公里 + 500 米', /^3\.5 km$/, '公里优先于里，不被拆错'],
    ['2 斤 + 300 克', /^1\.3 kg$/, '斤 = 500 g'],
    ['1 丈 + 2 尺', /^3\.84 m$/, '丈 3.2 m + 尺 0.32×2'],
    ['5 亩 + 100 m²', /^3433/, '亩 = 666.67 m²，且 m² 上标能解析'],
    ['1 时辰 + 30 分钟', /^9 ks$/, '时辰 = 7200 s'],
  ]
  for (const [expr, re, note] of cases) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('中文单位可算: ' + expr, re.test(t), t + '  (' + note + ')')
  }

  /** 英文/符号单位这条路不能坏 */
  const en = [
    ['3 km + 500 m', /^3\.5 km$/],
    ['2 kg + 300 g', /^2\.3 kg$/],
    ['9.81 m/s^2', /9\.81/],
    ['5 cm to inch', /inch/],
  ]
  for (const [expr, re] of en) {
    const t = (await text({ operation: 'evaluate', expression: expr })).trim()
    assert('英文单位不坏: ' + expr, re.test(t), t.slice(0, 40))
  }
}

console.log('-- 4. units 代入过程不许同义重复（报告 2.6）--')
{
  const t = await text({ operation: 'units', unitValue: 9e15, unitFrom: 'kg', unitTo: 't' })
  /** 「1 kg = 1 kg」「9e15 kg = 9e15 kg」这类是废话 */
  assert('不出现 X = X 的同义行', !/·\s*1 kg = 1 kg/.test(t), t.slice(0, 100))
  assert('不出现值重复行', !/·\s*9\.0000e\+15 kg = 9\.0000e\+15 kg/.test(t), '')
  assert('但结论仍在', /= 9000000000000 t/.test(t), '')

  /** 非基准到非基准时，两条换算关系都要给（那是有信息的） */
  const t2 = await text({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('里→km 给出两条依据', /1 里 = 500 m/.test(t2) && /1 km = 1000 m/.test(t2), t2.slice(0, 120))
}

console.log('-- 5. units 的 terse 生效（报告 2.6）--')
{
  const terse = (await text({ operation: 'units', unitValue: 9e15, unitFrom: 'kg', unitTo: 't', terse: true })).trim()
  assert('terse 只回一行（+可选警示）', terse.split('\n').length <= 2, String(terse.split('\n').length))
  assert('terse 仍给出结果', /= 9000000000000 t/.test(terse), terse.slice(0, 80))
  /**
   * terse 不许吞掉适用域提示 —— 与批量的约定一致。
   * 「里在周制约 415 m」这类信息被省掉，调用方会拿错朝代的值去写设定。
   */
  const terseLi = await text({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km', terse: true })
  assert('terse 仍保留适用域提示', /周制|415/.test(terseLi), terseLi.slice(0, 100))
}

console.log('-- 6. 英文全称别名（报告 2.4）--')
{
  const cases = [
    ['ton', 'kg'], ['tonne', 'kg'], ['meters', 'm'], ['metre', 'm'],
    ['hectare', 'm²'], ['grams', 'g'], ['seconds', 's'],
  ]
  for (const [from, to] of cases) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    assert('英文全称可换算: ' + from, r.ok === true, r.ok ? '' : String(r.result || r.error?.message).slice(0, 60))
  }
}

console.log('-- 7. 面积别名（报告 2.3 修正后）--')
{
  const cases = [['km2', 'm²'], ['km^2', 'm²'], ['m2', 'm²'], ['平方米', 'm²'], ['公顷', 'm²']]
  for (const [from, to] of cases) {
    const r = await run({ operation: 'units', unitValue: 1, unitFrom: from, unitTo: to })
    assert('面积别名: ' + from, r.ok === true, r.ok ? '' : String(r.result || r.error?.message).slice(0, 50))
  }
  /** 表达式里也要认 */
  const t = (await text({ operation: 'evaluate', expression: '5 km2' })).trim()
  assert('表达式里 km2 可用', /km\^2/.test(t), t)
}

console.log('-- 8. 批量元素里的未知键要点名（本报告未提，实测发现）--')
{
  const r = await run({ operation: 'evaluate', expressions: [{ label: '带unit', expr: '1+1', unit: 'kg/day' }] })
  assert('元素里的未知键导致该条失败', r.ok === false, '')
  assert('但其它条不受影响（逐条独立）', r.succeeded === 0 && r.failed === 1, 'failed=' + r.failed)

  const mixed = await run({ operation: 'evaluate', expressions: [{ label: '好的', expr: '2+2' }, { label: '坏的', expr: '1+1', foo: 1 }] })
  assert('混合时成功条目仍可用', mixed.succeeded === 1, String(mixed.succeeded))
  assert('并点名是哪个键', /foo/.test(String(mixed.result)), '')
}

console.log('-- 10. 锚点校验 sanity（方案 A 层）--')
{
  /**
   * ## 这一节的验收标准来自方案文档
   *
   * 1. **拦住数 ≥ 2/3**：用报告里的三个历史案例回放
   * 2. **零误报**：不传 sanity 时输出与以前完全一致
   * 3. **不猜**：警告必须引用调用方给的 note
   * 4. **结果数字绝不受影响**：换 sanity 不改 computed 值
   */
  const case1 = await run({
    operation: 'evaluate', terse: true,
    expressions: [{ label: '日产台数', expr: '1e8*25000', sanity: { max: 1e10, note: '帝国总兵力' } }],
  })
  const t1 = String(case1.result)
  assert('案例1 拦住（超上限）', /超出锚点上限/.test(t1), t1.slice(-80))
  assert('案例1 引用调用方给的依据', /帝国总兵力/.test(t1), '')
  assert('案例1 给出倍数', /达 250 倍/.test(t1), '')

  const case2 = await run({
    operation: 'evaluate', terse: true,
    expressions: [{ label: '年耗N2', expr: '2645.6*28*3600*8000/1e9', sanity: { expect: 4, note: '应为万吨' } }],
  })
  const t2 = String(case2.result)
  assert('案例2 拦住（量级偏离）', /量级偏离锚点期望/.test(t2), t2.slice(-80))
  assert('案例2 说差几个数量级', /差 1 个数量级/.test(t2), '')

  /**
   * 案例 3 是**故意拦不住**的：拿「材料吨位」与「成品台数」比较，
   * 两者都在各自上限内，锚点没有任何理由报。
   * 这条断言存在的意义是**把限制写成测试**，防止将来吹嘘它能做量纲判断。
   */
  const case3 = await run({
    operation: 'evaluate', terse: true,
    expressions: [
      { label: '材料流', expr: '9e7', sanity: { max: 1e12 } },
      { label: '成品流', expr: '0.25', sanity: { max: 1e12 } },
    ],
  })
  assert('案例3 不报（量纲不可比，锚点挡不住）', !/⚠/.test(String(case3.result)), '')

  /** 零误报：不传 sanity 时一条新提示都不该有 */
  const noSanity = await run({ operation: 'evaluate', expressions: ['1e8*25000'] })
  assert('不传 sanity 无新提示', !/⚠/.test(String(noSanity.result)), '')
  const withLabelOnly = await run({ operation: 'evaluate', expressions: [{ label: '台数', expr: '1e8*25000' }] })
  assert('只传 label 也不该有新提示', !/⚠/.test(String(withLabelOnly.result)), '')

  /** 结果数字不受 sanity 影响 —— 用维度守住「纯提示参数不得改变计算」 */
  const a = await run({ operation: 'evaluate', expressions: [{ label: 'x', expr: '1e8*25000' }] })
  const b = await run({ operation: 'evaluate', expressions: [{ label: 'x', expr: '1e8*25000', sanity: { max: 1 } }] })
  const numOf = (r) => String(r.result).match(/([0-9]{6,})/)?.[1] ?? ''
  assert('换 sanity 不改数值', numOf(a) === numOf(b) && numOf(a) !== '', numOf(a) + ' vs ' + numOf(b))

  /** 非有限数不参与锚点比对（Infinity > max 恒真，但提示毫无信息量） */
  const inf = await run({ operation: 'evaluate', expressions: [{ label: 'x', expr: '1/0', sanity: { max: 1e10 } }] })
  assert('Infinity 不触发锚点提示', !/超出锚点/.test(String(inf.result)), '')

  /** min 与 expect 也要能工作 */
  const min = await run({ operation: 'evaluate', terse: true, expressions: [{ label: 'x', expr: '0.001', sanity: { min: 1, note: '不该这么小' } }] })
  assert('min 下限生效', /低于锚点下限/.test(String(min.result)), '')
  const ok = await run({ operation: 'evaluate', terse: true, expressions: [{ label: 'x', expr: '5000', sanity: { expect: 3 } }] })
  assert('同量级不报（expect 允许差 0）', !/⚠/.test(String(ok.result)), '')

  /** note 不给时不编依据 */
  const noNote = await run({ operation: 'evaluate', terse: true, expressions: [{ label: 'x', expr: '1e20', sanity: { max: 1e10 } }] })
  assert('没给 note 时用中性说法', /按你设定的锚点/.test(String(noNote.result)), String(noNote.result).slice(-60))
}

console.log('-- 9. 措辞不出现「错误/禁止/必须」--')
{
  const t = await text({ operation: 'evaluate', expressions: [{ label: 'x', expr: '1+1', foo: 1 }] })
  assert('元素校验措辞合规', !/错误|禁止|必须/.test(t), t.slice(0, 80))
  const t2 = await text({ operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km', terse: true })
  assert('units terse 措辞合规', !/错误|禁止|必须/.test(t2), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
