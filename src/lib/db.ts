import Database from '@tauri-apps/plugin-sql'
import type { ReviewTask, Stage } from '../types'

let db: Database | null = null

const getDb = async () => {
  if (!db) db = await Database.load('sqlite:reviewdeck.db')
  return db
}

type Row = {
  id: string
  repo: string
  repo_path: string | null
  branch: string
  pr_number: number
  pr_title: string
  pr_url: string
  pr_state: string
  pr_author: string
  pr_created_at: string | null
  stage: string
  review_requested: number
  session_ids: string
  review_files: string
  followup_summary: string | null
  activity_count: number | null
  ci_state: string | null
  new_activity: number
  done_at: string | null
  updated_at: string
}

const toTask = (r: Row): ReviewTask => ({
  id: r.id,
  repo: r.repo,
  repoPath: r.repo_path,
  branch: r.branch,
  prNumber: r.pr_number,
  prTitle: r.pr_title,
  prUrl: r.pr_url,
  prState: r.pr_state as ReviewTask['prState'],
  prAuthor: r.pr_author,
  prCreatedAt: r.pr_created_at,
  stage: r.stage as Stage,
  reviewRequested: r.review_requested === 1,
  sessionIds: JSON.parse(r.session_ids),
  reviewFiles: JSON.parse(r.review_files),
  followupSummary: r.followup_summary ? JSON.parse(r.followup_summary) : null,
  activityCount: r.activity_count,
  ciState: r.ci_state as ReviewTask['ciState'],
  hasNewActivity: r.new_activity === 1,
  doneAt: r.done_at,
  updatedAt: r.updated_at,
})

export const allTasks = async (): Promise<ReviewTask[]> => {
  const d = await getDb()
  const rows = await d.select<Row[]>('SELECT * FROM tasks ORDER BY updated_at DESC')
  return rows.map(toTask)
}

export const upsertPr = async (t: {
  id: string
  repo: string
  repoPath: string
  branch: string
  prNumber: number
  prTitle: string
  prUrl: string
  prAuthor: string
  prCreatedAt: string
  reviewRequested: boolean
}) => {
  const d = await getDb()
  await d.execute(
    `INSERT INTO tasks (id, repo, repo_path, branch, pr_number, pr_title, pr_url, pr_author, pr_created_at, review_requested, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       pr_title = $6, pr_url = $7, pr_created_at = $9, review_requested = $10, repo_path = $3, updated_at = $11`,
    [
      t.id,
      t.repo,
      t.repoPath,
      t.branch,
      t.prNumber,
      t.prTitle,
      t.prUrl,
      t.prAuthor,
      t.prCreatedAt,
      t.reviewRequested ? 1 : 0,
      new Date().toISOString(),
    ],
  )
}

export const setStage = async (id: string, stage: Stage) => {
  const d = await getDb()
  await d.execute('UPDATE tasks SET stage = $1, done_at = $2, updated_at = $3 WHERE id = $4', [
    stage,
    stage === 'done' ? new Date().toISOString() : null,
    new Date().toISOString(),
    id,
  ])
}

export const setPrState = async (id: string, prState: string) => {
  const d = await getDb()
  await d.execute('UPDATE tasks SET pr_state = $1, updated_at = $2 WHERE id = $3', [
    prState,
    new Date().toISOString(),
    id,
  ])
}

export const setActivity = async (id: string, count: number, ciState: string | null, isNew: boolean) => {
  const d = await getDb()
  await d.execute(
    'UPDATE tasks SET activity_count = $1, ci_state = $2, new_activity = MAX(new_activity, $3) WHERE id = $4',
    [count, ciState, isNew ? 1 : 0, id],
  )
}

export const clearNewActivity = async (id: string) => {
  const d = await getDb()
  await d.execute('UPDATE tasks SET new_activity = 0 WHERE id = $1', [id])
}

export const addSessionId = async (id: string, sessionId: string) => {
  const d = await getDb()
  const rows = await d.select<Row[]>('SELECT * FROM tasks WHERE id = $1', [id])
  if (!rows.length) return
  const ids: string[] = JSON.parse(rows[0].session_ids)
  if (ids.includes(sessionId)) return
  ids.push(sessionId)
  await d.execute('UPDATE tasks SET session_ids = $1, updated_at = $2 WHERE id = $3', [
    JSON.stringify(ids),
    new Date().toISOString(),
    id,
  ])
}

export const setFollowupSummary = async (
  id: string,
  summary: { addressed: number; partial: number; pending: number },
) => {
  const d = await getDb()
  await d.execute('UPDATE tasks SET followup_summary = $1, updated_at = $2 WHERE id = $3', [
    JSON.stringify(summary),
    new Date().toISOString(),
    id,
  ])
}

export const setLinks = async (id: string, sessionIds: string[], reviewFiles: string[]) => {
  const d = await getDb()
  await d.execute('UPDATE tasks SET session_ids = $1, review_files = $2 WHERE id = $3', [
    JSON.stringify(sessionIds),
    JSON.stringify(reviewFiles),
    id,
  ])
}
