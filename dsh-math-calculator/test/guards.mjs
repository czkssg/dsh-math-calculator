/**
 * 防呆层：在数字旁边多放一句「这个数看起来不对劲」。
 *
 * ## 这份测试的由来
 *
 * 来自一份 200 余条表达式的实测复盘。里面最贵的错误不是算错，而是
 * **算对了却没人觉得不对**：
 *
 * ```
 *   2645.6*28*3600*8000/1e9  →  2133.41184
 *   调用者贴上「万吨」标签     →  以此为据指控原文「错了 10 倍」
 *   真相：2133 是千吨，万吨应为 /1e10 → 213.34
 * ```
 *
 * 返回体当时只有一行裸数字，既不说量级、也不核对 label。
 *
 * ## 验收标准
 *
 * 1. 文档里记录的四类真实错误，能被拦住
 * 2. **正确的用例必须零误报** —— 误报会让整条通道被关掉，比漏报更糟
 * 3. 反向对照：撤掉防呆，这些断言必须变红
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-guards-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const guards = await import(pathToFileURL(join(root, 'lib/guards.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. 量级标注：裸数字旁边要能看到数量级 --')
{
  const r = await run({ operation: 'evaluate', expressions: ['2645.6*28*3600*8000/1e9'] })
  const t = String(r.result)
  assert('结果带量级标注', /2133\.41184 \(~10³\)/.test(t), t.split('\n')[2])
  assert('10³ 的上标正确', t.includes('~10³'), '')

  // 小数字不该被标（吵）
  const small = await run({ operation: 'evaluate', expressions: ['2+2'] })
  assert('个位数字不标量级', !/~10/.test(String(small.result)), String(small.result).split('\n')[2])

  // 科学计数法本身已表达量级，不重复标
  const sci = await run({ operation: 'evaluate', expressions: ['1e20'] })
  assert('大数仍标量级', /~10²⁰/.test(String(sci.result)), String(sci.result).split('\n')[2])
}

console.log('-- 2. 文档 1.3：四条同错（/1e9 当万吨）必须被拦 --')
{
  const t = await text({
    operation: 'evaluate',
    expressions: [
      { label: '年耗N2万吨', expr: '2645.6*28*3600*8000/1e9' },
      { label: '年耗O2万吨', expr: '6614*32*3600*8000/1e9' },
      { label: '年耗H2O万吨', expr: '2645.6*18*3600*8000/1e9' },
      { label: '年产福斯特石万吨', expr: '2645.6*126*3600*8000/1e9' },
    ],
  })
  assert('出现量级待核提示', t.includes('量级待核'), '')
  assert('指出四条都是「万」标签', /4 条 label 含「万」/.test(t), '')
  assert('指出量级差一个数量级', /差 1 个数量级/.test(t), '')
  assert('给出正确的除数建议（/1e10）', t.includes('/1e10'), '')
  assert('列出四条的值', t.includes('2133.41184') && t.includes('6095.4624'), '')
}

console.log('-- 3. 文档 1.2：label「亿度」配结果 2.88e8 必须被拦 --')
{
  const t = await text({
    operation: 'evaluate',
    expressions: [{ label: '年发电量亿度_按8000h', expr: '1000e6 * 8000 * 3600 / 1e8' }],
  })
  assert('提示 label 含「亿」', /label 含「亿」/.test(t), '')
  assert('指出按字面读会大得离谱', /2\.88e16/.test(t), '')
}

console.log('-- 4. 反向对照：正确的用例必须零误报 --')
{
  /**
   * 这一节比前面几节更重要。
   * 误报会让使用者关掉整条提示通道 —— 那还不如不做。
   */
  const correct = [
    ['年耗N2万吨（正确 /1e10）', '2645.6*28*3600*8000/1e10'],   // 213.34，量级 10²，与「万」差 2
    ['储耗比-中值', '139e8/152e4'],                              // 9144，label 无量级词
    ['应纳税额', '650*3840*0.13'],                               // 324480，label 无量级词
    ['总量万吨（量级已对齐）', '2645.6*28*3600*8000/1e10'],
  ]
  const t = await text({
    operation: 'evaluate',
    expressions: correct.map(function (c) { return { label: c[0], expr: c[1] } }),
  })
  assert('正确用例不出现量级待核', !t.includes('量级待核'), t.split('\n').slice(-4).join(' | '))
}

console.log('-- 5. 「万」与「万亿」不能被认混（长词优先）--')
{
  /**
   * 若「万亿」被先匹配成「万」，量级会从 10¹² 错成 10⁴ —— 差 8 个数量级，
   * 整个判据就废了。这条守的是匹配顺序。
   */
  const wan = guards.magnitudeOfLabel('利润万亿')
  assert('「万亿」认成 10¹²', wan && wan.power === 12, wan && String(wan.power))
  const yi = guards.magnitudeOfLabel('发电量亿度')
  assert('「亿」认成 10⁸', yi && yi.power === 8, yi && String(yi.power))
  const qian = guards.magnitudeOfLabel('年耗千吨')
  assert('「千」认成 10³', qian && qian.power === 3, qian && String(qian.power))
  assert('无 label 时返回 null', guards.magnitudeOfLabel('') === null, '')
  assert('label 无量级词时返回 null', guards.magnitudeOfLabel('求和') === null, '')
}

console.log('-- 6. 「成功」必须说清它不代表什么 --')
{
  /**
   * 实测反馈原话：「成功 7，失败 0」会让调用方跳过复核 ——
   * 因为「成功」两个字读起来像「对了」。
   */
  const t = await text({ operation: 'evaluate', expressions: ['1+1', '2*2'] })
  assert('汇总说明只表示算式无错', /只表示算式无语法\/符号错/.test(t), t.split('\n').slice(-1)[0])
  assert('汇总明说不含结论正确性', /不含结论正确性/.test(t), '')
  // 有失败时仍报成功/失败数
  const t2 = await text({ operation: 'evaluate', expressions: ['1+1', 'qqq'] })
  assert('有失败时仍给成功/失败数', /成功 1，失败 1/.test(t2), t2.split('\n').slice(-1)[0])
}

console.log('-- 7. terse 模式不许把量级提示吞掉 --')
{
  /**
   * terse 的承诺是「省标题与统计」，**不是**省掉风险提示。
   * 若把 ⚠ 吞了，调用方会以为一切正常。
   */
  const r = await run({
    operation: 'evaluate',
    expressions: [{ label: '年发电量亿度', expr: '1000e6 * 8000 * 3600 / 1e8' }],
    terse: true,
  })
  const t = String(r.result)
  assert('terse 仍带量级标注', /~10⁸/.test(t), t)
  assert('terse 仍给量级待核提示', /量级待核|label 含/.test(t), t.slice(0, 120))
}

console.log('-- 8. 分组只看 label 的量级词，不跨量级误判 --')
{
  // 一批里混不同量级词：各自成组，组内不足 2 条则不报
  const t = await text({
    operation: 'evaluate',
    expressions: [
      { label: '年耗万吨', expr: '2133' },
      { label: '年发电亿度', expr: '314' },
    ],
  })
  assert('不同量级词不互相拉group', !/4 条/.test(t), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
