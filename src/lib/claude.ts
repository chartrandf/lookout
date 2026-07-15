import { type Child, Command } from '@tauri-apps/plugin-shell'

export type StreamEvent =
  | { type: 'init'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; detail: string }
  | { type: 'result'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'exit'; code: number | null }

// /do-review needs: gh (diff + push comments), read-only code access, Task (code-reviewer agent), Write (review export)
export const REVIEW_TOOLS = 'Bash(gh:*),Read,Glob,Grep,Task,Write,TodoWrite'
// /handle-review edits files, commits and pushes: it needs Edit + git on top of the review set
export const HANDLE_REVIEW_TOOLS = 'Bash(gh:*),Bash(git:*),Read,Edit,Write,Glob,Grep,Task,TodoWrite'

const toolDetail = (input: Record<string, unknown>): string =>
  String(input.command ?? input.file_path ?? input.description ?? input.pattern ?? '')

const parseLine = (line: string, onEvent: (e: StreamEvent) => void) => {
  if (!line.trim()) return
  // biome-ignore lint/suspicious/noExplicitAny: untyped stream-json payload
  let msg: any
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.type === 'system' && msg.subtype === 'init') onEvent({ type: 'init', sessionId: msg.session_id })
  else if (msg.type === 'assistant') {
    for (const block of msg.message?.content ?? []) {
      if (block.type === 'text' && block.text) onEvent({ type: 'text', text: block.text })
      else if (block.type === 'tool_use')
        onEvent({ type: 'tool', name: block.name, detail: toolDetail(block.input ?? {}) })
    }
  } else if (msg.type === 'result') onEvent({ type: 'result', text: msg.result ?? msg.error ?? '' })
}

export const spawnClaude = async (
  prompt: string,
  cwd: string,
  onEvent: (e: StreamEvent) => void,
  resumeSessionId?: string,
  allowedTools: string = REVIEW_TOOLS,
): Promise<Child> => {
  const args = [
    '-p',
    prompt,
    ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
    '--output-format',
    'stream-json',
    '--verbose',
    '--allowedTools',
    allowedTools,
  ]
  const cmd = Command.create('claude', args, { cwd })
  cmd.stdout.on('data', (line: string) => parseLine(line, onEvent))
  cmd.stderr.on('data', (line: string) => {
    if (line.includes('no stdin data received')) return // harmless CLI notice, not an error
    onEvent({ type: 'stderr', text: line })
  })
  cmd.on('close', (payload: { code: number | null }) => onEvent({ type: 'exit', code: payload.code }))
  cmd.on('error', (err: string) => {
    onEvent({ type: 'stderr', text: err })
    onEvent({ type: 'exit', code: -1 })
  })
  return cmd.spawn()
}
