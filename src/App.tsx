import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { GlobalSearch } from './components/GlobalSearch'
import { SessionPanel } from './components/SessionPanel'
import { DEFAULT_COMMANDS, getConfig, setCommands, setRepos } from './lib/config'
import { addSessionId, allTasks, clearNewActivity, setFollowupSummary, setOrders, setSnoozed, setStage } from './lib/db'
import { closeRun, getRun, getRuns, killRun, replyRun, startRun, subscribeRuns } from './lib/runs'
import { syncAll } from './lib/sync'
import { initTray, setTrayCount } from './lib/tray'
import type { Config, ReviewTask, Stage, WatchedRepo } from './types'
import { Board } from './views/Board'
import { Discovery } from './views/Discovery'
import { Settings } from './views/Settings'

const POLL_MS = 10 * 60 * 1000

type View = 'discovery' | 'board' | 'settings'

// Single source of truth for tab order: shortcuts (⌘1..⌘n) derive from the index
const TAB_ORDER: { view: View; label: string }[] = [
  { view: 'board', label: 'Board' },
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
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null)

  const runs = useSyncExternalStore(subscribeRuns, getRuns)

  const reload = useCallback(async () => setTasks(await allTasks()), [])

  const refresh = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      setTasks(await syncAll())
      setConfig(await getConfig())
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
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [refresh, reload])

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
    await reload()
  }

  const saveRepos = async (repos: WatchedRepo[]) => {
    await setRepos(repos)
    setConfig(await getConfig())
    refresh()
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
      }
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

  const badges: Partial<Record<View, number>> = { board: awaitingCount, discovery: discoveredCount }

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
        {badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-black">{badge}</span> : null}
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
      </header>

      {/* status bar: always on top, nothing may overlay it */}
      <div className="fixed bottom-2 right-2 z-30 flex items-center gap-2 rounded-md border border-deck-700 bg-deck-900/95 px-2 py-1 text-xs text-deck-500 shadow-lg">
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

      <main className="flex-1 overflow-y-auto p-4">
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
          onReply={(text) =>
            replyRun(
              panelTask.id,
              text,
              runCallbacks(getRun(panelTask.id)?.command ?? 'do-review'),
              panelTask.sessionIds.at(-1),
            )
          }
          onDismissRun={() => killRun(panelTask.id)}
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
