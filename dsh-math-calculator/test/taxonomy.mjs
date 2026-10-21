/**
 * 公式标签体系测试（三轴：规则层级 / 学科领域 / 主角感知频率）。
 *
 * 用户纠正的核心：分类不能按学科，要按「离最底层规则的远近」；
 * 学科是另一条标签；频率是主角视角的感知频率，与前两者独立。
 */
import * as mod from '../lib/index.js'
import { FORMULAS, formulaFrequency } from '../lib/formulas.js'
import {
  LAYERS,
  layerOf,
  domainsOf,
  tagsOf,
  labelsOf,
  formulasByLayer,
  formulasByDomain,
  layerCounts,
  domainCounts,
} from '../lib/taxonomy.js'

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
const run = (args) => mod.runMathTool(args)
const find = (id) => FORMULAS.find((f) => f.id === id)

console.log('-- 1. 三轴必须齐全 --')
{
  assert('全部公式有层级', FORMULAS.every((f) => LAYERS.some((l) => l.id === layerOf(f))))
  assert('全部公式至少一个领域', FORMULAS.every((f) => domainsOf(f).length > 0))
  assert('全部公式有标签', FORMULAS.every((f) => tagsOf(f).length > 0))
  assert('全部公式有主角频率', FORMULAS.every((f) => ['high', 'medium', 'low'].includes(formulaFrequency(f))))
  const counts = layerCounts()
  assert('五个层级都有公式', counts.every((item) => item.count > 0), counts.map((i) => i.layer + '=' + i.count).join(', '))
  assert('层级计数之和 = 总数', counts.reduce((sum, item) => sum + item.count, 0) === FORMULAS.length)
}

console.log('-- 2. 层级按「离底层规则的远近」判定 --')
{
  assert('洛伦兹因子 → 基本规则', layerOf(find('lorentz_factor')) === 'fundamental', layerOf(find('lorentz_factor')))
  assert('环向应力 → 导出规律', layerOf(find('hoop_stress')) === 'derived', layerOf(find('hoop_stress')))
  assert('风寒指数 → 经验规律', layerOf(find('wind_chill')) === 'phenomenological', layerOf(find('wind_chill')))
  assert('用砖量 → 工程换算', layerOf(find('brick_count')) === 'engineering', layerOf(find('brick_count')))
  assert('楼梯舒适度 → 社会约定（经验规则）', layerOf(find('stair_comfort_rule')) === 'conventional', layerOf(find('stair_comfort_rule')))
}

console.log('-- 3. 学科领域是多标签 --')
{
  assert('环向应力：材料 + 工程', domainsOf(find('hoop_stress')).includes('materials') && domainsOf(find('hoop_stress')).includes('engineering'), domainsOf(find('hoop_stress')).join(','))
  assert('人体表面积：生物 + 医学', domainsOf(find('human_body_surface_area')).includes('biology') && domainsOf(find('human_body_surface_area')).includes('medicine'), domainsOf(find('human_body_surface_area')).join(','))
  assert('生长度日：农业 + 生物', domainsOf(find('growing_degree_days')).includes('agriculture') && domainsOf(find('growing_degree_days')).includes('biology'), domainsOf(find('growing_degree_days')).join(','))
  assert('一个领域可以覆盖多条', formulasByDomain('medicine').length >= 10, String(formulasByDomain('medicine').length))
}

console.log('-- 4. 频率是主角感知，与层级独立 --')
{
  assert('用砖量：工程 + 高频', layerOf(find('brick_count')) === 'engineering' && formulaFrequency(find('brick_count')) === 'high')
  assert('洛伦兹因子：基本规则 + 低频', layerOf(find('lorentz_factor')) === 'fundamental' && formulaFrequency(find('lorentz_factor')) === 'low')
  // 独立性：同一层级内出现多种频率 + 同一频率内出现多种层级
  const layerFreqs = new Map()
  for (const f of FORMULAS) {
    const key = layerOf(f)
    const set = layerFreqs.get(key) ?? new Set()
    set.add(formulaFrequency(f))
    layerFreqs.set(key, set)
  }
  assert('同一层级内出现多种频率', [...layerFreqs.values()].some((set) => set.size >= 2), [...layerFreqs.entries()].map(([k, v]) => k + ':' + [...v].join('/')).join(', '))
  const freqLayers = new Map()
  for (const f of FORMULAS) {
    const key = formulaFrequency(f)
    const set = freqLayers.get(key) ?? new Set()
    set.add(layerOf(f))
    freqLayers.set(key, set)
  }
  assert('同一频率内出现多种层级', [...freqLayers.values()].every((set) => set.size >= 2), [...freqLayers.entries()].map(([k, v]) => k + ':' + [...v].join('/')).join(', '))
}

console.log('-- 5. 按层级/领域查询 --')
{
  const layerQuery = run({ operation: 'formulas', query: 'layer:fundamental' })
  assert('layer:fundamental 可用', String(layerQuery.result).includes('基本规则'), String(layerQuery.result).slice(0, 30))
  assert('返回条数', layerQuery.value.total === formulasByLayer('fundamental').length)

  const zh = run({ operation: 'formulas', query: '层级:经验' })
  assert('中文层级别名', String(zh.result).includes('经验规律'), String(zh.result).slice(0, 30))

  const domainQuery = run({ operation: 'formulas', query: 'domain:医学' })
  assert('domain 中文别名', String(domainQuery.result).includes('医学'), String(domainQuery.result).slice(0, 30))
  assert('返回结构', domainQuery.value.domain === 'medicine', JSON.stringify(domainQuery.value))

  const bad = run({ operation: 'formulas', query: 'layer:nonsense' })
  assert('未知层级给提示', String(bad.result).includes('不认识'), String(bad.result).slice(0, 30))
}

console.log('-- 6. 目录概览与标签展示 --')
{
  const all = run({ operation: 'formulas', query: '*' })
  assert('概览含层级表', String(all.result).includes('按规则层级'))
  assert('概览含领域表', String(all.result).includes('按学科领域'))
  assert('概览返回结构化数据', Array.isArray(all.value.layers) && Array.isArray(all.value.domains))

  const labels = labelsOf(find('wind_chill'))
  assert('labelsOf 含中文层级名', labels.layerName === '经验规律', labels.layerName)
  assert('labelsOf 含中文领域名', labels.domainNames.includes('地球') || labels.domainNames.includes('物理'), labels.domainNames.join(','))
  assert('domainCounts 覆盖多领域', domainCounts().length >= 8, String(domainCounts().length))
}

console.log('')
if (fails.length === 0) {
  console.log(`全部通过：${pass} 项`)
} else {
  console.log(`通过 ${pass}，失败 ${fails.length}`)
  for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
  process.exitCode = 1
}
