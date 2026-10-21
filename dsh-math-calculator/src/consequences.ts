/**
 * 常数改动的长链后果。
 *
 * 上一层的 constants-graph 只做「有精确代数关系」的耦合（改 c → mu0 跟着变）。
 * 但真实物理里还有大量**跨尺度的连锁反应**：改 G 会影响恒星寿命，
 * 改 alpha_fs 会让碳无法合成，改 me 会让原子变大。
 *
 * 这些没有简单闭式解，只能查文献里的经验关系。本模块收录它们，
 * 并**明确标注每一级的可信度**：
 *
 *   exact       —— 严格代数关系，误差可忽略
 *   empirical   —— 文献拟合公式，有 1~2 个数量级的不确定性
 *   qualitative —— 只能给方向，不给数字
 *
 * 对文学创作来说，empirical 级的量级足够用了；
 * qualitative 级则提醒作者「这里会出问题，但别指望数字准」。
 *
 * @module dsh-math-calculator/consequences
 */

/** 后果的可信度。 */
export type Confidence = 'exact' | 'empirical' | 'qualitative'

/** 一条后果。 */
export interface Consequence {
  /** 名称。 */
  name: string
  /** 分类。 */
  category: 'stellar' | 'atomic' | 'chemical' | 'planetary' | 'human'
  /** 可信度。 */
  confidence: Confidence
  /** 使用的公式（展示用）。 */
  formula: string
  /** 当前值。 */
  value: number
  /** 现实基线值。 */
  baseline: number
  /** 相对现实的倍数。 */
  ratio: number
  /** 一句话说明。 */
  description: string
  /** 不确定性 / 适用范围说明。 */
  note?: string
}

/** 现实基线常数（用于比较）。 */
const BASELINE = {
  c: 299792458,
  G: 6.6743e-11,
  h: 6.62607015e-34,
  kB: 1.380649e-23,
  e_charge: 1.602176634e-19,
  me: 9.1093837015e-31,
  mp: 1.67262192369e-27,
  epsilon0: 8.8541878128e-12,
  Mearth: 5.9722e24,
  Rearth: 6371000,
  Msun: 1.98892e30,
  Rsun: 695700000,
  year: 31557600,
  day: 86400,
}

/** 由常数推算 alpha_fs（精细结构常数）。 */
function fineStructure(v: Record<string, number>): number {
  const hbar = v.hbar ?? v.h / (2 * Math.PI)
  return (v.e_charge ** 2) / (4 * Math.PI * v.epsilon0 * hbar * v.c)
}

/**
 * 分析常数改动带来的长链后果。
 *
 * @param values - 当前生效的常数
 * @returns 后果列表（已按重要性排序，变化小的会被过滤）
 */
