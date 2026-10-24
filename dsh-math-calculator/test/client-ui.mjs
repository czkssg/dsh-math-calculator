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
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const clientPath = join(root, 'lib/client.js')
const source = readFileSync(clientPath, 'utf8')

// UI 设计代码已拆到 lib/ui/（theme / kit / data / left-panel / right-panel）。
// 断言「界面含什么」时必须把**全部产物**拼起来看，否则只看 client.js 会漏判。
const uiDir = join(root, 'lib/ui')
const uiFiles = existsSync(uiDir)
  ? readdirSync(uiDir).filter((name) => name.endsWith('.js')).sort()
  : []
const uiSource = uiFiles.map((name) => readFileSync(join(uiDir, name), 'utf8')).join(String.fromCharCode(10))
const allSource = source + String.fromCharCode(10) + uiSource

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
  assert('有错误边界', /Boundary/.test(source))
  assert(
    '面板分四个页签（配置与数据管理）',
    ['工作区', '常数表', '公式表', '设置'].every((label) => allSource.includes(label)),
  )
  assert(
    '调用配置类接口',
    allSource.includes('/constants') && allSource.includes('/formula-table') && allSource.includes('/settings'),
  )

  // UI 设计：全部走宿主主题令牌，左/右两栏共用同一套（「左右对应」）。
  // 社区插件（dsh-context / dsh-better-sidebar / agent-teams / my-guardian）
  // 都只用 --dsw-* 令牌，不写死颜色 —— 这样深浅色与字号自动跟随原生界面。
  assert('使用宿主设计令牌', allSource.includes('--dsw-alias-label-primary') && allSource.includes('--dsw-font-'))
  assert('左/右两栏共用同一套令牌',
    allSource.includes('T.text1') && allSource.includes('T.f12'))
  assert('无写死颜色（#/rgba 均已令牌化）', !/#[0-9a-fA-F]{3,6}|rgba?\(/.test(allSource))
  // 左右面板结构一致：两侧都从 kit 取 Panel/Section/Row 拼装
  assert('左右面板结构一致（共用 kit 构件）',
    (allSource.match(/createKit/g) || []).length >= 2 &&
    allSource.includes('Panel') && allSource.includes('Section') && allSource.includes('Row'))
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

  // order 取社区同量级（dshmarket=1 / dsh-context=20 / novel-writer=25）。
  // 注意：左侧「更多」是宿主原生的面板启动器，与 order 无关（docs/ui-conventions.md §3）。
  const panellistMeta = metas.find((m) => m.name === 'sidebar.panellist')
  assert('侧栏入口 order 在社区量级（10–40）',
    Boolean(panellistMeta) && panellistMeta.order >= 10 && panellistMeta.order <= 40,
    panellistMeta ? String(panellistMeta.order) : 'no meta')
  assert('产物不含 order: 900', !source.includes('order: 900'))

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
  // 新架构：入口缺失不再回滚页面（两个席位各自独立注册，结果写进心跳）。
  assert('入口缺失时页面仍保留（解耦）', pageDisposed === false, String(pageDisposed))
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

console.log('-- 6. 右侧边栏页签：当前工作区 --')
{
  // 宿主契约（读 dsh-context / dsh-better-sidebar 产物得出）：
  //   1) 向 sidebarRightTabs 注册页签
  //   2) 再挂 sidebar.right.pane.tab 与 .title，key 与页签 id 一致
  const tabRegistrations = []
  const innerSlots = []
  const innerMetas = []
  const sub = {
    sidebarRightTabs: {
      register(spec) {
        tabRegistrations.push(spec)
        return () => {}
      },
    },
    slots: {
      inject(name, callback) {
        innerSlots.push(name)
        const dispose = callback()
        return () => {
          if (typeof dispose === 'function') dispose()
        }
      },
      register(meta) {
        innerMetas.push(meta)
        return () => {}
      },
    },
  }
  const ctx = {
    // 左侧入口/页面：这个用例里不关心，给最小桩
    slots: {
      inject() {
        return () => {}
      },
      register() {
        return () => {}
      },
    },
    inject(services, callback) {
      assert('请求的注入服务是 sidebarRightTabs', services.includes('sidebarRightTabs'), services.join(','))
      const dispose = callback(sub)
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }

  const dispose = mod.apply(ctx)
  assert('向 sidebarRightTabs 注册了页签', tabRegistrations.length === 1, String(tabRegistrations.length))
  const tabId = tabRegistrations[0] && tabRegistrations[0].id
  // id 带包名，避免与其它插件的页签相撞
  assert('页签 id 带包名', tabId === 'dsh-math-calculator.workspace', String(tabId))
  assert('页签有标题', typeof tabRegistrations[0].title === 'function')
  assert('挂了右侧内容槽位', innerSlots.includes('sidebar.right.pane.tab'), innerSlots.join(', '))
  assert('挂了右侧标题槽位', innerSlots.includes('sidebar.right.pane.tab.title'))
  const bodyMeta = innerMetas.find((m) => m.name === 'sidebar.right.pane.tab')
  const titleMeta = innerMetas.find((m) => m.name === 'sidebar.right.pane.tab.title')
  assert('内容槽位 key = 页签 id', Boolean(bodyMeta) && bodyMeta.key === tabId, bodyMeta && bodyMeta.key)
  // 右栏必须拿到「工作区变更」的订阅函数，才能在左栏切换后自动换成本区的数据表
  assert('右栏注入了 subscribeWorkspace', Boolean(bodyMeta) && typeof bodyMeta.inject === 'function',
    bodyMeta ? typeof bodyMeta.inject : 'no meta')
  // 右栏要具备四件事：切换器 / 数据表 / 管理 / 开关
  assert('右栏含工作区切换器', allSource.includes('workspaces/switch'))
  // 宿主右栏契约：guide 入口必须有 id（宿主用 kind:id 拼固定态标识）
  assert('右栏 guide 入口带 id', source.includes("id: 'workspace'"))
  // 诊断心跳：面板挂载后回报，宿主侧可用 GET client-status 查
  assert('客户端上报心跳', allSource.includes('client-hello') && allSource.includes('reportClientStatus'))
  assert('右栏含提示档位开关', allSource.includes('promptMode'))
  assert('右栏含公式启停', allSource.includes("'disable'") && allSource.includes("'reset'"))
  assert('右栏含变量管理', allSource.includes('set-variable') && allSource.includes('remove-variable'))
  assert('右栏含地点管理', allSource.includes('save-terrain') && allSource.includes('remove-terrain'))
  assert('跨面板订阅存在', allSource.includes('subscribeWorkspace') && allSource.includes('notifyWorkspaceChanged'))
  assert('标题槽位 key 一致', Boolean(titleMeta) && titleMeta.key === tabId, titleMeta && titleMeta.key)
  assert('apply 返回 dispose', typeof dispose === 'function')
}

console.log('-- 7. 没有 sidebarRightTabs 服务时跳过（不报错）--')
{
  let threw = false
  let called = false
  const ctx = {
    slots: {
      inject() {
        return () => {}
      },
      register() {
        return () => {}
      },
    },
    inject(services, callback) {
      called = true
      // 真实宿主在服务缺失时根本不会执行回调；这里模拟同一行为
      return () => {}
    },
  }
  try {
    mod.apply(ctx)
  } catch {
    threw = true
  }
  assert('不抛异常', threw === false)
  assert('依然尝试过注入（由宿主决定是否回调）', called === true)
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
