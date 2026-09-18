// Reading a review out of a Claude Code transcript. Pure line-level parsing, no file access and no
// Tauri: the app reads the tail through plugin-fs (capture.ts) and the `lookout` CLI through
// node:fs, and both must decide the same way about the same lines.
//
// A transcript is JSONL: one object per line, `type` "assistant" | "user" | …, with the message
// content as an array of blocks (text / thinking / tool_use), plus gitBranch, cwd and a timestamp.
export const MAX_BODY = 64 * 1024
const MIN_BODY = 200 // a sign-off ("done ✅") is not a review

// The slash command that opened a session, and its argument when it has one. Shared with the CLI so
// a Stop hook can tell a review session from any other session it fires in.
export const COMMAND_RE = /<command-name>\/?([\w-]+)<\/command-name>(?:(?:\\n|\s)*<command-args>([^<"]*))?/

export type CaptureKind = 'review' | 'followup'

// What each capture-worthy command produces. A follow-up run answers "was my review addressed", so
// the card labels it as that rather than as a second review.
const CAPTURE_COMMANDS: Record<string, CaptureKind> = {
  'do-review': 'review',
  review: 'review',
  'code-review': 'review',
  'do-followup': 'followup',
}

export const captureKindOf = (command: string | null): CaptureKind | null =>
  (command && CAPTURE_COMMANDS[command]) || null

// The opening command, from the head of a transcript (the first command wins: it is the one the
// session started with).
export const openingCommand = (lines: string[]): { command: string | null; arg: string | null } => {
  for (const line of lines) {
    const m = line.match(COMMAND_RE)
    if (m) return { command: m[1], arg: (m[2] ?? '').trim() || null }
  }
  return { command: null, arg: null }
}

// slice() cuts by UTF-16 code unit, which can land between a surrogate pair and store a lone half
const cut = (text: string, at: number): string => {
  const piece = text.slice(0, at)
  const last = piece.charCodeAt(piece.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? piece.slice(0, -1) : piece
}

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

const parseLines = (lines: string[]): Entry[] => lines.map(parse).filter((e): e is Entry => e !== null)

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
const lastTurn = (entries: Entry[]): { body: string; ts: string | null } | null => {
  const parts: string[] = []
  let size = 0
  let ts: string | null = null
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (isHumanTurn(e)) break
    if (e.type !== 'assistant') continue
    const texts = blocks(e)
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => (b.text as string).trim())
      .filter(Boolean)
    if (!texts.length) continue
    parts.unshift(...texts)
    size += texts.reduce((n, t) => n + t.length, 0)
    ts ??= e.timestamp ?? null // walking backwards, the first one seen is the newest
    // A tail that starts mid-conversation may hold no human turn at all, and then the walk would run
    // to the top of the window and glue several separate answers together. One body's worth is as
    // far back as this can be meaningful.
    if (size > MAX_BODY) break
  }
  return parts.length ? { body: parts.join('\n\n'), ts } : null
}

export const finalAssistantTurn = (lines: string[]) => lastTurn(parseLines(lines))

const REPORT_DIR = 'AI_TASKS/code-review'
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])
// A write *into* the directory: the operator has to come before the path, so `rg … <dir> >/dev/null`
// is not read as an export. This decides whether a capture is deleted, so a false positive costs a
// real review — it errs towards not matching.
const BASH_EXPORT_RE = new RegExp(`(?:>|\\btee\\b|\\bcp\\b|\\bmv\\b)[^|;&]*${REPORT_DIR}`)

// Dedupe rule 1: the session exported its own report, so capturing would duplicate a flow that
// already works. Reading a heredoc out of Bash counts — several skills write the file that way.
const entriesExport = (entries: Entry[]): boolean =>
  entries.some((e) =>
    blocks(e).some((b) => {
      if (b.type !== 'tool_use') return false
      const input = (b.input ?? {}) as Block
      if (typeof b.name === 'string' && WRITE_TOOLS.has(b.name))
        return typeof input.file_path === 'string' && input.file_path.includes(REPORT_DIR)
      if (b.name === 'Bash') return typeof input.command === 'string' && BASH_EXPORT_RE.test(input.command)
      return false
    }),
  )

export const exportedToFile = (lines: string[]) => entriesExport(parseLines(lines))

// What a transcript's tail amounts to: the review, a pointer at the flow that already works, or
// nothing worth storing.
export const reviewFromLines = (lines: string[]): CaptureResult => {
  const entries = parseLines(lines) // a 256 KB tail, parsed once for both questions
  if (entriesExport(entries)) return { kind: 'exported' }
  const turn = lastTurn(entries)
  if (!turn || turn.body.length < MIN_BODY) return { kind: 'none' }
  const body = turn.body.length > MAX_BODY ? `${cut(turn.body, MAX_BODY)}\n\n_(truncated by Lookout)_` : turn.body
  return { kind: 'captured', body, ts: turn.ts }
}
