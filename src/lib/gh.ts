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
