/**
 * 客户端入口幂等性 + 注册 id 测试（两条真机崩溃回归）。
 *
 * 事故一（duplicate registration）：
 *   Uncaught Error: client-modules: duplicate factory registration
 *   (bundle executed twice without invalidate?)
 *
 * 事故二（id 不匹配 —— 「侧栏入口从来没出现」的根因）：
 *   宿主按**包名**查找 client 模块。dsh-hover-approve / dsh-context / dshmarket
 *   等正常插件都用包名注册；我们用了 'dsh-math-calculator-client'，
 *   于是 boot 取不到模块 → web boot: 1 entry did not activate / import failed
 *   → 桌面端升级为致命错误 → 窗口都出不来。
 *
 * 用 vm 沙箱模拟宿主加载器：重复执行必须 no-op，且 id 必须等于包名。
 */
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

const CODE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const PKG_NAME = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

function makeHost() {
  const registered = new Map()
  const warnings = []
  const loader = {
    load({ id, factory }) {
      if (registered.has(id)) {
        throw new Error('client-modules: duplicate factory registration for "' + id + '" (bundle executed twice without invalidate?)')
      }
      if (typeof factory !== 'function') throw new Error('factory must be a function')
      registered.set(id, factory)
    },
  }
  const context = createContext({
    window: { __ModuleLoader__: loader },
    console: {
      warn: (...args) => warnings.push(args.map(String).join(' ')),
      error: (...args) => warnings.push(args.map(String).join(' ')),
      log: () => {}, info: () => {}, debug: () => {},
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, RegExp,
  })
  return { context, registered, warnings }
}

console.log('-- 1. 首次执行 --')
{
  const host = makeHost()
  let threw = null
  try { runInContext(CODE, host.context) } catch (error) { threw = error }
  assert('首次执行不抛', threw === null, threw && threw.message.slice(0, 80))
  assert('注册了一个模块', host.registered.size === 1, String(host.registered.size))
  assert('模块 id 等于包名（宿主按包名查找）', host.registered.has(PKG_NAME), [...host.registered.keys()].join(',') + ' vs ' + PKG_NAME)
  assert('factory 是函数', typeof host.registered.get(PKG_NAME) === 'function')
}

console.log('-- 2. 重复执行（事故一场景）--')
{
  const host = makeHost()
  runInContext(CODE, host.context)
  const firstFactory = host.registered.get(PKG_NAME)
  let threw = null
  try { runInContext(CODE, host.context) } catch (error) { threw = error }
  assert('第二次执行不抛异常（关键）', threw === null, threw && threw.message.slice(0, 100))
  assert('没有产生重复注册错误', host.warnings.every((w) => !/duplicate factory registration/.test(w)), host.warnings.join(' | ').slice(0, 120))
  assert('仍然只有一个模块', host.registered.size === 1, String(host.registered.size))
  assert('原 factory 未被替换', host.registered.get(PKG_NAME) === firstFactory)
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

console.log('-- 5. 加载器本身抛错 --')
{
  let calls = 0
  const context = createContext({
    window: {
      __ModuleLoader__: {
        load() {
          calls += 1
          throw new Error('client-modules: duplicate factory registration for "' + PKG_NAME + '"')
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

console.log('-- 6. 产物自检 --')
{
  assert('产物含幂等标记', CODE.includes('__dshMathCalculatorClientRegistered__'))
  assert('产物含 console.warn 兜底', /console\.warn/.test(CODE))
  assert('产物注册 id 是包名', CODE.includes("id: '" + PKG_NAME + "'"))
}

console.log('')
if (fails.length === 0) console.log('全部通过：' + pass + ' 项')
else {
  console.log('通过 ' + pass + '，失败 ' + fails.length)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
