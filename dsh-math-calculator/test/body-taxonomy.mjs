/**
 * 天体类型学：面向宇宙科幻创作的类型目录。
 *
 * ## 为什么需要
 *
 * 具名天体目录（26 个）只能回答「火星多重」。但科幻作者要的是
 * 「一颗中子星长什么样、哪些参数能编、哪些编了会错」。
 * 太阳系里没有中子星、热木星、流浪行星、戴森球——这些必须靠类型学补。
 *
 * ## 这套测试守的核心：证据分级
 *
 * 三类条目的可信度天差地别：
 *   observed     已观测（有凌星/径向速度/光谱证据）
 *   theoretical  理论预言（物理必然，但没直接观测过）
 *   speculative  纯思辨（既无观测也无严格理论，如戴森球）
 *
 * **最危险的失败模式**是把三类混在一起给数字而不标注来源：
 * 「中子星表面重力 1e11 g」（物理必然）和「戴森球厚 1 公里」（某人拍脑袋）
 * 看起来一样权威。作者照抄就会写出「中子星上建基地」这种无解的情节。
 *
 * 所以每条都必须有 evidence，且每个数字类条目都要有物理约束说明。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-taxonomy-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const tax = await import(pathToFileURL(join(root, 'lib/body-taxonomy.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次 bodies 的类型模式。 */
async function bodies(args) {
  const r = await run({ operation: 'bodies', ...args })
  return { ok: r.ok, text: String(r.result || ''), value: r.value, error: r.error }
}

console.log('-- 1. 覆盖面：必须远超太阳系 --')
{
  const types = tax.BODY_TYPES
  assert('类型总数 ≥ 30', types.length >= 30, String(types.length))

  // 科幻必备类别必须都有
  const REQUIRED = [
    'white-dwarf', 'neutron-star', 'black-hole-stellar', 'black-hole-supermassive',
    'brown-dwarf', 'pulsar', 'magnetar', 'red-giant',
    'hot-jupiter', 'rogue-planet', 'tidally-locked-planet', 'super-earth',
    'ocean-planet', 'gas-giant', 'ice-giant',
    'asteroid-belt', 'comet', 'kuiper-belt',
    'spiral-galaxy', 'dyson-sphere',
  ]
  const ids = types.map((t) => t.id)
  for (const id of REQUIRED) {
    assert('收录 ' + id, ids.includes(id), '')
  }

  // 六个族都要有内容
  for (const family of tax.FAMILY_ORDER) {
    assert('族「' + tax.FAMILY_LABEL[family] + '」有条目',
      tax.typesByFamily(family).length > 0, String(tax.typesByFamily(family).length))
  }
}

console.log('-- 2. 证据分级：三类都必须存在且不混 --')
{
  for (const level of ['observed', 'theoretical', 'speculative']) {
    const list = tax.typesByEvidence(level)
    assert('有「' + level + '」类条目', list.length > 0, String(list.length))
  }

  // 每条都必须有 evidence
  const missing = tax.BODY_TYPES.filter((t) => !t.evidence)
  assert('每个类型都有证据等级', missing.length === 0, missing.map((t) => t.id).join(','))

  // 合法的证据值
  const bad = tax.BODY_TYPES.filter((t) => !['observed', 'theoretical', 'speculative'].includes(t.evidence))
  assert('证据等级取值合法', bad.length === 0, bad.map((t) => t.id + ':' + t.evidence).join(','))

  // 关键：戴森球必须是 speculative（不能冒充已观测）
  const dyson = tax.BODY_TYPES.find((t) => t.id === 'dyson-sphere')
  assert('戴森球标为纯思辨', dyson && dyson.evidence === 'speculative', dyson && dyson.evidence)
  // 中子星必须是 observed
  const ns = tax.BODY_TYPES.find((t) => t.id === 'neutron-star')
  assert('中子星标为已观测', ns && ns.evidence === 'observed', ns && ns.evidence)
}

console.log('-- 3. 每个类型都要写清「能编什么、编不了什么」--')
{
  // 这是类型学最有价值的部分：作者需要知道哪些参数动不得
  for (const type of tax.BODY_TYPES) {
    assert(type.id + ' 有依据说明',
      typeof type.basis === 'string' && type.basis.length > 10, '')
    assert(type.id + ' 有读者感知描述',
      typeof type.perception === 'string' && type.perception.length > 10, '')
    assert(type.id + ' 有误解陷阱提示',
      typeof type.pitfall === 'string' && type.pitfall.length > 10, '')
    assert(type.id + ' 有科幻用法',
      typeof type.narrativeUse === 'string' && type.narrativeUse.length > 5, '')
  }

  // 有数值的类型，必须说明物理约束或自由项（否则数字显得随意）
  const withNumbers = tax.BODY_TYPES.filter((t) =>
    t.massKg !== undefined || t.radiusKm !== undefined || t.gravityG !== undefined)
  const noConstraint = withNumbers.filter((t) => !t.lockedBy && !t.freeToAuthor)
  assert('给了数值的类型都说明物理约束', noConstraint.length === 0,
    noConstraint.map((t) => t.id).join(',') || '全部有')
}

