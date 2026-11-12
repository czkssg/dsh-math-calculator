/**
 * 计算引擎：mathjs + 单位适配。
 *
 * ## 引擎只做三件事
 *
 * ```
 *   ① 建 mathjs 实例（带安全边界）
 *   ② 把表达式里的中文单位归一成符号（`1 里` → `1 li`）
 *   ③ 求值并把结果收敛成统一形态
 * ```
 *
 * **领域逻辑一律不进这里** —— 星球推演、编制树、账本闭合都在 `features/` 下。
 *
 * ## 安全边界（这些是老代码踩出来的，必须保留）
 *
 * ```
 *   ✗ 删掉 import / createUnit / parse 的动态执行能力   ← createUnit 是任意代码入口
 *   ✗ 禁用 Math 命名空间（`Math.min` 不认，但给出可操作提示）
 *   ✓ 表达式长度上限（防止超长输入拖死）
 * ```
 *
 * 为什么删 `createUnit`：它允许运行时注册单位，而注册体是**函数**，
 * 等于把任意代码执行权交出去。这是本项目唯一主动放弃的能力。
 */

import { create, all, type MathJsInstance } from 'mathjs'
import { CalcError, normalizeError } from './errors.js'
import { registerCjkUnits } from './cjk-units.js'
import { registerEraUnits, normalizeEraUnit } from './units-era-registry.js'
import { registerImperialUnits } from './units-imperial-registry.js'
import { fixUnitAmbiguity } from './unit-ambiguity.js'

/** 表达式长度上限（字符）。超过就拒绝，而不是慢慢算。 */
const MAX_EXPRESSION_LENGTH = 10_000

/**
 * 中文单位 → 符号别名。
 *
 * ## 为什么在引擎层做归一，而不是在 units 操作里
 *
 * 因为**所有**操作都可能出现中文单位：`evaluate` 里写 `1 里 + 3 米`、
 * `formula` 的 overrides 里写 `s:"60 里"`。若只在 units 操作里做，
 * 别处就会报 `Undefined symbol 里`。
 *
 * ## 只收单字/短词，不收复合
 *
 * 复合单位（`米/秒`）不在这里处理 —— 那交给 ucum 适配层，
 * 因为它要走真正的单位解析而不是字符串替换。
 *
 * **替换顺序很重要**：长词优先（`平方公里` 必须在 `平方` 与 `公里` 之前），
 * 否则会被拆错。老代码在这里出过 `公里` 被拆成 `公` + `里` 的 bug。
 */
