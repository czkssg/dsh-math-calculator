/**
 * 实体类型与关系类型：拓扑的"词汇表"，以及自创接口。
 *
 * ## 为什么要类型
 *
 * 只给「节点/边」的话，推演里每种实体都要临时约定字段：军队单位要有 headcount、
 * 行政区要有 population、舰船舱室要有 deck……没有类型就无法校验，也无法回答
 * 「这个世界该有哪些实体」。所以内置一批**推演会用到的实体类型**，并允许
 * 用户自创（存工作区）。
 *
 * ## 内置 20 种实体 + 14 种关系
 *
 * ```
 *   物理    unit 行政 admin 聚落 settlement 地形 terrain 通道 road
 *          建筑 building 舰船 ship 舱室 compartment 资源 resource 战线 front
 *   概念    faction office law tech belief event title person artifact trade_route
 * ```
 *
 * 关系：command / admin_of / support / border / route / supply / alliance /
 * rivalry / member_of / depends_on / precedes / contains / trade / trade_flow。
 *
 * ## 自创接口
 *
 * `{topology:{action:"define", entityType:{name, label, fields, relations}}}`
 * → 写进工作区的 `customEntities`，之后的 model/org/terrain/ship 都能用。
 * 自创类型可以**扩展内置**（同名则覆盖），也可以全新。
 *
 * @module dsh-math-calculator/features/topology/entities
 */

import { CalcError } from '../../core/errors.js'

/** 实体类型定义。 */
export interface EntityTypeDef {
  /** 类型名（小写蛇形）。 */
  name: string
  /** 中文标签。 */
  label: string
  /** 类别：physical | conceptual。 */
  category: 'physical' | 'conceptual'
  /** 必填字段。 */
  required: string[]
  /** 允许的入/出关系（不填 = 不限）。 */
  relations?: string[]
  /** 说明。 */
  note?: string
}

/** 关系类型定义。 */
export interface RelationTypeDef {
  name: string
  label: string
  /** 方向：directed | undirected。 */
  direction: 'directed' | 'undirected'
  /** 基数：1:1 | 1:N | N:N（对 from 端而言）。 */
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:N'
  note?: string
}

/** 内置实体类型。 */
export const ENTITY_TYPES: EntityTypeDef[] = [
  { name: 'unit', label: '军队单位', category: 'physical', required: ['level', 'headcount'], relations: ['command', 'support', 'member_of'], note: '师/旅/团/营/连；headcount=0 表示缺编' },
  { name: 'admin', label: '行政区', category: 'physical', required: ['level', 'population'], relations: ['admin_of', 'border', 'member_of'], note: '省/州/郡/县；population 是辖区人口' },
  { name: 'settlement', label: '聚落', category: 'physical', required: ['population', 'type'], relations: ['route', 'border', 'supply'], note: 'type：城/镇/村/要塞/港口' },
  { name: 'terrain', label: '地形斑块', category: 'physical', required: ['kind'], relations: ['border', 'route'], note: 'kind：平原/山地/森林/沙漠/沼泽/冰原' },
  { name: 'road', label: '通道', category: 'physical', required: ['from', 'to', 'kind'], relations: ['route'], note: '作为边使用；kind：road/river/pass/sea/rail' },
  { name: 'building', label: '建筑', category: 'physical', required: ['kind', 'floors'], relations: ['contains', 'route'], note: 'kind：building/tower/fortress/dam' },
  { name: 'ship', label: '舰船', category: 'physical', required: ['class', 'massKg'], relations: ['contains', 'route'], note: 'class：frigate/carrier/freighter；massKg 满载' },
  { name: 'compartment', label: '舱室', category: 'physical', required: ['kind'], relations: ['contains', 'route'], note: 'kind：bridge/engine/magazine/quarters/reactor' },
  { name: 'resource', label: '资源点', category: 'physical', required: ['kind', 'reserve'], relations: ['supply', 'route'], note: 'kind：矿/油田/良田/水源；reserve 与单位要在 note 里写清' },
  { name: 'front', label: '战线', category: 'physical', required: ['from', 'to', 'state'], relations: ['border', 'rivalry'], note: 'state：推进/僵持/崩溃' },
  { name: 'faction', label: '派系', category: 'conceptual', required: ['ideology', 'power'], relations: ['alliance', 'rivalry', 'member_of'], note: 'power 用 0–1 相对值或席位' },
  { name: 'office', label: '官职', category: 'conceptual', required: ['rank', 'duty'], relations: ['command', 'member_of'], note: 'rank 是品级/序位；duty 是职责' },
  { name: 'law', label: '法令', category: 'conceptual', required: ['scope', 'effect'], relations: ['depends_on', 'precedes'], note: 'scope：全国/地方/教区' },
  { name: 'tech', label: '技术', category: 'conceptual', required: ['level'], relations: ['depends_on', 'precedes'], note: 'level 0–10；prereqs 用 depends_on 边' },
  { name: 'belief', label: '信仰', category: 'conceptual', required: ['followers', 'doctrine'], relations: ['member_of', 'rivalry', 'alliance'], note: 'followers 人数；doctrine 一句话' },
  { name: 'event', label: '事件', category: 'conceptual', required: ['start', 'end'], relations: ['precedes', 'depends_on'], note: 'start/end 用年或纪元；参与方用 member_of 边' },
  { name: 'title', label: '头衔/爵位', category: 'conceptual', required: ['rank', 'precedence'], relations: ['command', 'member_of'], note: 'precedence 是礼制序位' },
  { name: 'person', label: '人物', category: 'conceptual', required: ['role'], relations: ['member_of', 'command', 'alliance', 'rivalry'], note: 'role：君主/将领/官僚/商人/学者' },
  { name: 'artifact', label: '器物', category: 'conceptual', required: ['power', 'origin'], relations: ['depends_on', 'contains'], note: 'power 用相对值；origin 是来源设定' },
  { name: 'trade_route', label: '商路', category: 'conceptual', required: ['goods', 'volume'], relations: ['trade_flow', 'route'], note: 'goods 是货物清单；volume 是年运量' },
]

