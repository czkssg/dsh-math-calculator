/**
 * 运行日志：用 **pino + rotating-file-stream**（开源组合），不自写轮转。
 *
 * 用户要求（2026-11-15）：**不依赖使用者自行反馈**——每次调用的结果与报错自动落盘。
 *
 * 选型（先查开源，见 docs/运行日志.md）：
 * - `pino` 10.4.0（MIT，JSON 原生日志，周下载千万级）
 * - `rotating-file-stream` 4.0.0（MIT，按大小轮转，零依赖）
 *
 * 位置：`<DSH_MATH_CALC_HOME>/logs/run.log.jsonl`；超过 2 MB 轮转成 `run.log.1.jsonl`。
 *
 * @module dsh-math-calculator/core/run-log
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createStream, type RotatingFileStream } from 'rotating-file-stream'
import { pino, type Logger } from 'pino'
import { workspaceDirectory } from '../io/workspace-store.js'

/** 单条日志。 */
export interface RunLogEntry {
  at: string
  operation: string
  ok: boolean
  errorType?: string
  errorMessage?: string
  ms?: number
  input?: string
}

/** 日志目录。 */
export function runLogDirectory(): string {
  return join(workspaceDirectory(), '..', 'logs')
}

/** 日志文件（当前档）。 */
export function runLogPath(): string {
  return join(runLogDirectory(), 'run.log.jsonl')
}

/** 轮转阈值（2 MB）。 */
const MAX_BYTES = 2 * 1024 * 1024

let stream: RotatingFileStream | null = null
let logger: Logger | null = null

/** 取（或初始化）日志器。 */
function getLogger(): Logger {
  if (logger !== null) return logger
  const dir = runLogDirectory()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  /** rotating-file-stream 负责轮转；pino 负责 JSON 行与序列化。 */
  stream = createStream('run.log.jsonl', { path: dir, size: '2M', maxFiles: 1, history: 'run.log.1.jsonl' })
  logger = pino({ level: 'info', base: undefined, timestamp: false }, stream)
  return logger
}

/**
 * 写一条运行日志（失败静默，绝不影响工具返回）。
 *
 * @param entry - 日志内容
 */
export function writeRunLog(entry: RunLogEntry): void {
  try {
    getLogger().info(entry)
  } catch {
    /* 日志写失败不抛：旁路功能 */
  }
}

/**
 * 关闭日志流（测试/退出用；之后不能再写）。
 */
export function flushRunLog(): void {
  try {
    stream?.end()
    stream = null
    logger = null
  } catch {
    /* 忽略 */
  }
}

/**
 * 从工具结果构造日志条目。
 *
 * @param args - 调用参数
 * @param result - 工具返回
 * @param startedAt - 开始时间（ms）
 * @returns 日志条目
 */
export function entryFromResult(args: Record<string, unknown>, result: { ok: boolean; error?: { type?: string; message?: string }; operation?: string }, startedAt: number): RunLogEntry {
  const input = typeof args['expression'] === 'string' ? args['expression'] : JSON.stringify(args).slice(0, 200)
  return {
    at: new Date().toISOString(),
    operation: result.operation ?? (typeof args['operation'] === 'string' ? args['operation'] : 'auto'),
    ok: result.ok === true,
    ...(result.error?.type !== undefined ? { errorType: result.error.type } : {}),
    ...(result.error?.message !== undefined ? { errorMessage: String(result.error.message).slice(0, 500) } : {}),
    ms: Math.max(0, Date.now() - startedAt),
    input: input.slice(0, 200),
  }
}

/**
 * 读最近 N 条日志（供排查/统计）。
 *
 * @param limit - 条数
 * @returns 日志条目
 */
export function readRecentRunLogs(limit = 50): RunLogEntry[] {
  try {
    const path = runLogPath()
    if (!existsSync(path)) return []
    const text = readFileSync(path, 'utf8')
    const lines = text.trim().split('\n').filter((line) => line !== '')
    return lines.slice(-limit).map((line) => JSON.parse(line) as RunLogEntry)
  } catch {
    return []
  }
}
