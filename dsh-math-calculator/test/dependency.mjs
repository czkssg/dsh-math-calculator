/**
 * dependency（依赖传导）的测试。
 *
 * ## 它补的是什么
 *
 * 用户指出两处缺口：
 *
 * ```
 *   ① 编制树只做了「算人数」，没做拓扑
 *      hierarchy 能答：这个编制满编多少人
 *      hierarchy 答不了：某个节点被摧毁，多少人失联
 *                        一道命令传到底层要几级
 *                        哪个上级辖得太宽
 *
 *   ② 拓扑模型完全不在推演里
 *      现有 derivation graph 只给常数依赖图的**坐标**（画图用）
 *      而推演真正要的是**结构与查询**：改 X 影响谁、Y 依赖什么、有没有环
 * ```
 *
 * ## 为什么合并成一个操作
 *
 * 编制树与依赖图是**同一个数学对象**（有向图），要回答的是同一批问题。
 * 差别只在边权含义（辖属倍数 / 敏感度 / 串联系数）。
 *
 * ## 本套件守四件事
 *
 *   ① 传导方向对（下游沿出边、上游沿入边）—— 第一版这里错了
 *   ② 环检测准（有环要报，无环不许误报）
 *   ③ 结构体检（孤立节点、跨度过宽）
 *   ④ 简写可用（levels+tree 自动建链）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-topo-'))
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

const tp = (o) => runMathTool({ operation: 'dependency', dependency: o })
const txt = (r) => String(r.result ?? '')

/** 五级编制：师→团→营→连→班。 */
const ARMY = { levels: ['师', '团', '营', '连', '班'], tree: [3, 3, 3, 3] }