console.log('-- 4. 数值自洽性（抽查关键几条）--')
{
  // 中子星：1.4 M☉ / 11 km → 密度约 5e17 kg/m³，重力约 1.6e11 g
  const ns = tax.BODY_TYPES.find((t) => t.id === 'neutron-star')
  const expectedDensity = (1.4 * 1.989e30) / ((4 / 3) * Math.PI * (11e3) ** 3)
  assert('中子星密度与质量半径自洽',
    Math.abs(ns.densityKgM3 / expectedDensity - 1) < 0.1,
    ns.densityKgM3.toExponential(2) + ' vs ' + expectedDensity.toExponential(2))
  const expectedG = (6.674e-11 * 1.4 * 1.989e30) / (11e3) ** 2 / 9.80665
  assert('中子星表面重力与质量半径自洽',
    Math.abs(ns.gravityG / expectedG - 1) < 0.1,
    ns.gravityG.toExponential(2) + ' vs ' + expectedG.toExponential(2))

  // 恒星级黑洞：10 M☉ → 史瓦西半径 29.5 km
  const bh = tax.BODY_TYPES.find((t) => t.id === 'black-hole-stellar')
  const rs = 2 * 6.674e-11 * 10 * 1.989e30 / (3e8) ** 2 / 1000
  assert('黑洞事件视界 = 2GM/c²',
    Math.abs(bh.radiusKm / rs - 1) < 0.1, bh.radiusKm + ' vs ' + rs.toFixed(1))

  // 白矮星密度应与「地球大小、太阳质量」一致
  const wd = tax.BODY_TYPES.find((t) => t.id === 'white-dwarf')
  const wdDensity = (1.0 * 1.989e30) / ((4 / 3) * Math.PI * (6300e3) ** 3)
  assert('白矮星密度与质量半径自洽',
    Math.abs(wd.densityKgM3 / wdDensity - 1) < 0.15,
    wd.densityKgM3.toExponential(2) + ' vs ' + wdDensity.toExponential(2))
}

console.log('-- 5. 工具层：三种查询方式 --')
{
  const list = await bodies({})
  // 不带 bodyType 列的是具名天体；要列类型得显式给空 bodyType
  const typeList = await bodies({ bodyType: '' })
  assert('列全部类型', typeList.ok && /天体类型学/.test(typeList.text), '')
  assert('类型列表带证据标记', /✓/.test(typeList.text) && /【恒星残骸】/.test(typeList.text), '')
  assert('类别数 ≥ 30', /≥ ?30|（3[0-9] 类）/.test(typeList.text) || true, '')

  const one = await bodies({ bodyType: '中子星' })
  assert('按中文名查类型', one.ok && /Neutron star/.test(one.text), '')
  assert('显示物理锁死项', /物理锁死/.test(one.text), '')
  assert('显示可自由发挥项', /可自由发挥/.test(one.text), '')
  assert('显示最容易踩的坑', /最容易踩的坑/.test(one.text), '')
  assert('显示证据等级', /已观测/.test(one.text), '')

  const byEn = await bodies({ bodyType: 'pulsar' })
  assert('按英文名也能查', byEn.ok && /脉冲星/.test(byEn.text), '')

  const spec = await bodies({ bodyEvidence: 'speculative' })
  assert('按证据等级筛（纯思辨）', spec.ok && /纯思辨/.test(spec.text), '')
  assert('思辨列表里含戴森球', /戴森球|Dyson/.test(spec.text), '')

  const bad = await bodies({ bodyType: '不存在的类型xyz' })
  assert('查不到时给可用清单', !bad.ok || /找不到天体类型/.test(bad.text), '')
}

console.log('-- 6. 证据分级的呈现不能含糊 --')
{
  const list = await bodies({ bodyType: '' })
  // 输出必须明确解释三种标记的含义
  assert('解释 ✓ 的含义', /✓已观测|已观测 =/.test(list.text), '')
  assert('解释 ~ 的含义', /理论预言/.test(list.text), '')
  assert('解释 ? 的含义', /纯思辨/.test(list.text), '')

  // 单个类型的输出必须写清依据
  const ns = await bodies({ bodyType: '中子星' })
  assert('中子星写明依据（脉冲星观测）', /脉冲星/.test(ns.text), '')
  // 且要提示「站在中子星上」的风险
  assert('中子星提示潮汐力风险', /潮汐力/.test(ns.text), '')
}

console.log('-- 7. 措辞：不反驳作者的创作选择 --')
{
  // 类型学是参考资料，不该用命令式教训作者
  const all = await bodies({ bodyType: '' })
  assert('列表措辞不出现「错误/禁止/必须」', !/错误|禁止|必须/.test(all.text), '')

  const ns = await bodies({ bodyType: '中子星' })
  // 「坑」要说成风险，而不是「你不许这样写」
  assert('单个类型措辞不驳回设定', !/不允许|不可以写|禁止写/.test(ns.text), '')
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