const CJK_UNIT_ALIASES: Array<[string, string]> = [
  /**
   * ## ⚠ 市制必须放在最前面
   *
   * 老数据里有个 `市尺_古`（32 cm，明清营造尺），
   * 而 1929 市制的「市尺」是 33.33 cm。**两者差 4%**。
   *
   * 若把老数据放前面，`1 市尺 to cm` 会得到 32 —— 那是错的，
   * 因为「市尺」这个词在现代语境里指 1929 市制。
   *
   * 所以市制放在最前，老的营造尺改叫「营造尺」。
   */
  ['市顷', 'cnqingmarket'], ['市担', 'cndanmarket'],
  ['市分地', 'cnfenarea'], ['市厘地', 'cnliarea'], ['市毫地', 'cnhaoarea'],
  ['市分重', 'cnfenmass'], ['市厘重', 'cnlimass'],
  ['市毫重', 'cnhaomass'], ['市丝重', 'cnsimass'],
  ['市尺', 'cnshichi'], ['市寸', 'cncunmarket'], ['市分', 'cnfenlength'],
  ['市厘', 'cnlilength'], ['市毫', 'cnhaolength'], ['市丝', 'cnsilength'],
  ['市斤', 'cnjinmarket'], ['市两', 'cnliangmarket'], ['市钱', 'cnqian'],
  ['市升', 'cnshengmarket'], ['市合', 'cnhe'], ['市勺', 'cnshao'], ['市撮', 'cncuo'],
  ['市斗', 'cndoumarket'], ['市石', 'cndanvolume'],
  ['市亩', 'cnmumarket'],

  // 长度（长的放前面）
  ['平方公里', 'km2'], ['平方千米', 'km2'], ['平方米', 'm2'], ['平方厘米', 'cm2'],
  ['立方公里', 'km3'], ['立方米', 'm3'], ['立方厘米', 'cm3'],
  /**
   * ⚠ 基础单位（`米`/`克`/`秒`）必须在长词之后 ——
   * 否则「公里」会先被 `里` 匹配掉。
   *
   * 第一版漏了 `米`/`秒` 这几个裸单位，于是 `1 里 + 3 米` 报语法错：
   * 「米」没被替换，mathjs 当成了未知标识符。
   */
  ['公里', 'km'], ['千米', 'km'], ['厘米', 'cm'], ['毫米', 'mm'], ['米', 'm'],
  ['微米', 'um'], ['纳米', 'nm'],
  ['英里', 'mi'], ['英尺', 'ft'], ['英寸', 'inch'], ['码', 'yd'],
  /**
   * ## ⚠ 中文古制单位必须加 `cn_` 前缀
   *
   * 实测：`li` 在 mathjs 里是 **link（测链，0.201168 m）** ——
   * 而中文的「里」是 500 m。不加前缀会被静默算成错值，
   * 这是最危险的一类 bug（数值看着正常）。
   *
   * 加前缀后 `1 里` → `1 cn_li`，与内置单位彻底隔离。
   */
  ['里', 'cnli'], ['丈', 'cnzhang'], ['尺', 'cnchi'], ['寸', 'cncun'],
  // 质量
  ['公斤', 'kg'], ['千克', 'kg'], ['毫克', 'mg'], ['克', 'g'],
  ['吨', 't'], ['斤', 'cnjin'], ['两', 'cnliang'], ['磅', 'lb'], ['盎司', 'oz'],
  // 时间
  ['小时', 'h'], ['分钟', 'min'], ['秒钟', 's'], ['秒', 's'], ['时辰', 'cnshichen'],
  ['天', 'day'], ['周', 'week'], ['年', 'year'],
  // 体积
  ['加仑', 'gal'], ['升', 'L'], ['毫升', 'mL'],
  // 面积
  ['公顷', 'ha'], ['亩', 'cnmu'],
  // 能量与功率
  ['千瓦时', 'kWh'], ['度电', 'kWh'], ['马力', 'hp'], ['千瓦', 'kW'], ['兆瓦', 'MW'],
  ['瓦', 'W'], ['焦耳', 'J'], ['卡路里', 'cal'], ['千卡', 'kcal'],
  // 压强
  ['帕斯卡', 'Pa'], ['千帕', 'kPa'], ['兆帕', 'MPa'], ['巴', 'bar'],
  // 其他
  ['摄氏度', 'degC'], ['度', 'deg'],

  /**
   * ## 英制工业补充（第二批）—— 中文写法 → 清洗后的注册名
   *
   * 注册时下划线会被 `createUnit` 拒绝，所以 `board_foot` 注册成 `boardfoot`。
   * 这里把中文写法直接映射到那个名字。
   *
   * ⚠ 长词优先：「美制液量打兰」必须在「打兰」之前。
   */
  ['板英尺', 'boardfoot'], ['考得', 'cord'], ['层积立方米', 'stere'],
  ['圆密尔', 'circularmil'], ['平方杆', 'squarerod'],
  ['温彻斯特加仑', 'gallonwinchester'],
  ['美制蒲式耳', 'bushelus'], ['美制配克', 'peckus'],
  ['美制干夸脱', 'dryquartus'], ['美制干品脱', 'drypintus'],
  ['美制液量打兰', 'fluiddramus'], ['英制液量打兰', 'fluiddrambr'],
  ['美制量滴', 'minimus'], ['英制量滴', 'minimbr'],
  ['美制茶匙', 'teaspoonus'], ['美制汤匙', 'tablespoonus'], ['美制杯', 'cupus'],
  ['印刷点', 'pointpr'], ['印刷派卡', 'picapr'], ['迪多点', 'didot'], ['西塞罗', 'cicero'],
  ['斯克鲁普', 'scruple'], ['药衡打兰', 'dramap'],
  ['药衡盎司', 'ounceap'], ['药衡磅', 'poundap'],
  ['金衡盎司', 'troyounce'], ['金衡磅', 'troypound'],
  ['特克斯', 'tex'], ['但尼尔', 'denier'],
  ['工程大气压', 'technicalatmosphere'], ['米水柱', 'meterwater'], ['米汞柱', 'metermercury'],
  ['电马力', 'hpelectric'], ['公制马力', 'hpmetric'], ['奈培', 'neper'], ['目数', 'mesh'],
  ['国际英尺', 'fti'], ['美制英尺', 'ftus'], ['英制英尺', 'ftbr'],
  ['冈特链', 'chus'], ['冈特链节', 'lkus'], ['拉姆登链', 'rchus'],
  ['美制英亩', 'acreus'], ['英制英亩', 'acrebr'], ['镇区', 'township'],
  ['常衡盎司', 'ozav'], ['常衡打兰', 'drav'], ['常衡磅', 'lbav'],
  ['长英担', 'lcwtav'], ['短英担', 'scwtav'],
  ['英制品脱', 'pintbr'], ['英制夸脱', 'quartbr'], ['英制及耳', 'gillbr'],
  ['美制及耳', 'gillus'], ['英制液盎司', 'fluidouncebr'], ['美制液盎司', 'fluidounceus'],
]

