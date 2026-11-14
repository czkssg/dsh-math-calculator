/**
 * 把本地单位注册进 UCUM 的 UnitTables——借 UCUM 的代码建自己的体系。
 *
 * ## 原理（已实测）
 *
 * ucum-lhc 的 UnitTables.addUnit 接受一个 Unit 对象：name_ / csCode_ / dim_（Dimension 实例）/
 * magnitude_ / property_。注册后，UcumLhcUtils.convertUnitTo 就能换算它，
 * 包括复合表达式（dan_cn/m3 之类）。
 *
 * ## 做法
 *
 * 每个本地单位按维度取一个「模板单位」克隆维度（length→meter、mass→gram、
 * time→second、area→meter²、volume→meter³…），magnitude 折成 UCUM 基准：
 * 质量以 gram 为基准，所以本地 factor（到 kg）× 1000。
 *
 * @module dsh-math-calculator/core/ucum-registry
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本地单位条目。 */
interface LocalEntry {
  alias: string
  name: string
  factor: number
  si: string
  dimension: string
}

/** 维度 → 模板单位（UCUM 全名）与基准换算。 */
const TEMPLATE: Record<string, { unit: string; scale: number }> = {
  /** scale = 该模板单位的 magnitudeSi（本地 factor / scale = UCUM magnitude）。 */
  length: { unit: 'meter', scale: 1 },
  mass: { unit: 'gram', scale: 0.001 },
  time: { unit: 'second - time', scale: 1 },
  area: { unit: 'square inch', scale: 0.00064516 },
  volume: { unit: 'Liters', scale: 0.001 },
  energy: { unit: 'joule', scale: 1 },
  power: { unit: 'watt', scale: 1 },
  pressure: { unit: 'pascal', scale: 1 },
  force: { unit: 'newton', scale: 1 },
  temperature: { unit: 'degree Kelvin', scale: 1 },
  luminous_intensity: { unit: 'candela', scale: 1 },
  angle: { unit: 'radian', scale: 1 },
}

/** ASCII 安全码（UCUM 码允许字母数字与下划线）。 */
function safeCode(alias: string, index: number): string {
  const ascii = alias.replace(/[^A-Za-z0-9_]/g, '')
  return ascii !== '' ? 'cn_' + ascii : 'cn_u' + index
}

let REGISTERED = false

/**
 * 注册全部本地单位（懒执行一次）。
 *
 * @returns 注册成功的数量与失败清单
 */
export function registerLocalUnits(): { registered: number; skipped: number; errors: string[] } {
  if (REGISTERED) return { registered: 0, skipped: 0, errors: [] }
  REGISTERED = true
  const result = { registered: 0, skipped: 0, errors: [] as string[] }
  try {
    const requireLocal = createRequire(import.meta.url)
    const { UcumLhcUtils, UnitTables } = requireLocal('@lhncbc/ucum-lhc') as {
      UcumLhcUtils: { getInstance: () => unknown }
      UnitTables: { getInstance: () => { getUnitByName: (name: string) => unknown; addUnit: (unit: Record<string, unknown>) => void; unitsCount: () => number } }
    }
    UcumLhcUtils.getInstance()
    const tables = UnitTables.getInstance()
    const aliasPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'data', 'unit-aliases.json')
    const data = JSON.parse(readFileSync(aliasPath, 'utf8')) as { aliases?: Record<string, { source: string; code: string; name: string; factor: number; si: string; dimension: string }> }
    const aliases = data.aliases ?? {}
    /** 按中文名聚合：一个本地单位只注册一次（别名共用同一 Unit）。 */

    let index = 0
    for (const [alias, entry] of Object.entries(aliases)) {
      if (entry.source !== 'local') continue
      index += 1
      /** 每个本地别名注册一条（UCUM 的 name 表支持同名多单位），确保按别名能命中。 */
      const key = alias
      const template = TEMPLATE[entry.dimension]
      if (template === undefined) { result.skipped += 1; continue }
      const templateUnit = tables.getUnitByName(template.unit)
      const found = Array.isArray(templateUnit) ? templateUnit[0] : templateUnit
      if (!found || !(found as { dim_?: unknown }).dim_) { result.skipped += 1; continue }
      /** UCUM 的 magnitude 相对该维度的基准单位：质量基准是 gram（×1000），其他基准已是 SI 值（×1）。 */
      const magnitude = entry.factor * (entry.dimension === 'mass' ? 1000 : 1)
      try {
        /** 关键：必须继承模板 Unit 的原型（clone 等方法在原型上），否则换算时报 not a function。 */
        const unitObject = Object.create(Object.getPrototypeOf(found)) as Record<string, unknown>
        Object.assign(unitObject, {
          name_: alias,
          csCode_: safeCode(alias, index),
          ciCode_: safeCode(alias, index).toUpperCase(),
          magnitude_: magnitude,
          dim_: (found as { dim_: unknown }).dim_,
          property_: entry.dimension,
          printSymbol_: alias,
          class_: 'si',
          isBase_: false,
          isMetric_: true,
          isSpecial_: false,
          isArbitrary_: false,
          moleExp_: 0,
          equivalentExp_: 0,
          synonyms_: '',
        })
        tables.addUnit(unitObject)
        result.registered += 1
      } catch (error) {
        result.errors.push(alias + ': ' + (error instanceof Error ? error.message : String(error)))
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  return result
}

/**
 * 用 UCUM 引擎换算（含已注册的本地单位）。
 *
 * @param value - 数值
 * @param from - 源单位
 * @param to - 目标单位
 * @returns 换算数值；失败返回 null
 */
export function convertViaUcum(value: number, from: string, to: string): number | null {
  try {
    registerLocalUnits()
    const requireLocal = createRequire(import.meta.url)
    const { UcumLhcUtils } = requireLocal('@lhncbc/ucum-lhc') as { UcumLhcUtils: { getInstance: () => { convertUnitTo: (from: string, value: number, to: string) => { status: string; toVal?: number } } } }
    const utils = UcumLhcUtils.getInstance()
    /** 单位写法先折 UCUM：`·` → `.`（UCUM 用点号连接），上标 → 普通数字。 */
    const normalize = (unit: string): string => String(unit).replace(/·/g, '.').replace(/[²³]/g, (c) => (c === '²' ? '2' : '3'))
    const result = utils.convertUnitTo(normalize(from), value, normalize(to))
    if (result.status === 'succeeded' && typeof result.toVal === 'number') return result.toVal
  } catch {
    /* 失败由调用方决定是否回退 */
  }
  return null
}
