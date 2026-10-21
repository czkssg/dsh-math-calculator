/**
 * 全局公式包：在 270 条内置公式之外，允许「实际推导时」自行添加公式。
 *
 * 两级扩展（用户要求的区分）：
 *   1. **全局公式包**（本模块）：存 $DSH_HOME/math-calc/formula-packs/global.json，
 *      所有工作区共享，改动需要写盘 —— 适合沉淀「这套设定里反复用到的公式」；
 *   2. **工作区临时公式**（formula-table 的 custom）：只属于某个世界观，
 *      适合一次性试算。
 *
 * 为什么用文件而不是内置数组：内置公式是代码，改一次要重新构建、重新装。
 * 文件包可以随时增删，且能被后来的人或另一个 AI 直接读懂、审查、提交到仓库。
 *
 * 校验规则（宁可拒绝，也不要让坏公式混进库）：
 *   · id 必须匹配 ^[a-z][a-z0-9_]{1,63}$
 *   · expr 必须能被 mathjs 解析
 *   · expr 里的符号必须出现在 params 或 CONSTANTS 里（防止拼错变量名）
 *   · 参数必须是 { value: number|null, desc: string }
 *
 * @module dsh-math-calculator/formula-pack
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse } from 'mathjs'

import { CONSTANTS, type FormulaDef, type ParamSpec } from './formula-library.js'

/** 包文件结构。 */
export interface FormulaPack {
  /** 结构版本。 */
  version: number
  /** 最后更新时间（写盘时自动填）。 */
  updatedAt?: string
  /** 公式列表。 */
  formulas: FormulaDef[]
}

/** 校验结果。 */
export interface PackValidation {
  ok: boolean
  formula?: FormulaDef
  errors: string[]
}

/** DSH 家目录（与 workspace.ts 同一套规则，但不 import 它以避免循环依赖）。 */
function dshHome(): string {
  const custom = process.env.DSH_HOME
  if (typeof custom === 'string' && custom.trim() !== '') return custom.trim()
  return join(homedir(), '.dsh')
}

/** 全局公式包文件路径。 */
export function packFilePath(): string {
  return join(dshHome(), 'math-calc', 'formula-packs', 'global.json')
}

/** 读取包文件（不存在或损坏时返回空包）。 */
export function readPack(): FormulaPack {
  const file = packFilePath()
  if (!existsSync(file)) return { version: 1, formulas: [] }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as FormulaPack
    if (!parsed || !Array.isArray(parsed.formulas)) return { version: 1, formulas: [] }
    return { version: parsed.version ?? 1, formulas: parsed.formulas.filter((item) => validateFormula(item).ok) }
  } catch {
    return { version: 1, formulas: [] }
  }
}

/** 原子写回包文件。 */
function writePack(pack: FormulaPack): void {
  const file = packFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const data: FormulaPack = { version: 1, updatedAt: new Date().toISOString(), formulas: pack.formulas }
  const temp = file + '.tmp'
  writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(temp, file)
}

/**
 * 校验一条公式（不写盘）。
 * @param input - 待校验的公式对象。
 * @param reservedIds - 已被内置公式占用的 id（不能覆盖）。
 */
export function validateFormula(input: any, reservedIds?: Set<string>): PackValidation {
  const errors: string[] = []
  if (!input || typeof input !== 'object') return { ok: false, errors: ['公式必须是对象'] }

  const id = String(input.id ?? '').trim()
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(id)) errors.push('id 必须是小写字母开头、只含小写字母/数字/下划线，长度 2-64')
  if (reservedIds && reservedIds.has(id)) errors.push(`id "${id}" 与内置公式冲突`)

  const cat = String(input.cat ?? '').trim()
  if (cat === '') errors.push('缺少 cat（分类路径，如 physics/custom）')
  const name = String(input.name ?? '').trim()
  if (name === '') errors.push('缺少 name（中文名）')
  const expr = String(input.expr ?? '').trim()
  if (expr === '') errors.push('缺少 expr（mathjs 表达式）')
  const desc = String(input.desc ?? '').trim()
  if (desc === '') errors.push('缺少 desc（一句话物理说明）')

  const params: Record<string, ParamSpec> = {}
  if (!input.params || typeof input.params !== 'object') {
    errors.push('缺少 params（参数表：名字 → { value, desc }）')
  } else {
    for (const [key, spec] of Object.entries(input.params as Record<string, any>)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        errors.push(`参数名 "${key}" 不合法（只能是字母/数字/下划线）`)
        continue
      }
      const value = spec && typeof spec === 'object' ? spec.value : undefined
      if (value !== null && !(typeof value === 'number' && Number.isFinite(value))) {
        errors.push(`参数 "${key}" 的 value 必须是数字或 null（必填）`)
      }
      const paramDesc = spec && typeof spec === 'object' ? String(spec.desc ?? '') : ''
      if (paramDesc.trim() === '') errors.push(`参数 "${key}" 缺少 desc（写清物理概念与单位，如 "质量 kg"）`)
      params[key] = { value: value === null ? null : Number(value), desc: paramDesc || key }
    }
  }

  // 表达式语法与符号校验
  if (expr !== '') {
    try {
      const node: any = parse(expr)
      const symbols = new Set<string>()
      node.traverse((current: any) => {
        if (current && current.type === 'SymbolNode') symbols.add(String(current.name))
      })
      const allowed = new Set([...Object.keys(params), ...Object.keys(CONSTANTS)])
      const unknown = [...symbols].filter((symbol) => !allowed.has(symbol))
      if (unknown.length > 0) {
        errors.push(`表达式里的符号未在 params/CONSTANTS 中定义：${unknown.join(', ')}`)
      }
    } catch (error) {
      errors.push('表达式无法解析：' + (error instanceof Error ? error.message : String(error)))
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const formula: FormulaDef = {
    id,
    cat,
    name,
    expr,
    params,
    desc,
    ...(typeof input.unit === 'string' && input.unit.trim() !== '' ? { unit: input.unit.trim() } : {}),
    ...(Array.isArray(input.keys) ? { keys: input.keys.map(String).filter(Boolean) } : {}),
  }
  return { ok: true, formula, errors: [] }
}

/** 读出全部全局公式（已过滤掉不合法的）。 */
export function loadGlobalFormulas(): FormulaDef[] {
  return readPack().formulas
}

/**
 * 添加一条全局公式。
 * @param input - 公式对象。
 * @param reservedIds - 已被占用的 id（内置公式）。
 */
export function addGlobalFormula(input: any, reservedIds?: Set<string>): PackValidation & { total?: number } {
  const validation = validateFormula(input, reservedIds)
  if (!validation.ok || !validation.formula) return validation
  const pack = readPack()
  if (pack.formulas.some((item) => item.id === validation.formula!.id)) {
    return { ok: false, errors: [`id "${validation.formula.id}" 已存在于全局包`] }
  }
  pack.formulas.push(validation.formula)
  writePack(pack)
  return { ...validation, total: pack.formulas.length }
}

/** 删除一条全局公式（返回是否删掉）。 */
export function removeGlobalFormula(id: string): boolean {
  const pack = readPack()
  const next = pack.formulas.filter((item) => item.id !== id)
  if (next.length === pack.formulas.length) return false
  writePack({ version: 1, formulas: next })
  return true
}

/** 列出全局包里的公式（薄行，供 UI 展示）。 */
export function listGlobalFormulas(): Array<{ id: string; name: string; cat: string; expr: string }> {
  return readPack().formulas.map((item) => ({ id: item.id, name: item.name, cat: item.cat, expr: item.expr }))
}
