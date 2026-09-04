import { execFileSync } from 'node:child_process'
import type { ReviewTask } from '../types'
import type { Db } from './db'

export type Selector = { card?: string; pr?: number; branch?: string; repo?: string }

export class NoMatchError extends Error {}
export class AmbiguousError extends Error {
  constructor(readonly matches: ReviewTask[]) {
    super(`${matches.length} cards match — narrow it with --repo or --card`)
  }
}

type Git = { remote: () => string | null; branch: () => string | null }

const run = (args: string[]): string | null => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

// `owner/repo` out of any GitHub remote form (ssh, https, with or without .git)
export const repoFromRemote = (url: string): string | null =>
  url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?\/?$/)?.[1] ?? null

export const gitFromCwd = (): Git => ({
  remote: () => run(['remote', 'get-url', 'origin']),
  branch: () => run(['rev-parse', '--abbrev-ref', 'HEAD']),
})

// Which card the command acts on. One rule, so the result is never a mix of what you asked for and
// what we guessed: name any selector and only that is used; name none and both repo and branch come
// from the working copy — which is what lets a skill call `lookout card reviewed` bare.
export const resolveCard = (db: Db, sel: Selector, git: Git = gitFromCwd()): ReviewTask => {
  if (sel.card) {
    const t = db.task(sel.card)
    if (!t) throw new NoMatchError(`no card ${sel.card}`)
    return t
  }

  const explicit = sel.pr !== undefined || sel.branch !== undefined || sel.repo !== undefined
  const remote = git.remote()
  const filter = explicit
    ? { repo: sel.repo, branch: sel.branch, prNumber: sel.pr }
    : {
        repo: (remote ? repoFromRemote(remote) : null) ?? undefined,
        branch: git.branch() ?? undefined,
        prNumber: undefined,
      }

  const matches = db.tasks(filter)
  if (matches.length === 0) {
    const how = filter.prNumber !== undefined ? `PR #${filter.prNumber}` : `branch ${filter.branch ?? '(unknown)'}`
    throw new NoMatchError(`no card for ${how}${filter.repo ? ` in ${filter.repo}` : ''}`)
  }
  if (matches.length > 1) throw new AmbiguousError(matches)
  return matches[0]
}
