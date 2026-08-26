import type { Alert, Config, MyPr, PrOverride } from '../types'
import { MY_PR_ALERT_KINDS, myPrAlerts } from './alerts'
import { getConfig, setGithubUser } from './config'
import { syncAlerts } from './db'
import { fetchLogin, fetchPrExchange, listMyPrs } from './gh'
import { notify } from './notify'
import { resolveOverride, toMyPr } from './prboard'
import { clearOverride, getOverrides, getPrOrders } from './proverrides'

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
  const orders = await getPrOrders().catch(() => ({}) as Record<string, number>)

  const prs: MyPr[] = []
  const listed: string[] = [] // repos that answered; a failed one keeps its alerts untouched
  for (const { repo, path } of cfg.repos) {
    try {
      const raw = await listMyPrs(repo, me)
      listed.push(repo)
      for (const r of raw) {
        const pr = toMyPr(r, repo, path)
        if (!pr) continue
        // apply the manual hand-off; drop it once GitHub has moved past the baseline it was set against
        const { column, stale } = resolveOverride(pr.derivedColumn, overrides[pr.id])
        pr.column = column
        pr.sortOrder = orders[pr.id] ?? null
        if (stale) await clearOverride(pr.id)
        prs.push(pr)
      }
    } catch (e) {
      console.error(`my-PR sync failed for ${repo}:`, e) // one bad repo shouldn't drop the rest
    }
  }
  await refreshMyPrAlerts(prs, listed, me)
  return prs
}

// "A human reviewed my PR and I haven't pushed since" needs review timestamps + commits, which the list
// call doesn't carry — so fetch the exchange, but only for open PRs that actually hold a human review.
// Reconciliation is scoped to the repos we listed successfully, which also clears alerts for PRs that
// merged or dropped out of the list entirely.
const refreshMyPrAlerts = async (prs: MyPr[], repos: string[], me: string) => {
  const derived: Alert[] = []
  for (const pr of prs.filter((p) => p.state === 'open' && p.humanReview !== null)) {
    const x = await fetchPrExchange(pr.repo, pr.number, me).catch((e) => {
      console.error(`my-PR alert check failed for ${pr.id}:`, e)
      return null
    })
    if (x) derived.push(...myPrAlerts(pr, x, me))
  }
  const fresh = await syncAlerts({ kinds: MY_PR_ALERT_KINDS, repos }, derived)
  if (fresh.length > 3) {
    await notify(`${fresh.length} of your PRs got reviewed`, 'Open Lookout to see what changed')
    return
  }
  for (const a of fresh) await notify(a.title, a.body, { alertKey: a.key, taskId: a.taskId })
}
