/**
 * 输出快照：重构前后必须逐字相同。
 *
 * ## 为什么需要快照
 *
 * 6,702 项测试守的是「断言过的行为」，但重构的风险是**没被断言覆盖的输出悄悄变了**。
 * 快照记录 40 个代表性调用的**完整返回**，重构后逐字比对。
 *
 * ## 用法
 *
 * ```
 * node scripts/snapshot.cjs            # 生成基线到 test/snapshot-baseline.json
 * node scripts/snapshot.cjs --check    # 与基线比对，不一致则退出码 1
 * ```
 *
 * ## 只记录"应该稳定"的输出
 *
 * 不记录：时间戳、工作区路径、随机数、缓存状态。
 * 记录：result 正文、value 的数值部分、error 的 type/hint。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-snap-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = require(path.join(__dirname, '..', 'lib', 'index.js'))

/** 40 个代表性调用，覆盖全部 operation 家族。 */
const CASES = [
  // ── 基础运算 ──
  ['evaluate', { operation: 'evaluate', expression: '2+3*4' }],
  ['evaluate-bigint', { operation: 'evaluate', expression: '10^20+5' }],
  ['evaluate-frac', { operation: 'evaluate', expression: '1/3', displayPrecision: 8 }],
  ['evaluate-unit', { operation: 'evaluate', expression: '(10 hp/0.475) to kW' }],
  ['evaluate-batch', { operation: 'evaluate', expressions: [{ label: 'a', expr: '1+1' }, { label: 'b', expr: '2*3' }] }],
  ['evaluate-sanity', { operation: 'evaluate', expressions: [{ label: 't', expr: '1e12', sanity: { max: 1e10, note: '测试' } }] }],
  // ── 代数 ──
  ['solve-linear', { operation: 'solve', expression: '2x+3=7' }],
  ['solve-system', { operation: 'solve', expression: 'x+y=3, x-y=1' }],
  ['solve-singular', { operation: 'solve', expression: 'x+y=1, 2x+2y=2' }],
  ['derivative', { operation: 'derivative', expression: 'x^3+2x' }],
  ['integral', { operation: 'integral', expression: 'x^2', from: 0, to: 3 }],
  ['simplify', { operation: 'simplify', expression: 'x+x' }],
  ['expand', { operation: 'expand', expression: '(x+1)^2' }],
  ['roots', { operation: 'roots', expression: 'x^2-5x+6' }],
  // ── 线性代数（阶段 1 重点）──
  ['matrix-plain', { operation: 'matrix', matrix: [[1, 2], [3, 4]] }],
  ['matrix-singular', { operation: 'matrix', matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }],
  ['eigen', { operation: 'eigen', matrix: [[2, 0], [0, 3]] }],
  ['system', { operation: 'system', matrix: [[2, 1], [1, 3]], vector: [5, 10] }],
  // ── 统计（阶段 2 重点）──
  ['stats', { operation: 'stats', data: [1, 2, 3, 4, 5] }],
  ['dist-normal', { operation: 'dist', distribution: 'normal', params: [0, 1], x: 1.96 }],
  ['dist-t', { operation: 'dist', distribution: 't', params: [10], x: 2 }],
  ['dist-chi', { operation: 'dist', distribution: 'chisquare', params: [1], x: 3.84 }],
  ['dist-pois', { operation: 'dist', distribution: 'poisson', params: [3], x: 2 }],
  ['dist-bin', { operation: 'dist', distribution: 'binomial', params: [10, 0.5], x: 3 }],
  ['regression', { operation: 'regression', data: [1, 2, 3, 4], dataY: [2, 4, 6, 8] }],
  // ── 单位 ──
  ['units-simple', { operation: 'units', unitValue: 30, unitFrom: '里', unitTo: 'km' }],
  ['units-compound', { operation: 'units', unitValue: 1000, unitFrom: 'kg/m^3', unitTo: 'g/cm^3' }],
  ['units-temp', { operation: 'units', unitValue: 100, unitFrom: '°C', unitTo: 'K' }],
  // ── 公式 ──
  ['formula', { operation: 'formula', formula: 'escape_velocity', overrides: { M: 5.97e24, r: 6.37e6 } }],
  ['formulas-batch', { operation: 'formulas', formulas: [{ formula: 'escape_velocity', overrides: { M: 5.97e24, r: 6.37e6 } }] }],
  // ── 推演 ──
  ['world', { operation: 'world' }],
  ['world-heavy', { operation: 'world', planetMass: 1.5 }],
  ['world-brief', { operation: 'world', brief: true }],
  ['derivation-civ', { operation: 'derivation', derivation: 'civilization' }],
  ['feasibility', { operation: 'feasibility' }],
  ['bodies', { operation: 'bodies', bodyName: 'mars' }],
  // ── 两段共用 ──
  ['ledger', { operation: 'ledger', ledger: { parts: [{ name: '士', value: 1 }, { name: '农', value: 85 }, { name: '工', value: 10 }, { name: '商', value: 4 }] } }],
  ['interval', { operation: 'interval', interval: { expr: '20-50' } }],
  ['compare', { operation: 'compare', compare: { rows: ['甲', '乙'], cols: ['成本'], data: [[3], [5]] } }],
  ['hierarchy', { operation: 'hierarchy', hierarchy: { levels: ['师', '团', '营'], tree: [3, 3], base: 10 } }],
  ['quick_feasible', { operation: 'quick_feasible', quickFeasible: { claim: '这座塔能有 8000 米高' } }],
  ['consistency', { operation: 'consistency', consistency: { sections: [{ number: 1, text: '人口 920 亿' }, { number: 5, text: '人口 8 亿' }] } }],
  ['extract_numbers', { operation: 'extract_numbers', text: '全层人口 1.49 亿，面积 247.5 亿平方公里。' }],
  ['dependency', { operation: 'dependency', dependency: { levels: ['师', '团', '营'], tree: [3, 3] } }],
  ['balance', { operation: 'balance' }],
]

