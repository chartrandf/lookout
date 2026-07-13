import { homeDir } from '@tauri-apps/api/path'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { open } from '@tauri-apps/plugin-dialog'
import { exists } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEffect, useState } from 'react'
import { avatarUrl } from '../lib/avatar'
import { repoFromPath } from '../lib/gh'
import type { Config, ReviewTask, WatchedRepo } from '../types'
import { History } from './History'

type Props = {
  config: Config
  tasks: ReviewTask[]
  onSave: (repos: WatchedRepo[]) => void
}

export const Settings = ({ config, tasks, onSave }: Props) => {
  const [path, setPath] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [autostart, setAutostart] = useState(false)

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch(() => {})
  }, [])

  const toggleAutostart = async () => {
    try {
      if (autostart) await disable()
      else await enable()
      setAutostart(await isEnabled())
    } catch {
      // autostart unavailable in dev builds
    }
  }

  const browse = async () => {
    const folder = await open({
      directory: true,
      multiple: false,
      defaultPath: `${await homeDir()}Projects`,
    })
    if (typeof folder === 'string') setPath(folder)
  }

  // Only the local path is entered; owner/repo is resolved from the clone's git origin.
  const add = async () => {
    const cleaned = path.trim().replace(/\/$/, '')
    if (!cleaned.startsWith('/')) return
    setAdding(true)
    setAddError(null)
    try {
      if (config.repos.some((r) => r.path === cleaned)) throw new Error('This path is already watched.')
      if (!(await exists(cleaned).catch(() => false)))
        throw new Error('Path not found (must exist and live under ~/Projects).')
      const repo = await repoFromPath(cleaned).catch(() => null)
      if (!repo) throw new Error('No GitHub origin found — is this a git clone with an origin remote?')
      onSave([...config.repos, { repo, path: cleaned }])
      setPath('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-deck-400">
          {config.githubUser ? (
            <button
              type="button"
              onClick={() => openUrl(`https://github.com/${config.githubUser}`)}
              title="Open GitHub profile"
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-grass-600/20 py-0.5 pl-1 pr-2.5 font-medium text-grass-300 hover:bg-grass-600/35"
            >
              <img src={avatarUrl(config.githubUser)} alt={config.githubUser} className="h-5 w-5 rounded-full" />@
              {config.githubUser}
            </button>
          ) : (
            <span className="italic text-deck-500">(detected on first sync)</span>
          )}
          <span>— your own PRs are never listed.</span>
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-deck-300">Watched repositories</h3>
        <ul className="flex flex-col gap-1">
          {config.repos.map((r) => (
            <li
              key={r.path}
              className="flex items-center gap-2 rounded border border-deck-700 bg-deck-800/60 p-2 text-sm"
            >
              <span className="font-medium">{r.repo}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-deck-500">{r.path}</span>
              <button
                type="button"
                onClick={() => onSave(config.repos.filter((x) => x.path !== r.path))}
                className="cursor-pointer text-xs text-red-400 hover:text-red-300"
              >
                remove
              </button>
            </li>
          ))}
          {config.repos.length === 0 && <li className="text-sm text-deck-500">No repos watched yet.</li>}
        </ul>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-deck-700 p-3">
        <div className="flex gap-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="local clone path (e.g. /Users/you/Projects/my-repo)"
            className="flex-1 rounded border border-deck-600 bg-deck-800 px-2 py-1.5 text-sm outline-none focus:border-grass-500"
          />
          <button
            type="button"
            onClick={browse}
            className="cursor-pointer rounded-md border border-deck-600 px-3 py-1.5 text-sm text-deck-300 hover:bg-deck-700"
          >
            Browse…
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
        <button
          type="button"
          onClick={add}
          disabled={adding || !path.trim()}
          className="cursor-pointer self-start rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-50"
        >
          {adding ? 'detecting repo…' : 'Add repo'}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-deck-700 p-3">
        <div>
          <p className="text-sm font-medium text-deck-200">Launch at login</p>
          <p className="text-xs text-deck-500">Start Review Deck automatically when you log in.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autostart}
          onClick={toggleAutostart}
          className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${autostart ? 'bg-grass-500' : 'bg-deck-600'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${autostart ? 'translate-x-5' : ''}`}
          />
        </button>
      </div>

      <div className="mt-6 border-t border-deck-800 pt-4">
        <History tasks={tasks} />
      </div>
    </div>
  )
}
