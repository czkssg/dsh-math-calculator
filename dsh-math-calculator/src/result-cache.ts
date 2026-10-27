/**
 * 计算结果缓存：同样的输入不再算第二遍。
 *
 * ## 为什么值得做（而不只是优化）
 *
 * 反复算同一个式子在真实使用里很常见：
 *   · AI 校验自己的结论（「再算一次确认」）——输入完全相同
 *   · 同一批数据换着角度问（同一条 `1/7` 在几个不同问题里出现）
 *   · 推演时反复引用同一个常量式
 *
 * 每次重算的代价不只是 CPU，还有**结果文本再次进入上下文**：
 * 一个 64 位小数的返回值约 65 字符，重复十次就是 650 字符的 token。
 * 缓存命中时仍要返回结果（AI 需要看到值），但省掉了重算，
 * 更重要的是对**批量和重复调用**能显著降低总开销。
 *
 * ## 缓存键必须包含什么
 *
 * 少放一个就会返回**错的结果**——这比不缓存危险得多：
 *   · 规范化后的表达式（`1/7` 与 `1 / 7` 应算同一条，但不能把 `1/7` 和 `2/7` 撞车）
 *   · operation（`evaluate "1+1"` 与 `solve "1+1"` 结果不同）
 *   · precision（计算精度不同，结果不同）
 *   · displayPrecision（只影响显示，但也进键——否则命中后位数不对）
 *   · **当前常数状态**（改了 c/G 之后同样的式子结果不同）
 *   · **工作区**（不同世界的公式表/变量可能不同）
 *
 * 最后两项最容易漏。实测过：改常数后若缓存不失效，
 * 会返回「改之前」的数——那是静默错误。
 *
 * ## 容量与淘汰
 *
 * 固定容量 + LRU。不设 TTL：常数或工作区一变，键就变了，旧条目自然不再命中；
 * 保留它们没有危害，只是占内存，所以用容量上限控制。
 *
 * @module dsh-math-calculator/result-cache
 */

/** 一条缓存记录。 */
interface CacheEntry {
  /** 缓存的返回值（不深拷贝，调用方不得修改）。 */
  value: unknown
  /** 命中次数（供统计）。 */
  hits: number
}

/** 缓存容量上限。 */
const MAX_ENTRIES = 256

/** 主存储。Map 保留插入顺序，正好用来做 LRU。 */
const store = new Map<string, CacheEntry>()

/** 命中/未命中统计（供诊断）。 */
let hits = 0
let misses = 0

/**
 * 把一个值规范成稳定的字符串，用于参与缓存键。
 *
 * 为什么不用 JSON.stringify：对象键的顺序不保证一致
 * （`{a:1,b:2}` 与 `{b:2,a:1}` 应视为同一个键），
 * 且浮点表示可能因来源不同而不一致。这里按键名排序后拼接。
 *
 * @param value - 任意值
 * @returns 稳定字符串
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  const kind = typeof value
  if (kind === 'number') {
    // 数字统一用 15 位有效数字，避免 -0 / 0.1+0.2 这类表示差异
    return Number.isFinite(value as number) ? (value as number).toPrecision(15) : String(value)
  }
  if (kind === 'string' || kind === 'boolean') return String(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (kind === 'object') {
    const object = value as Record<string, unknown>
    const keys = Object.keys(object).sort()
    return '{' + keys.map(function (key) {
      return key + ':' + stableStringify(object[key])
    }).join(',') + '}'
  }
  return String(value)
}

/**
 * 计算缓存键。
 *
 * @param parts - 参与键的各个部分（按固定顺序传入）
 * @returns 键字符串
 */
export function cacheKey(parts: readonly unknown[]): string {
  return parts.map(stableStringify).join('\u0001')
}

/**
 * 取缓存。
 *
 * @param key - 缓存键
 * @returns 命中则返回缓存值；未命中返回 undefined
 */
export function getCached(key: string): unknown {
  const entry = store.get(key)
  if (entry === undefined) {
    misses++
    return undefined
  }
  hits++
  entry.hits++
  // LRU：命中后移到队尾（最新）
  store.delete(key)
  store.set(key, entry)
  return entry.value
}

/**
 * 存缓存。
 *
 * @param key - 缓存键
 * @param value - 要缓存的值
 */
export function setCached(key: string, value: unknown): void {
  if (store.has(key)) store.delete(key)
  store.set(key, { value, hits: 0 })
  // 超容量时淘汰最久未使用的（队首）
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next()
    if (oldest.done) break
    store.delete(oldest.value)
  }
}

/**
 * 清空缓存（改常数、切工作区时应当调用）。
 *
 * 为什么需要显式清空：缓存的键里已经含常数与工作区，
 * 理论上不会串；但**清空是个安全网**——
 * 万一某条路径漏把常数放进键里，清空能兜住，而不是静默返回旧值。
 */
export function clearCache(): void {
  store.clear()
}

/**
 * 缓存统计（供诊断与测试）。
 *
 * @returns 条目数、命中、未命中
 */
export function cacheStats(): { size: number; hits: number; misses: number } {
  return { size: store.size, hits: hits, misses: misses }
}

/**
 * 重置统计（不影响已存条目）。
 */
export function resetCacheStats(): void {
  hits = 0
  misses = 0
}
