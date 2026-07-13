import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { SessionPanel } from './components/SessionPanel'
import { getConfig, setRepos } from './lib/config'
import { addSessionId, allTasks, clearNewActivity, setFollowupSummary, setStage } from './lib/db'
import { getRun, getRuns, killRun, replyRun, startRun, subscribeRuns } from './lib/runs'
import { syncAll } from './lib/sync'
import { initTray, setTrayCount } from './lib/tray'
import type { Config, ReviewTask, Stage, WatchedRepo } from './types'
import { Board } from './views/Board'
import { Discovery } from './views/Discovery'
import { History } from './views/History'
import { Settings } from './views/Settings'

const POLL_MS = 10 * 60 * 1000

type View = 'discovery' | 'board' | 'history' | 'settings'

const parseFollowupSummary = (text: string) => {
  const m = text.match(/(\d+)\s*addressed\D*?(\d+)\s*partial\D*?(\d+)\s*pending/i)
  return m ? { addressed: Number(m[1]), partial: Number(m[2]), pending: Number(m[3]) } : null
}

const App = () => {
  const [view, setView] = useState<View>('board')
  const [config, setConfig] = useState<Config>({ githubUser: '', repos: [] })
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
    await startRun(t.id, command, t.branch, t.repoPath, runCallbacks(command))
  }

  const panelTask = panelTaskId ? (tasks.find((t) => t.id === panelTaskId) ?? null) : null

  const discoveredCount = tasks.filter((t) => t.stage === 'discovered' && t.prState === 'open').length
  const runningCount = runs.filter((r) => r.status === 'running').length
  const attentionCount =
    discoveredCount +
    runs.filter((r) => r.status === 'awaiting-input').length +
    tasks.filter((t) => t.hasNewActivity).length

  useEffect(() => {
    setTrayCount(attentionCount)
  }, [attentionCount])

  const tab = (v: View, label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${view === v ? 'bg-deck-700 text-white' : 'text-deck-400 hover:text-deck-200'}`}
    >
      {label}
      {badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-black">{badge}</span> : null}
    </button>
  )

  return (
    <div className="min-h-screen bg-deck-900 text-deck-100">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-deck-800 bg-deck-900/95 px-4 py-2.5">
        <h1 className="font-script mr-3 text-xl text-white">Review Deck</h1>
        {tab('board', 'Board', runningCount)}
        {tab('discovery', 'Discovery', discoveredCount)}
        {tab('history', 'History')}
        {tab('settings', 'Settings')}
        <div className="ml-auto flex items-center gap-3 text-xs text-deck-500">
          {lastSync && <span>synced {lastSync.toLocaleTimeString()}</span>}
          <button
            type="button"
            onClick={refresh}
            disabled={syncing}
            className="cursor-pointer rounded-md bg-deck-800 px-2.5 py-1 text-deck-300 hover:bg-deck-700 disabled:opacity-50"
          >
            {syncing ? 'syncing…' : 'sync now'}
          </button>
        </div>
      </header>

      {error && <div className="mx-4 mt-3 rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}

      <main className="p-4">
        {view === 'discovery' && (
          <Discovery
            tasks={tasks}
            onReview={(id) => {
              const t = tasks.find((x) => x.id === id)
              if (t) dispatchRun(t, 'do-review')
            }}
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
            onReview={(t) => dispatchRun(t, 'do-review')}
            onFollowup={(t) => dispatchRun(t, 'do-followup')}
            onOpenSession={(t) => setPanelTaskId(t.id)}
            onSeen={async (t) => {
              await clearNewActivity(t.id)
              await reload()
            }}
          />
        )}
        {view === 'history' && <History tasks={tasks} />}
        {view === 'settings' && <Settings config={config} onSave={saveRepos} />}
      </main>

      {panelTask && (
        <SessionPanel
          task={panelTask}
          run={getRun(panelTask.id)}
          onReply={(text) => replyRun(panelTask.id, text, runCallbacks(getRun(panelTask.id)?.command ?? 'do-review'))}
          onKill={() => killRun(panelTask.id)}
          onClose={() => setPanelTaskId(null)}
        />
      )}
    </div>
  )
}

export default App
