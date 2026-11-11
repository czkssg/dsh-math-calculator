/**
 * quick_feasible（一句话可行性）的测试。
 *
 * ## 为什么需要它
 *
 * 反馈包 `15` 号的动作 5：
 * > 用户常凭「感觉太离谱」否决（末日、南极两个项目各有一次），
 * > 插件该给「有依据的一句话判断」。
 *
 * 现实是：作者说「这不行吧」，AI 只能说「确实有点勉强」—— 两边都没依据。
 *
 * ## 关键设计约束：它不许自己算新物理
 *
 * 这个操作**只做三件事**：
 * ```
 *   ① 从 claim 认维度（词面匹配，不做语义理解）
 *   ② 交给已有能力判（feasibility 上限 / civilization 天花板）
 *   ③ 压成一句人话 + 阻因
 * ```
 *
 * 认不出就**明说判不了** —— 编一个「大概勉强」比说「我不知道」有害得多。
 *
 * ## 本套件守三件事
 *
 *   ① **该判的必须判**（尺寸/能量两个维度有可比数时不许含糊）
 *   ② **判不了要说判不了**（人口这种无硬上限的，不许编一个上限）
 *   ③ **判定依据要能核对**（给出上限值、声称值、余量倍数）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-qf-'))
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

const run = (claim, world) =>
  runMathTool({ operation: 'quick_feasible', quickFeasible: { claim }, ...(world ? { world } : {}) })
const txt = (r) => String(r.result ?? '')

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 尺寸：超限的必须判不可行 --')
// ───────────────────────────────────────────────────────────
{
  /** 地球重力下建筑高度上限约 4903 m，8000 m 明确超限。 */
  const tall = await run('这座塔能有 8000 米高')
  assert('8000 米塔判不可行', tall.value?.verdict === 'infeasible', String(tall.value?.verdict))
  assert('给出上限值', /4\d{3}/.test(txt(tall)), txt(tall).split('\n').find((l) => /上限/.test(l)) ?? '')
  assert('给出声称值', /8000/.test(txt(tall)), '')
  assert('一句话说明卡在哪', /不行/.test(tall.value?.oneLine ?? ''), String(tall.value?.oneLine))

  /** 生物上限更严：约 25 m，50 m 明确超限。 */
  const beast = await run('50 米高的巨兽存在吗')
  assert('50 米巨兽判不可行', beast.value?.verdict === 'infeasible', String(beast.value?.verdict))
  assert('生物上限比建筑上限低', /2[0-9]\.\d+/.test(txt(beast)), '')

  /** 在上限内的必须判可行。 */
  const okTower = await run('这座塔只有 1000 米高')
  assert('1000 米塔判可行', okTower.value?.verdict === 'feasible', String(okTower.value?.verdict))
  assert('给出余量倍数', /余量/.test(txt(okTower)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 能量：有可比数就必须判 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * 第一版这里只输出「天花板是 1.7e17 W」而不比，
   * 于是明明有两个可比的数却报了「判不了」。这是本套件最重要的一条。
   */
  const small = await run('这个文明需要 5e13 瓦的功率')
  assert('5e13 W 判可行', small.value?.verdict === 'feasible', String(small.value?.verdict))
  assert('给出余量倍数', /余量/.test(txt(small)), txt(small).split('\n').find((l) => /能量/.test(l)) ?? '')

  /** 超过行星天花板：1e18 W > 1.7e17 W。 */
  const huge = await run('这个文明需要 1e18 瓦的功率')
  assert('1e18 W 判不可行', huge.value?.verdict === 'infeasible', String(huge.value?.verdict))

  /** 中文量级也要认。 */
  const cn = await run('需要 50 亿瓦的功率')
  assert('50 亿瓦能算出（5e9）', /5\.000e\+9|5000000000/.test(txt(cn)), txt(cn).split('\n').find((l) => /能量/.test(l)) ?? '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 判不了要说判不了（不许编上限）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 人口没有物理硬上限 —— 真正的约束是粮食/水/面积。
   * 工具**不许**编一个「人口上限」出来。
   */
  const pop = await run('这个城能养 920 亿人')
  assert('人口判不了', pop.value?.verdict === 'unknown', String(pop.value?.verdict))
  assert('明说人口无硬上限', /没有物理硬上限/.test(txt(pop)), '')
  assert('指向真正的约束', /粮食|水|面积/.test(txt(pop)), '')
  assert('★ 不编造人口上限数字', !/人口上限/.test(txt(pop)), '')

  /** 完全认不出维度的话。 */
  const nonsense = await run('这件事看起来很离谱吧')
  assert('认不出维度时判不了', nonsense.value?.verdict === 'unknown', String(nonsense.value?.verdict))
  assert('列出能判的维度', /能判的维度/.test(txt(nonsense)), '')
  assert('明说不做语义理解', /不做语义理解|词面匹配/.test(txt(nonsense)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 文案不许重复或自相矛盾 --')
// ───────────────────────────────────────────────────────────
{
  const tower = await run('这座塔能有 8000 米高')
  /** 第一版输出「建筑高度上限上限」——多了个"上限"。 */
  assert('不出现「上限上限」', !/上限上限/.test(txt(tower)), '')

  /** 认出维度时不该再列「能判的维度」清单。 */
  const pop = await run('这个城能养 920 亿人')
  assert('认出维度时不列全量清单', !/能判的维度/.test(txt(pop)), '')
  assert('而是说「认出了但要给数值」', /认出了这些维度/.test(txt(pop)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 判定与结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run('这座塔能有 8000 米高')
  for (const key of ['claim', 'verdict', 'verdictLabel', 'oneLine', 'dimensions', 'checks', 'blockers']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('verdictLabel 是中文', /不可行|可行|勉强|判不了/.test(r.value?.verdictLabel ?? ''),
    String(r.value?.verdictLabel))
  assert('blockers 列出阻因', Array.isArray(r.value?.blockers) && r.value.blockers.length > 0, '')
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')

  /** 四种 verdict 都要能出现。 */
  const verdicts = new Set()
  for (const claim of ['这座塔能有 8000 米高', '这座塔只有 100 米高', '这件事离谱', '这个城能养 920 亿人']) {
    verdicts.add((await run(claim)).value?.verdict)
  }
  assert('至少覆盖三种 verdict', verdicts.size >= 3, [...verdicts].join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 错误处理与边界 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'quick_feasible' })
  assert('不给 claim 报错', none.ok === false, String(none.ok))
  assert('报错给示例', /claim/.test(none.error?.hint ?? ''), '')

  const empty = await runMathTool({ operation: 'quick_feasible', quickFeasible: { claim: '   ' } })
  assert('空白 claim 报错', empty.ok === false, String(empty.ok))

  /** 带世界参数时上限要跟着变（2 倍重力下生物更矮）。 */
  const earth = await run('50 米高的巨兽存在吗', {})
  const heavy = await run('50 米高的巨兽存在吗', { planetMass: 2 })
  const earthCap = Number(txt(earth).match(/最大高度\s*([\d.]+)/)?.[1] ?? 0)
  const heavyCap = Number(txt(heavy).match(/最大高度\s*([\d.]+)/)?.[1] ?? 0)
  assert('2 倍重力下生物上限更低', heavyCap > 0 && heavyCap < earthCap,
    `地球 ${earthCap} vs 2倍 ${heavyCap}`)
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
