/**
 * 自设单位扩充口测试。
 *
 * ## 用户需求
 *
 * > 给单位体系一个自设扩充口。
 *
 * 场景：写架空世界时会发明自己的单位：
 *
 * ```
 *   「1 维尔 = 1.2 km」     本世界长度单位
 *   「1 石炭 = 8970 MJ」    本世界能量单位
 * ```
 *
 * ## 设计原则（来自 UCUM 扩展讨论）
 *
 * 参考 [Extending UCUM?](https://www.healthintersections.com.au/2025/01/14/extending-ucum.html)：
 *
 * ```
 *   ① 命名空间隔离        自设单位加前缀，不污染标准
 *   ② 不得定义真实单位    撞名/同值要拒绝或警告
 *   ③ 能参与标准运算      `1 维尔 + 300 m` 能算
 *   ④ 可识别非标准        输出带 `@` 标记
 * ```
 *
 * ## ★ 本套件最重要的一条：显示名不能污染标准单位
 *
 * 实测抓到的真 bug：
 * ```
 *   display:"m"  →  注册名 uM（不撞）
 *                 →  但显示名是 "m"
 *                 →  归一阶段 `1 m` 被替换成 `1 uM`
 *                 →  **标准单位 m 被静默顶掉**
 * ```
 *
 * 后果：`1 m to cm` 得到自设单位的换算值，且不报任何错。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-cu-'))
process.env.DSH_MATH_CALC_HOME = home

const { buildEngine, rebuildEngine } = await import(pathToFileURL(join(root, 'lib/core/engine.js')).href)
const { opUnitCustom } = await import(pathToFileURL(join(root, 'lib/features/numeric/unit-custom-op.js')).href)
const custom = await import(pathToFileURL(join(root, 'lib/core/units-custom.js')).href)
const storeMod = await import(pathToFileURL(join(root, 'lib/core/units-custom-store.js')).href)

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

const store = { home }
let engine = buildEngine()
/**
 * 执行一次 `unit_custom` 操作。
 *
 * ## 为什么 add/remove 之后要重建引擎
 *
 * 引擎是单例（mathjs 实例创建昂贵）。而 `normalizeCustomUnits` 是
 * **闭包**，捕获了构建时的 `customUnits`。所以：
 *
 * ```
 *   add 一个单位 → mathjs 里注册了
 *                → 但闭包里那份 customUnits 还是旧的
 *                → 于是 `1 新单位` 归一不到注册名 → 语法错
 * ```
 *
 * 生产代码里由分发层在拿到 `needsRebuild` 后重建；
 * 测试里直接在这里重建，等价。
 */
const go = (args) => {
  try {
    const out = opUnitCustom(engine, args, store)
    if (out.needsRebuild === true) engine = rebuildEngine()
    return { ok: true, ...out }
  } catch (error) {
    return { ok: false, message: error.message, type: error.type }
  }
}
const num = (expr) => Number(String(engine.evaluate(expr)).split(' ')[0])

