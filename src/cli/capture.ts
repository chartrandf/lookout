import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { type CaptureResult, openingCommand, reviewFromLines } from '../lib/transcript'

// The Node half of src/lib/capture.ts: same tail, same verdict, read through node:fs so the CLI
// (and the Stop hook behind it) can store a review without the app running.
const TAIL_BYTES = 256 * 1024
const HEAD_LINES = 20 // the opening command lives in the first turn, as in src/lib/sessions.ts
const HEAD_BYTES = 64 * 1024

// readSync is allowed to come back short, and Buffer.alloc zero-fills: decoding the whole buffer
// would append a run of NULs to the last line and corrupt the JSON entry holding the review.
const readAt = (path: string, from: number, length: number): string => {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(length)
    let read = 0
    while (read < length) {
      const n = readSync(fd, buf, read, length - read, from + read)
      if (n === 0) break
      read += n
    }
    return buf.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

const sizeOf = (path: string): number => {
  const fd = openSync(path, 'r')
  try {
    return fstatSync(fd).size
  } finally {
    closeSync(fd)
  }
}

export const tailLines = (path: string, maxBytes = TAIL_BYTES): string[] => {
  const size = sizeOf(path)
  const from = Math.max(0, size - maxBytes)
  const lines = readAt(path, from, size - from).split('\n')
  if (from > 0) lines.shift() // the cap lands mid-line: that first piece isn't a whole entry
  return lines.filter((l) => l !== '')
}

// What command opened the session — the Stop hook fires in every session there is, so it has to be
// able to tell a review run from someone debugging in a checkout that happens to match a card.
export const transcriptCommand = (path: string): string | null =>
  openingCommand(
    readAt(path, 0, Math.min(HEAD_BYTES, sizeOf(path)))
      .split('\n')
      .slice(0, HEAD_LINES),
  ).command

export const reviewFromTranscript = (path: string): CaptureResult => reviewFromLines(tailLines(path))
