/**
 * 公式库第八批：**普适版经验式**（把烘焙的常数拆出来，让它们随世界变）。
 *
 * ## 这一批解决什么问题
 *
 * 前七批里有一批经验公式把常数**烘焙进了系数**：
 *
 *   船舶极限航速 = 1.34 × sqrt(L)     ← 1.34 里藏着 g = 9.81
 *   宜居带内边界 = sqrt(L / 1.1)      ← 1.1 是「地球温室条件下的辐照阈值」
 *   硬度估强度  = 3 × H × 9.80665e6   ← 9.8 是地球重力换算
 *
 * 它们在**地球**上对，但作者写 1.5 倍重力的星球时照抄就会错，而且错得隐蔽
 * （数字看着正常，只是用了地球的常数）。
 *
 * 本批把这些式子重写成**显式暴露物理量**的形式：
 *
 *   hull_speed_generic      = Fr × sqrt(g × L) × 1.944    ← g 由 world 给出
 *   habitable_inner_generic = sqrt(L / (flux × S0))       ← S0 由 L☉/AU 推出
 *   hardness_yield_generic  = 3 × H × g / 1e-6 × 1e6      ← g 可替换
 *
 * ## 与旧版并存，不是替换
 *
 * 旧的 `hull_speed`（1.34）**保留**：作者要写地球上的船时它更快更省事，
 * 而且那是船舶工程界的标准式。新版只是给「非地球重力」的场景一个正确入口。
 * 两版的 desc 都写明适用域，让作者知道该用哪个。
 *
 * ## 单位约定
 *
 * 同前几批：**SI 基本单位**，但保留各村行业惯用单位（节、kgf/mm²）并在参数说明里写明。
 *
 * @module dsh-math-calculator/formula-library-generic
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/**
 * 第八批公式：把烘焙常数拆出来的普适形式。
 */
