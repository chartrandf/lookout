import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: async () => '/home',
  join: async (...parts: string[]) => parts.join('/'),
}))

const files = new Map<string, string[]>() // session file path -> jsonl lines

// Mirrors the real plugin-fs handle: bytes are served through read()/close(), and `openHandles`
// counts the ones still unclosed so a leaked descriptor fails the suite.
const openHandles = new Set<string>()

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (p: string) => files.has(p) || [...files.keys()].some((f) => f.startsWith(`${p}/`)),
  readDir: async (dir: string) =>
    [...files.keys()]
      .filter((f) => f.startsWith(`${dir}/`))
      .map((f) => ({ name: f.slice(dir.length + 1), isFile: true, isDirectory: false })),
  readTextFile: async (p: string) => {
    const lines = files.get(p)
    if (!lines) throw new Error(`ENOENT ${p}`)
    return lines.map((l) => `${l}\n`).join('')
  },
  open: async (p: string) => {
    const lines = files.get(p)
    if (!lines) throw new Error(`ENOENT ${p}`)
    openHandles.add(p)
    const bytes = new TextEncoder().encode(lines.map((l) => `${l}\n`).join(''))
    let offset = 0
    return {
      read: async (buf: Uint8Array) => {
        if (offset >= bytes.length) return null
        const chunk = bytes.subarray(offset, offset + buf.byteLength)
        buf.set(chunk)
        offset += chunk.byteLength
        return chunk.byteLength
      },
      close: async () => {
        openHandles.delete(p)
      },
    }
  },
}))

const worktrees = vi.hoisted(() => ({ listWorktrees: vi.fn() }))
vi.mock('./worktrees', () => worktrees)

// sessions.ts reads opencode sessions through the CLI; only the opencode test below calls it
const shell = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ Command: { create: shell.create } }))

const REPO = '/Projects/repo'
const PERF = '/Projects/repo-perf'
const dirFor = (checkout: string) => `/home/.claude/projects/${checkout.replace(/[^a-zA-Z0-9]/g, '-')}`

const line = (body: string, ts: string) => `{"timestamp":"${ts}","message":{"content":"${body}"}}`

const load = async () => {
  vi.resetModules()
  return import('./sessions')
}

beforeEach(() => {
  files.clear()
  openHandles.clear()
  shell.create.mockReset()
  worktrees.listWorktrees.mockReset()
  worktrees.listWorktrees.mockResolvedValue([
    { path: REPO, branch: 'main-work' },
    { path: PERF, branch: 'directory-list-call-perf' },
  ])
  files.set(`${dirFor(REPO)}/s1.jsonl`, [
    line('<command-name>/do-review</command-name><command-args>main-work</command-args>', '2026-09-01T10:00:00Z'),
  ])
  files.set(`${dirFor(PERF)}/s2.jsonl`, [
    line('<command-name>/handle-review</command-name><command-args></command-args>', '2026-09-10T08:00:00Z'),
  ])
})

describe('scanRepoSessions', () => {
  it('finds sessions started in a worktree and attributes them to its branch', async () => {
    const { scanRepoSessions } = await load()
    expect(await scanRepoSessions(REPO)).toEqual(
      new Map([
        ['main-work', ['s1']],
        ['directory-list-call-perf', ['s2']],
      ]),
    )
  })

  it('still keys clone sessions by the branch the command was run against, not by clone HEAD', async () => {
    files.delete(`${dirFor(PERF)}/s2.jsonl`)
    files.set(`${dirFor(REPO)}/s3.jsonl`, [
      line(
        '<command-name>/do-followup</command-name><command-args>other-branch</command-args>',
        '2026-09-02T10:00:00Z',
      ),
    ])
    const { scanRepoSessions } = await load()
    const byBranch = await scanRepoSessions(REPO)
    expect(byBranch.get('other-branch')).toEqual(['s3'])
    expect(byBranch.has('main-work')).toBe(true) // s1, from its own command args
  })

  it('ignores a clone session with no branch argument', async () => {
    files.clear()
    files.set(`${dirFor(REPO)}/s9.jsonl`, [
      line('<command-name>/handle-review</command-name><command-args></command-args>', '2026-09-02T10:00:00Z'),
    ])
    const { scanRepoSessions } = await load()
    expect(await scanRepoSessions(REPO)).toEqual(new Map())
  })
})

