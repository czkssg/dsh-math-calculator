/**
 * 文档解析：PDF → 干净文本 / 表格 / 数字台账。
 *
 * ## 来源
 *
 * 设计来自工作区 `实践文档/_tools/pdf2md.py`（DeepSeek 打印版 PDF 转换器）：
 * 页眉页脚清洗、中文硬折行拼接、思考块标记、引用编号处理、表格还原。
 * 这里用纯 JS（`pdf-parse` v2，Apache-2.0）重做**文本与表格**两部分，
 * 不再依赖 Python/PyMuPDF；坐标级的折行还原用启发式替代（pdf-parse 不给字号）。
 *
 * ## 边界（照实说）
 *
 * - 不做 OCR：扫描件会得到很少文本（返回 `lowText: true`）；
 * - 思考块只能标出「已思考（用时 X 秒）」这一行，后续段落无法按字号标引用块；
 * - 跨页表格会被拆开；单元格内折行可能散成段落（内容不丢）。
 *
 * @module dsh-math-calculator/features/document/pdf
 */

import { readFileSync, statSync } from 'node:fs'
import { CalcError } from '../../core/errors.js'
import { runExtractNumbers } from '../graph/extract-numbers.js'

/** 结果。 */
export interface DocumentOutcome {
  result: string
  value: unknown
  notice?: string
}

/** DeepSeek 打印版 PDF 的固定噪声。 */
const NOISE = [
  /^\d{4}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}\s+\d{1,2}:\d{2}.*$/i,
  /^\s*https?:\/\/\S*chat\.deepseek\.com/i,
  /^\s*\d{1,4}\s*\/\s*\d{1,4}\s*$/,
  /^\s*本回答由\s*AI\s*生成.*$/,
]

/** 清洗一行（页眉页脚/全角空格）。 */
function cleanLine(line: string): string {
  const trimmed = line.replace(/\u00A0/g, ' ').replace(/\u2009/g, '').replace(/\u200b/g, '').trim()
  if (trimmed === '') return ''
  if (NOISE.some((pattern) => pattern.test(trimmed))) return ''
  return trimmed
}

/** 标题/列表行（折行拼接时不能并进上一行）。 */
function isStrongStart(line: string): boolean {
  return /^(#{1,6}\s|[-*•]\s|\d{1,3}[.、．]\s?|[（(]?[一二三四五六七八九十百]+[）、]|第[一二三四五六七八九十百零〇\d]+[章节条款回]|已思考\s*[（(])/.test(line)
}

/** 中文折行拼接：上一行不以句末标点结尾且下一行不是标题时接上。 */
function joinWrapped(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const previous = out[out.length - 1]
    if (previous !== undefined && !/[。！？；：.!?;:」』）)]$/.test(previous) && !isStrongStart(line) && !isStrongStart(previous) && previous.length >= 12) {
      /** 中英边界补空格，中文直接相连。 */
      const glue = previous.endsWith(' ') || /[A-Za-z0-9]$/.test(previous) ? ' ' : ''
      out[out.length - 1] = previous + glue + line
    } else {
      out.push(line)
    }
  }
  return out
}

/** 清洗全文（分页保留）。 */
export function cleanPdfText(rawPages: string[]): { pages: string[]; text: string; lowText: boolean } {
  const pages = rawPages.map((page) => joinWrapped(page.split(/\r?\n/).map(cleanLine).filter((line) => line !== '')))
  const text = pages.map((page) => page.join('\n')).join('\n\n')
  return { pages: pages.map((page) => page.join('\n')), text, lowText: text.trim().length < 200 }
}

/**
 * 解析 PDF。
 *
 * @param path - PDF 路径
 * @returns 文本与表格
 * @throws {CalcError} 文件不存在/不是 PDF/解析失败
 */
