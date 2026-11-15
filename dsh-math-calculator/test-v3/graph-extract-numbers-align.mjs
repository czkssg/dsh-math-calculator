/**
 * extract_numbers 对齐测试：中文量级 / 单位 / 区间 / 上下文。
 *
 * ## 与老实现对齐的四条硬判据
 *
 * 1. 中文量级折算：`1.49 亿` → 149000000，且单位里保留「亿」（老版第一版把量级
 *    折算进数值却丢了单位，读者看不出这是 1.49 亿）。
 * 2. 区间不拆成单值：`20-50 天` 只能出一条 20–50，不能多出 `-50`（老版第一版把
 *    正数区间抽成了负数）。
 * 3. 噪音过滤：「已思考（用时 7 秒）」这类行不进台账（老版实测 60% 是噪音）。
 * 4. 上下文：每个数字带它所在那半句，否则抽出来也不知道是什么。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-graph-extract-align-'))

const ext = await import(pathToFileURL(join(root, 'lib/features/graph/extract-numbers.js')).href)

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
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ───────────────────────────────────────────────────────────
console.log('-- 1. 中文量级折算 --')
// ───────────────────────────────────────────────────────────
{
  const out = ext.runExtractNumbers('年产量约 1.49 亿平方公里，人口 2.66 亿吨。')
  const items = out.value.items
  const first = items[0]
  assert('★ 1.49 亿 → 149000000', near(first.value, 1.49e8, 1), String(first.value))
  assert('★ 单位里保留「亿」', (first.unit ?? '').includes('亿'), first.unit)
  assert('raw 只放数字原文（不含亿）', first.raw === '1.49', first.raw)
  const second = items.find((item) => item.raw === '2.66')
  assert('2.66 亿 → 266000000', near(second.value, 2.66e8, 1), String(second.value))

  const wan = ext.runExtractNumbers('耕地 3000 万亩。')
  assert('3000 万 → 3e7', near(wan.value.items[0].value, 3e7, 1), String(wan.value.items[0].value))
  assert('单位是「万亩」', wan.value.items[0].unit === '万亩', wan.value.items[0].unit)

  const combo = ext.runExtractNumbers('总资产 1.2 万亿。')
  assert('★ 组合量级「万亿」优先于「万」', near(combo.value.items[0].value, 1.2e12, 1), String(combo.value.items[0].value))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 区间 / 千分位 / 科学计数 --')
// ───────────────────────────────────────────────────────────
{
  const range = ext.runExtractNumbers('工期 20-50 天，视情况而定。')
  assert('★ 区间只出一条', range.value.items.length === 1, String(range.value.items.length))
  assert('★ 下界 20 万？不——这里是 20', near(range.value.items[0].value, 20, 1e-9), String(range.value.items[0].value))
  assert('上界 50', near(range.value.items[0].high, 50, 1e-9), String(range.value.items[0].high))
  assert('区间单位是「天」', range.value.items[0].unit === '天', range.value.items[0].unit)

  const rangeWan = ext.runExtractNumbers('年产 20-50 万吨。')
  assert('★ 区间带量级 → 上下界都 ×1e4', near(rangeWan.value.items[0].value, 2e5, 1) && near(rangeWan.value.items[0].high, 5e5, 1),
    JSON.stringify([rangeWan.value.items[0].value, rangeWan.value.items[0].high]))

  const comma = ext.runExtractNumbers('人口 1,234 人。')
  assert('千分位 1,234 → 1234', near(comma.value.items[0].value, 1234, 1e-9), String(comma.value.items[0].value))

  const sci = ext.runExtractNumbers('距离 1.2e6 米。')
  assert('科学计数 1.2e6 → 1200000', near(sci.value.items[0].value, 1.2e6, 1), String(sci.value.items[0].value))

  const tilde = ext.runExtractNumbers('含水率 30~40%。')
  assert('~ 也是区间', near(tilde.value.items[0].value, 30, 1e-9) && near(tilde.value.items[0].high, 40, 1e-9), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 噪音过滤 --')
// ───────────────────────────────────────────────────────────
{
  const text = [
    '===== PAGE 12 =====',
    '已思考（用时 7 秒）',
    '城市人口约 92 万人，粮食自给率 60%。',
    '2026-11-13 修订',
    '12:30 开会',
    '本回答由 AI 生成，内容仅供参考，请仔细甄别',
  ].join('\n')
  const filtered = ext.runExtractNumbers(text)
  assert('★ 噪音行全部被滤掉', filtered.value.items.length === 2, String(filtered.value.items.length))
  assert('保留的是人口与自给率', filtered.value.items.every((item) => ['92', '60'].includes(item.raw)),
    JSON.stringify(filtered.value.items.map((item) => item.raw)))
  assert('行号仍然正确（第 3 行）', filtered.value.items[0].line === 3, String(filtered.value.items[0].line))

  const kept = ext.runExtractNumbers(text, { keepNoise: true })
  assert('keepNoise 保留全部', kept.value.items.length > 2, String(kept.value.items.length))
  const noise = kept.value.items.find((item) => item.noise)
  assert('保留的噪音带原因', noise?.noiseReason !== undefined && noise.noiseReason.length > 0, noise?.noiseReason)
  assert('★ 渲染里噪音标注原因', kept.result.includes('噪音：'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 上下文与单位识别 --')
// ───────────────────────────────────────────────────────────
{
  const out = ext.runExtractNumbers('首都人口约 120 万人，港口年吞吐 3 亿吨；驻军 5 个师。')
  const population = out.value.items.find((item) => item.raw === '120')
  assert('★ 上下文取所在半句', population.context.includes('首都人口约'), population.context)
  assert('上下文不含后半句', !population.context.includes('港口'), population.context)

  const unit = out.value.items.find((item) => item.raw === '3')
  assert('单位是「亿吨」', unit.unit === '亿吨', unit.unit)
  const soldier = out.value.items.find((item) => item.raw === '5')
  assert('单位是「个」', soldier.unit === '个', soldier.unit)

  const noUnit = ext.runExtractNumbers('第 3 章讲了 4 件事。')
  assert('认不出单位的给 null', noUnit.value.items.some((item) => item.unit === null), '')

  const long = ext.runExtractNumbers('甲'.repeat(200) + ' 42 人。')
  assert('★ 上下文截断到 120 字', long.value.items[0].context.length <= 120, String(long.value.items[0].context.length))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 汇总与台账渲染 --')
// ───────────────────────────────────────────────────────────
{
  const out = ext.runExtractNumbers('人口 100 万人；粮食 50 万吨；军队 3 万人；城池 12 座。\n第二行 7 人。')
  assert('计数正确', out.value.count === out.value.items.length, '')
  assert('单位分组按次数排序', out.value.units.length > 0 && out.value.units[0].count >= out.value.units[out.value.units.length - 1].count, '')
  assert('result 标出「这只是台账，不是验算」', out.result.includes('不是验算'), '')
  assert('result 说明中文量级已折算', out.result.includes('中文量级已折算'), '')

  const many = ext.runExtractNumbers(Array.from({ length: 80 }, (_, i) => '第 ' + (i + 1) + ' 项 5 人').join('\n'))
  assert('★ 超过 60 条时只渲染前 60 并给 notice', many.result.includes('还有') && (many.notice ?? '').includes('60'), String(many.notice))
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
