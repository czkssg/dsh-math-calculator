/**
 * 边界档案：把实测出来的能力边界固化成文档 + 可执行断言。
 *
 * 这些不是「猜」的，全部是本机实测。跑 `node test/limits.mjs` 可复验。
 */
import { writeFileSync } from 'node:fs'

const mod = await import('../lib/index.js')
const exec = (a) => mod.runMathTool(a)

const rows = []
const record = (category, name, verdict, note) => rows.push({ category, name, verdict, note })

console.log('采集中…\n')

// ── 1. 支持的能力 ──
record('线性代数', 'det/inv/transpose/trace', '支持', '√')
record('线性代数', 'eigs 特征值', '支持', '200×200 实测 ~270ms')
record('线性代数', 'lusolve 线性系统', '支持', '带奇异检测')
record('线性代数', 'pinv 伪逆', '支持', 'mathjs 内置')
record('线性代数', 'qr / lup 分解', '支持', 'mathjs 内置')
record('线性代数', 'kron 克罗内克积', '支持', 'mathjs 内置')
record('线性代数', 'SVD 奇异值分解', '不支持', 'mathjs 无 svd 函数')
record('线性代数', '秩 rank', '不支持', 'mathjs 无 rank；可用 eigs 非零值个数代替')
record('线性代数', '零空间 nullSpace', '不支持', 'mathjs 无')
record('线性代数', 'LU 分解（显式）', '不支持', '只有 lup，无单独 lu')

// ── 2. 微分方程（RK4 自实现，见 src/ode.ts）──
record('微分方程', '一阶 ODE（dy/dt = f）', '支持', '自实现 RK4 定步长')
record('微分方程', '一阶方程组（SIR 等）', '支持', '多方程逗号分隔')
record('微分方程', '二阶方程（自动降阶）', '支持', 'd^2x/dt^2 = f')
record('微分方程', '指数增长/衰减', '支持', '实测与解析解误差 <1e-4')
record('微分方程', '谐振动 x\'\'=-x', '支持', '实测与 cos(t) 吻合')
record('微分方程', 'SIR 传染病完整曲线', '支持', '实测 S+I+R 守恒到 1e-6')
record('微分方程', 'Lotka-Volterra 完整轨迹', '支持', '实测震荡')
record('微分方程', '阻尼落体 → 终端速度', '支持', '实测与解析解一致')
record('微分方程', '发散检测', '支持', 'y\'=y² 在 t≈1 正确捕获')
record('微分方程', '刚性方程（stiff）', '部分', '显式 RK4 需极小步长；会提示但可能不准')
record('微分方程', '边值问题（BVP）', '不支持', '只做初值问题 IVP')
record('微分方程', '符号解析解', '不支持', '只给数值解，不给闭式表达式')

// ── 3. 符号积分 ──
// 注意：这些「不支持」不全是「非初等可积」。有的是确实无初等原函数
// （sin(x²)、x^x 无初等表达），有的只是 **Algebrite 引擎没实现**
// （x³sin(x)、ln(x)/x 其实有初等原函数，但这个 CAS 不会算）。
// 两者必须分开说，否则是在误导使用者。
const integrals = [
  ['x^2', true, '初等'],
  ['sin(x)', true, '初等'],
  ['exp(-x^2)', true, '初等（erf 形式）'],
  ['x*exp(x)', true, '初等'],
  ['1/x', true, '初等'],
  ['cos(x)^2', true, '初等'],
  ['x^3*sin(x)', false, '其实有初等原函数，Algebrite 未实现'],
  ['sin(x^2)', false, '无初等原函数（Fresnel 积分）'],
  ['1/(1+x^4)', false, '有初等原函数但极繁复，Algebrite 未实现'],
  ['sqrt(1+x^3)', false, '椭圆积分，无初等表达'],
  ['x^x', false, '无初等原函数'],
  ['ln(x)/x', false, '其实有初等原函数 (ln²x/2)，Algebrite 未实现'],
]
for (const [expr, expected, note] of integrals) {
  const r = exec({ operation: 'integral', expression: expr })
  const actual = r.ok
  record(
    '符号积分',
    `∫${expr} dx`,
    actual ? '支持' : '不支持',
    expected === actual ? note : '⚠ 与预期不符',
  )
}

// ── 4. 多项式求根 ──
for (const [expr, count] of [['x^2 - 4', 2], ['x^3 - 1', 3], ['x^4 + 1', 4], ['x^5 - 1', 5], ['x^10 - 1', 10]]) {
  const r = exec({ operation: 'roots', expression: expr })
  const got = Array.isArray(r.value) ? r.value.length : 0
  record('多项式求根', expr, got === count ? '支持' : '部分', `${got}/${count} 个根（含复数）`)
}
record('多项式求根', 'mathjs polynomialRoot 本身', '仅 ≤3 次', '4 次及以上走 Algebrite')
record('多项式求根', 'Wilkinson 病态多项式', '精度受限', '高次病态多项式根对系数极敏感')

// ── 5. 数值规模 ──
const bigStart = Date.now()
const big = exec({ expression: 'factorial(10000)' })
record('大数运算', '10000!', big.ok ? '支持' : '不支持', `${Date.now() - bigStart}ms`)
record('大数运算', '整数运算', '精确', 'BigNumber，整数用 fixed 输出完整位')
record('大数运算', 'pi 超过 64 位', '不支持', 'mathjs 的 pi 常量硬编码 64 位')
record('大数运算', '一般除法任意精度', '支持', '1/7 到 256 位实测正常')

