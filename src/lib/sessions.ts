import { homeDir, join } from '@tauri-apps/api/path'
import { exists, readDir, readTextFileLines } from '@tauri-apps/plugin-fs'

export type ReviewSession = {
  sessionId: string
  command: 'do-review' | 'do-followup'
  branch: string
}

// /Users/x/Projects/@foo/bar -> -Users-x-Projects--foo-bar (Claude Code project slug)
const projectSlug = (repoPath: string) => repoPath.replace(/[^a-zA-Z0-9]/g, '-')

const COMMAND_RE = /<command-name>\/?(do-review|do-followup)<\/command-name>(?:\\n|\s)*<command-args>([^<"]*)/

// Cache: session files are append-only; once a file's first turn is parsed the result never changes.
const cache = new Map<string, ReviewSession | null>()

const scanFile = async (filePath: string, sessionId: string): Promise<ReviewSession | null> => {
  if (cache.has(filePath)) return cache.get(filePath) ?? null
  let result: ReviewSession | null = null
  const lines = await readTextFileLines(filePath)
  let count = 0
  for await (const line of lines) {
    const m = line.match(COMMAND_RE)
    if (m) {
      const branch = m[2].trim()
      if (branch) result = { sessionId, command: m[1] as ReviewSession['command'], branch }
      break
    }
    if (++count >= 20) break
  }
  cache.set(filePath, result)
  return result
}

// Map branch -> session ids of /do-review or /do-followup sessions for a repo
export const scanRepoSessions = async (repoPath: string): Promise<Map<string, string[]>> => {
  const byBranch = new Map<string, string[]>()
  const home = await homeDir()
  const dir = await join(home, '.claude', 'projects', projectSlug(repoPath))
  if (!(await exists(dir))) return byBranch
  const entries = await readDir(dir)
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith('.jsonl')) continue
    const sessionId = entry.name.replace(/\.jsonl$/, '')
    try {
      const session = await scanFile(await join(dir, entry.name), sessionId)
      if (session) {
        const ids = byBranch.get(session.branch) ?? []
        ids.push(session.sessionId)
        byBranch.set(session.branch, ids)
      }
    } catch {
      // unreadable session file: skip
    }
  }
  return byBranch
}
