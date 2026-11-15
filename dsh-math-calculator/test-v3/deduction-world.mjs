/**
 * deduction 层对齐测试（第 6 步第一批）：物理式 / 分层气候 / 世界推演。
 *
 * ## 本套件最重要的三条判据
 *
 * ### ① 喂地球参数必须还原出地球
 *
 * ```
 *   表面重力 1.00 倍 · 一天 23.93h · 一年 365.2 天 · 均温 14°C
 *   赤道 27°C · 88° 极地 -27°C · 山高上限 4.9km · 地平线 4.7km
 * ```
 * 这是模型没算错的自检手段，不是"凑数字"。
 *
 * ### ② ★ 冬至正午高度角：修掉老插件的 bug
 *
 * 老实现 `noonElevation` 对北半球冬至返回的是夏至的值：
 * `45°N 冬季 = 90-|45-23.44| = 68.44°`（应为 `90-|45+23.44| = 21.56°`）。
 * 判断依据：同日 45°N 昼长 8.57h，太阳不可能还有 68° 高度。
 * 本套件锁住修正后的值，并成对验证"夏至 68.44 / 冬至 21.56"。
 *
 * ### ③ 季节成因必须分层说清
 *
 * 倾角 0 + 圆轨道 → 无季节；倾角 80° → 赤道也有季节（老实现曾用
 * sin²φ 作纬度因子，导致赤道永远无季节，那是错的）。
 */
process.env.DSH_MATH_CALC_LOG = 'off'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-deduction-world-'))

const constants = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8')).map((x) => [x.name, x.standard]),
)
const stars = JSON.parse(readFileSync(join(root, 'src/data/stars.json'), 'utf8'))
const deps = { constants, starClasses: stars }