/**
 * 把中文单位替换成符号。
 *
 * ## 实现方式与一个必须注意的点
 *
 * 用一次扫描 + 长词优先，而不是「逐条 replace」。原因：
 *
 * ```
 *   逐条 replace：'公里' 先被换成 'km'，然后 '里' 的规则又去匹配 'km' 附近 → 乱
 *   单次扫描：    从左到右，每次匹配「当前位置能匹配的最长词」→ 正确
 * ```
 *
 * 替换结果括在括号里（`(1 li)`），避免与相邻符号粘连成新标识符。
 *
 * @param source - 原始表达式
 * @returns 归一后的表达式
 */
export function normalizeUnits(source: string): string {
  if (source === '') return source
  let out = ''
  let i = 0
  /** 按长度降序排一次，保证「最长匹配优先」。 */
  const sorted = [...CJK_UNIT_ALIASES].sort((a, b) => b[0].length - a[0].length)

  while (i < source.length) {
    let matched = false
    for (const [cjk, symbol] of sorted) {
      if (source.startsWith(cjk, i)) {
        /**
         * 只在「前面不是数字、后面不是字母」时才替换吗？
         *
         * 不 —— `1 里` 的「里」前面是空格，`1里` 前面是数字，两种都该换。
         * 真正要防的是「里」作为普通汉字出现在非单位语境（如 `里面`），
         * 但那需要语义理解，本层不做。判据是：**紧跟数字**才算单位。
         */
        const before = out.trimEnd()
        const prevChar = before.length > 0 ? before[before.length - 1] : ''
        const prevIsDigitOrSpace = /\d/.test(prevChar) || prevChar === ''
        /** 只看紧邻的那个字符是不是数字（跨越空格也算）。 */
        let j = out.length - 1
        while (j >= 0 && out[j] === ' ') j -= 1
        const nearest = j >= 0 ? out[j] : ''
        if (prevIsDigitOrSpace || /[\d)\]]/.test(nearest)) {
          out += symbol
          i += cjk.length
          matched = true
          break
        }
      }
    }
    if (!matched) {
      out += source[i]
      i += 1
    }
  }
  return out
}

