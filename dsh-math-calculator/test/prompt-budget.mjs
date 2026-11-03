/**
 * 注入提示词的字数分配。
 *
 * ## 为什么这件事要测
 *
 * 注入内容是**每轮对话都随上下文下发**的固定成本。它的正确性不只是「有没有说」，
 * 还包括「比例对不对」—— 一个低频能力写 300 字、而高频的选择指引一句不写，
 * 就是浪费：钱花了，模型还是不知道该怎么选。
 *
 * 三条判据：
 *   1. **不罗列全清单**：能力清单已在 schema 的 enum 与 help 里，重复下发是同一份信息付两次钱。
 *   2. **高频内容占比最高**：「选哪个 operation」应是最长的一段。
 *   3. **不自相矛盾**：曾经同时写着「默认全精度」与「默认 8 位小数」两条，模型读到的是冲突指令。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const home = mkdtempSync(join(tmpdir(), 'dsh-prompt-'))
process.env.DSH_MATH_CALC_HOME = home

const mod = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const run = mod.runMathTool

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}
/**
 * 取某一档的**完整**注入正文。
 *
 * ⚠ 不能从 `promptMode` 的返回里取 —— 那里是为省上下文**截到 500 字符**的预览，
 * 用它断言长度会得出「full 与 brief 一样长」的错误结论。直接读模块导出的构建函数。
 */
const awareness = await import(pathToFileURL(join(root, 'lib/awareness.js')).href)
async function section(mode) {
  await run({ promptMode: mode })
  return String(awareness.buildSystemPromptSection() || '')
}

console.log('-- 1. 三档都要能切，且 off 真的不注入 --')
{
  const off = await run({ promptMode: 'off' })
  assert('off 命令成功', off.ok, '')
  assert('off 不产生注入正文', (await section('off')) === '', '')
  const brief = await section('brief')
  const full = await section('full')
  assert('brief 有内容', brief.length > 0, String(brief.length))
  assert('full 比 brief 长', full.length > brief.length, brief.length + ' vs ' + full.length + ' 字符')
}

console.log('-- 2. brief 长度受控（每轮都付费）--')
{
  const brief = await section('brief')
  assert('brief 控制在 900 字符内', brief.length <= 900, String(brief.length))
  assert('brief 不超过 1200 字符（硬上限）', brief.length <= 1200, String(brief.length))
}

console.log('-- 3. 高频内容占比最高（按频率分配字数）--')
{
  const brief = await section('brief')
  const blocks = brief.split(/\n\n/)
  const opBlock = blocks.find(function (b) { return b.includes('选哪个 operation') })
  const readBlock = blocks.find(function (b) { return b.includes('读输出的约定') })
  const precBlock = blocks.find(function (b) { return b.includes('精度分两层') })
  const worldBlock = blocks.find(function (b) { return b.includes('世界推演') })
  assert('有「选哪个 operation」段', Boolean(opBlock), '')
  assert('选 operation 段是最长的正文段',
    opBlock && blocks.every(function (b) { return b === opBlock || b.length <= opBlock.length }),
    opBlock && String(opBlock.length))
  assert('世界推演段压到 120 字符内（低频内容不占大头）',
    worldBlock && worldBlock.length <= 120, worldBlock && String(worldBlock.length))
  assert('读输出段存在', Boolean(readBlock), '')
  assert('精度段存在', Boolean(precBlock), '')
}

console.log('-- 4. 不再罗列全能力清单（同一份信息付两次钱）--')
{
  const brief = await section('brief')
  /**
   * 旧的 brief 里有一句「能算：…」把 12 类能力全列了一遍（200 字符）。
   * 这些内容 schema 的 enum 与 help 都有，重复下发是浪费。
   */
  assert('brief 不再有「能算：」全清单', !brief.includes('能算：'), brief.slice(0, 60))
  const full = await section('full')
  assert('full 档仍保留详细清单（高档位才要）', full.includes('常用 operation'), '')
}

console.log('-- 5. 不许自相矛盾：默认显示精度只能是 8 位 --')
{
  const brief = await section('brief')
  assert('写明默认 8 位', brief.includes('默认 8'), '')
  /**
   * 曾经的矛盾：第 5 条说「输出默认是全精度（几十位小数）」，
   * 第 6 条说「默认 8 位小数」。两条并列下发，模型读到的是冲突指令。
   */
  assert('不再出现「默认是**全精度**」这类过时表述',
    !/默认是\*\*全精度\*\*/.test(brief) && !brief.includes('可能几十位小数'), '')
}

console.log('-- 6. 关键行为约束不能砍 --')
{
  const brief = await section('brief')
  assert('保留「必须调用」', brief.includes('必须'), '')
  assert('保留「不要心算」', brief.includes('不要心算'), '')
  assert('保留可信度标签说明', brief.includes('可信度标签'), '')
  assert('保留 precision 与 displayPrecision 的区别', brief.includes('precision') && brief.includes('displayPrecision'), '')
  assert('不出现「错误/禁止/必须」之外的教训式措辞',
    !/禁止/.test(brief), '')
}

console.log('-- 7. 世界推演的取舍仍在（省字数不等于砍语义）--')
{
  const brief = await section('brief')
  assert('保留「底座算数、你判断与表达」', brief.includes('底座算数'), '')
  assert('保留硬约束 vs 叙事选择的区分', brief.includes('硬约束'), '')
  assert('保留「算不出来的别编」', brief.includes('别编'), '')
}

rmSync(home, { recursive: true, force: true })

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
