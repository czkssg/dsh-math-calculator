/**
 * 后端整合：跨模块一致性检查。
 *
 * 每个用例只改一个输入，验证对应的"矛盾/警告"能被抓出来，
 * 并确保正常世界不会被误报。
 */
import { checkWorld, summarizeChecks } from '../lib/integration.js'
import { generateWorld } from '../lib/world.js'

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

const base = {
  orbitAU: 1,
  starTempK: 5778,
  stellar: { massSun: 1, effectiveTempK: 5778, habitableZoneAU: [0.95, 1.67], lifetimeAlphaGyr: 10 },
  moonSystem: { moons: [{ name: '卫星1', periodDays: 27.3 }], maxMoonCount: 6 },
  calendar: { monthsPerYear: 13, daysPerMonth: 28 },
  life: { gate: { verdict: 'open', blockers: [] } },
  temperature: { surfaceMeanC: 15 },
}

const find = (checks, id) => checks.find((c) => c.id === id)
const status = (checks, id) => find(checks, id)?.status

console.log('-- 1. 正常世界不应误报 --')
{
  const checks = checkWorld(base)
  assert('检查项 ≥ 5', checks.length >= 5, String(checks.length))
  assert('轨道在宜居带 ok', status(checks, 'orbit-in-hz') === 'ok')
  assert('恒星自洽 ok', status(checks, 'star-consistent') === 'ok')
  assert('宜居带与生命不冲突', status(checks, 'hz-vs-life') === 'ok')
  assert('卫星容量 ok', status(checks, 'moon-capacity') === 'ok')
  assert('温度一致 ok', status(checks, 'hz-vs-temperature') === 'ok')
  assert('单卫星不触发历法检查', find(checks, 'calendar-moon-source') === undefined)
  const s = summarizeChecks(checks)
  assert('统计：全 ok', s.warn === 0 && s.contradiction === 0, JSON.stringify(s))
}

console.log('-- 2. 轨道不在宜居带 --')
{
  const checks = checkWorld({ ...base, orbitAU: 3 })
  assert('给出 warn', status(checks, 'orbit-in-hz') === 'warn')
  assert('说明里带两组数字', find(checks, 'orbit-in-hz').detail.includes('0.95') && find(checks, 'orbit-in-hz').detail.includes('3.00'))
  assert('离开宜居带后不再比较温度', find(checks, 'hz-vs-temperature') === undefined)
}

console.log('-- 3. 恒星参数不自洽 --')
{
  const checks = checkWorld({ ...base, starTempK: 12000 })
  assert('给出 warn', status(checks, 'star-consistent') === 'warn')
  assert('说明里给出百分比', find(checks, 'star-consistent').detail.includes('%'))
}

console.log('-- 4. 历法用错卫星 --')
{
  const twoMoons = {
    ...base,
    moonSystem: {
      moons: [{ name: '大月', periodDays: 30 }, { name: '小月', periodDays: 3 }],
      maxMoonCount: 6,
    },
  }
  const checks = checkWorld(twoMoons)
  assert('给出 warn', status(checks, 'calendar-moon-source') === 'warn')
  assert('点名最短周期的那颗', find(checks, 'calendar-moon-source').detail.includes('小月'))

  const aligned = {
    ...base,
    moonSystem: { moons: [{ name: '大月', periodDays: 30 }, { name: '远月', periodDays: 29 }], maxMoonCount: 6 },
  }
  assert('周期接近时不报警', status(checkWorld(aligned), 'calendar-moon-source') === 'ok')
}

console.log('-- 5. 宜居带内却被判死 = 矛盾 --')
{
  const snapshot = {
    ...base,
    life: { gate: { verdict: 'excluded', blockers: [{ id: 'below-triple-point', kind: 'hard' }] } },
  }
  const checks = checkWorld(snapshot)
  assert('判为 contradiction', status(checks, 'hz-vs-life') === 'contradiction')
  assert('点名硬否决项', find(checks, 'hz-vs-life').detail.includes('below-triple-point'))
}

console.log('-- 6. 其它警告 --')
{
  const crowded = { ...base, moonSystem: { moons: new Array(10).fill({ name: '月', periodDays: 10 }), maxMoonCount: 6 } }
  assert('卫星超容量 warn', status(checkWorld(crowded), 'moon-capacity') === 'warn')

  const cold = { ...base, temperature: { surfaceMeanC: -96 } }
  assert('宜居带内但极冷 warn', status(checkWorld(cold), 'hz-vs-temperature') === 'warn')
}

console.log('-- 7. 端到端：world 输出自带一致性检查 --')
{
  const earth = generateWorld({})
  assert('默认世界有 checks', Array.isArray(earth.checks) && earth.checks.length >= 4, String(earth.checks?.length))
  assert('默认世界无矛盾', !earth.checks.some((c) => c.status === 'contradiction'))

  const far = generateWorld({ orbitAU: 3 })
  assert('3 AU → 轨道警告', far.checks.some((c) => c.id === 'orbit-in-hz' && c.status === 'warn'))

  const multi = generateWorld({
    moons: [
      { name: '大月', massMoon: 1, distanceMoon: 1 },
      { name: '近月', massMoon: 0.3, distanceMoon: 0.2 },
    ],
  })
  assert('多卫星 → 历法提示', multi.checks.some((c) => c.id === 'calendar-moon-source' && c.status === 'warn'))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
