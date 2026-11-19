/**
 * 公式检索。
 *
 * ## ★ 用 minisearch + segmentit，不自己写匹配
 *
 * 老插件的检索是「子串 includes + 打分」，缺陷在反馈包里报过：
 *
 * ```
 *   query="作用量"  → 11 条，首条「两平行导线间的作用力」   ← 整串零命中
 *   query="机械"    → 5 条，首条「指数分布的均值」         ← 命中 desc 里「机械件的磨损不是」
 * ```
 *
 * 根因：中文滑窗把「作用量」切成「作用」「用量」，各自命中了别的公式。
 *
 * 更糟的是**「看起来像有」** —— 用户逐个点开发现全不相干，
 * 于是不会去补那条真缺的公式。
 *
 * 现在用 `minisearch`（成熟倒排索引 + prefix/fuzzy）+ `segmentit`（中文分词）。
 *
 * ## 三档结果必须分开报
 *
 * ```
 *   精确命中   分词后某个 token 与索引 token 完全相同
 *   模糊命中   prefix / fuzzy 匹配到的
 *   无命中     明确说「没有精确匹配」，并降级提示
 * ```
 *
 * @module dsh-math-calculator/features/formulas/query
 */

import MiniSearch from 'minisearch'
import segmentitModule from 'segmentit'
import type { Engine } from '../../core/engine.js'

/** 公式条目（与 `data/formulas.json` 的形状一致）。 */
export interface FormulaEntry {
  id: string
  cat: string
  name: string
  expr: string
  params: Record<string, { value: number | null; desc: string; /** 量名（语义标签）。 */ quantity?: string; /** 7 基量向量（L M T Theta I N J）。 */ dimension?: Record<string, number> }>
  unit: string
  desc: string
  keys?: string[]
  builtin?: boolean
  /**
   * 是否可求值。缺省 true。
   *
   * 少数公式是**展示式**（含 Σᵢ、log_base 这类排版符号，mathjs 无法解析），
   * 例如 gini / hhi / shannon_entropy / simpson_diversity。它们只出现在检索与
   * 帮助里；调用求值时必须明确报「这是展示式」，而不是抛语法错。
   */
  executable?: boolean
  /**
   * 可选分项（R66）：有些公式真正要算的是中间项。
   * 例：哈迪-温伯格总和恒为 1，用户要的是 2pq（携带者比例）。
   * 每项 expr 用同一组代入值计算，结果附在 result 与 value.parts。
   */
  parts?: Array<{ label: string; expr: string }>
}

/** 检索结果。 */
export interface QueryOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 分词器单例（构造代价不低）。 */
let segmenter: { doSegment: (text: string) => Array<{ w: string }> } | null = null

/**
 * 中文分词。
 *
 * ## ⚠ `segmentit` 是 CJS/ESM 双包，导出形状不一致
 *
 * 实测（2026-11-13）：
 *
 * ```
 *   require('segmentit')        → { Segment, useDefault, dicts, ... }   CJS 具名
 *   import { Segment }          → SyntaxError: does not provide an export named 'Segment'
 *   import * as s               → { default, 'module.exports' }          ESM 默认
 * ```
 *
 * 所以必须**默认导入后取属性**，不能用具名导入。
 *
 * @param text - 输入
 * @returns 词列表
 */
function tokenizeChinese(text: string): string[] {
  if (segmenter === null) {
    const mod = segmentitModule as unknown as {
      Segment?: new () => { doSegment: (t: string) => Array<{ w: string }> }
      useDefault?: (s: unknown) => { doSegment: (t: string) => Array<{ w: string }> }
      default?: {
        Segment?: new () => { doSegment: (t: string) => Array<{ w: string }> }
        useDefault?: (s: unknown) => { doSegment: (t: string) => Array<{ w: string }> }
      }
    }
    /** CJS 直接给具名；ESM 走 `.default`。两种都试。 */
    const api = (mod.Segment !== undefined ? mod : mod.default) ?? mod
    const SegmentImpl = api.Segment
    const useDefault = api.useDefault
    if (SegmentImpl === undefined || useDefault === undefined) {
      throw new Error('segmentit 的导出形状不认识（找不到 Segment / useDefault）')
    }
    segmenter = useDefault(new SegmentImpl()) as { doSegment: (t: string) => Array<{ w: string }> }
  }
  /**
   * 同时保留「整串」与「分词结果」——
   * 整串让 `escape_velocity` 这种英文 id 能被精确命中，
   * 分词让中文短语能被拆开检索。
   */
  const raw = text.toLowerCase().trim()
  const parts = segmenter.doSegment(raw).map((t) => t.w.toLowerCase())
  /** 去停用词（对检索无信息量的虚词）。 */
  const STOP = new Set(['的', '了', '是', '在', '和', '与', '有', '为', '能', '多', '少', '怎么', '多少', '一个'])
  const meaningful = parts.filter((t) => t.length >= 1 && !STOP.has(t))
  return [raw, ...meaningful].filter((t) => t !== '')
}

