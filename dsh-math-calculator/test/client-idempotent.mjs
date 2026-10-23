/**
 * 客户端入口幂等性测试（真机崩溃回归）。
 *
 * 真机事故（2026-10-24 崩溃日志）：
 *   Uncaught Error: client-modules: duplicate factory registration for
 *   "dsh-math-calculator-client" (bundle executed twice without invalidate?)
 *   → web boot: 1 entry did not activate
 *   → DesktopHostFatalError: cannot create effect on inactive context
 *   → 桌面端直接退出，窗口都没出来。
 *
 * 桌面宿主在启动/热重载时会重复执行同一个 client bundle。
 * 宿主加载器对同一 id 第二次 load 抛错，这个未捕获错误会让整次 boot 失败。
 *
 * 本测试用 vm 沙箱模拟宿主：重复执行必须是 no-op，绝不能抛。
 */
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

const CODE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 造一个模拟宿主：重复 id 会抛错（与真实宿主行为一致）。 */
function makeHost() {
  const registered = new Map()
  const warnings = []
  const loader = {
    load({ id, factory }) {
      if (registered.has(id)) {
        throw new Error(
          'client-modules: duplicate factory registration for "' + id + '" (bundle executed twice without invalidate?)',
        )
      }
      if (typeof factory !== 'function') throw new Error('factory must be a function')
      registered.set(id, factory)
    },
  }
  const windowObject = { __ModuleLoader__: loader }
  const context = createContext({
    window: windowObject,
    console: {
      warn: (...args) => warnings.push(args.map(String).join(' ')),
      error: (...args) => warnings.push(args.map(String).join(' ')),
      log: () => {},
      info: () => {},
      debug: () => {},
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    RegExp,
  })
  return { context, registered, warnings, windowObject }
}

console.log('-- 1. 首次执行 --')
{
  const host = makeHost()
  let threw = null
  try { runInContext(CODE, host.context) } catch (error) { threw = error }
  assert('首次执行不抛', threw === null, threw && threw.message.slice(0, 80))
  assert('注册了一个模块', host.registered.size === 1, String(host.registered.size))
  assert('模块 id 正确', host.registered.has('dsh-math-calculator-client'), [...host.registered.keys()].join(','))
  assert('factory 是函数', typeof host.registered.get('dsh-math-calculator-client') === 'function')
}

console.log('-- 2. 重复执行（真机崩溃场景）--')
{
  const host = makeHost()
  runInContext(CODE, host.context)
  const firstFactory = host.registered.get('dsh-math-calculator-client')

  let threw = null
  try {
    runInContext(CODE, host.context)   // 宿主重放 bundle
  } catch (error) {
    threw = error
  }
  assert('第二次执行不抛异常（关键）', threw === null, threw && threw.message.slice(0, 100))
  assert('没有产生重复注册错误', host.warnings.every((w) => !/duplicate factory registration/.test(w)), host.warnings.join(' | ').slice(0, 120))
  assert('仍然只有一个模块', host.registered.size === 1, String(host.registered.size))
  assert('原 factory 未被替换', host.registered.get('dsh-math-calculator-client') === firstFactory)
}

console.log('-- 3. 执行五次 --')
{
  const host = makeHost()
  let threw = null
  for (let i = 0; i < 5; i += 1) {
    try { runInContext(CODE, host.context) } catch (error) { threw = error; break }
  }
  assert('连续 5 次执行不抛', threw === null, threw && threw.message.slice(0, 80))
  assert('始终只有一个模块', host.registered.size === 1, String(host.registered.size))
}

console.log('-- 4. 宿主没有加载器 --')
{
  const context = createContext({
    window: {},
    console: { warn: () => {}, error: () => {}, log: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, RegExp,
  })
  let threw = null
  try { runInContext(CODE, context) } catch (error) { threw = error }
  assert('无加载器时静默跳过，不抛', threw === null, threw && threw.message.slice(0, 80))
}

console.log('-- 5. 加载器本身抛错（模拟宿主已注册过）--')
{
  let calls = 0
  const context = createContext({
    window: {
      __ModuleLoader__: {
        load() {
          calls += 1
          throw new Error('client-modules: duplicate factory registration for "dsh-math-calculator-client"')
        },
      },
    },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, RegExp,
  })
  let threw = null
  try { runInContext(CODE, context) } catch (error) { threw = error }
  assert('加载器抛错时被吞掉，不传播', threw === null, threw && threw.message.slice(0, 100))
  assert('确实尝试了注册', calls === 1, String(calls))
}

console.log('-- 6. 产物包含幂等闸门 --')
{
  assert('构建产物含幂等标记', CODE.includes('__dshMathCalculatorClientRegistered__'))
  assert('产物含 console.warn 兜底', /console\.warn/.test(CODE))
}

console.log('')
if (fails.length === 0) console.log(`全部通过：${pass} 项`)
else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
