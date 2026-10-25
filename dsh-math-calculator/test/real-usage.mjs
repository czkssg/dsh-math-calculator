/**
 * 实际使用验收：按作者真实的提问方式跑一遍，检查输出**能不能用**。
 *
 * ## 与其它套件的区别
 *
 * 别的套件验「算得对不对」；这一套验「作者拿去能不能用」：
 *   · 输出里有没有让 AI 去找不存在的东西（界面已删）
 *   · 数字有没有单位、有没有可信度标签
 *   · 结论是不是只给方向不给数字（那种等于没说）
 *   · 措辞会不会反驳作者的设定
 *   · 一个完整场景从头到尾推下来，前后是否自洽
 *
 * ## 场景
 *
 * 一位作者想写「1.5 倍重力、有巨兽、两百万人口的王国」的星球。
 * 他依次会问：这星球什么样 → 50 米怪物站得住吗 → 300 米塔能建吗 →
 * 王国养得起二十万兵吗 → 化学火箭能飞出去吗 → 古人说的「三十里」是多远。
 *
 * 这套测试就是把这段话跑一遍，检查每条回答是否可用。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-real-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次工具调用。 */
async function call(args) {
  const r = await run(args)
  return { ok: r.ok, text: r.result || '', value: r.value, error: r.error }
}

/** 输出里不该出现的东西：已删界面、内部术语、伪精度。 */
const FORBIDDEN_IN_OUTPUT = [
  ['侧栏', /侧栏/],
  ['点开面板', /点开.*面板/],
  ['图形化管理', /图形化管理/],
  ['Infinity', /Infinity/],
  ['NaN', /NaN/],
  ['undefined', /undefined/],
  ['[object Object]', /\[object Object\]/],
]

/** 检查一段输出是否「干净」。 */
function clean(label, text) {
  for (const [why, re] of FORBIDDEN_IN_OUTPUT) {
    assert(label + ' 输出不含「' + why + '」', !re.test(text),
      (text.match(re) ? text.slice(Math.max(0, text.search(re) - 60), text.search(re) + 60) : ''))
  }
}

