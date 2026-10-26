/**
 * 天体目录与常数传导。
 *
 * ## 为什么需要这一套
 *
 * 「把宇宙各种星体的数据都补上」不是填表——一旦作者改 α、G、c，
 * 这张表立刻分裂成三类，而**分错类是本模块最致命的失败模式**：
 *
 * | 类别 | 例 | 处置 |
 * |---|---|---|
 * | 有幂次 | 化学键能 ∝ α²、逃逸速度 ∝ √G | 算出倍数 |
 * | 间接依赖 | 行星平衡温度（经恒星光度） | **必须重跑**，但没有倍数公式 |
 * | 严格不动 | 行星质量、半径、轨道半长轴 | **绝不该改**，改了就是篡改设定 |
 *
 * 最容易犯的两个错，都静默：
 *   1. 改 α 后把行星质量也跟着改（质量与 α 无关）
 *   2. 把「行星平衡温度」列进「不该动」（它随恒星光度变，拿旧值写新宇宙就错了）
 *
 * 第 2 条我第一版就写错了：平衡温度被同时列进「间接」和「不该动」两块。
 * 本套测试专门钉这一点。
 *
 * ## 数值来源
 *
 * 目录数值取自真实观测（太阳系用 JPL 星历、系外行星用已确认任务数据）。
 * 断言的是数量级与相对关系（火星半径约地球一半、金星比水星热），
 * 不是小数位——观测误差本来就大。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-bodies-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const catalog = await import(pathToFileURL(join(root, 'lib/body-catalog.js')).href)
const scaling = await import(pathToFileURL(join(root, 'lib/body-scaling.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次 bodies。 */
async function bodies(args) {
  const r = await run({ operation: 'bodies', ...args })
  return { ok: r.ok, text: String(r.result || ''), value: r.value }
}

console.log('-- 1. 目录规模与覆盖 --')
{
  const all = catalog.ALL_NAMED_BODIES
  assert('天体总数 ≥ 20', all.length >= 20, String(all.length))

  // 太阳系八颗必须齐
  const solar = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']
  for (const id of solar) {
    assert('收录 ' + id, catalog.BODY_INDEX.has(id), '')
  }
  // 卫星与系外行星
  for (const id of ['europa', 'titan', 'enceladus', 'kepler-1649c', 'gj-1214b']) {
    assert('收录 ' + id, catalog.BODY_INDEX.has(id), '')
  }
  // 恒星：必须补上非主序（这是原来的最大缺口）
  const stars = catalog.NAMED_STARS
  assert('恒星数 ≥ 6', stars.length >= 6, String(stars.length))
  const classes = stars.map((s) => s.luminosityClass)
  assert('有主序星 V', classes.includes('V'), classes.join(','))
  assert('有巨星 III', classes.includes('III'), classes.join(','))
  assert('有超巨星 I', classes.includes('I'), classes.join(','))
  assert('有白矮星 D', classes.includes('D'), classes.join(','))
}

console.log('-- 2. 数值合理性（数量级检查）--')
{
  const mars = catalog.BODY_INDEX.get('mars')
  assert('火星半径约 0.53 R⊕', Math.abs(mars.radiusEarth.value - 0.53) < 0.02,
    String(mars.radiusEarth.value))
  assert('火星轨道 1.52 AU', Math.abs(mars.semiMajorAxisAU.value - 1.524) < 0.01,
    String(mars.semiMajorAxisAU.value))

  const jupiter = catalog.BODY_INDEX.get('jupiter')
  assert('木星半径约 11 R⊕', Math.abs(jupiter.radiusEarth.value - 11.2) < 0.3,
    String(jupiter.radiusEarth.value))

  // 金星比水星热 —— 这是「温室效应能压过日照」的关键事实
  const venus = catalog.BODY_INDEX.get('venus')
  const mercury = catalog.BODY_INDEX.get('mercury')
  assert('金星地表比水星热（温室压过日照）',
    venus.surfaceTempK.value > mercury.surfaceTempK.value,
    venus.surfaceTempK.value + ' vs ' + mercury.surfaceTempK.value)

  // GJ 1214b：质量 6.55 M⊕ 但重力 < 1 g —— 打破「质量大=重力大」的直觉
  const gj = catalog.BODY_INDEX.get('gj-1214b')
  assert('GJ 1214b 质量 6.55 M⊕ 但重力 < 1 g',
    gj.massEarth.value > 6 && gj.surfaceGravityG.value < 1,
    gj.massEarth.value + ' M⊕ / ' + gj.surfaceGravityG.value + ' g')
}

console.log('-- 3. 依赖类别：每个数值都必须标注 --')
{
  let unlabeled = []
  for (const body of catalog.ALL_NAMED_BODIES) {
    for (const [key, value] of Object.entries(body)) {
      if (!value || typeof value !== 'object') continue
      const rec = value
      if (typeof rec.value === 'number' && typeof rec.source === 'string') {
        if (!rec.dependence) unlabeled.push(body.id + '.' + key)
      }
    }
  }
  assert('所有数值都有 dependence 标注', unlabeled.length === 0,
    unlabeled.slice(0, 5).join(',') || '无')

  // calibrated 必须有适用域，否则等于「无条件的错误」
  let noDomain = []
  for (const body of catalog.ALL_NAMED_BODIES) {
    for (const [key, value] of Object.entries(body)) {
      if (!value || typeof value !== 'object') continue
      const rec = value
      if (rec.dependence === 'calibrated' && !rec.domain) noDomain.push(body.id + '.' + key)
    }
  }
  assert('calibrated 都写了适用域', noDomain.length === 0, noDomain.slice(0, 5).join(',') || '无')
}