/** 依赖网：G/M/R → g → vesc/h_max。 */
const PHYSICS = {
  nodes: ['G', 'M', 'R', 'g', 'vesc', 'h_max'],
  edges: [
    { from: 'G', to: 'g' },
    { from: 'M', to: 'g' },
    { from: 'R', to: 'g' },
    { from: 'g', to: 'vesc' },
    { from: 'g', to: 'h_max' },
  ],
}

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 编制树简写 --')
// ───────────────────────────────────────────────────────────
{
  const r = await tp(ARMY)
  assert('简写能建图', r.ok === true, txt(r).slice(0, 40))
  assert('节点 5 个', r.value?.nodes === 5, String(r.value?.nodes))
  assert('边 4 条（每级一条链）', r.value?.edges === 4, String(r.value?.edges))
  assert('边权含义标为 branching', r.value?.weightKind === 'branching', String(r.value?.weightKind))
  /** 师→团→营→连→班，最深 4 跳。 */
  assert('★ 最大层深 4 跳', r.value?.maxDepth === 4, String(r.value?.maxDepth))
  assert('根节点是「师」', JSON.stringify(r.value?.sources) === JSON.stringify(['师']),
    JSON.stringify(r.value?.sources))
  assert('叶节点是「班」', JSON.stringify(r.value?.sinks) === JSON.stringify(['班']),
    JSON.stringify(r.value?.sinks))
  assert('文本说「从顶到底要传 4 级」', /要传 4 级/.test(txt(r)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 传导方向（第一版这里错了）--')
// ───────────────────────────────────────────────────────────
{
  const r = await tp({ ...PHYSICS, node: 'g' })
  /** 下游：沿出边，g 通到 vesc 与 h_max。 */
  const down = (r.value?.downstream ?? []).map((one) => one.id).sort()
  assert('★ 下游是 vesc/h_max', JSON.stringify(down) === JSON.stringify(['h_max', 'vesc']),
    JSON.stringify(down))
  /** 上游：沿入边，g 的源头是 G/M/R。 */
  const up = (r.value?.upstream ?? []).map((one) => one.id).sort()
  assert('★ 上游是 G/M/R', JSON.stringify(up) === JSON.stringify(['G', 'M', 'R']),
    JSON.stringify(up))
  /**
   * 这条是本套件最重要的一条：第一版 `traverse` 只取 `edge.to`，
   * 传 `inn` 时永远得到空数组 —— 上游被报成「无，它是根节点」，
   * 而它明明有三个上游。
   */
  assert('★ 上游不是空（防第一版那个 bug）', up.length > 0, JSON.stringify(up))
  assert('文本说它是根节点之外的中间量', !/它是根节点/.test(txt(r)), '')

  /** 根节点查上游应为空。 */
  const root = await tp({ ...PHYSICS, node: 'G' })
  assert('根节点上游为空', (root.value?.upstream ?? []).length === 0, '')
  assert('根节点说明「它是自变量」', /它是根节点/.test(txt(root)), '')

  /** 叶节点查下游应为空。 */
  const leaf = await tp({ ...PHYSICS, node: 'vesc' })
  assert('叶节点下游为空', (leaf.value?.downstream ?? []).length === 0, '')
  assert('叶节点说明「它是结论量」', /它是叶节点/.test(txt(leaf)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 环检测 --')
// ───────────────────────────────────────────────────────────
{
  /** 无环的图不许误报。 */
  const acyclic = await tp(PHYSICS)
  assert('★ 无环不误报', (acyclic.value?.cycles ?? []).length === 0,
    JSON.stringify(acyclic.value?.cycles))
  assert('文本说「无环」', /无环/.test(txt(acyclic)), '')

  /** 三节点环 A→B→C→A。 */
  const cyclic = await tp({
    nodes: ['A', 'B', 'C'],
    edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }],
  })
  assert('★ 检出环', (cyclic.value?.cycles ?? []).length > 0, '')
  assert('环里有 A B C', /A → B → C → A/.test(txt(cyclic)), txt(cyclic).split('\n').find((l) => /→/.test(l)) ?? '')
  assert('说明环意味着定义循环', /定义循环/.test(txt(cyclic)), '')

  /** 两节点环。 */
  const two = await tp({
    nodes: ['X', 'Y'],
    edges: [{ from: 'X', to: 'Y' }, { from: 'Y', to: 'X' }],
  })
  assert('两节点环也检出', (two.value?.cycles ?? []).length > 0, '')

  /** 自环。 */
  const self = await tp({ nodes: ['S'], edges: [{ from: 'S', to: 'S' }] })
  assert('自环检出', (self.value?.cycles ?? []).length > 0, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 结构体检 --')
// ───────────────────────────────────────────────────────────
{
  /** 孤立节点。 */
  const isolated = await tp({
    nodes: ['A', 'B', 'orphan'],
    edges: [{ from: 'A', to: 'B' }],
  })
  assert('★ 孤立节点被报出', (isolated.value?.findings ?? []).some((f) => /孤立节点/.test(f)),
    JSON.stringify(isolated.value?.findings))

  /** 跨度过宽：一个节点辖 9 个下游（超 7±2）。 */
  const wide = await tp({
    nodes: ['boss', ...Array.from({ length: 9 }, (_, i) => 'sub' + i)],
    edges: Array.from({ length: 9 }, (_, i) => ({ from: 'boss', to: 'sub' + i })),
  })
  assert('★ 跨度过宽被报出', (wide.value?.findings ?? []).some((f) => /跨度上限/.test(f)),
    JSON.stringify(wide.value?.findings))

  /** 正常跨度不报。 */
  const ok = await tp(ARMY)
  assert('正常编制不报跨度问题', (ok.value?.findings ?? []).length === 0,
    JSON.stringify(ok.value?.findings))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 编制树的连通性（hierarchy 答不了的）--')
// ───────────────────────────────────────────────────────────
{
  const r = await tp({ ...ARMY, node: '营' })
  const down = (r.value?.downstream ?? []).map((one) => one.id)
  assert('营之下的下游是连/班', JSON.stringify([...down].sort()) === JSON.stringify(['班', '连']),
    JSON.stringify(down))
  const up = (r.value?.upstream ?? []).map((one) => one.id).sort()
  assert('营之上是师/团', JSON.stringify(up) === JSON.stringify(['团', '师']), JSON.stringify(up))
  /** 跳数要对：师 1 跳、团 1 跳、连 2 跳、班 3 跳。 */
  const byId = new Map((r.value?.upstream ?? []).map((one) => [one.id, one.hops]))
  assert('上游跳数对（团 1 跳）', byId.get('团') === 1, String(byId.get('团')))
  const downHops = new Map((r.value?.downstream ?? []).map((one) => [one.id, one.hops]))
  assert('下游跳数对（连 1 跳、班 2 跳）',
    downHops.get('连') === 1 && downHops.get('班') === 2,
    JSON.stringify([...downHops]))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 错误处理 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'dependency' })
  assert('不给参数报错', none.ok === false, String(none.ok))
  assert('报错给示例', /nodes|levels/.test(none.error?.hint ?? ''), '')

  /** 边引用不存在的节点。 */
  const dangling = await tp({
    nodes: ['A'],
    edges: [{ from: 'A', to: 'NOT_EXIST' }],
  })
  assert('★ 悬空边报错', dangling.ok === false, String(dangling.ok))
  assert('报错点名是哪条边', /A → NOT_EXIST/.test(dangling.error?.hint ?? ''),
    dangling.error?.hint?.slice(0, 60))

  /** 查不存在的节点。 */
  const noNode = await tp({ ...PHYSICS, node: 'NO_SUCH' })
  assert('查不存在节点报错', noNode.ok === false, String(noNode.ok))
  assert('报错列出可用节点', /现有节点/.test(noNode.error?.hint ?? ''), '')

  /** 缺 from/to。 */
  const badEdge = await tp({ nodes: ['A', 'B'], edges: [{ from: 'A' }] })
  assert('边缺 to 报错', badEdge.ok === false, String(badEdge.ok))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await tp({ ...ARMY, node: '营' })
  for (const key of ['nodes', 'edges', 'weightKind', 'cycles', 'sources', 'sinks', 'maxDepth', 'depth', 'findings']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('depth 记录了每个节点的层深', typeof r.value?.depth === 'object' && r.value.depth['班'] === 4,
    JSON.stringify(r.value?.depth))
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 与 derivation graph 的分工 --')
// ───────────────────────────────────────────────────────────
{
  /**
   * `derivation graph` 给的是**坐标**（画图用），本操作给的是**查询**（不含坐标）。
   * 两者不该混：本操作的 value 里不该出现 x/y。
   */
  const r = await tp(PHYSICS)
  const json = JSON.stringify(r.value)
  assert('本操作不返回坐标（那是 graph 子命令的事）', !/"x":/.test(json) && !/"y":/.test(json), '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
