import { useEffect, useState } from 'react'
import type { FlowTemplate } from '../lib/streamflow'
import {
  DEFAULT_TASK,
  DEFAULT_WATCHERS,
  nextRunAt,
  WATCHER_CHECKS,
  type Watcher,
  type WatcherCheck,
  type WatcherModel,
  type WatcherRun,
} from '../lib/streamwatchers'
import { messageTime } from '../lib/time'
import type { WatchedRepo } from '../types'

type Props = {
  watchers: Watcher[]
  templates: FlowTemplate[]
  repos: WatchedRepo[]
  runs: Record<string, WatcherRun[]> // each watcher's recent runs, newest first
  running: string[] // ids of the watchers running right now
  onRunNow: (w: Watcher) => void
  onSave: (watchers: Watcher[]) => void
}

const control =
  'rounded-md border border-deck-700 bg-deck-800 px-2 py-1 text-xs text-deck-100 placeholder:text-deck-500 focus:border-deck-500 focus:outline-none'

const blank = (): Watcher => ({
  id: `watcher-${crypto.randomUUID().slice(0, 8)}`,
  name: 'New watcher',
  enabled: false,
  every: 30,
  repo: null,
  check: 'prompt',
  templateId: null,
  prompt: '',
  model: 'haiku',
  tools: '',
})

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// what a run did, in a few words
const outcome = (r: WatcherRun) =>
  r.error
    ? 'failed'
    : r.made
      ? plural(r.made, 'new card')
      : r.found
        ? `${r.found} found, all have a card already`
        : 'nothing new'

const duration = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 1 ? '<1 s' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

