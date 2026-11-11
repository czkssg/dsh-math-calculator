/**
 * skills 与插件功能的同步性测试。
 *
 * ## 为什么需要这套测试
 *
 * 用户的要求：
 * > 经常是 AI 不知道工具到底有什么用，所以还要写一篇使用工具的技能，
 * > 作为这个插件功能的一部分，**需要和插件的所有功能同步更新**。
 *
 * 「同步更新」不能靠人记得 —— 那一定会漂移。所以用测试钉住：
 *
 * ```
 *   工具加了 operation  → 测试红 → 必须去 skill 里补上
 *   工具删了 operation  → 测试红 → 必须从 skill 里删掉
 *   help 节改名        → 测试红 → 必须同步 skill 里的 key
 * ```
 *
 * ## skill 与 help 的分工（这条决定了测什么）
 *
 * ```
 *   help（工具内，按需查）        skill（宿主注入，开场可见）
 *   ──────────────────────       ────────────────────────
 *   「怎么传参」                  「什么时候该用」
 *   字段表、子命令、错误码         工作流、判据、误用
 * ```
 *
 * 所以**不测「skill 是否抄全了 help」** —— 抄全反而是重复付费。
 * 只测「skill 有没有提到这个能力的存在」与「提到的 key 是否真实存在」。
 */
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-skill-'))
process.env.DSH_MATH_CALC_HOME = home

const { mathExecuteTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const { HELP_TOPICS } = await import(pathToFileURL(join(root, 'lib/help.js')).href)

let pass = 0
const fails = []
function assert(name, cond, detail) {
  if (cond) {
    pass += 1
    console.log('  ok   ' + name)
  } else {
    fails.push(name + (detail ? ' :: ' + detail : ''))
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const skillsDir = join(root, 'skills')
const skillPath = join(skillsDir, 'world-deduction', 'SKILL.md')
const skill = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : ''
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const operations = mathExecuteTool.parameters.properties.operation.enum

// ───────────────────────────────────────────────────────────
console.log('-- 1. skill 存在且格式合法 --')
// ───────────────────────────────────────────────────────────
{
  assert('skills 目录存在', existsSync(skillsDir), skillsDir)
  assert('SKILL.md 存在', existsSync(skillPath), skillPath)
  assert('有 YAML frontmatter', skill.startsWith('---\n'), skill.slice(0, 20))

  /** frontmatter 必须有 name / description / whenToUse 三键。 */
  const fm = skill.split('---\n')[1] ?? ''
  for (const key of ['name:', 'description:', 'whenToUse:']) {
    assert('frontmatter 含 ' + key, fm.includes(key), '')
  }
  const nameMatch = /^name:\s*(\S+)$/m.exec(fm)
  assert('name 是 kebab-case', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(nameMatch?.[1] ?? ''), nameMatch?.[1] ?? '')

  /** description 要够长才能被匹配到（太短等于没写）。 */
  const descMatch = /^description:\s*(.+)$/m.exec(fm)
  assert('description 至少 80 字', (descMatch?.[1] ?? '').length >= 80,
    String((descMatch?.[1] ?? '').length))

  /** 目录名要与 frontmatter 的 name 一致（DSH 按目录名发现 skill）。 */
  const dirName = dirname(skillPath).split(/[\\/]/).pop()
  assert('目录名 == frontmatter name', dirName === nameMatch?.[1], `${dirName} vs ${nameMatch?.[1]}`)
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ skill 会被发布（否则装上也看不见）--')
// ───────────────────────────────────────────────────────────
{
  assert('files 含 skills', (pkg.files ?? []).includes('skills'), JSON.stringify(pkg.files))
  /**
   * ## 这一条是唯一必须的清单声明
   *
   * `package.json` 的 `files` 不列 `skills` → **发布到 npm 后 skill 不在包里**，
   * 本地测试全绿但用户装了看不到。
   *
   * ## 一处我先前写错、现已更正的假设
   *
   * 我最初以为还要在 `dsh.plugin.json` 的 `contributes.skills` 里声明路径，
   * 于是加了一条 `"skills": ["skills/world-deduction"]`。**那是错的。**
   *
   * 证据来自在装的 `dsh-novel-writer`（它的 skill 确实被宿主加载了 ——
   * 本会话的可用 skill 列表里就有 `novel-writing`）：
   *
   * ```
   *   package.json          "files": [..., "skills", ...]   ← 有
   *   contributes.skills                              ← 没有这个东西
   *   dsh.plugin.json                                 ← 它根本没有这个文件
   * ```
   *
   * **DSH 靠扫描插件包根目录的 `skills/` 子目录来发现 skill**，
   * 不需要额外声明。所以我撤掉了那条声明，也不再测它。
   *
   * 这里改为测「文件确实放在约定位置」—— 那是发现机制真正依赖的东西。
   */
  const onDisk = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((name) => {
        const p = join(skillsDir, name)
        return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
      })
    : []
  assert('skills/ 下有 SKILL.md 子目录', onDisk.length > 0, onDisk.join(','))

  /**
   * 反向：`skills/` 下不许有「只有目录没有 SKILL.md」的孤儿。
   * 那种目录会被扫描到却没有入口文件，只会让人以为是坏插件。
   */
  const orphans = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((name) => {
        const p = join(skillsDir, name)
        return statSync(p).isDirectory() && !existsSync(join(p, 'SKILL.md'))
      })
    : []
  assert('没有缺 SKILL.md 的孤儿目录', orphans.length === 0, orphans.join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. ★ 新增 operation 必须进 skill（同步的核心）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * 每个 operation 都必须在 skill 里出现过一次。
   *
   * 判据不是「详细解释」—— help 负责细节。skill 只要**提到这个名字**，
   * 让 AI 知道「有这么个东西」就够。没提到 = AI 永远不会想到用它。
   */
  const missing = operations.filter((op) => op !== 'auto' && op !== 'help' && !skill.includes(op))
  assert('★ 所有 operation 都在 skill 里被提到', missing.length === 0, missing.join(','))

  /**
   * 反向：skill 里出现的 operation 名必须真实存在。
   *
   * 防止 skill 写了已删除的能力（如旧的 `extractNumbers` 驼峰名），
   * 那会让 AI 照着一个不存在的 operation 去调。
   */
  const known = new Set(operations)
  /** 从 skill 的代码块与反引号里抽疑似 operation 名。 */
  const candidates = new Set()
  for (const m of skill.matchAll(/`([a-z_][a-z0-9_]*)`/g)) candidates.add(m[1])
  for (const m of skill.matchAll(/\{operation:"([a-z_][a-z0-9_]*)"\}/g)) candidates.add(m[1])
  /**
   * 只校验「像是 operation」的那些，且排除工具名本身。
   *
   * `math_execute` 是**工具名**不是 operation，形状却符合 —— 必须显式排除，
   * 否则测试会一直红在一条假问题上，久了就没人看这些断言了。
   */
  const NOT_OPEARTIONS = new Set(['math_execute'])
  const suspicious = [...candidates].filter(
    (word) => !known.has(word) && !NOT_OPEARTIONS.has(word) && /^[a-z]+(_[a-z]+)+$/.test(word),
  )
  assert('skill 里没有不存在的 operation', suspicious.length === 0, suspicious.join(','))
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. ★ skill 里引用的 helpTopic 必须真实存在 --')
// ───────────────────────────────────────────────────────────
{
  const topicKeys = new Set(HELP_TOPICS.map((t) => t.key))
  const referenced = new Set()
  for (const m of skill.matchAll(/helpTopic:"([a-zA-Z0-9_-]+)"/g)) referenced.add(m[1])
  const bogus = [...referenced].filter((key) => !topicKeys.has(key))
  assert('★ 引用的 helpTopic 都真实存在', bogus.length === 0, bogus.join(','))
  assert('至少引用了几个 helpTopic', referenced.size >= 2, String(referenced.size))
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. skill 不重复 help 的内容（避免两处漂移）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * skill 若把 help 的字段表抄一遍，就有两份会漂移的副本。
   * 这里只做粗判：skill 不该长到与 help 单节同量级。
   *
   * 阈值取 12000 字符 —— 目前 skill 约 5000，help 单节最长约 2400。
   * skill 是「一篇流程文档」，比任何单节长是正常的，但**不该成为第二份 help**。
   */
  assert('skill 长度合理（未抄成第二份 help）', skill.length < 12000, skill.length + ' 字符')
  assert('skill 明确说明详细说明去查 help', /helpTopic|helpQuery/.test(skill), '')
  /** 不该出现大段字段表（`| 字段 | 默认值 |` 这类）。 */
  const tableRows = (skill.match(/^\|\s*[a-zA-Z_]+\s*\|/gm) ?? []).length
  assert('没有整片字段表（那些属于 help）', tableRows < 10, String(tableRows))
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. skill 讲了三件 help 不讲的事 --')
// ───────────────────────────────────────────────────────────
{
  /** ① 什么时候该调（触发判据）。 */
  assert('★ 写了「什么时候该调」', /什么时候该调|该调|不必调/.test(skill), '')
  assert('给了「不必调」的反向判据', /不必调|心算即可|不用调/.test(skill), '')
  /** ② 工作流（步骤顺序）。 */
  assert('★ 给了至少两条工作流', (skill.match(/###\s*[①②③④]/g) ?? []).length >= 2,
    String((skill.match(/###\s*[①②③④]/g) ?? []).length))
  /** ③ 常见误用。 */
  assert('★ 写了误用与坑', /误用|最容易|不要/.test(skill), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 三条不可违反的性质在 skill 里被声明 --')
// ───────────────────────────────────────────────────────────
{
  /** 这三条是本项目的立身之本，skill 必须让 AI 开场就知道。 */
  assert('声明了可信度标签', /可信度标签|\[精确\]|\[标度\]/.test(skill), '')
  assert('声明了不猜', /不猜|判据由调用方给/.test(skill), '')
  assert('声明了 result 是数据通道', /result.*数据通道|提示走.*notice/.test(skill), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. ★ 写死的数字必须与当前一致（防止 skill 过时）--')
// ───────────────────────────────────────────────────────────
{
  /**
   * ## 为什么这条要紧
   *
   * skill 里写死的数字会随工具演进过时，而**过时的数字比没有数字更糟**：
   * AI 会照着它去找「665 条公式」，发现对不上就不信任整个 skill。
   *
   * 所以规则是：**写了就得对**。想避免维护成本就别写具体数字。
   */
  const opsCount = operations.length
  const numMatch = /(\d+)\s*个\s*operation/.exec(skill)
  if (numMatch) {
    assert('skill 里的 operation 数量与工具一致',
      Number(numMatch[1]) === opsCount,
      `skill 写 ${numMatch[1]}，实际 ${opsCount}`)
  }

  /** help 节数。 */
  const helpMatch = /(\d+)\s*节/.exec(skill)
  if (helpMatch) {
    assert('skill 里的 help 节数与实际一致',
      Number(helpMatch[1]) === HELP_TOPICS.length,
      `skill 写 ${helpMatch[1]}，实际 ${HELP_TOPICS.length}`)
  }

  /** 公式条数。 */
  const formulaMatch = /(\d+)\s*条公式|（(\d+)\s*条[^）]*）/.exec(skill)
  if (formulaMatch) {
    const claimed = Number(formulaMatch[1] ?? formulaMatch[2])
    const { FORMULAS } = await import(pathToFileURL(join(root, 'lib/formulas.js')).href)
    assert('skill 里的公式条数与实际一致',
      claimed === FORMULAS.length,
      `skill 写 ${claimed}，实际 ${FORMULAS.length}`)
  }

  /** brief 模式的实测数字（296 字符 / 省 93%）。 */
  if (/296\s*字符/.test(skill)) {
    /**
     * 这条不硬验 —— 那是「某次实测」的快照，重跑可能略有差异。
     * 但要在改 brief 时提醒，所以只打印提示不算失败。
     */
    console.log('        提示：skill 引用了 brief 的实测数字（296 字符/省 93%），改 brief 时记得同步')
  }
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
