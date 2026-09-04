import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { NoDatabaseError, openDb } from './db'

// Build the test DB from the app's real migrations, so a schema change that the CLI's SQL doesn't
// follow fails here instead of in production.
const MIGRATIONS = join(import.meta.dirname, '..', '..', 'src-tauri', 'migrations')

const seedDb = (): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'lookout-cli-')), 'lookout.db')
  const h = new DatabaseSync(path)
  for (const name of readdirSync(MIGRATIONS).sort()) {
    h.exec(readFileSync(join(MIGRATIONS, name), 'utf8'))
  }
  h.close()
  return path
}

const insert = (path: string, id: string, stage: string, branch = 'feature-x', pr = 1) => {
  const h = new DatabaseSync(path)
  h.prepare(
    `INSERT INTO tasks (id, repo, branch, pr_number, pr_title, pr_url, pr_author, stage, updated_at)
     VALUES (?, 'owner/repo', ?, ?, 'title', 'https://x', 'me', ?, '2026-09-01T00:00:00.000Z')`,
  ).run(id, branch, pr, stage)
  h.close()
}

const stageOf = (path: string, id: string): { stage: string; done_at: string | null; updated_at: string } => {
  const h = new DatabaseSync(path)
  const row = h.prepare('SELECT stage, done_at, updated_at FROM tasks WHERE id = ?').get(id) as {
    stage: string
    done_at: string | null
    updated_at: string
  }
  h.close()
  return row
}

describe('openDb', () => {
  it('reports a missing database rather than creating one', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'lookout-cli-')), 'nope.db')
    expect(() => openDb(missing, true)).toThrow(NoDatabaseError)
  })

  it('reports a database with no tasks table', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lookout-cli-')), 'empty.db')
    new DatabaseSync(path).close()
    expect(() => openDb(path, false)).toThrow(NoDatabaseError)
  })
})

describe('setStage', () => {
  let path: string
  beforeEach(() => {
    path = seedDb()
    insert(path, 'owner/repo#1', 'reviewing')
  })

  it('moves a card forward and bumps updated_at', () => {
    const db = openDb(path)
    const move = db.setStage('owner/repo#1', 'reviewed', false)
    db.close()
    expect(move).toMatchObject({ from: 'reviewing', to: 'reviewed', changed: true })
    const row = stageOf(path, 'owner/repo#1')
    expect(row.stage).toBe('reviewed')
    expect(row.updated_at).not.toBe('2026-09-01T00:00:00.000Z')
  })

  it('is forward-only: a followup card is not dragged back to reviewed', () => {
    insert(path, 'owner/repo#2', 'followup', 'other-branch', 2)
    const db = openDb(path)
    const move = db.setStage('owner/repo#2', 'reviewed', false)
    db.close()
    expect(move).toMatchObject({ from: 'followup', to: 'followup', changed: false })
    expect(stageOf(path, 'owner/repo#2').stage).toBe('followup')
  })

  it('--force sets the stage outright', () => {
    insert(path, 'owner/repo#3', 'done', 'third', 3)
    const db = openDb(path)
    expect(db.setStage('owner/repo#3', 'reviewed', true)).toMatchObject({ to: 'reviewed', changed: true })
    db.close()
    expect(stageOf(path, 'owner/repo#3').stage).toBe('reviewed')
  })

  it('stamps done_at entering Done and clears it on the way out', () => {
    const db = openDb(path)
    db.setStage('owner/repo#1', 'done', false)
    expect(stageOf(path, 'owner/repo#1').done_at).not.toBeNull()
    db.setStage('owner/repo#1', 'reviewed', true)
    db.close()
    expect(stageOf(path, 'owner/repo#1').done_at).toBeNull()
  })

  it('is idempotent: re-running the same move changes nothing', () => {
    const db = openDb(path)
    db.setStage('owner/repo#1', 'reviewed', false)
    const second = db.setStage('owner/repo#1', 'reviewed', false)
    db.close()
    expect(second.changed).toBe(false)
  })

  it('rejects an unknown card', () => {
    const db = openDb(path)
    expect(() => db.setStage('owner/repo#404', 'reviewed', false)).toThrow(/no card/)
    db.close()
  })
})

describe('tasks', () => {
  it('filters by repo, stage, branch and pr number', () => {
    const path = seedDb()
    insert(path, 'owner/repo#1', 'reviewing', 'alpha', 1)
    insert(path, 'owner/repo#2', 'done', 'beta', 2)
    const db = openDb(path, true)
    expect(db.tasks().length).toBe(2)
    expect(db.tasks({ stage: 'done' }).map((t) => t.id)).toEqual(['owner/repo#2'])
    expect(db.tasks({ branch: 'alpha' }).map((t) => t.id)).toEqual(['owner/repo#1'])
    expect(db.tasks({ prNumber: 2 }).map((t) => t.id)).toEqual(['owner/repo#2'])
    expect(db.tasks({ repo: 'other/repo' })).toEqual([])
    db.close()
  })

  it('maps rows through the app’s own toTask', () => {
    const path = seedDb()
    insert(path, 'owner/repo#1', 'watching')
    const db = openDb(path, true)
    const [t] = db.tasks()
    db.close()
    expect(t).toMatchObject({ id: 'owner/repo#1', prNumber: 1, stage: 'watching', sessionIds: [], reviewFiles: [] })
  })
})

describe('concurrent writers', () => {
  it('a second connection can write while the first is open', () => {
    const path = seedDb()
    insert(path, 'owner/repo#1', 'watching')
    const a = openDb(path)
    const b = openDb(path)
    a.setStage('owner/repo#1', 'needs_review', false)
    b.setStage('owner/repo#1', 'reviewing', false)
    a.close()
    b.close()
    expect(stageOf(path, 'owner/repo#1').stage).toBe('reviewing')
  })
})
