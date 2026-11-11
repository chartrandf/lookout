import type { RunLine } from './runs'
import { type CaptureResult, reviewFromLines, toolDetail } from './transcript'

// Reading an opencode session back. opencode keeps its sessions in its own store and prints one as
// JSON with `opencode session export <id>`; this turns that into the lines the terminal shows, the
// same shape transcriptLines gives for a Claude Code transcript. Pure, no file access and no Tauri.

// opencode's own tool ids → the names Claude Code prints, so a run's log reads the same whichever CLI
// drove it (`shell` is opencode's Bash). An unknown tool keeps its id, capitalised.
const OPENCODE_TOOL_NAMES: Record<string, string> = {
  shell: 'Bash',
  bash: 'Bash',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  multiedit: 'Edit',
  patch: 'Edit',
  glob: 'Glob',
  grep: 'Grep',
  list: 'LS',
  ls: 'LS',
  webfetch: 'WebFetch',
  websearch: 'WebSearch',
  task: 'Task',
  todowrite: 'TodoWrite',
  todoread: 'TodoRead',
  skill: 'Skill',
}

export const opencodeToolName = (tool: string): string =>
  OPENCODE_TOOL_NAMES[tool.toLowerCase()] ?? (tool ? `${tool[0].toUpperCase()}${tool.slice(1)}` : '')

type Message = { type?: string; text?: unknown; content?: unknown }
type Part = { type?: string; text?: unknown; name?: unknown; state?: { input?: unknown } }
type Block = Record<string, unknown>

// `opencode run` stores the message it was given wrapped in quotes ("say hi"): undo that so replay
// reads like the prompt that was typed. Anything that isn't a JSON string is left as it is.
const unquote = (text: string): string => {
  if (!/^"[\s\S]*"$/.test(text)) return text
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'string' ? parsed : text
  } catch {
    return text
  }
}

// An exported session → the lines the terminal shows: prompts, opencode's text, its tool calls. The
// reasoning and the tool results it also exports are left out, as Claude's transcript replay does.
export const opencodeTranscriptLines = (exported: unknown): RunLine[] => {
  const messages = (exported as { messages?: unknown } | null)?.messages
  if (!Array.isArray(messages)) return []
  return (messages as Message[]).flatMap((m): RunLine[] => {
    if (m.type === 'user') {
      const text = typeof m.text === 'string' ? unquote(m.text).trim() : ''
      return text ? [{ kind: 'user', text }] : []
    }
    if (m.type !== 'assistant' || !Array.isArray(m.content)) return []
    return (m.content as Part[]).flatMap((p): RunLine[] => {
      if (p.type === 'text' && typeof p.text === 'string' && p.text.trim()) return [{ kind: 'text', text: p.text }]
      if (p.type !== 'tool') return []
      const name = opencodeToolName(String(p.name ?? ''))
      const detail = toolDetail((p.state?.input ?? {}) as Record<string, unknown>)
      const text = `${name} ${detail}`.trim()
      return text ? [{ kind: 'tool', text }] : []
    })
  })
}

// An exported session as the Claude-JSONL lines the capture reads (transcript.ts): the bridge that
// lets the same rules — the last assistant turn, a report the session exported itself — decide for
// either CLI. A tool's result lives inside the tool part here, so no user tool_result entries exist
// and the walk back stops at the next real prompt, as it should.
export const opencodeCaptureLines = (exported: unknown): string[] => {
  const messages = (exported as { messages?: unknown } | null)?.messages
  if (!Array.isArray(messages)) return []
  return (messages as Message[]).flatMap((m): string[] => {
    if (m.type === 'user')
      return typeof m.text === 'string' && unquote(m.text).trim()
        ? [JSON.stringify({ type: 'user', message: { content: unquote(m.text) } })]
        : []
    if (m.type !== 'assistant' || !Array.isArray(m.content)) return []
    const blocks = (m.content as Part[]).flatMap((p): Block[] => {
      if (p.type === 'text' && typeof p.text === 'string') return [{ type: 'text', text: p.text }]
      if (p.type !== 'tool') return []
      const name = opencodeToolName(String(p.name ?? ''))
      const input = { ...((p.state?.input ?? {}) as Record<string, unknown>) }
      // opencode spells the file `path`, Claude `file_path`: normalized so the export detection reads it
      if ((name === 'Write' || name === 'Edit') && input.file_path === undefined)
        input.file_path = input.filePath ?? input.path
      return [{ type: 'tool_use', name, input }]
    })
    return blocks.length ? [JSON.stringify({ type: 'assistant', message: { content: blocks } })] : []
  })
}

export const opencodeCapture = (exported: unknown): CaptureResult => reviewFromLines(opencodeCaptureLines(exported))