describe('session order', () => {
  it('orders sessions oldest first so the last id is the most recent', async () => {
    files.clear()
    files.set(`${dirFor(PERF)}/late.jsonl`, [
      line('<command-name>/handle-review</command-name>', '2026-09-10T08:00:00Z'),
    ])
    files.set(`${dirFor(PERF)}/early.jsonl`, [line('<command-name>/rebase</command-name>', '2026-09-02T08:00:00Z')])
    const { scanRepoSessions } = await load()
    expect((await scanRepoSessions(REPO)).get('directory-list-call-perf')).toEqual(['early', 'late'])
  })
})

describe('sessionsForBranch', () => {
  it('returns the worktree session with the checkout it ran in', async () => {
    const { sessionsForBranch } = await load()
    expect(await sessionsForBranch(REPO, 'directory-list-call-perf', 1)).toEqual([
      {
        sessionId: 's2',
        command: 'handle-review',
        branch: 'directory-list-call-perf',
        prNumber: null,
        ts: '2026-09-10T08:00:00Z',
        cwd: PERF,
        path: `${dirFor(PERF)}/s2.jsonl`,
      },
    ])
  })
})

describe('placing a session that named a PR instead of a branch', () => {
  const reviewLine = (args: string) =>
    `{"timestamp":"2026-09-12T08:00:00Z","gitBranch":"whatever-the-clone-is-on","message":{"content":"<command-name>/review</command-name> <command-args>${args}</command-args>"}}`

  it('carries the PR number and no branch', async () => {
    files.set(`${dirFor(REPO)}/rev.jsonl`, [reviewLine('2305')])
    const { scanRepoReviewSessions } = await load()
    const rev = (await scanRepoReviewSessions(REPO)).find((s) => s.sessionId === 'rev')
    expect(rev).toMatchObject({ command: 'review', branch: null, prNumber: 2305 })
  })

  // the clone's branch is not the PR's branch: linking it would attach the session — and the
  // Reviewing stage that follows from it — to whatever card happened to match
  it('never lands in the branch map that drives the stage', async () => {
    files.set(`${dirFor(REPO)}/rev.jsonl`, [reviewLine('2305')])
    const { scanRepoSessions } = await load()
    expect((await scanRepoSessions(REPO)).get('whatever-the-clone-is-on')).toBeUndefined()
  })

  it('still reads a branch argument as a branch', async () => {
    files.set(`${dirFor(REPO)}/rev.jsonl`, [
      `{"timestamp":"2026-09-12T08:00:00Z","message":{"content":"<command-name>/do-review</command-name> <command-args>feature-x</command-args>"}}`,
    ])
    const { scanRepoSessions } = await load()
    expect((await scanRepoSessions(REPO)).get('feature-x')).toEqual(['rev'])
  })
})

describe('a chat started from a card', () => {
  const chatLine = (prompt: string) =>
    JSON.stringify({ timestamp: '2026-09-12T08:00:00Z', type: 'user', message: { role: 'user', content: prompt } })

  // the clone sits on whatever branch it sits on: the chat names its own PR and branch
  it('belongs to the PR and branch its opening line names, even in the clone', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [chatLine('About PR #12 in acme/app (branch feat-x):\n\nstill needed?')])
    const { sessionsForBranch } = await load()
    expect(await sessionsForBranch(REPO, 'feat-x', 12)).toMatchObject([
      { sessionId: 'chat', command: null, prNumber: 12, question: 'still needed?', cwd: REPO },
    ])
  })

  it('stays off another PR that has the same branch name', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [chatLine('About PR #12 in acme/app (branch main):\n\nhi')])
    const { sessionsForBranch } = await load()
    expect(await sessionsForBranch(REPO, 'main', 13)).toEqual([])
  })

  // asking a question is not reviewing: the ids that drive the stage leave chats out
  it('never lands in the branch map that drives the stage', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [chatLine('About PR #12 in acme/app (branch feat-x):\n\nhi')])
    const { scanRepoSessions } = await load()
    expect((await scanRepoSessions(REPO)).get('feat-x')).toBeUndefined()
  })

  it('reads the opening from content blocks too', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [
      JSON.stringify({
        timestamp: '2026-09-12T08:00:00Z',
        message: { content: [{ type: 'text', text: 'About PR #12 in acme/app (branch feat-x):\n\nhi' }] },
      }),
    ])
    const { sessionsForBranch } = await load()
    expect(await sessionsForBranch(REPO, 'feat-x', 12)).toMatchObject([{ sessionId: 'chat', question: 'hi' }])
  })

  it('is never captured as a review', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [chatLine('About PR #12 in acme/app (branch feat-x):\n\nreview it')])
    const { scanRepoReviewSessions } = await load()
    expect((await scanRepoReviewSessions(REPO)).map((s) => s.sessionId)).not.toContain('chat')
  })

  it('isChatSession tells a chat from a command session', async () => {
    files.set(`${dirFor(REPO)}/chat.jsonl`, [chatLine('About PR #12 in acme/app (branch feat-x):\n\nhi')])
    const { isChatSession } = await load()
    expect(await isChatSession(REPO, 'chat')).toBe(true)
    expect(await isChatSession(REPO, 's1')).toBe(false)
    expect(await isChatSession(REPO, 'gone')).toBe(false)
  })
})

