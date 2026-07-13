import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useEffect, useRef, useState } from 'react'
import type { Run } from '../lib/runs'
import type { ReviewTask } from '../types'

type Props = {
  task: ReviewTask
  run: Run | undefined
  onReply: (text: string) => void
  onKill: () => void
  onClose: () => void
}

const lineClass: Record<string, string> = {
  text: 'text-deck-200 whitespace-pre-wrap',
  tool: 'text-deck-500 font-mono text-xs',
  user: 'text-grass-300 font-medium',
  error: 'text-red-400 font-mono text-xs',
}

export const SessionPanel = ({ task, run, onReply, onKill, onClose }: Props) => {
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new output
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [run?.lines.length])

  const copyResume = async () => {
    const sessionId = run?.sessionId ?? task.sessionIds.at(-1)
    if (!sessionId || !task.repoPath) return
    await writeText(`cd ${task.repoPath} && claude --resume ${sessionId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const send = () => {
    if (!input.trim()) return
    onReply(input.trim())
    setInput('')
  }

  return (
    <div className="fixed inset-y-0 right-0 z-20 flex w-[560px] flex-col border-l border-deck-700 bg-deck-900 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-deck-800 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.prTitle}</p>
          <p className="text-xs text-deck-500">
            {task.repo}#{task.prNumber} · {run ? run.command : 'no active run'}
            {run?.status === 'running' && <span className="ml-2 text-amber-400">running…</span>}
            {run?.status === 'awaiting-input' && <span className="ml-2 text-grass-400">awaiting input</span>}
            {run?.status === 'error' && <span className="ml-2 text-red-400">error</span>}
          </p>
        </div>
        {(run?.sessionId || task.sessionIds.length > 0) && (
          <button
            type="button"
            onClick={copyResume}
            className="cursor-pointer rounded bg-deck-800 px-2 py-1 text-xs text-deck-300 hover:bg-deck-700"
          >
            {copied ? 'copied!' : 'copy resume cmd'}
          </button>
        )}
        {run?.status === 'running' && (
          <button
            type="button"
            onClick={onKill}
            className="cursor-pointer rounded bg-red-600/30 px-2 py-1 text-xs text-red-300 hover:bg-red-600/50"
          >
            kill
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded px-2 py-1 text-deck-400 hover:text-deck-100"
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {!run && <p className="text-sm text-deck-500">No run in this app session. Dispatch a review or follow-up.</p>}
        <div className="flex flex-col gap-2 text-sm">
          {run?.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
            <p key={i} className={lineClass[l.kind]}>
              {l.kind === 'user' ? `❯ ${l.text}` : l.text}
            </p>
          ))}
        </div>
        {run?.status === 'running' && <p className="mt-2 animate-pulse text-xs text-deck-500">▍</p>}
      </div>

      <div className="border-t border-deck-800 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={!run || run.status === 'running' || !run.sessionId}
            placeholder={
              run?.status === 'awaiting-input'
                ? 'e.g. "1,3" to push comments, "all", or free text…'
                : 'waiting for session…'
            }
            className="flex-1 rounded border border-deck-600 bg-deck-800 px-2 py-1.5 text-sm outline-none focus:border-grass-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={send}
            disabled={!run || run.status === 'running' || !run.sessionId}
            className="cursor-pointer rounded-md bg-grass-600 px-3 py-1.5 text-sm hover:bg-grass-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