export async function extractPdf(path: string): Promise<{ pages: string[]; text: string; tables: string[]; lowText: boolean; bytes: number; pagesCount: number }> {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new CalcError('missing_params', 'pdf 需要 path（PDF 文件路径）', '例如 {operation:"document", document:{action:"extract", path:"D:/某文档.pdf"}}。')
  }
  if (!/\.pdf$/i.test(path)) throw new CalcError('invalid_argument', '不是 PDF 文件（扩展名必须是 .pdf）：' + path, '')
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    throw new CalcError('unknown_symbol', 'PDF 文件不存在：' + path, '检查路径；路径分隔符在 Windows 上可用 / 或 \\\\。')
  }
  if (size > 80 * 1024 * 1024) throw new CalcError('invalid_argument', 'PDF 太大（' + (size / 1024 / 1024).toFixed(1) + ' MB > 80 MB）', '先拆分或只导出需要的章节。')

  const buffer = readFileSync(path)
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const textResult = await parser.getText()
    const pages: string[] = Array.isArray(textResult.pages) ? textResult.pages.map((page: { text?: string }) => String(page.text ?? '')) : [String(textResult.text ?? '')]
    const cleaned = cleanPdfText(pages)
    let tables: string[] = []
    try {
      const tableResult = await parser.getTable()
      tables = Array.isArray(tableResult.pages)
        ? tableResult.pages.flatMap((page: { tables?: unknown[] }) => (page.tables ?? []).map((table: unknown) => JSON.stringify(table)))
        : []
    } catch {
      /* 表格提取失败不影响正文 */
    }
    return { ...cleaned, tables, bytes: size, pagesCount: pages.length }
  } catch (error) {
    throw new CalcError('invalid_argument', 'PDF 解析失败：' + (error instanceof Error ? error.message : String(error)), '确认文件没加密/损坏；纯扫描件需要 OCR（本工具不做）。')
  } finally {
    try { await parser.destroy() } catch { /* 忽略 */ }
  }
}

/**
 * 执行 document。
 *
 * @param input - 动作与路径
 * @returns 文本 / 表格 / 数字台账
 * @throws {CalcError} 参数缺失/解析失败
 */
export async function runDocument(input: { action?: string; path?: string; text?: string; keepNoise?: boolean; limit?: number } = {}): Promise<DocumentOutcome> {
  const action = typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim() : 'extract'
  if (action === 'numbers') {
    const text = typeof input.text === 'string' && input.text.trim() !== '' ? input.text : undefined
    if (text === undefined && typeof input.path === 'string' && input.path.trim() !== '') {
      const pdf = await extractPdf(input.path)
      const numbers = runExtractNumbers(pdf.text, { ...(input.keepNoise === true ? { keepNoise: true } : {}), ...(typeof input.limit === 'number' ? { limit: input.limit } : {}) })
      return { result: '═══ PDF 数字台账 ═══\n  ' + pdf.pagesCount + ' 页，' + pdf.text.length + ' 字符' + (pdf.lowText ? '（文本很少，可能是扫描件）' : '') + '\n\n' + numbers.result, value: { numbers: numbers.value, pages: pdf.pagesCount, lowText: pdf.lowText } }
    }
    if (text === undefined) throw new CalcError('missing_params', 'numbers 需要 path（PDF）或 text（纯文本）', '')
    const numbers = runExtractNumbers(text, { ...(input.keepNoise === true ? { keepNoise: true } : {}), ...(typeof input.limit === 'number' ? { limit: input.limit } : {}) })
    return { result: numbers.result, value: numbers.value }
  }

  if (action === 'extract') {
    const pdf = await extractPdf(input.path as string)
    const preview = pdf.text.length > 12000 ? pdf.text.slice(0, 12000) + '\n\n…（已截断，全文 ' + pdf.text.length + ' 字符）' : pdf.text
    return {
      result: '═══ PDF 文本 ═══\n ' + pdf.pagesCount + ' 页 / ' + pdf.bytes + ' 字节 / ' + pdf.text.length + ' 字符' + (pdf.lowText ? '\n ⚠ 文本很少（可能是扫描件，本工具不做 OCR）' : '') + '\n\n' + preview,
      value: { pages: pdf.pagesCount, chars: pdf.text.length, lowText: pdf.lowText, text: pdf.text, tables: pdf.tables.length },
      ...(pdf.lowText ? { notice: '文本很少，可能是扫描件；需要 OCR 才能对账' } : {}),
    }
  }

  if (action === 'tables') {
    const pdf = await extractPdf(input.path as string)
    if (pdf.tables.length === 0) return { result: '没有检测到表格（' + pdf.pagesCount + ' 页）', value: { pages: pdf.pagesCount, tables: 0 } }
    return { result: '═══ PDF 表格（' + pdf.tables.length + ' 个）═══\n' + pdf.tables.slice(0, 20).join('\n'), value: { pages: pdf.pagesCount, tables: pdf.tables } }
  }

  throw new CalcError('unknown_argument', '不认识的 document 动作「' + action + '」', '可用：extract（文本）/ tables（表格）/ numbers（数字台账）。')
}