describe('sessionLines', () => {
  it('replays a Claude session from its JSONL transcript on disk', async () => {
    files.set(`${dirFor(REPO)}/s1.jsonl`, [
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: '<command-name>/do-review</command-name> <command-args>main-work</command-args>',
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'the review' }] },
      }),
    ])
    const { sessionLines } = await load()
    expect(await sessionLines(REPO, 's1')).toEqual([
      { kind: 'user', text: '/do-review main-work' },
      { kind: 'text', text: 'the review' },
    ])
  })

  it('replays an opencode session through `opencode session export`', async () => {
    const { sessionLines } = await load()
    shell.create.mockImplementation((_: string, args: string[]) => ({
      execute: async () =>
        args[0] === 'session'
          ? {
              code: 0,
              stdout: JSON.stringify({
                messages: [
                  { type: 'user', text: '"hi"' },
                  {
                    type: 'assistant',
                    content: [{ type: 'tool', name: 'read', state: { input: { path: '/r/a.ts' } } }],
                  },
                ],
              }),
              stderr: '',
            }
          : { code: 1, stdout: '', stderr: '' },
    }))
    // the id's `ses_` prefix picks the CLI that wrote it, even with Claude selected in Settings;
    // opencode also finds the session by id alone, so the checkout it ran in is not needed
    expect(await sessionLines('/anywhere', 'ses_1')).toEqual([
      { kind: 'user', text: 'hi' },
      { kind: 'tool', text: 'Read /r/a.ts' },
    ])
    expect(shell.create).toHaveBeenCalledWith('opencode', ['session', 'export', 'ses_1'])
  })

  it('fails loudly when opencode cannot export the session', async () => {
    const { sessionLines } = await load()
    shell.create.mockImplementation((_: string, args: string[]) => ({
      execute: async () =>
        args[0] === 'session'
          ? { code: 1, stdout: '', stderr: 'session not found' }
          : { code: 1, stdout: '', stderr: '' },
    }))
    await expect(sessionLines(REPO, 'ses_gone')).rejects.toThrow('session not found')
  })
})

