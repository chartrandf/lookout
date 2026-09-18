// Reading a review out of a Claude Code transcript. Pure line-level parsing, no file access and no
// Tauri: the app reads the tail through plugin-fs (capture.ts) and the `lookout` CLI through
// node:fs, and both must decide the same way about the same lines.
//
// A transcript is JSONL: one object per line, `type` "assistant" | "user" | …, with the message
// content as an array of blocks (text / thinking / tool_use), plus gitBranch, cwd and a timestamp.
export const MAX_BODY = 64 * 1024
const MIN_BODY = 200 // a sign-off ("done ✅") is not a review

export type CaptureResult =
  | { kind: 'captured'; body: string; ts: string | null }
  | { kind: 'exported' } // the session wrote its own report: that flow already works, leave it alone
  | { kind: 'none' }

type Entry = { type?: string; message?: { role?: string; content?: unknown }; timestamp?: string }
type Block = Record<string, unknown>

const parse = (line: string): Entry | null => {
  try {
    const o = JSON.parse(line)
    return o && typeof o === 'object' ? (o as Entry) : null
  } catch {
    return null // a torn last line, or a format that isn't ours
  }
}

const blocks = (e: Entry): Block[] => (Array.isArray(e.message?.content) ? (e.message.content as Block[]) : [])

// A tool result comes back as a `user` entry too, so "the human took the turn" has to mean a string
// content or a block that isn't a tool_result — otherwise the walk back would stop at the turn's own
// first tool call and capture only the closing sentence.
const isHumanTurn = (e: Entry): boolean => {
  if (e.type !== 'user') return false
  if (typeof e.message?.content === 'string') return true
  return blocks(e).some((b) => b.type !== 'tool_result')
}

// The last thing Claude said before handing the turn back: its text blocks, in order, without the
// thinking and the tool calls.
export const finalAssistantTurn = (lines: string[]): { body: string; ts: string | null } | null => {
  const parts: string[] = []
  let ts: string | null = null
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parse(lines[i])
    if (!e) continue
    if (isHumanTurn(e)) break
    if (e.type !== 'assistant') continue
    const texts = blocks(e)
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => (b.text as string).trim())
      .filter(Boolean)
    if (!texts.length) continue
    parts.unshift(...texts)
    ts ??= e.timestamp ?? null // walking backwards, the first one seen is the newest
  }
  return parts.length ? { body: parts.join('\n\n'), ts } : null
}

const REPORT_DIR = 'AI_TASKS/code-review'
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
const WRITES_TO_DISK = /[>]|\btee\b|\bcp\b|\bmv\b/ // so `ls AI_TASKS/code-review` isn't read as an export

// Dedupe rule 1: the session exported its own report, so capturing would duplicate a flow that
// already works. Reading a heredoc out of Bash counts — several skills write the file that way.
export const exportedToFile = (lines: string[]): boolean =>
  lines.some((line) => {
    const e = parse(line)
    return (
      !!e &&
      blocks(e).some((b) => {
        if (b.type !== 'tool_use') return false
        const input = (b.input ?? {}) as Block
        if (typeof b.name === 'string' && WRITE_TOOLS.has(b.name))
          return typeof input.file_path === 'string' && input.file_path.includes(REPORT_DIR)
        if (b.name === 'Bash')
          return (
            typeof input.command === 'string' &&
            input.command.includes(REPORT_DIR) &&
            WRITES_TO_DISK.test(input.command)
          )
        return false
      })
    )
  })

// What a transcript's tail amounts to: the review, a pointer at the flow that already works, or
// nothing worth storing.
export const reviewFromLines = (lines: string[]): CaptureResult => {
  if (exportedToFile(lines)) return { kind: 'exported' }
  const turn = finalAssistantTurn(lines)
  if (!turn || turn.body.length < MIN_BODY) return { kind: 'none' }
  const body = turn.body.length > MAX_BODY ? `${turn.body.slice(0, MAX_BODY)}\n\n_(truncated by Lookout)_` : turn.body
  return { kind: 'captured', body, ts: turn.ts }
}
