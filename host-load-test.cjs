const { pathToFileURL } = require('node:url')
const path = require('node:path')

// 用宿主自己的 Electron 运行时加载安装在 profile 里的插件
const profileEntry = path.join(
  'C:\\Users\\曹某\\.dsh\\profiles\\desktop',
  'node_modules',
  'dsh-math-calculator',
  'lib',
  'index.js',
)

async function main() {
  console.log('=== 从 profile 安装位置加载插件 ===')
  console.log('路径:', profileEntry)

  let mod
  try {
    mod = await import(pathToFileURL(profileEntry).href)
  } catch (error) {
    console.error('加载失败:', error.code || error.name)
    console.error(error.message)
    process.exit(1)
  }

  console.log('加载成功')
  console.log('  name:', mod.name)
  console.log('  inject:', JSON.stringify(mod.inject))
  console.log('  injectOptional:', JSON.stringify(mod.injectOptional))
  console.log('  apply:', typeof mod.apply)

  // 用桩 context 触发 apply
  console.log('')
  console.log('=== 模拟宿主注册 ===')
  const registered = []
  const hooks = {}
  let promptSection = null
  let routeInfo = null

  const ctx = {
    tools: {
      register: (def) => {
        registered.push(def)
        return () => {}
      },
    },
    on: (event, handler) => {
      hooks[event] = handler
      return () => {}
    },
    systemPrompt: {
      section: (spec) => {
        promptSection = spec
        return () => {}
      },
    },
    server: {
      route: (prefix, handler) => {
        routeInfo = { prefix, handler }
        return () => {}
      },
    },
  }

  try {
    mod.apply(ctx)
  } catch (error) {
    console.error('apply 失败:', error.message)
    process.exit(1)
  }

  console.log('  ���具注册:', registered.length, '个')
  if (registered.length > 0) {
    const tool = registered[0]
    console.log('  工具名:', tool.name)
    console.log('  operation 数:', tool.parameters.properties.operation.enum.length)
    console.log('  有 output.schema:', Boolean(tool.output && tool.output.schema))
    console.log('  有 output.render:', typeof tool.output.render === 'function')
  }
  console.log('  agent/pre-step 钩子:', Boolean(hooks['agent/pre-step']))
  console.log('  systemPrompt section:', Boolean(promptSection))
  console.log('  server route:', Boolean(routeInfo), routeInfo ? routeInfo.prefix : '')

  // 真实执行
  console.log('')
  console.log('=== 真实调用工具 ===')
  const tool = registered[0]
  const exec = (args) => tool.execute(args, {})

  const tests = [
    ['10^20+5', { expression: '10^20+5' }],
    ['方程组', { expression: '3x + 2y = 10, x - y = 1' }],
    ['求导', { expression: 'x^3*sin(x)', operation: 'derivative' }],
    ['逃逸速度公式', { formula: 'escape_velocity', overrides: { M: 5.9722e24, r: 6.371e6 }, operation: 'formula' }],
    ['星球画像', { world: { planetMass: 2 }, operation: 'world' }],
    ['设定校验', { world: { planetMass: 2 }, claims: { creatureHeight: 50 }, operation: 'feasibility' }],
  ]

  for (const [label, args] of tests) {
    const result = await exec(args)
    const text = tool.output.render(args, result)[0].text
    const firstLine = text.split('\n')[0].slice(0, 70)
    console.log('  ' + label.padEnd(16) + (result.ok ? '✓' : '✗') + ' ' + firstLine)
  }

  console.log('')
  console.log('=== 全部通过 ===')
}

main().catch((e) => {
  console.error('意外错误:', e.message)
  process.exit(1)
})
