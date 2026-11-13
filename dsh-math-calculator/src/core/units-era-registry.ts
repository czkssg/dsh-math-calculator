/**
 * 带时代的单位注册：把 `尺@汉` 这类名字注册进 mathjs。
 *
 * ## 命名约定
 *
 * ```
 *   cnchi_h      汉尺        ← 单位名_时代首字母
 *   cnchi_t      唐尺
 *   cnchi_q      清营造尺
 * ```
 *
 * 为什么用这种名字：`createUnit` 只允许字母数字（实测过，
 * `cn_li` 会被拒），所以不能用 `cnchi@汉`。
 *
 * ## 同时提供中文查询入口
 *
 * 光有 `cnchi_h` 还不够 —— 用户会直接问「汉代一尺多少厘米」。
 * 所以这里还给一个 `ERA_ALIAS` 表，把「汉尺」「唐大尺」这类写法
 * 映射到注册名。
  *
 * @module dsh-math-calculator/core/units-era-registry
 */

import type { MathJsInstance } from 'mathjs'
import { ALL_ERA_UNITS, type Era, type EraVariant } from './units-era.js'

/** 时代的短代码（用于单位名后缀）。 */
const ERA_CODE: Record<string, string> = {
  商: 'shang', 周: 'zhou', 秦汉: 'qinhan', 汉: 'han', 三国: 'sanguo',
  晋: 'jin', 南北朝: 'nanbei', 隋: 'sui', 唐: 'tang', 宋: 'song',
  元: 'yuan', 明: 'ming', 清: 'qing', 民国: 'minguo', 现代: 'modern',
  /** 世界体系。 */
  古埃及: 'egypt', 古巴比伦: 'babylon', 古希腊: 'greece', 古罗马: 'rome',
  拜占庭: 'byzantine', 中世纪欧洲: 'medieval', 英制: 'imperial', 美制: 'us',
  公制: 'metric', 日本: 'japan', 伊斯兰: 'islam', 古印度: 'india',
  沙俄: 'russia', 德意志: 'germany', 法国旧制: 'france',
  奥斯曼: 'ottoman', 波斯: 'persia', 玛雅: 'maya', 阿兹特克: 'aztec',
  北欧: 'nordic', 荷兰: 'dutch', 西班牙: 'spain', 葡萄牙: 'portugal',
  意大利: 'italy', 波兰: 'poland', 匈牙利: 'hungary', 阿拉伯: 'arab',
}

/**
 * 变体名的拼音代码（`createUnit` 只允许字母数字，中文变体名必须转）。
 *
 * 只收实际出现的那些，不做完整拼音表 —— 多收反而容易错。
 */
const VARIANT_CODE: Record<string, string> = {
  通用尺: 'Tongyong', 量地尺: 'Liangdi', 营造尺: 'Yingzao',
  裁衣尺: 'Caiyi', 布帛尺: 'Bubo', 大尺: 'Da', 小尺: 'Xiao',
  '小尺（黍尺）': 'Xiaoshu', 市尺: 'Shi', 市里: 'Shili', 市斤: 'Shijin',
  /** 世界体系。 */
  王室肘尺: 'Royal', 短肘尺: 'Short', 奥林匹亚斯塔德: 'Olympia',
  阿提卡斯塔德: 'Attic', 阿提卡尺: 'AtticPous', 埃伊纳尺: 'Aeginetan',
  阿提卡: 'Attic', 阿提卡塔兰特: 'AtticTalent', 苏格兰厄尔: 'Scottish',
  长担: 'Long', 短担: 'Short', 曲尺: 'Kanejaku', 鲸尺: 'Kujira',
  古升: 'Ancient', Monetalis: 'Monetalis',
  'al-dhira al-sawda': 'Sawda', 'al-dhira al-qimma': 'Qimma',
  /** 第四批。 */
  '陆地': 'Tudi', '卡斯蒂利亚': 'Castilla', '瓦伦西亚': 'Valencia',
  '佛罗伦萨': 'Firenze', '威尼斯': 'Venezia', '米兰': 'Milano',
  '罗马': 'Roma', 'viktualie': 'Viktualie', 'legal': 'Legal',
  /** 第五批。 */
  '巴格达': 'Baghdad', '埃及': 'Misr', '叙利亚': 'Sham',
  '早期': 'Early', '中期': 'Middle', '晚期': 'Late',
}