const inTime = (ms: number) => {
  const min = Math.ceil(ms / 60_000)
  return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${min % 60} min`
}

// when it runs next, on its saved settings
const nextRun = (w: Watcher, last: WatcherRun | undefined, now: number) => {
  const at = nextRunAt(w, last?.at, now)
  if (at === null) return 'Off: runs only with Run now'
  return at <= now ? 'Next run: due now' : `Next run ${messageTime(new Date(at).toISOString())} · ${inTime(at - now)}`
}

// one run in the history: when, how, what it made, and what it saw
const RunEntry = ({ r }: { r: WatcherRun }) => (
  <li className="flex flex-col gap-1 border-l-2 border-deck-700 py-0.5 pl-2">
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-deck-400">
      <span className="font-medium text-deck-300">{messageTime(r.at)}</span>
      {r.manual && <span className="rounded bg-deck-700 px-1 text-[10px] text-deck-300">by hand</span>}
      {r.ms !== undefined && <span>· {duration(r.ms)}</span>}
      <span className={r.error ? 'text-red-300' : r.made ? 'text-grass-300' : ''}>· {outcome(r)}</span>
    </div>
    {r.cards && r.cards.length > 0 && (
      <ul className="list-disc pl-4 text-[11px] text-deck-300">
        {r.cards.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a run's titles are fixed and may repeat
          <li key={i}>{c}</li>
        ))}
      </ul>
    )}
    {r.error && (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-950/30 p-1.5 text-[11px] text-red-200">
        {r.error}
      </pre>
    )}
    {r.output && (
      <details className="text-[11px] text-deck-400">
        <summary className="cursor-pointer hover:text-deck-200">Agent's answer</summary>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-deck-900 p-1.5 text-deck-300">
          {r.output}
        </pre>
      </details>
    )}
  </li>
)

const TrashIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
)

// a labelled field: what it is, the control, and one line on what it does
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  // a fieldset, not a <label>: the control comes in as children, so the field names itself instead
  <fieldset aria-label={label} className="flex min-w-0 flex-col gap-1">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-deck-400">{label}</span>
    {children}
    {hint && <span className="text-[11px] leading-snug text-deck-500">{hint}</span>}
  </fieldset>
)

// what a watcher's card will do: its single task, word for word, or the flow's steps
const doesHint = (w: Watcher, templates: FlowTemplate[]) => {
  const flow = templates.find((t) => t.id === w.templateId)
  if (flow)
    return `Follows its steps: ${flow.steps.map((s, i) => `${i + 1}. ${s.prompt.split(/[.:\n]/)[0]}`).join(' → ')}`
  if (w.check === 'prompt') return 'One card per thing the agent finds; approving it finishes the card.'
  return `One card: “${DEFAULT_TASK[w.check]('n')}”. Approving its result finishes it.`
}

// Under each watcher: its last run, when it runs next, Run now, and its history. Runs and timing go by
// the saved watcher; one not saved yet (or with unsaved edits) can't run until it is.
const RunBar = ({
  w,
  stored,
  runs,
  running,
  now,
  open,
  onToggle,
  onRunNow,
}: {
  w: Watcher
  stored: Watcher | undefined
  runs: WatcherRun[]
  running: boolean
  now: number
  open: boolean
  onToggle: () => void
  onRunNow: (w: Watcher) => void
}) => {
  const last = runs[0]
  const edited = !stored || JSON.stringify(stored) !== JSON.stringify(w)
  return (
    <div className="flex flex-col gap-2 border-t border-deck-700/60 pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-deck-500">
        <span className={last?.error && !running ? 'text-red-300' : ''}>
          {running ? 'Running…' : last ? `Last run ${messageTime(last.at)} · ${outcome(last)}` : 'Never ran'}
        </span>
        {stored && !running && <span>{nextRun(stored, last, now)}</span>}
        <div className="ml-auto flex items-center gap-2">
          {runs.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="cursor-pointer text-deck-400 hover:text-deck-200"
            >
              {open ? 'Hide history' : `History (${runs.length})`}
            </button>
          )}
          <button
            type="button"
            disabled={running || edited || !stored}
            onClick={() => stored && onRunNow(stored)}
            title={edited ? 'Save your changes first' : 'Run it now, whether on or off; its interval restarts'}
            className="cursor-pointer rounded-md border border-deck-600 px-2 py-0.5 text-deck-200 hover:bg-deck-700 disabled:cursor-default disabled:opacity-40"
          >
            {running ? 'Running…' : '▶ Run now'}
          </button>
        </div>
      </div>
      {open && runs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <RunEntry key={`${r.at}-${r.ms ?? ''}`} r={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

// The watchers: rules that create Stream cards on their own — from what Lookout's sync finds, or from
// a prompt a read-only agent checks. Edited as a draft and saved together. Their cards land in
// Queued, where the risk check holds anything outward-facing for my OK.
export const StreamWatchers = ({ watchers, templates, repos, runs, running, onRunNow, onSave }: Props) => {
  const [draft, setDraft] = useState(watchers)
  const [history, setHistory] = useState<string[]>([]) // watchers whose history is open
  // the clock the next-run times count down on
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  // reset only when the saved watchers change, not when another setting rebuilds the config
  const saved = JSON.stringify(watchers)
  useEffect(() => setDraft(JSON.parse(saved)), [saved])
  const dirty = JSON.stringify(draft) !== saved
  // a prompt watcher needs its prompt
  const valid = draft.every((w) => w.check !== 'prompt' || w.prompt.trim())

  const patch = (id: string, fn: (w: Watcher) => Watcher) => setDraft((d) => d.map((w) => (w.id === id ? fn(w) : w)))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-deck-500">
        A watcher creates cards on its own: from what Lookout's sync finds (no extra GitHub calls), or from a prompt a
        read-only agent checks on its interval. One card per event, one at a time per PR. Cards land in Queued; the risk
        check holds anything outward-facing for your OK.
      </p>

      <ul className="flex flex-col gap-2">
        {draft.map((w) => (
          <li key={w.id} className="flex flex-col gap-3 rounded-lg border border-deck-700 bg-deck-800/40 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={w.enabled}
                aria-label={`${w.name}: ${w.enabled ? 'on' : 'off'}`}
                title={w.enabled ? 'On: it runs on its interval' : 'Off: it never runs'}
                onClick={() => patch(w.id, (x) => ({ ...x, enabled: !x.enabled }))}
                className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${w.enabled ? 'bg-grass-500' : 'bg-deck-600'}`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${w.enabled ? 'left-3.5' : 'left-0.5'}`}
                />
              </button>
              <input
                value={w.name}
                onChange={(e) => patch(w.id, (x) => ({ ...x, name: e.target.value }))}
                aria-label="Watcher name"
                className={`${control} min-w-0 flex-1 text-sm font-medium`}
              />
              <button
                type="button"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== w.id))}
                title="Remove this watcher"
                aria-label={`Remove ${w.name}`}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-deck-600 text-deck-400 hover:border-red-500/60 hover:bg-red-600/15 hover:text-red-300"
              >
                <TrashIcon />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="When" hint={WATCHER_CHECKS.find((c) => c.value === w.check)?.hint}>
                <select
                  value={w.check}
                  onChange={(e) => patch(w.id, (x) => ({ ...x, check: e.target.value as WatcherCheck }))}
                  className={`${control} w-full cursor-pointer`}
                >
                  {WATCHER_CHECKS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Project" hint={w.repo ? `Only ${w.repo}.` : 'Every project Lookout watches.'}>
                <select
                  value={w.repo ?? ''}
                  onChange={(e) => patch(w.id, (x) => ({ ...x, repo: e.target.value || null }))}
                  className={`${control} w-full cursor-pointer truncate`}
                >
                  <option value="">All projects</option>
                  {repos.map((r) => (
                    <option key={r.repo} value={r.repo}>
                      {r.repo}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="What the card does" hint={doesHint(w, templates)}>
                <select
                  value={w.templateId ?? ''}
                  onChange={(e) => patch(w.id, (x) => ({ ...x, templateId: e.target.value || null }))}
                  className={`${control} w-full cursor-pointer`}
                >
                  <option value="">Single task</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      Flow: {t.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Check every" hint="How often it looks for something new.">
                <div className="flex items-center gap-1.5 text-xs text-deck-400">
                  <input
                    type="number"
                    min={1}
                    value={w.every}
                    onChange={(e) => patch(w.id, (x) => ({ ...x, every: Math.max(1, Number(e.target.value) || 1) }))}
                    className={`${control} w-20`}
                  />
                  minutes
                </div>
              </Field>
            </div>

            {w.check === 'prompt' && (
              <div className="flex flex-col gap-3">
                <Field label="What to check" hint="It reads and looks things up, never changes anything.">
                  <textarea
                    value={w.prompt}
                    onChange={(e) => patch(w.id, (x) => ({ ...x, prompt: e.target.value }))}
                    rows={3}
                    placeholder="e.g. New Sentry crashes on wazo-mobile-native with more than 10 events since yesterday — a card per crash to fix."
                    className={`${control} w-full text-sm`}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Model" hint="Haiku is cheap enough to run often.">
                    <select
                      value={w.model}
                      onChange={(e) => patch(w.id, (x) => ({ ...x, model: e.target.value as WatcherModel }))}
                      className={`${control} w-full cursor-pointer`}
                    >
                      <option value="haiku">Haiku</option>
                      <option value="sonnet">Sonnet</option>
                      <option value="default">My default model</option>
                    </select>
                  </Field>
                  <Field label="Extra tools" hint="Beyond reading files and gh, e.g. an MCP server.">
                    <input
                      value={w.tools}
                      onChange={(e) => patch(w.id, (x) => ({ ...x, tools: e.target.value }))}
                      placeholder="mcp__sentry, mcp__notion"
                      className={`${control} w-full font-mono`}
                    />
                  </Field>
                </div>
              </div>
            )}

            <RunBar
              w={w}
              stored={watchers.find((x) => x.id === w.id)}
              runs={runs[w.id] ?? []}
              running={running.includes(w.id)}
              now={now}
              open={history.includes(w.id)}
              onToggle={() => setHistory((h) => (h.includes(w.id) ? h.filter((x) => x !== w.id) : [...h, w.id]))}
              onRunNow={onRunNow}
            />
          </li>
        ))}
        {draft.length === 0 && <li className="text-sm text-deck-500">No watchers: cards only come from you.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDraft((d) => [...d, blank()])}
          className="cursor-pointer rounded-md bg-deck-700 px-3 py-1.5 text-sm hover:bg-deck-600"
        >
          + Add watcher
        </button>
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_WATCHERS)}
          className="cursor-pointer text-xs text-deck-400 hover:text-deck-200"
        >
          Reset to defaults
        </button>
        {dirty && (
          <div className="ml-auto flex items-center gap-2">
            {!valid && <span className="text-xs text-amber-300">A prompt watcher needs its prompt.</span>}
            <button
              type="button"
              onClick={() => setDraft(watchers)}
              className="cursor-pointer rounded-md bg-deck-700 px-3 py-1.5 text-sm hover:bg-deck-600"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() =>
                onSave(
                  draft.map((w) => ({
                    ...w,
                    name: w.name.trim() || 'Watcher',
                    prompt: w.prompt.trim(),
                    tools: w.tools.trim(),
                  })),
                )
              }
              className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-grass-500 disabled:cursor-default disabled:opacity-40"
            >
              Save watchers
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
