import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { marked } from 'marked'
import { useEffect, useRef, useState } from 'react'
import { buildFeed, type FeedEvent } from '../lib/feed'
import { resumeInGhostty } from '../lib/ghostty'
import { openPrWindow } from '../lib/prwindow'
import type { Run } from '../lib/runs'
import { timeAgo } from '../lib/time'
import type { ReviewTask, Stage } from '../types'
import { PrLink } from './PrLink'

type Props = {
  task: ReviewTask
  run: Run | undefined
  me: string
  onReply: (text: string) => void
  onDispatch: (command: 'do-review' | 'do-followup') => void
  onStageChange: (stage: Stage) => void
  onSnooze: (snoozed: boolean) => void
  onKill: () => void
  onDismissRun: () => void
  onClose: () => void
}

const STAGES: { value: Stage; label: string }[] = [
  { value: 'discovered', label: 'Discovery' },
  { value: 'watching', label: 'Watching' },
  { value: 'inbox', label: 'Needs Review' },
  { value: 'reviewing', label: 'In Review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'done', label: 'Done' },
  { value: 'ignored', label: 'Ignored' },
]

const lineClass: Record<string, string> = {
  text: 'text-deck-200 whitespace-pre-wrap',
  tool: 'text-deck-500 font-mono text-xs',
  user: 'text-grass-300 font-medium',
  error: 'text-red-400 font-mono text-xs',
}

export const SessionPanel = ({
  task,
  run,
  me,
  onReply,
  onDispatch,
  onStageChange,
  onSnooze,
  onKill,
  onDismissRun,
  onClose,
}: Props) => {
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [feed, setFeed] = useState<FeedEvent[] | null>(null)
  const [report, setReport] = useState<{ path: string; content: string } | null>(null)
  const [showRun, setShowRun] = useState(true)
  const [shown, setShown] = useState(false) // drives slide-in/out + backdrop fade
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => {
    setShown(false)
    setTimeout(onClose, 220) // let the slide-out finish
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild feed when switching task
  useEffect(() => {
    setFeed(null)
    setReport(null)
    buildFeed(task, me).then(setFeed)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [task.id])

  const openReport = async (path: string) => {
    try {
      setReport({ path, content: await readTextFile(path) })
    } catch {
      setReport({ path, content: '(could not read report file)' })
    }
  }

  const send = () => {
    if (!input.trim()) return
    onReply(input.trim())
    setInput('')
  }

  // Esc closes the panel (or the report overlay first)
  // biome-ignore lint/correctness/useExhaustiveDependencies: close is stable enough for this listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setReport((r) => {
        if (r) return null
        close()
        return r
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const running = run?.status === 'running'
  const sessionId = run?.sessionId ?? task.sessionIds.at(-1)
  const canReply = !!run && run.status !== 'running' && run.status !== 'closed' && !!sessionId

  const copySessionId = async () => {
    if (!sessionId || !task.repoPath) return
    await writeText(`cd ${task.repoPath} && claude --resume ${sessionId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Ghostty deep link; falls back to copying the resume command when Ghostty is missing
  const resumeSession = async (id: string) => {
    if (!task.repoPath) return
    const launched = await resumeInGhostty(task.repoPath, id)
    if (!launched) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-20 cursor-pointer bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-y-0 right-0 z-20 flex w-[45vw] min-w-[440px] max-w-[860px] transform flex-col border-l border-deck-700 bg-deck-900 shadow-2xl transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start gap-2 border-b border-deck-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <PrLink
              url={task.prUrl}
              repo={task.repo}
              prNumber={task.prNumber}
              className="block text-sm font-semibold text-grass-300"
            >
              {task.prTitle}
            </PrLink>
            <p className="mt-0.5 text-xs text-deck-500">
              {task.repo}#{task.prNumber} · <span className="font-mono">{task.branch}</span>
            </p>
            {sessionId && (
              <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-deck-500">
                <button
                  type="button"
                  onClick={() => resumeSession(sessionId)}
                  title="Resume this session in Ghostty (copies the command if Ghostty is missing)"
                  className="cursor-pointer hover:text-grass-300 hover:underline"
                >
                  👻 session {sessionId}
                </button>
                <button
                  type="button"
                  onClick={copySessionId}
                  title="Copy `claude --resume` command"
                  className="cursor-pointer hover:text-grass-300"
                >
                  {copied ? 'copied!' : '⧉'}
                </button>
              </span>
            )}
          </div>
          <select
            value={task.stage}
            onChange={(e) => onStageChange(e.target.value as Stage)}
            className="cursor-pointer rounded border border-deck-600 bg-deck-800 px-1.5 py-1 text-xs text-deck-200 outline-none"
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer rounded px-2 py-1 text-deck-400 hover:text-deck-100"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 border-b border-deck-800 px-4 py-2">
          <button
            type="button"
            onClick={() => onDispatch('do-review')}
            disabled={running}
            className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-50"
          >
            ▶ do-review
          </button>
          <button
            type="button"
            onClick={() => onDispatch('do-followup')}
            disabled={running}
            className="cursor-pointer rounded-md border border-grass-600 px-3 py-1.5 text-sm text-grass-300 hover:bg-grass-600/20 disabled:opacity-50"
          >
            🔁 do-followup
          </button>
          {running && <span className="animate-pulse self-center text-xs text-amber-300">running…</span>}
          {run?.status === 'awaiting-input' && (
            <span className="self-center text-xs text-grass-300">awaiting input</span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {run && run.lines.length > 0 && (
            <div className="mb-4 rounded-lg border border-deck-700 bg-deck-800/50">
              <div className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-deck-400">
                <button
                  type="button"
                  onClick={() => setShowRun((s) => !s)}
                  className="flex flex-1 cursor-pointer items-center justify-between"
                >
                  claude session output
                  <span>{showRun ? '▾' : '▸'}</span>
                </button>
                {!running && (
                  <button
                    type="button"
                    onClick={onDismissRun}
                    title="Dismiss this session output"
                    className="cursor-pointer normal-case text-deck-500 hover:text-deck-200"
                  >
                    ✕
                  </button>
                )}
              </div>
              {showRun && (
                <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto px-3 pb-3 text-sm">
                  {run.lines.map((l, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
                    <p key={i} className={lineClass[l.kind]}>
                      {l.kind === 'user' ? `❯ ${l.text}` : l.text}
                    </p>
                  ))}
                  {running && <p className="animate-pulse text-xs text-deck-500">▍</p>}
                </div>
              )}
            </div>
          )}

          <h4 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-deck-400">
            history
            <button
              type="button"
              onClick={() => buildFeed(task, me).then(setFeed)}
              className="cursor-pointer text-deck-500 hover:text-deck-200"
              title="Refresh history"
            >
              ↻
            </button>
          </h4>
          {!feed && <p className="text-sm text-deck-500">loading history…</p>}
          {feed?.length === 0 && <p className="text-sm text-deck-500">No events yet.</p>}
          <ul className="flex flex-col gap-2">
            {feed?.map((e, i) => {
              const body = (
                <>
                  <span className="mr-1.5">{e.icon}</span>
                  <span className="font-medium">{e.mine ? 'you' : e.actor}</span> {e.text}
                  {e.filePath && ' ↗'}
                  {e.sessionId && ' 👻'}
                </>
              )
              const bubbleClass = `max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                e.mine
                  ? 'rounded-br-sm bg-grass-600/25 text-grass-100'
                  : 'rounded-bl-sm border border-deck-700 bg-deck-800 text-deck-200'
              }`
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: static snapshot list
                <li key={i} className={`flex flex-col ${e.mine ? 'items-end' : 'items-start'}`}>
                  {e.filePath || e.url || e.sessionId ? (
                    <button
                      type="button"
                      title={e.sessionId ? `Resume session ${e.sessionId} in Ghostty` : undefined}
                      onClick={() =>
                        e.filePath
                          ? openReport(e.filePath)
                          : e.sessionId
                            ? resumeSession(e.sessionId)
                            : openPrWindow(e.url as string, task.repo, task.prNumber)
                      }
                      className={`${bubbleClass} cursor-pointer text-left hover:underline`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={bubbleClass}>{body}</div>
                  )}
                  <span
                    className={`mt-0.5 text-[10px] text-deck-500 ${e.mine ? 'pr-1' : 'pl-1'}`}
                    title={new Date(e.ts).toLocaleString()}
                  >
                    {timeAgo(e.ts)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-t border-deck-800 p-3">
          {run && run.status !== 'closed' && (
            <div className="mb-2 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                disabled={!canReply}
                placeholder={canReply ? 'e.g. "1,3" to push comments, "all", or free text…' : 'session running…'}
                className="flex-1 rounded border border-deck-600 bg-deck-800 px-2 py-1.5 text-sm outline-none focus:border-grass-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={send}
                disabled={!canReply}
                className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMoreOpen((s) => !s)}
            className="cursor-pointer text-xs text-deck-400 hover:text-deck-200"
          >
            More options… {moreOpen ? '▾' : '▸'}
          </button>
          {moreOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSnooze(!task.snoozed)}
                className="cursor-pointer rounded bg-deck-800 px-2 py-1 text-xs text-deck-300 hover:bg-deck-700"
              >
                {task.snoozed ? 'unhide' : '💤 hide until new activity'}
              </button>
              {(run?.sessionId || task.sessionIds.length > 0) && (
                <button
                  type="button"
                  onClick={copySessionId}
                  className="cursor-pointer rounded bg-deck-800 px-2 py-1 text-xs text-deck-300 hover:bg-deck-700"
                >
                  {copied ? 'copied!' : 'copy resume cmd'}
                </button>
              )}
              <button
                type="button"
                onClick={() => openUrl(task.prUrl)}
                className="cursor-pointer rounded bg-deck-800 px-2 py-1 text-xs text-deck-300 hover:bg-deck-700"
              >
                open in browser
              </button>
              {running && (
                <button
                  type="button"
                  onClick={onKill}
                  className="cursor-pointer rounded bg-red-600/30 px-2 py-1 text-xs text-red-300 hover:bg-red-600/50"
                >
                  kill run
                </button>
              )}
            </div>
          )}
        </div>

        {report && (
          <div className="absolute inset-0 z-30 flex flex-col bg-deck-900">
            <div className="flex items-center gap-2 border-b border-deck-800 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setReport(null)}
                title="Back to the PR panel"
                className="cursor-pointer rounded px-2 py-1 text-deck-300 hover:bg-deck-800 hover:text-deck-100"
              >
                ← back
              </button>
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-deck-400">{report.path.split('/').at(-1)}</p>
            </div>
            <div
              className="prose prose-sm prose-invert max-w-none flex-1 overflow-auto p-4 prose-headings:text-deck-100 prose-a:text-grass-300 prose-code:text-grass-300 prose-pre:bg-deck-800 prose-td:text-deck-200 prose-th:text-deck-300"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: local report file written by our own /do-review
              dangerouslySetInnerHTML={{ __html: marked.parse(report.content, { async: false }) }}
            />
            {canReply && (
              <div className="flex gap-2 border-t border-deck-800 p-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder='send comments from here — e.g. "1,3" or "all"'
                  className="flex-1 rounded border border-deck-600 bg-deck-800 px-2 py-1.5 text-sm outline-none focus:border-grass-500"
                />
                <button
                  type="button"
                  onClick={send}
                  className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
