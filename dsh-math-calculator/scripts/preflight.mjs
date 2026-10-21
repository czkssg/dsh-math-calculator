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
check('有错误边界', client.includes('MathCalcBoundary'))
check('不注入全局样式', !client.includes('document.head'))

console.log('== 4. 运行期依赖 ==')
const indexSource = readFileSync(join(root, 'lib/index.js'), 'utf8')
const officialImports = [...indexSource.matchAll(/from '(@deepseek-ai\/[^']+)'/g)].map((m) => m[1])
const unexpected = officialImports.filter((name) => name !== '@deepseek-ai/dsh-tools')
check('只 import 官方 dsh-tools', unexpected.length === 0, unexpected.join(', ') || '无其它')

console.log('== 5. package.json ==')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('有 dsh.bundle.patch', Boolean(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch))
check('有 dsh.client.platform', pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web')
check('client.inject 含 ui-slots', Boolean(pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots')))
check('exports 指向 client', Boolean(pkg.exports && pkg.exports['./client']))
check('main 指向 lib/index.js', pkg.main === 'lib/index.js')

console.log('')
if (failures.length > 0) {
  console.log('✗ 自检未通过（先别装）：')
  for (const item of failures) console.log('  - ' + item)
  process.exitCode = 1
} else {
  console.log('✓ 自检通过：可以进入装机实测（记得先在隔离 profile 里试）。')
}
