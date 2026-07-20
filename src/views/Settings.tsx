import { homeDir } from '@tauri-apps/api/path'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { open } from '@tauri-apps/plugin-dialog'
import { exists } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEffect, useState } from 'react'
import { ACTION_ICON_NAMES, ActionIcon } from '../components/ActionIcon'
import { avatarUrl } from '../lib/avatar'
import { CONDITION_FIELDS } from '../lib/buttons'
import { DEFAULT_PR_BUTTONS, DEFAULT_REVIEW_BUTTONS } from '../lib/config'
import { repoFromPath } from '../lib/gh'
import { notify } from '../lib/notify'
import type { ActionButton, ButtonBoard, Config, ReviewTask, Stage, WatchedRepo } from '../types'
import { History } from './History'

type Props = {
  config: Config
  tasks: ReviewTask[]
  onSave: (repos: WatchedRepo[]) => void
  onSaveReviewButtons: (buttons: ActionButton[]) => void
  onSavePrButtons: (buttons: ActionButton[]) => void
}

const STAGE_OPTIONS: Stage[] = [
  'discovered',
  'watching',
  'inbox',
  'reviewing',
  'reviewed',
  'followup',
  'done',
  'ignored',
]

type EditorProps = {
  board: ButtonBoard
  title: string
  hint: string
  buttons: ActionButton[]
  defaults: ActionButton[]
  onEdit: (buttons: ActionButton[]) => void // local update while typing (not persisted)
  onCommit: (buttons: ActionButton[]) => void // persist these buttons
  persist: () => void // persist current local buttons (used on blur)
}

