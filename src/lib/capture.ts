import { open, SeekMode, stat } from '@tauri-apps/plugin-fs'
import { errText, logWarn } from './log'
import { type CaptureResult, reviewFromLines } from './transcript'

// A review that only ever existed in a session transcript. The shipped default review button runs
// Claude Code's own /review, which prints its verdict and exports nothing — so the card shows a
// session and no report (scanReviewFiles in reviews.ts only ever finds AI_TASKS/code-review/*.md).
// Pull the final assistant turn out of ~/.claude/projects/<slug>/<id>.jsonl instead.
//
// Only the tail is read: a transcript runs to megabytes and the verdict is its last words.
export const TAIL_BYTES = 256 * 1024
const CHUNK = 64 * 1024

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
    text += decoder.decode() // flush any trailing multi-byte state
    const lines = text.split('\n')
    if (from > 0) lines.shift() // the cap lands mid-line: that first piece isn't a whole entry
    return lines.filter((l) => l !== '')
  } finally {
    await file.close()
  }
}

// null when the file can't be read — which is not the same answer as "read it, nothing to capture"
const readCapture = async (filePath: string, maxBytes: number): Promise<CaptureResult | null> => {
  try {
    return reviewFromLines(await readTailLines(filePath, maxBytes))
  } catch (e) {
    // a session file removed mid-scan, or one the fs scope won't read: it costs this capture, nothing else
    logWarn('capture', `unreadable ${filePath}: ${errText(e)}`)
    return null
  }
}

export const captureFromTranscript = async (filePath: string, maxBytes = TAIL_BYTES): Promise<CaptureResult> =>
  (await readCapture(filePath, maxBytes)) ?? { kind: 'none' }

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
  const result = await readCapture(filePath, TAIL_BYTES)
  if (result) examined.set(filePath, size) // a failed read is tried again next pass, not written off
  return result
}
