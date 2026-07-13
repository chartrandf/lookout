import { useCallback, useEffect, useState } from 'react'
import { getConfig, setRepos } from './lib/config'
import { allTasks, setStage } from './lib/db'
import { syncAll } from './lib/sync'
import type { Config, ReviewTask, Stage, WatchedRepo } from './types'
import { Board } from './views/Board'
import { Discovery } from './views/Discovery'
import { Settings } from './views/Settings'

const POLL_MS = 10 * 60 * 1000

type View = 'discovery' | 'board' | 'settings'

const App = () => {
  const [view, setView] = useState<View>('discovery')
  const [config, setConfig] = useState<Config>({ githubUser: '', repos: [] })
  const [tasks, setTasks] = useState<ReviewTask[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)

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
    getConfig().then(setConfig)
    allTasks().then(setTasks)
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const moveStage = async (id: string, stage: Stage) => {
    await setStage(id, stage)
    setTasks(await allTasks())
  }

  const saveRepos = async (repos: WatchedRepo[]) => {
    await setRepos(repos)
    setConfig(await getConfig())
    refresh()
  }

  const discoveredCount = tasks.filter((t) => t.stage === 'discovered' && t.prState === 'open').length

  const tab = (v: View, label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setView(v)}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm ${view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
    >
      {label}
      {badge ? <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-black">{badge}</span> : null}
    </button>
  )

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/95 px-4 py-2.5">
        <h1 className="mr-3 text-sm font-bold tracking-tight">Review Deck</h1>
        {tab('discovery', 'Discovery', discoveredCount)}
        {tab('board', 'Board')}
        {tab('settings', 'Settings')}
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {lastSync && <span>synced {lastSync.toLocaleTimeString()}</span>}
          <button
            type="button"
            onClick={refresh}
            disabled={syncing}
            className="cursor-pointer rounded-md bg-zinc-800 px-2.5 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
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
            onWatch={(id) => moveStage(id, 'watching')}
            onIgnore={(id) => moveStage(id, 'ignored')}
            onUnignore={(id) => moveStage(id, 'discovered')}
            showIgnored={showIgnored}
            onToggleIgnored={() => setShowIgnored((s) => !s)}
          />
        )}
        {view === 'board' && <Board tasks={tasks} />}
        {view === 'settings' && <Settings config={config} onSave={saveRepos} />}
      </main>
    </div>
  )
}

export default App