/**
 * 取出全部别名键，**按长度降序**。
 *
 * 降序是必需的：`清营造尺` 必须比 `清尺` 先匹配，
 * 否则长别名永远匹配不到（会被短别名抢先替换掉半截）。
 *
 * @returns 别名列表
 */
function ERA_ALIAS_KEYS(): string[] {
  const keys: string[] = []
  for (const key of buildAliasList()) keys.push(key)
  return keys.sort((a, b) => b.length - a.length)
}

/**
 * 从注册表取全部别名（不含 `@default@` 内部键）。
 *
 * @returns 别名列表
 */
function buildAliasList(): string[] {
  /**
   * 直接读 `globalThis` 上的注册表，而不用 import 进来的 `ERA_ALIAS`。
   *
   * 原因：`require` 与 `import` 会各自加载一份模块，顶层的 `new Map()`
   * 会有两个实例（实测踩过：注册了 72 条，但这边读到 0 条）。
   * 注册表挂在 `globalThis` 上就是为了跨加载方式共享。
   */
  const holder = globalThis as unknown as Record<string, { alias?: Map<string, string> } | undefined>
  const registry = holder['__dshMathEraUnitRegistry__']
  const alias = registry?.alias
  if (alias === undefined) return []
  const out: string[] = []
  for (const key of alias.keys()) {
    if (key.startsWith('@')) continue
    out.push(key)
  }
  return out
}

/**
 * 把表达式里的「时代 + 单位」写法替换成注册名。
 *
 * ## 为什么单独一步，且必须在普通单位归一之前
 *
 * ```
 *   输入：  1 汉尺 to cm
 *   若先跑普通归一：「尺」被换成 cnchi → 变成 `1 汉cnchi to cm` → 认不出
 *   先跑这一步：    「汉尺」整词换成 cneraChiHanLiangdi → 再归一时已无中文
 * ```
 *
 * ## 只处理已知的时代词与单位
 *
 * 不做通用分词 —— 认不出就不动，让它落到普通单位归一或报错，
 * 而不是瞎猜（「猜错一个切分位置，后面的数会全错」）。
 *
 * @param source - 原始表达式
 * @returns 替换后的表达式
 */
