/**
 * 自设单位的持久化与操作。
 *
 * ## 为什么必须落盘
 *
 * mathjs 的 `createUnit` 只在**进程内**生效。而自设单位的使用场景跨会话：
 *
 * ```
 *   第 1 轮   定义「1 维尔 = 1.2 km」
 *   第 2 轮   另一个会话要用「5 维尔」
 * ```
 *
 * 只注册不存储，第 2 轮就找不到。
 *
 * ## 存储位置
 *
 * ```
 * <数据目录>/custom-units.json     ← 全局层（跨工作区）
 * ```
 *
 * 只做全局层：工作区层留待有真实需求再加。
 * 理由 —— 用户定义的通常是**整个世界观共用**的单位（维尔、石炭），
 * 而不是某个工作区专有的。
 *
 * ## 损坏处理
 *
 * 文件损坏时**不能当空表**（那会静默丢失用户定义的几百个单位），
 * 而是报错并保留原文件 —— 与老插件 `world-state` 的做法一致。
 *
 * @module dsh-math-calculator/core/units-custom-store
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalcError } from './errors.js'
import type { CustomUnit } from './units-custom.js'

/** 文件版本（结构变化时递增，便于迁移）。 */
const SCHEMA_VERSION = 1

/** 存储结构。 */
interface StoreFile {
  version: number
  units: CustomUnit[]
}

/** 数据目录（由调用方传入，通常是 `DSH_MATH_CALC_HOME`）。 */
export interface StoreOptions {
  /** 数据目录。 */
  home: string
}

/**
 * 读自设单位表。
 *
 * @param options - 存储选项
 * @returns 单位列表（文件不存在时返回空表）
 */
export function loadCustomUnits(options: StoreOptions): CustomUnit[] {
  const file = join(options.home, 'custom-units.json')
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw) as StoreFile
    /**
     * ## 损坏时不能静默当空表
     *
     * 若返回 `[]`，用户下次 add 时会把整个文件覆盖掉 ——
     * 之前定义的几百个单位**静默消失**。
     *
     * 所以结构不对就抛错，让人去修文件或显式清空。
     */
    if (typeof parsed.version !== 'number' || !Array.isArray(parsed.units)) {
      throw new CalcError(
        'invalid_argument',
        '自设单位文件结构不认识：' + file,
        '文件应为 {"version":1,"units":[...]}。修复它，或用 action:"reset" 清空重建。',
      )
    }
    /** 逐条过滤掉字段不全的（不因一条坏数据丢掉全表）。 */
    return parsed.units.filter(
      (u) =>
        typeof u?.name === 'string' &&
        typeof u?.display === 'string' &&
        typeof u?.dimension === 'string' &&
        typeof u?.factor === 'number' &&
        Number.isFinite(u.factor) &&
        u.factor > 0,
    )
  } catch (error) {
    if (error instanceof CalcError) throw error
    throw new CalcError(
      'invalid_argument',
      '自设单位文件读不出来：' + file + '（' + (error instanceof Error ? error.message : String(error)) + '）',
      '文件可能损坏。修好它，或用 action:"reset" 清空重建。',
    )
  }
}

/**
 * 写自设单位表（原子写：先写临时文件再改名）。
 *
 * ## 为什么要临时文件
 *
 * 直接写目标文件时若进程中断，会留下**半个 JSON**。
 * 而半个 JSON 在下次加载时报错，用户就卡住了。
 *
 * 先写 `<file>.tmp` 再 `renameSync` —— rename 在同一分区上是原子的。
 *
 * @param options - 存储选项
 * @param units - 单位列表
 */
export function saveCustomUnits(options: StoreOptions, units: CustomUnit[]): void {
  mkdirSync(options.home, { recursive: true })
  const file = join(options.home, 'custom-units.json')
  const tmp = file + '.tmp'
  const payload: StoreFile = { version: SCHEMA_VERSION, units }
  writeFileSync(tmp, JSON.stringify(payload, null, 1), 'utf8')
  renameSync(tmp, file)
}

/**
 * 新增一个自设单位（已校验通过）。
 *
 * @param options - 存储选项
 * @param unit - 单位
 * @returns 更新后的全表
 */
export function appendCustomUnit(options: StoreOptions, unit: CustomUnit): CustomUnit[] {
  const units = loadCustomUnits(options)
  /** 同名则替换（便于「改了重来」）。 */
  const index = units.findIndex((u) => u.name === unit.name)
  if (index >= 0) units[index] = unit
  else units.push(unit)
  saveCustomUnits(options, units)
  return units
}

/**
 * 删除一个自设单位。
 *
 * @param options - 存储选项
 * @param nameOrDisplay - 注册名或显示名
 * @returns 删除后的全表；没找到返回 null
 */
export function removeCustomUnit(options: StoreOptions, nameOrDisplay: string): CustomUnit[] | null {
  const units = loadCustomUnits(options)
  const next = units.filter((u) => u.name !== nameOrDisplay && u.display !== nameOrDisplay)
  if (next.length === units.length) return null
  saveCustomUnits(options, next)
  return next
}
