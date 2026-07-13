import type { ReviewTask } from '../types'
import { getConfig, setGithubUser } from './config'
import { allTasks, setActivity, setLinks, setPrState, setSnoozed, setStage, upsertPr } from './db'
import { fetchLogin, fetchPrActivity, fetchPrState, listOpenPrs } from './gh'
import { notify } from './notify'
import { scanReviewFiles } from './reviews'
import { scanRepoSessions } from './sessions'

// Stages whose PRs we actively watch for new comments / CI
const ACTIVE_STAGES = new Set(['watching', 'inbox', 'reviewing', 'reviewed', 'followup'])

// One full sync pass: poll gh, upsert PRs, link sessions/review files, advance stages, auto-clear merged.
export const syncAll = async (): Promise<ReviewTask[]> => {
  const config = await getConfig()
  let me = config.githubUser
  if (!me) {
    me = await fetchLogin()
    await setGithubUser(me)
  }

  const known = new Map((await allTasks()).map((t) => [t.id, t]))
  const firstSync = known.size === 0 // fresh DB: don't blast a notification per existing PR
  const openIds = new Set<string>()
  const polledRepos = new Set<string>()
  for (const { repo, path } of config.repos) {
    let prs: Awaited<ReturnType<typeof listOpenPrs>>
    let sessionsByBranch: Awaited<ReturnType<typeof scanRepoSessions>>
    let reviewsByBranch: Awaited<ReturnType<typeof scanReviewFiles>>
    try {
      ;[prs, sessionsByBranch, reviewsByBranch] = await Promise.all([
        listOpenPrs(repo),
        scanRepoSessions(path),
        scanReviewFiles(path),
      ])
    } catch (e) {
      console.error(`sync failed for ${repo}:`, e)
      continue // don't let one repo break the pass (or falsely auto-clear its tasks)
    }
    polledRepos.add(repo)
    for (const pr of prs) {
      if (pr.author.login === me) continue // never track my own PRs
      const id = `${repo}#${pr.number}`
      openIds.add(id)
      await upsertPr({
        id,
        repo,
        repoPath: path,
        branch: pr.headRefName,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        prAuthor: pr.author.login,
        prCreatedAt: pr.createdAt,
        reviewRequested: pr.reviewRequests.some((r) => r.login === me),
      })
      const sessionIds = sessionsByBranch.get(pr.headRefName) ?? []
      const reviewFiles = reviewsByBranch.get(pr.headRefName) ?? []
      if (sessionIds.length || reviewFiles.length) await setLinks(id, sessionIds, reviewFiles)

      // already reviewed on GitHub -> skip Discovery, board it in the right column
      const myReview = pr.latestReviews.find((r) => r.author.login === me)
      if (myReview && (known.get(id)?.stage ?? 'discovered') === 'discovered')
        await setStage(id, myReview.state === 'CHANGES_REQUESTED' ? 'followup' : 'reviewed')

      if (!known.has(id) && !firstSync && !myReview) {
        const requested = pr.reviewRequests.some((r) => r.login === me)
        await notify(
          requested ? 'Review requested' : 'New PR',
          `${repo}#${pr.number} — ${pr.title} (${pr.author.login})`,
        )
      }
    }
  }

  // Advance stages + auto-clear
  const tasks = await allTasks()
  for (const t of tasks) {
    if (t.stage === 'done') continue
    if (polledRepos.has(t.repo) && !openIds.has(t.id) && t.prState === 'open') {
      // tracked PR no longer open: distinguish merged vs closed
      const state = await fetchPrState(t.repo, t.prNumber)
      if (state !== 'open') {
        await setPrState(t.id, state)
        await setStage(t.id, 'done')
        continue
      }
    }
    // auto-advance triaged tasks when review artifacts appear
    const active = t.stage === 'watching' || t.stage === 'inbox' || t.stage === 'reviewing'
    if (active && t.reviewFiles.length > 0) await setStage(t.id, 'reviewed')
    else if ((t.stage === 'watching' || t.stage === 'inbox') && t.sessionIds.length > 0)
      await setStage(t.id, 'reviewing')

    // watch boarded PRs for new comments / CI failures
    if (ACTIVE_STAGES.has(t.stage) && polledRepos.has(t.repo) && openIds.has(t.id)) {
      try {
        const { count, ciState } = await fetchPrActivity(t.repo, t.prNumber)
        const baseline = t.activityCount === null // first fetch: set silently
        const isNew = !baseline && count > (t.activityCount ?? 0)
        await setActivity(t.id, count, ciState, isNew)
        if (isNew) await notify('New PR activity', `${t.repo}#${t.prNumber} — ${t.prTitle}`)
        if (ciState === 'fail' && t.ciState !== 'fail' && !baseline) {
          await notify('CI failed', `${t.repo}#${t.prNumber} — ${t.prTitle}`)
          if (t.snoozed) await setSnoozed(t.id, false) // CI failure also wakes a hidden card
        }
      } catch (e) {
        console.error(`activity poll failed for ${t.id}:`, e)
      }
    }
  }

  return allTasks()
}
