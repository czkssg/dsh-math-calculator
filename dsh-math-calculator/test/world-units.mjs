/**
 * 中外古单位扩充：日本尺贯法、中国历代、欧洲列强传统单位。
 *
 * ## 为什么这些值得测
 *
 * 它们的**正确性无法靠直觉判断** —— 没人记得住「一普特是多少公斤」，
 * 也无法从结果是否"看起来合理"来发现错误。
 *
 * 所以每条断言都用**独立手算的期望值**，不拿工具自己的输出当标准。
 *
 * ## 最容易错的两类
 *
 * 1. **同字不同值**：日尺 30.3 cm vs 市尺 32 cm、日斤 600 g vs 市斤 500 g、
 *    日里 3.93 km vs 中国里 500 m（差 7.9 倍）、日石 180 L vs 市石 100 L。
 * 2. **同音异义**：「间」是日本长度（1.82 m），「日町」既是长度也是面积。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-world-units-'))
process.env.DSH_MATH_CALC_HOME = home

const unitsMod = await import(pathToFileURL(join(root, 'lib/units.js')).href)
const indexMod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { findUnit, UNITS } = unitsMod
const run = indexMod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
/**
 * 用 findUnit 直接查系数 —— 比走 opUnits 快，且能精确到「等于多少公制基准」。
 * @param name - 单位名或别名
 * @returns factor（等于多少公制基准单位）；找不到返回 undefined
 */
function factorOf(name) {
  const hit = findUnit(name)
  return hit ? hit.factor : undefined
}
/**
 * 容差 1e-4：历史单位的**原始数值本身**就只精确到 4 位有效数字
 * （例如「日坪 ≈ 3.30579 m²」源数据只到小数点后 5 位）。
 * 用 1e-6 去卡会把「源数据精度」误判成代码错误。
 */
function near(a, b, tol = 1e-4) {
  return typeof a === 'number' && Math.abs(a / b - 1) < tol
}

console.log('-- 1. 规模与覆盖 --')
{
  assert('单位总数超过 400', UNITS.length > 400, String(UNITS.length))
  const dims = new Set(UNITS.map(function (u) { return u.dimension }))
  /**
   * 量纲从 14 扩到 32（电学 9 / 光学 4 / 化学与核物理 5）。
   * 本套只守「力学与几何那几个」的条目量，量纲总数的断言交给 si-units.mjs。
   */
  assert('量纲覆盖不少于 32 个', dims.size >= 32, String(dims.size))
  for (const d of ['length', 'mass', 'volume', 'area']) {
    const count = UNITS.filter(function (u) { return u.dimension === d }).length
    assert('量纲 ' + d + ' 条目 > 25', count > 25, String(count))
  }
}

console.log('-- 2. 日本尺贯法（与中国同字不同值，最容易混）--')
{
  assert('1 日尺 = 30.303 cm', near(factorOf('日尺'), 0.30303), String(factorOf('日尺')))
  assert('1 间 = 1.81818 m', near(factorOf('间'), 1.81818), String(factorOf('间')))
  assert('1 日里 = 3.927 km', near(factorOf('日里'), 3927.27), String(factorOf('日里')))
  assert('日里 是中国「里」的 7.85 倍', near(factorOf('日里') / factorOf('里'), 7.85454), '')
  assert('1 日升 = 1.8039 L', near(factorOf('日升量'), 0.0018039), String(factorOf('日升量')))
  assert('日升 是中国市升的 1.8 倍', near(factorOf('日升量') * 1000, 1.8039), '')
  assert('1 日匁 = 3.75 g', near(factorOf('日匁'), 0.00375), '')
  assert('1 贯 = 3.75 kg', near(factorOf('kan'), 3.75), '')
  assert('1 日斤 = 600 g（市斤 500 g）', near(factorOf('kin_jp'), 0.6), '')
  assert('1 日坪 = 3.30579 m²', near(factorOf('日坪'), 3.30579), '')
  assert('1 日反 = 991.74 m²', near(factorOf('日反'), 991.74), '')
  assert('1 鲸尺 = 37.88 cm（曲尺的 1.25 倍）', near(factorOf('鲸尺'), 0.378787), '')
}

