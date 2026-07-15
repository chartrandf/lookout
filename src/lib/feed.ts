import type { ReviewTask } from '../types'
import { fetchPrTimeline } from './gh'
import { sessionsForBranch } from './sessions'

export type FeedEvent = {
  ts: string
  icon: string
  actor: string
  text: string
  mine: boolean // my action -> right side of the chat, others -> left
  url?: string // opens in the PR window
  filePath?: string // opens the local review report
  sessionId?: string // resumes the claude session
}

const REVIEW_ICONS: Record<string, string> = {
  approved: '✅',
  'changes requested': '🔴',
  commented: '📝',
}

const KIND_ICONS = {
  commit: '📦',
  comment: '💬',
  review_requested: '👀',
  merged: '🟣',
  closed: '❌',
  reopened: '♻️',
  force_pushed: '⚠️',
}

// filename: YYYY-MM-DD-HH-MM-<branch>.md -> local time ISO
// (branches with "/" nest the file, so match the stamp anywhere after code-review/)
const reviewFileTs = (path: string): string | null => {
  const m = path.match(/code-review\/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-/) ?? null
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString()
}

// Merge consecutive commits by the same actor into one "pushed N commits" event
const groupCommits = (events: FeedEvent[]): FeedEvent[] => {
  const out: FeedEvent[] = []
  for (const e of events) {
    const prev = out.at(-1)
    if (e.icon === KIND_ICONS.commit && prev?.icon === KIND_ICONS.commit && prev.actor === e.actor) {
      const count = (prev.text.match(/^pushed (\d+) commits/)?.[1] ?? '1') as string
      prev.text = `pushed ${Number(count) + 1} commits — ${e.text.replace(/^pushed \d+ commits — /, '')}`
      prev.ts = e.ts
      continue
    }
    out.push({ ...e })
  }
  return out
}

export const buildFeed = async (task: ReviewTask, me: string, myName = ''): Promise<FeedEvent[]> => {
  const events: FeedEvent[] = []
  // timeline actors are logins for most events but git author *names* for commits, so match either
  const isMine = (actor: string) => actor === me || (!!myName && actor === myName)

  if (task.prCreatedAt)
    events.push({
      ts: task.prCreatedAt,
      icon: '🌱',
      actor: task.prAuthor,
      text: 'opened the pull request',
      mine: isMine(task.prAuthor),
    })

  if (task.repoPath) {
    const sessions = await sessionsForBranch(task.repoPath, task.branch).catch(() => [])
    for (const s of sessions)
      if (s.ts)
        events.push({
          ts: s.ts,
          icon: '🤖',
          actor: 'you',
          text: `started /${s.command} session`,
          mine: true,
          sessionId: s.sessionId,
        })
  }

  for (const f of task.reviewFiles) {
    const ts = reviewFileTs(f)
    if (ts) events.push({ ts, icon: '📄', actor: 'claude', text: 'review report created', filePath: f, mine: true })
  }

  const gh = await fetchPrTimeline(task.repo, task.prNumber).catch(() => [])
  for (const e of gh) {
    const mine = isMine(e.actor)
    if (e.kind === 'review')
      events.push({
        ts: e.ts,
        icon: REVIEW_ICONS[e.text] ?? '📝',
        actor: e.actor,
        text: `review: ${e.text}`,
        url: e.url,
        mine,
      })
    else events.push({ ts: e.ts, icon: KIND_ICONS[e.kind], actor: e.actor, text: e.text, url: e.url, mine })
  }

  const asc = events.sort((a, b) => a.ts.localeCompare(b.ts))
  return groupCommits(asc) // chronological: newest last, next to the reply input
}