/** 索引缓存（按公式数量失效）。 */
let indexCache: { index: MiniSearch<FormulaEntry>; size: number } | null = null

/**
 * 建索引。
 *
 * @param formulas - 全部公式
 * @returns 索引
 */
function buildIndex(formulas: FormulaEntry[]): MiniSearch<FormulaEntry> {
  const index = new MiniSearch<FormulaEntry>({
    fields: ['name', 'desc', 'keysText', 'id', 'cat'],
    storeFields: ['id', 'name', 'expr', 'unit', 'desc', 'cat'],
    tokenize: tokenizeChinese,
    searchOptions: {
      boost: { name: 3, keysText: 2, desc: 1, id: 2 },
      prefix: true,
      /**
       * ## fuzzy 不能太松
       *
       * 实测（2026-11-13）：`fuzzy: 0.2` 时查「zzzz不存在的概念」
       * 仍返回 3 条 —— 编辑距离把无关词也匹配上了。
       *
       * 而本项目的判据是**宁可零命中，不给不相关结果**
       * （反馈包：「看起来像有」比「明确没有」更有害）。
       *
       * 0.1 是实测选的：仍能容忍一个字的错拼（`逃逸`↔`逃逸`），
       * 但不会把完全无关的词拉进来。
       */
      fuzzy: 0.1,
    },
  })
  index.addAll(
    formulas.map((f) => ({
      ...f,
      keysText: (f.keys ?? []).join(' '),
    })),
  )
  return index
}

/**
 * 取索引（带缓存）。
 *
 * @param formulas - 全部公式
 * @returns 索引
 */
function getIndex(formulas: FormulaEntry[]): MiniSearch<FormulaEntry> {
  if (indexCache !== null && indexCache.size === formulas.length) return indexCache.index
  const index = buildIndex(formulas)
  indexCache = { index, size: formulas.length }
  return index
}

/**
 * 判断一次命中是否「精确」。
 *
 * ## 这是本模块最需要想清楚的一处（被实测打回四次）
 *
 * ### 判据演进
 *
 * ```
 *   第一版  h.includes(t)                     太松（「作用量」→ 石灰用量）
 *   第二版  互含 + 长度差≤4                    仍太松（「作用量」→ 作物总产量）
 *   第三版  再加「短方占比≥60%」                误伤（「逃逸」→「逃逸速度」占比 0.5）
 *   第四版  加「前缀关系」                      改善，但单字 token 问题暴露
 * ```
 *
 * ### 第四版暴露的问题
 *
 * ```
 *   查询「山高」→ segmentit 分成 ['山', '高']
 *   → '山' 是 mountain_lifetime 的 key，但单字不应算精确命中
 *   → '高' 不是任何 key
 *   → 结果：exactCount = 0（而它其实该命中「山的寿命」）
 * ```
 *
 * ### 第五版（当前）
 *
 * ```
 *   ① 单字 token 不参与精确判定（「山」「高」这种太宽）
 *   ② 前缀关系（长度 ≥2）     「逃逸」→「逃逸速度」
 *   ③ 互含 + 差≤4 + 占比≥0.6   兜底
 *   ④ **整串包含**也算精确       「山高」是「山的寿命」的……不算
 * ```
 *
 * 第 ④ 条不成立，所以「山高」这类**跨词查询**只能算近似命中 ——
 * 那是正确的：用户写「山高」时指的是「山能长多高」，
 * 与「山的寿命」是相关但不同的概念。
 *
 * @param tokens - 查询的分词结果
 * @param raw - 原始查询串
 * @param entry - 公式条目
 * @returns 是否精确命中
 */
