import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GlobalSearch } from './components/GlobalSearch'
import { NotificationBell } from './components/NotificationBell'
import { SessionPanel } from './components/SessionPanel'
import { visibleButtons } from './lib/buttons'
import { ACTION_TOOLS } from './lib/claude'
import {
  DEFAULT_PR_BUTTONS,
  DEFAULT_REVIEW_BUTTONS,
  getConfig,
  setPrButtons,
  setRepos,
  setReviewButtons,
} from './lib/config'
import {
  addNotification,
  addSessionId,
  allNotifications,
  allTasks,
  archiveReadNotifications,
  clearNewActivity,
  markAllNotificationsRead,
  markNotificationRead,
  setFollowupSummary,
  setLinks,
  setOrders,
  setSeen,
  setSnoozed,
  setStage,
} from './lib/db'
import { syncMyPrs } from './lib/myprs'
import { notify, onNotificationClick } from './lib/notify'
import { fillPrompt } from './lib/prompt'
import { setOverride } from './lib/proverrides'
import { scanReviewFiles } from './lib/reviews'
import { cancelRun, closeRun, getRun, getRuns, killRun, replyRun, resumeRun, startRun, subscribeRuns } from './lib/runs'
import { syncAll } from './lib/sync'
import { initTray, setTrayCount, showMainWindow } from './lib/tray'
import type {
  ActionButton,
  AppNotification,
  ButtonBoard,
  Config,
  MyPr,
  PrColumn,
  ReviewTask,
  Stage,
  WatchedRepo,
} from './types'
import { Board } from './views/Board'
import { Discovery } from './views/Discovery'
import { PullRequests } from './views/PullRequests'
import { Settings } from './views/Settings'

const POLL_MS = 10 * 60 * 1000
// on tab change we do a lightweight sync of just that tab's data, but not more often than this
const MIN_PARTIAL_MS = 60 * 1000

type View = 'pulls' | 'discovery' | 'board' | 'settings'

// Single source of truth for tab order: shortcuts (⌘1..⌘n) derive from the index
const TAB_ORDER: { view: View; label: string }[] = [
  { view: 'pulls', label: 'Pull Requests' },
  { view: 'board', label: 'Reviews' },
  { view: 'discovery', label: 'Discovery' },
  { view: 'settings', label: 'Settings' },
]

const parseFollowupSummary = (text: string) => {
  const m = text.match(/(\d+)\s*addressed\D*?(\d+)\s*partial\D*?(\d+)\s*pending/i)
  return m ? { addressed: Number(m[1]), partial: Number(m[2]), pending: Number(m[3]) } : null
}

// a PR carries "new events" once something happened to it (a review, CI, or it left Waiting), but never
// once it's Done — merged PRs need no action. The signature changes whenever that state moves, so a click
// that records it clears "new" until the next change.
const pullHasEvent = (p: MyPr) =>
  p.column !== 'done' && (p.column !== 'waiting' || p.humanReview !== null || p.botReview !== null)
const pullSig = (p: MyPr) => `${p.column}|${p.humanReview}|${p.botReview}|${p.ciState}`

