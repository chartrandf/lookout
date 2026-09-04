import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { openDb } from './db'

// The app applies these on launch (src-tauri/src/lib.rs). Replaying them here means a migration that
// doesn't do what it claims fails in CI rather than on someone's board.
const MIGRATIONS = join(import.meta.dirname, '..', '..', 'src-tauri', 'migrations')
const files = (): string[] => readdirSync(MIGRATIONS).sort()

const applyThrough = (db: DatabaseSync, lastVersion: number) => {
  for (const name of files()) {
    if (Number(name.slice(0, 3)) > lastVersion) continue
    db.exec(readFileSync(join(MIGRATIONS, name), 'utf8'))
  }
}

const apply = (db: DatabaseSync, name: string) => db.exec(readFileSync(join(MIGRATIONS, name), 'utf8'))

describe('012_needs_review', () => {
  it('renames stage inbox to needs_review and leaves every other stage alone', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lookout-migrate-')), 'lookout.db')
    const h = new DatabaseSync(path)
    applyThrough(h, 11)

    const insert = h.prepare(
      `INSERT INTO tasks (id, repo, branch, pr_number, pr_title, pr_url, pr_author, stage, updated_at)
       VALUES (?, 'owner/repo', 'b', ?, 't', 'u', 'a', ?, '2026-09-01T00:00:00.000Z')`,
    )
    insert.run('owner/repo#1', 1, 'inbox')
    insert.run('owner/repo#2', 2, 'reviewing')
    insert.run('owner/repo#3', 3, 'done')

    apply(h, '012_needs_review.sql')
    const stages = (h.prepare('SELECT id, stage FROM tasks ORDER BY id').all() as { id: string; stage: string }[]).map(
      (r) => r.stage,
    )
    h.close()

    expect(stages).toEqual(['needs_review', 'reviewing', 'done'])
  })

  it('leaves a database that never had an inbox card untouched', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lookout-migrate-')), 'lookout.db')
    const h = new DatabaseSync(path)
    applyThrough(h, 11)
    h.prepare(
      `INSERT INTO tasks (id, repo, branch, pr_number, pr_title, pr_url, pr_author, stage, updated_at)
       VALUES ('owner/repo#1', 'owner/repo', 'b', 1, 't', 'u', 'a', 'watching', '2026-09-01T00:00:00.000Z')`,
    ).run()
    apply(h, '012_needs_review.sql')
    h.close()

    const db = openDb(path, true)
    expect(db.tasks().map((t) => t.stage)).toEqual(['watching'])
    db.close()
  })

  it('is registered with the app, or it never runs', () => {
    const lib = readFileSync(join(import.meta.dirname, '..', '..', 'src-tauri', 'src', 'lib.rs'), 'utf8')
    for (const name of files()) {
      expect(lib).toContain(`migrations/${name}`)
    }
  })
})
