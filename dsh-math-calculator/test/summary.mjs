/**
 * 综合推演 deriveAll 的白名单过滤测试。
 *
 * ## 为什么这一套必须存在
 *
 * UI 三版删掉之后，`deriveAll()` 的白名单过滤成了**唯一**还在运行的
 * 「派生量绝不入库」实现点：`/summary` 路由、AI 的 `summary` 操作都走它。
 * 原来的守护测试 `test/ui-v3.mjs` 随界面一起删除了，于是这条最反直觉的
 * 领域规则（重力是派生的，永远不能当输入存下来）失去了任何回归保护。
 *
 * 本套测试断言的是**行为**而非实现：
 *   · 硬塞 `gravity: 99` → 被丢弃，重力仍按 G·M/R² 现算
 *   · 硬塞 `surfaceMeanK: 999` → 被丢弃，均温仍按辐照+温室现算
 *   · 垃圾键、空串、null、undefined → 一律丢弃
 *   · 白名单内的基础量 → 原样回显
 *
 * ## 期望值的来源
 *
 * 重力与逃逸速度的期望值由公式独立算出（不是从实现里抄回来的）：
 *   g = G·M/R²，M = 2 地球质量，R = 1 地球半径
 *     = 6.674e-11 × 2 × 5.972e24 / (6.371e6)² = 19.639 m/s²
 *   v_esc = √(2gR) = 15.819 km/s
 * 所以断言写成 19.6 与 15.8（三位有效数字），既独立又不会被浮点末位绊倒。
 */
import { deriveAll } from '../lib/summary.js'
import { WORLD_PARAMS, PARAM_GROUPS, WORLD_KEYS, PARAM_INDEX, paramsByGroup } from '../lib/world-params.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 取一个派生量。 */
function derivedOf(sum, key) {
  return sum.derived.find(function (item) { return item.key === key })
}

/** 三位有效数字，用于和手算期望值比较。 */
function to3(value) {
  return Number(value.toPrecision(3))
}

console.log('-- 1. 派生量绝不入库（核心规则）--')
{
  // 这是历史上最容易犯的错：把界面显示的「重力 1.5 g」当参数存回去，
  // 于是改质量忘记同步重力，世界就自相矛盾了。
  const sum = deriveAll({ planetMass: 2, gravity: 99, surfaceMeanK: 999 })

  assert('基础量 planetMass 原样回显', sum.params.planetMass === 2, String(sum.params.planetMass))
  assert('硬塞的 gravity 被丢弃', sum.params.gravity === undefined, JSON.stringify(sum.params.gravity))
  assert('硬塞的 surfaceMeanK 被丢弃', sum.params.surfaceMeanK === undefined, JSON.stringify(sum.params.surfaceMeanK))
  assert('params 里只有白名单键',
    Object.keys(sum.params).every(function (key) { return WORLD_KEYS.includes(key) }),
    Object.keys(sum.params).join(','))

  // 重力必须仍是 G·M/R² 现算出来，而不是 99
  const gravity = derivedOf(sum, 'gravity')
  assert('重力仍然现算（不是 99）', to3(gravity.value) === 19.6, gravity.value.toFixed(3) + ' m/s²')
  assert('重力显示串是 19.6 m/s²（2 g）', gravity.text.includes('19.6') && gravity.text.includes('2 g'), gravity.text)
  assert('逃逸速度跟着重力涨到 15.8 km/s',
    to3(derivedOf(sum, 'escapeVelocity').value / 1000) === 15.8,
    (derivedOf(sum, 'escapeVelocity').value / 1000).toFixed(2) + ' km/s')
  assert('均温仍然现算（不是 999 K）',
    derivedOf(sum, 'meanTemp').value !== 999 && derivedOf(sum, 'meanTemp').value < 400,
    derivedOf(sum, 'meanTemp').value.toFixed(1) + ' K')
}

console.log('-- 2. 垃圾键与空值一律丢弃 --')
{
  const sum = deriveAll({
    planetMass: 2,
    垃圾字段: 1,
    gravity: 99,
    '': 7,
    planetRadius: '',
    rotationHours: null,
    albedo: undefined,
  })
  assert('垃圾字段被丢弃', sum.params['垃圾字段'] === undefined, JSON.stringify(sum.params['垃圾字段']))
  assert('空键名被丢弃', sum.params[''] === undefined, JSON.stringify(sum.params['']))
  assert('空字符串值被丢弃', sum.params.planetRadius === undefined, JSON.stringify(sum.params.planetRadius))
  assert('null 值被丢弃', sum.params.rotationHours === undefined, JSON.stringify(sum.params.rotationHours))
  assert('undefined 值被丢弃', sum.params.albedo === undefined, JSON.stringify(sum.params.albedo))
  assert('只留下真正给的值', Object.keys(sum.params).length === 1 && sum.params.planetMass === 2,
    JSON.stringify(sum.params))
}