function isExactMatch(tokens: string[], raw: string, entry: FormulaEntry): boolean {
  const haystack = [entry.name.toLowerCase(), ...(entry.keys ?? []).map((k) => k.toLowerCase())]
  const query = raw.toLowerCase()

  /**
   * ## ⚠ `escape_velocity` 必须先按「整串」查一次
   *
   * 实测（2026-11-13）：`segmentit` 把英文 id 切成 `['escape','_','velocity']`
   * —— 于是整串 `escape_velocity` 根本不在 `tokens` 里，
   * 精确命中永远为 0。
   *
   * 而用户直接写公式 id 时，最该命中的就是它自己。
   */
  if (entry.id.toLowerCase() === query) return true

  return tokens.some((t) => {
    /**
     * ① 单字 token 不参与精确判定 —— 「山」「高」「量」这类太宽，
     * 几乎能与任何含该字的公式匹配。
     */
    if (t.length < 2) return false
    return haystack.some((h) => {
      if (h === t) return true
      /** ② 前缀关系（「逃逸」→「逃逸速度」）。 */
      if ((h.startsWith(t) || t.startsWith(h)) && Math.min(h.length, t.length) >= 2) return true
      /** ③ 互含 + 长度接近 + 占比足够。 */
      if (!h.includes(t) && !t.includes(h)) return false
      const shorter = Math.min(h.length, t.length)
      const longer = Math.max(h.length, t.length)
      return longer - shorter <= 4 && shorter / longer >= 0.6
    })
  }) || haystack.some((h) => h === query)
}

/**
 * 检索公式。
 *
 * @param formulas - 全部公式
 * @param query - 查询（中文或英文）
 * @param limit - 最多返回几条
 * @returns 结果
 */
