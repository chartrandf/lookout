import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { type CaptureResult, reviewFromLines } from '../lib/transcript'

// The Node half of src/lib/capture.ts: same tail, same verdict, read through node:fs so the CLI
// (and the Stop hook behind it) can store a review without the app running.
const TAIL_BYTES = 256 * 1024

export const tailLines = (path: string, maxBytes = TAIL_BYTES): string[] => {
  const fd = openSync(path, 'r')
  try {
    const { size } = fstatSync(fd)
    const from = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - from)
    readSync(fd, buf, 0, buf.length, from)
    const lines = buf.toString('utf8').split('\n')
    if (from > 0) lines.shift() // the cap lands mid-line: that first piece isn't a whole entry
    return lines.filter((l) => l !== '')
  } finally {
    closeSync(fd)
  }
}

export const reviewFromTranscript = (path: string): CaptureResult => reviewFromLines(tailLines(path))
