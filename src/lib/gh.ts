import { Command } from '@tauri-apps/plugin-shell'

const gh = async (args: string[], cwd?: string): Promise<string> => {
  const out = await Command.create('gh', args, cwd ? { cwd } : undefined).execute()
  if (out.code !== 0) throw new Error(`gh ${args.join(' ')} failed: ${out.stderr}`)
  return out.stdout
}

// owner/repo derived from the clone's git origin remote
export const repoFromPath = async (path: string): Promise<string> =>
  (await gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], path)).trim()

export const fetchLogin = async (): Promise<string> => (await gh(['api', 'user', '--jq', '.login'])).trim()

export type GhPr = {
  number: number
  title: string
  url: string
  headRefName: string
  author: { login: string }
  createdAt: string
  reviewRequests: { login?: string }[]
  latestReviews: { author: { login: string }; state: string }[]
}

export const listOpenPrs = async (repo: string): Promise<GhPr[]> =>
  JSON.parse(
    await gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,url,headRefName,author,createdAt,reviewRequests,latestReviews',
    ]),
  )

export const fetchPrState = async (repo: string, prNumber: number): Promise<'open' | 'merged' | 'closed'> => {
  const out = JSON.parse(await gh(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'state']))
  return out.state.toLowerCase() as 'open' | 'merged' | 'closed'
}

// PR numbers with a conversation comment from me (comments are not "reviews" in GitHub's model)
export const listCommentedByMe = async (repo: string, me: string): Promise<Set<number>> => {
  const out = JSON.parse(
    await gh(['search', 'prs', '--repo', repo, '--commenter', me, '--state', 'open', '--json', 'number']),
  ) as { number: number }[]
  return new Set(out.map((pr) => pr.number))
}

export type GhTimelineEvent = {
  ts: string
  kind: 'commit' | 'comment' | 'review' | 'review_requested' | 'merged' | 'closed' | 'reopened' | 'force_pushed'
  actor: string
  text: string
  url?: string
}

// biome-ignore lint/suspicious/noExplicitAny: untyped REST payload
const toTimelineEvent = (e: any): GhTimelineEvent | null => {
  switch (e.event) {
    case 'committed':
      return {
        ts: e.author?.date,
        kind: 'commit',
        actor: e.author?.name ?? '',
        text: (e.message ?? '').split('\n')[0],
        url: e.html_url,
      }
    case 'commented':
      return { ts: e.created_at, kind: 'comment', actor: e.user?.login ?? '', text: 'commented', url: e.html_url }
    case 'reviewed': {
      const state = (e.state ?? '').toLowerCase().replace('_', ' ')
      return { ts: e.submitted_at, kind: 'review', actor: e.user?.login ?? '', text: state, url: e.html_url }
    }
    case 'review_requested':
      return {
        ts: e.created_at,
        kind: 'review_requested',
        actor: e.review_requester?.login ?? '',
        text: `asked ${e.requested_reviewer?.login ?? 'someone'} for review`,
      }
    case 'merged':
      return { ts: e.created_at, kind: 'merged', actor: e.actor?.login ?? '', text: 'merged the PR' }
    case 'closed':
      return { ts: e.created_at, kind: 'closed', actor: e.actor?.login ?? '', text: 'closed the PR' }
    case 'reopened':
      return { ts: e.created_at, kind: 'reopened', actor: e.actor?.login ?? '', text: 'reopened the PR' }
    case 'head_ref_force_pushed':
      return { ts: e.created_at, kind: 'force_pushed', actor: e.actor?.login ?? '', text: 'force-pushed' }
    default:
      return null
  }
}

export const fetchPrTimeline = async (repo: string, prNumber: number): Promise<GhTimelineEvent[]> => {
  const raw = JSON.parse(await gh(['api', `repos/${repo}/issues/${prNumber}/timeline?per_page=100`]))
  // biome-ignore lint/suspicious/noExplicitAny: untyped REST payload
  return (raw as any[]).map(toTimelineEvent).filter((e): e is GhTimelineEvent => e !== null && Boolean(e.ts))
}

export const approvePr = async (repo: string, prNumber: number) => {
  await gh(['pr', 'review', String(prNumber), '--repo', repo, '--approve'])
}

export type PrActivity = { count: number; ciState: 'pass' | 'fail' | 'pending' | null }

// Activity = review comments + reviews + issue comments; CI from status check rollup
export const fetchPrActivity = async (repo: string, prNumber: number): Promise<PrActivity> => {
  const out = JSON.parse(
    await gh(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'comments,reviews,statusCheckRollup']),
  )
  const checks: { conclusion?: string; status?: string; state?: string }[] = out.statusCheckRollup ?? []
  let ciState: PrActivity['ciState'] = null
  if (checks.length) {
    const states = checks.map((c) => (c.conclusion || c.state || c.status || '').toUpperCase())
    if (states.some((s) => s === 'FAILURE' || s === 'ERROR')) ciState = 'fail'
    else if (states.some((s) => s === '' || s === 'PENDING' || s === 'IN_PROGRESS' || s === 'QUEUED'))
      ciState = 'pending'
    else ciState = 'pass'
  }
  return { count: (out.comments?.length ?? 0) + (out.reviews?.length ?? 0), ciState }
}
