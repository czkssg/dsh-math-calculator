/**
 * 单位变体的默认指向策略。
 *
 * ## 用户规则
 *
 * > 一般情况下，英制单位用国标。**保留变体，但默认情况下用的是国际标准。**
 *
 * ## 这条规则要解决什么问题
 *
 * 英制有三套并行（国际 / 美制 / 英制），而**裸名指向哪个**在别处是混乱的：
 *
 * ```
 *   实测现状（修正前）：
 *     1 ft to m       → 0.3048      国际      ✓
 *     1 lb to g       → 453.59237   国际      ✓
 *     1 gallon to L   → 3.785       美制      ✗ 应为国际/英制？
 *     1 ton to kg     → 907         美制短吨  ✗
 *     1 cwt to kg     → 45.4        美制短担  ✗
 *     1 bushel to L   → 36.37       英制      ✗ 与 gallon 口径不一致
 * ```
 *
 * 同一个「英制」名义下，长度用国际、容积用美制、干量用英制 ——
 * **作者无从预期**。这本身就是缺陷。
 *
 * ## 采用的默认标准
 *
 * **国际标准（1959 年国际码磅协定）**。理由：
 *
 * ```
 *   ① 中国国标（GB 3100《国际单位制及其应用》）采用 1959 协定值
 *   ② 国际标准化组织（ISO 31 / ISO 80000）同样采用
 *   ③ 它是「国际」的 —— 与「英制」这个称呼的字面意思一致
 * ```
 *
 * ## 但英制/美制并未被抹掉
 *
 * 它们保留为**具名变体**，需要时显式调用：
 *
 * ```
 *   1 gallon to L         → 4.546 L    （国际/英制加仑）
 *   1 美制加仑 to L        → 3.785 L    （显式）
 *   1 英制加仑 to L        → 4.546 L
 *   1 长吨 to kg           → 1016 kg
 *   1 短吨 to kg           → 907 kg
 * ```
 *
 * ## ★ 一个例外必须记住：gal / bbl 在石油业用美制
 *
 * 「1 桶石油 = 42 美制加仑 = 158.99 L」—— 这是**行业定义**，
 * 不是「美制变体」的选择问题。所以 `bbl` 与 `oilbarrel` 固定为美制。
 *
 * @module dsh-math-calculator/core/units-default-policy
 */

/**
 * 默认标准的来源。
 *
 * 每个模棱两可的单位都要能回答「为什么默认是这个」。
 */
export type DefaultBasis =
  /** 1959 年国际码磅协定（中国国标 GB 3100 采用） */
  | 'international-1959'
  /** 行业定义（如石油桶、AWG 电线） */
  | 'industry-defined'
  /** 无变体争议（只有一套） */
  | 'unambiguous'

/** 一条默认指向的决定。 */
export interface DefaultDecision {
  /** 裸名（用户会直接写的那个）。 */
  bare: string
  /** 默认指向哪个变体。 */
  target: 'international' | 'us' | 'imperial' | 'industry'
  /** 依据。 */
  basis: DefaultBasis
  /** 一句话说明（写进 notice，让调用方知道为什么）。 */
  reason: string
}

/**
 * ## 有变体争议的单位及其默认指向
 *
 * **只列有争议的**。`ft`/`lb`/`oz` 这类国际值已是共识，不必列。
 */
export const DEFAULT_DECISIONS: DefaultDecision[] = [
  // ── 容积 ──
  {
    bare: 'gallon',
    target: 'international',
    basis: 'international-1959',
    reason: '默认用国际（英制 Imperial）加仑 = 4.54609 L；美制加仑写「美制加仑」或 gallonus',
  },
  {
    bare: 'pint',
    target: 'international',
    basis: 'international-1959',
    reason: '默认英制品脱 = 568.3 mL；美制品脱写「美制品脱」或 pintus',
  },
  {
    bare: 'quart',
    target: 'international',
    basis: 'international-1959',
    reason: '默认英制夸脱 = 1.137 L；美制写 quartus',
  },
  {
    bare: 'fluidounce',
    target: 'international',
    basis: 'international-1959',
    reason: '默认英制液盎司 = 28.413 mL；美制写 fluidounceus',
  },
  {
    bare: 'gill',
    target: 'international',
    basis: 'international-1959',
    reason: '默认英制及耳 = 142.07 mL；美制写 gillus',
  },
  // ── 干量（干量本身只有美制与英制，无「国际」）──
  {
    bare: 'bushel',
    target: 'imperial',
    basis: 'international-1959',
    reason: '默认英制蒲式耳 = 36.369 L（与默认 gallon 同体系）；美制写 bushelus',
  },
  {
    bare: 'peck',
    target: 'imperial',
    basis: 'international-1959',
    reason: '默认英制配克 = 9.092 L；美制写 peckus',
  },
  // ── 质量 ──
  {
    bare: 'ton',
    target: 'industry',
    basis: 'industry-defined',
    reason: '★ `ton` 默认是**公制吨 1000 kg**（与「吨」同义）；'
      + '英制长吨写 longton（1016 kg）、短吨写 shortton（907 kg）',
  },
  {
    bare: 'cwt',
    target: 'international',
    basis: 'international-1959',
    reason: '默认长英担 = 50.802 kg（英国制）；短英担写 cwtshort（45.359 kg）',
  },
  // ── 长度（少数有争议）──
  {
    bare: 'ft',
    target: 'international',
    basis: 'international-1959',
    reason: '默认国际英尺 = 0.3048 m 精确；美制/英制英尺写 ftus / ftbr',
  },
  {
    bare: 'inch',
    target: 'international',
    basis: 'international-1959',
    reason: '默认国际英寸 = 25.4 mm 精确；美制/英制英寸写 inus / inbr',
  },
  // ── 行业固定（不是变体选择问题）──
  {
    bare: 'bbl',
    target: 'industry',
    basis: 'industry-defined',
    reason: '石油桶固定为美制 42 加仑 = 158.987 L（行业定义，无「国际版」）',
  },
  {
    bare: 'hp',
    target: 'industry',
    basis: 'industry-defined',
    reason: '默认机械马力 745.7 W（550 ft·lbf/s）；锅炉马力写 hpboiler、公制写 hpmetric',
  },
  {
    bare: 'btu',
    target: 'international',
    basis: 'international-1959',
    reason: '默认国际表 BTU = 1055.0559 J（工程最常用）；'
      + '其余五种写 btu39 / btu59 / btu60 / btumean / btuth',
  },
]

/**
 * 查某个裸名的默认指向。
 *
 * @param bare - 裸名（`gallon` / `ton`）
 * @returns 决定；无争议返回 null
 */
export function defaultFor(bare: string): DefaultDecision | null {
  return DEFAULT_DECISIONS.find((d) => d.bare === bare) ?? null
}

/**
 * 一条简短的默认说明（给 notice 用）。
 *
 * 只在**用户用了有争议的裸名**时才提示 —— 用具名变体不提示。
 *
 * @param bare - 裸名
 * @returns 一句话；无争议返回空串
 */
export function defaultNotice(bare: string): string {
  const decision = defaultFor(bare)
  if (decision === null) return ''
  return decision.reason
}