// One repeater: add/remove/edit the action buttons of a single board.
const ButtonsEditor = ({ board, title, hint, buttons, defaults, onEdit, onCommit, persist }: EditorProps) => {
  const fields = CONDITION_FIELDS[board]
  const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-deck-500'
  const patch = (id: string, p: Partial<ActionButton>, commit: boolean) => {
    const next = buttons.map((b) => (b.id === id ? { ...b, ...p } : b))
    ;(commit ? onCommit : onEdit)(next)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-deck-700 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-deck-300">{title}</h3>
          <p className="text-xs text-deck-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => onCommit(defaults)}
          className="shrink-0 cursor-pointer text-xs text-deck-400 hover:text-deck-200"
        >
          Reset to defaults
        </button>
      </div>

      {buttons.map((b, i) => (
        <div key={b.id} className="flex flex-col gap-3 rounded-md border border-deck-800 bg-deck-800/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className={labelCls}>
              {i === 0 ? 'Primary button' : `Button ${i + 1}`}
              {i === 0 && <span className="ml-1.5 normal-case text-deck-600">— used by the quick shortcut</span>}
            </span>
            <button
              type="button"
              onClick={() => onCommit(buttons.filter((x) => x.id !== b.id))}
              className="cursor-pointer text-xs text-red-400 hover:text-red-300"
            >
              remove
            </button>
          </div>

          {/* 1 — what the button says */}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Button text</span>
            <input
              value={b.label}
              onChange={(e) => patch(b.id, { label: e.target.value }, false)}
              onBlur={persist}
              placeholder="e.g. do-review"
              className="rounded border border-deck-600 bg-deck-800 px-2 py-1 text-sm text-deck-100 outline-none focus:border-grass-500"
            />
          </label>

          {/* 1b — its icon */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Icon</span>
            <div className="flex flex-wrap gap-1">
              {ACTION_ICON_NAMES.map((name) => {
                const on = (b.icon ?? 'play') === name
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => patch(b.id, { icon: name }, true)}
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded border ${
                      on
                        ? 'border-grass-500 bg-grass-600/20 text-grass-300'
                        : 'border-deck-600 text-deck-400 hover:bg-deck-700 hover:text-deck-200'
                    }`}
                  >
                    <ActionIcon name={name} size={16} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2 — what it sends to claude */}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Prompt sent to claude</span>
            <textarea
              value={b.prompt}
              onChange={(e) => patch(b.id, { prompt: e.target.value }, false)}
              onBlur={persist}
              rows={3}
              placeholder="/do-review <pr_id>  — or a full prompt. Placeholders: <pr_id>, <branch_name>"
              className="resize-y rounded border border-deck-600 bg-deck-800 px-2 py-1.5 font-mono text-xs text-deck-200 outline-none placeholder:text-deck-600 focus:border-grass-500"
            />
          </label>

          {/* 3 — when the button is visible */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>
              Show when {b.conditions.length === 0 && <span className="normal-case text-deck-600">(always)</span>}
            </span>
            {b.conditions.map((c, idx) => {
              const field = fields.find((f) => f.field === c.field) ?? fields[0]
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: conditions are a positional list
                  key={idx}
                  className="flex items-start gap-2 rounded-md border border-deck-700 bg-deck-800/60 px-2 py-1.5"
                >
                  <span className="w-9 shrink-0 pt-1 text-right text-[11px] font-semibold text-deck-500">
                    {idx === 0 ? 'Where' : 'AND'}
                  </span>
                  <select
                    value={c.field}
                    onChange={(e) => {
                      const nextConds = b.conditions.map((x, j) =>
                        j === idx ? { field: e.target.value as typeof c.field, values: [] } : x,
                      )
                      patch(b.id, { conditions: nextConds }, true)
                    }}
                    className="w-32 shrink-0 cursor-pointer rounded border border-deck-600 bg-deck-800 px-1.5 py-0.5 text-xs text-deck-200 outline-none focus:border-grass-500"
                  >
                    {fields.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 pt-1 text-xs text-deck-500">is any of</span>
                  <div className="flex flex-1 flex-wrap gap-1">
                    {field.values.map((v) => {
                      const on = c.values.includes(v)
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const values = on ? c.values.filter((x) => x !== v) : [...c.values, v]
                            const nextConds = b.conditions.map((x, j) => (j === idx ? { ...x, values } : x))
                            patch(b.id, { conditions: nextConds }, true)
                          }}
                          className={`cursor-pointer rounded px-1.5 py-0.5 text-xs ${
                            on ? 'bg-grass-600 text-white' : 'border border-deck-600 text-deck-400 hover:bg-deck-700'
                          }`}
                        >
                          {v}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => patch(b.id, { conditions: b.conditions.filter((_, j) => j !== idx) }, true)}
                    title="Remove condition"
                    className="shrink-0 cursor-pointer rounded border border-deck-600 px-1.5 py-0.5 text-sm leading-none text-deck-400 hover:border-red-400/50 hover:text-red-300"
                  >
                    −
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() =>
                patch(b.id, { conditions: [...b.conditions, { field: fields[0].field, values: [] }] }, true)
              }
              className="cursor-pointer self-start text-xs text-grass-400 hover:text-grass-300"
            >
              + add condition
            </button>
          </div>

          {/* 4 — where the card lands once the run finishes (review board only) */}
          {board === 'review' && (
            <label className="flex flex-col gap-1">
              <span className={labelCls}>On completion</span>
              <div className="flex items-center gap-2 text-xs text-deck-400">
                move card to stage
                <select
                  value={b.advanceTo ?? ''}
                  onChange={(e) => patch(b.id, { advanceTo: (e.target.value || undefined) as Stage | undefined }, true)}
                  className="w-48 cursor-pointer rounded border border-deck-600 bg-deck-800 px-2 py-1 text-xs text-deck-200 outline-none focus:border-grass-500"
                >
                  <option value="">— leave unchanged —</option>
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onCommit([...buttons, { id: crypto.randomUUID(), label: 'New button', prompt: '', conditions: [] }])
        }
        className="cursor-pointer self-start rounded-md border border-grass-600 px-3 py-1.5 text-sm text-grass-300 hover:bg-grass-600/20"
      >
        + Add button
      </button>
    </div>
  )
}

export const Settings = ({ config, tasks, onSave, onSaveReviewButtons, onSavePrButtons }: Props) => {
  const [path, setPath] = useState('')
  const [reviewBtns, setReviewBtns] = useState<ActionButton[]>(config.reviewButtons)
  const [prBtns, setPrBtns] = useState<ActionButton[]>(config.prButtons)

  useEffect(() => {
    setReviewBtns(config.reviewButtons)
  }, [config.reviewButtons])
  useEffect(() => {
    setPrBtns(config.prButtons)
  }, [config.prButtons])
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
    <div className="flex max-w-[1000px] flex-col gap-4">
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

      <ButtonsEditor
        board="review"
        title="Reviews board buttons"
        hint="Actions shown in a review card's panel. First button is the primary (used by the quick review shortcut)."
        buttons={reviewBtns}
        defaults={DEFAULT_REVIEW_BUTTONS}
        onEdit={setReviewBtns}
        onCommit={(next) => {
          setReviewBtns(next)
          onSaveReviewButtons(next)
        }}
        persist={() => onSaveReviewButtons(reviewBtns)}
      />

      <ButtonsEditor
        board="pr"
        title="Pull Requests board buttons"
        hint="Actions shown in your own PR's panel. First button is the primary (used by the card's quick shortcut)."
        buttons={prBtns}
        defaults={DEFAULT_PR_BUTTONS}
        onEdit={setPrBtns}
        onCommit={(next) => {
          setPrBtns(next)
          onSavePrButtons(next)
        }}
        persist={() => onSavePrButtons(prBtns)}
      />

      <div className="flex items-center justify-between rounded-lg border border-deck-700 p-3">
        <div>
          <p className="text-sm font-medium text-deck-200">Launch at login</p>
          <p className="text-xs text-deck-500">Start Lookout automatically when you log in.</p>
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

      {import.meta.env.DEV && (
        <div className="flex items-center justify-between rounded-lg border border-deck-700 p-3">
          <div>
            <p className="text-sm font-medium text-deck-200">Test notification</p>
            <p className="text-xs text-deck-500">Dev only — fire an OS notification to verify permissions.</p>
          </div>
          <button
            type="button"
            onClick={() => notify('Test notification', 'If you see this, OS notifications work.')}
            className="cursor-pointer rounded-md border border-deck-600 px-3 py-1.5 text-sm text-deck-300 hover:bg-deck-700"
          >
            Send test
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-deck-800 pt-4">
        <History tasks={tasks} />
      </div>
    </div>
  )
}
