import { Command } from '@tauri-apps/plugin-shell'

const gh = async (args: string[]): Promise<string> => {
  const out = await Command.create('gh', args).execute()
  if (out.code !== 0) throw new Error(`gh ${args.join(' ')} failed: ${out.stderr}`)
  return out.stdout
}

export const fetchLogin = async (): Promise<string> => (await gh(['api', 'user', '--jq', '.login'])).trim()

export type GhPr = {
  number: number
  title: string
  url: string
  headRefName: string
  author: { login: string }
  reviewRequests: { login?: string }[]
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
      'number,title,url,headRefName,author,reviewRequests',
    ]),
  )

export const fetchPrState = async (repo: string, prNumber: number): Promise<'open' | 'merged' | 'closed'> => {
  const out = JSON.parse(await gh(['pr', 'view', String(prNumber), '--repo', repo, '--json', 'state']))
  return out.state.toLowerCase() as 'open' | 'merged' | 'closed'
}
