/**
 * derivation 子命令的完整性：**清单与实际分支必须一致**。
 *
 * ## 为什么需要
 *
 * 报错提示原本是硬编码的一句话，只列了 21 个，而实现里有 29 个：
 * `flip` / `trace` / `impact` / `cost` / `graph` / `heatmap` /
 * `whitepaper` / `timeline` / `observer` 都不在提示里。
 *
 * 后果不是报错，而是「存在但不可发现」—— AI 看到提示里的 21 个，
 * 就永远不会去调那 8 个。功能写了却没人用，等于没写。
 *
 * 这套测试做三件事：
 *   1. 清单（`DERIVATION_SUBCOMMANDS`）里的每个子命令都能真正执行；
 *   2. 实现里每个 `sub === 'xxx'` 分支都出现在清单里；
 *   3. 报错提示列出的可用项与清单完全一致。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const derivationMod = await import(pathToFileURL(join(root, 'lib/ops/derivation-op.js')).href)
const { DERIVATION_SUBCOMMANDS, opDerivation } = derivationMod

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? ': ' + detail : '')) }
  else { fails.push({ name, detail }); console.log('  FAIL ' + name + '\n         ' + (detail ?? '')) }
}

console.log('-- 1. 清单与实现分支一致（双向）--')
{
  const source = readFileSync(join(root, 'src/ops/derivation-op.ts'), 'utf8')
  const implemented = [...new Set(
    [...source.matchAll(/sub === '([a-zA-Z]+)'/g)].map((m) => m[1]),
  )]

  const declared = [...DERIVATION_SUBCOMMANDS]
  assert('清单不为空', declared.length > 0, String(declared.length))

  // 实现里有、清单里没有 → 不可发现
  const missing = implemented.filter((sub) => !declared.includes(sub))
  assert('实现里每个子命令都在清单里（否则不可发现）', missing.length === 0,
    missing.join(', ') || '无')

  // 清单里有、实现里没有 → 列了却调不通
  const ghost = declared.filter((sub) => !implemented.includes(sub))
  assert('清单里每个子命令都有实现（否则调不通）', ghost.length === 0,
    ghost.join(', ') || '无')

  assert('清单没有重复项', new Set(declared).size === declared.length,
    declared.length + ' vs ' + new Set(declared).size)
  console.log('       实现分支: ' + implemented.length + ' 个，清单: ' + declared.length + ' 个')
}

console.log('-- 2. 每个子命令都能真正执行（不崩、有输出）--')
{
  /**
   * 有些子命令需要参数才能给出有意义结果，但**任何**子命令都不该抛异常。
   * 这里只验「能跑通且有内容」，具体正确性由各自的测试套件负责。
   */
  for (const sub of DERIVATION_SUBCOMMANDS) {
    let result
    let error
    try {
      result = opDerivation({ derivation: sub })
    } catch (e) {
      error = e
    }
    assert(
      'derivation="' + sub + '" 能执行',
      error === undefined && Boolean(result) && typeof result.result === 'string' &&
        result.result.length > 0,
      error ? '抛异常: ' + error.message : String(result && result.result.length) + ' 字符',
    )
    // 不认识的子命令才会走到「未知子命令」分支；清单里的都不该出现这句
    if (result) {
      assert(
        'derivation="' + sub + '" 不是未实现分支',
        !result.result.includes('未知子命令'),
        result.result.split('\n')[0],
      )
    }
  }
}

console.log('-- 3. 报错提示必须列出全部子命令 --')
{
  const r = opDerivation({ derivation: '__nonsense__' })
  assert('未知子命令会报错提示', r.result.includes('未知子命令'), '')
  const hintLine = r.result.split('\n').find((line) => line.includes('可用')) || ''
  assert('提示里带数量', /共 \d+ 个/.test(hintLine), hintLine.slice(0, 60))

  const missingInHint = DERIVATION_SUBCOMMANDS.filter((sub) => !hintLine.includes(sub))
  assert('提示覆盖全部子命令（不再硬编码漏项）', missingInHint.length === 0,
    missingInHint.join(', ') || '无')

  // 数量必须与清单一致，防止文案写死一个数字
  const claimed = Number((hintLine.match(/共 (\d+) 个/) || [])[1])
  assert('提示里的数量 = 清单长度', claimed === DERIVATION_SUBCOMMANDS.length,
    claimed + ' vs ' + DERIVATION_SUBCOMMANDS.length)
}

console.log('-- 4. 9 个曾漏掉的子命令现在可发现 --')
{
  // 这几个正是硬编码提示里缺席的那批
  const wereMissing = ['flip', 'trace', 'impact', 'cost', 'graph', 'heatmap', 'whitepaper', 'timeline', 'observer']
  for (const sub of wereMissing) {
    assert('清单包含 ' + sub, DERIVATION_SUBCOMMANDS.includes(sub), '')
  }
  const r = opDerivation({ derivation: '__nonsense__' })
  const hintLine = r.result.split('\n').find((line) => line.includes('可用')) || ''
  for (const sub of wereMissing) {
    assert('报错提示里能查到 ' + sub, hintLine.includes(sub), '')
  }
}

console.log('')
if (fails.length === 0) { console.log('全部通过：' + pass + ' 项'); process.exit(0) }
console.log('通过 ' + pass + '，失败 ' + fails.length)
for (const f of fails) console.log('  - ' + f.name + ': ' + (f.detail ?? ''))
process.exit(1)
