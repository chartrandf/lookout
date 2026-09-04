import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXIT, run } from './main'

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'src-tauri', 'migrations')

let dbPath: string
let out: string[]
let err: string[]

// The CLI reads the DB path from the environment, and the whole point of $LOOKOUT_DB is that the
// tests never touch the real one.
const cli = (...argv: string[]) =>
  run(
    argv,
    (s) => out.push(String(s)),
    (s) => err.push(String(s)),
  )

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), 'lookout-cli-')), 'lookout.db')
  const h = new DatabaseSync(dbPath)
  for (const name of readdirSync(MIGRATIONS).sort()) h.exec(readFileSync(join(MIGRATIONS, name), 'utf8'))
  h.prepare(
    `INSERT INTO tasks (id, repo, repo_path, branch, pr_number, pr_title, pr_url, pr_author, stage, updated_at)
     VALUES ('owner/repo#42', 'owner/repo', '/tmp/repo', 'feature-x', 42, 'A title',
             'https://github.com/owner/repo/pull/42', 'someone', 'reviewing', '2026-09-01T00:00:00.000Z')`,
  ).run()
  h.close()
  process.env.LOOKOUT_DB = dbPath
  // no socket pointer in the test env: notifyApp must stay silent
  process.env.HOME = join(mkdtempSync(join(tmpdir(), 'lookout-home-')))
  out = []
  err = []
})

afterEach(() => {
  delete process.env.LOOKOUT_DB
})

const stageOf = (id: string): string => {
  const h = new DatabaseSync(dbPath)
  const row = h.prepare('SELECT stage FROM tasks WHERE id = ?').get(id) as { stage: string }
  h.close()
  return row.stage
}

describe('help and unknown commands', () => {
  it('prints usage with no arguments', () => {
    expect(cli()).toBe(EXIT.ok)
    expect(out.join('')).toContain('lookout card list')
  })

  it('rejects an unknown command', () => {
    expect(cli('frobnicate')).toBe(EXIT.error)
    expect(err.join('')).toContain('unknown command')
  })

  it('rejects an unknown stage', () => {
    expect(cli('card', 'stage', 'nope', '--card', 'owner/repo#42')).toBe(EXIT.error)
    expect(err.join('')).toContain('unknown stage')
  })

  it('accepts the follow-up verb the way the board spells it', () => {
    expect(cli('card', 'follow-up', '--card', 'owner/repo#42')).toBe(EXIT.ok)
  })
})

describe('card list / show', () => {
  it('lists cards with UI stage labels, not ids', () => {
    expect(cli('card', 'list')).toBe(EXIT.ok)
    expect(out.join('')).toContain('In Review')
  })

  it('emits json when asked', () => {
    expect(cli('card', 'list', '--json')).toBe(EXIT.ok)
    expect(JSON.parse(out.join(''))).toEqual([
      expect.objectContaining({ id: 'owner/repo#42', stage: 'reviewing', stage_label: 'In Review' }),
    ])
  })

  it('shows one card by pr number', () => {
    expect(cli('card', 'show', '--pr', '42')).toBe(EXIT.ok)
    expect(out.join('')).toContain('https://github.com/owner/repo/pull/42')
  })

  it('exits 2 when nothing matches', () => {
    expect(cli('card', 'show', '--pr', '999')).toBe(EXIT.noMatch)
    expect(err.join('')).toContain('no card for PR #999')
  })
})

