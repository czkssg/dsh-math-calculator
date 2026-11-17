/**
 * 全量测试报告：逐套运行 test-v3/*.mjs，产出给「测试员 AI」直接读的 JSON。
 *
 * ## 为什么需要它
 *
 * 测试总数与逐套明细只存在于终端输出里：换一个会话、换一个 AI，就得重跑一遍
 * 才知道「现在绿不绿、每套多少项、各自测什么」。这里把结果写成 test-v3/test-report.json——
 * 下一次接手的测试员 AI 先读这一份，不必先跑 20 分钟。
 *
 * ## 文件里有什么
 *
 * - summary：套数 / 项数 / 失败数 / 是否全绿；
 * - howToRun：构建、单套、全量各自怎么跑；
 * - conventions：写测试与排查的约定（独立 HOME、成对断言、判空、build 等）；
 * - suites[]：每套的 name / file / title / purpose / 项数 / 失败 / 耗时 / 复现命令。
 *
 * 用法：`npm run test:report`（全量，约 15–20 分钟；退出码非 0 表示有失败）
 *
 * @module dsh-math-calculator/scripts/test-report
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const suiteDir = join(root, 'test-v3')
const files = readdirSync(suiteDir).filter((name) => name.endsWith('.mjs')).sort()

/**
 * 从测试文件开头的块注释里取标题与用途。
 *
 * @param filePath - 测试文件绝对路径
 * @returns {title?, purpose?}；没有头注释时为空对象
 */
function describe(filePath) {
  let text = ''
  try {
    text = readFileSync(filePath, 'utf8')
  } catch {
    return {}
  }
  const match = /^\s*\/\*\*([\s\S]*?)\*\//.exec(text)
  if (match === null) return {}
  const lines = match[1].split('\n').map((line) => line.replace(/^\s*\*\s?/, '').trim())
  const title = lines.find((line) => line !== '') ?? ''
  const purpose = []
  let started = false
  for (const line of lines) {
    if (!started) {
      if (line === title) started = true
      continue
    }
    if (line === '') {
      if (purpose.length > 0) break
      continue
    }
    if (line.startsWith('##')) break
    purpose.push(line)
  }
  return {
    ...(title !== '' ? { title } : {}),
    ...(purpose.length > 0 ? { purpose: purpose.slice(0, 3).join(' ').slice(0, 240) } : {}),
  }
}

/**
 * 从测试输出里取「通过 X，失败 Y」。
 *
 * @param output - stdout + stderr
 * @returns {passed, failed} | null
 */
function parseCounts(output) {
  const match = /通过\s*(\d+)\s*[，,]\s*失败\s*(\d+)/.exec(output)
  return match ? { passed: Number(match[1]), failed: Number(match[2]) } : null
}

const PROJECT = 'dsh-math-calculator'
const suites = []
for (const file of files) {
  const filePath = join(suiteDir, file)
  const startedAt = Date.now()
  const run = spawnSync(process.execPath, [filePath], {
    cwd: root,
    encoding: 'utf8',
    /** 不强制关日志：run-log 这类套件本身要验证日志写入，套件应自己声明环境。 */
    env: process.env,
    timeout: 600000,
  })
  const output = String(run.stdout ?? '') + String(run.stderr ?? '')
  const counts = parseCounts(output)
  const ok = counts !== null && counts.failed === 0 && run.status === 0
  const info = describe(filePath)
  suites.push({
    name: file.replace(/\.mjs$/, ''),
    file: 'test-v3/' + file,
    command: 'node test-v3/' + file,
    ...info,
    passed: counts === null ? 0 : counts.passed,
    failed: counts === null ? 1 : counts.failed,
    ok,
    ms: Date.now() - startedAt,
    ...(counts === null
      ? { note: '未解析到统计行（测试可能崩溃，或超时 600s）', tail: output.trim().split('\n').slice(-3).join('\n') }
      : {}),
  })
  process.stdout.write((ok ? "  ok   " : "  FAIL ") + file + "\n")
}

const passed = suites.reduce((sum, item) => sum + item.passed, 0)
const failed = suites.reduce((sum, item) => sum + item.failed, 0)
const allGreen = failed === 0 && suites.every((item) => item.ok)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const slowest = suites.slice().sort((left, right) => right.ms - left.ms)[0] ?? null

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  project: PROJECT,
  version,
  summaryText:
    suites.length + ' 套 / ' + passed + ' 项' + (allGreen ? '全绿' : '有失败') + '（失败 ' + failed + '）· v' + version,
  summary: {
    suites: suites.length,
    passed,
    failed,
    allGreen,
    slowest: slowest === null ? null : { name: slowest.name, ms: slowest.ms },
  },
  howToRun: {
    build: 'npm run build',
    single: 'node test-v3/<name>.mjs',
    all: 'node scripts/test-report.mjs',
    note: '测试 import lib/ 产物，改过 src/ 必须先 build；每套自设独立临时 DSH_MATH_CALC_HOME。',
  },
  conventions: [
    '改过 src/ 必须先 npm run build——测试 import 的是 lib/ 产物，不是 src/。',
    '每套测试自设独立 DSH_MATH_CALC_HOME（临时目录）；共用会互相污染。',
    '断言成对：每条「该拒绝」都要配一条「该放行」；只测一边会漏掉过度收紧。',
    "断言的 detail 用 String(x === undefined ? 'ok' : JSON.stringify(x))；JSON.stringify(undefined).slice() 会让测试自己崩（已犯三次）。",
    '统计行固定为「通过 N，失败 M」；缺失即视为该套崩溃（多半是断言或 import 写错）。',
    '新增测试放 test-v3/<kebab-case>.mjs；文件头写 /** 用途 */，本报告会读成 title/purpose。',
    '测试不联网；需要外部数据用 test-v3/fixtures/ 快照（如 world-parity 的 169 KB 快照）。',
    '失败先看本报告 failures[] 与 suites[].tail，再看 <DSH_MATH_CALC_HOME>/logs/run.log.jsonl。',
    '本报告只覆盖 test-v3/；test/ 是 v3 之前的旧套件（141 个文件，node test/run.mjs），未纳入统计。',
  ],
  suites,
  failures: suites.filter((item) => !item.ok).map((item) => item.name),
}

writeFileSync(join(suiteDir, 'test-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log('\n' + report.summaryText)
console.log('报告：test-v3/test-report.json')
if (!allGreen) process.exitCode = 1