describe('opencodeSessions', () => {
  const listed = (rows: object) =>
    shell.create.mockImplementation(() => ({
      execute: async () => ({ code: 0, stdout: JSON.stringify(rows), stderr: '' }),
    }))

  it('names and dates the recorded sessions its CLI still knows', async () => {
    listed([
      { id: 'ses_1', created: Date.UTC(2026, 0, 1, 10), title: 'PR #4 review comment status' },
      { id: 'ses_2', created: Date.UTC(2026, 0, 2, 10), title: '  second  ' },
      { id: 'ses_3', created: Date.UTC(2026, 0, 3, 10), title: 'New session - 2026-10-28T00:47:55.373Z' },
      { id: 'not-recorded', created: Date.UTC(2026, 0, 3, 10), title: 'elsewhere' },
    ])
    const { opencodeSessions } = await load()
    // Claude ids are UUIDs: no opencode session among them, so the CLI is not asked about them
    expect(await opencodeSessions(REPO, ['ses_2', '0b7d7c0e-1f2a-4b3c-8d9e-0f1a2b3c4d5e', 'ses_1', 'ses_3'])).toEqual([
      { sessionId: 'ses_1', ts: '2026-01-01T10:00:00.000Z', title: 'PR #4 review comment status' },
      { sessionId: 'ses_2', ts: '2026-01-02T10:00:00.000Z', title: 'second' },
      // a placeholder title names nothing: the history falls back to "an opencode session"
      { sessionId: 'ses_3', ts: '2026-01-03T10:00:00.000Z', title: '' },
    ])
    expect(shell.create).toHaveBeenCalledWith(
      'opencode',
      ['session', 'list', '--format', 'json', '--max-count', '1000'],
      { cwd: REPO },
    )
  })

  it('asks nothing when the card recorded no opencode session', async () => {
    const { opencodeSessions } = await load()
    expect(await opencodeSessions(REPO, ['0b7d7c0e-1f2a-4b3c-8d9e-0f1a2b3c4d5e'])).toEqual([])
    expect(shell.create).not.toHaveBeenCalled()
  })

  it('fails loudly when the CLI cannot list them', async () => {
    shell.create.mockImplementation(() => ({
      execute: async () => ({ code: 1, stdout: '', stderr: 'no server' }),
    }))
    const { opencodeSessions } = await load()
    await expect(opencodeSessions(REPO, ['ses_1'])).rejects.toThrow('no server')
  })
})

describe('sessionCwd', () => {
  it('locates the checkout whose project dir holds the session', async () => {
    const { sessionCwd } = await load()
    expect(await sessionCwd(REPO, 's2')).toBe(PERF)
    expect(await sessionCwd(REPO, 's1')).toBe(REPO)
  })

  it('falls back to the clone for an unknown session', async () => {
    const { sessionCwd } = await load()
    expect(await sessionCwd(REPO, 'gone')).toBe(REPO)
  })
})

describe('file descriptors', () => {
  it('closes every session file it opens, including the ones it stops reading early', async () => {
    // readTextFileLines only released its Rust-side handle at EOF, so breaking out of the scan at
    // the first command marker leaked one descriptor per session file. A few hundred sessions on
    // disk then exhausted the 256-descriptor soft limit macOS gives a launchd-started app and
    // every `gh` subprocess failed to spawn with "Too many open files (os error 24)".
    files.set(`${dirFor(REPO)}/early-exit.jsonl`, [
      line('<command-name>/do-review</command-name><command-args>main-work</command-args>', '2026-09-01T10:00:00Z'),
      ...Array.from({ length: 50 }, (_, i) => line('filler', `2026-09-01T10:00:${String(i).padStart(2, '0')}Z`)),
    ])
    const { scanRepoSessions } = await load()
    await scanRepoSessions(REPO)
    expect([...openHandles]).toEqual([])
  })

  it('still caps the scan at the head of a long session file', async () => {
    files.clear()
    files.set(`${dirFor(REPO)}/long.jsonl`, [
      ...Array.from({ length: 40 }, () => line('no command here', '2026-09-01T10:00:00Z')),
      line('<command-name>/do-review</command-name><command-args>late-branch</command-args>', '2026-09-01T11:00:00Z'),
    ])
    const { scanRepoSessions } = await load()
    expect((await scanRepoSessions(REPO)).has('late-branch')).toBe(false)
    expect([...openHandles]).toEqual([])
  })
})

describe('captureKind', () => {
  const session = (command: string | null) => ({
    sessionId: 's',
    command,
    branch: 'b',
    prNumber: null,
    ts: null,
    cwd: '/clone',
    path: '/p.jsonl',
  })

  it('names what a capture-worthy session produced', async () => {
    const { captureKind } = await load()
    expect(['do-review', 'review', 'code-review'].map((c) => captureKind(session(c)))).toEqual([
      'review',
      'review',
      'review',
    ])
    expect(captureKind(session('do-followup'))).toBe('followup')
  })

  it('leaves everything else out', async () => {
    const { captureKind } = await load()
    expect(captureKind(session('cp'))).toBeNull()
    expect(captureKind(session(null))).toBeNull()
  })
})
