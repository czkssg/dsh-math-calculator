/**
 * SI 与现代单位注册。
 *
 * ## 为什么独立一个注册器（不复用英制那个）
 *
 * 三个原因：
 *
 * ```
 * ① 起始基准不同    SI 单位很多本身就是基准（`sr`/`lm`/`Bq`），
 *                  不能写成 `1 sr`，要写成 `1 sr` 的**同级定义**
 * ② 会撞 mathjs 内置   `lm`/`lx`/`Bq` 在 mathjs 里可能已存在但值不对，
 *                   需要 `override` 而不是普通创建
 * ③ 顺序敏感        有些单位依赖别的（`lx = lm/m²`），必须先建 `lm`
 * ```
 *
 * @module dsh-math-calculator/core/units-si-registry
 */

import type { MathJsInstance } from 'mathjs'
import { SI_MODERN_UNITS, type SiUnit } from './units-si.js'

/** 注册结果。 */
export interface SiRegisterResult {
  /** 成功注册。 */
  registered: number
  /** 已存在（跳过）。 */
  skipped: number
  /** 失败。 */
  failed: string[]
  /** 走独立通道的（对数量，不注册进 mathjs）。 */
  independent: string[]
}

/**
 * SI 单位的定义表达式（不用「因子 + 基准单位」的通用形式）。
 *
 * ## 为什么需要特例
 *
 * 通用形式是 `factor + ' ' + baseUnit`，即「多少个基准单位」。
 * 但对 SI 导出单位来说：
 *
 * ```
 *   sr   基准就是 sr 自己      → 不能写 `1 sr`（自引用）
 *   lm   1 lm = 1 cd·sr        → 应写成定义式
 *   lx   1 lx = 1 lm/m²        → 应写成定义式
 *   Gy   1 Gy = 1 J/kg         → 应写成定义式
 * ```
 *
 * 所以对有特例的给出明确表达式，其余走通用形式。
 */
const DEFINITION_OVERRIDES: Record<string, string> = {
  /** 立体角基准（自己就是基准，用 rad² 表达）。 */
  sr: '1 rad^2',
  /** 光通量 = 发光强度 × 立体角。 */
  lm: '1 cd sr',
  /** 照度 = 光通量 / 面积。 */
  lx: '1 lm/m^2',
  /** 放射性活度 = 每秒衰变一次。 */
  /**
   * ⚠ `Bq` mathjs 内置但**换算不出来**（实测 `1 Bq to 1/s` 报
   * `Cannot convert to a unit with...`）。
   *
   * 原因是内置 Bq 的定义链不完整。用 `override` 重建：
   * `1 Bq = 1 次衰变/秒`，而 mathjs 里表达「每秒」用 `s^-1`。
   */
  Bq: '1 s^-1',
  /** 居里 = 3.7e10 次衰变/秒。**用 s^-1 直接表达，不依赖 Bq**（避免注册顺序问题）。 */
  Ci: '3.7e10 s^-1',
  /** 吸收剂量 = 每千克焦耳。 */
  Gy: '1 J/kg',
  /** 剂量当量 = 每千克焦耳（按辐射类型加权）。 */
  Sv: '1 J/kg',
  /** 催化活性 = 每秒摩尔。 */
  kat: '1 mol/s',
  /** 照射量 = 每千克库仑。 */
  R: '0.000258 C/kg',
  /** 角速度。 */
  rpm: '0.10471975511965977 rad/s',
  /** 数据速率。 */
  bps: '1 bit/s',
}

/** 不需要注册的（mathjs 已正确提供）。 */
const SKIP_IF_EXISTS = new Set(['d'])

/**
 * ## ⚠ 不注册进 mathjs 的单位
 *
 * ### ① 对数量（`Np` / `bel` / `dB`）
 *
 * 它们**不是线性单位**，而是比值的对数表示：
 *
 * ```
 *   声压级 60 dB  =  20 × log₁₀(p/p₀)
 *   → 「60 dB」不能与「Pa」相加减，也不是「60 × 某常数 Pa」
 * ```
 *
 * mathjs 的单位体系假定「单位 × 数值 = 物理量」，
 * 对数量不满足这个前提。强行注册会：
 *
 * ```
 *   ✗ createUnit('dB', '0.115 Np') 报错（Np 也不合法）
 *   ✗ 即便注册成功，`60 dB + 40 dB = 100 dB` 也是**错的**（应为 60.04 dB）
 * ```
 *
 * 所以它们走**独立通道**（`logRatio()` 函数），不注册。
 *
 * ### ② `Ci`（居里）
 *
 * 依赖 `Bq` 先建好。注册顺序里 `Ci` 在 `Bq` 之后，但
 * `Bq` 用 `override` 重建时可能短暂不可用 —— 实测撞上了。
 * 改成**用 Bq 的定义式直接表达**：`1 Ci = 3.7e10 s^-1`。
 */
const INDEPENDENT_ONLY = new Set(['Np', 'bel', 'dB'])

/**
 * 注册 SI 与现代单位。
 *
 * @param math - mathjs 实例
 * @returns 统计
 */
