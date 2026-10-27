/**
 * 分流的泛化能力：用**绕开词表**的句子检验，而非用词表测词表。
 *
 * ## 为什么需要这一套（教训）
 *
 * 我先写了 400 条随机用例，结果全对。但那批用例是**用检测器的词表词生成的**
 * （生成器里就写着「重力」「潮汐」「求和」），于是那次测试只证明了
 * 「词表覆盖了词表」——同义反复，毫无价值。
 *
 * 换成「绕开词表」的句子后，真实水平暴露出来：
 *   · 中文数字（一百米/四千米/十万个）**完全没识别** → 0 分
 *   · 文学描写含「重力」「轨道」被误判 → 反复打扰
 *   · 工程语境（城墙多厚/弓射多远/划桨多久）**完全没覆盖** → 0 分
 *
 * 三轮盲测各修一批，才把准确率从 5/14 提到 16/16。
 *
 * ## 现在守什么
 *
 * 1. 该算的（用各种绕法表达）必须提醒 —— 漏报代价最高
 * 2. 不该算的（含关键词但是文学描写）必须不提醒 —— 误报会让人关掉提醒
 * 3. 中文数字必须能识别 —— 小说文本的常态
 * 4. 简短的纯算术语句归 simple，不打扰
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-generalize-'))
process.env.DSH_MATH_CALC_HOME = home

const d = await import(pathToFileURL(join(root, 'lib/detector.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 该算：绕开词表的各种说法 --')
{
  const SHOULD = [
    // 间接问法 / 场景描述
    '如果一个地方比海平面高四千米，那里的水大概几度开',
    '主角从一百米高的悬崖跳下，落地的速度会有多快',
    '这艘船如果载重翻倍，吃水会加深到什么程度',
    '十万个人每天要吃多少粮食，一年下来又是多少',
    // 口语 / 文学化
    '这匹马驮着两百斤能跑多远的路',
    '要塞的城墙得修多厚才挡得住投石机',
    '这把弓拉满能射穿多远的皮甲',
    '船在无风带要靠桨划多久才能出界',
    // 天文/地理
    '如果月亮比现在近一半，潮水会涨几米',
    '从山脚到山顶气温会下降几度',
    '这颗恒星还能稳定燃烧多久才进入下一阶段',
  ]
  for (const text of SHOULD) {
    const r = d.detectMathNeed(text)
    assert('该提醒: ' + text.slice(0, 22), r.shouldPrompt === true, r.demandClass + ' ' + r.score.toFixed(2))
  }
}

console.log('-- 2. 不该算：含关键词但是文学描写（误报陷阱）--')
{
  /**
   * 这类是**最重要的防线**。
   *
   * 如果「重力压得他喘不过气」被提醒，说明检测器只是词表匹配，
   * 模型在写小说正文时会被反复打断——用户很快会关掉提醒。
   */
  const SHOULD_NOT = [
    '那颗星球的重力压得他喘不过气来',
    '飞船偏离了预定轨道，消失在尘埃里',
    '平均每个人都说这个想法太疯狂',
    '他合计了一下，决定明天再来',
    '风穿过峡谷，带走了最后一点温度',
    '她的笑容在火光里一点点化开',
    '风从窗缝里钻进来，冷得像刀',
    '雪落在剑鞘上，很快就盖了薄薄一层',
    '两个人在屋檐下站到雨停',
    '他不知道自己还剩多少时间',
    '零下三十度的夜里，火堆只剩余烬',
  ]
  for (const text of SHOULD_NOT) {
    const r = d.detectMathNeed(text)
    assert('不提醒: ' + text.slice(0, 22), r.shouldPrompt === false, r.demandClass + ' ' + r.score.toFixed(2))
  }
}

console.log('-- 3. 中文数字必须识别 --')
{
  /**
   * 小说设定文本里「一百米」「三千年」「半倍」是常态。
   * 原实现只认阿拉伯数字，导致这类句子拿到 0 分。
   */
  const CN_CASES = [
    '一百米高的悬崖',
    '四千米的山',
    '十万个人',
    '三千年历史',
    '近一半的距离',
    '两百斤的货物',
  ]
  for (const text of CN_CASES) {
    const r = d.detectMathNeed(text)
    assert('识别中文数量: ' + text, r.signals.some((s) => s.includes('中文数量词')), r.signals.join('/'))
  }

  // 但语气用法不该被当成数量
  const FALSE = ['万一出事呢', '千万别这样']
  for (const text of FALSE) {
    const r = d.detectMathNeed(text)
    assert('语气用法不识别为数量: ' + text,
      !r.signals.some((s) => s.includes('中文数量词')), r.signals.join('/'))
  }
}

console.log('-- 4. 中文运算符（加/减/乘/除）--')
{
  const r = d.detectMathNeed('128除4是多少')
  assert('「128除4是多少」归 simple', r.demandClass === 'simple', r.demandClass)
  assert('且不提醒', r.shouldPrompt === false, String(r.shouldPrompt))
}

console.log('-- 5. 简单算术仍不打扰 --')
{
  for (const text of ['17*23', '2+2', '(3+4)*5/2', '12.5/0.4']) {
    const r = d.detectMathNeed(text)
    assert('不打扰: ' + text, r.demandClass === 'simple' && !r.shouldPrompt, r.demandClass)
  }
}

console.log('-- 6. 误报率与漏报率（统计口径）--')
{
  let falsePositive = 0
  let falseNegative = 0
  const SHOULD_NOT = [
    '那颗星球的重力压得他喘不过气来',
    '飞船偏离了预定轨道，消失在尘埃里',
    '平均每个人都说这个想法太疯狂',
    '他合计了一下，决定明天再来',
    '风穿过峡谷，带走了最后一点温度',
    '她的笑容在火光里一点点化开',
    '风从窗缝里钻进来，冷得像刀',
    '雪落在剑鞘上，很快就盖了薄薄一层',
    '两个人在屋檐下站到雨停',
    '他不知道自己还剩多少时间',
  ]
  for (const text of SHOULD_NOT) {
    if (d.detectMathNeed(text).shouldPrompt) falsePositive++
  }
  assert('误报 0 条', falsePositive === 0, String(falsePositive))

  const SHOULD = [
    '如果把海平面往下拉两百米，有多少陆地露出来',
    '城里的井要挖多深才见水',
    '要塞粮仓存三十万石够守多久',
  ]
  for (const text of SHOULD) {
    if (!d.detectMathNeed(text).shouldPrompt) falseNegative++
  }
  assert('漏报 ≤1 条（可接受）', falseNegative <= 1, String(falseNegative))
}

console.log('-- 7. 分档不与提醒决策脱节 --')
{
  // simple 一定不提醒
  for (const text of ['2+2', '17*23']) {
    const r = d.detectMathNeed(text)
    assert('simple 档不提醒: ' + text, r.demandClass === 'simple' && r.shouldPrompt === false, '')
  }
  // forced 一定提醒
  for (const text of ['把这20个数字求和：1,2,3', '这份CSV里所有销售额加起来']) {
    const r = d.detectMathNeed(text)
    assert('forced 档提醒: ' + text.slice(0, 18), r.demandClass === 'forced' && r.shouldPrompt === true, '')
  }
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
