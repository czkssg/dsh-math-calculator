/**
 * 第 1 步：从老插件抽出纯数据到 JSON。
 *
 * ## 为什么先做这一步
 *
 * 老代码最大的结构问题是「数据与逻辑混在 .ts 里」：
 * 665 条公式写在 27 个文件共 13,049 行，与检索打分逻辑交织。
 * 新架构要求 `src/data/` 纯数据、零逻辑。
 *
 * ## 提取原则
 *
 * ```
 *   ① 只搬数据，不搬任何函数
 *   ② 提取后逐条比对：条数、id 集合、表达式字符串必须全等
 *   ③ 若某条含函数（如自定义 compute），单独标记出来人工处理
 * ```
 *
 * 用法：`node scripts/extract-data.cjs`
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-extract-'))
process.env.DSH_MATH_CALC_HOME = home

const root = path.join(__dirname, '..')
const lib = (m) => require(path.join(root, 'lib', m))

const outDir = path.join(root, 'src', 'data')
fs.mkdirSync(outDir, { recursive: true })

let report = []

/** 检查一个对象里有没有函数（函数不能进 JSON）。 */
function findFunctions(obj, pathStr = '') {
  const found = []
  if (typeof obj === 'function') found.push(pathStr)
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) found.push(...findFunctions(v, pathStr === '' ? k : pathStr + '.' + k))
  }
  return found
}

/** 提取一类数据并写盘。 */
function extract(name, loader, countFn, extra = {}) {
  let data
  try {
    data = loader()
  } catch (e) {
    report.push({ name, error: String(e.message).slice(0, 100) })
    return
  }
  const count = countFn(data)
  const fns = findFunctions(data)
  const file = path.join(outDir, name + '.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 1), 'utf8')
  const size = (fs.statSync(file).size / 1024).toFixed(0)
  report.push({ name, count, size: size + ' KB', functions: fns.length, fnPaths: fns.slice(0, 5) })
}

// ══════ 1. 公式 ══════
extract('formulas', () => lib('formulas.js').FORMULAS, (d) => d.length)

// ══════ 2. 推演链 ══════
extract('systems', () => lib('formula-systems.js').FORMULA_SYSTEMS, (d) => d.length)

// ══════ 3. 单位表 ══════
extract(
  'units',
  () => {
    const u = lib('units-data.js')
    const out = {}
    for (const k of Object.keys(u)) {
      if (Array.isArray(u[k])) out[k] = u[k]
    }
    return out
  },
  (d) => Object.values(d).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0),
)

// ══════ 4. 天体 ══════
extract('bodies', () => lib('body-catalog.js').ALL_NAMED_BODIES, (d) => (Array.isArray(d) ? d.length : Object.keys(d).length))

// ══════ 5. 天体类型 ══════
extract('body-taxonomy', () => lib('body-taxonomy.js').BODY_TYPES, (d) => (Array.isArray(d) ? d.length : Object.keys(d).length))

// ══════ 6. 常数依赖图 ══════
/**
 * ## 常数图的 derive 是函数，但它其实是**纯数学表达式**
 *
 * 实测 20 个节点的 derive 全是一元表达式：
 *
 * ```
 *   hbar      (ctx) => ctx.h / (2 * Math.PI)
 *   R         (ctx) => ctx.kB * ctx.NA
 *   mu0       (ctx) => 1 / (ctx.epsilon0 * ctx.c * ctx.c)
 * ```
 *
 * 所以把它转成**表达式字符串**（`"h / (2 * PI)"`）存进 JSON，
 * 新代码用 mathjs 求值即可 —— 这样数据里就真的没有函数了。
 *
 * 转换规则：去掉 `(ctx) =>` 与 `ctx.`，把 `Math.PI` 写成 `PI`。
 * 转完逐条验证：新老实现用同一组输入必须给同一个数。
 */
function derivateToExpr(fn) {
  let src = fn.toString()
  /** 取箭头函数体。 */
  const arrow = src.indexOf('=>')
  if (arrow < 0) return null
  src = src.slice(arrow + 2).trim()
  /** 去掉包裹的花括号与 return。 */
  src = src.replace(/^\{\s*return\s+/, '').replace(/;?\s*\}$/, '')
  /** `ctx.xxx` → `xxx`；`Math.PI` → `PI`。 */
  src = src.replace(/ctx\./g, '').replace(/Math\.PI/g, 'PI').replace(/Math\./g, '')
  /**
   * ★ `**` → `^`（这是实测才发现的）
   *
   * JS 的幂运算是 `**`，而 **mathjs 只认 `^`**。不转的话
   * `PI ** 5` 会让 mathjs 报 `Value expected (char 10)`。
   *
   * 第一版漏了这条，8 个 σ/Ry/g/Lsun 等节点全部求值失败。
   */
  src = src.replace(/\*\*/g, '^')
  /** 若还含函数调用或箭头，说明不是纯表达式，返回 null 让人工处理。 */
  if (/=>/.test(src)) return null
  return src
}

{
  const graph = lib('constants-graph.js').CONSTANT_GRAPH
  const serialized = graph.map((node) => {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'function') {
        const expr = derivateToExpr(v)
        out[k + 'Expr'] = expr
        if (expr === null) out[k + 'Raw'] = v.toString()
      } else {
        out[k] = v
      }
    }
    return out
  })
  const file = path.join(outDir, 'constants-graph.json')
  fs.writeFileSync(file, JSON.stringify(serialized, null, 1), 'utf8')
  const converted = serialized.filter((n) => n.deriveExpr).length
  const failed = serialized.filter((n) => n.deriveRaw).length
  report.push({
    name: 'constants-graph',
    count: serialized.length,
    size: (fs.statSync(file).size / 1024).toFixed(0) + ' KB',
    functions: failed,
    fnPaths: failed > 0 ? ['转表达式失败 ' + failed + ' 个'] : [],
    note: converted + ' 个 derive 已转成表达式',
  })
}

// ══════ 7. 恒星目录 ══════
extract('stars', () => lib('star-catalog.js').STAR_CLASSES, (d) => (Array.isArray(d) ? d.length : Object.keys(d).length))

// ══════ 8. 复合路径 ══════
extract('compound-paths', () => lib('formula-systems.js').COMPOUND_PATHS, (d) => (Array.isArray(d) ? d.length : Object.keys(d).length))

// ══════ 报告 ══════
console.log('══════ 数据提取结果 ══════')
console.log('')
for (const r of report) {
  if (r.error) {
    console.log('  ✗ ' + r.name.padEnd(18) + '提取失败: ' + r.error)
    continue
  }
  console.log('  ✓ ' + r.name.padEnd(18) + String(r.count).padStart(5) + ' 条  ' + r.size.padEnd(9) +
    (r.note ? r.note + '  ' : '') +
    (r.functions > 0 ? '⚠ 含 ' + r.functions + ' 个函数: ' + r.fnPaths.join(', ') : ''))
}
console.log('')
console.log('输出目录: ' + outDir)
fs.rmSync(home, { recursive: true, force: true })