/** 内置关系类型。 */
export const RELATION_TYPES: RelationTypeDef[] = [
  { name: 'command', label: '辖属/指挥', direction: 'directed', cardinality: 'N:1', note: '子 → 父；N:1 表示一个子只有一个直接上级（矩阵式会违反，属有意设计）' },
  { name: 'admin_of', label: '管辖', direction: 'directed', cardinality: 'N:1', note: '下级行政区 → 上级' },
  { name: 'support', label: '支援', direction: 'undirected', cardinality: 'N:N', note: '互相支援，不构成隶属' },
  { name: 'border', label: '相邻', direction: 'undirected', cardinality: 'N:N', note: '空间相邻' },
  { name: 'route', label: '通道', direction: 'undirected', cardinality: 'N:N', note: '可通行（道路/河流/海路）' },
  { name: 'supply', label: '补给', direction: 'directed', cardinality: 'N:N', note: '资源点 → 消费方' },
  { name: 'alliance', label: '同盟', direction: 'undirected', cardinality: 'N:N', note: '' },
  { name: 'rivalry', label: '敌对', direction: 'undirected', cardinality: 'N:N', note: '' },
  { name: 'member_of', label: '属于', direction: 'directed', cardinality: 'N:N', note: '成员 → 组织/派系/信仰' },
  { name: 'depends_on', label: '依赖', direction: 'directed', cardinality: 'N:N', note: '技术/法令/器物依赖前置' },
  { name: 'precedes', label: '先于', direction: 'directed', cardinality: 'N:N', note: '时间先后' },
  { name: 'contains', label: '包含', direction: 'directed', cardinality: 'N:1', note: '整体 → 部分（舰船含舱室）' },
  { name: 'trade', label: '贸易', direction: 'directed', cardinality: 'N:N', note: '聚落/商路之间的贸易流' },
  { name: 'trade_flow', label: '货流', direction: 'directed', cardinality: 'N:N', note: '商路上的货物流向' },
]

/** 校验问题。 */
export interface EntityProblem {
  kind: 'unknown-type' | 'missing-field' | 'unknown-relation' | 'relation-not-allowed' | 'cardinality'
  where: string
  message: string
}