/**
 * 变体的优先级（数字小的优先），用于决定「无变体写法」落到哪个变体。
 *
 * ## 判据：日常用途优先
 *
 * 一个体系可能有多种变体，**不能简单取第一个注册的**：
 *
 * ```
 *   唐       大尺（日常）  小尺（调律）
 *   宋       营造尺（建筑） 布帛尺（量布）
 *   明       营造尺 / 裁衣尺 / 量地尺
 *   奥斯曼   市集尺（商业） 建筑尺（工程）    ← 商业更常用
 *   荷兰     阿姆斯特丹尺   莱茵兰尺（水利）  ← 贸易更常用
 *   意大利   佛罗伦萨/威尼斯/米兰           ← 佛罗伦萨最常用
 * ```
 */
const VARIANT_PRIORITY = [
  /** 中国（日常建筑优先）。 */
  '营造尺', '通用尺', '大尺', '量地尺', '裁衣尺', '布帛尺',
  /**
   * ## 世界体系（按「作者最可能指哪个」排序）
   *
   * ```
   *   奥斯曼  çarşı（市集/商业）  优先于 mimari（建筑）
   *   意大利  佛罗伦萨（但丁时代最著名）优先于威尼斯/米兰
   *   西班牙  卡斯蒂利亚（帝国标准）优先于瓦伦西亚
   *   荷兰    Rijnlandse（水利标准）排在无变体名之后
   * ```
   */
  'çarşı arşını', 'mimari arşın',
  '佛罗伦萨', '威尼斯', '米兰',
  '卡斯蒂利亚', '陆地', '瓦伦西亚', 'legal',
  'Rijnlandse voet',
  /** 第五批：阿拉伯 ratl 以巴格达为阿拔斯朝标准。 */
  '巴格达', '埃及', '叙利亚',
]

/**
 * 变体优先级打分。
 *
 * ## ★ 无变体名（`undefined`）给最高优先级
 *
 * 这一条是实测抓出来的：
 *
 * ```
 *   荷兰 voet：  无变体名 = 0.2831（阿姆斯特丹，日常）
 *                Rijnlandse voet = 0.3139（莱茵兰，水利工程专用）
 * ```
 *
 * 第一版给 `undefined` 打 0 分、`Rijnlandse voet` 在优先级表里排第 5，
 * 结果是**专用变体反而赢了**，`1 荷兰尺` 得 31.39 而不是 28.31。
 *
 * 判据：**没有变体名的那条就是「本体系的基准值」** ——
 * 作者写变体名是为了区分特例，没写就是通用那个。
 *
 * @param variant - 变体名
 * @returns 排名（越小越优先）
 */
function variantRank(variant?: string): number {
  /** 无变体名 = 体系基准 = 最高优先。 */
  if (variant === undefined) return -1
  const clean = variant.replace(/（[^）]*）/g, '').trim()
  /**
   * ## 精确匹配优先，再退到子串匹配
   *
   * 土耳其语变体名带特殊字符（`çarşı arşını` / `mimari arşın`），
   * 有时会与表里的写法差一个字母。子串匹配能兜住这种差异：
   *
   * ```
   *   'çarşı arşını'.includes('çarşı')  → true   → 排名靠前
   *   'mimari arşın'.includes('mimari') → true   → 排名靠后
   * ```
   */
  const exact = VARIANT_PRIORITY.indexOf(clean)
  if (exact >= 0) return exact
  /** 子串：取最长的匹配键，避免 `arsın` 之类的短键误命中。 */
  let best = -1
  let bestLen = 0
  for (let i = 0; i < VARIANT_PRIORITY.length; i += 1) {
    const key = VARIANT_PRIORITY[i]
    if (key.length > bestLen && (clean.includes(key) || key.includes(clean))) {
      best = i
      bestLen = key.length
    }
  }
  return best >= 0 ? best : 100
}

