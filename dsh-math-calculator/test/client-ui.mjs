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
  assert('主栏只注册自己的页面（同名 key）', source.includes("name: 'main'") && source.includes("key: PANEL_ID"))
  assert('挂侧栏入口行', source.includes('sidebar.panellist'))
  assert('挂主栏页面', source.includes("name: 'main'"))
  assert('有错误边界', source.includes('MathCalcBoundary'))
  assert(
    '面板分四个页签（配置与数据管理）',
    ['工作区', '常数表', '公式表', '设置'].every((label) => source.includes(label)),
  )
  assert(
    '调用配置类接口',
    source.includes('/constants') && source.includes('/formula-table') && source.includes('/settings'),
  )
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
// 真机事故：宿主按**包名**查找 client 模块，注册 id 必须是包名。
// 用 '<包名>-client' 时模块注册成功但宿主查不到 → 每次 boot 都报 import failed。
assert('id 等于包名', captured.id === 'dsh-math-calculator', captured?.id)

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

console.log('-- 3. 入口 + 页面：官方席位 --')
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
  assert('先注册主栏页面', slots[0] === 'main')
  assert('再注册侧栏入口', slots[1] === 'sidebar.panellist')

  const page = metas.find((m) => m.name === 'main')
  const row = metas.find((m) => m.name === 'sidebar.panellist')
  assert('主栏用 key 寻址', page && page.key === 'dsh-math-calculator.workspaces', JSON.stringify(page))
  assert('入口用同名 id 寻址', row && row.id === 'dsh-math-calculator.workspaces', JSON.stringify(row))
  assert('入口带 order', row && typeof row.order === 'number', String(row && row.order))
  assert('入口 label 可用', row && typeof row.label === 'function' && row.label() === '数学工作区', row && String(row.label()))
  assert('apply 返回卸载函数', typeof disposeAll === 'function')
  disposeAll()
  assert('卸载会 dispose 两个槽位', disposed.length === 2, String(disposed.length))
}

console.log('-- 4. 席位缺失时的防御 --')
{
  // 没有 main 席位：不应注册入口（否则点开是空页）
  const noMain = {
    slots: {
      inject(name, callback) {
        if (name === 'main') throw new Error('no main')
        return callback()
      },
      register() {
        return () => {}
      },
    },
  }
  let threw = false
  try {
    mod.apply(noMain)
  } catch {
    threw = true
  }
  assert('没有 main 时不抛异常', threw === false)

  // 有 main、没有入口：应把已注册的页面撤掉，不留孤儿
  let pageDisposed = false
  const noRow = {
    slots: {
      inject(name, callback) {
        if (name === 'sidebar.panellist') throw new Error('no panellist')
        return callback()
      },
      register() {
        return () => {
          pageDisposed = true
        }
      },
    },
  }
  mod.apply(noRow)
  assert('入口缺失时回滚页面', pageDisposed === true)
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