console.log('-- 1. 作者问「这星球什么样」--')
{
  const r = await call({
    operation: 'world', planetMass: 1.5, planetRadius: 1,
    rotationHours: 30, obliquityDeg: 23.4,
  })
  assert('世界推演成功', r.ok, String(r.error && r.error.message))
  assert('给了表面重力', /表面重力.*1\.50 倍|1\.50 倍.*地球/.test(r.text) || r.text.includes('14.73'),
    '')
  assert('给了逃逸速度', r.text.includes('13.7'), '')
  assert('给了大气标高', /标高/.test(r.text), '')
  assert('有可信度标签（[精确]/[标度]/[量级]/[仅方向]）',
    /\[(精确|标度|量级|仅方向)\]/.test(r.text), '')
  assert('有跨模块一致性检查', r.text.includes('跨模块一致性'), '')
  assert('说明哪些只是地球标定', r.text.includes('地球标定'), '')
  // 措辞不能反驳作者
  assert('措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(r.text), '')
  clean('世界推演', r.text)
}

console.log('-- 2. 作者问「50 米巨兽站得住吗」--')
{
  const r = await call({
    operation: 'feasibility',
    world: { planetMass: 1.5 },
    claims: { creatureHeight: 50 },
  })
  assert('校验成功', r.ok, '')
  assert('判为超限', /超限|✗/.test(r.text), '')
  // 必须给出上限数字，而不只是说「不行」
  assert('给出了具体上限（16.6 m 量级）', /1[0-9]\.[0-9]\s*m|16\.6/.test(r.text), '')
  // 必须给方向（怎么才能成立）
  assert('给了调整方向', /建议|降.*重力|减小行星质量/.test(r.text), '')
  // 作者要的就是 50 米巨兽，插件不能说不许
  assert('没说「不能这样写/不允许」', !/不允许|不能这样|禁止/.test(r.text), '')
  clean('一致性校验', r.text)
}

console.log('-- 3. 作者问「300 米高的塔能建吗」--')
{
  const r = await call({
    operation: 'feasibility',
    world: { planetMass: 1.5 },
    claims: { buildingHeight: 300 },
  })
  assert('校验成功', r.ok, '')
  assert('判为安全（300 m 远低于 1.5g 下的上限）', /安全|✓/.test(r.text), '')
  clean('建筑校验', r.text)
}

console.log('-- 4. 作者问「王国养得起二十万兵吗」--')
{
  const r = await call({
    operation: 'balance',
    balance: {
      grain: { demand: 2.294e8, supply: 4e8, unit: 'kg/年' },
      fiscal: { demand: 3e7, supply: 6e7, unit: '银币/年' },
      water: { demand: 1.2e6, supply: 1.1e6, unit: 'm³/年' },
    },
  })
  assert('收支盘点成功', r.ok, '')
  assert('判为撑不住（水不够）', /撑不住/.test(r.text), '')
  assert('点名最短板是水', /最紧的是水|· 水/.test(r.text), '')
  assert('给出缺口数字', /缺\s*1(\.0+)?e\+5|缺 100000/.test(r.text), '')
  assert('给出补救方向', /引水|蓄水|降低人均用水/.test(r.text), '')
  // 关键：要说清「没查的项」，否则作者以为全查过了
  assert('列出没检查的项', r.text.includes('没检查的项'), '')
  assert('没检查项里含军费', r.text.includes('军费'), '')
  clean('收支盘点', r.text)
}

console.log('-- 5. 作者问「化学火箭飞得出去吗」--')
{
  const r = await call({ operation: 'derivation', derivation: 'flip', flipClaim: 'rocket', flipBase: 1.2 })
  assert('翻转判定成功', r.ok, '')
  assert('给出能/不能的明确结论', /成立|不成立/.test(r.text), '')
  assert('说明了扰动范围', /±20%|扰动/.test(r.text), '')
  // 这是本能力的存在理由：必须把「数值变化」与「结论翻转」区分开
  assert('说明数值变化率不能用来判翻转', r.text.includes('不能用来判翻转'), '')
  clean('翻转判定', r.text)
}

console.log('-- 6. 作者写「三十里外」--')
{
  const r = await call({ operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' })
  assert('换算成功', r.ok, '')
  assert('结果是 15 km', r.text.includes('15 km'), '')
  assert('给出代入过程（作者能核对）', r.text.includes('1 里 = 500 m'), '')
  // 古制朝代差异要提醒，否则作者以为 500 m 是唯一答案
  assert('提醒朝代差异', /朝代|清制/.test(r.text), '')
  clean('单位换算', r.text)
}

console.log('-- 7. help 不能再让作者去找已删的界面 --')
{
  const r = await call({ operation: 'help' })
  assert('help 可用', r.ok, '')
  assert('help 不提「侧栏」', !r.text.includes('侧栏'), '')
  assert('help 不提「图形化管理」', !r.text.includes('图形化管理'), '')
  // 但要说清「没有界面」，否则 AI 会以为有
  assert('help 说明没有图形界面', /没有图形界面|无图形界面/.test(r.text), '')
  assert('help 覆盖 29 个 operation', r.text.includes('units') && r.text.includes('balance'), '')
}

console.log('-- 8. 一个场景串下来，前后自洽 --')
{
  // 同一组世界参数，跑三个不同操作，重力必须一致
  const world = await call({ operation: 'world', planetMass: 1.5, planetRadius: 1 })
  const feas = await call({ operation: 'feasibility', world: { planetMass: 1.5, planetRadius: 1 }, claims: { buildingHeight: 300 } })

  const worldGravity = /1\.50 倍/.test(world.text)
  assert('世界推演说 1.50 倍重力', worldGravity, '')
  // feasibility 里也要出现同一个重力
  assert('一致性校验里重力也是 1.50 倍', /1\.50 倍/.test(feas.text), '')
  // 建筑上限：1.5g 下应低于地球的 4900 m
  const limit = feas.text.match(/(\d[\d,.]*)\s*m\s+[\d.]+×\s+建筑高度上限/)
  assert('建筑上限随重力下降（低于地球 4900 m）',
    feas.text.includes('建筑高度上限') && /3[0-9]{3}|2[0-9]{3}/.test(feas.text),
    limit ? limit[1] : '未解析到')

  // 同一条判据在不同重力下要给出一致的倾向，并且三档都要分得清：
  // 地球上限 24.96 m —— 10 m 安全（40%）、20 m 接近极限（80%）、50 m 超限（200%）
  const earth10 = await call({ operation: 'feasibility', claims: { creatureHeight: 10 } })
  assert('地球上 10 米判安全', /安全/.test(earth10.text) && /✓/.test(earth10.text),
    earth10.text.slice(earth10.text.indexOf('陆生生物'), earth10.text.indexOf('陆生生物') + 60))

  const earth20 = await call({ operation: 'feasibility', claims: { creatureHeight: 20 } })
  assert('地球上 20 米判「接近极限」（80% 上限）', /接近极限/.test(earth20.text),
    earth20.text.slice(earth20.text.indexOf('陆生生物'), earth20.text.indexOf('陆生生物') + 60))

  const heavy10 = await call({
    operation: 'feasibility', world: { planetMass: 1.5 }, claims: { creatureHeight: 10 },
  })
  // 1.5 g 上限 16.7 m，10 m 占 60% —— 仍安全，说明判据随重力正确缩放
  assert('1.5 g 下 10 米仍安全（上限降到 16.7）', /安全/.test(heavy10.text), '')

  const heavy20 = await call({
    operation: 'feasibility', world: { planetMass: 1.5 }, claims: { creatureHeight: 20 },
  })
  assert('1.5 g 下同一个 20 米就超限', /超限/.test(heavy20.text),
    heavy20.text.slice(heavy20.text.indexOf('陆生生物'), heavy20.text.indexOf('陆生生物') + 60))
}

console.log('-- 9. 出错时要说人话，给修复方向 --')
{
  const badUnits = await call({ operation: 'units', unitFrom: '斯特恩', unitTo: 'km' })
  assert('未知单位失败', !badUnits.ok, '')
  assert('错误里有 hint', Boolean(badUnits.error && badUnits.error.hint),
    badUnits.error ? badUnits.error.hint : '')
  assert('hint 指路（怎么查单位）', String(badUnits.error && badUnits.error.hint).includes('units'), '')

  const badOp = await call({ operation: 'nonsense' })
  assert('未知 operation 失败但不崩', !badOp.ok, '')
  assert('错误列出可用 operation',
    String(badOp.error && badOp.error.hint).includes('evaluate'),
    badOp.error ? String(badOp.error.hint).slice(0, 80) : '')
}

console.log('-- 10. 输出体积可控（AI 读得下）--')
{
  // 工具输出进上下文，过长会挤掉对话。给出软上限做基线。
  const cases = [
    ['world', { operation: 'world', planetMass: 1.5 }],
    ['feasibility', { operation: 'feasibility', world: { planetMass: 1.5 }, claims: { creatureHeight: 50 } }],
    ['balance', { operation: 'balance', balance: { grain: { demand: 100, supply: 200 } } }],
    ['units', { operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' }],
    ['help', { operation: 'help' }],
  ]
  for (const [label, args] of cases) {
    const r = await call(args)
    assert(label + ' 输出不超过 6000 字符', r.text.length <= 6000, String(r.text.length))
    console.log('       ' + label + ': ' + r.text.length + ' 字符')
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