/** 量纲 → mathjs 基准单位。 */
const BASE: Record<string, string> = {
  length: 'm',
  mass: 'kg',
  volume: 'm3',
  area: 'm2',
  time: 's',
}

/**
 * ## ⚠ 注册表必须挂在 `globalThis` 上
 *
 * 这不是风格问题，是**实测抓到的 bug**：
 *
 * ```
 *   require('./lib/core/units-era-registry.js').ERA_UNIT_INDEX.size  →  0
 *   require('./lib/core/engine.js') 之后同一表达式                    →  72
 *   import 拿到的又是另一个实例                                        →  72（但它自己那份）
 * ```
 *
 * 根因：同一个 `.js` 文件被 **CJS `require` 与 ESM `import` 各加载一次**，
 * 于是模块顶层的 `new Map()` 有两个互不相干的实例。
 *
 * 后果很隐蔽：`buildEngine()` 往 A 那份里写，调用方从 B 那份里读，
 * 读到空表 —— 表现为「注册了但查不到」。
 *
 * 解法：把状态挂在 `globalThis` 上，无论加载几次都是同一个对象。
 */
interface EraRegistry {
  /** 生成的注册名 → 变体。 */
  index: Map<string, { unit: string; variant: EraVariant }>
  /** 中文写法 → 注册名。 */
  alias: Map<string, string>
  /** `@default@` 键 → 优先级排名（小的优先）。 */
  defaultRank?: Map<string, number>
}

const GLOBAL_KEY = '__dshMathEraUnitRegistry__'

function getRegistry(): EraRegistry {
  const holder = globalThis as unknown as Record<string, EraRegistry | undefined>
  const existing = holder[GLOBAL_KEY]
  if (existing !== undefined) return existing
  const created: EraRegistry = { index: new Map(), alias: new Map(), defaultRank: new Map() }
  holder[GLOBAL_KEY] = created
  return created
}

/** 生成的注册名 → 变体（供查询与显示还原）。 */
export const ERA_UNIT_INDEX = getRegistry().index

/** 中文写法 → 注册名。 */
export const ERA_ALIAS = getRegistry().alias

/** `@default@` 键 → 优先级排名。 */
export const ERA_DEFAULT_RANK = getRegistry().defaultRank as Map<string, number>

/**
 * 注册全部带时代的单位。
 *
 * ## 变体的命名去重
 *
 * 同一个朝代可能有多把尺（唐有大尺小尺、明有营造/裁衣/量地）。
 * 所以注册名要拼上变体特征：
 *
 * ```
 *   cnera_chi_han             汉尺（无变体）
 *   cnera_chi_tang_dachi      唐大尺
 *   cnera_chi_tang_xiaochi    唐小尺
 * ```
 *
 * @param math - mathjs 实例
 * @returns 成功注册的条数
 */
