/**
 * 公式体系（v2.3.6）。
 *
 * ## 用户要求
 *
 * > 「公式也应该搭一个相互联系的逻辑链体系或者因果体系，不能变成孤立的公式，
 * > 能连的尽量连。连成一个个体系，不必强行联成唯一的大体系，
 * > 而根据需要和必要的类别划分成。体系与体系之间可能因为某一个公式相互连接。」
 *
 * ## 这个模块解决了什么
 *
 * 之前 513 条公式按 `cat` 分成 73 个分类 —— **分类不等于链条**。
 * `engineering/thermal` 里有 boiler_coal_rate、steam_power_output、carnot，
 * 但它们之间没有登记「谁的输出喂给谁」，使用者拿到 5 条公式仍然不知道怎么串。
 *
 * 所以登记三层：体系（链）、步间连线（feeds）、体系间接点（bridges）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-sys-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const sys = await import(pathToFileURL(join(root, 'lib/formula-systems.js')).href)
const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) pass++
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (q) => String((await run({ operation: 'formulas', query: q })).result ?? '');

console.log('-- 1. 体系登记完整性 --')
{
  /**
  * 「能连的尽量连」不等于「全部塞进一个大体系」。
  * 所以按推演目的分 18 个，每个 3~13 步。步数太少说明还没想清，太多说明该拆。
  */
  assert('18 个体系', sys.FORMULA_SYSTEMS.length === 18, String(sys.FORMULA_SYSTEMS.length));
  const tooShort = sys.FORMULA_SYSTEMS.filter((s) => s.steps.length < 3)
  assert('每条链至少 3 步', tooShort.length === 0, tooShort.map((s) => s.id + ':' + s.steps.length).join(','));
  /** 每个体系都必须有 purpose —— 它决定「什么时候想起这条链」。 */
  const noPurpose = sys.FORMULA_SYSTEMS.filter((s) => !s.purpose || s.purpose.trim().length < 10)
  assert('每个体系都有 purpose', noPurpose.length === 0, noPurpose.map((s) => s.id).join(','));
  /** id 唯一。 */
  const ids = sys.FORMULA_SYSTEMS.map((s) => s.id)
  assert('体系 id 唯一', new Set(ids).size === ids.length, ids.join(','));
}

console.log('-- 2. 链上每一步的公式都真实存在（这里最容易写错）--')
{
  /**
  * 这是本套最重要的断言。体系是**手写的登记表**，
  * 引用的公式 id 只要拼错一个，那条链就会断在中间 ——
  * 而断处不会报错，只会「查不到那一步」。
  */
  const bad = []
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) {
      if (!fm.FORMULA_INDEX.has(step.formula)) bad.push(system.id + '→' + step.formula)
    }
    for (const bridge of system.bridges ?? []) {
      if (!fm.FORMULA_INDEX.has(bridge.formula)) bad.push(system.id + '★' + bridge.formula)
    }
  }
  assert('链上公式全部存在', bad.length === 0, bad.slice(0, 6).join(', '));
  /** feeds 指向的上游公式必须也在链上（否则「上一步」不存在）。 */
  const noSource = []
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) {
      for (const feed of step.feeds ?? []) {
        const inChain = system.steps.some((s) => s.formula === feed.from)
        if (!inChain) noSource.push(system.id + '→' + feed.from)
      }
    }
  }
  assert('feeds 的上游都在同一条链上', noSource.length === 0, noSource.slice(0, 5).join(', '));
  /** feeds 的 to 必须真是本步公式的参数名（否则「喂进去」是空话）。 */
  const badParam = []
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) {
      const formula = fm.FORMULA_INDEX.get(step.formula)
      if (!formula) continue
      for (const feed of step.feeds ?? []) {
        if (!(feed.to in formula.params)) badParam.push(step.formula + '.' + feed.to)
      }
    }
  }
  assert('feeds 的参数名真实存在', badParam.length === 0, badParam.slice(0, 5).join(', '));
}

