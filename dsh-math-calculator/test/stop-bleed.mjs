/**
 * 止血三项的回归测试（E1 / A2 / A7+A19）。
 *
 * 这四项都是「返回 ok=true 但结果错」——最危险的一类。
 * 每条断言都守两个方向：**该拒绝的被拒绝**，且**合法输入不被误伤**。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-stopbleed-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
let fail = 0
const failed = []
function assert(name, condition, detail) {
  if (condition) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fail += 1
    failed.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const run = (args) => runMathTool(args)
const txt = (r) => String(r.result ?? '')

// ═══════════════════════════════════════════════════════════
console.log('-- 1. E1 参数分片：跨 operation 传参必须报错 --')
// ═══════════════════════════════════════════════════════════
{
  /** 每一条都是「参数名合法、但不属于这个 operation」。 */
  const misplaced = [
    ['world', { operation: 'world', unitFrom: '里' }, 'units'],
    ['world', { operation: 'world', formula: 'kleiber' }, 'formula'],
    ['units', { operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km', planetMass: 2 }, 'world'],
    ['evaluate', { operation: 'evaluate', expression: '1+1', diffA: 'x' }, 'derivation'],
    ['stats', { operation: 'stats', data: [1, 2, 3], recurrence: 'P*2' }, 'recurrence'],
    ['solve', { operation: 'solve', expression: 'x=1', initial: { P: 1 } }, 'ode'],
  ]
  for (const [label, args, owner] of misplaced) {
    const r = await run(args)
    assert(
      `${label} 收 ${owner} 的参数被拒`,
      r.ok === false && /不属于/.test(txt(r)),
      r.ok ? 'ok=true（静默接受）' : txt(r).slice(0, 60),
    )
  }

  /** 报错必须点出「这个参数属于谁」——否则调用方不知道该改去哪儿。 */
  const r = await run({ operation: 'world', unitFrom: '里' })
  assert('报错点名归属 operation', /属于 units/.test(txt(r)), txt(r).slice(0, 80))
  assert('报错给了修法 hint', typeof r.error?.hint === 'string' && r.error.hint.length > 10, '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 2. E1 反向：合法调用不许被误伤 --')
// ═══════════════════════════════════════════════════════════
{
  const legit = [
    ['world 无参', { operation: 'world' }],
    ['world 嵌套', { operation: 'world', world: { planetMass: 2 } }],
    ['world 顶层简写', { operation: 'world', starMass: 10 }],
    ['world + terrain', { operation: 'world', planetMass: 2, terrain: { kind: 'coastal' } }],
    ['units 正常', { operation: 'units', unitValue: 1, unitFrom: '里', unitTo: 'km' }],
    ['units 列清单', { operation: 'units' }],
    ['evaluate 批量', { operation: 'evaluate', expressions: [{ expr: '1+1' }], terse: true }],
    ['formula 正常', { operation: 'formula', formula: 'velocity_uniform', overrides: { s: 10, t: 2 } }],
    ['ode 正常', { operation: 'ode', expression: 'dP/dt=P', initial: { P: 1 }, from: 0, to: 2, at: [1] }],
    ['recurrence 正常', { operation: 'recurrence', recurrence: 'P*2', initial: { P: 1 }, periods: 5 }],
    ['stats 正常', { operation: 'stats', data: [1, 2, 3, 4, 5] }],
    ['dist 正常', { operation: 'dist', distribution: 'normal', params: [0, 1], x: 0 }],
    ['balance 正常', { operation: 'balance', balance: { grain: { demand: 100, supply: 120 } } }],
    ['feasibility 正常', { operation: 'feasibility' }],
    ['help 正常', { operation: 'help' }],
    ['help 分节', { operation: 'help', helpTopic: 'world' }],
    ['derivation 正常', {
      operation: 'derivation', derivation: 'backSolve', anchor: 'creatureHeight', anchorValue: 50,
    }],
  ]
  for (const [label, args] of legit) {
    const r = await run(args)
    assert(`${label} 不被误拦`, r.ok === true, txt(r).slice(0, 70))
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 3. A2 units 复合单位必须算对 --')
// ═══════════════════════════════════════════════════════════
{
  /** [标签, 参数, 期望值, 容差] —— 容差用于「本来就不是整数」的换算。 */
  const cases = [
    ['1000 kg/m^3 → g/cm^3', { unitValue: 1000, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }, 1, 0.01],
    ['1 kg/m^3 → g/cm^3', { unitValue: 1, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }, 0.001, 1e-6],
    ['1 m^2/s → cm^2/s', { unitValue: 1, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }, 10000, 1],
    ['7 m^2/s → cm^2/s', { unitValue: 7, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }, 70000, 1],
    ['5 W/m^2 → kW/m^2', { unitValue: 5, unitFrom: 'W/m^2', unitTo: 'kW/m^2' }, 0.005, 1e-6],
    ['3 mol/L → mol/m^3', { unitValue: 3, unitFrom: 'mol/L', unitTo: 'mol/m^3' }, 3000, 1],
    ['100 km/h → m/s', { unitValue: 100, unitFrom: 'km/h', unitTo: 'm/s' }, 27.7778, 0.01],
  ]
  for (const [label, args, expect, tol] of cases) {
    const r = await run({ operation: 'units', ...args })
    const got = Number(txt(r).match(/=\s*([\d.eE+-]+)/)?.[1])
    assert(
      `units ${label}`,
      r.ok === true && Math.abs(got - expect) <= tol,
      r.ok ? '得到 ' + got + '，期望 ' + expect : txt(r).slice(0, 60),
    )
  }

  /**
   * 核心不变式：`units` 与 `evaluate` 两条路径必须给同一个答案。
   * 修复前 units 给 1000、evaluate 给 1 —— 同一工具差 1000 倍。
   */
  const pairs = [
    ['1000 kg/m^3 to g/cm^3', { unitValue: 1000, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }],
    ['1 m^2/s to cm^2/s', { unitValue: 1, unitFrom: 'm^2/s', unitTo: 'cm^2/s' }],
  ]
  for (const [expr, args] of pairs) {
    const a = Number(txt(await run({ operation: 'units', ...args })).match(/=\s*([\d.eE+-]+)/)?.[1])
    const bTxt = txt(await run({ operation: 'evaluate', expression: expr }))
    const b = Number(bTxt.match(/^\s*([\d.eE+-]+)/)?.[1] ?? bTxt.match(/([\d.eE+-]+)\s/)?.[1])
    assert(`路径一致：${expr}`, Math.abs(a - b) / Math.abs(b || 1) < 0.01, `units=${a} evaluate=${b}`)
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 4. A2 反向：别名单位不能被当成复合单位 --')
// ═══════════════════════════════════════════════════════════
{
  const aliases = [
    ['公顷 → m²', { unitValue: 1, unitFrom: '公顷', unitTo: 'm²' }, 10000],
    ['平方米 → m²', { unitValue: 1, unitFrom: '平方米', unitTo: 'm²' }, 1],
    ['里 → km', { unitValue: 1, unitFrom: '里', unitTo: 'km' }, 0.5],
    ['亩 → m²', { unitValue: 1, unitFrom: '亩', unitTo: 'm²' }, 666.67],
  ]
  for (const [label, args, expect] of aliases) {
    const r = await run({ operation: 'units', ...args })
    const got = Number(txt(r).match(/=\s*([\d.eE+-]+)/)?.[1])
    assert(
      `units ${label}（别名不走 mathjs）`,
      r.ok === true && Math.abs(got - expect) / expect < 0.01,
      r.ok ? '得到 ' + got : txt(r).slice(0, 60),
    )
  }
  /** 球面度是单字母代号，不能被正则误判成复合。 */
  const sr = await run({ operation: 'units', unitValue: 1, unitFrom: 'sr', unitTo: 'deg²' })
  assert('sr → deg² 可换算', sr.ok === true, txt(sr).slice(0, 60))
}

// ═══════════════════════════════════════════════════════════
console.log('-- 5. A7/A19 world 非法参数必须拒绝 --')
// ═══════════════════════════════════════════════════════════
{
  const illegal = [
    ['planetMass:-1（负重力）', { planetMass: -1 }],
    ['planetMass:0', { planetMass: 0 }],
    ['planetRadius:0（重力 Infinity）', { planetRadius: 0 }],
    ['planetRadius:-2', { planetRadius: -2 }],
    ['rotationHours:0（一天 0 小时）', { rotationHours: 0 }],
    ['orbitAU:0（一年 0 天）', { orbitAU: 0 }],
    ['starMass:-5', { starMass: -5 }],
    ['starRadius:0', { starRadius: 0 }],
  ]
  for (const [label, params] of illegal) {
    const r = await run({ operation: 'world', ...params })
    assert(`world ${label} 被拒`, r.ok === false, r.ok ? 'ok=true' : '')
    if (!r.ok) {
      assert(`world ${label} 报 invalid_argument`, r.error?.type === 'invalid_argument', String(r.error?.type))
      assert(`world ${label} 给了修法`, typeof r.error?.hint === 'string' && r.error.hint.length > 10, '')
    }
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 6. A7/A19 反向：合法极端参数不许被误拦 --')
// ═══════════════════════════════════════════════════════════
{
  const legal = [
    ['默认（地球）', {}],
    ['2 倍质量', { planetMass: 2 }],
    ['极小但为正 0.05', { planetMass: 0.05 }],
    ['巨行星 318/11.2', { planetMass: 318, planetRadius: 11.2 }],
    ['M 型恒星', { starMass: 0.122, starTemp: 3042, orbitAU: 0.0485 }],
    ['快速自转 3h', { rotationHours: 3 }],
    ['极远轨道 30AU', { orbitAU: 30 }],
  ]
  for (const [label, params] of legal) {
    const r = await run({ operation: 'world', ...params })
    assert(`world ${label} 正常出画像`, r.ok === true, txt(r).slice(0, 70))
    /** 合法世界不该出现 NaN / Infinity —— 那是静默污染的标志。 */
    if (r.ok) {
      assert(`world ${label} 输出不含 NaN/Infinity`, !/NaN|Infinity/.test(txt(r)), '')
    }
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 7. 诊断路径仍能看到坏世界（不被入口拦死） --')
// ═══════════════════════════════════════════════════════════
{
  /** `sum` 路由的职责是「把非法世界渲染成 invalid 诊断」，不是 400。 */
  const { deriveAll } = await import(pathToFileURL(join(root, 'lib/summary.js')).href)
  const bad = deriveAll({ planetRadius: 0 })
  assert('deriveAll 收到零半径不抛异常', typeof bad === 'object' && bad !== null, '')
  assert('deriveAll 把非法世界标成 invalid', bad.verdict?.level === 'invalid', String(bad.verdict?.level))
}

// ═══════════════════════════════════════════════════════════
console.log('-- 8. A1 constants preview 只算不存 --')
// ═══════════════════════════════════════════════════════════
{
  const gravity = async () =>
    Number(txt(await run({ operation: 'world' })).match(/重力是地球的 ([\d.]+) 倍/)?.[1])

  const before = await gravity()
  const preview = await run({ operation: 'constants', constants: { G: 1e-10 }, preview: true })
  assert('preview 被接受', preview.ok === true, txt(preview).slice(0, 60))
  assert('preview 声明了「未生效」', /未生效、未落盘/.test(txt(preview)), '')
  assert('preview 不改变后续 world 重力', (await gravity()) === before, `期望 ${before}`)

  /** 不带 preview 时必须真生效，且明确声明这是全局副作用。 */
  const applied = await run({ operation: 'constants', constants: { G: 1e-10 } })
  assert('不带 preview 会生效', (await gravity()) !== before, '')
  assert('生效时声明了全局副作用', /全局副作用/.test(txt(applied)), '')
  assert('生效时给了两种出路（preview / 恢复）',
    /preview/.test(txt(applied)) && /constants:\{\}/.test(txt(applied)), '')

  /** 恢复：传空对象回到现实宇宙。 */
  await run({ operation: 'constants', constants: {} })
  assert('constants:{} 可恢复', (await gravity()) === before, '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 9. A21/A43 未知子命令与缺参必须报错 --')
// ═══════════════════════════════════════════════════════════
{
  /** 未知子命令：原来 ok=true 只回一行文本，调用方会把「没这个功能」当成功。 */
  const bogus = await run({ operation: 'derivation', derivation: '__nonsense__' })
  assert('未知子命令 ok=false', bogus.ok === false, String(bogus.ok))
  assert('未知子命令报 unknown_subcommand', bogus.error?.type === 'unknown_subcommand', String(bogus.error?.type))
  assert('未知子命令的提示列了可用项', /backSolve/.test(bogus.error?.hint ?? ''), '')

  /** 缺参数：原来 ok=true 且 error 为 undefined。 */
  const noArgs = await run({ operation: 'derivation', derivation: 'backSolve' })
  assert('缺参 ok=false', noArgs.ok === false, String(noArgs.ok))
  assert('缺参报 missing_params', noArgs.error?.type === 'missing_params', String(noArgs.error?.type))
  assert('缺参提示给出真实锚点', /creatureHeight/.test(noArgs.error?.hint ?? ''), '')
  assert('缺参提示给出可复制 JSON', /"anchor"/.test(noArgs.error?.hint ?? ''), '')

  /** 给了参数必须正常工作 —— 别把功能拦死。 */
  const ok = await run({
    operation: 'derivation', derivation: 'backSolve', anchor: 'creatureHeight', anchorValue: 50,
  })
  assert('backSolve 给参数后正常', ok.ok === true, txt(ok).slice(0, 60))

  /** 无参就能跑的元信息子命令不许被误伤。 */
  for (const sub of ['stack', 'cards', 'checklist', 'tables', 'anchors']) {
    const r = await run({ operation: 'derivation', derivation: sub })
    assert(`元信息子命令 ${sub} 仍可用`, r.ok === true, txt(r).slice(0, 50))
  }
}

// ═══════════════════════════════════════════════════════════
console.log('-- 10. N19/A33 feasibility 有 help 节，且数组不再假通过 --')
// ═══════════════════════════════════════════════════════════
{
  /**
   * A33 的根因是「这一节不存在」：没有文档 → 猜入参 → 猜成数组 → 整批丢弃。
   * 所以先验文档在，再验行为对。
   */
  const help = await run({ operation: 'help', helpTopic: 'feasibility' })
  assert('helpTopic feasibility 有正文', help.ok === true && txt(help).length > 50, txt(help).slice(0, 60))
  assert('help 写清了正确入参是对象', /claims/.test(txt(help)) && /对象/.test(txt(help)), '')
  assert('help 点名了数组是错法', /数组/.test(txt(help)), '')

  /** 数组必须报错，不能静默丢弃后报「自洽」。 */
  const arr = await run({ operation: 'feasibility', claims: [{ claim: 'x', value: 1 }] })
  assert('claims 传数组被拒', arr.ok === false, String(arr.ok))
  assert('报 invalid_argument', arr.error?.type === 'invalid_argument', String(arr.error?.type))
  assert('提示给了对象写法', /claims/.test(arr.error?.hint ?? '') && /cityPopulation/.test(arr.error?.hint ?? ''), '')

  /** 对象形态必须正常工作 —— 别把功能拦死。 */
  const obj = await run({ operation: 'feasibility', claims: { cityPopulation: 9.2e10 } })
  assert('claims 传对象正常', obj.ok === true, txt(obj).slice(0, 60))

  /** 不带 claims 时列上限表。 */
  const none = await run({ operation: 'feasibility' })
  assert('不带 claims 列物理上限', none.ok === true && /物理上限/.test(txt(none)), '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 11. N16 world brief 省 token 但不删信息 --')
// ═══════════════════════════════════════════════════════════
{
  const full = await run({ operation: 'world', planetMass: 2 })
  const brief = await run({ operation: 'world', planetMass: 2, brief: true })
  const fullLen = txt(full).length
  const briefLen = txt(brief).length

  assert('brief 被接受', brief.ok === true, txt(brief).slice(0, 60))
  assert('brief 显著更短（至少省 80%）', briefLen < fullLen * 0.2, `${briefLen} vs ${fullLen}`)
  assert('brief 仍能读（>100 字符）', briefLen > 100, String(briefLen))

  /** 关键数字必须在：这是 brief 存在的意义。 */
  for (const [label, pattern] of [
    ['重力', /重力/],
    ['一天', /一天/],
    ['年均温', /年均温/],
    ['气压', /气压/],
    ['逃逸速度', /逃逸速度/],
    ['一年', /一年/],
  ]) {
    assert(`brief 含 ${label}`, pattern.test(txt(brief)), '')
  }

  /** ★ 不删信息：结构化字段一个不少。 */
  for (const key of ['planet', 'orbit', 'temperature', 'atmosphere', 'life']) {
    assert(`brief 的 value 仍含 ${key}`, brief.value?.[key] !== undefined, '')
  }

  /**
   * ★ 最该守的一条：假设与警告不能被压掉。
   * 压掉它们，调用方会拿「基于错误恒星」的数字去写设定。
   */
  assert('brief 保留恒星假设警告', /默认成太阳|恒星/.test(txt(brief)), '')
  const mStar = await run({ operation: 'world', starMass: 0.122, starTemp: 3042, orbitAU: 0.0485, brief: true })
  assert('brief 对非太阳恒星也提示', /警告|⚠/.test(txt(mStar)), '')

  /** 生命判定要翻成人话，不能只给 open。 */
  assert('brief 生命行不是裸机器值', !/生命\s+open/.test(txt(brief)), '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 12. A17/A41 sanity 量纲对齐（双向失效修复）--')
// ═══════════════════════════════════════════════════════════
{
  /** 取某一条的 sanityStatus。 */
  const statusOf = async (expr, sanity) => {
    const r = await run({ operation: 'evaluate', expressions: [{ label: 'x', expr, sanity }] })
    return r.value?.items?.[0]?.sanityStatus ?? 'none'
  }

  /**
   * ★ A17：带单位结果 + 裸数锚点 → **不可比，不能报 violated**。
   *
   * 修复前：`5 m` 配 `max:1` 报「超出上限 1 达 5 倍」——
   * 把「米」当成无量纲数字比，是伪警报。
   */
  assert('5 m 配 max:1 判 incomparable', (await statusOf('5 m', { max: 1 })) === 'incomparable',
    await statusOf('5 m', { max: 1 }))
  assert('incomparable 不等于 passed（没判不能说成通过）',
    (await statusOf('5 m', { max: 1 })) !== 'passed', '')

  /**
   * ★ A41：带单位结果 + 带单位锚点 → **要真比，不能跳过**。
   *
   * 修复前：`max:'1 m'` 是字符串，`typeof === 'number'` 不成立，
   * 整段检查被跳过 → 报 passed。那是漏报，比伪警报更危险。
   */
  assert('500 cm 配 max:"1 m" 判 violated', (await statusOf('500 cm', { max: '1 m' })) === 'violated',
    await statusOf('500 cm', { max: '1 m' }))
  assert('2 m 配 max:"300 cm" 判 passed', (await statusOf('2 m', { max: '300 cm' })) === 'passed',
    await statusOf('2 m', { max: '300 cm' }))
  assert('5 m 配 max:"300 cm" 判 violated', (await statusOf('5 m', { max: '300 cm' })) === 'violated',
    await statusOf('5 m', { max: '300 cm' }))

  /** 反向：裸数配裸数照旧工作，不能被这次改动弄坏。 */
  assert('裸数配裸数仍能判 violated', (await statusOf('5', { max: 1 })) === 'violated',
    await statusOf('5', { max: 1 }))
  assert('裸数配裸数仍能判 passed', (await statusOf('1', { max: 5 })) === 'passed',
    await statusOf('1', { max: 5 }))

  /** 结果裸数 + 锚点带单位 → 也不知道该怎么理解这个数，同样不可比。 */
  assert('裸数结果配带单位锚点判 incomparable',
    (await statusOf('5', { max: '1 m' })) === 'incomparable', await statusOf('5', { max: '1 m' }))

  /**
   * ★ 小数不能被当成单位。
   *
   * `extractResultUnit` 第一版有个漏洞：`2133.41184` 被切成
   * 数值 `2133` + 单位 `.41184`，于是所有带小数的裸数都判成「带单位」，
   * 锚点比对全部退化成 incomparable —— 等于把检查关了。
   */
  assert('带小数的裸数仍能判量级偏离',
    (await statusOf('2645.6*28*3600*8000/1e9', { expect: 4 })) === 'violated',
    await statusOf('2645.6*28*3600*8000/1e9', { expect: 4 }))
  assert('带小数的裸数配上限仍能判 passed',
    (await statusOf('0.25', { max: 1e12 })) === 'passed', await statusOf('0.25', { max: 1e12 }))

  /** 不可比时必须给出说明，让调用方知道为什么没判。 */
  const inco = await run({ operation: 'evaluate', expressions: [{ label: 'x', expr: '5 m', sanity: { max: 1 } }] })
  assert('不可比时给了说明', /未作量纲比较/.test(txt(inco)), '')
  assert('说明里给了补救方法', /max:"1 m"|加上同样的单位/.test(txt(inco)), '')
}

// ═══════════════════════════════════════════════════════════
console.log('-- 13. 工作区读失败不许伪装成「空的」（借鉴 dsh-novel-writer）--')
// ═══════════════════════════════════════════════════════════
{
  /**
   * dsh-novel-writer 的注释指出的缺陷：
   * 「**读不到 ≠ 没写过**。调用方把 null 当作『没有创作资料』，
   * 于是权限/编码类失败会伪装成『还没建』——用户照提示去 init 也没用。」
   *
   * 本插件原来犯的是同一个错：`loadWorkspace` 的 catch 写「损坏就当作空工作区」。
   */
  const wsName = 'corrupt-test'
  await run({ operation: 'workspace', action2: 'create', name: wsName })

  /** 正常状态不该有警告。 */
  const healthy = await run({ operation: 'workspace', action2: 'show', name: wsName })
  assert('正常工作区不报损坏', !/读不出来/.test(txt(healthy)), '')

  /** 把文件写成非法 JSON。 */
  const { writeFileSync } = await import('node:fs')
  const filePath = join(home, 'workspaces', wsName + '.json')
  writeFileSync(filePath, '{ 这不是合法 JSON', 'utf8')

  const broken = await run({ operation: 'workspace', action2: 'show', name: wsName })
  assert('损坏的工作区仍能返回（不崩）', broken.ok === true, String(broken.ok))
  assert('★ 损坏被显式提示', /读不出来/.test(txt(broken)), txt(broken).slice(0, 80))
  assert('★ 明说「不代表没设过」', /不代表这个工作区没设过/.test(txt(broken)), '')
  assert('给出了修法', /修法/.test(txt(broken)), '')
  assert('报出了失败原因', /JSON|解析/.test(txt(broken)), '')

  /**
   * 缺文件（真的没建过）不该报损坏 —— 那是常态。
   *
   * ⚠ 注意：`show` 传一个不存在的名字会**回退到 default**，
   * 而 default 在前面的用例里可能被写坏过。所以这里显式建一个
   * 干净的新工作区再验，不然测的是别的东西。
   */
  await run({ operation: 'workspace', action2: 'create', name: 'fresh-ok-xyz' })
  const missing = await run({ operation: 'workspace', action2: 'show', name: 'fresh-ok-xyz' })
  assert('新建的空工作区不报损坏', !/读不出来/.test(txt(missing)), txt(missing).slice(0, 60))
}

rmSync(home, { recursive: true, force: true })
console.log('')
console.log(`通过 ${pass}，失败 ${fail}`)
if (failed.length > 0) {
  console.log('失败项:')
  for (const item of failed) console.log('  - ' + item)
}
process.exit(fail === 0 ? 0 : 1)
