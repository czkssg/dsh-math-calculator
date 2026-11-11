/**
 * hierarchy（编制/层级树）的测试。
 *
 * ## 为什么这项最痛
 *
 * 反馈包 `14` 号实测：99层项目**连续 7 轮返工，其中 5 轮是它**。
 *
 * > 层级树要「树状 + 闭合」：每级辖属数、底层基数、总兵力三者必须自洽。
 * > 而 AI 只能一层一层算，每回都漏掉某一级。
 *
 * 这个形状与单点公式完全不同：**算一张表**而不是算一个数。
 *
 * ## 本套件守三件事
 *
 *   ① **正算的每级数字都对**（这是基础，也是最容易一层一层算错的地方）
 *   ② **反解要标出不相容的层级**（返工就发生在这里）
 *   ③ **两个都给时要校验并说清差额与可能原因**
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-hierarchy-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

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

const run = (hierarchy) => runMathTool({ operation: 'hierarchy', hierarchy })
const txt = (r) => String(r.result ?? '')

/** 经典五级编制：3-3-3-3，班 10 人 → 师 810。 */
const ARMY = { levels: ['师', '团', '营', '连', '班'], tree: [3, 3, 3, 3], base: 10 }

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 正算：每级都对（一层一层算最容易错的地方）--')
// ───────────────────────────────────────────────────────────
{
  const r = await run(ARMY)
  assert('正算成功', r.ok === true, txt(r).slice(0, 50))

  /**
   * `factor[i]` = 一个第 i 级单位含几个最底层单位。
   * 师 = 81、团 = 27、营 = 9、连 = 3、班 = 1。
   */
  const expectFactor = [81, 27, 9, 3, 1]
  assert('factor 链自下而上累乘正确',
    JSON.stringify(r.value?.factor) === JSON.stringify(expectFactor),
    JSON.stringify(r.value?.factor))
  assert('一个满编师 = 810 人', r.value?.fullStrength === 810, String(r.value?.fullStrength))

  /** 表格里每级的「本级单位数」都该出现。 */
  for (const [level, count] of [['师', 1], ['团', 3], ['营', 9], ['连', 27], ['班', 81]]) {
    const line = txt(r).split('\n').find((one) => one.trim().startsWith(level)) ?? ''
    assert(`${level} 的单位数是 ${count}`, line.includes(String(count)), line.trim())
  }
  /** 每单位含人。 */
  for (const [level, people] of [['师', 810], ['团', 270], ['营', 90], ['连', 30], ['班', 10]]) {
    const line = txt(r).split('\n').find((one) => one.trim().startsWith(level)) ?? ''
    assert(`${level} 每单位含 ${people} 人`, line.includes(String(people)), line.trim())
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 不同倍数链也要对 --')
// ───────────────────────────────────────────────────────────
{
  /** 苏式：师辖 3 团、团辖 3 营、营辖 3 连、连辖 3 排、排辖 3 班。 */
  const r = await run({ levels: ['师', '团', '营', '连', '排', '班'], tree: [3, 3, 3, 3, 3], base: 9 })
  assert('六级 3×3×3×3×3=243', r.value?.fullStrength === 9 * 243, String(r.value?.fullStrength))

  /** 不等倍数：师 4 团、团 3 营、营 3 连。 */
  const mixed = await run({ levels: ['师', '团', '营', '连'], tree: [4, 3, 3], base: 20 })
  assert('不等倍数 4×3×3=36', mixed.value?.fullStrength === 20 * 36, String(mixed.value?.fullStrength))

  /** 两级。 */
  const two = await run({ levels: ['大', '小'], tree: [5], base: 10 })
  assert('两级最少情形', two.value?.fullStrength === 50, String(two.value?.fullStrength))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 校验：两个都给时判自洽 --')
// ───────────────────────────────────────────────────────────
{
  /** 自洽：1000 = 810 × 不整，所以要用能除尽的数。810 × 2 = 1620。 */
  const ok = await run({ ...ARMY, total: 1620 })
  assert('1620 与 810 自洽', ok.value?.closed === true, String(ok.value?.closed))
  assert('文本说「自洽」', /自洽/.test(txt(ok)), '')

  /** 不自洽：1000 / 810 = 1.23。 */
  const bad = await run({ ...ARMY, total: 1000 })
  assert('1000 与 810 不自洽', bad.value?.closed === false, String(bad.value?.closed))
  assert('文本说「对不上」', /对不上/.test(txt(bad)), '')
  assert('给出差额', /差 190 人/.test(txt(bad)), '')
  assert('★ 给出三种可能原因', /三种可能/.test(txt(bad)), '')
  assert('原因①：倍数写错', /tree 倍数写错/.test(txt(bad)), '')
  assert('原因②：base 口径不对', /base 不是/.test(txt(bad)), '')
  assert('原因③：满编 vs 实有', /实有.*满编|满编.*实有/.test(txt(bad)), '')
  assert('指路：只给 total 反解', /只给 total/.test(txt(bad)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 反解：只给总兵力 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ levels: ARMY.levels, tree: ARMY.tree, total: 810 })
  assert('反解成功', r.ok === true, txt(r).slice(0, 50))
  /** 810 人配 3-3-3-3 → 每班正好 10 人。 */
  const banLine = txt(r).split('\n').find((one) => one.trim().startsWith('班')) ?? ''
  assert('反解出每班 10 人', banLine.includes('10'), banLine.trim())

  /** 5000 人配 3-3-3-3 → 每班 61.7 人（不整，提示要调）。 */
  const odd = await run({ levels: ARMY.levels, tree: ARMY.tree, total: 5000 })
  assert('不整时仍能算', odd.ok === true, '')
  assert('提示「需要调」', /需要调|不相容/.test(txt(odd)), '')

  /** 反解出的单位数都该是整数（倍数链决定的，与总兵力无关）。 */
  const values = odd.value?.factor ?? []
  assert('反解的 factor 链与正算一致', JSON.stringify(values) === JSON.stringify([81, 27, 9, 3, 1]),
    JSON.stringify(values))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 错误处理 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'hierarchy' })
  assert('不给参数报错', none.ok === false, String(none.ok))
  assert('报错给示例', /levels/.test(none.error?.hint ?? ''), '')

  const oneLevel = await run({ levels: ['师'], tree: [], base: 10 })
  assert('单级报错', oneLevel.ok === false, String(oneLevel.ok))
  assert('说明单级不需要编制树', /至少要两级|不需要编制树/.test(oneLevel.error?.message ?? ''), '')

  /** tree 长度必须 = levels − 1。 */
  const badTree = await run({ levels: ['师', '团', '营'], tree: [3], base: 10 })
  assert('tree 长度不符报错', badTree.ok === false, String(badTree.ok))
  assert('报错说清应为几个', /2/.test(badTree.error?.message ?? ''), badTree.error?.message?.slice(0, 50))

  /** 倍数为 0 或负。 */
  const zeroTree = await run({ levels: ['师', '团'], tree: [0], base: 10 })
  assert('倍数为 0 报错', zeroTree.ok === false, String(zeroTree.ok))
  const negTree = await run({ levels: ['师', '团'], tree: [-3], base: 10 })
  assert('倍数为负报错', negTree.ok === false, String(negTree.ok))

  /** base 与 total 都不给。 */
  const noBase = await run({ levels: ['师', '团'], tree: [3] })
  assert('base/total 都不给报错', noBase.ok === false, String(noBase.ok))
  assert('说明两者给一个即可', /base.*total|total.*base/.test(noBase.error?.hint ?? ''), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 结构化输出与边界 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run(ARMY)
  for (const key of ['levels', 'tree', 'base', 'total', 'factor', 'fullStrength', 'closed']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')

  /** 大数不该变科学计数法（总兵力常到百万）。 */
  const big = await run({ levels: ['军区', '军', '师', '团', '营', '连', '班'], tree: [4, 4, 4, 4, 4, 4], base: 10 })
  assert('百万级总兵力能算', big.value?.fullStrength === 10 * Math.pow(4, 6),
    String(big.value?.fullStrength))

  /** 小数基数（如平均每班 9.5 人）。 */
  const frac = await run({ levels: ['连', '班'], tree: [3], base: 9.5 })
  assert('小数基数可用', frac.value?.fullStrength === 28.5, String(frac.value?.fullStrength))
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