export function registerEraUnits(math: MathJsInstance): number {
  let ok = 0
  for (const unit of ALL_ERA_UNITS) {
    for (const variant of unit.variants) {
      const eraCode = ERA_CODE[variant.era]
      if (eraCode === undefined) continue
      /** 变体代码：中文变体名转拼音缩写不现实，改用序号保证唯一。 */
      /**
       * 变体标签：用拼音而不是字符码。
       *
       * 第一版用「前两个字的 charCode 转 36 进制」，生成 `cneraChiHanssvh80`
       * 这种乱码 —— 能跑但没法读。改成拼音后是 `cneraChiHanLiangdi`。
       */
      const variantTag = variant.variant !== undefined
        ? (VARIANT_CODE[variant.variant] ?? [...variant.variant].slice(0, 2).map((c) => c.charCodeAt(0).toString(36)).join(''))
        : ''
      /**
       * ## 单位名不能带下划线（实测）
       *
       * `createUnit` 只允许**字母数字**，`cnera_chi_han` 会报
       * `Invalid unit name (only alphanumeric characters are allowed)`。
       * 所以改用驼峰：`cneraChiHan`。
       *
       * 变体标识用「变体名的字符码转 36 进制」，保证唯一且纯字母数字。
       */
      const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
      /**
       * 单位名 → 拼音代码。
       *
       * 中文名走固定映射（尺→chi），英文名直接去掉非字母字符。
       * **不能带下划线或连字符**（`createUnit` 只允许字母数字）。
       */
      const UNIT_CODE: Record<string, string> = {
        尺: 'chi', 里: 'li', 丈: 'zhang', 步: 'bu', 升: 'sheng', 斗: 'dou',
        石: 'dan', 斤: 'jin', 两: 'liang', 肘尺: 'cubit', 掌: 'palm', 指: 'finger',
        德本: 'deben', 阿塔巴: 'artaba', 斯塔德: 'stadion', 希腊尺: 'pous',
        奥林匹亚尺: 'olympia', 德拉克马: 'drachma', 塔兰特: 'talent',
        罗马尺: 'pes', 罗马寸: 'uncia', 罗马指: 'digitus', 罗马步: 'passus',
        罗马里: 'mille', 罗马磅: 'libra', 双耳瓶: 'amphora', 莫迪乌斯: 'modius',
        罗马亩: 'iugerum', 厄尔: 'ell', 杆: 'rod', 弗隆: 'furlong', 英亩: 'acre',
        海得: 'hide', 英担: 'cwt', 日尺: 'jaku', 日间: 'ken', 日坪: 'tsubo',
        日贯: 'kan', 日匁: 'monme', 日升: 'sho', 伊斯兰腕尺: 'dhira',
        迪拉姆: 'dirham', 第纳尔: 'dinar', 坎塔尔: 'qintar',
        尼达: 'ninda', 巴比伦肘尺: 'kus', 巴比伦指: 'uban', 西拉: 'sila',
        米纳: 'mina', 舍客勒: 'shekel', 巴比伦塔兰特: 'talent',
        由旬: 'yojana', 克罗沙: 'krosha', 丹达: 'danda', 哈斯塔: 'hasta',
        安古拉: 'angula', 托拉: 'tola', 芒德: 'maund', 西尔: 'seer',
        拜占庭磅: 'litra', 凯拉顿: 'keration', 拜占庭斗: 'modios', 拜占庭寻: 'orgyia',
        沙绳: 'sazhen', 俄尺: 'arshin', 维尔肖克: 'vershok', 俄里: 'verst',
        普特: 'pood', 俄磅: 'funt', 佐洛特尼克: 'zolotnik', 维德罗: 'vedro',
        莱茵尺: 'rheinfuss', 鲁特: 'rute', 德里: 'meile', 德磅: 'pfund', 洛特: 'loth',
        国王尺: 'piedroi', 法丈: 'toise', 法线: 'ligne', 法里: 'lieue',
        法磅: 'livre', 法盎司: 'once',
        奥斯曼尺: 'arsin', 奥斯曼指: 'parmak', 奥斯曼磅: 'okka',
        奥斯曼德拉克马: 'dirhem', 奥斯曼坎塔尔: 'kantar', 奥斯曼基莱: 'kile',
        奥斯曼顿亩: 'donum', 奥斯曼法尔萨赫: 'farsakh',
        波斯腕尺: 'gaz', 波斯桑: 'sang', 波斯曼: 'mann',
        玛雅步: 'kin', 玛雅尺: 'xoc', 玛雅步量: 'poch', 玛雅驮: 'load',
        阿兹特克尺: 'quahuitl', 阿兹特克拃: 'cemmatl', 阿兹特克丈: 'tlapantli',
        阿兹特克玉米单位: 'centli',
        瑞典尺: 'fot', 瑞典寸: 'tum', 瑞典厄尔: 'aln', 瑞典里: 'mil',
        瑞典磅: 'skalpund', 瑞典里斯磅: 'lispund', 瑞典船磅: 'skeppund',
        荷兰尺: 'voet', 荷兰寸: 'duim', 荷兰厄尔: 'el',
        荷兰莫德: 'mud', 荷兰拉斯特: 'last', 荷兰磅: 'pond',
        西班牙尺: 'vara', 西班牙里格: 'legua', 西班牙阿罗巴: 'arroba',
        葡萄牙阿罗巴: 'arrobapt', 西班牙法内加: 'fanega', 西班牙公担: 'quintal',
        意大利臂尺: 'braccio', 意大利尺: 'piede', 意大利磅: 'libbra',
        意大利斯泰奥: 'staio',
        波兰肘尺: 'lokiec', 波兰尺: 'stopa', 波兰磅: 'funt',
        波兰加涅茨: 'garniec', 匈牙利波佐尼: 'pozsony',
        拜占庭盎司: 'oungia', 拜占庭格令: 'gramma', 拜占庭角豆: 'keration',
        拜占庭剑尺: 'spathion', 拜占庭尺: 'pous', 拜占庭里: 'milion',
        拜占庭液量: 'xestes',
        阿拉伯磅: 'ratl', 阿拉伯莫德: 'mudd', 阿拉伯萨阿: 'saa',
        阿拉伯卡菲兹: 'qafiz', 阿拉伯法尔萨赫: 'farsakh',
        阿拉伯英里: 'mijl', 阿拉伯量地竿: 'qasaba',
        阿拉伯坎塔尔: 'qintarab', 阿拉伯米斯卡尔: 'miskal',
      }
      const code = UNIT_CODE[unit.name] ?? (unit.name.replace(/[^A-Za-z0-9]/g, '') || 'u' + unit.name.charCodeAt(0).toString(36))
      const name = 'erau' + cap(code) + cap(eraCode) + variantTag
      const base = BASE[unit.dimension]
      const definition = variant.factor + ' ' + base
      try {
        math.createUnit(name, definition)
        ERA_UNIT_INDEX.set(name, { unit: unit.name, variant })
        /**
         * ## ⚠ 别名必须用「中文名」而不是 `name` 字段
         *
         * `EraUnit.name` 对世界单位是**英文标识**（`pes`/`libra`/`cubit`），
         * 中文写法在 `cjk` 数组里（`罗马尺`/`罗马磅`/`肘尺`）。
         *
         * 第一版用 `unit.name` 拼别名，于是生成了
         * 「古罗马Monetalispes」这种既不是中文也不是英文的东西，
         * 用户查「罗马尺」永远匹配不到。
         *
         * 所以别名要用 `cjk[0]`（没有则退回 `name`）。
         */
        const cjkName = unit.cjk.length > 0 ? unit.cjk[0] : unit.name
        /**
         * 中文别名要按「有没有变体」分两种，否则会生成「秦汉通用尺尺」这种叠字。
         *
         * ```
         *   有变体：  时代 + 变体 + 单位    →  唐大尺 / 明营造尺
         *   无变体：  时代 + 单位           →  汉尺 / 商尺
         * ```
         *
         * ## 但世界单位例外：单位名本身已含时代词
         *
         * ```
         *   罗马尺   中文名 = 「罗马尺」，时代 = 古罗马
         *            若拼成「古罗马罗马尺」→ 永远匹配不到
         * ```
         */
        const cleanVariant = variant.variant?.replace(/（[^）]*）/g, '').trim()
        /**
         * ## 变体名是英文/拉丁文时，不拼进中文别名
         *
         * ```
         *   变体 Monetalis  →  拼成「古罗马Monetalis罗马尺」← 永远匹配不到
         *   → 改为：变体名含非中文字符时，只登记「罗马尺」本身，
         *     变体的区分交给完整别名（`cneraPesRomeMonetalis` 用英文查）
         * ```
         */
        const variantIsCjk = cleanVariant !== undefined && /^[\u4e00-\u9fa5（）()]+$/.test(cleanVariant)
        const variantHasUnit = variantIsCjk && cleanVariant?.endsWith(cjkName) === true
        /**
         * ## 单位名是否自带国别/体系前缀
         *
         * 若自带（`西班牙尺`、`罗马尺`），别名就是**单位名本身**；
         * 否则拼成「时代 + 单位」（`汉尺`）。
         *
         * ⚠ 这个列表必须覆盖**所有**体系前缀，否则会拼出
         * 「西班牙西班牙里格」这种叠字，导致该变体退化成
         * 「时代+单位」通道，绕过裸名的优先级比较。
         */
        const nameHasEra = /^(罗马|希腊|埃及|日本|英国|伊斯兰|古|奥斯曼|波斯|玛雅|阿兹特克|瑞典|荷兰|西班牙|葡萄牙|意大利|波兰|匈牙利|阿拉伯|拜占庭)/.test(cjkName) ||
          cjkName.includes(variant.era)
        /**
         * ## 变体名是「体系内限定词」时，别名仍应是裸单位名
         *
         * 两种变体名性质不同：
         *
         * ```
         *   类型词（营造尺/裁衣尺/大尺）  → 别名 = 时代 + 变体
         *     「唐大尺」「明营造尺」
         *
         *   限定词（陆地/legal/卡斯蒂利亚/佛罗伦萨）→ 别名 = 单位名本身
         *     「西班牙里格」「意大利磅」（变体只用于区分值）
         * ```
         *
         * 第一版把「陆地」当类型词拼成「西班牙陆地西班牙里格」，
         * 于是裸名「西班牙里格」的优先级比较被绕过，后注册的 legal 赢了。
         *
         * 判据：变体名**不以单位名结尾**且**不含「尺/寸/斤/磅」等量词**时为限定词。
         */
        const QUALIFIER_ONLY = new Set([
          '陆地', 'legal', '卡斯蒂利亚', '瓦伦西亚', '佛罗伦萨', '威尼斯',
          '米兰', '罗马', 'viktualie', '阿姆斯特丹', 'Rijnlandse voet',
        ])
        const isQualifier = variantIsCjk
          ? (QUALIFIER_ONLY.has(cleanVariant ?? '') || cleanVariant?.startsWith('Rijnlandse') === true)
          : false
        /** 变体名是拉丁字母的（`legal`/`viktualie`）也当限定词。 */
        const isLatinQualifier = cleanVariant !== undefined && /^[A-Za-z][A-Za-z ]*$/.test(cleanVariant)
        const cjkAlias = (variantIsCjk && !isQualifier)
          ? variant.era + cleanVariant + (variantHasUnit ? '' : cjkName)
          : ((nameHasEra || isQualifier || isLatinQualifier) ? cjkName : variant.era + cjkName)
        /**
         * ## ⚠ 裸名（`cjkAlias === cjkName`）也必须走优先级比较
         *
         * 第一版直接 set，于是**后注册的变体覆盖前面的**：
         *
         * ```
         *   奥斯曼尺：çarşı(68) 先注册 → 别名指 68
         *             mimari(75.8) 后注册 → 覆盖成 75.8   ← 错
         * ```
         *
         * 这类别名（`nameHasEra` 为真时 `cjkAlias` 就是 `cjkName`）
         * 与 COUNTRY_PREFIX 段写的是**同一个键**，两处都要比排名。
         */
        const isBareKey = cjkAlias === cjkName
        if (isBareKey) {
          const bareRankKey = '@bare2@' + cjkAlias
          const thisRank = variantRank(variant.variant)
          if ((ERA_DEFAULT_RANK.get(bareRankKey) ?? 999) > thisRank) {
            ERA_ALIAS.set(cjkAlias, name)
            ERA_DEFAULT_RANK.set(bareRankKey, thisRank)
          }
        } else {
          ERA_ALIAS.set(cjkAlias, name)
        }
        /**
         * ## 变体名里含单位名时，额外登记「时代 + 单位」这个短写法
         *
         * ```
         *   变体「阿提卡塔兰特」含单位名「塔兰特」
         *   → 别名是「古希腊阿提卡塔兰特」
         *   → 但用户会写「古希腊塔兰特」，所以要额外登记一条
         * ```
         *
         * 只在**没有更具体的同名别名**时才登记，避免覆盖已有条目。
         */
        if (variantIsCjk && variantHasUnit) {
          const shortKey = variant.era + cjkName
          if (!ERA_ALIAS.has(shortKey)) ERA_ALIAS.set(shortKey, name)
        }
        /**
         * ## 世界单位：登记「净单位名」（去掉国别前缀的那个）
         *
         * 有些单位的时代标识与国别不一致：
         *
         * ```
         *   日本日尺   时代标识是「中世纪欧洲」（因为它用 src 的统一枚举）
         *   英国英亩   同上
         * ```
         *
         * 于是「时代 + 单位」拼出来的别名里没有「日本」「英国」。
         * 这里补两条：**带国别前缀的名字** 与 **去掉前缀的净名**。
         *
         * ```
         *   日本日尺  →  erauJakuMedieval
         *   日尺      →  erauJakuMedieval     （净名，但要防与中国的「尺」冲突）
         * ```
         */
        const COUNTRY_PREFIX = [
          '罗马', '希腊', '埃及', '日本', '英国', '伊斯兰', '古',
          /** 第四批。 */
          '奥斯曼', '波斯', '玛雅', '阿兹特克', '瑞典', '荷兰',
          '西班牙', '葡萄牙', '意大利', '波兰', '匈牙利',
          /** 第五批。 */
          '阿拉伯', '拜占庭',
        ]
        for (const prefix of COUNTRY_PREFIX) {
          if (!cjkName.startsWith(prefix)) continue
          /**
           * ## ⚠ 这里也必须走优先级比较
           *
           * 第一版直接 `ERA_ALIAS.set(cjkName, name)`，于是**后注册的覆盖前面的**：
           *
           * ```
           *   奥斯曼尺：çarşı(68) 先注册 → 别名指 68
           *             mimari(75.8) 后注册 → 覆盖成 75.8   ← 错
           * ```
           *
           * 现在与 `@default@` 用同一套排名，保证日常变体赢。
           */
          const bareKey = '@bare@' + cjkName
          const bareRank = variantRank(variant.variant)
          if ((ERA_DEFAULT_RANK.get(bareKey) ?? 999) > bareRank) {
            ERA_ALIAS.set(cjkName, name)
            ERA_DEFAULT_RANK.set(bareKey, bareRank)
          }
          const bare = cjkName.slice(prefix.length)
          /**
           * ## 净名登记必须严格，否则会污染通用词
           *
           * 实测踩过的坑：波兰的 `łokieć` 译作「波兰肘尺」，
           * 净名是「肘尺」—— 而「肘尺」是**跨文明的通用词**
           * （古埃及、巴比伦、英制都用）。
           *
           * 一旦把「肘尺」绑到波兰，`1 巴比伦肘尺` 会被归一成
           * `1 巴比伦erauLokiecPoland`，直接语法错。
           *
           * 三条判据：
           * ```
           *   ① 净名 ≥3 字（2 字太容易撞）
           *   ② 净名不在通用词黑名单里
           *   ③ 不与已有别名冲突
           * ```
           */
          const GENERIC_WORDS = new Set([
            '肘尺', '腕尺', '尺', '寸', '里', '斤', '两', '升', '斗', '石',
            '磅', '盎司', '加仑', '品脱', '夸脱', '英亩', '蒲式耳',
            '厄尔', '杆', '掌', '指', '步', '段',
          ])
          if (bare.length >= 3 && !GENERIC_WORDS.has(bare) && !ERA_ALIAS.has(bare)) {
            ERA_ALIAS.set(bare, name)
          }
          break
        }
        /**
         * 「汉朝的尺」比「汉朝尺」多一个「的」字 —— 中文里这种写法很自然，
         * 而别名匹配是整词比较，所以必须**两种都登记**。
         *
         * ⚠ 这里**不能直接 set**：多个变体会抢同一个无变体别名，
         * 后注册的会覆盖先注册的（实测：宋的「宋朝尺」被布帛尺覆盖，
         * 于是「宋朝的尺」算出 27.2 而不是营造尺的 31.2）。
         * 所以走与 `@default@` 相同的优先级比较。
         */
        const cjkPriorityKey = '@rank@' + variant.era + '朝' + cjkName
        const eraCjkKey = variant.era + '朝' + cjkName
        const cjkNoDe = variant.era + '朝的' + cjkName
        const cjkRank = variantRank(variant.variant)
        if ((ERA_DEFAULT_RANK.get(cjkPriorityKey) ?? 99) > cjkRank) {
          ERA_ALIAS.set(eraCjkKey, name)
          ERA_ALIAS.set(cjkNoDe, name)
          ERA_DEFAULT_RANK.set(cjkPriorityKey, cjkRank)
        }
        /**
         * 记录「该时代主变体」：无变体查询（如「唐朝的尺」）落到这里。
         *
         * ## 主变体的判据：日常用途优先
         *
         * 一个朝代可能有多把尺，**不能简单取第一个注册的** ——
         * 唐的注册顺序是大尺、小尺，取第一个碰巧对了；
         * 但宋是营造尺、布帛尺，明清是营造尺、裁衣尺、量地尺，
         * 顺序稍变就会选错。
         *
         * 所以显式给优先级：营造尺/通用尺（日常建筑）> 大尺 > 其余。
         * 「小尺（黍尺）」是调律用的，绝不该当默认。
         */
        const eraKey = '@default@' + variant.era + unit.name
        const current = ERA_ALIAS.get(eraKey)
        if (current === undefined) {
          ERA_ALIAS.set(eraKey, name)
          ERA_DEFAULT_RANK.set(eraKey, variantRank(variant.variant))
        } else if (variantRank(variant.variant) < (ERA_DEFAULT_RANK.get(eraKey) ?? 99)) {
          ERA_ALIAS.set(eraKey, name)
          ERA_DEFAULT_RANK.set(eraKey, variantRank(variant.variant))
        }
        ok += 1
      } catch {
        /** 单个失败不影响整体（例如区间变体只注册下界）。 */
      }
    }
  }
  return ok
}

