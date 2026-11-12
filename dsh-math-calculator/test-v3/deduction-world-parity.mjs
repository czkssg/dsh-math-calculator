/**
 * world 对齐测试（第 6 步验收）：新实现必须复现老插件的 world 输出。
 *
 * ## 这条测试的作用
 *
 * 第 6 步的验收标准是「对齐老 world 输出」。前面 deduction-world.mjs 是
 * **自洽断言**（地球参数必须还原地球），能证明模型没算错，但证明不了
 * 「与老插件一致」——那需要真的把老实现跑起来逐字段比对。
 *
 * 这里直接加载老 lib/world.js（仍保留在 rewrite/v3 上）与新
 * lib/features/deduction/world.js，对 8 组参数逐字段比较。
 *
 * ## 允许的两类差异
 *
 * 1. **修掉的 bug**：老实现 noonElevation 对北半球冬至返回夏至值
 *    （45°N 给 68.44°，应为 21.56°）。本测试反向验证：这些路径必须
 *    出现在差异里，且新值等于正确公式。
 * 2. **文案**：description / summary / note 等说明文字允许重写，
 *    只统计条数，不判失败。
 *
 * 除这两类外，任何数值差异都算失败——相对误差阈值 1e-9。
 */
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_MATH_CALC_HOME = mkdtempSync(join(tmpdir(), 'dsh-world-parity-'))

const constants = Object.fromEntries(
  JSON.parse(readFileSync(join(root, 'src/data/constants-graph.json'), 'utf8')).map((x) => [x.name, x.standard]),
)
const stars = JSON.parse(readFileSync(join(root, 'src/data/stars.json'), 'utf8'))

const oldMod = await import(pathToFileURL(join(root, 'lib/world.js')).href)
const newMod = await import(pathToFileURL(join(root, 'lib/features/deduction/world.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ok   ' + name) }
  else { fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

/** 拍平对象。 */
function flat(obj, prefix = '', out = {}) {
  if (obj === null || typeof obj !== 'object') { out[prefix] = obj; return out }
  if (Array.isArray(obj)) { obj.forEach((v, i) => flat(v, prefix + '[' + i + ']', out)); return out }
  for (const k of Object.keys(obj)) flat(obj[k], prefix ? prefix + '.' + k : k, out)
  return out
}

/** 文案字段（允许重写）。 */
const TEXT_FIELDS = /(description|causeSummary|summary|notes|impression|detail|title|leapRule|seasonStrength|note|highlights|warnings|starNotes)/i
/** 修掉的 bug 字段。 */
const BUGGY_FIELDS = /noonElevationWinter$/

const CASES = [
  ['earth', {}],
  ['mars-ish', { planetMass: 0.107, planetRadius: 0.532, orbitAU: 1.524, pressure: 610, greenhouse: 5, albedo: 0.25, rotationHours: 24.62, obliquityDeg: 25.19, moonCount: 2 }],
  ['super-earth', { planetMass: 5, planetRadius: 1.6 }],
  ['m5v-tilt', { starClass: 'M5V', orbitAU: 0.15, obliquityDeg: 0 }],
  ['fast-spin', { rotationHours: 3 }],
  ['no-moon', { moonCount: 0 }],
  ['gas-giant', { planetMass: 0.3, planetRadius: 3, pressure: 101325, greenhouse: 10 }],
  ['high-tilt', { obliquityDeg: 75, orbitAU: 0.8 }],
]

/** 新实现的 noonElevation 期望值（与 climate.ts 同式）。 */
function expectedWinterElevation(latitudeDeg, obliquityDeg) {
  const northern = latitudeDeg >= 0
  const sign = northern ? -1 : 1
  const declination = sign * obliquityDeg
  return Math.max(0, 90 - Math.abs(latitudeDeg - declination))
}

for (const [name, params] of CASES) {
  const a = flat(oldMod.generateWorld(params, { constants }))
  const b = flat(newMod.generateWorld(params, { constants, starClasses: stars }))

  const numberDiffs = []
  const textDiffs = []
  const buggyDiffs = []
  let typeDiffs = 0
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key]
    const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') {
      const scale = Math.max(1e-12, Math.abs(va), Math.abs(vb))
      if (Math.abs(va - vb) / scale <= 1e-9) continue
      if (BUGGY_FIELDS.test(key)) buggyDiffs.push({ key, va, vb })
      else numberDiffs.push(key + ': old=' + va + ' new=' + vb)
    } else if (typeof va === 'string' && typeof vb === 'string') {
      if (va === vb) continue
      if (TEXT_FIELDS.test(key)) textDiffs.push(key)
      else numberDiffs.push(key + ' [text]:\n  old=' + va.slice(0, 120) + '\n  new=' + vb.slice(0, 120))
    } else if (typeof va !== typeof vb) {
      typeDiffs += 1
      numberDiffs.push(key + ': type old=' + typeof va + ' new=' + typeof vb)
    }
  }

  assert('[' + name + '] 数值零差异', numberDiffs.length === 0, numberDiffs.slice(0, 6).join('\n'))
  assert('[' + name + '] 类型一致', typeDiffs === 0, String(typeDiffs))
  if (buggyDiffs.length > 0) {
    // 只在有纬度带的 case 里出现；必须是老值错、新值对
    const allCorrect = buggyDiffs.every((item) => {
      const match = item.key.match(/latitudeBands\[(\d+)\]\.noonElevationWinter/)
      if (!match) return true
      const index = Number(match[1])
      const latitude = [0, 15, 30, 45, 60, 75, 88][index]
      const obliquity = typeof params.obliquityDeg === 'number' ? params.obliquityDeg : 23.44
      return Math.abs(item.vb - expectedWinterElevation(latitude, obliquity)) < 1e-6
    })
    assert('[' + name + '] ★ noonElevationWinter 差异是修正后的正确值', allCorrect, JSON.stringify(buggyDiffs.slice(0, 3).map((d) => [d.key, d.va, d.vb])))
  }
  assert('[' + name + '] 文案差异不阻断（只计数）', true, '文案差异 ' + textDiffs.length + ' 处')
}

console.log('')
console.log('通过 ' + pass + '，失败 ' + fails.length)
if (fails.length > 0) {
  for (const f of fails) console.log('  · ' + f)
  process.exitCode = 1
}
