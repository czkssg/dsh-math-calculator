/**
 * 兼容性测试：插件必须在「别人的插件可能做任何事」的环境里存活。
 *
 * 设计前提（用户 2026-10-24 的批评）：
 *   其它插件可以是任意代码——可能抛错、可能劫持服务、可能污染全局、
 *   可能抢先注册同名工具/路由。我们不能假设宿主环境是干净的。
 *
 * 因此本套件不测「功能对不对」，而是测「别人搞破坏时我们还能不能活」：
 *   A. ctx 残缺 / 代理抛错 / 服务缺失
 *   B. 注册点被抢占（同名工具、同路径路由）
 *   C. 全局被污染（Object.prototype、Math、Date、JSON）
 *   D. 重复加载与幂等
 *   E. 我们不污染别人（只占自己声明的资源）
 *
 * 判定标准：apply 不得抛出、工具必须注册成功、计算必须仍然正确。
 */
const mod = await import('../lib/index.js')
const { apply, name, inject } = mod

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 造一个最小可用 ctx，并记录注册结果。 */
function makeCtx(overrides = {}) {
  const registered = []
  const base = {
    tools: { register: (tool) => { registered.push(tool); return () => {} } },
    get: () => undefined,
    ...overrides,
  }
  return { ctx: base, registered }
}

/** apply 且不抛异常。 */
function applySafe(ctx) {
  try { apply(ctx); return null } catch (error) { return error }
}

console.log('-- A. 残缺/敌意 ctx --')
{
  let e = null
  try { apply(undefined) } catch (error) { e = error }
  assert('undefined ctx 抛出说明清楚的错误（而不是 TypeError）', e && /tools/.test(e.message), e && e.message.slice(0, 60))

  const { ctx, registered } = makeCtx({ tools: undefined })
  const err = applySafe(ctx)
  assert('缺少 tools 服务时抛明确错误', err && /tools/.test(err.message), err && err.message.slice(0, 50))

  const { ctx: ctx2 } = makeCtx()
  delete ctx2.tools
  assert('tools 被删也能识别', applySafe(ctx2) !== null)

  // 代理：访问任何未声明属性都抛错（模拟 cordis 的 inject 保护）
  const hostile = new Proxy({}, {
    get(target, prop) {
      if (prop === 'tools') return { register: () => () => {} }
      throw new Error('cannot get property ' + String(prop) + ' without inject')
    },
    has() { return false },
  })
  const err3 = applySafe(hostile)
  assert('访问任意属性都抛错的 Proxy 下仍能 apply', err3 === null, err3 && err3.message.slice(0, 70))

  // register 本身抛错：必须把错误传出去（否则工具层以为注册成功，实际没有）
  const { ctx: ctx4 } = makeCtx({ tools: { register: () => { throw new Error('slot taken') } } })
  const err4 = applySafe(ctx4)
  assert('register 抛错时向上传播（不静默吞掉）', err4 !== null && /slot taken/.test(err4.message), err4 && err4.message.slice(0, 50))
}

console.log('-- B. 注册点被抢占 --')
{
  const { ctx, registered } = makeCtx()
  applySafe(ctx)
  assert('正常注册 math_execute', registered.length === 1 && registered[0].name === 'math_execute')

  // 别的插件已占同名工具：我们的 register 抛错，apply 应传播而不是假装成功
  const taken = { tools: { register: () => { throw new Error('tool math_execute already registered') } }, get: () => undefined }
  const err = applySafe(taken)
  assert('同名工具被占用时明确失败', err !== null, err && err.message.slice(0, 50))

  // webServer.register 抛错：只影响 UI 路由，apply 不能失败
  const { ctx: ctx2 } = makeCtx({
    inject: (_services, cb) => {
      const webCtx = { webServer: { register: () => { throw new Error('route conflicts with another plugin') } } }
      try { cb(webCtx) } catch { /* 我们期望内部已捕获 */ }
      return () => {}
    },
  })
  const err2 = applySafe(ctx2)
  assert('UI 路由与别人冲突时 apply 仍成功（工具优先）', err2 === null, err2 && err2.message.slice(0, 60))
}

console.log('-- C. 全局被污染 --')
{
  const { ctx, registered } = makeCtx()
  const originals = { random: Math.random, now: Date.now, parse: JSON.parse, stringify: JSON.stringify }
  let err = null
  try {
    Math.random = () => { throw new Error('another plugin hijacked Math.random') }
    const r = applySafe(ctx)
    err = r
  } finally {
    Math.random = originals.random
  }
  assert('Math.random 被劫持时 apply 不失败', err === null, err && err.message.slice(0, 60))
  assert('且工具正常注册', registered.length === 1)
}

console.log('-- C2. 全局污染下的计算正确性 --')
{
  const { ctx, registered } = makeCtx()
  applySafe(ctx)
  const tool = registered[0]

  const polluted = { marker: 'polluted' }
  const before = Object.getOwnPropertyNames(Object.prototype).length
  try {
    Object.prototype.pollutedByOtherPlugin = 'x'
    const result = await tool.execute({ operation: 'evaluate', expression: '2 + 3' })
    assert('Object.prototype 被污染后仍能算出 5', String(result?.result ?? '').includes('5'), String(result?.result ?? '').slice(0, 40))
  } finally {
    delete Object.prototype.pollutedByOtherPlugin
  }
  const after = Object.getOwnPropertyNames(Object.prototype).length
  assert('我们没有往 Object.prototype 上加东西', after === before, `${before} -> ${after}`)

  // 全局 Math 被替换成坏对象
  const realMath = globalThis.Math
  let ok = null
  try {
    globalThis.Math = { random: () => 0.5, PI: 3.14 }
    const result = await tool.execute({ operation: 'evaluate', expression: '1 + 1' })
    ok = String(result?.result ?? '')
  } catch (error) {
    ok = 'THREW: ' + error.message
  } finally {
    globalThis.Math = realMath
  }
  assert('globalThis.Math 被替换后仍能执行（内部不依赖全局 Math 的特定成员）', !String(ok).startsWith('THREW'), String(ok).slice(0, 60))
}