/** 校验实体图。 */
export function validateEntityGraph(
  nodes: Array<{ id: string; type?: string; [key: string]: unknown }>,
  edges: Array<{ from: string; to: string; kind?: string }>,
  customTypes: EntityTypeDef[] = [],
): EntityProblem[] {
  const types = new Map<string, EntityTypeDef>()
  for (const type of ENTITY_TYPES) types.set(type.name, type)
  for (const type of customTypes) types.set(type.name, type)
  const relations = new Map<string, RelationTypeDef>()
  for (const relation of RELATION_TYPES) relations.set(relation.name, relation)
  const problems: EntityProblem[] = []
  const nodeTypes = new Map<string, string>()

  for (const node of nodes) {
    const typeName = typeof node.type === 'string' ? node.type : ''
    if (typeName === '') {
      problems.push({ kind: 'unknown-type', where: node.id, message: '实体缺少 type（不知道它是什么实体）' })
      continue
    }
    const def = types.get(typeName)
    if (def === undefined) {
      problems.push({ kind: 'unknown-type', where: node.id, message: '未知实体类型「' + typeName + '」；可先 topology.action="define" 自创，或 action="entities" 看内置清单' })
      continue
    }
    nodeTypes.set(node.id, typeName)
    for (const field of def.required) {
      if (node[field] === undefined || node[field] === null || node[field] === '') {
        problems.push({ kind: 'missing-field', where: node.id, message: def.label + ' 缺必填字段「' + field + '」' })
      }
    }
  }

  for (const edge of edges) {
    const relationName = typeof edge.kind === 'string' ? edge.kind : ''
    if (relationName === '') {
      problems.push({ kind: 'unknown-relation', where: edge.from + '→' + edge.to, message: '边缺少 kind（关系类型）' })
      continue
    }
    const relation = relations.get(relationName)
    if (relation === undefined) {
      problems.push({ kind: 'unknown-relation', where: edge.from + '→' + edge.to, message: '未知关系类型「' + relationName + '」' })
      continue
    }
    const fromType = nodeTypes.get(edge.from)
    const toType = nodeTypes.get(edge.to)
    if (fromType === undefined || toType === undefined) continue
    const fromDef = types.get(fromType)
    const toDef = types.get(toType)
    if (fromDef?.relations !== undefined && !fromDef.relations.includes(relationName)) {
      problems.push({ kind: 'relation-not-allowed', where: edge.from + '→' + edge.to, message: fromDef.label + ' 不该有「' + relation.label + '」关系（允许：' + fromDef.relations.join('/') + '）' })
    }
    /** 基数 1:1 / N:1：同一个 from 只能有一条该关系。 */
    if (relation.cardinality !== 'N:N') {
      const same = edges.filter((item) => item.from === edge.from && item.kind === relationName)
      if (same.length > 1) {
        problems.push({ kind: 'cardinality', where: edge.from, message: '「' + edge.from + '」有 ' + same.length + ' 条「' + relation.label + '」（该关系是 ' + relation.cardinality + '）' })
      }
    }
  }
  return problems
}

/** 合并内置与自创类型。 */
export function mergeEntityTypes(customTypes: EntityTypeDef[] = []): EntityTypeDef[] {
  const map = new Map<string, EntityTypeDef>()
  for (const type of ENTITY_TYPES) map.set(type.name, type)
  for (const type of customTypes) map.set(type.name, type)
  return [...map.values()]
}

/** 校验自创类型定义。 */
export function validateEntityType(raw: unknown): EntityTypeDef {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CalcError('invalid_argument', 'entityType 必须是对象 {name,label,category,required,relations?}', '例如 {name:"clan",label:"氏族",category:"conceptual",required:["members","leader"]}。')
  }
  const record = raw as Record<string, unknown>
  const name = typeof record['name'] === 'string' ? record['name'].trim() : ''
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(name)) {
    throw new CalcError('invalid_argument', 'entityType.name 必须是小写蛇形（1–31 字符）', '收到 "' + name + '"；例如 clan / space_station。')
  }
  const label = typeof record['label'] === 'string' && record['label'].trim() !== '' ? record['label'].trim() : name
  const category = record['category'] === 'physical' || record['category'] === 'conceptual' ? record['category'] : 'conceptual'
  const required = Array.isArray(record['required']) ? record['required'].filter((item): item is string => typeof item === 'string') : []
  if (required.length === 0) {
    throw new CalcError('invalid_argument', 'entityType.required 不能为空', '至少给一个必填字段，否则这个类型无法校验。')
  }
  const relations = Array.isArray(record['relations']) ? record['relations'].filter((item): item is string => typeof item === 'string') : undefined
  return { name, label, category, required, ...(relations !== undefined ? { relations } : {}) }
}
