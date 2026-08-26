import type { Alert, AlertKind, MyPr, ReviewTask } from '../types'
import type { GhComment, GhCommit, GhReview, PrExchange } from './gh'
import { isBot } from './prboard'

// A merge (or a base-branch merge/rebase replay) is plumbing, not someone answering a review.
const MERGE_HEADLINE = /^Merge (branch|remote-tracking branch|pull request|commit|tag)\b/i

// filename: AI_TASKS/code-review/YYYY-MM-DD-HH-MM-<branch>.md -> local time ISO
// (branches with "/" nest the file, so match the stamp anywhere after code-review/)
export const reviewFileTs = (path: string): string | null => {
  const m = path.match(/code-review\/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-/) ?? null
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString()
}

const login = (a: { login?: string } | null | undefined) => a?.login ?? ''

const byMe = (c: GhCommit, me: string) => c.authors.some((a) => a.login === me)

// The last thing I said on the PR — a review verdict or a plain conversation comment. '' = never spoke.
export const myLastWordAt = (x: { reviews: GhReview[]; comments: GhComment[] }, me: string): string =>
  [
    ...x.reviews.filter((r) => login(r.author) === me).map((r) => r.submittedAt),
    ...x.comments.filter((c) => login(c.author) === me).map((c) => c.createdAt),
  ]
    .sort()
    .at(-1) ?? ''

// Real work pushed after `ts`. Merge commits are dropped (merging main isn't a fix), and authorship is
// filtered: an answer to my review comes from someone else, an answer to a review on my own PR from me.
// Rebases keep the original authoredDate, so replayed pre-review work stays out of the result.
export const workCommitsAfter = (commits: GhCommit[], ts: string, me: string, mine: boolean): GhCommit[] =>
  commits.filter((c) => c.authoredDate > ts && !MERGE_HEADLINE.test(c.messageHeadline) && byMe(c, me) === mine)

// the newest human review that isn't mine, ignoring bots (sonar & co. are not the feedback I wait for)
export const lastHumanReview = (reviews: GhReview[], me: string): GhReview | null =>
  reviews
    .filter((r) => !isBot(r.author) && login(r.author) !== me)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .at(-1) ?? null

const alert = (kind: AlertKind, taskId: string, eventTs: string | null, title: string, body: string): Alert => ({
  key: eventTs ? `${kind}:${taskId}:${eventTs}` : `${kind}:${taskId}`,
  taskId,
  kind,
  title,
  body,
  read: false,
  archived: false,
  createdAt: new Date().toISOString(),
})

const label = (repo: string, prNumber: number, prTitle: string) => `${repo.split('/')[1]}#${prNumber} — ${prTitle}`

// A finished review session: /review wrote its report, or a button advanced the card past the review step.
const reviewIsDone = (t: ReviewTask) =>
  t.reviewFiles.length > 0 || t.stage === 'reviewed' || t.stage === 'followup' || t.followupSummary !== null

const lastReportTs = (t: ReviewTask): string | null =>
  t.reviewFiles
    .map(reviewFileTs)
    .filter((ts): ts is string => ts !== null)
    .sort()
    .at(-1) ?? null

// Alerts for a PR I'm reviewing: the author answered my review, or my review is done but unsent.
// Those two are exclusive by construction — the first needs me to have spoken, the second needs silence.
export const taskAlerts = (t: ReviewTask, x: PrExchange, me: string): Alert[] => {
  if (t.prState !== 'open' || t.stage === 'done' || t.stage === 'ignored') return []
  const out: Alert[] = []
  const spokeAt = myLastWordAt(x, me)

  if (spokeAt) {
    const work = workCommitsAfter(x.commits, spokeAt, me, false)
    const newest = work
      .map((c) => c.authoredDate)
      .sort()
      .at(-1)
    if (newest)
      out.push(
        alert(
          'addressed',
          t.id,
          newest,
          `${t.prAuthor} addressed your review`,
          `${label(t.repo, t.prNumber, t.prTitle)} — ${work.length} new commit${work.length > 1 ? 's' : ''}`,
        ),
      )
  } else if (reviewIsDone(t)) {
    out.push(
      alert(
        'ready_to_send',
        t.id,
        lastReportTs(t),
        'Review ready to send',
        `${label(t.repo, t.prNumber, t.prTitle)} — session done, nothing sent yet`,
      ),
    )
  }

  // no event ts: one alert per PR while CI stays red, cleared when it goes green
  if (x.ciState === 'fail') out.push(alert('ci_fail', t.id, null, 'CI failed', label(t.repo, t.prNumber, t.prTitle)))
  return out
}

// Alert for a PR I authored: a human reviewed it and I haven't pushed anything since.
export const myPrAlerts = (pr: MyPr, x: PrExchange, me: string): Alert[] => {
  if (pr.state !== 'open') return []
  const review = lastHumanReview(x.reviews, me)
  if (!review) return []
  if (workCommitsAfter(x.commits, review.submittedAt, me, true).length) return [] // I already pushed a fix
  const verdict = review.state.toLowerCase().replace('_', ' ')
  return [
    alert(
      'awaiting_me',
      pr.id,
      review.submittedAt,
      `${login(review.author)} reviewed your PR`,
      `${label(pr.repo, pr.number, pr.title)} — ${verdict}`,
    ),
  ]
}

// What a reconciliation pass is allowed to delete: only the kinds it derives, and only for PRs it
// actually looked at. A repo whose poll failed keeps its alerts instead of being silently emptied;
// `repos` (rather than ids) is what lets a vanished PR — closed, or dropped from the list — be cleaned up.
export type AlertScope = { kinds: AlertKind[]; repos?: string[]; taskIds?: string[] }

export const repoOf = (taskId: string) => taskId.split('#')[0]

export const inScope = (row: { taskId: string; kind: AlertKind }, scope: AlertScope): boolean =>
  scope.kinds.includes(row.kind) &&
  (Boolean(scope.repos?.includes(repoOf(row.taskId))) || Boolean(scope.taskIds?.includes(row.taskId)))

export const TASK_ALERT_KINDS: AlertKind[] = ['addressed', 'ready_to_send', 'ci_fail']
export const MY_PR_ALERT_KINDS: AlertKind[] = ['awaiting_me']