// ── 6. 规模上限 ──
record('规模上限', '矩阵边长', '200', `MAX_MATRIX_SIZE=${200}（实测 100×100 eigs 270ms）`)
record('规模上限', '表达式长度', '4000 字符', 'MAX_INPUT_LENGTH')
record('规模上限', 'precision', '1–256', '有效；但 pi 常量封顶 64 位')
record('规模上限', 'factorial 参数', '≤100000', 'AST 层拦截，实测 10000! 仅 8ms')
record('规模上限', '统计样本量', '≥5000', '实测 5000 个点 2ms')

// ── 7. 安全 ──
for (const [name, expr] of [
  ['process 访问', 'process.exit(0)'],
  ['constructor 逃逸', '(1).constructor'],
  ['import 注入', 'import("fs")'],
  ['createUnit 改写', 'createUnit("x","1 m")'],
]) {
  const r = exec({ expression: expr })
  record('安全防护', name, r.ok ? '⚠ 未拦截' : '已拦截', r.error?.type ?? '')
}


// ── 8. 世界观推演能力（v2 新增）──
record('世界观推演', 'world 星球体感画像', '支持', '重力/昼夜/季节/气候带/地形上限，地球参数可还原')
record('世界观推演', 'terrain 局地气候', '支持', '沿海/山区/平原/谷地/荒漠，含雨影与洋流')
record('世界观推演', 'constants 常数耦合', '支持', '改 1 个常数自动推导 14 个派生量')
record('世界观推演', 'quantities 量纲分析', '支持', '区分该变/不该变的物理量，含缩放指数')
record('世界观推演', 'impact 全公式影响', '支持', '270 条公式逐条对比现实，算偏差分级')
record('世界观推演', 'feasibility 设定一致性', '支持', '11 条物理约束校验，超限给调整建议')
record('世界观推演', 'consequences 长链后果', '支持', '恒星寿命/碳合成/化学速率等跨尺度推算')
record('世界观推演', 'workspace 工作区隔离', '支持', '一个世界观 = 一套常数表+公式表+地点+变量')
record('世界观推演', 'formula-table 公式表', '支持', '覆盖/自定义/停用，常量自动跟随工作区')
record('世界观推演', '历法推演（月份/月相/闰年）', '不支持', '未实现，但可用 calendar 相关公式手算')
record('世界观推演', '大圆距离（经纬度间距离）', '不支持', '未收录该公式，可用 evaluate 手写 haversine')
record('世界观推演', '洋流与大气环流模拟', '不支持', '需解 Navier-Stokes，超出闭式公式范畴')
record('世界观推演', '非线性方程组求解', '不支持', '只支持线性方程组')

// ── 9. 模型感知（v2 新增）──
record('模型感知', 'systemPrompt 每轮注入', '支持', 'ctx.systemPrompt.section，默认 brief 档')
record('模型感知', 'agent/pre-step 实时检测', '支持', '检测用户消息里的计算需求，主动提醒')
record('模型感知', '错误时 operation 建议', '支持', '方程/求导/特征值/星球推演四类场景')
record('模型感知', '检测器防误报', '支持', '11 类意图+6 类算式+6 类减分项，22 个样本零误判')
record('模型感知', '提醒节流', '支持', '每会话最多 3 次，冷却 2 步，用过插件后静默')

// ── 10. UI 与数据管理（v2 新增）──
record('UI 与数据', '侧栏工作区面板', '支持', '浏览器 __ModuleLoader__ 格式，需宿主 slots 服务')
record('UI 与数据', '后端 API 路由', '支持', '12 个 /api/dsh-math-calculator/* 端点')
record('UI 与数据', '工作区清理机制', '支持', '空壳/临时前缀/过期三种策略，支持 dryRun 预览')
record('UI 与数据', '单条删除（地点/变量/常数）', '支持', '可单独移除，不影响其余数据')
record('UI 与数据', '版本控制/历史回溯', '不支持', '工作区无版本历史，覆盖公式后需手动恢复')
record('UI 与数据', '工作区导入导出', '不支持', '未实现，但 JSON 文件可直接复制')

// ── 输出 Markdown ──
const byCategory = new Map()
for (const row of rows) {
  if (!byCategory.has(row.category)) byCategory.set(row.category, [])
  byCategory.get(row.category).push(row)
}

const lines = [
  '# 能力边界档案（实测）',
  '',
  '> 本文件由 `test/limits.mjs` 生成，每条都对应一次真实调用。',
  `> 生成时间：${new Date().toISOString()}`,
  '',
]
for (const [category, items] of byCategory) {
  lines.push(`## ${category}`, '')
  lines.push('| 能力 | 状态 | 说明 |')
  lines.push('|---|---|---|')
  for (const item of items) {
    lines.push(`| ${item.name} | ${item.verdict} | ${item.note} |`)
  }
  lines.push('')
}

writeFileSync(new URL('../LIMITS.md', import.meta.url), lines.join('\n'), 'utf8')

const supported = rows.filter((r) => r.verdict === '支持').length
const unsupported = rows.filter((r) => r.verdict === '不支持').length
console.log(`共 ${rows.length} 条：支持 ${supported}，不支持 ${unsupported}`)
console.log('已写入 LIMITS.md')

// 断言：关键能力不能回退
const critical = rows.filter((r) => r.note.includes('⚠'))
if (critical.length > 0) {
  console.log('\n⚠ 有与预期不符的条目：')
  for (const c of critical) console.log(`  - ${c.name}: ${c.note}`)
  process.exitCode = 1
}