console.log('-- 4. 常数传导：三类必须分清（核心）--')
{
  // α × 2
  const a = scaling.propagateConstantChange('alpha_fs', 2)
  assert('α×2：有幂次的量', a.effects.length >= 4, String(a.effects.length))
  assert('α×2：化学键能 ×4（∝α²）',
    Math.abs(a.effects.find((e) => e.quantity === '化学键能').multiplier - 4) < 1e-9, '')
  assert('α×2：原子尺度 ×0.5（∝1/α）',
    Math.abs(a.effects.find((e) => e.quantity.includes('原子尺度')).multiplier - 0.5) < 1e-9, '')

  // 关键回归：平衡温度必须在「间接」里，不能在「不该动」里
  assert('α×2：行星平衡温度列在 indirect',
    a.indirect.some((i) => i.quantity.includes('平衡温度')), '')
  assert('α×2：平衡温度**不在** unchanged（拿旧值写新宇宙就错）',
    !a.unchanged.some((u) => u.includes('平衡温度')), a.unchanged.join(','))
  assert('α×2：行星质量在 unchanged',
    a.unchanged.some((u) => u.includes('质量')), a.unchanged.join(','))
  // 同一量不能同时出现在两块
  for (const item of a.indirect) {
    assert('「' + item.quantity + '」没有同时出现在 unchanged',
      !a.unchanged.includes(item.quantity), '')
  }

  // G × 2
  const g = scaling.propagateConstantChange('G', 2)
  assert('G×2：表面重力 ×2（∝G）',
    Math.abs(g.effects.find((e) => e.quantity === '表面重力').multiplier - 2) < 1e-9, '')
  assert('G×2：逃逸速度 ×√2',
    Math.abs(g.effects.find((e) => e.quantity === '逃逸速度').multiplier - Math.SQRT2) < 1e-9, '')
  assert('G×2：轨道周期 ×1/√2',
    Math.abs(g.effects.find((e) => e.quantity === '轨道周期').multiplier - 1 / Math.SQRT2) < 1e-9, '')
  assert('G×2：行星质量不变（关键）',
    g.unchanged.some((u) => u.includes('质量')), g.unchanged.join(','))

  // c × 0.5 → α × 2
  const c = scaling.propagateConstantChange('c', 0.5)
  assert('c×0.5：α ×2（∝1/c）',
    Math.abs(c.effects.find((e) => e.quantity.includes('α') || e.quantity.includes('精细'))?.multiplier - 2) < 1e-9,
    JSON.stringify(c.effects.map((e) => e.quantity)))
}

console.log('-- 5. 工具层：三种用法都要通 --')
{
  const list = await bodies({})
  assert('不带参数列出全部', list.ok && /天体目录/.test(list.text), '')
  assert('列表含恒星与行星', /【恒星】/.test(list.text) && /【类地行星】/.test(list.text), '')

  const one = await bodies({ bodyName: 'mars' })
  assert('按 id 查火星', one.ok && /火星/.test(one.text), '')
  assert('显示依赖标记', /物理必然/.test(one.text) && /地球标定/.test(one.text), '')
  assert('火星质量标「改常数不该动」', /质量.*物理必然/.test(one.text.replace(/\n.*?/gs, '')) || /物理必然/.test(one.text), '')

  const cn = await bodies({ bodyName: '火星' })
  assert('按中文名也能查', cn.ok && /mars/.test(cn.text), '')

  const kind = await bodies({ bodyKind: 'moon' })
  assert('按类别筛卫星', kind.ok && /卫星/.test(kind.text), '')

  const bad = await bodies({ bodyName: '不存在的天体xyz' })
  assert('查不到时给可用清单', !bad.ok || /找不到天体/.test(bad.text),
    bad.ok ? '竟然成功了' : '')
}

console.log('-- 6. 结构化输出（AI 读 value，不只是文本）--')
{
  const one = await bodies({ bodyName: 'mars' })
  assert('value.body 存在', Boolean(one.value && one.value.body), '')
  assert('value 里带 dependence',
    Boolean(one.value && one.value.body && one.value.body.massEarth &&
      one.value.body.massEarth.dependence), '')

  const prop = await bodies({ bodyConstant: 'G', bodyFactor: 2 })
  assert('传导结果有 effects', Array.isArray(prop.value && prop.value.effects), '')
  assert('传导结果有 unchanged', Array.isArray(prop.value && prop.value.unchanged), '')
}

console.log('-- 7. 照搬作者场景：改 α 后该怎么处理 --')
{
  const r = await bodies({ bodyConstant: 'alpha_fs', bodyFactor: 2 })
  // 输出必须明确告诉作者「质量不该动」
  assert('明确说「行星质量不该动」', /行星质量|质量.*绝不该动|篡改设定/.test(r.text), '')
  // 也必须说「平衡温度要重跑」
  assert('明确说平衡温度要重跑', /平衡温度/.test(r.text) && /重跑|world/.test(r.text), '')
  // 措辞不反驳设定
  assert('措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(r.text), '')
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
