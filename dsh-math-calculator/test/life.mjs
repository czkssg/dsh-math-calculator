/**
 * 化学窗口与生命硬否决测试。
 *
 * 设计意图（用户定）：只判"绝对不行"，其余交给叙事。
 * 所以断言的重点是：该排除的必须排除，不该排除的绝不越权下结论。
 */
import { chemistryWindow, assessLife } from '../lib/life.js'

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log('  ok   ' + name + (detail ? ': ' + detail : ''))
  } else {
    fails.push({ name, detail })
    console.log('  FAIL ' + name + '\n         ' + (detail ?? ''))
  }
}

const ALPHA = 7.2973525693e-3

const earthLike = {
  surfaceMeanK: 288,
  warmestBandK: 305,
  coldestBandK: 250,
  pressurePa: 101325,
  boilingPointK: 373.15,
  stellarLifetimeGyr: 10,
  uvFraction: 0.13,
  tidallyLocked: false,
}

console.log('-- 1. 化学窗口：现实常数在窗口内 --')
{
  const w = chemistryWindow(ALPHA, 300)
  assert('现实 α 判定为窗口内', w.verdict === 'window', w.verdict)
  assert('键能量级 ≈ 4 eV', Math.abs(w.bondEnergyEv - 4) < 0.01, w.bondEnergyEv.toFixed(2))
  assert('稳定性约 150 kT', w.stability > 100 && w.stability < 200, w.stability.toFixed(0))
  assert('标为量级估计', w.confidence === 'order-of-magnitude')
  assert('有适用域', w.domain.length > 5)
}

console.log('-- 2. α 偏离时化学窗口失效 --')
{
  const weak = chemistryWindow(ALPHA * 0.3, 300)
  assert('α×0.3 → 键太弱', weak.verdict === 'bonds-too-weak', weak.verdict)
  assert('弱键说明里给出 kT 数', weak.note.includes('kT'), weak.note.slice(0, 30))

  const strong = chemistryWindow(ALPHA * 3.2, 300)
  assert('α×3.2 → 键太强', strong.verdict === 'bonds-too-strong', strong.verdict)
  assert('强键只列强约束不列硬否决（语义正确）', strong.note.includes('代谢'))
}

console.log('-- 3. 地球式世界：不应被排除 --')
{
  const gate = assessLife(earthLike, ALPHA)
  assert('地球式世界无硬否决', gate.verdict === 'open', gate.verdict)
  assert('没有 blocker', gate.blockers.length === 0, String(gate.blockers.length))
  assert('列出 4 个交给作者的维度', gate.openQuestions.length === 4, String(gate.openQuestions.length))
  assert('说明里明确"交给作者"', gate.note.includes('作者'), gate.note.slice(0, 30))
}

console.log('-- 4. 硬否决：液态水不可能 --')
{
  const marsLike = assessLife({ ...earthLike, pressurePa: 600 }, ALPHA)
  assert('气压低于三相点 → 排除', marsLike.verdict === 'excluded')
  assert('给出 below-triple-point', marsLike.blockers.some((b) => b.id === 'below-triple-point'))

  const snowball = assessLife({ ...earthLike, warmestBandK: 260 }, ALPHA)
  assert('全星球低于冰点 → 排除', snowball.verdict === 'excluded')
  assert('给出 always-frozen', snowball.blockers.some((b) => b.id === 'always-frozen'))

  const venus = assessLife({ ...earthLike, coldestBandK: 800 }, ALPHA)
  assert('全星球高于沸点 → 排除', venus.verdict === 'excluded')
  assert('给出 always-boiling', venus.blockers.some((b) => b.id === 'always-boiling'))
}

console.log('-- 5. 强约束不等于排除 --')
{
  const shortStar = assessLife({ ...earthLike, stellarLifetimeGyr: 0.01 }, ALPHA)
  assert('寿命过短 → 受约束而非排除', shortStar.verdict === 'constrained', shortStar.verdict)
  assert('标为 strong', shortStar.blockers.every((b) => b.kind === 'strong'))

  const locked = assessLife({ ...earthLike, tidallyLocked: true, pressurePa: 5000 }, ALPHA)
  assert('潮汐锁定 + 稀薄大气 → 受约束', locked.verdict === 'constrained', locked.verdict)

  const uv = assessLife({ ...earthLike, uvFraction: 0.6, pressurePa: 20000 }, ALPHA)
  assert('强紫外 + 稀薄大气 → 受约束', uv.verdict === 'constrained', uv.verdict)
}

console.log('-- 6. 化学失效是硬否决 --')
{
  const collapsed = assessLife(earthLike, ALPHA * 0.3)
  assert('α×0.3 → 生命被排除', collapsed.verdict === 'excluded', collapsed.verdict)
  assert('原因是化学窗口', collapsed.blockers.some((b) => b.id === 'chemistry-collapsed'))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
