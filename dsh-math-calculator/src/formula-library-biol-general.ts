/**
 * 公式库第十二批：**生物学的通用公式（跨类群/跨尺度/跨世界）**。
 *
 * ## 为什么这一批值得单独成文件
 *
 * 库里原有 31 条生物公式，但**14 条是人类医学/毒理特化**：
 * 血液酒精浓度、儿童剂量、孕期剩余天数、LD50、输液速率 ——
 * 这些对「9000 吨工程生物」这类设定毫无用处，且参数标定与人类解剖强绑定。
 *
 * 这里补的是**任何生命形式都逃不掉的那一层**，判据五条全过：
 *
 * ```
 *   ① 跨类群    不依赖人类解剖
 *   ② 跨尺度    微生物到鲸，跨 10 个数量级
 *   ③ 跨世界    常数显式暴露，形式与地球无关
 *   ④ 有根源    物理/几何/化学/数学，不是拟合的经验系数
 *   ⑤ 参数可得  不需要查专业表就能填
 * ```
 *
 * 第 ⑤ 条最易忽略：**通用幂律数学上能算任何东西，但用户不知道指数填多少，它就成了空壳**。
 * 所以本批凡是幂律类，指数都**内置理论值**并注明出处，不留给用户填。
 *
 * ## 指数从哪来（分清「几何必然」与「网络理论推论」）
 *
 * 这个区分很重要 —— 前者在任何世界都成立（含非碳基），后者依赖「存在分形输运系统」这个前提：
 *
 * ```
 *   2/3  ← 面积/体积的纯几何（无需任何生物假设）
 *   1/4  ← 分形输运网络的最优层级（West-Brown-Enquist）
 *   3/4  ← 分形网络的能量通量（Damuth）
 * ```
 *
 * @module dsh-math-calculator/formula-library-biol-general
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/** 生物通用公式 7 条。 */
export const BIO_GENERAL_FORMULAS: FormulaDef[] = [
  {
    id: 'sa_volume_ratio',
    cat: 'biology/scaling',
    name: '表面积-体积比（几何必然）',
    expr: 'surface_coeff * mass^(2/3)',
    params: {
      mass: req('体重 kg'),
      surface_coeff: p(0.11, '表面积系数（人体约 0.11，即 A ≈ 0.11·M^(2/3)）'),
    },
    unit: 'm²（表面积；除以 mass 即单位体重的表面积）',
    desc: ['A ∝ M^(2/3)，故「面积/体积」∝ M^(−1/3)。**指数 2/3 是纯几何** ——', '任何三维物体体积 ∝ L³、表面积 ∝ L² 都成立，不需要任何生物假设，', '故跨物种、跨世界、甚至非碳基生命都适用。', '★ 一个式子回答巨兽设定的两个核心问题：体重 ×8 → 表面积 ×4 →', '单位体重散热能力 ÷2（为什么会过热）；鳃面积同样只 ×4 → 单位体重摄氧 ÷2（为什么会缺氧）。', '★ Du Bois 那种人体经验式（body_surface_area）外推到 9000 吨必错；', '但这条给的是比例关系 —— 而判断大尺度是否可行，靠的就是比例。'].join(''),
    keys: ['表面积', '体积比', 'SA:V', '平方立方', '巨兽', '表面'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['biology'],
  },
  {
    id: 'fick_diffusion',
    cat: 'biology/transport',
    name: '菲克扩散通量（呼吸/吸收/供氧）',
    expr: 'diffusion_coeff * area * delta_conc / thickness',
    params: {
      diffusion_coeff: req('扩散系数 D m²/s（O₂ 在水中 2e-9、在空气中 2e-5）'),
      area: req('交换面积 m²'),
      delta_conc: req('浓度差或分压差（与 D 单位配套）'),
      thickness: req('屏障厚度 m'),
    },
    unit: '物质通量（与 ΔC·D 的单位配套）',
    desc: ['J = D·A·ΔC/δ。鳃、肺、皮肤吸收、根吸水、细胞膜运输全是同一个式子。', '★ 纯物理，不含物种假设；它也是鳃氧限制理论（GOLT）的根基。', '★ 关键推论：A ∝ M^(2/3)、δ ∝ M^(1/3)，故供氧能力 ∝ M^(1/3) ——', '这就是「大生物必须换气而不能靠扩散」的定量证明。', '★ 与 diffusion_time 配合：前者给通量，后者给「扩散够不够快」。'].join(''),
    keys: ['Fick', '菲克', '扩散', '供氧', '鳃', '通量'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['biology'],
  },
  {
    id: 'diffusion_time',
    cat: 'biology/transport',
    name: '扩散时间标度（尺寸上限的判据）',
    expr: 'distance^2 / (2 * diffusion_coeff)',
    params: {
      distance: req('特征长度 m'),
      diffusion_coeff: req('扩散系数 D m²/s（蛋白在水中约 1e-10）'),
    },
    unit: 's（扩散跨越该距离所需时间）',
    desc: ['t ≈ Δx²/(2D)。布朗运动的数学结论，与是不是生物无关。', '★ 尺寸上限的直接判据（蛋白在水里 D≈1e-10）：', '1 µm → 5 ms ｜ 10 µm → 0.5 s（细胞尺度，够用）｜ 1 mm → 83 min（已不够）｜', '1 m → 158 年（不可能）—— 所以大生物必须有循环系统。', '★ 这条能立刻否掉「靠扩散供氧的巨兽」方案，且用的是硬数学而非估计。'].join(''),
    keys: ['扩散时间', 'diffusion time', '尺寸上限', '布朗运动', '循环系统'],
    frequency: 'high',
    layer: 'derived',
    domains: ['biology'],
  },
  {
    id: 'peclet_number',
    cat: 'biology/transport',
    name: '佩克莱数（扩散 vs 对流）',
    expr: 'length * velocity / diffusion_coeff',
    params: {
      length: req('特征长度 m'),
      velocity: req('流速 m/s'),
      diffusion_coeff: req('扩散系数 D m²/s'),
    },
    unit: '无量纲（Pe ≪ 1 扩散主导；Pe ≫ 1 必须对流）',
    desc: ['Pe = L·u/D。判断「靠扩散够不够、必须不必须对流」的无量纲判据。', '★ 它是 Reynolds 数的**质量输运版**：库里已有 reynolds（动量输运），', '但缺质量输运的对应物 —— 两者成对才有意义。', '★ 实例：毛细血管里血蛋白 v≈0.3 mm/s，微秒尺度扩散位移仅 0.3 nm → 扩散主导；', '大血管 u≈m/s → 对流主导。这解释了为什么微循环靠扩散、大循环必须泵。'].join(''),
    keys: ['Peclet', '佩克莱', '无量纲', '对流扩散', '质量输运'],
    frequency: 'medium',
    layer: 'derived',
    domains: ['biology', 'physics'],
  },
  {
    id: 'hardy_weinberg',
    cat: 'biology/genetics',
    name: '哈迪-温伯格基因型频率',
    expr: 'p^2 + 2 * p * q + q^2',
    params: {
      p: req('等位基因 A 频率（0—1）'),
      q: req('等位基因 a 频率（0—1）'),
    },
    unit: '无量纲（应恒为 1，用于自检与分项计算）',
    desc: ['p² + 2pq + q² = 1。**这是纯概率论结论**（配子随机组合），不需要任何生物机制，', '所以只要「存在等位基因 + 随机交配」它就成立 —— 跨世界完全通用。', '★ 常算的是中间项 2pq：隐性基因的携带者比例。例 p=0.9、q=0.1 → 2pq=18%，', '即每 100 人里有 18 个携带者，而表现型只有 q²=1%。', '★ 若结果明显不等于 1，说明 p+q≠1，输入有误 —— 这是一条自带自检的公式。'].join(''),
    keys: ['Hardy-Weinberg', '哈迪温伯格', '基因频率', '遗传平衡', '携带者'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['biology'],
  },
  {
    id: 'gompertz_growth',
    cat: 'biology/growth',
    name: 'Gompertz 生长曲线',
    expr: 'asymptote * exp(-shape * exp(-rate * t))',
    params: {
      asymptote: req('渐近上限（最终体型/规模）'),
      shape: req('形状参数 b（决定曲线起点位置）'),
      rate: req('早期增长率 c（1/时间）'),
      t: req('时间'),
    },
    unit: '与 asymptote 同单位',
    desc: ['N(t) = a·exp(−b·exp(−c·t))。描述「越大长得越慢」的通用形式。', '★ 比指数与 logistic 更贴合**有机体**的真实生长（logistic 更偏种群）：', '跨动物、植物、细菌、肿瘤都拟合良好。', '★ 三个参数的物理含义：a = 渐近上限，c = 早期增长率，b = 曲线形状与起点。', '★ 跨世界照用：形式通用，系数按对象标定。'].join(''),
    keys: ['Gompertz', '冈珀茨', '生长曲线', '渐近', '生长'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology'],
  },
  {
    id: 'michaelis_menten',
    cat: 'biology/kinetics',
    name: '米氏方程（饱和动力学）',
    expr: 'vmax * substrate / (km + substrate)',
    params: {
      vmax: req('最大速率 Vmax'),
      km: req('半饱和常数 Km（速率达 Vmax/2 时的底物浓度）'),
      substrate: req('底物浓度 S'),
    },
    unit: '与 vmax 同单位（速率）',
    desc: ['v = Vmax·S/(Km+S)。一条式子覆盖五种现象：酶动力学、载体转运、', 'Holling II 型摄食功能反应、受体结合、土壤养分吸收 —— 因为它们都是同一个', '「先线性、再饱和」的双曲线形式。', '★ 结构性质：S ≪ Km 时 v ≈ (Vmax/Km)·S（线性）；S ≫ Km 时 v → Vmax（饱和）。', '这个「处理能力有限必然饱和」是所有系统的共同特征。', '★ 与 q10_temperature 配合：前者管底物，后者管温度上限。'].join(''),
    keys: ['Michaelis', '米氏', 'Km', 'Vmax', '酶', '饱和', 'Holling'],
    frequency: 'high',
    layer: 'fundamental',
    domains: ['biology'],
  },
  {
    id: 'q10_temperature',
    cat: 'biology/kinetics',
    name: 'Q₁₀ 温度系数（生物代谢的温度律）',
    expr: 'rate_ref * q10^((temperature - temp_ref) / 10)',
    params: {
      rate_ref: req('参考温度下的速率'),
      q10: p(2.5, 'Q₁₀ 系数（跨类群常见 2~3）'),
      temperature: req('实际温度'),
      temp_ref: req('参考温度'),
    },
    unit: '与 rate_ref 同单位（速率）',
    desc: ['R(T) = R₀·Q₁₀^((T−T₀)/10)。温度每升高 10 度，速率变为 Q₁₀ 倍。', '★ 这是**生物系统实际使用的温度律**：生态模型几乎都用它，', '因为不需要活化能 Ea（那要查专业表）。', '★ 与库里已有的 arrhenius（化学式，要 Ea）并存而不替代：', '化学场景用 Arrhenius，生物场景用 Q₁₀ —— 同一条规律的两种学科参数化。', '★ Q₁₀ 跨类群很稳（2~3），这是它比 Arrhenius 更好用的原因。'].join(''),
    keys: ['Q10', '温度系数', '代谢温度', '温度律', '生态模型'],
    frequency: 'high',
    layer: 'phenomenological',
    domains: ['biology'],
  },
]