console.log('-- D. 重复加载 / 幂等 --')
{
  const { ctx, registered } = makeCtx()
  applySafe(ctx)
  const first = registered.length
  const err = applySafe(ctx)
  assert('第二次 apply 不抛异常', err === null, err && err.message.slice(0, 50))
  assert('重复 apply 不会静默失败（要么成功注册要么明确报错）', err !== null || registered.length === first + 1)

  // 多次 apply 到不同 ctx 互不影响
  const a = makeCtx(), b = makeCtx()
  applySafe(a.ctx); applySafe(b.ctx)
  assert('两个独立 ctx 各自注册成功', a.registered.length === 1 && b.registered.length === 1)
}

console.log('-- E. 我们不污染别人 --')
{
  const { ctx } = makeCtx()
  const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis))
  applySafe(ctx)
  const globalsAfter = new Set(Object.getOwnPropertyNames(globalThis))
  const added = [...globalsAfter].filter((k) => !globalsBefore.has(k))
  assert('不新增全局变量', added.length === 0, added.join(', ') || '无')

  // 只声明需要 tools，不抢别的服务
  assert('inject 只声明 tools', inject.length === 1 && inject[0] === 'tools', JSON.stringify(inject))
  assert('包名与导出 name 一致', name === 'dsh-math-calculator', name)
}

console.log('-- F. 服务被别的插件顶替 --')
{
  // systemPrompt 服务存在但接口不对（别的插件实现了同名但不同形状）
  const { ctx, registered } = makeCtx({
    get: (key) => (key === 'systemPrompt' ? { section: 'not a function' } : undefined),
  })
  const err = applySafe(ctx)
  assert('systemPrompt 形状不对时 apply 仍成功', err === null, err && err.message.slice(0, 60))
  assert('工具仍注册', registered.length === 1)

  // systemPrompt.section 抛错
  const { ctx: ctx2, registered: reg2 } = makeCtx({
    get: () => ({ section: () => { throw new Error('another plugin owns the prompt') } }),
  })
  const err2 = applySafe(ctx2)
  assert('systemPrompt.section 抛错时 apply 仍成功', err2 === null, err2 && err2.message.slice(0, 60))

  // ctx.on 抛错
  const { ctx: ctx3, registered: reg3 } = makeCtx({ on: () => { throw new Error('hooks disabled') } })
  const err3 = applySafe(ctx3)
  assert('ctx.on 抛错时 apply 仍成功', err3 === null, err3 && err3.message.slice(0, 60))
  assert('钩子坏掉不影响工具', reg3.length === 1)

  // ctx.inject 抛错
  const { ctx: ctx4, registered: reg4 } = makeCtx({ inject: () => { throw new Error('inject disabled') } })
  const err4 = applySafe(ctx4)
  assert('ctx.inject 抛错时 apply 仍成功', err4 === null, err4 && err4.message.slice(0, 60))
  assert('路由层坏掉不影响工具', reg4.length === 1)
}

console.log('-- G. 工具在敌意输入下不崩 --')
{
  const { ctx, registered } = makeCtx()
  applySafe(ctx)
  const tool = registered[0]
  const hostile = [
    {},
    { operation: 'evaluate' },
    { operation: 'evaluate', expression: '' },
    { operation: 'evaluate', expression: 123 },
    { operation: 'formula', formula: '不存在' },
    { operation: 'world', world: { planetRadius: -5 } },
    { operation: 'matrix', matrix: 'not-a-matrix' },
    { operation: '__proto__' },
    { operation: 'constructor' },
  ]
  // 两类「拒绝」都是合格行为，要看拒绝发生在哪一层：
  //   · 宿主 schema 校验拒绝（ToolArgsError）—— 类型/枚举不对，在进我们代码前就被拦下
  //   · 我们自己的结构化错误（ok=false）—— 语义不对，我们负责解释
  // 唯一不合格的是「我们的代码抛裸异常」。
  let hostRejected = 0
  let weRejected = 0
  let bareThrow = 0
  for (const args of hostile) {
    try {
      const r = await tool.execute(args)
      if (r && typeof r.ok === 'boolean') weRejected += 1
      else bareThrow += 1
    } catch (error) {
      const isSchema = error && (error.name === 'ToolArgsError' || /invalid arguments/.test(error.message))
      if (isSchema) hostRejected += 1
      else bareThrow += 1
    }
  }
  assert('没有裸异常（全部由 schema 或我们自己拒绝）', bareThrow === 0, bareThrow + ' 组裸异常')
  assert('类型/枚举错误交给宿主 schema 拦截', hostRejected >= 3, hostRejected + ' 组')
  assert('语义错误由我们返回结构化结果', weRejected >= 5, weRejected + ' 组')
}

console.log('')
if (fails.length === 0) console.log(`全部通过：${pass} 项`)
else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
