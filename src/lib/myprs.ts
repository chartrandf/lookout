import type { Config, MyPr, PrOverride } from '../types'
import { getConfig, setGithubUser } from './config'
import { fetchLogin, listMyPrs } from './gh'
import { resolveOverride, toMyPr } from './prboard'
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

  const overrides = await getOverrides().catch(() => ({}) as Record<string, PrOverride>)

  const prs: MyPr[] = []
  for (const { repo, path } of cfg.repos) {
    try {
      const raw = await listMyPrs(repo, me)
      for (const r of raw) {
        const pr = toMyPr(r, repo, path)
        if (!pr) continue
        // apply the manual hand-off; drop it once GitHub has moved past the baseline it was set against
        const { column, stale } = resolveOverride(pr.derivedColumn, overrides[pr.id])
        pr.column = column
        if (stale) await clearOverride(pr.id)
        prs.push(pr)
      }
    } catch (e) {
      console.error(`my-PR sync failed for ${repo}:`, e) // one bad repo shouldn't drop the rest
    }
  }
  return prs
}
