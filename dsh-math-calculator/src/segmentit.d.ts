/**
 * `segmentit` 的最小类型声明。
 *
 * ## 为什么手写
 *
 * 该包没有 `.d.ts`（实测 `node_modules/segmentit/dist/cjs/index.js` 无类型）。
 * 我们只用它两个符号：`Segment`（分词器类）与 `useDefault`（装载词典）。
 *
 * ## API 说明（实测）
 *
 * ```js
 * const seg = useDefault(new Segment())
 * seg.doSegment('山能长多高')
 * // → [{ w: '山' }, { w: '能' }, { w: '长' }, { w: '多' }, { w: '高' }]
 * ```
 *
 * 每个 token 是 `{ w: string, p?: number }`（`p` 是词性，本项目不用）。
 */
declare module 'segmentit' {
  /** 分词结果的一词。 */
  interface SegmentToken {
    /** 词本身。 */
    w: string
    /** 词性（可选，本项目不用）。 */
    p?: number
  }

  /** 分词器。 */
  class Segment {
    /** 对一段文本分词。 */
    doSegment(text: string, options?: Record<string, unknown>): SegmentToken[]
  }

  /**
   * 装载默认词典。
   *
   * @param segment - 分词器实例
   * @returns 同一个实例（已装好词典）
   */
  function useDefault(segment: Segment): Segment

  export { Segment, useDefault }

  /**
   * ⚠ ESM 侧是**默认导出**形状（实测 `import * as s` 只给
   * `{ default, 'module.exports' }`）。
   *
   * 所以用 `import x from 'segmentit'` 后从 `x.Segment` 取 ——
   * 代码里对两种形状都做了兼容。
   */
  const _default: { Segment: typeof Segment; useDefault: typeof useDefault }
  export default _default
}
