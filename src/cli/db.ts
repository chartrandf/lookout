import { createRequire } from 'node:module'
import type { DatabaseSync } from 'node:sqlite'
import { advanceStage } from '../lib/stages'
import { stageUpdate, type TaskRow, toTask } from '../lib/taskrow'
import type { ReviewTask, Stage } from '../types'
import { resolveDbPath } from './paths'

// Required at call time, not imported: a static `node:sqlite` import is hoisted above everything,
// so on Node < 22.5 the process would die with ERR_UNKNOWN_BUILTIN_MODULE before the entry point
// could explain which Node it needs.
const sqlite = (): typeof import('node:sqlite') => createRequire(import.meta.url)('node:sqlite')

// The CLI never migrates: the app owns the schema (src-tauri/migrations). A missing file or a
// missing `tasks` table means "Lookout has not run here yet", which callers report as exit 3.
export class NoDatabaseError extends Error {}

export type Db = {
  tasks: (filter?: { repo?: string; stage?: Stage; branch?: string; prNumber?: number }) => ReviewTask[]
  task: (id: string) => ReviewTask | null
  setStage: (id: string, stage: Stage, force: boolean) => { from: Stage; to: Stage; changed: boolean }
  setSeen: (id: string, seen: boolean) => void
  clearNewActivity: (id: string) => void
  close: () => void
}

export const openDb = (path = resolveDbPath(), readOnly = false): Db => {
  let handle: DatabaseSync
  try {
    handle = new (sqlite().DatabaseSync)(path, { readOnly })
  } catch (e) {
    throw new NoDatabaseError(`no Lookout database at ${path} — start the app once first (${e})`)
  }
  if (!readOnly) handle.exec('PRAGMA busy_timeout = 5000') // the app holds connections too
  const tableQuery = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
  if (!handle.prepare(tableQuery).get()) {
    throw new NoDatabaseError(`${path} has no tasks table — start the app once first`)
  }

  const rowsToTasks = (rows: unknown[]): ReviewTask[] => rows.map((r) => toTask(r as TaskRow))

  const task = (id: string): ReviewTask | null => {
    const row = handle.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? toTask(row as TaskRow) : null
  }

  return {
    tasks: (filter = {}) => {
      const where: string[] = []
      const args: (string | number)[] = []
      if (filter.repo) {
        where.push('repo = ?')
        args.push(filter.repo)
      }
      if (filter.stage) {
        where.push('stage = ?')
        args.push(filter.stage)
      }
      if (filter.branch) {
        where.push('branch = ?')
        args.push(filter.branch)
      }
      if (filter.prNumber !== undefined) {
        where.push('pr_number = ?')
        args.push(filter.prNumber)
      }
      const sql = `SELECT * FROM tasks${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`
      return rowsToTasks(handle.prepare(sql).all(...args))
    },
    task,
    // Forward-only by default (the app's own rule, src/lib/stages.ts): an automated caller can't
    // drag a card back down the pipeline. --force sets it outright.
    setStage: (id, stage, force) => {
      const current = task(id)
      if (!current) throw new Error(`no card ${id}`)
      const to = force ? stage : advanceStage(current.stage, stage)
      if (to === current.stage) return { from: current.stage, to, changed: false }
      const u = stageUpdate(to)
      handle
        .prepare('UPDATE tasks SET stage = ?, done_at = ?, updated_at = ? WHERE id = ?')
        .run(u.stage, u.done_at, u.updated_at, id)
      return { from: current.stage, to, changed: true }
    },
    setSeen: (id, seen) => {
      handle.prepare('UPDATE tasks SET seen = ? WHERE id = ?').run(seen ? 1 : 0, id)
    },
    clearNewActivity: (id) => {
      handle.prepare('UPDATE tasks SET new_activity = 0 WHERE id = ?').run(id)
    },
    close: () => handle.close(),
  }
}
