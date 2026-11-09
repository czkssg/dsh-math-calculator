/**
 * 公式库完整性验证：**每一条**都必须能实际求值。
 * 这是防止「录入了但算不出来」的关键测试。
 */
const mod = await import('../lib/index.js')
const { FORMULAS } = await import('../lib/formulas.js')
const exec = (a) => mod.runMathTool(a)

console.log(`共 ${FORMULAS.length} 条公式，逐条验证…\n`)

/** 为一条公式生成合理的测试参数（要落在定义域内，否则测试本身失真）。 */
function sampleOverrides(formula) {
  const overrides = {}
  for (const [name, spec] of Object.entries(formula.params)) {
    if (spec.value !== null) continue // 有默认值，不必填
    const desc = spec.desc
    const id = formula.id

    // 特殊约定：这些参数必须落在定义域内，不能随便给数
    if (desc.includes('折射率')) overrides[name] = name === 'n1' ? 1.5 : 1.0
    else if (desc.includes('份额')) overrides[name] = [0.5, 0.3, 0.2]
    else if (desc.includes('数组')) overrides[name] = [0.5, 0.3, 0.2]
    else if (desc.includes('概率')) overrides[name] = [0.5, 0.5]
    else if (desc.includes('摩尔分数')) overrides[name] = 0.5
    else if (desc.includes('反照率')) overrides[name] = 0.3
    else if (desc.includes('效率')) overrides[name] = 0.5
    else if (desc.includes('率') && !desc.includes('功率') && !desc.includes('频率')) overrides[name] = 0.1
    else if (desc.includes('低温') || desc.includes('高温')) overrides[name] = desc.includes('低温') ? 280 : 320
    else if (desc.includes('质量 kg')) overrides[name] = 10
    else if (desc.includes('半径 m')) overrides[name] = 1
    else if (desc.includes('距离 m') || desc.includes('高度 m')) overrides[name] = 10
    else if (desc.includes('时间 s')) overrides[name] = 2
    else if (desc.includes('速度 m/s')) overrides[name] = 5
    else if (desc.includes('温度 K') || desc.includes('温度')) overrides[name] = 300
    else if (desc.includes('压强') || desc.includes(' Pa')) overrides[name] = 100000
    else if (desc.includes('面积')) overrides[name] = 1
    else if (desc.includes('长度') || desc.includes('原长') || desc.includes('跨度')) overrides[name] = 1
    else if (desc.includes('力')) overrides[name] = 10
    else if (desc.includes('频率')) overrides[name] = 440
    else if (desc.includes('电压')) overrides[name] = 12
    else if (desc.includes('电流')) overrides[name] = 2
    else if (desc.includes('电阻')) overrides[name] = 10
    else if (desc.includes('电容')) overrides[name] = 1e-6
    else if (desc.includes('电感')) overrides[name] = 1e-3
    else if (desc.includes('物质的量')) overrides[name] = 1
    else if (desc.includes('体积')) overrides[name] = 1
    else if (desc.includes('摩尔质量')) overrides[name] = 0.028
    else if (desc.includes('密度')) overrides[name] = 1000
    else if (desc.includes('初速度') || desc.includes('末速度')) overrides[name] = 5
    else if (desc.includes('加速度')) overrides[name] = 2
    else if (desc.includes('位移')) overrides[name] = 10
    else if (desc.includes('质量1') || desc.includes('质量2')) overrides[name] = 2
    else if (desc.includes('能量')) overrides[name] = 1000
    else if (desc.includes('人口') || desc.includes('兵力') || desc.includes('种群')) overrides[name] = 1000
    else if (desc.includes('容量')) overrides[name] = 2000
    else if (desc.includes('GDP') || desc.includes('产出') || desc.includes('本金') || desc.includes('收益') || desc.includes('成本')) overrides[name] = 1000
    else if (desc.includes('浓度')) overrides[name] = 0.1
    else if (desc.includes('年数') || desc.includes('年龄')) overrides[name] = 30
    else if (desc.includes('红移')) overrides[name] = 0.1
    else if (desc.includes('°') || desc.includes('cm')) overrides[name] = 180
    else if (desc.includes('kg')) overrides[name] = 10
    else if (desc.includes('m²')) overrides[name] = 1
    else if (desc.includes('m³')) overrides[name] = 1
    else if (desc.includes('m')) overrides[name] = 1
    else if (desc.includes('s')) overrides[name] = 1
    else if (desc.includes('J')) overrides[name] = 100
    else if (desc.includes('W')) overrides[name] = 100
    else if (desc.includes('V')) overrides[name] = 12
    else if (desc.includes('A')) overrides[name] = 2
    else if (desc.includes('Ω')) overrides[name] = 10
    else overrides[name] = 2 // 兜底
  }

  /**
   * ## 按参数名微调：解决「同公式内多个同类参数被填成同一个值」
   *
   * 上面那套按**描述关键词**取值，对单个参数够用，但对「一对相关参数」必然出错：
   *
   * ```
   *   condenser_vacuum_gain   hot=300, cold_old=300, cold_new=300
   *                           → 分母 (300−300)=0 → non_finite
   *   diesel_efficiency       cutoff_ratio=1 → 分母 (rc−1)=0 → non_finite
   * ```
   *
   * 这不是公式错，是**采样器不知道「这几个参数必须不同」**。
   * 所以这里按名字做最后一层修正，让参数落在有意义的相对位置上。
   *
   * 判据：**只调整那些「必须满足某种关系」的参数，且只调整到合理量级**，
   * 不追求精确值 —— 这个测试验的是「能不能算出来」，不是「算得对不对」
   * （后者由各自的专项套件负责）。
   */
  const named = (pattern, value) => {
    for (const key of Object.keys(overrides)) {
      if (pattern.test(key)) overrides[key] = value
    }
  }
  // 冷端必须低于热端
  named(/^hot_/i, 773)
  named(/^cold_.*_old$/i, 373)
  named(/^cold_.*_new$/i, 319)
  // 截断比必须 > 1
  named(/^cutoff_ratio$/i, 2)
  // 压缩比、压比：给个中等值
  named(/^compression_ratio$/i, 10)
  named(/^pressure_ratio$/i, 15)
  /**
   * 焓值组：h_in 必须远大于 h_out，否则分母 (h_in − h_pump_out) 为 0。
   * 取真实循环的量级（进口 2.8e6、冷凝 2e5、泵后 2.01e5）。
   */
  named(/^h_in$/i, 2.8e6)
  named(/^h_out/i, 2.0e5)
  named(/^h_pump/i, 2.01e5)
  // 比热比必须 > 1（默认值存在时不覆盖，这里只兜底）
  return overrides
}

const failures = []
let ok = 0

for (const formula of FORMULAS) {
  const overrides = sampleOverrides(formula)
  let result
  try {
    result = exec({ operation: 'formula', formula: formula.id, overrides })
  } catch (error) {
    failures.push({ id: formula.id, reason: `抛异常: ${error.message}` })
    continue
  }
  if (result.ok) {
    ok++
  } else {
    failures.push({
      id: formula.id,
      reason: `${result.error?.type}: ${result.error?.message}`.slice(0, 110),
    })
  }
}

console.log(`✅ 可求值: ${ok}/${FORMULAS.length}`)
if (failures.length > 0) {
  console.log(`\n❌ 失败 ${failures.length} 条：`)
  for (const f of failures) console.log(`  ${f.id.padEnd(30)} ${f.reason}`)
  process.exitCode = 1
} else {
  console.log('全部公式均可实际求值')
}