const App = () => {
  const [view, setView] = useState<View>('board')
  const [config, setConfig] = useState<Config>({
    githubUser: '',
    githubName: '',
    repos: [],
    reviewButtons: DEFAULT_REVIEW_BUTTONS,
    prButtons: DEFAULT_PR_BUTTONS,
  })
  const [tasks, setTasks] = useState<ReviewTask[]>([])
  const [myPrs, setMyPrs] = useState<MyPr[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  // acknowledged PR state signatures (id -> sig); a card is "new" until its current sig is recorded by a click
  const [seenPullSig, setSeenPullSig] = useState<Record<string, string>>({})

  const runs = useSyncExternalStore(subscribeRuns, getRuns)
  // last successful sync per data source, to throttle the on-tab-change partial syncs
  const tasksSyncedAt = useRef(0)
  const pullsSyncedAt = useRef(0)
  const busy = useRef(false)

  const reload = useCallback(async () => setTasks(await allTasks()), [])

  const reloadNotifications = useCallback(async () => setNotifications(await allNotifications()), [])

  // serialize syncs (never overlap) and surface the shared syncing/error/lastSync UI state
  const runSync = useCallback(async (fn: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    setSyncing(true)
    setError(null)
    try {
      await fn()
      setLastSync(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      busy.current = false
      setSyncing(false)
    }
  }, [])

  // partial: Reviews + Discovery share the tasks dataset (syncAll)
  const syncTasks = useCallback(
    () =>
      runSync(async () => {
        setTasks(await syncAll())
        tasksSyncedAt.current = Date.now()
      }),
    [runSync],
  )

  // partial: the Pull Requests board
  const syncPulls = useCallback(
    () =>
      runSync(async () => {
        setMyPrs(await syncMyPrs())
        pullsSyncedAt.current = Date.now()
      }),
    [runSync],
  )

  // full sync: mount, the 10-min poll, the manual button, and after editing repos
  const refresh = useCallback(
    () =>
      runSync(async () => {
        setTasks(await syncAll())
        const cfg = await getConfig()
        setConfig(cfg)
        setMyPrs(await syncMyPrs(cfg))
        const now = Date.now()
        tasksSyncedAt.current = now
        pullsSyncedAt.current = now
      }),
    [runSync],
  )

  // change tab + kick a throttled partial sync of that tab's data (manual button stays the full sync)
  const switchView = useCallback(
    (v: View) => {
      setView(v)
      const now = Date.now()
      if ((v === 'board' || v === 'discovery') && now - tasksSyncedAt.current >= MIN_PARTIAL_MS) syncTasks()
      else if (v === 'pulls' && now - pullsSyncedAt.current >= MIN_PARTIAL_MS) syncPulls()
    },
    [syncTasks, syncPulls],
  )

  useEffect(() => {
    initTray()
    getConfig().then(setConfig)
    reload()
    reloadNotifications()
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [refresh, reload, reloadNotifications])

  // OS notification click: mark read + open the card panel (plugin only delivers clicks on mobile today)
  useEffect(() => {
    const listener = onNotificationClick(async ({ notificationId, taskId }) => {
      if (notificationId) await markNotificationRead(notificationId)
      await reloadNotifications()
      await showMainWindow()
      if (taskId) {
        setView('board')
        setPanelTaskId(taskId)
      }
    }).catch(() => null)
    return () => {
      listener.then((l) => l?.unregister())
    }
  }, [reloadNotifications])

  // ⌘1..⌘n switch tabs, indexes follow TAB_ORDER
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = Number(e.key) - 1
      if (e.metaKey && !e.shiftKey && !e.altKey && TAB_ORDER[idx]) {
        e.preventDefault()
        switchView(TAB_ORDER[idx].view)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [switchView])

  const moveStage = async (id: string, stage: Stage) => {
    await setStage(id, stage)
    if (stage === 'done') closeRun(id) // done = my part is over, no reply expected
    await reload()
  }

  const markSeen = async (id: string, seen: boolean) => {
    await setSeen(id, seen)
    await reload()
  }

  const saveRepos = async (repos: WatchedRepo[]) => {
    await setRepos(repos)
    setConfig(await getConfig())
    refresh()
  }

  // link the report a just-finished /do-review wrote, without waiting for the next full sync
  const linkReviewReport = async (taskId: string) => {
    const t = (await allTasks()).find((x) => x.id === taskId)
    if (!t?.repoPath) return
    const byBranch = await scanReviewFiles(t.repoPath).catch(() => new Map<string, string[]>())
    // /do-review flattens "/" in branch names when building the report filename
    const files = byBranch.get(t.branch) ?? byBranch.get(t.branch.replace(/\//g, '-')) ?? []
    if (files.length) await setLinks(t.id, t.sessionIds, files)
  }

  const notifySessionDone = async (taskId: string, label: string) => {
    const t = (await allTasks()).find((x) => x.id === taskId)
    if (!t) return
    const title = `${label} done (${t.repo})`
    const body = `${t.prTitle} by ${t.prAuthor}`
    const id = await addNotification(t.id, title, body)
    notify(title, body, { notificationId: id, taskId: t.id })
    await reloadNotifications()
  }

  // Post-run behavior is routed by board, not by a fixed command name.
  const runCallbacks = (board: ButtonBoard, button?: ActionButton) => {
    // PR board runs act on my own PRs (not tracked in the tasks DB): just re-derive the board on result
    if (board === 'pr')
      return {
        onResult: async () => {
          setMyPrs(await syncMyPrs())
        },
      }
    return {
      onSession: async (taskId: string, sessionId: string) => {
        await addSessionId(taskId, sessionId)
        await reload()
      },
      onResult: async (taskId: string, result: string) => {
        // any button whose prompt emits a "SUMMARY: … addressed … partial … pending" line updates the badge
        const summary = parseFollowupSummary(result)
        if (summary) await setFollowupSummary(taskId, summary)
        await linkReviewReport(taskId)
        if (button?.advanceTo) await setStage(taskId, button.advanceTo)
        await notifySessionDone(taskId, button?.label ?? 'Run')
        await reload()
      },
    }
  }

  // Start a configurable button's prompt as a claude run for the given task/board.
  const runButton = async (t: ReviewTask, board: ButtonBoard, button: ActionButton) => {
    if (!t.repoPath) return
    setPanelTaskId(t.id)
    const prompt = fillPrompt(button.prompt, t.branch, t.prNumber)
    await startRun(t.id, button.label, board, prompt, t.repoPath, runCallbacks(board, button), ACTION_TOOLS)
  }

  // Discovery / search "review" shortcut: add the PR to the board, then run the first review button.
  const startReview = async (id: string) => {
    const t = tasks.find((x) => x.id === id)
    const button = config.reviewButtons[0]
    if (!t || !button) return
    await setStage(t.id, 'reviewing')
    await reload()
    await runButton({ ...t, stage: 'reviewing' }, 'review', button)
  }

  // adapt a MyPr into the ReviewTask shape SessionPanel consumes (my PRs aren't in the tasks DB)
  const myPrToTask = (pr: MyPr): ReviewTask => ({
    id: pr.id,
    repo: pr.repo,
    repoPath: pr.repoPath,
    branch: pr.branch,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    prState: pr.state,
    prAuthor: config.githubUser,
    prCreatedAt: pr.createdAt,
    stage: 'reviewing',
    column: pr.column, // drives PR-board button conditions
    reviewRequested: false,
    sessionIds: [],
    reviewFiles: [],
    followupSummary: null,
    activityCount: null,
    ciState: pr.ciState,
    hasNewActivity: false,
    snoozed: false,
    seen: true,
    sortOrder: null,
    doneAt: null,
    updatedAt: pr.createdAt,
  })

  // PR card shortcut: open the panel; run the first PR button only if nothing is already live for this PR
  const onHandleReview = (pr: MyPr) => {
    setPanelTaskId(pr.id)
    const button = config.prButtons[0]
    if (button && !getRun(pr.id)) runButton(myPrToTask(pr), 'pr', button)
  }

  // manual hand-off: pin the card to a column (optimistic) and persist the override against the
  // GitHub-derived column, so it self-heals once real review state moves past that baseline
  const moveMyPr = async (id: string, column: PrColumn) => {
    const pr = myPrs.find((p) => p.id === id)
    setMyPrs((prev) => prev.map((p) => (p.id === id ? { ...p, column } : p)))
    await setOverride(id, column, pr?.derivedColumn ?? column)
  }

  const openCard = (t: ReviewTask) => {
    setView('board')
    setPanelTaskId(t.id)
  }

  const openNotification = async (n: AppNotification) => {
    await markNotificationRead(n.id)
    await reloadNotifications()
    const t = tasks.find((x) => x.id === n.taskId)
    if (t) openCard(t)
  }

  const panelReviewTask = panelTaskId ? (tasks.find((t) => t.id === panelTaskId) ?? null) : null
  const panelPr = panelTaskId ? (myPrs.find((p) => p.id === panelTaskId) ?? null) : null
  const panelIsPr = !panelReviewTask && !!panelPr
  const panelTask = panelReviewTask ?? (panelPr ? myPrToTask(panelPr) : null)

  const discoveredCount = tasks.filter((t) => t.stage === 'discovered' && t.prState === 'open' && !t.seen).length
  // board badge = sessions done and waiting on my feedback (not in-progress runs)
  const awaitingCount = runs.filter((r) => r.status === 'awaiting-input').length
  const attentionCount =
    discoveredCount +
    runs.filter((r) => r.status === 'awaiting-input').length +
    tasks.filter((t) => t.hasNewActivity).length

  useEffect(() => {
    setTrayCount(attentionCount)
  }, [attentionCount])

  const badges: Partial<Record<View, number>> = {
    board: awaitingCount,
    discovery: discoveredCount,
  }
  // PR cards with new events (not yet clicked); tab shows a small dot while any remain
  const newPullIds = new Set(myPrs.filter((p) => pullHasEvent(p) && seenPullSig[p.id] !== pullSig(p)).map((p) => p.id))
  const pullsDot = newPullIds.size > 0

  const tab = ({ view: v, label }: (typeof TAB_ORDER)[number], index: number) => {
    const badge = badges[v]
    return (
      <button
        key={v}
        type="button"
        onClick={() => switchView(v)}
        className={`group cursor-pointer rounded-md px-3 py-1.5 text-sm ${view === v ? 'bg-deck-700 text-white' : 'text-deck-400 hover:text-deck-200'}`}
      >
        {label}
        {v === 'pulls' ? (
          pullsDot ? (
            <span
              className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
              title="New in-review pull requests"
            />
          ) : null
        ) : badge ? (
          <span
            className={`ml-1.5 rounded-full px-1.5 text-xs ${v === 'discovery' ? 'bg-deck-700 text-deck-300' : 'bg-amber-500 text-black'}`}
          >
            {badge}
          </span>
        ) : null}
        <span className={`ml-1.5 text-xs ${view === v ? 'text-deck-400' : 'text-deck-600 group-hover:text-deck-500'}`}>
          ⌘{index + 1}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-deck-900 text-deck-100">
      <header className="flex shrink-0 items-center gap-2 border-b border-deck-800 bg-deck-900 px-4 py-2.5">
        <h1 className="font-script mr-3 text-xl text-white">Lookout</h1>
        {TAB_ORDER.filter((t) => t.view !== 'settings').map((t) => tab(t, TAB_ORDER.indexOf(t)))}
        <div className="flex min-w-0 flex-1 justify-center px-4">
          <GlobalSearch
            tasks={tasks}
            onOpen={openCard}
            onReview={startReview}
            onWatch={(id) => moveStage(id, 'watching')}
            onIgnore={(id) => moveStage(id, 'ignored')}
            onUnignore={(id) => moveStage(id, 'discovered')}
          />
        </div>
        {TAB_ORDER.filter((t) => t.view === 'settings').map((t) => tab(t, TAB_ORDER.indexOf(t)))}
        <NotificationBell
          notifications={notifications}
          onOpen={openNotification}
          onMarkAllRead={async () => {
            await markAllNotificationsRead()
            await reloadNotifications()
          }}
          onArchiveRead={async () => {
            await archiveReadNotifications()
            await reloadNotifications()
          }}
        />
      </header>

      {/* status bar: above the board, but under the card side panel (z-20) */}
      <div className="fixed bottom-2 right-2 z-10 flex items-center gap-2 rounded-md border border-deck-700 bg-deck-900/95 px-2 py-1 text-xs text-deck-500 shadow-lg">
        {lastSync && <span>synced {lastSync.toLocaleTimeString()}</span>}
        <button
          type="button"
          onClick={refresh}
          disabled={syncing}
          className="cursor-pointer rounded bg-deck-800 px-2 py-0.5 text-deck-300 hover:bg-deck-700 disabled:opacity-50"
        >
          {syncing ? 'syncing…' : 'sync now'}
        </button>
      </div>

      {error && <div className="mx-4 mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}

      {/* board: columns scroll individually and stop 50px above the bottom (sync pill stays clear) */}
      <main
        className={`flex-1 p-4 ${view === 'board' || view === 'pulls' ? 'overflow-hidden pb-[50px]' : 'overflow-y-auto'}`}
      >
        {view === 'pulls' && (
          <PullRequests
            prs={myPrs}
            me={config.githubUser}
            newIds={newPullIds}
            onOpen={(pr) => {
              setPanelTaskId(pr.id)
              setSeenPullSig((prev) => ({ ...prev, [pr.id]: pullSig(pr) })) // clicking clears this card's "new"
            }}
            onHandleReview={onHandleReview}
            onMove={moveMyPr}
          />
        )}
        {view === 'discovery' && (
          <Discovery
            tasks={tasks}
            onReview={startReview}
            onWatch={(id) => moveStage(id, 'watching')}
            onIgnore={(id) => moveStage(id, 'ignored')}
            onUnignore={(id) => moveStage(id, 'discovered')}
            showIgnored={showIgnored}
            onToggleIgnored={() => setShowIgnored((s) => !s)}
            onSetSeen={markSeen}
          />
        )}
        {view === 'board' && (
          <Board
            tasks={tasks}
            runs={runs}
            onReorder={async (t, stage, orderedIds) => {
              if (t.stage !== stage) await setStage(t.id, stage)
              await setOrders(orderedIds)
              await reload()
            }}
            onOpenSession={async (t) => {
              setPanelTaskId(t.id)
              if (t.hasNewActivity) {
                await clearNewActivity(t.id) // clicking a card clears its "new" (same as the 💬 new button)
                await reload()
              }
            }}
            onSeen={async (t) => {
              await clearNewActivity(t.id)
              await reload()
            }}
          />
        )}
        {view === 'settings' && (
          <Settings
            config={config}
            tasks={tasks}
            onSave={saveRepos}
            onSaveReviewButtons={async (buttons) => {
              await setReviewButtons(buttons)
              setConfig(await getConfig())
            }}
            onSavePrButtons={async (buttons) => {
              await setPrButtons(buttons)
              setConfig(await getConfig())
            }}
          />
        )}
      </main>

      {panelTask && (
        <SessionPanel
          task={panelTask}
          run={getRun(panelTask.id)}
          me={config.githubUser}
          myName={config.githubName}
          variant={panelIsPr ? 'pr' : 'review'}
          buttons={visibleButtons(panelIsPr ? config.prButtons : config.reviewButtons, panelTask)}
          onReply={(text) => {
            const board: ButtonBoard = panelIsPr ? 'pr' : 'review'
            const sessionId = panelTask.sessionIds.at(-1)
            const run = getRun(panelTask.id)
            if (run) replyRun(panelTask.id, text, runCallbacks(board), sessionId)
            // no live run (app restarted, run dismissed): resume the session directly
            else if (panelTask.repoPath && sessionId) {
              resumeRun(
                panelTask.id,
                'reply',
                board,
                panelTask.repoPath,
                text,
                sessionId,
                runCallbacks(board),
                ACTION_TOOLS,
              )
            }
          }}
          onDismissRun={() => killRun(panelTask.id)}
          onCancel={() => cancelRun(panelTask.id)}
          onRunButton={(button) => runButton(panelTask, panelIsPr ? 'pr' : 'review', button)}
          onStageChange={(stage) => moveStage(panelTask.id, stage)}
          onSnooze={async (snoozed) => {
            await setSnoozed(panelTask.id, snoozed)
            await reload()
          }}
          onKill={() => killRun(panelTask.id)}
          onClose={() => setPanelTaskId(null)}
        />
      )}
    </div>
  )
}

export default App