function normalizeEraUnitsInText(source: string): string {
  /**
   * 已经含注册名（`erau…`）就跳过 —— 说明这串已被处理过。
   *
   * 不跳过的话会出现二次替换：
   * ```
   *   第一次：1 汉尺 → 1 erauChiHanLiangdi
   *   第二次：「尺」又被匹配 → 1 erauChiHanLiangdierau…   ← 串套
   * ```
   */
  if (/erau[A-Z]/.test(source)) return source
  const ERAS = [
    // 中国
    '商', '周', '秦汉', '汉', '三国', '晋', '南北朝', '隋', '唐', '宋', '元', '明', '清', '民国', '现代',
    // 世界
    '古埃及', '古巴比伦', '古希腊', '古罗马', '拜占庭', '中世纪', '英制', '美制',
    '日本', '伊斯兰', '古印度', '沙俄', '德意志', '法国旧制',
    /** 简称也要认：`巴比伦米纳` 等价于 `古巴比伦米纳`。 */
    '巴比伦', '俄国', '德国', '法国',
  ]
  const UNITS = [
    // 中国
    '尺', '里', '丈', '步', '升', '斗', '石', '斤', '两',
    // 世界
    '肘尺', '腕尺', '掌', '指', '斯塔德', '希腊尺', '德拉克马', '塔兰特',
    '罗马尺', '罗马寸', '罗马指', '罗马步', '罗马里', '罗马磅', '双耳瓶', '莫迪乌斯', '罗马亩',
    '厄尔', '杆', '弗隆', '英亩', '海得', '英担',
    '日尺', '日间', '日坪', '日贯', '日匁', '日升',
    '英国英亩', '英国海得', '英国英担', '中世纪厄尔',
    /** 第三批：巴比伦/印度/拜占庭/俄国/德国/法国。 */
    '米纳', '舍客勒', '尼达', '巴比伦肘尺', '巴比伦指', '西拉', '巴比伦塔兰特',
    '由旬', '克罗沙', '丹达', '哈斯塔', '安古拉', '托拉', '芒德', '西尔',
    '拜占庭磅', '凯拉顿', '拜占庭斗', '拜占庭寻',
    '沙绳', '俄尺', '维尔肖克', '俄里', '普特', '俄磅', '佐洛特尼克', '维德罗',
    '莱茵尺', '鲁特', '德里', '德磅', '洛特',
    '国王尺', '法丈', '法线', '法里', '法磅', '法盎司',
    '伊斯兰腕尺', '迪拉姆', '第纳尔', '坎塔尔', '德本', '阿塔巴', '奥林匹亚尺',
    '塔兰特', '德拉克马', '希腊斯塔德',
  ]
  let out = source
  /**
   * **别名整词替换优先**：`清营造尺`、`唐大尺` 这类带变体的写法
   * 不在「时代 + 单位」的组合里，只能靠整词匹配。
   *
   * 按长度降序替换，保证 `清营造尺` 不会被更短的 `清尺` 抢先匹配掉。
   */
  for (const alias of ERA_ALIAS_KEYS()) {
    if (!out.includes(alias)) continue
    const name = normalizeEraUnit(alias)
    if (name !== null) out = out.split(alias).join(name)
  }
  /**
   * **长的朝代名优先**：`秦汉` 必须在 `汉` 之前处理，
   * 否则「秦汉尺」会先被「汉尺」匹配掉，剩下一个孤零零的「秦」。
   */
  const sortedEras = [...ERAS].sort((a, b) => b.length - a.length)
  for (const era of sortedEras) {
    for (const unit of UNITS) {
      /** 三种写法，长的在前。 */
      for (const pattern of [era + '朝的' + unit, era + '朝' + unit, era + unit]) {
        if (!out.includes(pattern)) continue
        const name = normalizeEraUnit(pattern)
        if (name !== null) out = out.split(pattern).join(name)
      }
    }
  }
  return out
}

/** 引擎包装。 */
export interface Engine {
  /** 底层 mathjs 实例（供需要直接用的功能域）。 */
  readonly math: MathJsInstance
  /**
   * 求值。
   *
   * @param source - 表达式（中文单位会被自动归一）
   * @param scope - 变量作用域
   * @returns 结果（可能是 number / BigNumber / Unit / Matrix）
   */
  evaluate(source: string, scope?: Record<string, unknown>): unknown
  /**
   * 求值并保证结果是有限数。
   *
   * @param source - 表达式
   * @param scope - 变量作用域
   * @returns 数值
   */
  evaluateNumber(source: string, scope?: Record<string, unknown>): number
}

/** 引擎单例（mathjs 实例创建代价不低，且无状态）。 */
let cached: Engine | null = null

/**
 * 建引擎。
 *
 * @returns 引擎实例
 */