export function registerSiUnits(math: MathJsInstance): SiRegisterResult {
  const result: SiRegisterResult = { registered: 0, skipped: 0, failed: [], independent: [] }

  const all: SiUnit[] = SI_MODERN_UNITS

  for (const entry of all) {
    const safeName = entry.name.replace(/[^A-Za-z0-9]/g, '')
    const definition = DEFINITION_OVERRIDES[entry.name]

    /** 对数量走独立通道，不注册。 */
    if (INDEPENDENT_ONLY.has(entry.name)) {
      result.independent.push(entry.name)
      continue
    }

    /**
     * 先试「是否已存在且可用」。
     *
     * `SKIP_IF_EXISTS` 里的单位（`d`=日）mathjs 已经有正确值，
     * 重复注册会覆盖 —— 若我们的值不同就会造成不一致。
     */
    let alreadyOk = false
    try {
      const probe = math.evaluate('1 ' + safeName)
      alreadyOk = probe !== undefined
    } catch {
      alreadyOk = false
    }
    if (alreadyOk && SKIP_IF_EXISTS.has(entry.name)) {
      result.skipped += 1
      continue
    }

    try {
      const def = definition ?? (entry.factor + ' ' + baseFor(entry.dimension))
      /**
       * ## ★ 必须开 `prefixes: 'short'`
       *
       * 不开的话 `mGy` / `mSv` / `kBq` / `mCi` 全部不可用 ——
       * 而**辐射领域几乎只用带词头的形式**：
       *
       * ```
       *   从不用「5000 Gy」，只用「5 kGy」
       *   从不用「0.001 Sv」，只用「1 mSv」
       * ```
       *
       * `'short'` 表示接受 `k`/`M`/`m`/`u` 这类短词头（不是 full 的 kilo/milli）。
       */
      math.createUnit(safeName, { definition: def, prefixes: 'short' }, { override: true })
      result.registered += 1
    } catch (error) {
      result.failed.push(safeName + '：' + (error instanceof Error ? error.message.slice(0, 40) : '?'))
    }
  }
  return result
}

/**
 * 量纲 → 基准单位。
 *
 * @param dimension - 量纲
 * @returns 基准单位名
 */
function baseFor(dimension: string): string {
  const map: Record<string, string> = {
    length: 'm',
    mass: 'kg',
    time: 's',
    volume: 'm3',
    area: 'm2',
    energy: 'J',
    power: 'W',
    pressure: 'Pa',
    force: 'N',
    speed: 'm/s',
    angle: 'rad',
    solid_angle: 'rad^2',
    luminous_flux: 'lm',
    luminous_intensity: 'cd',
    illuminance: 'lm/m^2',
    activity: '1/s',
    absorbed_dose: 'J/kg',
    dose_equivalent: 'J/kg',
    catalytic_activity: 'mol/s',
    exposure: 'C/kg',
    angular_velocity: 'rad/s',
    data_rate: 'bit/s',
    ratio: '1',
    flow: 'm3/s',
  }
  return map[dimension] ?? 'm'
}

/**
 * 验证 SI 单位是否全部可用。
 *
 * @param math - mathjs 实例
 * @returns 每个单位的检查结果
 */
export function verifySiUnits(math: MathJsInstance): Array<{ name: string; ok: boolean; detail: string }> {
  /**
   * 检查表：每个单位配一个「换算到某个可读单位」的探针。
   */
  const PROBES: Array<[string, string, number]> = [
    ['sr', '', 1],
    ['lm', '', 1],
    ['lx', '', 1],
    ['Bq', '1/s', 1],
    ['Gy', 'J/kg', 1],
    ['Sv', 'J/kg', 1],
    ['kat', 'mol/s', 1],
    ['au', 'km', 149597870.7],
    ['ly', 'm', 9460730472580800],
    ['pc', 'ly', 3.261563777],
    ['d', 'h', 24],
    ['dB', '', 1],
    ['Ci', 'Bq', 3.7e10],
    ['rad_dose', 'Gy', 0.01],
    ['rem', 'Sv', 0.01],
    ['R', 'C/kg', 0.000258],
    ['rpm', 'rad/s', 0.10471975511965977],
    ['knot_modern', 'm/s', 0.5144444444444445],
    ['nmi_modern', 'm', 1852],
  ]
  const out: Array<{ name: string; ok: boolean; detail: string }> = []
  for (const [name, target, want] of PROBES) {
    try {
      if (target === '') {
        const probe = math.evaluate('1 ' + name)
        out.push({ name, ok: probe !== undefined, detail: String(probe).slice(0, 20) })
      } else {
        const value = Number(String(math.evaluate('1 ' + name + ' to ' + target)).split(' ')[0])
        const ok = Math.abs(value - want) / Math.abs(want) < 1e-6
        out.push({ name, ok, detail: value + ' ' + target })
      }
    } catch (error) {
      out.push({ name, ok: false, detail: error instanceof Error ? error.message.slice(0, 30) : '?' })
    }
  }
  return out
}