console.log('-- 3. 中国历代（汉/周/清/库平）--')
{
  assert('1 汉尺 = 23.1 cm（市尺 32 cm）', near(factorOf('汉尺'), 0.231), '')
  assert('1 周尺 = 19.9 cm', near(factorOf('周尺'), 0.199), '')
  assert('1 汉斤 = 258 g（市斤 500 g）', near(factorOf('汉斤'), 0.258), '')
  assert('1 清斤 = 596.8 g', near(factorOf('清斤'), 0.5968), '')
  assert('1 库平两 = 37.3 g', near(factorOf('库平两'), 0.037301), '')
  assert('1 清里 = 576 m', near(factorOf('清里'), 576), '')
  assert('1 周里 = 415.8 m', near(factorOf('周里'), 415.8), '')
  assert('1 汉升 = 198 mL（市升 1 L）', near(factorOf('升_古'), 0.000198), '')
  assert('1 铢 = 0.65 g', near(factorOf('铢'), 0.00065), '')
  assert('1 钧 = 15 kg', near(factorOf('钧'), 15), '')
  assert('1 镒 = 315 g', near(factorOf('镒'), 0.315), '')
  assert('1 咫 = 25.6 cm', near(factorOf('咫'), 0.256), '')
  assert('尺寸分厘毫丝忽 六级都在',
    ['尺', '寸', '分', '厘', '毫', '丝_长度', '忽_长度'].every(function (n) { return findUnit(n) !== undefined }), '')
  assert('石斗升合勺撮圭 容量细分都在',
    ['斗', '市升', '市合', '勺', '撮', '圭'].every(function (n) { return findUnit(n) !== undefined }), '')
}

console.log('-- 4. 欧洲列强传统单位 --')
{
  // 俄制
  assert('1 沙绳 = 2.1336 m', near(factorOf('sazhen'), 2.1336), '')
  assert('1 俄尺 = 0.7112 m', near(factorOf('arshin'), 0.7112), '')
  assert('1 俄磅 = 409.5 g（国际磅 453.6 g）', near(factorOf('funt'), 0.40951241), '')
  assert('1 维德罗 = 12.3 L', near(factorOf('vedro'), 0.012299), '')
  assert('1 佐洛特尼克 = 4.27 g', near(factorOf('zolotnik'), 0.0042662), '')
  // 德制
  assert('1 莱茵尺 = 31.38 cm', near(factorOf('rhein_fuss'), 0.3138), '')
  assert('1 德里 = 7.54 km（英制里 1.61 km）', near(factorOf('meile'), 7539.6), '')
  assert('1 德磅 = 467.6 g', near(factorOf('pfund_de'), 0.4676), '')
  // 法制
  assert('1 法丈 = 1.949 m', near(factorOf('toise'), 1.949), '')
  assert('1 法尺 = 32.48 cm', near(factorOf('pied'), 0.32484), '')
  assert('1 法磅 = 489.5 g', near(factorOf('livre'), 0.48950584), '')
  assert('1 法里 = 4.44 km', near(factorOf('lieue'), 4444.8), '')
  // 其它
  assert('1 西尺 = 83.59 cm', near(factorOf('vara'), 0.8359), '')
  assert('1 阿罗巴 = 11.5 kg（葡阿罗巴 14.7 kg）', near(factorOf('arroba'), 11.502), '')
  assert('葡阿罗巴（14.688 kg）比西班牙（11.502 kg）重 27.7%',
    near(factorOf('arroba_pt') / factorOf('arroba'), 14.688 / 11.502), '')
  assert('1 荷尺 = 28.31 cm', near(factorOf('voet'), 0.2831), '')
  assert('1 瑞典里 = 10.69 km', near(factorOf('mil_sv'), 10688.0), '')
  assert('1 克拉夫特 = 1.897 m', near(factorOf('klafter'), 1.8966), '')
  assert('1 波兰肘 = 59.56 cm', near(factorOf('łokieć'), 0.5956), '')
}

console.log('-- 5. 印度/阿拉伯/奥斯曼/东南亚 --')
{
  assert('1 印度托拉 = 11.66 g', near(factorOf('tola'), 0.0116638), '')
  assert('1 芒德 = 37.3 kg', near(factorOf('maund'), 37.3242), '')
  assert('1 阿拉伯肘 = 65 cm', near(factorOf('dhira'), 0.6496), '')
  assert('1 法尔萨赫 = 5.54 km', near(factorOf('farsakh'), 5544), '')
  assert('1 奥斯曼欧克 = 1.283 kg', near(factorOf('okka'), 1.2829), '')
  assert('奥斯曼尺 65 cm ≠ 俄尺 71.1 cm', near(factorOf('arshin_ott'), 0.6503) && near(factorOf('arshin'), 0.7112), '')
  assert('1 南洋担 = 60.5 kg（市担 50 kg）', near(factorOf('picul'), 60.478), '')
}

console.log('-- 6. 公制基本单位的中文别名（写中文时不会撞墙）--')
{
  for (const [alias, expect] of [['厘米', 0.01], ['毫米', 0.001], ['公分', 0.01], ['微米', 1e-6], ['纳米', 1e-9], ['分米', 0.1], ['毫克', 1e-6]]) {
    assert('「' + alias + '」可查', near(factorOf(alias), expect), String(factorOf(alias)))
  }
}