export function analyzeConsequences(values: Record<string, number>): Consequence[] {
  const out: Consequence[] = []
  const hbar = values.hbar ?? values.h / (2 * Math.PI)
  const alphaNow = fineStructure(values)
  const alphaBase = fineStructure({
    ...BASELINE,
    hbar: BASELINE.h / (2 * Math.PI),
  })

  const ratioOf = (now: number, base: number): number => (base === 0 ? 1 : now / base)

  // ══════════════════════════════════════════════════════════════
  // 一、恒星：寿命与光度
  // ══════════════════════════════════════════════════════════════
  //
  // 采用 Eddington 标度：主序星 L ∝ G⁴M³（辐射扩散 + 流体静力学平衡）。
  // 于是寿命 τ = 可用核能/光度 ∝ M G⁻⁴M⁻³ = G⁻⁴M⁻²。
  //
  // 文献里 G 的指数在 -3 到 -4 之间（取决于不透明度来源），
  // 这里取 -3.5 作为中值，并在 note 里说明不确定性。
  {
    const gRatio = values.G / BASELINE.G
    const solarLifetimeGyr = 10
    // 太阳质量恒星的寿命
    const lifetime = solarLifetimeGyr * Math.pow(gRatio, -3.5)
    out.push({
      name: '太阳质量恒星的主序寿命',
      category: 'stellar',
      confidence: 'empirical',
      formula: 'τ ≈ 10 Gyr × (G/G₀)^-3.5',
      value: lifetime,
      baseline: solarLifetimeGyr,
      ratio: ratioOf(lifetime, solarLifetimeGyr),
      description:
        Math.abs(lifetime - solarLifetimeGyr) < 0.5
          ? `约 ${lifetime.toFixed(1)} 亿年量级，与现实太阳相近。`
          : lifetime > solarLifetimeGyr
            ? `恒星寿命延长到约 ${(lifetime * 10).toFixed(0)} 亿年——演化极慢，文明有极长的时间窗口。`
            : `恒星寿命缩短到约 ${(lifetime * 10).toFixed(1)} 亿年——在生命出现之前就可能耗尽燃料。`,
      note: 'Eddington 标度，G 的指数在 -3~-4 之间取值，结果有约 1 个数量级的不确定性。',
    })
  }

  {
    // 恒星光度 L ∝ G⁴（对同质量恒星）
    const gRatio = values.G / BASELINE.G
    const luminosityRatio = Math.pow(gRatio, 4)
    out.push({
      name: '同类恒星的光度',
      category: 'stellar',
      confidence: 'empirical',
      formula: 'L/L₀ ≈ (G/G₀)^4',
      value: luminosityRatio,
      baseline: 1,
      ratio: luminosityRatio,
      description:
        Math.abs(luminosityRatio - 1) < 0.1
          ? '光度与现实相近。'
          : luminosityRatio > 1
            ? `恒星亮 ${luminosityRatio.toFixed(1)} 倍——行星必须离得更远才不焦灼。`
            : `恒星暗到现实的 ${(luminosityRatio * 100).toFixed(0)}%——行星必须离得更近，易被潮汐锁定。`,
      note: '仅对同质量主序星成立；实际恒星的光度还强烈依赖质量（∝M³·⁵）与金属丰度。',
    })
  }

  // 宜居带距离 ∝ √L
  {
    const gRatio = values.G / BASELINE.G
    const luminosityRatio = Math.pow(gRatio, 4)
    const hzRatio = Math.sqrt(luminosityRatio)
    out.push({
      name: '宜居带距离（相对现实）',
      category: 'planetary',
      confidence: 'empirical',
      formula: 'd_HZ ∝ √L ∝ (G/G₀)²',
      value: hzRatio,
      baseline: 1,
      ratio: hzRatio,
      description:
        Math.abs(hzRatio - 1) < 0.05
          ? '宜居带位置与现实相同。'
          : hzRatio > 1
            ? `宜居带外移到现实的 ${hzRatio.toFixed(2)} 倍处（约 ${hzRatio.toFixed(2)} AU）。`
            : `宜居带内缩到现实的 ${hzRatio.toFixed(2)} 倍处（约 ${hzRatio.toFixed(2)} AU）——行星更易被恒星潮汐锁定。`,
      note: '按 L^(1/2) 标度，忽略行星大气与恒星光谱差异。',
    })
  }

  // 轨道周期（1AU 处）∝ G^-1/2
  {
    const gRatio = values.G / BASELINE.G
    const periodRatio = Math.pow(gRatio, -0.5)
    if (Math.abs(periodRatio - 1) > 0.02) {
      out.push({
        name: '同轨道半径处的公转周期',
        category: 'planetary',
        confidence: 'exact',
        formula: 'T ∝ 1/√G',
        value: periodRatio,
        baseline: 1,
        ratio: periodRatio,
        description:
          periodRatio > 1
            ? `公转变慢到现实的 ${periodRatio.toFixed(2)} 倍——一年更长。`
            : `公转加快到现实的 ${periodRatio.toFixed(2)} 倍——一年更短。`,
      })
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 二、原子尺度与化学键
  // ══════════════════════════════════════════════════════════════
  //
  // 玻尔半径 a₀ = ħ/(me·c·α) ∝ 1/(me·α)
  {
    const meRatio = values.me / BASELINE.me
    const bohrRatio = 1 / (meRatio * (alphaNow / alphaBase))
    if (Math.abs(bohrRatio - 1) > 0.01) {
      out.push({
        name: '原子半径（玻尔半径）',
        category: 'atomic',
        confidence: 'exact',
        formula: 'a₀ = ħ/(me·c·α) ∝ 1/(me·α)',
        value: bohrRatio,
        baseline: 1,
        ratio: bohrRatio,
        description:
          bohrRatio > 1
            ? `原子变大 ${bohrRatio.toFixed(2)} 倍——物质更「松」，密度下降，化学反应的空间位阻变大。`
            : `原子缩小到 ${bohrRatio.toFixed(2)} 倍——物质更致密，但电子被绑紧、化学活性下降。`,
      })
    }
  }

  // 里德堡能量（化学键能标尺）Ry ∝ me·α²·c²... 实际 ∝ me·e⁴/(ε₀²h²)
  {
    const ryNow =
      (values.me * values.e_charge ** 4) /
      (8 * values.epsilon0 ** 2 * values.h ** 2)
    const ryBase =
      (BASELINE.me * BASELINE.e_charge ** 4) /
      (8 * BASELINE.epsilon0 ** 2 * BASELINE.h ** 2)
    const ryRatio = ryNow / ryBase

    if (Math.abs(ryRatio - 1) > 0.01) {
      out.push({
        name: '化学键能量（里德堡能量标尺）',
        category: 'chemical',
        confidence: 'exact',
        formula: 'Ry = me·e⁴/(8·ε₀²·h²)',
        value: ryRatio,
        baseline: 1,
        ratio: ryRatio,
        description:
          ryRatio > 1
            ? `化学键强 ${ryRatio.toFixed(2)} 倍——分子更稳定、熔点更高，但断裂需要的能量也更多。`
            : `化学键弱到 ${(ryRatio * 100).toFixed(0)}%——分子易分解，复杂有机分子可能无法在常温下存在。`,
      })
    }
  }

  // 化学反应速率：Arrhenius 敏感性
  //
  // 这是最惊人的一条：Ea ~ 1 eV 的典型反应在 300K 下，
  // 键能变化 10% 就能让速率改变好几个数量级。
  {
    const ryNow =
      (values.me * values.e_charge ** 4) /
      (8 * values.epsilon0 ** 2 * values.h ** 2)
    const ryBase =
      (BASELINE.me * BASELINE.e_charge ** 4) /
      (8 * BASELINE.epsilon0 ** 2 * BASELINE.h ** 2)
    const ryRatio = ryNow / ryBase
    const kB = values.kB
    const T = 300
    // 典型活化能 0.7 eV
    const activationBase = 0.7 * 1.602176634e-19
    const activationNow = activationBase * ryRatio
    const rateBase = Math.exp(-activationBase / (kB * T))
    const rateNow = Math.exp(-activationNow / (kB * T))
    const rateRatio = rateNow / rateBase

    // 只在变化显著时才报告（否则数量级爆炸会淹没输出）
    if (rateRatio > 3 || rateRatio < 1 / 3) {
      const orders = Math.log10(rateRatio)
      out.push({
        name: '室温下的化学反应速率',
        category: 'chemical',
        confidence: 'empirical',
        formula: 'k ∝ exp(-Ea/(kB·T))，Ea ∝ Ry',
        value: rateRatio,
        baseline: 1,
        ratio: rateRatio,
        description:
          rateRatio > 1
            ? `化学反应快 ${Math.abs(orders) > 0.5 ? `约 ${orders.toFixed(1)} 个数量级` : `${rateRatio.toFixed(1)} 倍`}——新陈代谢极快，寿命可能很短。`
            : `化学反应慢 ${Math.abs(orders) > 0.5 ? `约 ${Math.abs(orders).toFixed(1)} 个数量级` : `${(1 / rateRatio).toFixed(1)} 倍`}——常温下几乎冻结，生命可能依赖催化或极高温。`,
        note: '以 300K、活化能 0.7eV 的典型反应为例。指数敏感性意味着极小变化也有巨大效应。',
      })
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 三、人类学约束：碳能否合成
  // ══════════════════════════════════════════════════════════════
  //
  // Oberhummer 等（2000）的经典结论：三α过程依赖 7.65MeV 的 Hoyle 共振，
  // 精细结构常数偏离约 4% 时，碳/氧比例会严重失衡。
  {
    const alphaDelta = alphaNow / alphaBase - 1
    if (Math.abs(alphaDelta) > 0.005) {
      const critical = Math.abs(alphaDelta) > 0.04
      out.push({
        name: '碳的合成（三α过程）',
        category: 'chemical',
        confidence: 'empirical',
        formula: 'Hoyle 共振对 α 的敏感性，临界值约 |Δα/α| ≈ 4%',
        value: alphaDelta,
        baseline: 0,
        ratio: 1 + alphaDelta,
        description: critical
          ? `精细结构常数偏离了 ${(alphaDelta * 100).toFixed(1)}%，**超过文献给出的约 4% 临界值**：` +
            '恒星核合成可能无法产出足够的碳，基于碳基化学的生命大概率不存在。'
          : `精细结构常数偏离 ${(alphaDelta * 100).toFixed(1)}%，尚在 4% 临界值内，碳仍可正常合成。`,
        note: 'Oberhummer et al. 2000 的量级结论；真实核合成还依赖强相互作用强度。',
      })
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 四、人体尺度：重力带来的直接感受
  // ══════════════════════════════════════════════════════════════
  {
    const gRatio = values.g / (BASELINE.G * BASELINE.Mearth / BASELINE.Rearth ** 2)
    if (Math.abs(gRatio - 1) > 0.05) {
      // 跳跃高度 ∝ 1/g
      out.push({
        name: '跳跃高度（同等人力输出）',
        category: 'human',
        confidence: 'exact',
        formula: 'h ∝ 1/g',
        value: 1 / gRatio,
        baseline: 1,
        ratio: 1 / gRatio,
        description:
          gRatio > 1
            ? `只能跳到现实的 ${((1 / gRatio) * 100).toFixed(0)}%——坠落更致命，攀爬极费力。`
            : `能跳到现实的 ${(1 / gRatio).toFixed(1)} 倍高——坠落伤害小，但制动更难，容易失控。`,
      })

      // 生物体型上限 ∝ 1/g（平方立方定律的推论）
      out.push({
        name: '陆生生物体型上限',
        category: 'human',
        confidence: 'empirical',
        formula: 'L_max ∝ 1/g（平方-立方定律）',
        value: 1 / gRatio,
        baseline: 1,
        ratio: 1 / gRatio,
        description:
          gRatio > 1
            ? `最大体型收缩到现实的 ${((1 / gRatio) * 100).toFixed(0)}%——高重力世界不会有巨型生物。`
            : `最大体型可放大到现实的 ${(1 / gRatio).toFixed(1)} 倍——低重力世界可能出现真正的巨兽。`,
        note: '只考虑承重约束，未计入散热、耗氧、血压等限制（那些往往更严格）。',
      })
    }
  }

  // 大气能否保留：逃逸速度 vs 热运动速度
  //
  // 注意量纲：热运动速度用 v_rms = √(3RT/M)，
  //   R 是摩尔气体常数 8.314，M 是摩尔质量 kg/mol。
  // 早先误写成 √(3kBT/M) —— kB 是单分子常数，搭配摩尔质量就差了 NA 倍，
  // 算出 0.00 的速度、比值变成 1e13 的荒谬数字。
  //
  // 判据说明（Jeans escape）：v_esc > 6·v_thermal 才能长期保留**某一种**气体。
  // 场景要分开看：
  //   地球 N₂（M=0.028）比值约 22 → 保留
  //   地球 H₂（M=0.002）比值约 5.9 → 逃逸
  // 所以不能笼统说"大气保得住"，要按主要成分判断。
  {
    const R_GAS = (values.kB ?? BASELINE.kB) * (values.NA ?? 6.02214076e23)
    const vEscape = Math.sqrt((2 * values.G * values.Mearth) / values.Rearth)
    const baseEscape = Math.sqrt((2 * BASELINE.G * BASELINE.Mearth) / BASELINE.Rearth)

    // 主成分（氮气）与轻气体（氢气）分别判断
    const heavyM = 0.028 // N₂
    const lightM = 0.002 // H₂
    const heavyRatio = vEscape / Math.sqrt((3 * R_GAS * 288) / heavyM)
    const lightRatio = vEscape / Math.sqrt((3 * R_GAS * 288) / lightM)
    const heavyBase = baseEscape / Math.sqrt((3 * BASELINE.kB * 6.02214076e23 * 288) / heavyM)
    const lightBase = baseEscape / Math.sqrt((3 * BASELINE.kB * 6.02214076e23 * 288) / lightM)

    if (Math.abs(heavyRatio / heavyBase - 1) > 0.1 || Math.abs(lightRatio / lightBase - 1) > 0.1) {
      const heavyLost = heavyRatio < 6
      const lightLost = lightRatio < 6
      out.push({
        name: '大气保留能力（按气体成分）',
        category: 'planetary',
        confidence: 'empirical',
        formula: 'Jeans 判据：v_esc > 6·v_thermal（按每种气体单独判断）',
        value: heavyRatio,
        baseline: heavyBase,
        ratio: heavyRatio / heavyBase,
        description:
          heavyLost && lightLost
            ? `氮气比值 ${heavyRatio.toFixed(1)}、氢气 ${lightRatio.toFixed(1)}，均低于阈值 6——` +
              '连重气体都会逃逸，这个世界难以维持任何大气。'
            : heavyLost
              ? `氢气比值降到 ${lightRatio.toFixed(1)} 以下，重气体尚存（氮 ${heavyRatio.toFixed(1)}）。`
              : lightLost
                ? `重气体保得住（氮 ${heavyRatio.toFixed(1)}），但轻气体（氢 ${lightRatio.toFixed(1)}）会被吹散——` +
                  '大气会逐渐富集重成分。'
                : `重气体比值 ${heavyRatio.toFixed(1)}、轻气体 ${lightRatio.toFixed(1)}，都比现实更稳固。`,
        note:
          '现实地球：氮约 22（保留）、氢约 5.9（逃逸）。阈值 6 是量级判据，真实逃逸还取决于磁场、温度剖面与涡流扩散。',
      })
    }
  }

  // 只返回有意义的后果（比值偏离 1 超过 1%）
  return out.filter((c) => {
    if (c.confidence === 'qualitative') return true
    return Math.abs(c.ratio - 1) > 0.01
  })
}
