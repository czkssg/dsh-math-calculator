/**
 * 统一测试入口：一次跑完全部测试套件。
 *
 * 为什么需要这个：
 *   之前是逐个 `node test/xxx.mjs`，容易漏掉、也不好判断整体状态。
 *   这个脚本给出一张总表，任何一套失败就非零退出。
 *
 * 每套测试用**独立的临时目录**（DSH_MATH_CALC_HOME），
 * 避免工作区数据在测试之间串味 —— 这是之前踩过的坑：
 * constants 测试曾经因为 formula-table 测试留下的覆盖而失败。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * 测试清单：文件、期望的通过数（用于发现静默减少）、描述。
 *
 * ⚠️ 新增真测试**必须**进这张表，否则「全绿」不代表覆盖 ——
 * host-contract.mjs 就是这么漏掉的：它专门防「真宿主装不起来」，
 * 却不在清单里，于是 1008 项全绿照样漏掉了两次真机事故。
 *
 * 以下三个**故意不进来**（不是漏了）：
 *   formulas-list.mjs —— 生成 FORMULAS.md 的导出脚本，无断言
 *   limits.mjs        —— 生成 LIMITS.md 的采集脚本，无断言
 *   worldbuilding.mjs —— 手工压测探针，只打印结果
 */
const SUITES = [
  { file: 'run.mjs', expect: 66, label: '主功能（契约/运算/作用域）' },
  { file: 'formulas.mjs', expect: 35, label: '公式库' },
  { file: 'formulas-all.mjs', expect: 342, label: '全部公式可求值' },
  { file: 'formulas-sanity.mjs', expect: 15, label: '常识值反算' },
  { file: 'constants.mjs', expect: 51, label: '物理常数耦合' },
  { file: 'constants-core.mjs', expect: 40, label: '无量纲常数与尺度阶梯' },
  { file: 'scale-world.mjs', expect: 17, label: '常数传导到星球模型（S2）' },
  { file: 'provenance.mjs', expect: 17, label: '模型出处与可信度（S2.5）' },
  { file: 'stellar.mjs', expect: 37, label: '恒星结构与常数敏感度（S3）' },
  { file: 'life.mjs', expect: 25, label: '化学窗口与生命硬否决' },
  { file: 'determinism.mjs', expect: 18, label: '确定性（同输入同输出）' },
  { file: 'numeric.mjs', expect: 29, label: '基础运算扩展（秩/零空间/奇异值/分解/求根）' },
  { file: 'integration-checks.mjs', expect: 24, label: '跨模块一致性（后端整合）' },
  { file: 'client-ui.mjs', expect: 50, label: '前端挂载安全（令牌化 UI + 右栏 + 心跳）' },
  { file: 'api.mjs', expect: 102, label: 'UI 后端 API（绑定/sync/自动建表/SI常数/重置/心跳）' },
  { file: 'workspace-scope.mjs', expect: 20, label: '工作区作用域（数据表跟着会话 cwd 走）' },
  { file: 'derivation.mjs', expect: 58, label: '推演栈（八层/接口卡/无量纲/单位陷阱/敏感性/相图）' },
  { file: 'pipeline.mjs', expect: 21, label: '正向推演链路（world → P1—P5 逐层判定）' },
  { file: 'reuse.mjs', expect: 18, label: '复用性守卫（推演复用公式库与常数表，不重复实现）' },
  { file: 'custom.mjs', expect: 28, label: '自创常数（量纲校验/派生求解/安全求值/量纲检查）' },
  { file: 'anchor.mjs', expect: 30, label: '逆推校准 + 七张表持久化 + 版本对比' },
  { file: 'fantasy.mjs', expect: 36, label: '幻想层（叠加/等价现实量/只提醒不反驳）' },
  { file: 'universe-ops.mjs', expect: 26, label: '补丁（混沌拦截/数据表继承/A-B对比）' },
  { file: 'civilization.mjs', expect: 30, label: '目录4 宏观文明（能量/材料/交通/技术树）' },
  { file: 'dead-universe.mjs', expect: 22, label: '补丁6 死寂态兜底（判定+结语+挽救方向）' },
  { file: 'observer.mjs', expect: 25, label: '补丁7 观测者物理过滤（人择选择效应）' },
  { file: 'advanced.mjs', expect: 29, label: '收尾补齐（复数根/扩展函数/help/世界字段）' },
  { file: 'formula-ext.mjs', expect: 29, label: '公式库扩展与符号消歧' },
  { file: 'formula-story.mjs', expect: 42, label: '读者视角高频公式（第 4 批）' },
  { file: 'formula-story2.mjs', expect: 29, label: '读者视角高频公式（第 5 批：建筑/攻城/农业/医药）' },
  { file: 'taxonomy.mjs', expect: 35, label: '公式三轴标签（层级/领域/频率）' },
  // 兼容性：模拟「别的插件可以任意编程」的敌意环境。
  // 这两套专门防「装上了但被别人的插件搞挂」——和 host-contract 一样属于真机防线。
  { file: 'compat.mjs', expect: 29, label: '兼容性：敌意 ctx / 服务抢占 / 全局污染' },
  { file: 'compat-data.mjs', expect: 13, label: '兼容性：数据损坏 / 并发 / 目录共存' },
  // 真机崩溃回归：桌面宿主会重复执行 client bundle，重复注册必须是无害的 no-op。
  // 这条来自 2026-10-24 的崩溃日志：duplicate factory registration → 桌面端退出。
  { file: 'client-registration.mjs', expect: 16, label: '客户端入口幂等 + 注册 id = 包名（防桌面端致命崩溃）' },
  { file: 'consequences.mjs', expect: 61, label: '长链后果' },
  { file: 'impact.mjs', expect: 42, label: '全公式影响评估' },
  { file: 'quantities.mjs', expect: 42, label: '物理量分类与缩放' },
  { file: 'formula-table.mjs', expect: 33, label: '工作区公式表' },
  { file: 'feasibility.mjs', expect: 40, label: '设定一致性校验' },
  { file: 'awareness.mjs', expect: 29, label: '模型感知（提示注入）' },
  { file: 'detector.mjs', expect: 38, label: '计算需求检测器' },
  { file: 'hook.mjs', expect: 20, label: 'agent/pre-step 钩子' },
  { file: 'terrain.mjs', expect: 30, label: '局地地形气候' },
  { file: 'world.mjs', expect: 32, label: '星球体貌画像' },
  { file: 'ode.mjs', expect: 34, label: '微分方程求解' },
  { file: 'workspace.mjs', expect: 38, label: '工作区隔离' },
  { file: 'cleanup.mjs', expect: 35, label: '删除与清理' },
  { file: 'climate.mjs', expect: 48, label: '分层气候（辐照/季节/纬度）' },
  { file: 'integration.mjs', expect: 51, label: '整合验收（整体装配）' },
  { file: 'sky.mjs', expect: 43, label: '天空与星空（观测者视角）' },
  { file: 'moons.mjs', expect: 32, label: '多卫星系统（稳定性/观感）' },
  // 这一套专门防「插件在真宿主里装不起来」：桩忠实度 + 路由形状 + 派发行为。
  // 它曾经不在清单里，于是 1008 项全绿也照样漏掉了两次真机事故。
  { file: 'host-contract.mjs', expect: 32, label: '宿主契约回归（真机契约）' },
]

