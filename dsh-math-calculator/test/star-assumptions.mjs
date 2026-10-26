/**
 * 恒星假设的显式声明：不许静默把用户的星替换成太阳。
 *
 * ## 为什么需要这一套
 *
 * `world` 的恒星目录只有**主序星**（O5V…M5V 共 9 种），没有巨星、次巨星、白矮星。
 * 而默认恒星是太阳（G2V）。
 *
 * 问题在于这两件事以前都是**静默**发生的：传 `starClass:'F5III'` 会回退到最近的
 * 主序型 G2V，提示被推到整份输出最末尾（第 150 行左右）。而前 100 多行看起来
 * 完全正常——14°C、宜居、天空蓝、四季分明。于是读前 20 行的人（和 AI）会拿着
 * 一份基于太阳的结论去写设定。
 *
 * 实测代价：F5 III 巨星亮度约 25 L☉，在 0.98 AU 处平衡温度
 *   · 按太阳算：257 K（−16°C，冻结）
 *   · 按真实巨星算：576 K（303°C，铅会熔化）
 * 同一颗行星，结论从「冰封」翻到「熔融」。这就是必须显式声明的理由。
 *
 * ## 本套测试守什么
 *
 * 1. 没给恒星参数时必须声明「已默认成太阳」，且声明在输出**最前面**
 * 2. 给了不认识的光谱型时必须声明替换了多少、可选值是什么
 * 3. 给了巨星（I/II/III/IV）时必须额外警告「模型只支持主序星」
 * 4. 给了合法光谱型或显式温度时**不该**出现「默认太阳」的噪音
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-starnote-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

/** 跑一次世界推演，返回文本与首 10 行。 */
async function world(args) {
  const r = await run({ operation: 'world', ...args })
  const text = String(r.result || '')
  return { ok: r.ok, text, head: text.split('\n').slice(0, 12).join('\n'), value: r.value }
}

console.log('-- 1. 不给恒星参数 → 必须声明默认太阳 --')
{
  const r = await world({ planetMass: 1 })
  assert('推演成功', r.ok, '')
  assert('声明了「默认成太阳」', /默认成太阳/.test(r.text), '')
  assert('声明里带了 G2V 与 5778 K',
    r.text.includes('G2V') && r.text.includes('5778'), '')
  // 关键：必须在前 12 行，不能压到末尾
  assert('声明出现在输出最前面（前 12 行内）', /默认成太阳/.test(r.head),
    r.head.split('\n').slice(0, 4).join(' | '))
  assert('有「先说清楚这些假设」标题', r.head.includes('先说清楚这些假设'), '')
}

console.log('-- 2. 不认识的光谱型 → 必须声明替换 --')
{
  const r = await world({ planetMass: 1, starClass: 'ZZ9' })
  assert('推演成功（不崩）', r.ok, '')
  assert('声明「未找到光谱型」', /未找到光谱型/.test(r.text), '')
  assert('点名了用户给的值', r.text.includes('ZZ9'), '')
  assert('列出可选值', /可选值：O5V/.test(r.text), '')
  assert('声明在前 12 行内', /未找到光谱型/.test(r.head), '')
}

console.log('-- 3. 巨星必须额外警告「只支持主序星」（关键回归）--')
{
  // F5III 是某设定里的 F5-IIIa 巨星。旧实现静默当太阳处理。
  const r = await world({ planetMass: 1, starClass: 'F5III' })
  assert('推演成功', r.ok, '')
  assert('识别出亮度级 III', /「III」级/.test(r.text), '')
  assert('明确说模型只支持主序星', /只支持主序星/.test(r.text), '')
  assert('警告「不能直接采信」', /不能直接采信/.test(r.text), '')
  assert('给出修复方向（显式给 starMass/starRadius）',
    r.text.includes('starMass') && r.text.includes('starRadius'), '')
  assert('两条声明都在前 12 行内',
    /未找到光谱型/.test(r.head) && /只支持主序星/.test(r.head), '')

  // 其它亮度级也要认：I / II / IV
  for (const cls of ['K5I', 'G2II', 'A5IV']) {
    const x = await world({ planetMass: 1, starClass: cls })
    assert('识别亮度级 ' + cls, /巨\/次巨星|只支持主序星/.test(x.text), '')
  }
}

console.log('-- 4. 合法输入 → 不该出现默认太阳的噪音 --')
{
  const ok = await world({ planetMass: 1, starClass: 'K5V' })
  assert('K5V 不声明默认太阳', !/默认成太阳/.test(ok.text), '')
  assert('K5V 不声明替换', !/未找到光谱型/.test(ok.text), '')

  // 简写 G2 应被接受为 G2V，不算替换
  const short = await world({ planetMass: 1, starClass: 'G2' })
  assert('简写 G2 被接受（不报替换）', !/未找到光谱型/.test(short.text), '')

  // 显式温度也够，不该说「默认太阳」
  const byTemp = await world({ planetMass: 1, starTemp: 3200 })
  assert('显式 starTemp 不声明默认太阳', !/默认成太阳/.test(byTemp.text), '')
  assert('显式 starTemp 生效（红矮星量级）',
    /M[0-9]V|3200|红矮/.test(byTemp.text), String(byTemp.text).match(/恒星:[^\n]*/)?.[0] || '')

  // 显式 starMass 也不该有噪音
  const byMass = await world({ planetMass: 1, starMass: 10 })
  assert('显式 starMass 不声明默认太阳', !/默认成太阳/.test(byMass.text), '')
  assert('显式 starMass=10 生效（短寿命大质量星）',
    /M[0-9]?V|Myr|寿命/.test(byMass.text), String(byMass.text).match(/主序寿命[^\n]*/)?.[0] || '')
}

console.log('-- 5. 声明进了结构化数据（AI 能读到，不只是文本）--')
{
  const r = await world({ planetMass: 1 })
  assert('value.starNotes 是数组',
    Array.isArray(r.value && r.value.starNotes), typeof (r.value && r.value.starNotes))
  assert('starNotes 非空', (r.value && r.value.starNotes && r.value.starNotes.length) > 0,
    String(r.value && r.value.starNotes && r.value.starNotes.length))

  const g = await world({ planetMass: 1, starClass: 'F5III' })
  const notes = (g.value && g.value.starNotes) || []
  assert('巨星情形下有 2 条说明', notes.length >= 2, String(notes.length))
  assert('说明里含「只支持主序星」', notes.some((n) => /只支持主序星/.test(n)), '')
}

console.log('-- 6. 与 warnings 分开（性质不同，不能混）--')
{
  // 密度超致密会进 warnings；默认太阳会进 starNotes。两者不该串
  const r = await world({ planetMass: 3, planetRadius: 0.8 })
  const notes = (r.value && r.value.starNotes) || []
  const warnings = (r.value && r.value.warnings) || []
  assert('starNotes 只说输入假设', notes.every((n) => /恒星|光谱|默认/.test(n)),
    notes.join(' | ').slice(0, 80))
  assert('warnings 不含恒星假设', !warnings.some((w) => /默认成太阳/.test(w)), '')
}

try {
  rmSync(home, { recursive: true, force: true })
} catch {
  /* 忽略 */
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
