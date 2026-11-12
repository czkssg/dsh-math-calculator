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
import { rebindDefaults } from './units-default-rebind.js'
import { registerSiUnits } from './units-si-registry.js'
import { rankOf, nullspaceOf, singularValuesOf, factorizeInt, makeNsolve } from './numeric.js'
import { registerCustomUnit, type CustomUnit } from './units-custom.js'
import { loadCustomUnits } from './units-custom-store.js'

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
  /**
   * ★ 吨的三义必须在中文层分开。
   *
   * 「吨」默认是公制（mathjs 的 `t`），而「长吨」「短吨」是英制的两种。
   * 三者差 12%，混用会让「年产 300 万吨」变成 272 万吨。
   */
  ['长吨', 'tonlong'], ['短吨', 'tonshort'], ['公吨', 't'],
  ['长英担', 'cwtlong'], ['短英担', 'cwtshort'],

  /**
   * ## 英制/美制的具名变体（用户需要显式指名时用）
   *
   * 裸名默认走国际标准（见 `units-default-policy.ts`），
   * 要另一套就写这些具名形式。
   *
   * ⚠ 长词优先：「美制液盎司」必须在「美制液」之前，「美制加仑」在「加仑」之前。
   */
  ['美制液盎司', 'fluidounceus'], ['英制液盎司', 'fluidouncebr'],
  ['美制液量打兰', 'fluiddramus'],
  ['美制加仑', 'gallonus'], ['英制加仑', 'gallonimp'],
  ['美制品脱', 'pintus'], ['英制品脱', 'pintbr'],
  ['美制夸脱', 'quartus'], ['英制夸脱', 'quartimp'],
  ['美制及耳', 'gillus'], ['英制及耳', 'gillbr'],
  ['美制茶匙', 'teaspoonus'], ['美制汤匙', 'tablespoonus'],
  ['美制杯', 'cupus'],
  ['美制蒲式耳', 'bushelus'], ['英制蒲式耳', 'bushel'],
  ['美制配克', 'peckus'], ['英制配克', 'peck'],
  ['配克', 'peck'],
  ['美制干夸脱', 'dryquartus'], ['美制干品脱', 'drypintus'],
  ['美制量滴', 'minimus'], ['英制量滴', 'minimbr'],
  ['美制英亩', 'acreus'], ['英制英亩', 'acreimp'],
  ['美制英尺', 'ftus'], ['英制英尺', 'ftimp'], ['国际英尺', 'fti'],
  ['美制英寸', 'inus'], ['英制英寸', 'inbr'],
  ['美制磅', 'lbav'],
  ['石油桶', 'barreloil'],
  /** 印刷与纺织。 */
  ['印刷点', 'pointpr'], ['印刷派卡', 'picapr'],
  ['迪多点', 'didot'], ['西塞罗', 'cicero'],
  ['斯克鲁普', 'scruple'], ['药衡打兰', 'dramap'],
  ['药衡盎司', 'ounceap'], ['药衡磅', 'poundap'],
  ['特克斯', 'tex'], ['但尼尔', 'denier'],
  /** 工程。 */
  ['工程大气压', 'technicalatmosphere'], ['米水柱', 'meterwater'],
  ['米汞柱', 'metermercury'], ['电马力', 'hpelectric'],
  ['锅炉马力', 'hpboiler'], ['公制马力', 'hpmetric'],
  ['奈培', 'neper'],
  /** 木材。 */
  ['板英尺', 'boardfoot'], ['考得', 'cord'], ['圆密尔', 'circularmil'],
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
         *
         * ## 三条放行条件（第二、三条是后补的）
         *
         * ```
         *   ① 前面隔着空格能看到数字      `1 里`
         *   ② 前面是 `to` / `in`         `3 维尔 to 里`  ← 目标单位位
         *   ③ 紧邻数字或右括号            `1里` / `(2)里`
         * ```
         *
         * 第二条是实测抓出来的：`to 里` 里的「里」前面是字母 `to`，
         * 按原判据匹配不上，于是 `3 维尔 to 里` 报语法错。
         */
        const before = out.trimEnd()
        const prevChar = before.length > 0 ? before[before.length - 1] : ''
        /** 前面是数字或处于表达式开头（`1 里` 的「里」前是空格，开头的空格也算）。 */
        const prevIsDigitOrSpace = /\d/.test(prevChar) || prevChar === ''
        let j = out.length - 1
        while (j >= 0 && out[j] === ' ') j -= 1
        const nearest = j >= 0 ? out[j] : ''
        /** 前面是不是 `to` / `in` / `as`（目标单位位）。 */
        const beforeWord = out.slice(0, j + 1)
        const isTargetSlot = /(?:^|\s)(?:to|in|as)$/i.test(beforeWord)
        if (prevIsDigitOrSpace || /[\d)\]]/.test(nearest) || isTargetSlot) {
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
    /** 第四批。 */
    '奥斯曼', '波斯', '玛雅', '阿兹特克', '北欧', '荷兰',
    '西班牙', '葡萄牙', '意大利', '波兰', '匈牙利',
    /** 第五批。 */
    '阿拉伯', '巴格达', '埃及', '叙利亚',
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
    /** 第四批：奥斯曼/波斯/玛雅/阿兹特克/北欧/荷兰/伊比利亚/意大利/波兰匈牙利。 */
    '奥斯曼尺', '奥斯曼指', '奥斯曼磅', '奥斯曼德拉克马', '奥斯曼坎塔尔',
    '奥斯曼基莱', '奥斯曼顿亩', '奥斯曼法尔萨赫',
    '波斯腕尺', '波斯桑', '波斯曼',
    '玛雅步', '玛雅尺', '玛雅步量', '玛雅驮',
    '阿兹特克尺', '阿兹特克拃', '阿兹特克丈', '阿兹特克玉米单位',
    '瑞典尺', '瑞典寸', '瑞典厄尔', '瑞典里', '瑞典磅', '瑞典里斯磅', '瑞典船磅',
    '荷兰尺', '荷兰寸', '荷兰厄尔', '荷兰莫德', '荷兰拉斯特', '荷兰磅',
    '西班牙尺', '西班牙里格', '西班牙阿罗巴', '葡萄牙阿罗巴',
    '西班牙法内加', '西班牙公担',
    '意大利臂尺', '意大利尺', '意大利磅', '意大利斯泰奥',
    '波兰肘尺', '波兰尺', '波兰磅', '波兰加涅茨', '匈牙利波佐尼',
    /** 第五批：拜占庭细分 + 阿拉伯帝国。 */
    '拜占庭盎司', '拜占庭格令', '拜占庭角豆', '拜占庭剑尺', '拜占庭尺',
    '拜占庭里', '拜占庭液量', '拜占庭磅', '拜占庭斗', '拜占庭寻',
    '阿拉伯磅', '阿拉伯莫德', '阿拉伯萨阿', '阿拉伯卡菲兹', '阿拉伯法尔萨赫',
    '阿拉伯英里', '阿拉伯量地竿', '阿拉伯坎塔尔', '阿拉伯米斯卡尔',
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

/**
 * 数据目录。
 *
 * ## 为什么读环境变量而不是写死路径
 *
 * 测试需要隔离 —— 每套测试用独立的临时目录，否则会互相污染
 * （老插件踩过这个坑：共享 `DSH_MATH_CALC_HOME` 让断言随机失败）。
 *
 * @returns 数据目录绝对路径
 */
function resolveDataHome(): string {
  const env = process.env['DSH_MATH_CALC_HOME']
  if (typeof env === 'string' && env.trim() !== '') return env
  /**
   * 未设置时退回当前目录下的 `.dsh-math-calculator`。
   * 不退回 `os.tmpdir()` —— 那会让自设单位在重启后随机消失。
   */
  return '.dsh-math-calculator'
}

/**
 * 注册矩阵扩展函数（mathjs 没有的那几个）。
 *
 * ## 为什么需要
 *
 * 功能层要用表达式算矩阵属性，而 mathjs 只内置了：
 *
 * ```
 *   ✓ det / inv / lusolve / eigs / polynomialRoot
 *   ✗ rank / nullspace / svd / factorize / nsolve      ← 本项目自己实现
 * ```
 *
 * 不注册的话 `engine.evaluate('rank([[1,2],[2,4]])')` 报
 * `Undefined function rank`。
 *
 * @param math - mathjs 实例
 */
function registerMatrixHelpers(math: MathJsInstance): void {
  const helpers: Array<[string, (...args: never[]) => unknown]> = [
    ['rank', (m: never) => rankOf(m)],
    ['nullspace', (m: never) => nullspaceOf(m)],
    ['svd', (m: never) => singularValuesOf(m)],
    ['factorize', (n: never) => factorizeInt(n as unknown as number)],
  ]
  for (const [name, fn] of helpers) {
    try {
      math.import({ [name]: fn }, { override: true })
    } catch (error) {
      /**
       * 导入失败不致命（功能层会回退到直接调 `core/numeric`），
       * 但**必须留痕** —— 静默吞掉会让「函数没注册」变成难查的问题。
       *
       * 实测（2026-11-13）：第一次就是静默失败，表现为
       * `math.rank === undefined` 而没有任何错误信息。
       */
      if (process.env['DSH_MATH_DEBUG'] !== undefined) {
        console.error('[engine] 注册矩阵函数 ' + name + ' 失败：' +
          (error instanceof Error ? error.message : String(error)))
      }
    }
  }
  /**
   * `nsolve` 需要解析器，单独注册。
   *
   * 它接受「表达式 + 变量 + 区间」，用二分/牛顿法找根 ——
   * 超越方程（含 sin/log）只能靠它，多项式求根覆盖不到。
   */
  try {
    math.import({ nsolve: makeNsolve((text: string) => math.parse(text)) }, { override: true })
  } catch {
    /* 同上 */
  }
}

/** 引擎包装。 */
export interface Engine {
  /** 底层 mathjs 实例（供需要直接用的功能域）。 */
  readonly math: MathJsInstance
  /** 已加载的自设单位（供输出层还原显示名）。 */
  readonly customUnits: CustomUnit[]
  /** 自设单位加载失败的原因（空串表示正常）。 */
  readonly customUnitsError: string
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
 * 重建引擎（丢弃缓存）。
 *
 * ## 为什么需要这个
 *
 * 引擎是单例（`buildEngine` 缓存），因为 mathjs 实例创建代价不低。
 * 但**自设单位是运行时变的**：
 *
 * ```
 *   add 一个单位 → 落盘
 *   但引擎已缓存 → 内存里的 customUnits 还是旧的
 *   → 新单位在 mathjs 里注册了，但 normalizeCustomUnits 的闭包读不到
 * ```
 *
 * 所以 `add` / `remove` 之后要调这个函数重建。
 *
 * @returns 新引擎
 */
export function rebuildEngine(): Engine {
  cached = null
  return buildEngine()
}

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
   *
   * ## ★ 但 `import` 的删除必须放在所有注册**之后**
   *
   * 2026-11-13 实测抓到的冲突：
   *
   * ```
   *   注册矩阵函数（rank/svd/…）需要 math.import
   *   而 import 已被删 → 报 "math.import is not a function"
   *   → 静默失败，于是 `rank(...)` 报「没有名为 rank 的函数」
   * ```
   *
   * 所以：**先注册完所有东西，最后再切掉 import**。
   * 这样既保住了安全边界，又能注册自有函数。
   */

  /**
   * ## 先补 SI 与现代单位（用户的提醒：别只顾古代忘了现代）
   *
   * 实测发现的缺失：
   *
   * ```
   *   SI 导出单位  sr / lm / lx / Bq / Gy / Sv / kat     ← 全缺
   *   天文三件套    au / ly / pc                          ← 全缺
   *   核与辐射      Ci / rad / rem / R                    ← 全缺
   *   其他          d / dB / Np / rpm / kn / nmi / bps    ← 全缺
   * ```
   *
   * 这些是最基础的现代度量衡，**比古代单位更该先有**。
   * 放在中文古制之前注册：它们是基准，后面的单位可能引用。
   */
  registerSiUnits(math)

  /** 注册中文古制单位（里/丈/斤/时辰/亩…）—— UCUM 不管这些，必须自己来。 */
  registerCjkUnits(math)
  /**
   * ## 注册矩阵扩展函数
   *
   * `rank` / `nullspace` / `svd` / `factorize` 是**本项目自己实现的**
   * （mathjs 没有），而功能层要用它们在表达式里算。
   *
   * 实测（2026-11-13）：不注册的话 `engine.evaluate('rank(...)')` 报
   * `Undefined function rank` —— 而 `det` / `inv` / `lusolve` / `eigs`
   * 是 mathjs 内置的，所以只有这几个要自己补。
   */
  registerMatrixHelpers(math)
  /**
   * 注册**英制工业与市制细分**单位。
   *
   * 蒸汽朋克最核心的一批：`psi`/`gpm`/`cfm`/`BTU`/`hp_boiler`/`firkin`/`thou`。
   * 这些在公制里没有直接对应，而写作时又绕不开。
   */
  registerImperialUnits(math)
  /**
   * ## 重绑定裸名到国际标准（用户规则）
   *
   * > 保留变体，但默认情况下用国际标准。
   *
   * mathjs 内置的英制单位全是**美制**值（`1 gallon` = 3.785 L），
   * 而本项目要的是国际/英制值（4.546 L）。这一步把裸名改绑过去，
   * 美制变体保留具名形式（`gallonus`）。
   *
   * **必须在 `registerImperialUnits` 之后** —— 否则我们注册的
   * `gallonimp` 等具名变体还没建立，重绑定会缺少参照。
   */
  rebindDefaults(math)
  /**
   * ## ★ 所有注册完成后，切掉 `import`（安全边界）
   *
   * 位置很关键：前面 `registerMatrixHelpers` 需要 `math.import` 才能
   * 注册 `rank`/`svd`/`nsolve` 等自有函数。在这里删掉之后，
   * 用户表达式里的 `import("fs")` 就不可用了。
   *
   * 实测顺序错误的表现（2026-11-13）：
   * ```
   *   先删 import → 注册矩阵函数失败（无报错）
   *              → `rank(...)` 报「没有名为 rank 的函数」
   * ```
   */
  try {
    delete (math as unknown as Record<string, unknown>)['import']
  } catch {
    /* 只读属性删不掉时忽略 —— 不是安全问题，是宿主差异 */
  }
  /**
   * ## 最后加载用户自设单位
   *
   * 顺序很重要：必须在内置单位**全部就位之后**。
   *
   * ```
   *   ① 内置（mathjs）
   *   ② 中文古制（cnli / cnjin）
   *   ③ 英制/市制（psi / gpm / 市尺）
   *   ④ 裸名重绑定（gallon → 国际标准）
   *   ⑤ 用户自设（@维尔）      ← 最后，且**不得覆盖**前面任何一个
   * ```
   *
   * 若自设单位先注册，用户就能用「维尔」这个名字顶掉「m」——
   * 那会让 `1 m` 不再是 1 m，破坏「同输入同输出」。
   *
   * **加载失败不致命**：盘上是坏的也不该让整个插件起不来，
   * 但要把原因带出去（见 `customUnitsError`）。
   */
  let customUnits: CustomUnit[] = []
  let customUnitsError = ''
  try {
    customUnits = loadCustomUnits({ home: resolveDataHome() })
    for (const unit of customUnits) {
      try {
        registerCustomUnit(math, unit)
      } catch {
        /** 单个注册失败（如与内置撞名）跳过 —— 其余的仍可用。 */
      }
    }
  } catch (error) {
    customUnitsError = error instanceof Error ? error.message : String(error)
  }
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
    /**
     * ④ 自设单位的中文名 → 注册名（**必须在歧义修正之后**）。
     *
     * 自设单位的注册名是 `uX1ohqcut` 这种哈希，用户不可能手打。
     * 所以这里把「维尔」换成注册名，让 `5 维尔 to km` 能算。
     *
     * 放在最后是因为：自设单位的显示名可能含 `min`（如「分钟格」），
     * 若先换中文名再修歧义，会把注册名里的 `min` 也改掉。
     */
    normalized = normalizeCustomUnits(normalized)
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

  /**
   * 自设单位的中文名 → 注册名。
   *
   * ## 为什么要闭包而不是顶层函数
   *
   * 它要读 `customUnits` —— 而那是**本次构建**加载进来的，
   * 顶层函数拿不到。闭包是这里最直接的办法。
   *
   * ## 替换顺序
   *
   * 按显示名长度降序，保证「石炭气」不会被「石炭」抢先匹配掉前半截。
   *
   * @param text - 原始表达式
   * @returns 替换后的表达式
   */
  const normalizeCustomUnits = (text: string): string => {
    if (customUnits.length === 0) return text
    let out = text
    const sorted = [...customUnits].sort((a, b) => b.display.length - a.display.length)
    for (const unit of sorted) {
      if (!out.includes(unit.display)) continue
      out = out.split(unit.display).join(unit.name)
    }
    return out
  }

  cached = { math, evaluate, evaluateNumber, customUnits, customUnitsError }
  return cached
}
