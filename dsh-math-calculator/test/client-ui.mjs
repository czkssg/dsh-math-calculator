/**
 * 前端挂载的安全性测试（不依赖真实浏览器）。
 *
 * 目标（用户要求：不卡死、不影响原生 UI、不和已有插件冲突）：
 *   1. 只挂右侧边栏页签，不碰主界面；
 *   2. 槽位不存在 / 注册抛错时只跳过，不影响其它槽位；
 *   3. 不向 document.head 注入全局样式（避免污染原生界面）；
 *   4. 面板内部异常有错误边界兜住，不会传染给宿主；
 *   5. 卸载时能干净 dispose。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const clientPath = join(root, 'lib/client.js')
const source = readFileSync(clientPath, 'utf8')

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}

console.log('-- 1. 静态检查：不污染全局 --')
{
  assert('使用宿主模块加载器格式', source.includes('__ModuleLoader__'))
  assert('不向 document.head 注入样式', !source.includes('document.head'))
  assert('不注册 main 槽位（不动主界面）', !source.includes("'main'"))
  assert('挂右侧页签', source.includes('sidebar.right.pane.tab'))
  assert('挂页签标题', source.includes('sidebar.right.pane.tab.title'))
  assert('有错误边界', source.includes('MathCalcBoundary'))
}

console.log('-- 2. 模拟宿主加载 --')
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(options) {
      captured = options
    },
  },
}
await import(pathToFileURL(clientPath).href)
assert('模块加载器被调用', captured !== null)
assert('id 唯一', captured.id === 'dsh-math-calculator-client', captured?.id)

class FakeComponent {
  constructor(props) {
    this.props = props
    this.state = { error: null }
  }
  setState(next) {
    this.state = { ...this.state, ...next }
  }
}
const fakeReact = {
  createElement: () => null,
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  Component: FakeComponent,
}

const mod = captured.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error('unexpected require: ' + name)
})
assert('导出 apply', typeof mod.apply === 'function')
assert('声明依赖 slots', Array.isArray(mod.inject) && mod.inject.includes('slots'), JSON.stringify(mod.inject))

console.log('-- 3. 槽位注册：只挂两个侧栏槽位 --')
{
  const slots = []
  const metas = []
  const disposed = []
  const ctx = {
    slots: {
      inject(name, callback) {
        slots.push(name)
        const dispose = callback()
        return () => {
          disposed.push(name)
          if (typeof dispose === 'function') dispose()
        }
      },
      register(meta) {
        metas.push(meta)
        return () => {}
      },
    },
  }
  const disposeAll = mod.apply(ctx)
  assert('只注册 2 个槽位', slots.length === 2, slots.join(', '))
  assert('第一个是页签', slots[0] === 'sidebar.right.pane.tab')
  assert('第二个是页签标题', slots[1] === 'sidebar.right.pane.tab.title')
  assert('meta.name 与槽位一致', metas.every((m, i) => m.name === slots[i]))
  assert('meta.key 唯一且稳定', metas.every((m) => m.key === 'math-calc-workspaces'), JSON.stringify(metas.map((m) => m.key)))
  assert('apply 返回卸载函数', typeof disposeAll === 'function')
  disposeAll()
  assert('卸载会 dispose 两个槽位', disposed.length === 2, String(disposed.length))
}

console.log('-- 4. 槽位缺失时只跳过，不抛异常 --')
{
  const slotsMissing = {
    slots: {
      inject(name, callback) {
        if (name.endsWith('.title')) throw new Error('slot missing')
        return callback()
      },
      register() {
        return () => {}
      },
    },
  }
  const dispose = mod.apply(slotsMissing)
  assert('一个槽位抛错不影响另一个', typeof dispose === 'function')
}

console.log('-- 5. 宿主没有 slots 服务时静默退出 --')
{
  let threw = false
  try {
    mod.apply({})
    mod.apply(null)
  } catch {
    threw = true
  }
  assert('不抛异常', threw === false)
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