describe('stage moves', () => {
  // The board says "Needs Review" and so does the stored id now; the retired `inbox` still works.
  it('takes the name the board shows', () => {
    expect(cli('card', 'stage', 'needs-review', '--card', 'owner/repo#42', '--force')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('needs_review')
    expect(out.join('')).toContain('→ Needs Review')
  })

  it('takes the label with its spaces and case', () => {
    expect(cli('card', 'stage', 'In Review', '--card', 'owner/repo#42', '--force')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('reviewing')
  })

  it('still takes the retired inbox id', () => {
    expect(cli('card', 'stage', 'inbox', '--card', 'owner/repo#42', '--force')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('needs_review')
  })

  it('lists the board names when the stage is unknown', () => {
    expect(cli('card', 'stage', 'nope', '--card', 'owner/repo#42')).toBe(EXIT.error)
    expect(err.join('')).toContain('needs-review')
  })

  it('filters a listing by board name too', () => {
    expect(cli('card', 'list', '--stage', 'In Review', '--json')).toBe(EXIT.ok)
    expect(JSON.parse(out.join('')).length).toBe(1)
  })

  it('card reviewed moves the card and says so', () => {
    expect(cli('card', 'reviewed', '--card', 'owner/repo#42')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('reviewed')
    expect(out.join('')).toBe('owner/repo#42: In Review → Reviewed')
  })

  it('is a no-op the second time', () => {
    cli('card', 'reviewed', '--card', 'owner/repo#42')
    out = []
    expect(cli('card', 'reviewed', '--card', 'owner/repo#42')).toBe(EXIT.ok)
    expect(out.join('')).toContain('already Reviewed')
  })

  it('--dry-run writes nothing', () => {
    expect(cli('card', 'done', '--card', 'owner/repo#42', '--dry-run')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('reviewing')
    expect(out.join('')).toContain('would move')
  })

  it('--quiet prints nothing but still acts', () => {
    expect(cli('card', 'reviewed', '--card', 'owner/repo#42', '--quiet')).toBe(EXIT.ok)
    expect(out).toEqual([])
    expect(stageOf('owner/repo#42')).toBe('reviewed')
  })

  it('respects forward-only unless forced', () => {
    cli('card', 'done', '--card', 'owner/repo#42')
    expect(cli('card', 'reviewed', '--card', 'owner/repo#42')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('done')
    expect(cli('card', 'reviewed', '--card', 'owner/repo#42', '--force')).toBe(EXIT.ok)
    expect(stageOf('owner/repo#42')).toBe('reviewed')
  })
})

describe('comments-pushed', () => {
  it('moves to reviewed and clears the unread markers', () => {
    const h = new DatabaseSync(dbPath)
    h.exec("UPDATE tasks SET new_activity = 1, seen = 0 WHERE id = 'owner/repo#42'")
    h.close()

    expect(cli('card', 'comments-pushed', '--card', 'owner/repo#42', '--count', '3', '--json')).toBe(EXIT.ok)
    expect(JSON.parse(out.join(''))).toMatchObject({ stage: 'reviewed', moved: true })

    const after = new DatabaseSync(dbPath)
    const row = after.prepare("SELECT new_activity, seen FROM tasks WHERE id = 'owner/repo#42'").get() as {
      new_activity: number
      seen: number
    }
    after.close()
    expect(row).toEqual({ new_activity: 0, seen: 1 })
    expect(stageOf('owner/repo#42')).toBe('reviewed')
  })

  it('requires --count', () => {
    expect(cli('card', 'comments-pushed', '--card', 'owner/repo#42')).toBe(EXIT.error)
    expect(err.join('')).toContain('--count')
  })
})

describe('doctor', () => {
  it('reports the database and card count', () => {
    expect(cli('doctor')).toBe(EXIT.ok)
    expect(out.join('')).toContain('cards     1')
  })

  it('exits 3 when the app has never run', () => {
    process.env.LOOKOUT_DB = join(tmpdir(), 'definitely-not-here', 'lookout.db')
    expect(cli('doctor')).toBe(EXIT.noDb)
    expect(out.join('')).toContain('not found')
  })
})

describe('the built binary', () => {
  it('runs end to end and returns the documented exit code', () => {
    // the npm script, not vite directly: it also chmods the output, which is what makes the
    // shebang usable — building around it would hide a broken binary
    execFileSync('npm', ['run', 'build:cli'], { stdio: 'ignore', cwd: join(import.meta.dirname, '..', '..') })
    const bin = join(import.meta.dirname, '..', '..', 'dist-cli', 'lookout.mjs')
    // executed directly, so the shebang and the exec bit are both exercised
    const text = execFileSync(bin, ['card', 'show', '--pr', '42'], {
      encoding: 'utf8',
      env: { ...process.env, LOOKOUT_DB: dbPath },
    })
    expect(text).toContain('owner/repo#42')
    expect(text).toContain('stage      In Review')
  }, 60_000)
})