export function buildEngine(): Engine {
  if (cached !== null) return cached

  /**
   * ## ★ 默认数值类型必须是 BigNumber，不能是 Number
   *
   * 这条是**实测抓出来的**：用默认配置时 `10^20+5` 返回
   * `100000000000000000000` —— **那个 +5 被双精度浮点吃掉了**。
   *
   * 双精度只有约 15–17 位有效数字，而 10^20 需要 21 位。
   * 本项目以「精确计算」立身，这一条不能妥协。
   *
   * 代价：BigNumber 比 Number 慢约 5–10 倍，且 `Math.*` 不能直接用。
   * 但因为结果最终都要过 `toJsonValue`，慢在可控范围内。
   */
  const math = create(all, { number: 'BigNumber', precision: 64 }) as MathJsInstance

  /**
   * ## 安全边界：删掉动态代码执行入口
   *
   * `import` 能加载任意模块，`createUnit` 的注册体是函数 ——
   * 两者都等于把代码执行权交出去。本项目不提供这类能力。
   *
   * 删掉后调用它们会报 `Undefined function`，而不是静默可用。
   */
  /**
   * ⚠ **只删 `import`，不删 `createUnit`**。
   *
   * 初版把两个都删了，理由是「都等于代码执行入口」。实测后修正：
   *
   * ```
   *   import      能加载任意模块            ← 真危险，必删
   *   createUnit  接受「500 m」这种常量表达式 ← 定义单位所需，且无法执行代码
   * ```
   *
   * 删掉 `createUnit` 的代价是**中文古制单位无法注册**，
   * 于是 `30 里` 根本算不了。这是过度防御。
   */
  for (const name of ['import'] as const) {
    try {
      delete (math as unknown as Record<string, unknown>)[name]
    } catch {
      /* 只读属性删不掉时忽略 —— 不是安全问题，是宿主差异 */
    }
  }

  /** 注册中文古制单位（里/丈/斤/时辰/亩…）—— UCUM 不管这些，必须自己来。 */
  registerCjkUnits(math)
  /**
   * 注册**英制工业与市制细分**单位。
   *
   * 蒸汽朋克最核心的一批：`psi`/`gpm`/`cfm`/`BTU`/`hp_boiler`/`firkin`/`thou`。
   * 这些在公制里没有直接对应，而写作时又绕不开。
   */
  registerImperialUnits(math)
  /**
   * 注册**带时代**的单位（汉尺/唐大尺/清营造尺…）。
   *
   * 为什么需要它：同一个「尺」在商代 15.8 cm、汉代 23.1 cm、清代 32 cm ——
   * **差一倍**。只注册一个「尺 = 0.32 m」，写「汉代一尺」时会算出错的长度。
   */
  registerEraUnits(math)

  const evaluate = (source: string, scope?: Record<string, unknown>): unknown => {
    if (typeof source !== 'string') {
      throw new CalcError('invalid_argument', '表达式必须是字符串', '例如 expression:"1+1"。')
    }
    if (source.length > MAX_EXPRESSION_LENGTH) {
      throw new CalcError(
        'invalid_argument',
        '表达式超过 ' + MAX_EXPRESSION_LENGTH + ' 字符上限（收到 ' + source.length + '）',
        '拆成多条用 expressions 批量给，或先化简。',
      )
    }
    /**
     * 两级归一，顺序不能反：
     *
     * ```
     *   ① 时代单位（汉尺 → cneraChiHanLiangdi）
     *   ② 普通中文单位（里/斤/时辰 → cnli/cnjin/cnshichen）
     * ```
     *
     * 反了的话「汉尺」里的「尺」会先被拆出来，剩下的「汉」变成未知符号。
     */
    let normalized = normalizeEraUnitsInText(source)
    normalized = normalizeUnits(normalized)
    /**
     * ③ 修正 mathjs 的单位名歧义（**必须在最后**）。
     *
     * `min` 会被 mathjs 拆成 `m × in`（米×英寸），于是 `1 L/min` 报错。
     * 换成 `minute` 后正常。详见 `unit-ambiguity.ts`。
     */
    normalized = fixUnitAmbiguity(normalized)
    try {
      return math.evaluate(normalized, scope ?? {})
    } catch (error) {
      throw normalizeError(error, source)
    }
  }

  const evaluateNumber = (source: string, scope?: Record<string, unknown>): number => {
    const value = evaluate(source, scope)
    const n = Number(value as number)
    if (!Number.isFinite(n)) {
      throw new CalcError(
        'non_finite',
        '结果不是有限数（表达式：' + source + '）',
        '常见原因：除以 0、函数定义域外取值、数值溢出。',
      )
    }
    return n
  }

  cached = { math, evaluate, evaluateNumber }
  return cached
}
