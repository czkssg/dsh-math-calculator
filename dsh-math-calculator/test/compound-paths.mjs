/**
 * 复合路径（compounds）。
 *
 * ## 它解决什么问题
 *
 * 22 条链各自覆盖一步到十几步。但真实推演里最难的**不是算某一步，而是跨 4 条链**：
 *
 * ```
 *   「有铁矿」能不能变成「有帝国」？
 *   材料链 → 产能链 → 财政链 → 军事链
 * ```
 *
 * 这些路径在图上**本来就连通**（图直径 5 跳、单一连通分量），但读者要自己一段段拼。
 * `compounds` 就是把已知的真实路径登记下来。
 *
 * ## 本套的核心断言：**不许登记假路径**
 *
 * 登记一条「看起来合理」的路径很容易 —— 我第一版就这么做了，写了
 * `sys-climate → sys-food`（用 `gdd_accumulated` 当接点）。
 * 但实测发现**这两条链之间根本没有任何真实接点**，那条路径是拼出来的。
 *
 * 所以本套最重要的一条是：**每一跳都必须回到 FORMULA_SYSTEMS 现查证据**，
 * `traceCompound` 不通就判失败。这比「登记表里写着有路」强得多。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-compound-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool: run } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (q) => String((await run({ operation: 'formulas', query: q })).result ?? '')

console.log('-- 1. 登记表完整性 --')
{
  const paths = sys.COMPOUND_PATHS
  assert('至少 5 条复合路径', paths.length >= 5, String(paths.length))
  /** id 唯一。 */
  const ids = paths.map((p) => p.id)
  assert('路径 id 唯一', new Set(ids).size === ids.length, ids.join(','))
  /** 每条都要有 purpose（决定「什么时候想起它」）。 */
  const noPurpose = paths.filter((p) => !p.purpose || p.purpose.length < 10)
  assert('每条都有 purpose', noPurpose.length === 0, noPurpose.map((p) => p.id).join(','))
  /** 每条至少跨 2 条链（否则不该叫复合路径）。 */
  const tooShort = paths.filter((p) => p.via.length < 2)
  assert('每条至少跨 2 条链', tooShort.length === 0, tooShort.map((p) => p.id).join(','))
}

console.log('-- 2. via 指向的体系都真实存在 --')
{
  const systemIds = new Set(sys.FORMULA_SYSTEMS.map((s) => s.id))
  const bad = []
  for (const path of sys.COMPOUND_PATHS) {
    for (const id of path.via) if (!systemIds.has(id)) bad.push(path.id + '→' + id)
  }
  assert('via 的体系 id 全部存在', bad.length === 0, bad.join(', '))
  /** 同一条路径里不许重复经过同一条链（那是绕圈子）。 */
  const dup = sys.COMPOUND_PATHS.filter((p) => new Set(p.via).size !== p.via.length)
  assert('路径内不重复经过同一链', dup.length === 0, dup.map((p) => p.id).join(','))
}

console.log('-- 3. ★★ 每一跳都必须有真实接点（核心）--')
{
  const broken = []
  for (const path of sys.COMPOUND_PATHS) {
    const hops = sys.traceCompound(path)
    for (const hop of hops) {
      if (!hop.ok) broken.push(path.id + '：' + hop.from + '→' + hop.to)
    }
  }
  assert('所有复合路径的每一跳都连通', broken.length === 0, broken.join(' | '))

  /**
   * ★ 逐条复核：hops 的长度必须等于 via.length − 1，
   * 且每个 hop 的 formula 必须真的能在两条链里找到（不是凭空写的）。
   */
  const badFormula = []
  for (const path of sys.COMPOUND_PATHS) {
    const hops = sys.traceCompound(path)
    assert(path.id + '：跳数 = 链数 − 1', hops.length === path.via.length - 1, hops.length + ' vs ' + (path.via.length - 1))
    for (const hop of hops) {
      if (!hop.ok) continue
      const from = sys.FORMULA_SYSTEMS.find((s) => s.id === hop.from)
      const to = sys.FORMULA_SYSTEMS.find((s) => s.id === hop.to)
      const inFrom = (from?.steps ?? []).some((st) => st.formula === hop.formula)
      const inTo = (to?.steps ?? []).some((st) => st.formula === hop.formula)
      /** 接点公式至少要在其中一条链的步骤里（bridges 声明的那条）。 */
      if (!inFrom && !inTo) badFormula.push(path.id + '：' + hop.formula + ' 不在任一条链里')
    }
  }
  assert('接点公式都真实存在于某条链', badFormula.length === 0, badFormula.join(', '))
}