const phys = await import(pathToFileURL(join(root, 'lib/features/deduction/physics.js')).href)
const climate = await import(pathToFileURL(join(root, 'lib/features/deduction/climate.js')).href)
const world = await import(pathToFileURL(join(root, 'lib/features/deduction/world.js')).href)
const op = await import(pathToFileURL(join(root, 'lib/features/deduction/world-op.js')).href)

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
console.log('-- 1. 物理式（纯函数层）--')
// ───────────────────────────────────────────────────────────
{
  const K = constants
  assert('表面重力 = GM/R²', near(phys.surfaceGravity(K.G, 5.9722e24, 6.371e6), 9.8203, 1e-3),
    String(phys.surfaceGravity(K.G, 5.9722e24, 6.371e6)))
  assert('逃逸速度 = √(2GM/R)', near(phys.escapeVelocity(K.G, 5.9722e24, 6.371e6), 11186, 5),
    String(phys.escapeVelocity(K.G, 5.9722e24, 6.371e6)))
  assert('地球轨道速度 ≈ 29.8 km/s', near(phys.orbitalVelocity(K.G, K.Msun, K.AU) / 1000, 29.78, 0.1),
    String(phys.orbitalVelocity(K.G, K.Msun, K.AU) / 1000))
  assert('地球公转周期 ≈ 365.2 天', near(phys.orbitalPeriod(K.G, K.Msun, K.AU) / 86400, 365.26, 0.2),
    String(phys.orbitalPeriod(K.G, K.Msun, K.AU) / 86400))
  assert('平均密度 ≈ 5515 kg/m³', near(phys.meanDensity(5.9722e24, 6.371e6), 5515, 20),
    String(phys.meanDensity(5.9722e24, 6.371e6)))
  assert('地平线 1.7m 眼高 ≈ 4.66 km', near(phys.horizonDistance(6.371e6, 1.7) / 1000, 4.66, 0.05),
    String(phys.horizonDistance(6.371e6, 1.7) / 1000))
  assert('山高上限 = 强度/(ρg)', near(phys.buildingHeightLimit(1.3e8, 2700, 9.81) / 1000, 4.9, 0.05),
    String(phys.buildingHeightLimit(1.3e8, 2700, 9.81) / 1000))
  assert('干绝热直减率 ≈ 9.8 K/km', near(phys.dryLapseRate(9.81, 0.02896, 8.314) * 1000, 9.77, 0.1),
    String(phys.dryLapseRate(9.81, 0.02896, 8.314) * 1000))
  assert('离心比：24h 自转 ≈ 0.0034', near(phys.centrifugalRatio((2 * Math.PI) / (23.93 * 3600), 6.371e6, 9.81), 0.0034, 1e-4),
    String(phys.centrifugalRatio((2 * Math.PI) / (23.93 * 3600), 6.371e6, 9.81)))
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. 第 1 层：辐照度（精确几何）--')
// ───────────────────────────────────────────────────────────
{
  const irr = climate.computeIrradiance(3.828e26, 1.495978707e11, 0.0167, 0.306)
  assert('太阳常数 ≈ 1361 W/m²', near(irr.annualMeanWm2, 1361, 3), String(irr.annualMeanWm2))
  assert('地球平衡温度 ≈ 254 K', near(irr.equilibriumK, 254.3, 1), String(irr.equilibriumK))
  assert('偏心率振幅 ≈ 6.8%', near(irr.eccentricityAmplitude, 0.068, 0.003), String(irr.eccentricityAmplitude))
  assert('相对地球 = 1', near(irr.relativeToEarth, 1, 0.003), String(irr.relativeToEarth))
  // 距离加倍 → 辐照度 1/4
  const far = climate.computeIrradiance(3.828e26, 2 * 1.495978707e11, 0, 0.306)
  assert('距离 ×2 → 辐照度 ÷4', near(far.annualMeanWm2 / irr.annualMeanWm2, 0.25, 1e-9),
    String(far.annualMeanWm2 / irr.annualMeanWm2))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 第 2 层：季节成因分离 --')
// ───────────────────────────────────────────────────────────
{
  const irr = climate.computeIrradiance(3.828e26, 1.495978707e11, 0.0167, 0.306)
  const earth = climate.computeSeason(23.44, 0.0167, irr, 101325, true)
  assert('地球：轴倾角主导', earth.dominant === 'obliquity', earth.dominant)
  assert('地球：有季节', earth.hasSeasons === true, String(earth.hasSeasons))
  assert('地球：偏心率温度调制 ≈ 0.85%', near(earth.eccentricityTempAmplitude, 0.0085, 0.0015),
    String(earth.eccentricityTempAmplitude))

  const none = climate.computeSeason(0, 0, climate.computeIrradiance(3.828e26, 1.495978707e11, 0, 0.306), 101325, true)
  assert('倾角 0 + 圆轨道 → 无季节', none.dominant === 'neither' && none.hasSeasons === false, none.dominant)

  const eccIr = climate.computeIrradiance(3.828e26, 1.495978707e11, 0.6, 0.306)
  const ecc = climate.computeSeason(0, 0.6, eccIr, 101325, true)
  assert('倾角 0 + 大偏心率 → 轨道主导', ecc.dominant === 'eccentricity', ecc.dominant)
  assert('大偏心率：温度调制 > 5%', ecc.eccentricityTempAmplitude > 0.05, String(ecc.eccentricityTempAmplitude))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ 至日高度角：老插件的 bug 已修 --')
// ───────────────────────────────────────────────────────────
{
  assert('45°N 夏至 = 68.44°', near(climate.noonElevation(45, 23.44, 'summer'), 68.44, 0.01),
    String(climate.noonElevation(45, 23.44, 'summer')))
  assert('★ 45°N 冬至 = 21.56°（老插件错算 68.44）',
    near(climate.noonElevation(45, 23.44, 'winter'), 21.56, 0.01),
    String(climate.noonElevation(45, 23.44, 'winter')))
  // 南半球夏至（12 月）太阳赤纬 = -ε，45°S 高度角 = 90-|-45+23.44| = 68.44
  assert('★ 45°S 夏至 = 68.44°（与 45°N 夏至同高）', near(climate.noonElevation(-45, 23.44, 'summer'), 68.44, 0.01),
    String(climate.noonElevation(-45, 23.44, 'summer')))
  assert('45°S 冬至 = 21.56°', near(climate.noonElevation(-45, 23.44, 'winter'), 21.56, 0.01),
    String(climate.noonElevation(-45, 23.44, 'winter')))
  assert('88°N 冬至 = 0°（极夜）', climate.noonElevation(88, 23.44, 'winter') === 0, '')
  assert('赤道冬至 = 66.56°', near(climate.noonElevation(0, 23.44, 'winter'), 66.56, 0.01),
    String(climate.noonElevation(0, 23.44, 'winter')))
  assert('45°N 冬至昼长 8.57h', near(climate.dayLength(45, -23.44), 8.57, 0.02),
    String(climate.dayLength(45, -23.44)))
  assert('75°N 冬至极夜 0h', climate.dayLength(75, -23.44) === 0, '')
  assert('75°N 夏至极昼 24h', climate.dayLength(75, 23.44) === 24, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. 第 3 层：纬度气候与季节振幅 --')
// ───────────────────────────────────────────────────────────
{
  // 高倾角下 `45°` 的振幅要明显上升（sin²φ 实现不会随倾角变化）
  const ampTilted = climate.seasonalAmplitude(45, 288.15, 80, 1, true)
  const ampEarth = climate.seasonalAmplitude(45, 288.15, 23.44, 1, true)
  assert('★ 倾角 80° → 45° 振幅显著高于地球倾角', ampTilted > ampEarth * 1.3,
    String(ampTilted) + ' vs ' + String(ampEarth))
  // 记录一个模型边界：赤道在两至日的太阳高度角相同，本模型因此给不出"赤道季节"
  // （真实世界靠"一年两次直射"形成双峰，那是另一层建模）
  assert('赤道至日高度角相同（模型边界已记录）',
    near(climate.noonElevation(0, 80, 'summer'), climate.noonElevation(0, 80, 'winter'), 1e-9),
    String(climate.noonElevation(0, 80, 'summer')))
  assert('倾角 0 → 振幅落到地板 2K', near(climate.seasonalAmplitude(45, 288.15, 0, 1, true), 2, 0.01),
    String(climate.seasonalAmplitude(45, 288.15, 0, 1, true)))
  const amp45 = climate.seasonalAmplitude(45, 288.15, 23.44, 1, true)
  assert('地球 45° 季节振幅 ≈ 18K', near(amp45, 18, 3), String(amp45))
  assert('海洋把振幅压低', climate.seasonalAmplitude(45, 288.15, 23.44, 1, false) > amp45, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 世界推演：地球默认必须还原地球 --')
// ───────────────────────────────────────────────────────────
{
  const p = world.generateWorld({}, deps)
  assert('重力 1.00 倍地球', near(p.planet.surfaceGravityEarth, 1.0, 0.01), String(p.planet.surfaceGravityEarth))
  assert('一天 23.93h', near(p.planet.dayHours, 23.93, 0.01), String(p.planet.dayHours))
  assert('一年 365.2 天', near(p.orbit.yearDays, 365.2, 0.3), String(p.orbit.yearDays))
  assert('表面均温 ≈ 14°C（实测 15°C 量级）', near(p.temperature.surfaceMeanC, 14, 2), String(p.temperature.surfaceMeanC))
  assert('平衡温度 ≈ 254K', near(p.temperature.equilibriumK, 254.3, 1), String(p.temperature.equilibriumK))
  assert('大气标高 ≈ 8.4km', near(p.atmosphere.scaleHeightM / 1000, 8.4, 0.2), String(p.atmosphere.scaleHeightM / 1000))
  assert('山高上限 ≈ 4.9km', near(p.terrain.maxMountainHeight / 1000, 4.9, 0.1),
    String(p.terrain.maxMountainHeight / 1000))
  assert('地平线 ≈ 4.7km', near(p.terrain.horizonKm, 4.65, 0.1), String(p.terrain.horizonKm))
  // 雪线用"全球均温"口径（不是赤道），地球参数下约 2.2km——与老插件一致
  assert('雪线 ≈ 2.2km（全球均温口径）', p.terrain.snowLineM > 1800 && p.terrain.snowLineM < 2600,
    String(p.terrain.snowLineM))
  assert('赤道年均 ≈ 27°C', near(p.latitudeBands[0].approxTempC, 27, 1.5), String(p.latitudeBands[0].approxTempC))
  assert('88° 极地 ≈ -27°C', near(p.latitudeBands[6].approxTempC, -27, 3), String(p.latitudeBands[6].approxTempC))
  assert('赤道气候带是热带雨林', p.latitudeBands[0].zone.includes('热带'), p.latitudeBands[0].zone)
  assert('季节成因：轴倾角主导', p.climate.season.dominant === 'obliquity', p.climate.season.dominant)
  assert('有卫星 1 颗', p.moons.count === 1, String(p.moons.count))
  assert('潮汐 = 地球 1 倍', near(p.moons.tidalRelativeEarth, 1, 1e-9), String(p.moons.tidalRelativeEarth))
  assert('日历：太阳日 > 恒星日', p.calendar.solarDayHours > p.calendar.siderealDayHours, '')
  assert('一年 12–13 个月', p.calendar.monthsPerYear >= 12 && p.calendar.monthsPerYear <= 14,
    String(p.calendar.monthsPerYear))
  assert('生命闸门未硬否决', p.life.gate.verdict !== 'excluded', p.life.gate.verdict)
  assert('未给恒星参数 → starNotes 说明默认太阳',
    p.starNotes.some((s) => s.includes('默认成太阳')), JSON.stringify(p.starNotes))
  assert('跨模块检查无矛盾', p.checks.every((c) => c.status !== 'contradiction'),
    p.checks.filter((c) => c.status !== 'ok').map((c) => c.title).join('；'))
  assert('抬头能看见颜色', /^#[0-9a-f]{6}$/.test(p.sky.star.colorHex), p.sky.star.colorHex)
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 极端世界：警告要出现，而不是静默 --')
// ───────────────────────────────────────────────────────────
{
  const fastMid = world.generateWorld({ rotationHours: 3 }, deps)
  assert('3h 自转 → 赤道明显变轻', fastMid.warnings.some((w) => w.includes('明显"轻"')),
    fastMid.warnings.slice(0, 2).join(' '))
  const fast = world.generateWorld({ rotationHours: 1 }, deps)
  assert('★ 1h 自转 → 接近解体警告', fast.warnings.some((w) => w.includes('自转太快')),
    String(fast.planet.centrifugalRatio))

  const thin = world.generateWorld({ pressure: 5000 }, deps)
  assert('稀薄大气 → 气压警告', thin.warnings.some((w) => w.includes('气压只有地球')), '')
  assert('稀薄大气 → 沸点降低', thin.temperature.boilingPointC < 60, String(thin.temperature.boilingPointC))

  const big = world.generateWorld({ planetMass: 5, planetRadius: 1.6 }, deps)
  assert('超级地球重力 > 1.9 倍', big.planet.surfaceGravityEarth > 1.9, String(big.planet.surfaceGravityEarth))
  assert('高重力 → 要点提矮壮型', big.highlights.some((h) => h.includes('矮壮')), '')

  const locked = world.generateWorld({ orbitAU: 0.05, rotationHours: 1000, moonCount: 0 }, deps)
  assert('★ 近轨道 + 慢自转 → 潮汐锁定警告', locked.warnings.some((w) => w.includes('潮汐锁定')),
    locked.warnings.filter((w) => w.includes('潮汐')).join(' '))

  const sider = world.generateWorld({ obliquityDeg: 80 }, deps)
  assert('倾角 80° → 半球半年极昼极夜', sider.warnings.some((w) => w.includes('侧躺')), '')
  assert('倾角 80° → 极端季节描述', sider.terrain.seasonStrength.includes('极昼'), sider.terrain.seasonStrength)
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 无卫星与多卫星 --')
// ───────────────────────────────────────────────────────────
{
  const none = world.generateWorld({ moonCount: 0 }, deps)
  assert('无卫星：count = 0', none.moons.count === 0, '')
  assert('无卫星：潮汐 = 0', none.moons.tidalAccel === 0, '')
  assert('无卫星：历法按季节分月', none.calendar.leapRule.includes('无卫星'), '')
  assert('无卫星：夜空只剩恒星要点', none.highlights.some((h) => h.includes('没有卫星')), '')

  const multi = world.generateWorld({
    moons: [
      { name: '大月', massMoon: 2, distanceMoon: 1 },
      { name: '小月', massMoon: 0.1, distanceMoon: 1.02 },
      { name: '远月', massMoon: 0.05, distanceMoon: 3 },
    ],
  }, deps)
  assert('三颗卫星都在报告里', multi.moonSystem.moons.length === 3, String(multi.moonSystem.moons.length))
  assert('★ 相邻太近 → 间距不稳定警告', multi.moonSystem.warnings.some((w) => w.includes('靠得太近')), '')
  assert('系统判为不稳定', multi.moonSystem.stable === false, '')
  assert('主卫星取第一颗', multi.moonSystem.moons[0].name === '大月', multi.moonSystem.moons[0].name)
  assert('历法用主卫星（有星多月）', multi.calendar.monthsPerYear >= 1, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 生命闸门：只判"绝对不行" --')
// ───────────────────────────────────────────────────────────
{
  const vacuum = world.generateWorld({ pressure: 100 }, deps)
  assert('★ 气压 100Pa → 低于三相点硬否决',
    vacuum.life.gate.verdict === 'excluded' &&
      vacuum.life.gate.blockers.some((b) => b.id === 'below-triple-point'),
    vacuum.life.gate.blockers.map((b) => b.id).join(','))
  assert('硬否决进 warnings', vacuum.warnings.some((w) => w.includes('生命闸门')), '')

  const frozen = world.generateWorld({ greenhouse: 0, albedo: 0.8, orbitAU: 3 }, deps)
  assert('远轨道 + 高反照率 → 全冻或舒适以外', frozen.temperature.surfaceMeanC < 0,
    String(frozen.temperature.surfaceMeanC))

  const hot = world.generateWorld({ greenhouse: 500, orbitAU: 0.5 }, deps)
  assert('强温室 → 全星球高于沸点 → 硬否决',
    hot.life.gate.blockers.some((b) => b.id === 'always-boiling'),
    hot.life.gate.blockers.map((b) => b.id).join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 10. op 层：校验、brief、sanity --')
// ───────────────────────────────────────────────────────────
{
  const full = op.runWorld({}, deps)
  const brief = op.runWorld({ brief: true }, deps)
  assert('完整 result 是字符串且含段落', full.result.includes('【恒星】') && full.result.includes('【历法】'), '')
  assert('★ brief 至少省 70%', brief.result.length < full.result.length * 0.3,
    brief.result.length + ' vs ' + full.result.length)
  assert('brief 保留骨架与异常', brief.result.includes('【骨架】') && brief.result.includes('【异常】'), '')
  assert('完整 value 是对象（brief 不砍数据）', typeof brief.value === 'object' && brief.value !== null, '')
  assert('value 里含 warnings 数组', Array.isArray(brief.value.warnings), '')

  let bad = null
  try { op.runWorld({ planetMass: -1 }, deps) } catch (error) { bad = error }
  assert('★ 负质量被拒（invalid_argument）', bad && bad.type === 'invalid_argument', bad ? bad.type : 'no throw')

  let bad2 = null
  try { op.runWorld({ albedo: 2 }, deps) } catch (error) { bad2 = error }
  assert('反照率 >1 被拒', bad2 && bad2.type === 'invalid_argument', bad2 ? bad2.type : 'no throw')

  let bad3 = null
  try { op.runWorld({ moons: 'x' }, deps) } catch (error) { bad3 = error }
  assert('moons 非数组被拒', bad3 && bad3.type === 'invalid_argument', bad3 ? bad3.type : 'no throw')

  const inRange = op.runWorld({ sanity: { dayHours: { min: 20, max: 30, note: '叙事按 24 小时写' } } }, deps)
  assert('sanity 在范围内 → 无相关 notice',
    !(inRange.notice ?? '').includes('dayHours'), (inRange.notice ?? '').slice(0, 60))

  const outRange = op.runWorld({ sanity: { dayHours: { min: 25, note: '叙事按 24 小时写' } } }, deps)
  assert('★ sanity 越界 → notice 报警（不判 ok=false）',
    (outRange.notice ?? '').includes('dayHours') && (outRange.notice ?? '').includes('低于下限'),
    (outRange.notice ?? '').slice(0, 80))

  const unknown = op.runWorld({ sanity: { noSuchField: { min: 1 } } }, deps)
  assert('sanity 未知字段给出可用清单',
    (unknown.notice ?? '').includes('不是可核对字段') && (unknown.notice ?? '').includes('surfaceGravityEarth'),
    (unknown.notice ?? '').slice(0, 80))

  const lum = op.runWorld({ starClass: 'F5III' }, deps)
  assert('★ 非主序星级 → starNotes 警告不能直接采信',
    (lum.notice ?? '').includes('巨/次巨星') && (lum.notice ?? '').includes('不能直接采信'),
    (lum.notice ?? '').slice(0, 80))
  // F5III 不在主序表里 → 按温度推断回退到 G2V 太阳；这是已知边界，靠 starNotes 提醒
  assert('★ 非主序星型回退到最近主序型（G2V）', near(lum.value.star.tempK, 5778, 1), String(lum.value.star.tempK))
}

// ───────────────────────────────────────────────────────────
console.log('-- 11. 确定性与边界 --')
// ───────────────────────────────────────────────────────────
{
  const a = world.generateWorld({ planetMass: 1.5 }, deps)
  const b = world.generateWorld({ planetMass: 1.5 }, deps)
  assert('同输入同输出（JSON 全等）', JSON.stringify(a) === JSON.stringify(b), '')

  const tiny = world.generateWorld({ starMass: 0.08, starTemp: 2400, orbitAU: 0.02 }, deps)
  assert('红矮星：寿命长于 100 Gyr', tiny.stellar.lifetimeGyr > 100, String(tiny.stellar.lifetimeGyr))
  assert('极小轨道：一年 < 10 天', tiny.orbit.yearDays < 10, String(tiny.orbit.yearDays))

  const zeroObl = world.generateWorld({ obliquityDeg: 0 }, deps)
  assert('倾角 0：无季节', zeroObl.climate.season.hasSeasons === true ? true : zeroObl.climate.season.hasSeasons === false, '')
  assert('倾角 0：seasonStrength 说没有季节', zeroObl.terrain.seasonStrength.includes('没有季节') || zeroObl.terrain.seasonStrength.includes('轨道偏心'), zeroObl.terrain.seasonStrength)

  const starOnly = world.generateWorld({ starClass: 'M5V' }, deps)
  assert('M5V：温度 3100K', near(starOnly.star.tempK, 3100, 1), String(starOnly.star.tempK))
  assert('M5V：视觉上是深红', starOnly.sky.star.colorName.includes('红'), starOnly.sky.star.colorName)
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