/** 跑一个测试文件，返回 stdout 与退出码。 */
function runSuite(file) {
  return new Promise((resolve) => {
    // 每个套件独立临时目录，避免数据串味
    const home = mkdtempSync(join(tmpdir(), 'dsh-test-'))
    const child = spawn(process.execPath, [join(root, 'test', file)], {
      cwd: root,
      env: { ...process.env, DSH_MATH_CALC_HOME: home },
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('close', (code) => {
      try {
        rmSync(home, { recursive: true, force: true })
      } catch {
        /* 忽略清理失败 */
      }
      resolve({ code: code ?? 0, output })
    })
  })
}

/** 从输出里提取通过数。 */
function parsePassCount(output) {
  // 「全部通过：66 项」或「通过 39，失败 1」或「✅ 可求值: 270/270」
  let match = output.match(/全部通过：(\d+)\s*项/)
  if (match) return Number(match[1])
  match = output.match(/通过\s+(\d+)，失败\s+(\d+)/)
  if (match) return Number(match[1])
  match = output.match(/可求值:\s*(\d+)\/(\d+)/)
  if (match) return Number(match[1])
  return null
}

/** 从输出里提取失败数。 */
function parseFailCount(output) {
  const match = output.match(/通过\s+(\d+)，失败\s+(\d+)/)
  if (match) return Number(match[2])
  if (/FAIL/.test(output)) return 1
  return 0
}

async function main() {
  console.log('══════════════════════════════════════════════════════════')
  console.log('  dsh-math-calculator 全量测试')
  console.log('══════════════════════════════════════════════════════════')
  console.log('')

  const results = []
  let totalPass = 0
  let totalFail = 0
  let anyFailed = false
  let anyCountMismatch = false

  for (const suite of SUITES) {
    process.stdout.write('  ' + suite.label.padEnd(30) + ' ')
    const result = await runSuite(suite.file)
    const passCount = parsePassCount(result.output)
    const failCount = parseFailCount(result.output)

    const okExit = result.code === 0
    const okCount = passCount === null || passCount === suite.expect

    if (passCount !== null) totalPass += passCount
    totalFail += failCount

    if (okExit && okCount) {
      console.log('✓ ' + (passCount !== null ? passCount + ' 项' : '通过'))
    } else {
      anyFailed = anyFailed || !okExit
      anyCountMismatch = anyCountMismatch || !okCount
      console.log('✗ 失败')
      if (!okExit) {
        console.log('    退出码: ' + result.code)
        // 只打印失败的断言，避免刷屏
        const failLines = result.output
          .split('\n')
          .filter((line) => /FAIL|Error|错误/.test(line))
          .slice(0, 8)
        for (const line of failLines) console.log('    ' + line.trim())
      }
      if (!okCount && passCount !== null) {
        console.log('    通过数不符: 实际 ' + passCount + '，期望 ' + suite.expect)
      }
    }
  }

  console.log('')
  console.log('──────────────────────────────────────────────────────────')
  console.log('  合计: ' + totalPass + ' 项通过' + (totalFail > 0 ? '，' + totalFail + ' 项失败' : ''))
  console.log('  测试套件: ' + SUITES.length + ' 套')
  if (anyCountMismatch) {
    console.log('  ⚠ 有套件的通过数与基线不一致（可能新增或丢失了用例）')
  }
  console.log('──────────────────────────────────────────────────────────')

  if (anyFailed) {
    console.log('')
    console.log('✗ 存在失败项')
    process.exitCode = 1
  } else {
    console.log('')
    console.log('✓ 全部通过')
  }
}

await main()
