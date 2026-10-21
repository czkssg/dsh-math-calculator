const fs = require('node:fs')

const raw = fs.readFileSync('D:\\0cengxu\\5\\plugins-index.json', 'utf8')
let data
try {
  data = JSON.parse(raw)
} catch (e) {
  console.log('JSON 解析失败:', e.message)
  process.exit(1)
}

// 结构探测
console.log('=== 顶层结构 ===')
console.log('类型:', Array.isArray(data) ? 'array' : 'object')
if (!Array.isArray(data)) {
  console.log('键:', Object.keys(data).slice(0, 20).join(', '))
  for (const [k, v] of Object.entries(data)) {
    console.log('  ' + k + ':', Array.isArray(v) ? `array(${v.length})` : typeof v)
  }
}

const list = Array.isArray(data) ? data : (data.plugins || data.items || data.packages || [])
console.log('')
console.log('插件总数:', list.length)
if (list.length > 0) {
  console.log('第一条的字段:', Object.keys(list[0]).join(', '))
  console.log('样例:', JSON.stringify(list[0]).slice(0, 400))
}

// 关键词过滤：加速/性能
const KEYWORDS = [
  'accelerat', 'speed', 'fast', 'perf', 'optimi', 'cache', 'prefetch',
  '加速', '提速', '性能', '优化', '缓存', '压缩', 'turbo', 'boost', 'quick',
  'latency', 'delay', 'throughput', 'parallel', 'concurren',
]

function score(p) {
  const text = [
    p.name, p.title, p.displayName, p.description, p.summary, p.desc,
    (p.keywords || []).join(' '), (p.tags || []).join(' '),
    (p.categories || []).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  let hits = []
  for (const k of KEYWORDS) {
    if (text.includes(k.toLowerCase())) hits.push(k)
  }
  return hits
}

const matched = []
for (const p of list) {
  const hits = score(p)
  if (hits.length > 0) matched.push({ plugin: p, hits })
}

console.log('')
console.log('=== 关键词命中: ' + matched.length + ' 个 ===')
for (const m of matched) {
  const p = m.plugin
  const name = p.name || p.id || p.packageName || p.title || '(无名)'
  const desc = (p.description || p.summary || p.desc || '').slice(0, 100)
  console.log('')
  console.log('  ' + name)
  console.log('    命中: ' + m.hits.join(', '))
  if (desc) console.log('    描述: ' + desc)
  if (p.author) console.log('    作者: ' + (typeof p.author === 'string' ? p.author : p.author.name || JSON.stringify(p.author)))
  if (p.downloads !== undefined) console.log('    下载: ' + p.downloads)
  if (p.stars !== undefined) console.log('    星标: ' + p.stars)
  if (p.version) console.log('    版本: ' + p.version)
  if (p.updatedAt || p.updated) console.log('    更新: ' + (p.updatedAt || p.updated))
}
