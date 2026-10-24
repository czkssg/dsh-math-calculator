/**
 * 装机前自检：一条命令确认「可以拿去装了」。
 *
 * 检查项：
 *   1. 构建产物存在且比源码新（没有忘记 npm run build）
 *   2. 入口导出契约（name / apply / inject）
 *   3. 客户端产物格式与席位（__ModuleLoader__ / sidebar.panellist / main）
 *   4. 运行期只依赖官方 defineTool，不 import 其它 @deepseek-ai/* 包
 *   5. package.json 的 dsh 字段完整
 *
 * 退出码非 0 表示「先别装」。
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { auditDocs } from './doc-coverage.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
const notes = []

function check(name, condition, detail) {
  if (condition) {
    console.log('  ✓ ' + name + (detail ? ': ' + detail : ''))
  } else {
    failures.push(name + (detail ? ': ' + detail : ''))
    console.log('  ✗ ' + name + (detail ? ': ' + detail : ''))
  }
}

console.log('== 1. 构建产物 ==')
const mainPath = join(root, 'lib/index.js')
const clientPath = join(root, 'lib/client.js')
check('lib/index.js 存在', existsSync(mainPath))
check('lib/client.js 存在', existsSync(clientPath))
if (existsSync(mainPath)) {
  const newestSource = Math.max(
    ...['index.ts', 'world.ts', 'stellar.ts', 'life.ts', 'integration.ts', 'numeric.ts', 'api.ts'].map((file) => {
      const path = join(root, 'src', file)
      return existsSync(path) ? statSync(path).mtimeMs : 0
    }),
  )
  check('构建产物比源码新', statSync(mainPath).mtimeMs >= newestSource, '若失败请先 npm run build')
}

console.log('== 2. 入口契约 ==')
const mod = await import(pathToFileURL(mainPath).href)
check('导出 name', typeof mod.name === 'string', mod.name)
check('导出 apply', typeof mod.apply === 'function')
check('inject 恰好是 [tools]', Array.isArray(mod.inject) && mod.inject.length === 1 && mod.inject[0] === 'tools', JSON.stringify(mod.inject))

console.log('== 3. 客户端产物 ==')
const client = readFileSync(clientPath, 'utf8')
check('使用 __ModuleLoader__', client.includes('__ModuleLoader__'))
check('挂 sidebar.panellist 入口', client.includes('sidebar.panellist'))
check('挂 main 页面', client.includes("name: 'main'"))
// 右侧边栏：当前工作区数据表。契约 = 先向 sidebarRightTabs 登记页签，
// 再挂 sidebar.right.pane.tab 与 .title（两者的 key 必须与页签 id 一致）。
check('挂右侧边栏页签（当前工作区）', client.includes('sidebar.right.pane.tab') && client.includes('sidebarRightTabs'))
check('有错误边界', client.includes('MathCalcBoundary'))
check('不注入全局样式', !client.includes('document.head'))
// 真机事故：桌面宿主会重复执行 client bundle，宿主加载器对同一 id 二次注册会抛错，
// 未捕获错误会让整次 web boot 失败并被桌面端升级为致命错误（窗口都出不来）。
check('客户端入口幂等（重复执行不抛）', client.includes('__dshMathCalculatorClientRegistered__'))
check('注册失败被兜底', /try\s*\{[\s\S]{0,400}?loader\.load/.test(client) && client.includes('console.warn'))
// 真机事故：宿主按**包名**查找 client 模块。注册 id 写成 "<包名>-client" 时，
// 模块其实注册成功了，但宿主按包名取不到 → "entry did not activate / import failed"
// → 桌面端升级为致命错误，窗口都出不来。
const clientPackageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
check('客户端注册 id = 包名', client.includes(`id: '${clientPackageName}'`), clientPackageName)
check('客户端注册 id 不是 "<包名>-client"', !client.includes(`id: '${clientPackageName}-client'`))

console.log('== 4. 运行期依赖 ==')
const indexSource = readFileSync(join(root, 'lib/index.js'), 'utf8')
const officialImports = [...indexSource.matchAll(/from '(@deepseek-ai\/[^']+)'/g)].map((m) => m[1])
const unexpected = officialImports.filter((name) => name !== '@deepseek-ai/dsh-tools')
check('只 import 官方 dsh-tools', unexpected.length === 0, unexpected.join(', ') || '无其它')

console.log('== 5. 注释覆盖 ==')
const docs = auditDocs(join(root, 'src'))
check('模块头齐全', docs.missingHeaders.length === 0, docs.missingHeaders.slice(0, 3).join('; '))
check('模块头带 @module', docs.missingModules.length === 0, docs.missingModules.slice(0, 3).join('; '))
check('导出都有文档注释', docs.missingExports.length === 0, docs.missingExports.slice(0, 3).join('; '))
notes.push(`注释行占比 ${(docs.commentRatio * 100).toFixed(1)}%（${docs.files} 文件 / ${docs.exports} 导出）`)

console.log('== 6. package.json ==')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('有 dsh.bundle.patch', Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
check('有 dsh.client.platform', pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web')
check('client.inject 含 ui-slots', Boolean(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots')))
check('exports 指向 client', Boolean(pkg.exports && pkg.exports['./client']))
check('main 指向 lib/index.js', pkg.main === 'lib/index.js')
check('engines.dsh 存在（标准位置）', Boolean(pkg.engines && typeof pkg.engines.dsh === 'string'), pkg.engines && pkg.engines.dsh)
check('dsh.manifestVersion = 1', Boolean(pkg.dsh && pkg.dsh.manifestVersion === 1))

console.log('== 7. 注册清单（dsh.plugin.json） ==')
const manifestPath = join(root, 'dsh.plugin.json')
check('清单存在', existsSync(manifestPath))
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check('清单 id = 包名', manifest.id === pkg.name, manifest.id)
  check('清单 version = 包版本', manifest.version === pkg.version, manifest.version)
  check('清单声明 math_execute', Boolean(manifest.contributes && manifest.contributes.tools && manifest.contributes.tools.includes('math_execute')))
}

console.log('== 8. peer 依赖是否接受宿主的 prerelease 版本 ==')
//
// 为什么必须查这一项（真机事故）：
//   dsh-my-guardian 这类"守门人"插件会在挂载前校验 peerDependencies。
//   宿主发布的是 0.1.7-rc.2 这类 **prerelease** 版本，而 semver 默认
//   `>=0.1.0 <0.3.0` **不接受任何 prerelease** —— 于是插件被判"依赖版本不满足"，
//   先 quarantine 后 freeze，最后被移出启动名册，表现就是"装上了但启动不了"。
//
// 正确写法：范围里带 `-0`（包含所有 prerelease），或显式枚举 rc 版本。
const toolsPkgPath = join(root, 'node_modules/@deepseek-ai/dsh-tools/package.json')
if (existsSync(toolsPkgPath)) {
  const hostToolsVersion = JSON.parse(readFileSync(toolsPkgPath, 'utf8')).version
  const peerRange = pkg.peerDependencies && pkg.peerDependencies['@deepseek-ai/dsh-tools']
  const hostIsPrerelease = String(hostToolsVersion).includes('-')
  const rangeAcceptsPrerelease = typeof peerRange === 'string' && (peerRange.includes('-0') || /-rc\.|\b0\.[0-9]+\.[0-9]+-/.test(peerRange))
  check(
    'peer[dsh-tools] 接受宿主 prerelease 版本',
    Boolean(peerRange) && (!hostIsPrerelease || rangeAcceptsPrerelease),
    `宿主 ${hostToolsVersion} / 声明 ${peerRange ?? '(缺失)'}；需要 -0 或显式 rc`,
  )
} else {
  notes.push('未找到本地 dsh-tools，跳过 peer 版本检查')
}

console.log('')
if (failures.length > 0) {
  console.log('✗ 自检未通过（先别装）：')
  for (const item of failures) console.log('  - ' + item)
  process.exitCode = 1
} else {
  console.log('✓ 自检通过：可以进入装机实测（记得先在隔离 profile 里试）。')
}
