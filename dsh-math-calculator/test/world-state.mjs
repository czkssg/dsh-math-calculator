/**
 * world_state（设定条目库）的测试。
 *
 * ## 它解决的真实问题
 *
 * 反馈包 `16` 号实测：朱庇特项目 **203 轮对话撞了 6 次上限**，
 * 每次只能把前面压成一份「对话继承总结」（有损压缩）。
 *
 * > 每次压缩都损失：细节、口径、推导链、例外情况。
 *
 * 桌面版的解法不是「压缩得更好」，而是**不压缩**：
 * ```
 *   网页版：状态在 AI 记忆里 → 撞上限就压 → 有损
 *   桌面版：状态在文件里     → 无限累积   → 按 id 查，不压缩
 * ```
 *
 * ## 本套件守四件事
 *
 *   ① **正文不压缩**（长正文存得下、取得回）
 *   ② **废弃链完整**（改设定不覆盖，后人能看到演化史）
 *   ③ **读坏了不许当空库**（否则会覆盖掉可恢复的文件）
 *   ④ **按 id 取**（这是「不占对话上下文」的兑现）
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const home = mkdtempSync(join(tmpdir(), 'dsh-wstate-'))
process.env.DSH_MATH_CALC_HOME = home

const { runMathTool } = await import(pathToFileURL(join(root, 'lib/index.js')).href)

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

const ws = (a) => runMathTool({ operation: 'world_state', world_state: a })
const txt = (r) => String(r.result ?? '')

// ───────────────────────────────────────────────────────────
console.log('-- 1. ★ 正文不压缩（对话继承的无损替代）--')
// ───────────────────────────────────────────────────────────
{
  /** 一段足够长的正文 —— 压缩总结会丢细节，这里必须原样存回。 */
  const longBody = '北境冰原的铁矿分布在三条矿脉上：\n' +
    '① 寒鸦岭矿脉，品位 62%，已开采 40 年；\n' +
    '② 白松谷矿脉，品位 55%，尚未大规模开采；\n' +
    '③ 断崖矿脉，品位 48%，运输困难。\n'.repeat(20)

  const set = await ws({ action: 'set', entries: [{ id: 'N01', title: '北境铁矿分布', body: longBody, tags: ['地理'] }] })
  assert('长正文写入成功', set.ok === true, txt(set).slice(0, 40))

  const get = await ws({ action: 'get', id: 'N01' })
  assert('长正文能取回', get.ok === true, '')
  assert('★ 正文一字不差', txt(get).includes('寒鸦岭矿脉，品位 62%'), '')
  assert('★ 长度没被截断', txt(get).length >= longBody.length, `${txt(get).length} vs ${longBody.length}`)
  assert('换行也保留了', txt(get).includes('\n① 寒鸦岭矿脉'), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 2. ★ 废弃链：改设定不覆盖 --')
// ───────────────────────────────────────────────────────────
{
  await ws({ action: 'set', entries: [
    { id: 'T021', title: '无氢工艺', body: '早期用无氢还原法。', tags: ['技术'] },
  ] })

  /** 改成新工艺，旧条目标废弃并建立取代关系。 */
  const update = await ws({ action: 'set', entries: [
    { id: 'T021', status: 'deprecated' },
    { id: 'T022', title: '微氢工艺', body: '改用微氢还原。', tags: ['技术'], supersedes: ['T021'] },
  ] })
  assert('更新成功', update.ok === true, txt(update).slice(0, 40))

  /** 旧条目还在，且标了废弃。 */
  const old = await ws({ action: 'get', id: 'T021' })
  assert('★ 旧条目没被删除', old.ok === true, '')
  assert('旧条目标了 deprecated', /已废弃/.test(txt(old)), '')

  /** 新条目能看到它取代了谁。 */
  const fresh = await ws({ action: 'get', id: 'T022' })
  assert('新条目记录了取代关系', /本条取代：T021/.test(txt(fresh)), '')
  /** 反过来也能查「被谁取代」。 */
  assert('★ 旧条目能看到被谁取代', /被这些取代.*T022/.test(txt(old)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 3. 列表：只给标题，正文按需取 --')
// ───────────────────────────────────────────────────────────
{
  const list = await ws({ action: 'list' })
  assert('列表成功', list.ok === true, '')
  assert('列出条目', (list.value?.entries ?? []).length > 0, '')
  /** 列表里带状态标记。 */
  assert('废弃条目有标记', /［废弃］/.test(txt(list)), '')
  /** 列表不该把长正文也吐出来（那是「不占上下文」的关键）。 */
  assert('★ 列表不含正文', !txt(list).includes('改用微氢还原'), '')
  assert('提示怎么取全文', /action:"get"/.test(txt(list)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 4. 按标签与关键词筛 --')
// ───────────────────────────────────────────────────────────
{
  await ws({ action: 'set', entries: [
    { id: 'P01', title: '政客默契维持温战', body: '各方低烈度冲突。', tags: ['政治'] },
    { id: 'M01', title: '军制改革', body: '改为西周社会编制。', tags: ['军事'] },
  ] })

  const byTag = await ws({ action: 'list', tag: '政治' })
  assert('按标签筛出 1 条', (byTag.value?.entries ?? []).length === 1, String((byTag.value?.entries ?? []).length))
  assert('筛对了条目', byTag.value?.entries?.[0]?.id === 'P01', String(byTag.value?.entries?.[0]?.id))

  const byQuery = await ws({ action: 'list', query: '西周' })
  assert('按关键词搜到', (byQuery.value?.entries ?? []).some((one) => one.id === 'M01'), '')

  const noMatch = await ws({ action: 'list', tag: '不存在的标签' })
  assert('无匹配时不崩', noMatch.ok === true, '')
  assert('无匹配时列出可用标签', /现有标签/.test(txt(noMatch)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 5. ★ 读坏了不许当空库（否则会覆盖可恢复的文件）--')
// ───────────────────────────────────────────────────────────
{
  const filePath = join(home, 'workspaces', 'default.state.json')
  assert('设定库文件已生成', existsSync(filePath), filePath)

  /** 先备份原内容，测完恢复。 */
  const backup = readFileSync(filePath, 'utf8')
  writeFileSync(filePath, '{ 这不是合法 JSON', 'utf8')

  const broken = await ws({ action: 'list' })
  assert('读坏了会报错（不返回空库）', broken.ok === false, String(broken.ok))
  assert('★ 明说「不是没有设定」', /不是「没有设定」|文件存在但解析失败/.test(broken.error?.hint ?? ''),
    broken.error?.hint?.slice(0, 80))
  assert('警告不要直接写入覆盖', /备份|覆盖/.test(broken.error?.hint ?? ''), '')

  /** set 也必须拒绝（不然就把文件覆盖了）。 */
  const setOnBroken = await ws({ action: 'set', entries: [{ id: 'X1', title: 'x' }] })
  assert('★ 坏文件上不许 set', setOnBroken.ok === false, String(setOnBroken.ok))

  writeFileSync(filePath, backup, 'utf8')
  const restored = await ws({ action: 'list' })
  assert('恢复后能读', restored.ok === true, '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 6. 一致性检查 --')
// ───────────────────────────────────────────────────────────
{
  /** 悬空引用：supersedes 指向不存在的条目。 */
  const dangling = await ws({ action: 'set', entries: [
    { id: 'D1', title: '新方案', body: 'x', supersedes: ['NOT_EXIST'] },
  ] })
  assert('★ 悬空引用被检出', /悬空引用/.test(txt(dangling)), txt(dangling).slice(0, 80))
  assert('报出具体是哪条', /D1\s*→\s*NOT_EXIST/.test(txt(dangling)), '')

  /** 同一标签下多条现行条目。 */
  await ws({ action: 'set', entries: [
    { id: 'A1', title: '方案甲', body: 'x', tags: ['同主题'] },
    { id: 'A2', title: '方案乙', body: 'y', tags: ['同主题'] },
  ] })
  const check = await ws({ action: 'check' })
  assert('同标签多现行被提示', /标签「同主题」下有 2 条现行/.test(txt(check)), '')
  assert('提示「旧的该标 deprecated」', /deprecated/.test(txt(check)), '')

  /** 现行条目引用了已废弃条目。 */
  await ws({ action: 'set', entries: [
    { id: 'OLD', title: '旧规定', body: 'x', tags: ['规则'] },
  ] })
  await ws({ action: 'set', entries: [{ id: 'OLD', status: 'deprecated' }] })
  await ws({ action: 'set', entries: [
    { id: 'NEW', title: '新规程', body: '依据 OLD 的精神制定', tags: ['规则'] },
  ] })
  const cite = await ws({ action: 'check' })
  assert('引用已废弃条目被提示', /仍在引用已废弃的 OLD/.test(txt(cite)), '')

  assert('检查里说「不替你改」', /不替你改/.test(txt(cite)), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 7. 错误处理 --')
// ───────────────────────────────────────────────────────────
{
  const noEntries = await ws({ action: 'set' })
  assert('set 不给 entries 报错', noEntries.ok === false, String(noEntries.ok))
  assert('报错给示例', /entries/.test(noEntries.error?.hint ?? ''), '')

  const noId = await ws({ action: 'set', entries: [{ title: '没有 id' }] })
  assert('缺 id 报错', noId.ok === false, String(noId.ok))

  const badId = await ws({ action: 'set', entries: [{ id: '有 空格', title: 'x' }] })
  assert('非法 id 报错', badId.ok === false, String(badId.ok))

  const noTitle = await ws({ action: 'set', entries: [{ id: 'NT1' }] })
  assert('缺 title 报错', noTitle.ok === false, String(noTitle.ok))

  const getMissing = await ws({ action: 'get', id: 'NO_SUCH' })
  assert('取不存在的 id 报错', getMissing.ok === false, String(getMissing.ok))
  assert('报错列出可用 id', /现有条目/.test(getMissing.error?.hint ?? ''), '')
}

// ───────────────────────────────────────────────────────────
console.log('-- 8. 结构化输出与持久化 --')
// ───────────────────────────────────────────────────────────
{
  const list = await ws({ action: 'list' })
  for (const key of ['action', 'workspace', 'total', 'shown', 'entries', 'tags']) {
    assert('value 含 ' + key, list.value?.[key] !== undefined, '')
  }
  assert('结果可 JSON 序列化', (() => {
    try { JSON.stringify(list.value); return true } catch { return false }
  })(), '')

  /** 落盘文件是合法 JSON（能被别的工具读）。 */
  const filePath = join(home, 'workspaces', 'default.state.json')
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  assert('文件是合法 JSON', typeof parsed === 'object' && Array.isArray(parsed.entries), '')
  assert('文件里有版本号', typeof parsed.version === 'number', String(parsed.version))
}

// ───────────────────────────────────────────────────────────
console.log('-- 9. 空库与首次使用 --')
// ───────────────────────────────────────────────────────────
{
  /** 换一个工作区，那里还没有设定库。 */
  await runMathTool({ operation: 'workspace', action2: 'create', name: 'fresh-state' })
  const empty = await runMathTool({ operation: 'world_state', world_state: { action: 'list', workspace: 'fresh-state' } })
  assert('空库不报错', empty.ok === true, '')
  assert('空库给建条目的示例', /action:"set"/.test(txt(empty)), '')
  assert('空库说明这是「无损替代」', /无损替代|不压缩/.test(txt(empty)), '')
}

rmSync(home, { recursive: true, force: true })
console.log('')
if (fails.length > 0) {
  console.log('失败 ' + fails.length + ' 项：')
  for (const f of fails) console.log('  - ' + f)
}
console.log('通过 ' + pass + '，失败 ' + fails.length)
process.exit(fails.length === 0 ? 0 : 1)