// ───────────────────────────────────────────────────────────
console.log('-- 1. 注册名清洗（必须是纯字母数字）--')
// ───────────────────────────────────────────────────────────
{
  assert('中文名 → 哈希兜底', /^uX[0-9a-z]+$/.test(custom.toRegistryName('维尔')), custom.toRegistryName('维尔'))
  assert('同一个中文名稳定', custom.toRegistryName('维尔') === custom.toRegistryName('维尔'), '')
  assert('英文名保留可读性', custom.toRegistryName('weiEr') === 'uWeiEr', custom.toRegistryName('weiEr'))
  assert('不同中文名不同哈希', custom.toRegistryName('维尔') !== custom.toRegistryName('石炭'), '')
  /** mathjs 只接受字母数字。 */
  assert('结果不含下划线', !custom.toRegistryName('a_b').includes('_'), custom.toRegistryName('a_b'))
  assert('结果不含中文', !/[\u4e00-\u9fa5]/.test(custom.toRegistryName('维尔')), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 显示名不能污染标准单位 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 这是本批最重要的守卫。若放行 `display:"m"`，
   * 归一阶段会把所有 `1 m` 换成自设单位。
   */
  const m = go({ action2: 'add', unit: { display: 'm', dimension: 'length', factor: 5 } })
  assert('★ 拒绝 display:"m"', m.ok === false, m.ok ? '被放行了' : '')
  assert('拒绝理由说清后果', /顶掉|同名/.test(m.message ?? ''), '')

  const psi = go({ action2: 'add', unit: { display: 'psi', dimension: 'pressure', factor: 1 } })
  assert('★ 拒绝 display:"psi"', psi.ok === false, psi.ok ? '被放行了' : '')

  /** 标准单位仍然正常。 */
  assert('标准 m 未受影响', Math.abs(num('1 m to cm') - 100) < 1e-9, String(num('1 m to cm')))
  assert('标准 psi 未受影响', Math.abs(num('1 psi to kPa') - 6.8948) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 合法注册 --')
// ───────────────────────────────────────────────────────────
{
  const added = go({ action2: 'add', unit: { display: '维尔', dimension: 'length', factor: 1200, note: '本世界长度单位' } })
  assert('中文名能注册', added.ok === true, added.message ?? '')
  assert('返回注册名', typeof added.value?.registered?.name === 'string', '')
  /** 立刻能换算。 */
  assert('★ 1 维尔 = 1200 m', Math.abs(num('1 维尔 to m') - 1200) < 1e-9, String(num('1 维尔 to m')))
  assert('5 维尔 = 6 km', Math.abs(num('5 维尔 to km') - 6) < 1e-9, '')
  /** 能与标准单位混算。 */
  assert('★ 维尔 + 米 能混算', Math.abs(num('1 维尔 + 300 m to m') - 1500) < 1e-9,
    String(num('1 维尔 + 300 m to m')))
  /** 也能转到中文单位。 */
  assert('3 维尔 = 7.2 里', Math.abs(num('3 维尔 to 里') - 7.2) < 1e-9, String(num('3 维尔 to 里')))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 多个自设单位共存 --')
// ───────────────────────────────────────────────────────────
{
  go({ action2: 'add', unit: { display: '石炭', dimension: 'energy', factor: 8970e3, note: '能量单位' } })
  assert('石炭注册成功', Math.abs(num('1 石炭 to MJ') - 8.97) < 0.01, String(num('1 石炭 to MJ')))
  assert('维尔仍在', Math.abs(num('1 维尔 to m') - 1200) < 1e-9, '')
  const listed = go({ action2: 'list' })
  assert('list 列出 2 个', listed.value?.count === 2, String(listed.value?.count))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 持久化：重启后仍可用 --')
// ───────────────────────────────────────────────────────────
{
  /** 文件已落盘。 */
  assert('文件已生成', existsSync(join(home, 'custom-units.json')), '')
  const raw = JSON.parse(readFileSync(join(home, 'custom-units.json'), 'utf8'))
  assert('文件结构正确', raw.version === 1 && Array.isArray(raw.units), JSON.stringify(Object.keys(raw)))
  assert('存了 2 条', raw.units.length === 2, String(raw.units.length))

  /**
   * 重建引擎（模拟重启）—— 这是「落盘」真正要解决的问题。
   */
  engine = rebuildEngine()
  assert('★ 重启后加载 2 条', engine.customUnits.length === 2, String(engine.customUnits.length))
  assert('重启后无加载错误', engine.customUnitsError === '', engine.customUnitsError)
  assert('★ 重启后 1 维尔 仍 = 1200m', Math.abs(num('1 维尔 to m') - 1200) < 1e-9,
    String(num('1 维尔 to m')))
  assert('重启后 石炭 仍可用', Math.abs(num('1 石炭 to MJ') - 8.97) < 0.01, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. check 是干跑（不写盘）--')
// ───────────────────────────────────────────────────────────
{
  const before = JSON.parse(readFileSync(join(home, 'custom-units.json'), 'utf8')).units.length
  const checked = go({ action2: 'check', unit: { display: '工分', dimension: 'time', factor: 14400 } })
  assert('check 成功', checked.ok === true, checked.message ?? '')
  assert('check 返回 dryRun 标记', checked.value?.dryRun === true, '')
  assert('check 返回将要用的注册名', typeof checked.value?.wouldRegister === 'string', '')
  /** 关键：文件没变。 */
  const after = JSON.parse(readFileSync(join(home, 'custom-units.json'), 'utf8')).units.length
  assert('★ check 没写盘', after === before, `${before} → ${after}`)
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. remove --')
// ───────────────────────────────────────────────────────────
{
  const removed = go({ action2: 'remove', unitName: '石炭' })
  assert('remove 成功', removed.ok === true, removed.message ?? '')
  assert('返回剩余 1 个', removed.value?.count === 1, String(removed.value?.count))
  /** 文件里也删了。 */
  const raw = JSON.parse(readFileSync(join(home, 'custom-units.json'), 'utf8'))
  assert('文件里只剩 1 条', raw.units.length === 1, String(raw.units.length))

  /** 删不存在的要报错。 */
  const missing = go({ action2: 'remove', unitName: '不存在' })
  assert('删不存在报错', missing.ok === false, '')
  /** 不指定名字也要报错。 */
  const noName = go({ action2: 'remove' })
  assert('缺 unitName 报错', noName.ok === false, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 校验拒绝条件 --')
// ───────────────────────────────────────────────────────────
{
  /** 量纲认不出。 */
  const badDim = go({ action2: 'add', unit: { display: '甲', dimension: '长度', factor: 1 } })
  assert('★ 拒绝中文量纲名', badDim.ok === false, '')
  assert('给出可用量纲', /length|mass/.test(badDim.message ?? ''), '')

  /** 负因子。 */
  const neg = go({ action2: 'add', unit: { display: '乙', dimension: 'length', factor: -5 } })
  assert('拒绝负因子', neg.ok === false, '')
  /** 零因子。 */
  const zero = go({ action2: 'add', unit: { display: '丙', dimension: 'length', factor: 0 } })
  assert('拒绝零因子', zero.ok === false, '')
  /** 缺字段。 */
  const noFactor = go({ action2: 'add', unit: { display: '丁', dimension: 'length' } })
  assert('缺 factor 报错', noFactor.ok === false, '')
  const noDisplay = go({ action2: 'add', unit: { dimension: 'length', factor: 1 } })
  assert('缺 display 报错', noDisplay.ok === false, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 损坏文件不当空表（防静默丢数据）--')
// ───────────────────────────────────────────────────────────
{
  const brokenHome = mkdtempSync(join(tmpdir(), 'dsh-cu-broken-'))
  writeFileSync(join(brokenHome, 'custom-units.json'), '{ 这不是合法 JSON', 'utf8')
  let threw = false
  try {
    storeMod.loadCustomUnits({ home: brokenHome })
  } catch {
    threw = true
  }
  assert('★ 损坏文件要报错而不是返回空表', threw, '返回了空表 = 会静默丢数据')

  /** 结构不对也要报错。 */
  const wrongHome = mkdtempSync(join(tmpdir(), 'dsh-cu-wrong-'))
  writeFileSync(join(wrongHome, 'custom-units.json'), '{"foo":1}', 'utf8')
  let threw2 = false
  try {
    storeMod.loadCustomUnits({ home: wrongHome })
  } catch {
    threw2 = true
  }
  assert('结构不对也报错', threw2, '')
  rmSync(brokenHome, { recursive: true, force: true })
  rmSync(wrongHome, { recursive: true, force: true })
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. 不破坏既有单位体系 --')
// ───────────────────────────────────────────────────────────
{
  assert('汉尺 = 23.1cm', Math.abs(num('1 汉尺 to cm') - 23.1) < 0.1, '')
  assert('市尺 = 33.33cm', Math.abs(num('1 市尺 to cm') - 33.333) < 0.01, '')
  assert('1 吨 = 1000kg', Math.abs(num('1 吨 to kg') - 1000) < 1e-9, '')
  assert('1 里 = 500m', Math.abs(num('1 里 to m') - 500) < 1e-9, '')
  assert('1 gallon = 4.546L（国际标准）', Math.abs(num('1 gallon to L') - 4.54609) < 0.001, '')
  assert('1 psi = 6.895kPa', Math.abs(num('1 psi to kPa') - 6.8948) < 0.01, '')
  assert('90 km/h to cm/s = 2500', Math.abs(num('90 km/h to cm/s') - 2500) < 1e-6, '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
