/**
 * 公式库的结构不变量。
 *
 * ## 为什么需要这一套
 *
 * 重构时发现：**4 个公式 id 在不同文件里各定义了一次**，
 * 而 `FORMULA_INDEX.set` 是「后者覆盖前者」——
 *
 * ```
 *   formula-library.ts   spring_energy  （弹簧势能）  ← 被覆盖，静默消失
 *   formula-library-basic.ts spring_energy （弹簧储能）  ← 实际生效的是这条
 * ```
 *
 * **没有任何报错**。症状是：按名字查「弹簧势能」查不到，
 * 而 `FORMULAS.length` 比预期少 4 条 —— 但少 4 条没人会注意到。
 *
 * 这类缺陷的价值在于：它不破坏任何测试，只是**让一部分内容凭空消失**。
 *
 * ## 本套守住的不变量
 *
 * 1. id 全局唯一（同 id 出现两次 = 有一条永远调不到）
 * 2. FORMULA_INDEX 与 FORMULAS 条数一致（漏索引 = 单条能调、pipeline 报不存在）
 * 3. 每条公式都有必需字段（id/name/expr/params/unit/desc）
 * 4. 表达式不重复（同表达式 = 同一物理量存两份，检索时用户分不清该用哪条）
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-formula-integrity-'))
process.env.DSH_MATH_CALC_HOME = home

const fm = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push(name); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. ★ id 全局唯一 --')
{
  /**
   * ★★ 最重要的一条。重构前有 4 个 id 各出现两次，
   * 后者覆盖前者，前者**永远不会被加载**，且不报错。
   */
  const counts = new Map()
  for (const f of fm.FORMULAS) counts.set(f.id, (counts.get(f.id) ?? 0) + 1)
  const dup = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n)
  assert('没有重复 id', dup.length === 0, dup.join(', ') || '全部唯一')
}

console.log('-- 2. INDEX 与数组一致 --')
{
  /**
   * 历史缺陷（见 CHANGELOG）：`EM_OPTICAL_NUCLEAR_FORMULAS` 曾漏掉 FORMULA_INDEX 注册，
   * 表现是「单条 formula 能调、写进 pipeline 报 unknown_formula」。
   *
   * 这种「同一份数据两个入口不一致」的缺陷最难查，因为两条路径各自看起来都正常。
   */
  assert(
    'FORMULA_INDEX 条数 == FORMULAS 条数',
    fm.FORMULA_INDEX.size === fm.FORMULAS.length,
    fm.FORMULA_INDEX.size + ' vs ' + fm.FORMULAS.length,
  )
  /** 每条数组里的公式都能从索引里取到。 */
  const missing = fm.FORMULAS.filter((f) => !fm.FORMULA_INDEX.has(f.id))
  assert('数组里的每条都在索引里', missing.length === 0, missing.map((f) => f.id).join(', '))
  /** 索引里没有数组之外的残留。 */
  assert(
    '索引里没有多余项',
    fm.FORMULA_INDEX.size === new Set(fm.FORMULAS.map((f) => f.id)).size,
    String(fm.FORMULA_INDEX.size),
  )
}

console.log('-- 3. 必需字段完整 --')
{
  const bad = []
  for (const f of fm.FORMULAS) {
    if (!f.id || typeof f.id !== 'string') bad.push('(无 id)')
    else if (!f.name) bad.push(f.id + ':无 name')
    else if (!f.expr) bad.push(f.id + ':无 expr')
    else if (!f.params || Object.keys(f.params).length === 0) bad.push(f.id + ':无 params')
    else if (!f.desc) bad.push(f.id + ':无 desc')
  }
  assert('id/name/expr/params/desc 全部齐备', bad.length === 0, bad.slice(0, 8).join('; '))

  /**
   * `unit` 单独处理。
   *
   * 原因：65/665 条没有 `unit`，但性质分两类 ——
   *
   * ```
   *   合理：reynolds、lorentz_factor、gini、r0_basic…（本来就是无量纲）
   *   遗漏：circle_area、sphere_volume…（应有 m² / m³）
   * ```
   *
   * 第一类不该强求；第二类是真缺陷，但属于**内容修订**而非结构问题，
   * 不该由本套测试（结构不变量）来卡。改为记录数量并设上限，
   * 一旦继续增长说明新条目在漏字段。
   */
  const noUnit = fm.FORMULAS.filter((f) => !f.unit).length
  assert('无 unit 的条目不超过已知 65', noUnit <= 65, String(noUnit))
}

console.log('-- 4. 表达式不重复（同表达式 = 同一物理量存两份）--')
{
  /**
   * ★ 这一条比想象中重要。
   *
   * 重构前实测有 **27 组**表达式相同的公式，例如：
   *
   * ```
   *   kinetic_energy    0.5*m*v^2      与  projectile_energy  0.5*m*v^2
   *   carnot_efficiency 1-Tc/Th        与  thermal_efficiency_carnot  1-Tc/Th
   *   reynolds          rho*v*D/mu     与  reynolds_number    rho*v*D/mu
   * ```
   *
   * 后果不是算错，而是**检索时返回两条、用户不知道该用哪条**，
   * 且维护时要改两处。
   *
   * ⚠ 但这条不能一律禁止：有些「同名不同义」确实需要两条
   *   （如 `angular_momentum` 的 I·ω 与 `luminous_flux` 的 I·Ω，
   *    变量名相同但物理意义完全不同，是公式库的安全隐患而非重复）。
   *
   * 所以这里只断言**上限**：重复表达式不得超过已知的 27 组，
   * 且新增时必须是有意的。想加新的就得改这个数字 —— 强制人工过一眼。
   */
  const byExpr = new Map()
  for (const f of fm.FORMULAS) {
    const key = String(f.expr).replace(/\s+/g, '')
    if (!byExpr.has(key)) byExpr.set(key, [])
    byExpr.get(key).push(f.id)
  }
  const dupExpr = [...byExpr.entries()].filter(([, ids]) => ids.length > 1)
  /**
   * 已知的 27 组全部是「同一物理量的不同命名习惯」（动能/弹丸动能、雷诺数两种写法…）。
   * 数字定在这里是为了**一旦增加就红**，逼人确认新加的是否真的必要。
   */
  assert('重复表达式组数不超过已知 27', dupExpr.length <= 27, String(dupExpr.length))
  /** 每一组内部 id 必须不同（同 id 已在第 1 节拦住，这里做交叉确认）。 */
  const sameId = dupExpr.filter(([, ids]) => new Set(ids).size !== ids.length)
  assert('重复表达式组内 id 各不相同', sameId.length === 0, sameId.map(([, ids]) => ids.join('/')).join('; '))
}

console.log('-- 5. 分类命名规范 --')
{
  /**
   * `cat` 形如 `physics/em`。顶层分类必须是小写单词，子分类同样。
   * 不规范会导致分组统计与检索失灵。
   */
  const bad = fm.FORMULAS.filter((f) => !/^[a-z]+\/[a-z_]+$/.test(String(f.cat)))
  assert('cat 全部形如 word/word', bad.length === 0, bad.slice(0, 6).map((f) => f.id + ':' + f.cat).join(', '))
}

rmSync(home, { recursive: true, force: true })

if (fails.length === 0) { console.log(''); console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log(''); console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f)
process.exit(1)
