import { homeDir, join } from '@tauri-apps/api/path'
import { exists, open, readDir } from '@tauri-apps/plugin-fs'
import { listWorktrees } from './worktrees'

export type ReviewSession = {
  sessionId: string
  command: string | null // slash command that opened the session, when it started with one
  branch: string
  ts: string | null
  cwd: string // checkout the session ran in — the clone or one of its worktrees
  path: string // the transcript file, so a review can be read back out of it (capture.ts)
}

// /Users/x/Projects/@foo/bar -> -Users-x-Projects--foo-bar (Claude Code project slug)
const projectSlug = (repoPath: string) => repoPath.replace(/[^a-zA-Z0-9]/g, '-')

const sessionDir = async (checkout: string) => join(await homeDir(), '.claude', 'projects', projectSlug(checkout))

// These two take a branch as their argument — that is where the branch comes from for a clone.
const REVIEW_COMMAND_RE = /<command-name>\/?(do-review|do-followup)<\/command-name>(?:\\n|\s)*<command-args>([^<"]*)/
const ANY_COMMAND_RE = /<command-name>\/?([\w-]+)<\/command-name>/
const TS_RE = /"timestamp":"([^"]+)"/
// Claude Code stamps the branch on every transcript line. It is the only way to place a review
// session whose command carried no branch — `/review <pr_id>`, the shipped default button.
const BRANCH_RE = /"gitBranch":"([^"]*)"/
const REVIEW_COMMANDS = new Set(['do-review', 'do-followup', 'review', 'code-review'])

export const isReviewSession = (s: ReviewSession) => !!s.command && REVIEW_COMMANDS.has(s.command)

// Cache: session files are append-only; once a file's first turn is parsed the result never changes.
const cache = new Map<string, ReviewSession | null>()

const HEAD_LINES = 20 // the opening command lives in the first turn; the rest of a transcript is noise
const CHUNK = 64 * 1024
const HEAD_BYTES = 1024 * 1024 // stop even if a session's first lines are enormous

// Only the head of a session file is ever wanted, but `readTextFileLines` releases its Rust-side
// file handle only when its iterator reaches EOF — abandoning it early (the whole point here) left
// the descriptor open for the life of the webview. A few hundred sessions on disk then exhausted
// the 256-descriptor soft limit macOS gives a launchd-started app, and from that point every `gh`
// subprocess failed to spawn with "Too many open files", which reads on a card as a PR with no
// activity. Read through a handle this closes itself instead.
const readHeadLines = async (filePath: string): Promise<string[]> => {
  const file = await open(filePath, { read: true })
  try {
    const decoder = new TextDecoder()
    const buf = new Uint8Array(CHUNK)
    let text = ''
    let eof = false
    while (text.length < HEAD_BYTES) {
      const n = await file.read(buf)
      if (n === null) {
        eof = true
        break
      }
      text += decoder.decode(buf.subarray(0, n), { stream: true })
      if (text.split('\n').length - 1 >= HEAD_LINES) break
    }
    const lines = text.split('\n')
    if (!eof) lines.pop() // cut short by the read cap, so the last piece isn't a whole line
    return lines.slice(0, HEAD_LINES)
  } finally {
    await file.close()
  }
}

// `worktreeBranch` is set for a worktree checkout: a worktree is dedicated to one branch, so every
// session in it belongs to that branch whatever command opened it. The clone hosts sessions for many
// branches over time, so there the branch can only come from the command's own argument.
const scanFile = async (
  filePath: string,
  sessionId: string,
  cwd: string,
  worktreeBranch: string | null,
): Promise<ReviewSession | null> => {
  if (cache.has(filePath)) return cache.get(filePath) ?? null
  let command: string | null = null
  let commandBranch: string | null = null // the branch the command was given, when it takes one
  let ts: string | null = null
  let gitBranch: string | null = null
  for (const line of await readHeadLines(filePath)) {
    ts ??= line.match(TS_RE)?.[1] ?? null
    gitBranch ||= line.match(BRANCH_RE)?.[1] ?? null
    if (command) continue // the first command is the one that opened the session
    const review = line.match(REVIEW_COMMAND_RE)
    if (review) {
      command = review[1]
      commandBranch = review[2].trim() || null
      continue
    }
    command = line.match(ANY_COMMAND_RE)?.[1] ?? null
  }
  // A review session in a clone that named no branch is placed by the transcript's own gitBranch.
  // Only review sessions: reading every session's gitBranch would pull unrelated coding sessions
  // onto the card, which is not what the feed is for.
  const branch = commandBranch ?? worktreeBranch ?? (command && REVIEW_COMMANDS.has(command) ? gitBranch : null)
  const result = branch ? { sessionId, command, branch, ts, cwd, path: filePath } : null
  cache.set(filePath, result)
  return result
}

const scanCheckout = async (cwd: string, worktreeBranch: string | null): Promise<ReviewSession[]> => {
  const sessions: ReviewSession[] = []
  const dir = await sessionDir(cwd)
  if (!(await exists(dir))) return sessions
  const entries = await readDir(dir)
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith('.jsonl')) continue
    const sessionId = entry.name.replace(/\.jsonl$/, '')
    try {
      const session = await scanFile(await join(dir, entry.name), sessionId, cwd, worktreeBranch)
      if (session) sessions.push(session)
    } catch {
      // unreadable session file: skip
    }
  }
  return sessions
}

// Sessions across every checkout of the repo: work moved into a worktree is still this repo's work.
// Sorted oldest first — callers resume `sessionIds.at(-1)` as "the session I was just in".
const scanRepo = async (repoPath: string): Promise<ReviewSession[]> => {
  const sessions: ReviewSession[] = []
  for (const w of await listWorktrees(repoPath))
    sessions.push(...(await scanCheckout(w.path, w.path === repoPath ? null : w.branch)))
  return sessions.sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))
}

// Map branch -> session ids for a repo
export const scanRepoSessions = async (repoPath: string): Promise<Map<string, string[]>> => {
  const byBranch = new Map<string, string[]>()
  for (const s of await scanRepo(repoPath)) {
    const ids = byBranch.get(s.branch) ?? []
    ids.push(s.sessionId)
    byBranch.set(s.branch, ids)
  }
  return byBranch
}

export const sessionsForBranch = async (repoPath: string, branch: string): Promise<ReviewSession[]> =>
  (await scanRepo(repoPath)).filter((s) => s.branch === branch)

// The sessions a review could be read back out of (capture.ts), across every checkout of the repo.
export const scanRepoReviewSessions = async (repoPath: string): Promise<ReviewSession[]> =>
  (await scanRepo(repoPath)).filter(isReviewSession)

// Which checkout a session can be resumed from: `claude --resume` only sees the sessions of the
// directory it runs in, so resuming a worktree session from the clone would fail to find it.
export const sessionCwd = async (repoPath: string, sessionId: string): Promise<string> => {
  for (const w of await listWorktrees(repoPath)) {
    if (await exists(await join(await sessionDir(w.path), `${sessionId}.jsonl`))) return w.path
  }
  return repoPath
}