export const GENERIC_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 船舶与流体：把 g 从系数里拆出来
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'hull_speed_generic',
    cat: 'perception/travel',
    name: '船舶极限航速（普适版，可换重力）',
    expr: 'froude * sqrt(g * length) * 1.944',
    params: {
      froude: p(0.4, '兴波极限 Froude 数（无量纲，约 0.4）'),
      g: p(9.80665, '地表重力 m/s²（由 world 给出；地球 9.81）'),
      length: req('水线长 m'),
    },
    unit: 'kn（节）',
    desc:
      '排水型船的兴波极限速度。**这是 hull_speed 的普适版**：那个版本的 1.34 ' +
      '把 g=9.81 烘焙进了系数，只在 1 g 世界成立。1.5 g 世界里同一艘 100 m 的船' +
      '极限航速是 29.8 节而非 24.4 节（快 22%）。Froude ≈ 0.4 是经验值，' +
      '再快就得上滑行艇或水翼。',
    keys: ['hull speed', '航速', 'Froude', '兴波', '船速'],
    frequency: 'high',
    layer: 'derived',
    domains: ['physics', 'engineering'],
  },
  {
    id: 'froude_number',
    cat: 'physics/fluid',
    name: 'Froude 数',
    expr: 'v / sqrt(g * length)',
    params: {
      v: req('特征速度 m/s'),
      g: p(9.80665, '重力 m/s²'),
      length: req('特征长度 m'),
    },
    unit: '无量纲',
    desc:
      '惯性力与重力之比。船舶 Fr < 0.4 为排水航行，> 0.4 进入过渡态，' +
      '> 1 才可能滑行（需要极大功率）。这是判断「这艘船能不能更快」的核心无量纲数。',
    keys: ['froude', '弗劳德数', '兴波阻力'],
    frequency: 'medium',
    layer: 'fundamental',
    domains: ['physics', 'engineering'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 宜居带：把太阳常数显式化
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'habitable_zone_generic',
    cat: 'physics/astronomy',
    name: '宜居带边界（普适版，显式用辐照阈值）',
    expr: 'sqrt(luminosity / flux_ratio)',
    params: {
      luminosity: p(1, '恒星光度（太阳 = 1）'),
      flux_ratio: p(1.1, '内边界处的辐照阈值（地球温室条件下约 1.1 倍地球辐照）'),
    },
    unit: 'AU',
    desc:
      'innerAU = sqrt(L / f)，其中 f 是「该边界处的辐照是地球的几倍」。' +
      '原式 `sqrt(L/1.1)` 的 1.1 就是 f —— 现在它是可替换参数。' +
      '强温室行星（如金星式）的 f 可以远小于 1.1；真空岩石行星则要大得多。' +
      '**solar_flux_at_1au** 用来把 W/m² 换算成 f。',
    keys: ['habitable zone', '宜居带', '辐照阈值', 'HZ'],
    frequency: 'high',
    layer: 'derived',
    domains: ['astronomy'],
  },
  {
    id: 'solar_flux_at_1au',
    cat: 'physics/astronomy',
    name: '太阳常数（由光度与距离推出）',
    expr: 'luminosity * 1361',
    params: {
      luminosity: p(1, '恒星光度（太阳 = 1）'),
    },
    unit: 'W/m²',
    desc:
      '太阳常数 1361 W/m² 是「1 L☉ 在 1 AU 处的辐照」——可由 ' +
      'L☉/(4π·AU²) 严格算出（得 1362 W/m²，观测值 1361，差 0.07%）。' +
      '换成任意距离用 inverse_square_flux。',
    keys: ['solar constant', '太阳常数', '辐照'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['astronomy'],
  },
  {
    id: 'inverse_square_flux',
    cat: 'physics/astronomy',
    name: '辐照随距离的平方反比',
    expr: 'flux0 * (distance0 / distance)^2',
    params: {
      flux0: req('参考点辐照 W/m²'),
      distance0: req('参考距离（可与 distance 同单位）'),
      distance: req('目标距离'),
    },
    unit: 'W/m²',
    desc:
      '同一颗恒星在不同距离的辐照。这是「为什么热木星会被烧」的第一性依据，' +
      '也是宜居带宽度 ∝ √L 的来源（辐照 ∝ 1/r²，所以要维持同样辐照，r ∝ √L）。',
    keys: ['inverse square', '平方反比', '辐照衰减'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['physics', 'astronomy'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 材料：把重力换算拆出来
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'hardness_yield_generic',
    cat: 'materials/structures',
    name: '硬度估屈服强度（普适版，可换重力）',
    expr: 'k * hardness * g',
    params: {
      k: p(3, '硬度-强度比例系数（经验，约 3）'),
      hardness: req('布氏/维氏硬度（kgf/mm²）'),
      g: p(9.80665, '地表重力 m/s²（地球 9.81）'),
    },
    unit: 'MPa',
    desc:
      'σy ≈ k·HB（比例 π 是无量纲经验），单位换算里含 g。' +
      '原式的 9.80665e6 就是「kgf/mm² → Pa」的换算，含地球重力。' +
      '换重力时这 9.8 要跟着变（1.5 g 世界同样硬度值对应 1.5 倍 Pa）。' +
      'σy≈3HB 本身误差可达 30%，只作量级估算。',
    keys: ['hardness', '屈服强度', '硬度换算'],
    frequency: 'medium',
    layer: 'phenomenological',
    domains: ['materials'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 代谢与散热：幂律是普适的，系数不是
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'metabolic_generic',
    cat: 'biology/physiology',
    name: '代谢率（普适幂律，系数可换）',
    expr: 'k * mass^exponent',
    params: {
      k: p(70, '代谢系数，单位 kcal/day·kg^0.75（地球哺乳类约 70）'),
      mass: req('体重 kg'),
      exponent: p(0.75, '标度指数（分形输运网络 → 0.75）'),
    },
    unit: 'kcal/day',
    desc:
      '克莱伯定律的显式形式 BMR = k·M^0.75。**注意 k 的量纲含 kg^0.75**：' +
      'k=70 时，70 kg 的人得 1694 kcal/day（约 70×70^0.75），不是 70 kcal —— ' +
      '70 这个数常被误读成「人的代谢率」，其实是「1 kg 基准下的系数」。' +
      '**指数 0.75 是无量纲的、跨世界应成立**（分形输运网络的最优标度）；' +
      '系数 k 是地球生物标定，会因生物化学与体温不同而变。' +
      '异星生物改 k 即可，不必改指数。这比 Mifflin 那种线性拟合式通用得多。',
    keys: ['metabolism', '代谢', 'Kleiber', '异速生长'],
    frequency: 'high',
    layer: 'derived',
    domains: ['biology'],
  },
  {
    id: 'convective_cooling_generic',
    cat: 'biology/physiology',
    name: '对流散热系数（普适版，含大气密度）',
    expr: '10 * sqrt(v) * (density / 1.225)^0.8',
    params: {
      v: p(1, '风速 m/s'),
      density: p(1.225, '大气密度 kg/m³（地球 1.225；0.1 atm 约 0.12）'),
    },
    unit: 'W/(m²·K)',
    desc:
      '对流换热系数的量级估计。**这是「风寒/酷热感」的物理内核**：' +
      '经验公式（风寒指数）把人体与地球大气烘焙进了系数，换世界就失效；' +
      '而这个幂律形式 h ∝ v^0.5 · ρ^0.8 是流体力学标度，跨世界成立。' +
      '稀薄大气（0.1 atm）里散热系数只有地球的约 15% —— 这就是「真空里不觉得冷」的原因。',
    keys: ['convection', '对流', '散热', '大气密度'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['physics', 'biology'],
  },
  {
    id: 'evaporation_saturation_generic',
    cat: 'physics/thermo',
    name: '饱和蒸气压（Clausius-Clapeyron，可换溶剂）',
    expr: 'p0 * exp(-latent / R * (1 / T - 1 / T0))',
    params: {
      p0: p(101325, '参考温度下的饱和蒸气压 Pa'),
      latent: p(40650, '汽化潜热 J/mol（水 40650；氨约 23400）'),
      R: p(8.31446261815324, '气体常数 J/(mol·K)'),
      T0: p(373.15, '参考温度 K（水的常压沸点）'),
      T: req('温度 K'),
    },
    unit: 'Pa',
    desc:
      '饱和蒸气压的普适形式。**这是露点、沸点、蒸发的底层物理**：' +
      'Magnus 经验式（243.04 那些数）只是把这个式子在水附近拟合的近似；' +
      '而本式换溶剂只需改 latent（氨、甲烷、硫酸都有各自的值）。' +
      '这也是「为什么高海拔沸点低」的第一性解释。',
    keys: ['saturation', '饱和蒸气压', 'Clausius', '沸点', '露点'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['physics', 'chemistry'],
  },
]
