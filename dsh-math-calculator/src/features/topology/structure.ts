/**
 * 结构与载具：建筑容量/限高、载具续航/载荷。
 *
 * ## 不复写物理
 *
 * 建筑限高直接复用 feasibility 的 buildingHeight（σ/(ρg)）；
 * 载具续航用能量除以单位距离能耗（齐奥尔科夫斯基式的账本，不是新物理）。
 * 本模块只做装配与判据，不做新的物理推导。
 *
 * @module dsh-math-calculator/features/topology/structure
 */

import { CalcError } from '../../core/errors.js'
import { CONSTRAINTS, deriveConstraintContext } from '../deduction/feasibility.js'

/** 建筑输入。 */
export interface BuildingInput {
  kind: 'building'
  /** 层数。 */
  floors: number
  /** 单层建筑面积 m²。 */
  footprintM2: number
  /** 人均使用面积 m²（缺省 15）。 */
  perPersonM2?: number
  /** 层高 m（缺省 3.5）。 */
  floorHeightM?: number
  /** 世界参数（用于限高：材料强度/密度/重力）。 */
  world?: Record<string, unknown>
}

/** 载具输入。 */
export interface VehicleInput {
  kind: 'vehicle'
  /** 满载质量 kg。 */
  massKg: number
  /** 载荷 kg（缺省 0）。 */
  payloadKg?: number
  /** 巡航速度 km/h。 */
  speedKph: number
  /** 可用能量 J。 */
  energyJ: number
  /** 单位距离能耗 J/km。 */
  energyPerKmJ: number
}

/** 结果。 */
export interface StructureOutcome {
  result: string
  value: unknown
  notice?: string
}

/** 数字渲染。 */
function f(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) return value.toExponential(2)
  return Number(value.toPrecision(4)).toString()
}

/**
 * 建筑评估。
 *
 * @param input - 建筑参数
 * @returns 容量、限高与判定
 * @throws {CalcError} 参数非法
 */
export function assessBuilding(input: BuildingInput): StructureOutcome {
  if (!(input.floors > 0) || !Number.isFinite(input.floors)) throw new CalcError('invalid_argument', 'floors 必须是正数（收到 ' + String(input.floors) + '）', '')
  if (!(input.footprintM2 > 0) || !Number.isFinite(input.footprintM2)) throw new CalcError('invalid_argument', 'footprintM2 必须是正数（收到 ' + String(input.footprintM2) + '）', '')
  const perPerson = input.perPersonM2 !== undefined && input.perPersonM2 > 0 ? input.perPersonM2 : 15
  const floorHeight = input.floorHeightM !== undefined && input.floorHeightM > 0 ? input.floorHeightM : 3.5
  const heightM = input.floors * floorHeight
  const capacity = Math.floor((input.floors * input.footprintM2) / perPerson)

  const ctx = deriveConstraintContext(input.world ?? {})
  const limitM = CONSTRAINTS.find((constraint) => constraint.id === 'buildingHeight')?.limit(ctx) ?? Number.POSITIVE_INFINITY
  const ok = heightM <= limitM
  const lines = [
    '═══ 建筑评估 ═══',
    '',
    '  层数 ' + input.floors + '，单层 ' + f(input.footprintM2) + ' m²，层高 ' + f(floorHeight) + ' m',
    '  总高 ' + f(heightM) + ' m，限高 ' + f(limitM) + ' m（材料/重力决定）',
    '  容量 ' + capacity + ' 人（人均 ' + f(perPerson) + ' m²）',
    '',
    ok ? '  ✓ 高度在材料可支撑范围内' : '  ✗ 超过限高 ' + f(heightM / limitM) + ' 倍——等截面结构会自重压垮',
    '',
    '  ★ 容量只算面积；疏散、采光、供水与结构用钢量是另一层，本模型不算。',
  ]
  return {
    result: lines.join('\n'),
    value: { kind: 'building', heightM, limitM, capacity, ok, floors: input.floors, footprintM2: input.footprintM2 },
    ...(ok ? {} : { notice: '建筑高度超过材料上限，需要更强材料、更低重力或非等截面结构' }),
  }
}

/**
 * 载具评估。
 *
 * @param input - 载具参数
 * @returns 续航、时间与载荷比
 * @throws {CalcError} 参数非法
 */
export function assessVehicle(input: VehicleInput): StructureOutcome {
  if (!(input.massKg > 0) || !Number.isFinite(input.massKg)) throw new CalcError('invalid_argument', 'massKg 必须是正数（收到 ' + String(input.massKg) + '）', '')
  if (!(input.speedKph > 0) || !Number.isFinite(input.speedKph)) throw new CalcError('invalid_argument', 'speedKph 必须是正数（收到 ' + String(input.speedKph) + '）', '')
  if (!(input.energyJ > 0) || !Number.isFinite(input.energyJ)) throw new CalcError('invalid_argument', 'energyJ 必须是正数（收到 ' + String(input.energyJ) + '）', '')
  if (!(input.energyPerKmJ > 0) || !Number.isFinite(input.energyPerKmJ)) throw new CalcError('invalid_argument', 'energyPerKmJ 必须是正数（收到 ' + String(input.energyPerKmJ) + '）', '')

  const payload = input.payloadKg ?? 0
  const rangeKm = input.energyJ / input.energyPerKmJ
  const hours = rangeKm / input.speedKph
  const payloadRatio = payload / input.massKg
  const lines = [
    '═══ 载具评估 ═══',
    '',
    '  满载质量 ' + f(input.massKg) + ' kg，载荷 ' + f(payload) + ' kg（载荷比 ' + (payloadRatio * 100).toFixed(1) + '%）',
    '  巡航 ' + f(input.speedKph) + ' km/h，可用能量 ' + f(input.energyJ) + ' J',
    '  续航 ' + f(rangeKm) + ' km，约 ' + f(hours) + ' 小时',
    '',
    payloadRatio > 1 ? '  ✗ 载荷超过满载质量——这相当于自己抬自己，需要外部升力/浮力' : '  ✓ 载荷比在合理范围',
    '',
    '  ★ 续航按匀速直线算；起降、加速、风阻与地形坡度是另一层。',
  ]
  return {
    result: lines.join('\n'),
    value: { kind: 'vehicle', rangeKm, hours, payloadRatio, massKg: input.massKg, payloadKg: payload, speedKph: input.speedKph },
    ...(payloadRatio > 1 ? { notice: '载荷比 > 1，现实中需要外部升力或分次运输' } : {}),
  }
}

/**
 * 统一入口。
 *
 * @param input - 建筑或载具
 * @returns 评估结果
 * @throws {CalcError} kind 未知
 */
export function assessStructure(input: BuildingInput | VehicleInput | undefined): StructureOutcome {
  if (input === undefined || input === null) {
    throw new CalcError('missing_params', 'structure 需要输入', '建筑：{kind:"building", floors:10, footprintM2:800}；载具：{kind:"vehicle", massKg:5000, speedKph:200, energyJ:1e10, energyPerKmJ:1e6}。')
  }
  if (input.kind === 'building') return assessBuilding(input)
  if (input.kind === 'vehicle') return assessVehicle(input)
  throw new CalcError('unknown_argument', '不认识的 kind「' + String((input as { kind?: string }).kind) + '」', '可用：building / vehicle。')
}
