import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { exists } from '@tauri-apps/plugin-fs'
import { useEffect, useState } from 'react'
import { repoFromPath } from '../lib/gh'
import type { Config, WatchedRepo } from '../types'

type Props = {
  config: Config
  onSave: (repos: WatchedRepo[]) => void
}

export const Settings = ({ config, onSave }: Props) => {
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
        <p className="text-sm text-deck-400">
          GitHub user:{' '}
          <span className="font-mono text-deck-200">{config.githubUser || '(detected on first sync)'}</span> — your own
          PRs are never listed.
        </p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-deck-300">
          <input type="checkbox" checked={autostart} onChange={toggleAutostart} className="cursor-pointer" />
          Launch at login
        </label>
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
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="local clone path (e.g. /Users/you/Projects/my-repo)"
          className="rounded border border-deck-600 bg-deck-800 px-2 py-1.5 text-sm outline-none focus:border-grass-500"
        />
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
    </div>
  )
}