export function queryFormulas(
  formulas: FormulaEntry[],
  query: string,
  limit = 8,
): QueryOutcome {
  const trimmed = query.trim()
  if (trimmed === '') {
    throw new Error('query 不能为空')
  }
  /** 纯符号查询（`*`、`(`）没有意义，且会让模糊检索扫全索引（实测 1.1s）。 */
  if (trimmed.replace(/[^\p{L}\p{N}]+/gu, '') === '') {
    return {
      result: '没有匹配「' + trimmed + '」的公式。纯符号查询没有意义；换用名词（如「腐蚀」「动能」）。',
      value: { query: trimmed, hits: [] },
    }
  }

  const index = getIndex(formulas)
  const hits = index.search(trimmed).slice(0, limit)

  /**
   * ## ★ 零命中的真正判据：**过滤后还有没有有效 token**
   *
   * 实测（2026-11-13）：查「zzzz不存在」时 minisearch 仍返回 3 条 ——
   * 因为 `segmentit` 把「不存在」当成有效词，而索引里有公式含「存在」。
   *
   * 而本项目的取向是**宁可零命中，不给不相关结果**：
   *
   * ```
   *   「看起来像有」比「明确没有」更有害
   *   —— 用户逐个点开发现全不相干，于是不会去补那条真缺的公式
   * ```
   *
   * 所以：只有当查询里**至少一个 token 是有效中文词或 ≥3 位英文**时
   * 才返回结果；否则明确报零命中。
   */
  /**
   * ⚠ 用 `segmented`（含整串）判断「有没有有效 token」——
   * 若用过滤掉整串的 `queryTokens`，「逃逸」这种整串就是一个词的
   * 查询会被误判为零命中。
   */
  /**
   * ## ★ 零命中的最终判据：**查询里至少一个词在公式数据里真出现过**
   *
   * 前四版都靠「词的长度/形态」来猜「这算不算有效查询」，都被实测打回：
   *
   * ```
   *   版本   判据                     反例
   *   ①     ≥2 字                    「不存在」通过 → 命中无关公式
   *   ②     + 虚词表                 「zzzz」通过（≥3 位英文）
   *   ③     + 英文须在公式里出现      仍漏：分词把整串也当 token
   *   ④     （当前）直接查「有没有任何词命中索引」
   * ```
   *
   * 判据：把分词结果（含整串）逐一拿去与公式的 id/keys/name 做子串比对，
   * **一个都没命中就报零命中**。这比猜「词像不像话」可靠得多 ——
   * 它直接问「库里有没有这个东西」。
   */
  const allTokens = tokenizeChinese(trimmed)
  const anyTokenInLibrary = allTokens.some((t) => {
    if (t.length < 2) return false
    const probe = t.toLowerCase()
    return formulas.some((f) => {
      const haystack = [f.id.toLowerCase(), f.name.toLowerCase(), ...(f.keys ?? []).map((k) => k.toLowerCase())]
      /**
       * **双向包含**：
       * ```
       *   'escape_velocity'.includes('escape_velocity')  → true
       *   '山'.includes('山')?  单字已被上面挡掉
       *   '山高'.includes('山') 相关但不精确 —— 这里只要能判断「库里有这个东西」
       * ```
       * 所以用「任一方向的子串关系」即可 —— 这条判据只回答
       * 「这个查询词在库里有没有对应物」，不判精确度（那是 `isExactMatch` 的事）。
       */
      return haystack.some((h) => h.includes(probe) || probe.includes(h))
    })
  })
  const hasMeaningfulToken = anyTokenInLibrary

  if (hits.length === 0 || !hasMeaningfulToken) {
    return {
      result: '没有匹配「' + trimmed + '」的公式。\n\n' +
        '可能原因：\n' +
        '  · 词太具体 —— 换个更宽的说法（如「腐蚀」而非「氯离子点蚀」）\n' +
        '  · 这个概念在库里确实没有 —— 可以用 evaluate 直接算，或自定义公式\n\n' +
        '库内共 ' + formulas.length + ' 条公式。',
      value: { query: trimmed, count: 0, exactCount: 0, results: [] },
      notice: '零命中 —— 明确告知，不返回不相关的结果。',
    }
  }

  /**
   * 精确命中的 token 集。
   *
   * ⚠ **不能简单过滤掉「与整串相同」的 token** —— 实测踩过：
   * ```
   *   查询「逃逸」→ 整串 '逃逸'，分词结果也是 ['逃逸']
   *   → 过滤后为空 → 精确命中永远为 0
   * ```
   * 所以分词结果为空时**回退到整串本身**。
   */
  const segmented = tokenizeChinese(trimmed)
  const onlySegmented = segmented.filter((t) => t !== trimmed.toLowerCase())
  const tokens = onlySegmented.length > 0 ? onlySegmented : [trimmed.toLowerCase()]

  const isExact = (entry: FormulaEntry): boolean => isExactMatch(tokens, trimmed, entry)

  const exact = hits.filter((h) => isExact(h as unknown as FormulaEntry))
  const fuzzy = hits.filter((h) => !isExact(h as unknown as FormulaEntry))

  /** 正文。 */
  const lines: string[] = []
  if (exact.length > 0) {
    lines.push('匹配「' + trimmed + '」的公式（' + hits.length + ' 条，其中 ' + exact.length + ' 条精确命中）：')
  } else {
    /**
     * ★ 关键：**没有精确命中时必须明说**，不能把它包装成「找到了」。
     *
     * 这是反馈包报过的问题 —— 用户逐个点开发现全不相干，
     * 于是不会去补那条真缺的公式。
     */
    lines.push('⚠ 没有精确匹配「' + trimmed + '」的公式；以下 ' + hits.length + ' 条只是相关度较高：')
  }
  lines.push('')

  for (const hit of hits) {
    const entry = hit as unknown as FormulaEntry & { score: number }
    const marker = isExact(entry) ? '' : '  （近似）'
    lines.push('  ' + entry.id + '  —— ' + entry.name + marker)
    lines.push('     ' + entry.expr)
    /** 参数表。 */
    const required: string[] = []
    const optional: string[] = []
    for (const [key, param] of Object.entries(entry.params ?? {})) {
      if (param.value === null) required.push(key)
      else optional.push(key + '=' + param.value)
    }
    lines.push('     必填: ' + (required.length > 0 ? required.join(', ') : '（无）') +
      (optional.length > 0 ? ' | 可选: ' + optional.join(', ') : ''))
    if (entry.desc !== '') lines.push('     ' + entry.desc)
    lines.push('')
  }

  return {
    result: lines.join('\n').trimEnd(),
    value: {
      query: trimmed,
      count: hits.length,
      exactCount: exact.length,
      results: hits.map((h) => {
        const entry = h as unknown as FormulaEntry & { score: number }
        return {
          id: entry.id,
          name: entry.name,
          expr: entry.expr,
          unit: entry.unit,
          cat: entry.cat,
          exact: isExact(entry),
          score: Number((h as unknown as { score: number }).score.toFixed(4)),
        }
      }),
    },
    notice: fuzzy.length > 0 && exact.length === 0
      ? '这些是近似结果，不是精确匹配 —— 逐个确认是否真的相关。'
      : undefined,
  }
}

/** 检索结果（简化，供内部用）。 */
export interface SearchHit {
  entry: FormulaEntry
  score: number
  exact: boolean
}

/**
 * 检索并返回结构化结果（供 `formulas` 的批量/链式调用用）。
 *
 * @param formulas - 全部公式
 * @param query - 查询
 * @returns 命中列表
 */
export function searchFormulas(formulas: FormulaEntry[], query: string): SearchHit[] {
  const index = getIndex(formulas)
  const hits = index.search(query)
  /** 与 `queryFormulas` 用**同一套** token 归一与判据。 */
  const segmented = tokenizeChinese(query)
  const onlySegmented = segmented.filter((t) => t !== query.toLowerCase())
  const tokens = onlySegmented.length > 0 ? onlySegmented : [query.toLowerCase()]
  return hits.map((h) => {
    const entry = h as unknown as FormulaEntry
    return {
      entry,
      score: (h as unknown as { score: number }).score,
      exact: isExactMatch(tokens, query, entry),
    }
  })
}

/** 供外部用的引擎类型占位（避免未使用告警）。 */
export type { Engine }