console.log('-- 7. 公制中转：任意两个非公制单位都能互转 --')
{
  const cases = [
    ['日尺', '英尺', 0.30303 / 0.3048],
    ['汉尺', '市尺', 0.231 / 0.32],  // 市尺 32 cm vs 汉尺 23.1 cm
    ['俄尺', '莱茵尺', 0.7112 / 0.3138],
    ['法磅', '俄磅', 0.48950584 / 0.40951241],
    ['库平两', '金衡盎司', 0.037301 / 0.0311034768],
    ['日合', '市合', 0.00018039 / 0.0001],
    ['西尺', '荷尺', 0.8359 / 0.2831],
  ]
  for (const [a, b, ratio] of cases) {
    const fa = factorOf(a), fb = factorOf(b)
    assert('跨体系互转: ' + a + ' → ' + b, typeof fa === 'number' && typeof fb === 'number' && near(fa / fb, ratio),
      typeof fa === 'number' && typeof fb === 'number' ? (fa / fb).toFixed(4) + ' vs ' + ratio.toFixed(4) : '缺单位')
  }
}

console.log('-- 8. 走真实换算路径（不只是查系数）--')
{
  const r = await run({ operation: 'units', unitValue: 1, unitFrom: '日里', unitTo: '里' })
  assert('日里 → 里 可换算', r.ok, String(r.result || r.error && r.error.message).slice(0, 60))
  const r2 = await run({ operation: 'units', unitValue: 1, unitFrom: '汉斤', unitTo: 'g' })
  assert('汉斤 → 克 可换算', r2.ok && /258/.test(String(r2.result)), '')
  const r3 = await run({ operation: 'units', unitValue: 1, unitFrom: 'astra', unitTo: 'm' })
  assert('不存在的单位仍报错', !r3.ok, '')
}

console.log('-- 9. 无重名、无重别名（扩充最容易埋的雷）--')
{
  const seenName = new Set()
  const dupName = []
  for (const u of UNITS) {
    if (seenName.has(u.name)) dupName.push(u.name)
    seenName.add(u.name)
  }
  assert('单位名不重复', dupName.length === 0, dupName.join(','))
  const seenAlias = new Set()
  const dupAlias = []
  for (const u of UNITS) {
    for (const a of u.aliases || []) {
      if (seenAlias.has(a)) dupAlias.push(a)
      seenAlias.add(a)
    }
  }
  assert('别名不重复', dupAlias.length === 0, dupAlias.join(','))
  const badFactor = UNITS.filter(function (u) { return !Number.isFinite(u.factor) || u.factor <= 0 })
  assert('所有 factor 是正有限数', badFactor.length === 0, badFactor.map(function (u) { return u.name }).join(','))
}

console.log('-- 10. 度量衡与科学单位分开（用户明确要求）--')
{
  /**
   * 两类混在一张表里会让列表没法读：
   * 找「三丈是多少米」的人不该翻过一堆 eV，算原子结合能的人也不关心日尺。
   *
   * 判据是「作者会不会在正文里写它」—— psi 会（工程题材）算度量衡，
   * hartree 不会算科学。
   */
  const science = UNITS.filter(function (u) { return u.category === 'science' })
  const measure = UNITS.filter(function (u) { return u.category !== 'science' })
  assert('科学单位已标出', science.length > 20, String(science.length))
  assert('度量衡占绝大多数', measure.length > science.length * 5, measure.length + ' vs ' + science.length)

  for (const n of ['eV', 'Ry', 'hartree', 'barn', 'amu', 'bohr', 'Å', 'erg', 'dyn', 'slug']) {
    const u = findUnit(n)
    assert('「' + n + '」归科学', u && u.category === 'science', u && String(u.category))
  }
  for (const n of ['里', '斤', '日尺', 'arshin', 'vara', 'psi', 'gal', 'kWh', '节', '光年', 'AU']) {
    const u = findUnit(n)
    assert('「' + n + '」归度量衡', u && u.category !== 'science', u && String(u.category))
  }
}

console.log('-- 11. 列表输出体现分界 --')
{
  const summary = String((await run({ operation: 'units' })).result || '')
  assert('摘要里标出度量衡计数', /度量衡 \d+/.test(summary), '')
  assert('摘要里标出科学计数', /科学 \d+/.test(summary), '')

  const energy = String((await run({ operation: 'units', unitScale: 'energy' })).result || '')
  assert('展开时给出两类条数', /度量衡 \d+ \/ 科学 \d+/.test(energy), energy.split('\n').find(function (l) { return l.includes('能量') }) || '')
  assert('展开时科学单位单独分段', energy.includes('科学单位'), '')
  const meaIdx = energy.indexOf('kWh')
  const sciIdx = energy.indexOf('电子伏')
  assert('度量衡排在科学之前', meaIdx >= 0 && sciIdx >= 0 && meaIdx < sciIdx, meaIdx + ' vs ' + sciIdx)
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
