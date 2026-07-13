import type { Child } from '@tauri-apps/plugin-shell'
import { spawnClaude } from './claude'

export type RunLine = { kind: 'text' | 'tool' | 'user' | 'error'; text: string }

export type Run = {
  taskId: string
  command: 'do-review' | 'do-followup'
  repoPath: string
  sessionId: string | null
  lines: RunLine[]
  status: 'running' | 'awaiting-input' | 'error' | 'closed'
  child: Child | null
}

// Module-level registry so runs survive view switches; React subscribes via listeners.
const runs = new Map<string, Run>()
const listeners = new Set<() => void>()
let snapshot: Run[] = []

const notify = () => {
  snapshot = [...runs.values()]
  for (const l of listeners) l()
}

export const subscribeRuns = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const getRuns = () => snapshot

export const getRun = (taskId: string) => runs.get(taskId)

type Callbacks = {
  onSession?: (taskId: string, sessionId: string) => void
  onResult?: (taskId: string, resultText: string) => void
}

const dispatch = async (run: Run, prompt: string, callbacks: Callbacks, resumeSessionId?: string) => {
  run.status = 'running'
  notify()
  run.child = await spawnClaude(
    prompt,
    run.repoPath,
    (e) => {
      if (e.type === 'init') {
        run.sessionId = e.sessionId
        callbacks.onSession?.(run.taskId, e.sessionId)
      } else if (e.type === 'text') run.lines.push({ kind: 'text', text: e.text })
      else if (e.type === 'tool') run.lines.push({ kind: 'tool', text: `${e.name} ${e.detail}`.trim() })
      else if (e.type === 'stderr') run.lines.push({ kind: 'error', text: e.text })
      else if (e.type === 'result') {
        run.status = 'awaiting-input'
        callbacks.onResult?.(run.taskId, e.text)
      } else if (e.type === 'exit') {
        run.child = null
        if (run.status === 'running') run.status = e.code === 0 ? 'closed' : 'error'
      }
      notify()
    },
    resumeSessionId,
  )
  notify()
}

export const startRun = async (
  taskId: string,
  command: Run['command'],
  prompt: string,
  repoPath: string,
  callbacks: Callbacks = {},
) => {
  const existing = runs.get(taskId)
  if (existing && existing.status === 'running') return
  const run: Run = {
    taskId,
    command,
    repoPath,
    sessionId: null,
    lines: [{ kind: 'user', text: prompt }],
    status: 'running',
    child: null,
  }
  runs.set(taskId, run)
  await dispatch(run, prompt, callbacks)
}

export const replyRun = async (taskId: string, text: string, callbacks: Callbacks = {}, fallbackSessionId?: string) => {
  const run = runs.get(taskId)
  if (!run || run.status === 'running') return
  const sessionId = run.sessionId ?? fallbackSessionId
  if (!sessionId) return
  run.sessionId = sessionId
  run.lines.push({ kind: 'user', text })
  await dispatch(run, text, callbacks, sessionId)
}

// Mark a finished run as closed (no further input expected)
export const closeRun = (taskId: string) => {
  const run = runs.get(taskId)
  if (run && run.status !== 'running') {
    run.status = 'closed'
    notify()
  }
}

export const killRun = async (taskId: string) => {
  const run = runs.get(taskId)
  if (run?.child) await run.child.kill()
  runs.delete(taskId)
  notify()
}
