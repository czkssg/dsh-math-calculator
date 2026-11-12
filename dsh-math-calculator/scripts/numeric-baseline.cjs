/**
 * 第 3 步对齐快照：从**老插件**生成 16 个 numeric operation 的输出基线。
 *
 * ## 为什么需要这个
 *
 * 新代码（`src/features/numeric/`）的验收标准是
 * 「输出与老插件逐字相同（除非是修 bug）」。
 *
 * 所以先把老插件的输出存下来，等新代码写完逐条比对。
 *
 * ## 与 `scripts/snapshot.cjs` 的区别
 *
 * | 脚本 | 覆盖 | 用途 |
 * |---|---|---|
 * | `snapshot.cjs` | 45 个跨域调用 | 重构期间防回归（master 分支） |
 * | **本脚本** | **16 个 numeric operation 的完整输出** | **重写期间对齐（rewrite/v3）** |
 *
 * 用法：
 * ```
 *   node scripts/numeric-baseline.cjs          生成基线
 *   node scripts/numeric-baseline.cjs --check  比对
 * ```
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-numbase-'))
process.env.DSH_MATH_CALC_HOME = home

const root = path.join(__dirname, '..')
const { runMathTool } = require(path.join(root, 'lib', 'index.js'))

/**
 * 16 个 numeric operation 的探针。
 *
 * ## 每个 case 的设计意图
 *
 * ```
 *   ① 覆盖每个 operation 的主路径
 *   ② 尽量用带小数的值（能暴露精度/格式化差异）
 *   ③ 混入一个中文单位（中文归一链路）
 * ```
 */
const CASES = [
  // ── 求值 ──
  ['evaluate-basic', { operation: 'evaluate', expression: '2+3*4' }],
  ['evaluate-decimal', { operation: 'evaluate', expression: '1/7' }],
  ['evaluate-bigint', { operation: 'evaluate', expression: '10^20+5' }],
  ['evaluate-units', { operation: 'evaluate', expression: '1 里 + 3 米' }],
  ['evaluate-batch', { operation: 'evaluate', expressions: ['1+1', '2*3', '10/4'] }],

  // ── 代数 ──
  ['solve-linear', { operation: 'solve', expression: '2x+3=7' }],
  ['solve-system', { operation: 'solve', expression: 'x+y=5, x-y=1' }],
  ['derivative', { operation: 'derivative', expression: 'x^3+2x', variable: 'x' }],
  ['integral', { operation: 'integral', expression: 'x^2', variable: 'x' }],
  ['integral-definite', { operation: 'integral', expression: 'x^2', variable: 'x', from: 0, to: 3 }],
  ['simplify', { operation: 'simplify', expression: '(x+1)^2' }],
  ['expand', { operation: 'expand', expression: '(x+1)^2' }],
  ['roots', { operation: 'roots', expression: 'x^2-4' }],

  // ── 线代 ──
  ['matrix-2x2', { operation: 'matrix', matrix: [[1, 2], [3, 4]] }],
  ['matrix-singular', { operation: 'matrix', matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],
  ['eigen', { operation: 'eigen', matrix: [[2, 0], [0, 3]] }],

  // ── 统计 ──
  ['stats-basic', { operation: 'stats', data: [1, 2, 3, 4, 5] }],
  ['stats-decimal', { operation: 'stats', data: [2.5, 3.1, 4.7, 5.2, 6.8] }],
  ['dist-normal', { operation: 'dist', distribution: 'normal', params: [0, 1], x: 1.96 }],
  ['dist-binomial', { operation: 'dist', distribution: 'binomial', params: [10, 0.5], x: 3 }],
  ['dist-poisson', { operation: 'dist', distribution: 'poisson', params: [3], x: 2 }],
  ['regression-linear', { operation: 'regression', data: [1, 2, 3, 4], dataY: [2, 4, 6, 8] }],
  ['regression-poly', { operation: 'regression', data: [1, 2, 3, 4], dataY: [1, 4, 9, 16], degree: 2 }],

  // ── 微分方程与递推 ──
  ['ode-exponential', { operation: 'ode', expression: 'dy/dt = -0.5*y', initial: { y: 100 }, from: 0, to: 10 }],
  ['recurrence', { operation: 'recurrence', recurrence: 'P*1.1', initial: { P: 100 }, periods: 5 }],

  // ── 单位 ──
  ['units-li-km', { operation: 'units', unitFrom: '里', unitTo: 'km' }],
  ['units-temp', { operation: 'units', unitValue: 100, unitFrom: 'degC', unitTo: 'degF' }],
  ['units-inch', { operation: 'units', unitValue: 5, unitFrom: 'cm', unitTo: 'inch' }],

  // ── 方程组（线性，matrix + vector）──
  ['system-linear', { operation: 'system', matrix: [[1, 1], [1, -1]], vector: [5, 1] }],
]

/** 跑全部探针。 */
async function collect() {
  const out = {}
  for (const [name, args] of CASES) {
    try {
      const r = await runMathTool(args)
      out[name] = {
        ok: r.ok === true,
        result: typeof r.result === 'string' ? r.result : String(r.result),
        /** 只留可 JSON 化的部分（value 里可能有函数）。 */
        value: safeJson(r.value),
      }
    } catch (error) {
      out[name] = { ok: false, error: String(error && error.message ? error.message : error).slice(0, 200) }
    }
  }
  return out
}

/** 把 value 转成可 JSON 的形式。 */
function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null))
  } catch {
    return null
  }
}

;(async () => {
  const checkMode = process.argv.includes('--check')
  const file = path.join(root, 'test', 'numeric-baseline.json')

  const fresh = await collect()

  if (!checkMode) {
    fs.writeFileSync(file, JSON.stringify(fresh, null, 1), 'utf8')
    const okCount = Object.values(fresh).filter((c) => c.ok).length
    console.log('已写入 numeric 基线：' + Object.keys(fresh).length + ' 个用例')
    console.log('成功 ' + okCount + ' / 失败 ' + (Object.keys(fresh).length - okCount))
    console.log('文件：' + file)
    fs.rmSync(home, { recursive: true, force: true })
    return
  }

  if (!fs.existsSync(file)) {
    console.log('没有基线文件，先跑一次不带 --check 的生成它。')
    fs.rmSync(home, { recursive: true, force: true })
    process.exit(1)
  }

  const base = JSON.parse(fs.readFileSync(file, 'utf8'))
  let diff = 0
  for (const name of Object.keys(fresh)) {
    const a = JSON.stringify(base[name])
    const b = JSON.stringify(fresh[name])
    if (a !== b) {
      diff += 1
      console.log('✗ 不一致：' + name)
      /** 只打第一处差异，避免刷屏。 */
      const ra = String(base[name]?.result ?? '')
      const rb = String(fresh[name]?.result ?? '')
      if (ra !== rb) {
        console.log('  基线: ' + JSON.stringify(ra.slice(0, 120)))
        console.log('  现在: ' + JSON.stringify(rb.slice(0, 120)))
      }
    }
  }
  if (diff === 0) console.log('✓ numeric 基线全部一致（' + Object.keys(fresh).length + ' 个用例）')
  else console.log('共 ' + diff + ' 个用例输出变了')
  fs.rmSync(home, { recursive: true, force: true })
  process.exit(diff === 0 ? 0 : 1)
})()