/** 从返回里剔除不稳定字段（时间戳、路径等）。 */
function stabilize(r) {
  const out = {
    ok: r.ok,
    result: r.result === undefined ? null : String(r.result),
    errorType: r.error?.type ?? null,
    errorMessage: r.error?.message ?? null,
  }
  // value 只保留可稳定序列化的部分，剔掉可能带路径/时间的
  try {
    const v = r.value
    if (v === undefined) out.value = null
    else out.value = JSON.parse(JSON.stringify(v).replace(/"[^"]*[\\/][^"]*"/g, '"[path]"'))
  } catch {
    out.value = '[unserializable]'
  }
  return out
}

;(async () => {
  const snap = {}
  for (const [name, args] of CASES) {
    try {
      const r = await runMathTool(args)
      snap[name] = stabilize(r)
    } catch (e) {
      snap[name] = { crashed: String(e.message).slice(0, 200) }
    }
  }

  const file = path.join(__dirname, '..', 'test', 'snapshot-baseline.json')
  const check = process.argv.includes('--check')

  if (!check) {
    fs.writeFileSync(file, JSON.stringify(snap, null, 1), 'utf8')
    console.log('已写入基线快照：' + Object.keys(snap).length + ' 个用例')
    console.log('文件：' + file)
  } else {
    if (!fs.existsSync(file)) {
      console.error('基线不存在，先跑一次不带 --check 的')
      process.exit(1)
    }
    const base = JSON.parse(fs.readFileSync(file, 'utf8'))
    let diff = 0
    for (const key of Object.keys(base)) {
      const a = JSON.stringify(base[key])
      const b = JSON.stringify(snap[key])
      if (a !== b) {
        diff += 1
        console.log('')
        console.log('✗ 不一致：' + key)
        // 找第一处不同
        const al = (base[key].result ?? '').split('\n')
        const bl = (snap[key]?.result ?? '').split('\n')
        for (let i = 0; i < Math.max(al.length, bl.length); i += 1) {
          if (al[i] !== bl[i]) {
            console.log('  基线:', JSON.stringify((al[i] ?? '').slice(0, 100)))
            console.log('  现在:', JSON.stringify((bl[i] ?? '').slice(0, 100)))
            break
          }
        }
        if (base[key].errorType !== snap[key]?.errorType) {
          console.log('  errorType:', base[key].errorType, '→', snap[key]?.errorType)
        }
      }
    }
    if (diff === 0) {
      console.log('✓ 快照全部一致（' + Object.keys(base).length + ' 个用例）')
    } else {
      console.log('')
      console.log('共 ' + diff + ' 个用例输出变了')
    }
    process.exit(diff === 0 ? 0 : 1)
  }

  fs.rmSync(home, { recursive: true, force: true })
})()
