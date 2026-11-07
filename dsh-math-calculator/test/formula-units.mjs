/**
 * 公式与单位的耦合（v2.3.0）。
 *
 * ## 用户要的是什么
 *
 * 原话是「希望计算功能可以带着单位、有物理意义的符号计算，自动匹配公式或 AI 调动公式」，
 * 举的例子是：
 *
 * ```
 *   V*T=L      V=10m/s   T=1s   →   L=10m
 * ```
 *
 * 以及后一句「最好使用同一体系单位，把 60 km 折算成里」。
 *
 * 这套测试守的就是这两条，外加它们的边界。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-fu-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool
const pu = await import(pathToFileURL(join(root, 'lib/param-units.js')).href)
const units = await import(pathToFileURL(join(root, 'lib/units.js')).href)
const converter = pu.makeConverter(units.convert)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
const text = async (args) => String((await run(args)).result || '')

console.log('-- 1. 用户的例子：符号 + 带单位变量 --')
{
  /**
   * 这是最直接的验收：变量带单位进作用域，乘出来带正确量纲。
   * 旧行为是变量**被整个丢弃**，`V*T` 静默返回 `"V T"`（单字母被当单位符号相乘）。
   */
  const t1 = (await text({ operation: 'evaluate', expression: 'V*T', variables: { V: '10 m/s', T: '1 s' } })).trim()
  assert('V*T 带单位 → 10 m', /^10 m$/.test(t1), t1)

  const t2 = (await text({ operation: 'evaluate', expression: 'V*T', variables: { V: '30 里/h', T: '2 时辰' } })).trim()
  assert('中文单位变量可算', /^60 km$/.test(t2), t2)

  /** 链式赋值也要能带单位（这是交互里更自然的写法）。 */
  const t3 = await text({ operation: 'evaluate', expressions: ['V=10 m/s', 'T=1 s', 'L=V*T'] })
  assert('链式赋值带单位', /L=V\*T = 10 m/.test(t3), '')

  /** 纯数字仍然要精确（不能因为走了单位路径就退化）。 */
  const big = (await text({ operation: 'evaluate', expression: 'x+1', variables: { x: '1e100' } })).trim()
  assert('大数字符串仍精确', big.startsWith('10000') && big.length > 90, '长度 ' + big.length)

  /** 无法解析的值仍要如实上报，不能静默变成单位符号。 */
  const bad = await run({ operation: 'evaluate', expression: 'V*T', variables: { V: 'hello', T: '1 s' } })
  assert('非法值不被静默吞掉', bad.ok === false, String(bad.ok))
}

console.log('-- 2. 公式参数带单位：校验与换算 --')
{
  const ok = async (label, overrides, re) => {
    const t = await text({ operation: 'formula', formula: 'velocity_uniform', overrides })
    assert(label, re.test(t), t.split('\n').filter((l) => /结果|单位换算/.test(l)).join(' / ').slice(0, 110))
  }
  await ok('SI 单位原样', { s: '10 m', t: '1 s' }, /结果: 10 m\/s/)
  await ok('公里/小时自动换算', { s: '10 km', t: '1 h' }, /结果: 2\.77777778 m\/s/)
  await ok('里/时辰自动换算', { s: '60 里', t: '2 时辰' }, /结果: 2\.08333333 m\/s/)

  /**
   * ★ 量纲不符必须报错 —— 这是「带物理意义的符号计算」的核心价值。
   * 以前 `10 kg` 传给位移参数会静默按 10 算，结果看着正常、物理上荒谬。
   */
  const mismatch = await run({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: '10 kg', t: '1 s' } })
  assert('量纲不符报错', mismatch.ok === false, String(mismatch.ok))
  assert('报错说明两边是什么量纲', /质量|长度/.test(String(mismatch.error?.message)), String(mismatch.error?.message).slice(0, 70))

  /** 裸数字照旧接受 —— 不猜 `10` 是米还是公里。 */
  const bare = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: 10, t: 1 } })
  assert('裸数字照旧', /结果: 10 m\/s/.test(bare), '')

  /** 换算过程要交代，否则调用方会以为是 bug。 */
  const conv = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: '10 km', t: '1 h' } })
  assert('交代了换算过程', /【单位换算】/.test(conv) && /km → m/.test(conv), '')
  /** 没做换算时不该凭空多出一行。 */
  const noConv = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: 10, t: 1 } })
  assert('未换算时不出现换算行', !/【单位换算】/.test(noConv), '')
}

