import type { Config, MyPr } from '../types'
import { getConfig, setGithubUser } from './config'
import { fetchLogin, listMyPrs } from './gh'
import { applyOverride, toMyPr } from './prboard'
import { clearOverride, getOverrides } from './proverrides'

// One pass: list PRs I authored across watched repos and classify each into a board column.
// No DB — columns are derived live so they always reflect current GitHub state.
export const syncMyPrs = async (config?: Config): Promise<MyPr[]> => {
  const cfg = config ?? (await getConfig())
  let me = cfg.githubUser
  if (!me) {
    me = await fetchLogin()
    await setGithubUser(me)
  }

  const overrides = await getOverrides().catch(() => ({}) as Record<string, MyPr['column']>)

  const prs: MyPr[] = []
  for (const { repo, path } of cfg.repos) {
    try {
      const raw = await listMyPrs(repo, me)
      for (const r of raw) {
        const pr = toMyPr(r, repo, path)
        if (!pr) continue
        // a merged PR forces Done and drops its stale hand-off; otherwise the manual placement sticks
        if (pr.column === 'done') await clearOverride(pr.id)
        else pr.column = applyOverride(pr.column, overrides[pr.id])
        prs.push(pr)
      }
    } catch (e) {
      console.error(`my-PR sync failed for ${repo}:`, e) // one bad repo shouldn't drop the rest
    }
  }
  return prs
}