/**
 * 按时代查单位的换算因子（走注册表）。
 *
 * @param unitName - 单位名（如「尺」）
 * @param era - 时代（如「汉」）
 * @param variant - 变体名（可选）
 * @returns 换算因子与说明；找不到返回 null
 */
export function lookupEraFactor(
  unitName: string,
  era: Era,
  variant?: string,
): { name: string; factor: number; source: string; confidence: string } | null {
  const unit = ALL_ERA_UNITS.find((u) => u.name === unitName || u.cjk.includes(unitName))
  if (!unit) return null
  const hit = unit.variants.find((v) => v.era === era && (variant === undefined || v.variant === variant))
  if (!hit) return null
  return {
    name: hit.era + (hit.variant ?? '') + unit.name,
    factor: hit.factor,
    source: hit.source,
    confidence: hit.confidence,
  }
}

/**
 * 把一个中文时代写法归一成注册名。
 *
 * 例如 `汉尺` → `cnera_尺_han`。
 *
 * @param text - 中文写法
 * @returns 注册名；认不出返回 null
 */
export function normalizeEraUnit(text: string): string | null {
  const direct = ERA_ALIAS.get(text)
  if (direct !== undefined) return direct
  /**
   * 「汉尺」这种没写变体的写法，落到该时代的**主变体**。
   *
   * 汉代有两把尺（通用尺 23.1 / 量地尺 23.1），主变体是第一个注册的。
   * 这样「汉尺」总能查到东西，而不会因为「没有无变体条目」而落空。
   */
  const def = ERA_ALIAS.get('@default@' + text)
  if (def !== undefined) return def
  /** 再试「朝代 + 变体 + 单位」的几种组合。 */
  for (const [alias, name] of ERA_ALIAS) {
    if (alias.startsWith('@default@')) continue
    if (text.includes(alias) || alias.includes(text)) return name
  }
  return null
}
