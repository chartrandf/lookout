import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { GlobalSearch } from './components/GlobalSearch'
import { NotificationBell } from './components/NotificationBell'
import { SessionPanel } from './components/SessionPanel'
import { DEFAULT_COMMANDS, getConfig, setCommands, setRepos } from './lib/config'
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
  setSnoozed,
  setStage,
} from './lib/db'
import { syncMyPrs } from './lib/myprs'
import { notify, onNotificationClick } from './lib/notify'
import { scanReviewFiles } from './lib/reviews'
import { cancelRun, closeRun, getRun, getRuns, killRun, replyRun, resumeRun, startRun, subscribeRuns } from './lib/runs'
import { syncAll } from './lib/sync'
import { initTray, setTrayCount, showMainWindow } from './lib/tray'
import type { AppNotification, Config, MyPr, ReviewTask, Stage, WatchedRepo } from './types'
import { Board } from './views/Board'
import { Discovery } from './views/Discovery'
import { PullRequests } from './views/PullRequests'
import { Settings } from './views/Settings'

const POLL_MS = 10 * 60 * 1000

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

const App = () => {
  const [view, setView] = useState<View>('board')
  const [config, setConfig] = useState<Config>({ githubUser: '', repos: [], commands: DEFAULT_COMMANDS })
  const [tasks, setTasks] = useState<ReviewTask[]>([])
  const [myPrs, setMyPrs] = useState<MyPr[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const runs = useSyncExternalStore(subscribeRuns, getRuns)

  const reload = useCallback(async () => setTasks(await allTasks()), [])

  const reloadNotifications = useCallback(async () => setNotifications(await allNotifications()), [])

  const refresh = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      setTasks(await syncAll())
      const cfg = await getConfig()
      setConfig(cfg)
      setMyPrs(await syncMyPrs(cfg))
      setLastSync(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setSyncing(false)
    }
  }, [])

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
        setView(TAB_ORDER[idx].view)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const moveStage = async (id: string, stage: Stage) => {
    await setStage(id, stage)
    if (stage === 'done') closeRun(id) // done = my part is over, no reply expected
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

  const notifySessionDone = async (taskId: string, command: 'do-review' | 'do-followup') => {
    const t = (await allTasks()).find((x) => x.id === taskId)
    if (!t) return
    const title = `${command === 'do-followup' ? 'Follow up' : 'Review'} done (${t.repo})`
    const body = `${t.prTitle} by ${t.prAuthor}`
    const id = await addNotification(t.id, title, body)
    notify(title, body, { notificationId: id, taskId: t.id })
    await reloadNotifications()
  }

  const runCallbacks = (command: 'do-review' | 'do-followup') => ({
    onSession: async (taskId: string, sessionId: string) => {
      await addSessionId(taskId, sessionId)
      await reload()
    },
    onResult: async (taskId: string, result: string) => {
      if (command === 'do-followup') {
        const summary = parseFollowupSummary(result)
        if (summary) await setFollowupSummary(taskId, summary)
        await setStage(taskId, 'followup')
        closeRun(taskId) // follow-up is informational: no reply expected
      } else {
        await setStage(taskId, 'reviewed')
        await linkReviewReport(taskId)
      }
      await notifySessionDone(taskId, command)
      await reload()
    },
  })

  const dispatchRun = async (t: ReviewTask, command: 'do-review' | 'do-followup') => {
    if (!t.repoPath) return
    if (command === 'do-review') await setStage(t.id, 'reviewing')
    await reload()
    setPanelTaskId(t.id)
    const { commands } = await getConfig()
    const prompt = (command === 'do-review' ? commands.review : commands.followup)
      .replaceAll('<branch_name>', t.branch)
      .replaceAll('<pr_id>', String(t.prNumber))
    await startRun(t.id, command, prompt, t.repoPath, runCallbacks(command))
  }

  const startReview = (id: string) => {
    const t = tasks.find((x) => x.id === id)
    if (t) dispatchRun(t, 'do-review')
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

  const panelTask = panelTaskId ? (tasks.find((t) => t.id === panelTaskId) ?? null) : null

  const discoveredCount = tasks.filter((t) => t.stage === 'discovered' && t.prState === 'open').length
  // board badge = sessions done and waiting on my feedback (not in-progress runs)
  const awaitingCount = runs.filter((r) => r.status === 'awaiting-input').length
  const attentionCount =
    discoveredCount +
    runs.filter((r) => r.status === 'awaiting-input').length +
    tasks.filter((t) => t.hasNewActivity).length

  useEffect(() => {
    setTrayCount(attentionCount)
  }, [attentionCount])

  const inReviewCount = myPrs.filter((p) => p.column === 'in_review').length
  const badges: Partial<Record<View, number>> = {
    pulls: inReviewCount,
    board: awaitingCount,
    discovery: discoveredCount,
  }

  const tab = ({ view: v, label }: (typeof TAB_ORDER)[number], index: number) => {
    const badge = badges[v]
    return (
      <button
        key={v}
        type="button"
        onClick={() => setView(v)}
        className={`group cursor-pointer rounded-md px-3 py-1.5 text-sm ${view === v ? 'bg-deck-700 text-white' : 'text-deck-400 hover:text-deck-200'}`}
      >
        {label}
        {badge ? (
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
        {view === 'pulls' && <PullRequests prs={myPrs} me={config.githubUser} />}
        {view === 'discovery' && (
          <Discovery
            tasks={tasks}
            onReview={startReview}
            onWatch={(id) => moveStage(id, 'watching')}
            onIgnore={(id) => moveStage(id, 'ignored')}
            onUnignore={(id) => moveStage(id, 'discovered')}
            showIgnored={showIgnored}
            onToggleIgnored={() => setShowIgnored((s) => !s)}
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
            onOpenSession={(t) => setPanelTaskId(t.id)}
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
            onSaveCommands={async (commands) => {
              await setCommands(commands)
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
          onReply={(text) => {
            const sessionId = panelTask.sessionIds.at(-1)
            const run = getRun(panelTask.id)
            if (run) replyRun(panelTask.id, text, runCallbacks(run.command ?? 'do-review'), sessionId)
            // no live run (app restarted, run dismissed): resume the review session directly
            else if (panelTask.repoPath && sessionId)
              resumeRun(panelTask.id, 'do-review', panelTask.repoPath, text, sessionId, runCallbacks('do-review'))
          }}
          onDismissRun={() => killRun(panelTask.id)}
          onCancel={() => cancelRun(panelTask.id)}
          onDispatch={(command) => dispatchRun(panelTask, command)}
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