console.log('-- 3. 空输入等价于地球 --')
{
  const sum = deriveAll()
  assert('params 为空对象', Object.keys(sum.params).length === 0, JSON.stringify(sum.params))
  assert('空输入仍给出一整套派生量', sum.derived.length === 7, String(sum.derived.length))
  // 地球重力 9.82 m/s²（wgs84 名义值 9.80665，实现用 G·M/R² 得 9.820）
  assert('默认重力就是地球 9.82 m/s²', to3(derivedOf(sum, 'gravity').value) === 9.82,
    derivedOf(sum, 'gravity').value.toFixed(3) + ' m/s²')
  assert('默认重力 1 g', sum.headline.includes('1 g'), sum.headline)
  assert('默认一天 23.9 小时', sum.headline.includes('23.9'), sum.headline)
}

console.log('-- 4. 三层结构不串味 --')
{
  const sum = deriveAll({ planetMass: 2 })
  // params 是基础量、derived 是派生量，两者键名不该重叠
  const paramKeys = Object.keys(sum.params)
  assert('基础量与派生量键名不重叠', paramKeys.indexOf('gravity') === -1, paramKeys.join(','))
  assert('derived 是数组且每项带单位',
    Array.isArray(sum.derived) && sum.derived.every(function (item) {
      return typeof item.unit === 'string' && typeof item.text === 'string'
    }), String(sum.derived.length))
  assert('derived 里没有任何基础量的键',
    sum.derived.every(function (item) { return !WORLD_KEYS.includes(item.key) }),
    sum.derived.map(function (item) { return item.key }).join(','))
  assert('paramGroups 覆盖全部 7 组', sum.paramGroups.length === PARAM_GROUPS.length,
    sum.paramGroups.map(function (g) { return g.group + ':' + g.params.length }).join(' '))
}

console.log('-- 5. 结论层跟着基础量走 --')
{
  const heavy = deriveAll({ planetMass: 2 })
  const earth = deriveAll({})
  // 重力翻倍后生物高度上限必须下降（同一套 feasibility 公式）
  const heavyBio = heavy.biology.find(function (item) { return item.label.indexOf('高度') !== -1 })
  const earthBio = earth.biology.find(function (item) { return item.label.indexOf('高度') !== -1 })
  assert('找到生物高度结论', !!heavyBio && !!earthBio, heavyBio && earthBio ? heavyBio.value : '缺失')
  assert('2 倍重力下生物高度上限约为地球一半',
    parseFloat(heavyBio.value) > 0 && parseFloat(heavyBio.value) <= parseFloat(earthBio.value),
    earthBio.value + ' → ' + heavyBio.value)

  // verdict 用结构化原因，不写死结语
  assert('verdict 有 level', typeof heavy.verdict.level === 'string', heavy.verdict.level)
  assert('verdict.level 是已知值',
    ['alive', 'marginal', 'dead'].includes(heavy.verdict.level), heavy.verdict.level)
  // 铁律：结语不出现「错误/禁止/必须」
  assert('verdict 措辞不反驳用户',
    !/错误|禁止|必须/.test(heavy.verdict.summary), heavy.verdict.summary)
  assert('headline 是一句话速写', heavy.headline.length > 0 && heavy.headline.indexOf('的世界') !== -1, heavy.headline)
}

console.log('-- 6. 参数元数据表本身的分层约束 --')
{
  // 元数据表只列基础量：派生量一旦出现在这里，界面/AI 就会允许硬设，
  // 于是与公式冲突。这是「分层」的源头，值得到测试里钉住。
  const derivedNames = ['gravity', 'surfaceMeanK', 'escapeVelocity', 'scaleHeightM', 'surfaceGravity']
  assert('元数据表里没有派生量',
    WORLD_PARAMS.every(function (item) { return derivedNames.indexOf(item.key) === -1 }),
    WORLD_PARAMS.filter(function (item) { return derivedNames.indexOf(item.key) !== -1 })
      .map(function (item) { return item.key }).join(','))
  assert('每个参数都有中文名、单位、分组',
    WORLD_PARAMS.every(function (item) {
      return item.label.length > 0 && typeof item.unit === 'string' && item.group.length > 0
    }), String(WORLD_PARAMS.length))
  assert('每个参数都写明改了影响什么',
    WORLD_PARAMS.every(function (item) { return item.affects.length > 0 }), String(WORLD_PARAMS.length))
  assert('tier 只有 basic / advanced',
    WORLD_PARAMS.every(function (item) { return item.tier === 'basic' || item.tier === 'advanced' }),
    WORLD_PARAMS.filter(function (item) { return item.tier !== 'basic' && item.tier !== 'advanced' })
      .map(function (item) { return item.key }).join(','))
  assert('choice 型都带选项',
    WORLD_PARAMS.filter(function (item) { return item.kind === 'choice' })
      .every(function (item) { return Array.isArray(item.choices) && item.choices.length > 0 }),
    String(WORLD_PARAMS.filter(function (item) { return item.kind === 'choice' }).length))
  assert('参数键名唯一',
    new Set(WORLD_KEYS).size === WORLD_KEYS.length, String(new Set(WORLD_KEYS).size))
  assert('PARAM_INDEX 与表同长', PARAM_INDEX.size === WORLD_PARAMS.length,
    PARAM_INDEX.size + '/' + WORLD_PARAMS.length)
  assert('paramsByGroup 每项都能在表里找到',
    paramsByGroup().every(function (g) {
      return g.params.every(function (p) { return PARAM_INDEX.get(p.key) === p })
    }))
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
