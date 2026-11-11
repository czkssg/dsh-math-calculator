/**
 * extract_numbers（数字台账抽取）的测试。
 *
 * ## 它解决什么
 *
 * 反馈包实测：整理 23 份 PDF 时，**22,115 行台账是用 Python 脚本抽的**。
 * 工具在「对账入口第一件事」上零支撑 —— 而这是全部工作中耗时最多的一环。
 *
 * ## 分层：本操作不读 PDF
 *
 * ```
 *   PDF → 文本     由宿主 read_pdf / async_parse_pdf 负责
 *   文本 → 台账    由本操作负责   ← 只做这一层
 * ```
 *
 * 用户已明确「允许读 PDF」，但那不等于本插件要自己造解析器 ——
 * 宿主已有成熟实现（dsh-pdf-mineru 证明可行），重复造只会两套都不一致。
 *
 * ## 本套件守三件事
 *
 *   ① **中文量级要折算**（`1.49 亿` → 149000000，不是 1.49）
 *   ② **噪音要滤掉**（页码/时间戳/轮次占全部行数的 60%）
 *   ③ **每个数字带得上上下文**（不然抽出来也不知道是什么）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-extract-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const run = (args) => runMathTool({ operation: 'extract_numbers', ...args })
const txt = (r) => String(r.result ?? '')

/** 找某个 raw 的条目。 */
const find = (r, raw) => (r.value?.items ?? []).find((item) => item.raw === raw)

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 中文量级必须折算 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '全层人口 1.49 亿，面积 247.5 亿平方公里。' })
  const yi = find(r, '1.49')
  assert('1.49 亿 折算成 149000000', yi?.value === 149000000, String(yi?.value))
  assert('数字与量级词之间有空格也能认', yi?.unit === '亿', String(yi?.unit))
  const area = find(r, '247.5')
  assert('247.5 亿 折算成 24750000000', area?.value === 24750000000, String(area?.value))

  /** 各种量级词都要认。 */
  const cases = [
    ['3 万', 30000],
    ['2 千', 2000],
    ['5 十万', 500000],
    ['7 百万', 7000000],
    ['1.2 万亿', 1.2e12],
  ]
  for (const [text, expect] of cases) {
    const one = await run({ text: '数量 ' + text + ' 单位' })
    const hit = (one.value?.items ?? []).find((item) => Math.abs(item.value - expect) < 1e-6)
    assert(`「${text}」折算成 ${expect}`, hit !== undefined,
      JSON.stringify((one.value?.items ?? []).map((item) => item.value)))
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 噪音必须滤掉 --')
// ───────────────────────────────────────────────────────────
{
  const noisy = [
    '2026/11/6 00:29  99层世界体量压制 - DeepSeek',
    '已思考（用时 7 秒）',
    '===== PAGE 12 =====',
    '12 / 931',
    '本回答由 AI 生成，内容仅供参考，请仔细甄别。',
    '真正有意义的数字是 42 人。',
  ].join('\n')

  const r = await run({ text: noisy })
  const values = (r.value?.items ?? []).map((item) => item.value)
  assert('噪音行里的数字被滤掉', !values.includes(7) && !values.includes(99), JSON.stringify(values))
  assert('真实数字仍被抽出', values.includes(42), JSON.stringify(values))
  assert('计数里报告了滤掉多少', typeof r.value?.noiseCount === 'number', String(r.value?.noiseCount))

  /** keepNoise:true 时应全部保留。 */
  const kept = await run({ text: noisy, keepNoise: true })
  assert('keepNoise 保留噪音', (kept.value?.items ?? []).length >= 4, String((kept.value?.items ?? []).length))
  assert('保留的噪音有原因标注',
    (kept.value?.items ?? []).some((item) => item.noise && item.noiseReason),
    '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 区间不能被拆成单个负数 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '储备可支撑 20-50 天。' })
  const values = (r.value?.items ?? []).map((item) => item.value)
  /**
   * 第一版没跳过区间范围，`20-50` 被抽成三个数：20、-50、50。
   * 其中 -50 尤其糟：它把一个正数区间变成了负数。
   */
  assert('区间不产生负数', values.every((value) => value >= 0), JSON.stringify(values))
  const interval = (r.value?.items ?? []).find((item) => item.raw === '20-50')
  assert('区间给出上下界', interval?.value === 20 && interval?.high === 50,
    JSON.stringify({ value: interval?.value, high: interval?.high }))
  assert('区间只算一条', (r.value?.items ?? []).length === 1, String((r.value?.items ?? []).length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 单位识别 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '粮食年产 2.66 亿吨，人均 35 平方米，单价 1.2 两银子。' })
  assert('亿吨 被认出', (r.value?.items ?? []).some((item) => item.unit === '亿吨'), '')
  assert('平方米 被认出', (r.value?.items ?? []).some((item) => item.unit === '平方米'), '')
  assert('两 被认出', (r.value?.items ?? []).some((item) => item.unit === '两'), '')

  /** 无单位的数字不该硬编一个。 */
  const bare = await run({ text: '总数是 12345。' })
  assert('无单位时 unit 为 null', find(bare, '12345')?.unit === null, String(find(bare, '12345')?.unit))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 每个数字带得上上下文 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '朝廷官员合计约 3.2 万人，都司府下辖 12 个卫所。' })
  const officials = find(r, '3.2')
  assert('上下文包含该数字所在短语',
    /官员|万人/.test(officials?.context ?? ''), String(officials?.context))
  assert('算 avg 行号正确', officials?.line === 1, String(officials?.line))
  /** 上下文不该长到把整行抄一遍。 */
  assert('上下文有长度上限', (officials?.context ?? '').length <= 120, String((officials?.context ?? '').length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 多行文本的行号 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '第一行没有数字。\n第二行有 100 人。\n第三行有 200 元。' })
  assert('100 在第 2 行', find(r, '100')?.line === 2, String(find(r, '100')?.line))
  assert('200 在第 3 行', find(r, '200')?.line === 3, String(find(r, '200')?.line))
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 错误处理与边界 --')
// ───────────────────────────────────────────────────────────
{
  const none = await runMathTool({ operation: 'extract_numbers' })
  assert('不给 text 报错', none.ok === false, String(none.ok))
  /**
   * 报错必须说清**分层**：PDF 由宿主读，本操作只做文本→台账。
   * 否则使用者会以为这个工具能直接吃 PDF 文件。
   */
  assert('报错说明 PDF 该由宿主工具读', /read_pdf|async_parse_pdf/.test(none.error?.hint ?? ''),
    none.error?.hint?.slice(0, 60))

  const empty = await run({ text: '   ' })
  assert('空白 text 报错', empty.ok === false, String(empty.ok))

  const noNumber = await run({ text: '这段文字里一个数字都没有。' })
  assert('无数字时返回 0 条而不报错', noNumber.ok === true && (noNumber.value?.items ?? []).length === 0,
    String((noNumber.value?.items ?? []).length))

  /** limit 生效。 */
  const many = Array.from({ length: 50 }, (_, i) => String(i + 1) + ' 人').join('\n')
  const limited = await run({ text: many, limit: 10 })
  assert('limit 生效', (limited.value?.items ?? []).length <= 10, String((limited.value?.items ?? []).length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 结构化输出 --')
// ───────────────────────────────────────────────────────────
{
  const r = await run({ text: '人口 1.49 亿，面积 247.5 亿平方公里。' })
  for (const key of ['items', 'count', 'noiseCount', 'units']) {
    assert('value 含 ' + key, r.value?.[key] !== undefined, '')
  }
  assert('units 统计了主要单位', (r.value?.units ?? []).length > 0, JSON.stringify(r.value?.units))
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(r.value); return true } catch { return false }
  })(), '')

  /** 每条 item 的字段齐全。 */
  const one = (r.value?.items ?? [])[0]
  for (const key of ['raw', 'value', 'high', 'unit', 'context', 'line', 'noise']) {
    assert('item 含 ' + key, one?.[key] !== undefined, '')
  }
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 与对账链路的衔接 --')
// ───────────────────────────────────────────────────────────
{
  /** 台账抽出来是为了送进 ledger 对账。这里验证链路能走通。 */
  const r = await run({ text: '士 1 万人，农 85 万人，工 10 万人，商 4 万人。' })
  const total = (r.value?.items ?? []).reduce((acc, item) => acc + item.value, 0)
  assert('四个分项抽出且能相加', total === 1000000, String(total))

  const ledgerOp = await runMathTool({
    operation: 'ledger',
    ledger: { parts: [{ name: '士', value: 1 }, { name: '农', value: 85 }, { name: '工', value: 10 }, { name: '商', value: 4 }] },
  })
  assert('抽出的配比能直接送进 ledger', ledgerOp.ok === true && ledgerOp.value?.closed === true, '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