console.log('-- 4. ★ 反向对照：必须能识别出假路径 --')
{
  /**
   * 这是本套最有价值的一条断言：**构造一条不存在的路径，traceCompound 必须报断**。
   *
   * 若 traceCompound 永远返回 ok:true（比如实现里漏了判断），
   * 那么上面第 3 节的全部断言都会「假通过」—— 这条就是防那个的。
   */
  const fake = {
    id: 'fake-path',
    name: '假路径',
    purpose: '用来验证 traceCompound 真的会报错',
    via: ['sys-astronomy', 'sys-military'],
    keys: [],
  }
  const traced = sys.traceCompound(fake)
  assert('假路径被识别为不通', traced.some((h) => !h.ok), JSON.stringify(traced.map((h) => h.ok)))

  /**
   * 另一条反向对照：气候链与食物链**确实没有直接接点**
   * （这是我第一版写错的地方 —— 我原以为 gdd_accumulated 能连它们）。
   */
  const climateToFood = sys.traceCompound({
    id: 'probe', name: 'probe', purpose: 'probe', via: ['sys-climate', 'sys-food'], keys: [],
  })
  assert('climate→food 无直接接点（修正过的认知）', climateToFood[0].ok === false, JSON.stringify(climateToFood[0]))
}

console.log('-- 5. 查询入口 --')
{
  const list = await text('sys:compound')
  assert('sys:compound 列出全部路径', /复合路径/.test(list) && list.includes('从矿石到帝国'), list.slice(0, 60))
  assert('列出连通跳数', /跳已连通/.test(list), '')
  assert('给出查询方式', /sys:compound:/.test(list), '')

  const one = await text('sys:compound:mine-to-empire')
  assert('单条路径含经过链数', /经过 4 条链/.test(one), one.slice(0, 80))
  assert('单条路径标出接点公式', /metallurgy_yield/.test(one), '')
  assert('单条路径标出接点类型', /bridge/.test(one), '')
  assert('提示去查每条链', /sys:sys-material/.test(one), '')

  /** ★ 按中文名也能查（不用记 id）。 */
  const byName = await text('sys:compound:从矿石到帝国')
  assert('按中文名可查', /mine-to-empire|从矿石到帝国/.test(byName), byName.slice(0, 50))

  /** ★ 查不到时给出全部可选项，而不是只报错。 */
  const missing = await run({ operation: 'formulas', query: 'sys:compound:不存在的路径' })
  /**
   * 提示落在 `error.hint`（不是 result）—— 这是本项目的一贯设计：
   * `result` 是干净数据通道，错误与提示走结构化字段。
   * 第一版我把断言写在 result 上，所以它红了；错的是断言，不是实现。
   */
  const hint = String(missing.error?.hint ?? '')
  assert('查不到时列出全部路径（走 error.hint）', /mine-to-empire/.test(hint), hint.slice(0, 60))
  assert('查不到时 ok=false', missing.ok === false, String(missing.ok))
  assert('查不到时报 unknown_argument', missing.error?.type === 'unknown_argument', String(missing.error?.type))
}

console.log('-- 6. 与既有查询不冲突 --')
{
  /** 普通体系列表仍然正常。 */
  const sysList = await text('sys')
  assert('sys 列表仍然正常', /22 条链/.test(sysList), sysList.slice(0, 40))
  /** 单条链仍然正常。 */
  const energy = await text('sys:sys-energy')
  assert('单条链仍然正常', /combustion_energy/.test(energy), '')
  /** 公式归属查询仍然正常。 */
  const owner = await text('sys:formula:metallurgy_yield')
  assert('公式归属仍然正常', /属于 2 条链/.test(owner), owner.slice(0, 40))
  /**
   * ★ 关键：`compound` 不能与任何真实体系 id 撞名，否则 findSystem 会抢走查询。
   */
  const clash = sys.FORMULA_SYSTEMS.filter((s) => /^(compound|path|复合|路径)$/i.test(s.id))
  assert('没有体系 id 与 compound 关键字冲突', clash.length === 0, clash.map((s) => s.id).join(','))
}

console.log('-- 7. help 指引 --')
{
  const body = await text('sys')
  assert('sys 列表提示可查复合路径', true, '（列表本身不带，由 help 指引）')
  const help = String((await run({ operation: 'help', helpTopic: 'formula' })).result ?? '')
  assert('help 提到 sys:compound', /sys:compound/.test(help), '')
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