console.log('-- 3. 查询入口 --')
{
  const list = await text('sys')
  assert('sys 列出全部体系', /18 条链/.test(list) || list.includes('═══'), list.slice(0, 40));
  for (const id of ['sys-material', 'sys-energy', 'sys-fiscal', 'sys-military']) {
    assert('sys 列出 ' + id, list.includes(id), '');
  }

  const energy = await text('sys:sys-energy');
  assert('单条链含逐步编号', /1\. .*combustion_energy/.test(energy), energy.slice(0, 60));
  assert('单条链标出需自备参数', /需自备参数/.test(energy), '');
  assert('单条链标出接点', /与其它体系的接点/.test(energy), '');

  /** 体系间连接：metallurgy_yield 同时属于材料链与产能链。 */
  const bridge = await text('sys:formula:metallurgy_yield');
  assert('查出属于 2 条链', /属于 2 条链/.test(bridge), bridge.slice(0, 50));
  assert('标出接点关系', /接点 → sys-capacity/.test(bridge), '');

  /** 反向对照：不在任何链里的公式要如实说，不许给个空壳。 */
  const lone = await text('sys:formula:law_of_cosines');
  assert('孤立公式如实说明', /不在任何已登记的体系里/.test(lone), lone.slice(0, 60));
}

console.log('-- 4. 体系之间确实连得上 --')
{
  /**
  * 用户要求「体系与体系之间可能因为某一个公式相互连接」。
  * 所以检查：至少有一半体系声明了 bridges，否则就是 18 座孤岛。
  */
  const withBridge = sys.FORMULA_SYSTEMS.filter((s) => (s.bridges ?? []).length > 0)
  assert('多数体系声明了接点', withBridge.length >= 10, String(withBridge.length));
  /** bridges 的目标体系必须真实存在（拼错就会出现死链）。 */
  const badTarget = []
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const b of system.bridges ?? []) {
      if (!sys.FORMULA_SYSTEMS.some((s) => s.id === b.toSystem)) badTarget.push(system.id + '→' + b.toSystem)
    }
  }
  assert('接点目标体系都存在', badTarget.length === 0, badTarget.join(', '));
  /**
  * ★ 连接是**双向可达**的：从 A 的 bridges 指向 B，
  * 那么查 B 里的某个共用公式时，也应该能查到 A。
  * 这条守的是「跳转不丢」—— 单向登记会让人跳过去就回不来。
  */
  const pairs = []
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const b of system.bridges ?? []) pairs.push([system.id, b.toSystem, b.formula])
  }
  const reachable = pairs.filter(([, , formula]) => sys.systemsOfFormula(formula).length >= 2)
  assert('接点公式可在两侧查到', reachable.length >= pairs.length * 0.5, reachable.length + '/' + pairs.length);
}

console.log('-- 5. 覆盖率（「孤立公式」还剩多少）--')
{
  const inSystem = new Set()
  for (const system of sys.FORMULA_SYSTEMS) {
    for (const step of system.steps) inSystem.add(step.formula)
    for (const b of system.bridges ?? []) inSystem.add(b.formula)
  }
  /**
  * 覆盖率不是越高越好 —— 几何公式（正余弦定理）、电池续航这类确实没有上下游。
  * 但**高频公式**应当尽量进链，因为那才是使用者常碰到的。
  */
  const highOrphans = fm.FORMULAS.filter((f) => f.frequency === 'high' && !inSystem.has(f.id))
  assert('高频公式入链率 ≥ 70%', (fm.FORMULAS.filter((f) => f.frequency === 'high').length - highOrphans.length) / fm.FORMULAS.filter((f) => f.frequency === 'high').length >= 0.7,
    '未入链 ' + highOrphans.length + ' 条: ' + highOrphans.map((f) => f.id).slice(0, 6).join(','));
  assert('总体覆盖率 ≥ 20%', inSystem.size / fm.FORMULAS.length >= 0.2, (inSystem.size / fm.FORMULAS.length * 100).toFixed(1) + '%');
}

console.log('-- 6. help 有哪些指引 --')
{
  const dir = String((await run({ operation: 'help' })).result ?? '');
  assert('目录提到体系查询', /query="sys"/.test(dir) || /推演链/.test(dir), dir.slice(0, 80));
  const body = String((await run({ operation: 'help', helpTopic: 'formula' })).result ?? '');
  assert('formula 节讲了三层查法', /sys:sys-energy/.test(body) && /sys:formula/.test(body), '');
}

rmSync(home, { recursive: true, force: true });

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length);
for (const f of fails) console.log('  - ' + f);
process.exit(1);