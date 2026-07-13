import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect, useState } from 'react'
import type { Config, WatchedRepo } from '../types'

type Props = {
  config: Config
  onSave: (repos: WatchedRepo[]) => void
}

export const Settings = ({ config, onSave }: Props) => {
  const [repo, setRepo] = useState('')
  const [path, setPath] = useState('')
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

  const add = () => {
    if (!repo.includes('/') || !path.startsWith('/')) return
    onSave([...config.repos, { repo: repo.trim(), path: path.trim().replace(/\/$/, '') }])
    setRepo('')
    setPath('')
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-zinc-400">
          GitHub user:{' '}
          <span className="font-mono text-zinc-200">{config.githubUser || '(detected on first sync)'}</span> — your own
          PRs are never listed.
        </p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={autostart} onChange={toggleAutostart} className="cursor-pointer" />
          Launch at login
        </label>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Watched repositories</h3>
        <ul className="flex flex-col gap-1">
          {config.repos.map((r) => (
            <li
              key={r.repo}
              className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800/60 p-2 text-sm"
            >
              <span className="font-medium">{r.repo}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500">{r.path}</span>
              <button
                type="button"
                onClick={() => onSave(config.repos.filter((x) => x.repo !== r.repo))}
                className="cursor-pointer text-xs text-red-400 hover:text-red-300"
              >
                remove
              </button>
            </li>
          ))}
          {config.repos.length === 0 && <li className="text-sm text-zinc-500">No repos watched yet.</li>}
        </ul>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-700 p-3">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo (e.g. owner/repo)"
          className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        />
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="local clone path (e.g. /Users/me/Projects/my-repo)"
          className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
        />
        <button
          type="button"
          onClick={add}
          className="cursor-pointer self-start rounded-md bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500"
        >
          Add repo
        </button>
      </div>
    </div>
  )
}
