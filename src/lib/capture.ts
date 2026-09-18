import { open, SeekMode, stat } from '@tauri-apps/plugin-fs'
import { errText, logWarn } from './log'

// A review that only ever existed in a session transcript. The shipped default review button runs
// Claude Code's own /review, which prints its verdict and exports nothing — so the card shows a
// session and no report (scanReviewFiles in reviews.ts only ever finds AI_TASKS/code-review/*.md).
// Pull the final assistant turn out of ~/.claude/projects/<slug>/<id>.jsonl instead.
//
// Only the tail is read: a transcript runs to megabytes and the verdict is its last words.
export const TAIL_BYTES = 256 * 1024
export const MAX_BODY = 64 * 1024
const MIN_BODY = 200 // a sign-off ("done ✅") is not a review
const CHUNK = 64 * 1024

export type CaptureResult =
  | { kind: 'captured'; body: string; ts: string | null }
  | { kind: 'exported' } // the session wrote its own report: that flow already works, leave it alone
  | { kind: 'none' }

// The mirror of readHeadLines in sessions.ts, from the other end. Same rule about the handle: it is
// closed here whatever happens, because an abandoned one stays open for the life of the webview and
// a few hundred of them exhaust the descriptor limit (see the note there — it broke every `gh` call).
export const readTailLines = async (filePath: string, maxBytes = TAIL_BYTES): Promise<string[]> => {
  const file = await open(filePath, { read: true })
  try {
    const { size } = await file.stat()
    const from = Math.max(0, size - maxBytes)
    if (from > 0) await file.seek(from, SeekMode.Start)
    const decoder = new TextDecoder()
    const buf = new Uint8Array(CHUNK)
    let text = ''
    while (true) {
      const n = await file.read(buf)
      if (n === null) break
      text += decoder.decode(buf.subarray(0, n), { stream: true })
    }
    const lines = text.split('\n')
    if (from > 0) lines.shift() // the cap lands mid-line: that first piece isn't a whole entry
    return lines.filter((l) => l !== '')
  } finally {
    await file.close()
  }
}

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

export const captureFromTranscript = async (filePath: string, maxBytes = TAIL_BYTES): Promise<CaptureResult> => {
  let lines: string[]
  try {
    lines = await readTailLines(filePath, maxBytes)
  } catch (e) {
    // a session file removed mid-scan, or one the fs scope won't read: it costs this capture, nothing else
    logWarn('capture', `unreadable ${filePath}: ${errText(e)}`)
    return { kind: 'none' }
  }
  if (exportedToFile(lines)) return { kind: 'exported' }
  const turn = finalAssistantTurn(lines)
  if (!turn || turn.body.length < MIN_BODY) return { kind: 'none' }
  const body = turn.body.length > MAX_BODY ? `${turn.body.slice(0, MAX_BODY)}\n\n_(truncated by Lookout)_` : turn.body
  return { kind: 'captured', body, ts: turn.ts }
}

// A sync pass runs every ~28 s and a finished session never changes again, so a tail read per pass
// per session would be waste. Size is the cheap "did anything happen" signal: a grown transcript is
// read again (the session continued, the verdict may have moved), a still one is skipped. The map
// lives for the run only — after a restart every session is examined once more, which costs one
// pass and keeps the app from having to trust anything it wrote earlier.
const examined = new Map<string, number>() // transcript path -> size at the last examination

export const captureIfGrown = async (filePath: string): Promise<CaptureResult | null> => {
  let size: number
  try {
    size = (await stat(filePath)).size
  } catch (e) {
    logWarn('capture', `cannot stat ${filePath}: ${errText(e)}`)
    return null
  }
  if (examined.get(filePath) === size) return null
  examined.set(filePath, size)
  return captureFromTranscript(filePath)
}