console.log('-- 3. 参数声明单位要从描述里正确抠出来 --')
{
  /**
   * 这一节守的是最难发现的一类错：**复合单位被切成单个字母**。
   *
   * 踩过：`"速度 m/s"` 按空白与斜杠切，末尾拿到 `s` —— 于是速度参数
   * 被当成「时间」，`kinetic_energy` 的 `v` 传 `10 m/s` 会报「m/s 是速度，s 是时间」。
   */
  const isKnown = (name) => { try { return units.findUnit(name) !== undefined } catch { return false } }
  const cases = [
    ['位移 m', 'm'],
    ['时间 s', 's'],
    ['速度 m/s', 'm/s'],
    ['质量 kg', 'kg'],
    ['质量1 kg', 'kg'],
    ['能量 J', 'J'],
  ]
  for (const [desc, expect] of cases) {
    const got = pu.unitFromDescription(desc, isKnown)
    assert('描述「' + desc + '」→ ' + expect, got === expect, '实得 ' + JSON.stringify(got))
  }
  /** 抠不出时返回空串，不许瞎猜。 */
  assert('无单位描述返回空串', pu.unitFromDescription('数量 个', isKnown) === '', '')
}

console.log('-- 4. 同体系折算（用户明确要求）--')
{
  /**
   * 用户原话：「最好使用同一体系单位，把 60 km 折算成 里。」
   *
   * 主结果必须保持 SI（那是公式参数的口径），但作者写正文用的是里/时辰，
   * 所以补一行折算 —— 两种口径都给，谁也不牺牲。
   */
  const conv = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: '60 里', t: '2 时辰' } })
  assert('输入用里时辰时给出折算', /【同体系折算】/.test(conv), conv.split('\n').filter((l) => /同体系/.test(l)).join('') || '（无）')
  /** 60 里 ÷ 2 时辰 = 30 里/时辰，这是可以用心算核对的值。 */
  assert('折算值正确（30 里/时辰）', /30 里\/时辰/.test(conv), '')

  /** 长度单参数：60 里 应折成 60 里（原本就是里，不该变成公里）。 */
  assert('单量纲折算', pu.traditionalNote('30000 m', ['length'], converter) === '【同体系折算】约 60 里（你的输入用了传统单位）',
    String(pu.traditionalNote('30000 m', ['length'], converter)))
  /** 时间单参数。 */
  assert('时间折算', pu.traditionalNote('14400 s', ['time'], converter)?.includes('2 时辰') === true,
    String(pu.traditionalNote('14400 s', ['time'], converter)))

  /**
   * ★ 反向对照：**没给传统单位就不许折算**。
   * 否则每一条公式结果都拖一行多余的附注，噪音远大于收益。
   */
  assert('无传统单位不折算', pu.traditionalNote('10 m/s', [], converter) === null, '')
  const siOnly = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: '10 m', t: '1 s' } })
  assert('纯 SI 输入不出折算行', !/【同体系折算】/.test(siOnly), '')
  const bareOnly = await text({ operation: 'formula', formula: 'velocity_uniform', overrides: { s: 10, t: 1 } })
  assert('裸数字不出折算行', !/【同体系折算】/.test(bareOnly), '')
}

console.log('-- 5. 传统单位族表 --')
{
  assert('里 属于长度族', pu.familiesOfUnits(['里']).includes('length'), '')
  assert('时辰 属于时间族', pu.familiesOfUnits(['时辰']).includes('time'), '')
  assert('斤 属于质量族', pu.familiesOfUnits(['斤']).includes('mass'), '')
  assert('亩 属于面积族', pu.familiesOfUnits(['亩']).includes('area'), '')
  assert('SI 单位不属于传统族', pu.familiesOfUnits(['m', 's', 'kg']).length === 0, '')
  assert('多族同时命中', pu.familiesOfUnits(['里', '时辰']).length === 2, '')
}

console.log('-- 6. 换算适配器读对字段 --')
{
  /**
   * 踩过：`convert` 的结果字段叫 `conversion.result`，不是 `conversion.value`。
   * 读错字段时拿到的值是 undefined，而**换算记录照样写**，
   * 于是 `60 里` 被当成 60 m —— 有记录无效果，最难发现的一种。
   */
  const result = converter(60, '里', 'm')
  assert('适配器返回换算后的值', result.ok === true && result.value === 30000,
    JSON.stringify(result))
  const bad = converter(1, 's', '里')
  assert('量纲不符时如实失败', bad.ok === false, '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)