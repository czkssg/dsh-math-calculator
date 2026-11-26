/**
 * 注释覆盖自检。
 *
 * 用户要求：代码要能被后来的人或 AI 自检，不能有「不明代码」。
 * 本脚本把这条要求变成可执行检查：
 *   1. 每个 .ts 文件必须有模块头注释（/** 开头）
 *   2. 模块头必须带 @module 标签（.d.ts 豁免）
 *   3. 每个导出（function/const/class/interface/type）必须有紧邻的文档注释
 *
 * 用法：node scripts/doc-coverage.mjs [--json]
 * 退出码非 0 = 有未注释的代码，需要先补注释。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXPORT_RE = /^export\s+(async\s+)?(function|const|class|interface|type|enum)\b/
const RE_EXPORT_RE = /^export\s+(type\s+)?\{[^}]*\}\s+from\b/

/** 收集 src 下全部 .ts。 */
export function collectFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (name.endsWith('.ts')) files.push(path)
    }
  }
  walk(root)
  return files.sort()
}

/** 是否紧邻文档注释（向上最多看 6 行，允许 // 行）。 */
function hasDocAbove(lines, index) {
  for (let look = index - 1; look >= Math.max(0, index - 6); look -= 1) {
    const prev = lines[look].trim()
    if (prev.endsWith('*/')) return true
    if (prev === '' || prev.startsWith('//')) continue
    break
  }
  return false
}

/**
 * 审计目录。
 * @param root - 源码目录（绝对或相对）。
 * @returns 统计与违规清单（不打印）。
 */
export function auditDocs(root) {
  const files = collectFiles(root)
  const missingHeaders = []
  const missingModules = []
  const missingExports = []
  let exports = 0
  let commentLines = 0
  let totalLines = 0

  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/')
    const text = readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    totalLines += lines.length
    commentLines += lines.filter((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
    }).length

    const first = lines.find((line) => line.trim() !== '') ?? ''
    if (!first.trim().startsWith('/**')) missingHeaders.push(rel)
    const header = lines.slice(0, 25).join('\n')
    if (!file.endsWith('.d.ts') && !header.includes('@module') && !text.slice(0, 2000).includes('@module')) {
      missingModules.push(rel)
    }

    lines.forEach((line, index) => {
      if (!EXPORT_RE.test(line) && !RE_EXPORT_RE.test(line)) return
      exports += 1
      if (!hasDocAbove(lines, index)) missingExports.push(rel + ': ' + line.trim().slice(0, 70))
    })
  }

  return {
    files: files.length,
    exports,
    commentRatio: totalLines === 0 ? 0 : commentLines / totalLines,
    missingHeaders,
    missingModules,
    missingExports,
    unsafeComments: collectUnsafeComments(root, files),
  }
}

/**
 * 找出「块注释提前闭合」的文件。
 *
 * ## 为什么需要
 *
 * AGENTS.md 的「已知的坑」第一条就是它：在注释里写「星号紧跟斜杠」这两个字符，
 * 会提前闭合块注释，**整段编译失败**，而且报错行号通常不等于出错位置。
 * 这条规则一直只写在文档里，没有确定性检查——开发这个检查时自己又踩了三次。
 *
 * ## 判据
 *
 * 逐行扫描块注释：闭合符之后若还有非空白、且不是代码声明的正文，
 * 说明它提前闭合了，判为可疑。行尾正常闭合放行。
 *
 * @param root - src 根目录
 * @param files - 待检查文件绝对路径
 * @returns 可疑位置列表
 */
function collectUnsafeComments(root, files) {
  const out = []
  for (const file of files) {
    const rel = relative(root, file).replace(/\\/g, '/')
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    let inBlock = false
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (!inBlock) {
        const open = line.indexOf('/**')
        if (open < 0) continue
        inBlock = true
        const rest = line.slice(open + 3)
        if (rest.indexOf('*/') >= 0) inBlock = false
        continue
      }
      const closeAt = line.indexOf('*/')
      if (closeAt < 0) continue
      const after = line.slice(closeAt + 2).trim()
      /** 行尾闭合、或后面直接跟声明，都是正常的。 */
      const normal = after === '' || /^(export|const|function|type|interface|class|let|var|import|if|for|while|return|\/\/)/.test(after)
      if (!normal) out.push(rel + ':' + (i + 1) + ' 块注释提前闭合（闭合符后还有正文）：' + line.trim().slice(0, 60))
      inBlock = false
    }
  }
  return out
}

/** 直接运行时打印报告。 */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const root = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const result = auditDocs(root)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log('== 注释覆盖 ==')
    console.log(`  文件 ${result.files} 个，导出 ${result.exports} 个，注释行占比 ${(result.commentRatio * 100).toFixed(1)}%`)
    console.log(`  缺模块头：${result.missingHeaders.length}`)
    console.log(`  缺 @module：${result.missingModules.length}`)
    console.log(`  缺导出注释：${result.missingExports.length}`)
    for (const item of result.missingHeaders) console.log('  [header] ' + item)
    for (const item of result.missingModules) console.log('  [@module] ' + item)
    for (const item of result.missingExports.slice(0, 20)) console.log('  [export] ' + item)
    console.log(`  可疑块注释：${result.unsafeComments.length}`)
    for (const item of result.unsafeComments) console.log('  [unsafe] ' + item)
  }
  const failed = result.missingHeaders.length + result.missingModules.length + result.missingExports.length + result.unsafeComments.length
  if (failed > 0) {
    console.log('\n✗ 有未注释的代码，请先补注释。')
    process.exitCode = 1
  } else {
    console.log('\n✓ 注释覆盖通过。')
  }
}
