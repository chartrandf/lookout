import { useEffect, useState } from 'react'
import { StreamWatchers } from '../components/StreamWatchers'
import { getWatcherRuns, type WatcherRun } from '../lib/config'
import type { FlowTemplate } from '../lib/streamflow'
import { onStreamChange } from '../lib/streamrunner'
import type { Watcher } from '../lib/streamwatchers'
import type { WatchedRepo } from '../types'

type Props = {
  watchers: Watcher[] // rules that create cards on their own
  templates: FlowTemplate[] // flow templates the watchers can reference
  repos: WatchedRepo[] // watched repos, for the watcher's project picker
  onSaveWatchers: (watchers: Watcher[]) => void
}

// The Automation tab: the watchers that create Stream cards on their own. Was the Stream view's 👁
// side panel, promoted to a tab of its own — it re-reads each watcher's last run on every change.
export const Automation = ({ watchers, templates, repos, onSaveWatchers }: Props) => {
  const [watcherRuns, setWatcherRuns] = useState<Record<string, WatcherRun>>({})
  useEffect(() => {
    const load = () => {
      getWatcherRuns()
        .then(setWatcherRuns)
        .catch(() => null)
    }
    load()
    return onStreamChange(load)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold">Automation</h2>
        <span className="text-xs text-deck-400">
          {watchers.filter((w) => w.enabled).length === 0
            ? 'no watchers running'
            : `${watchers.filter((w) => w.enabled).length} watching`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <StreamWatchers
          watchers={watchers}
          templates={templates}
          repos={repos}
          runs={watcherRuns}
          onSave={onSaveWatchers}
        />
      </div>
    </div>
  )
}
