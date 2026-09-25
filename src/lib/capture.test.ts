import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>() // transcript path -> raw contents

// Mirrors the real plugin-fs handle (read/seek/stat/close). `openHandles` counts the ones still
// unclosed so a leaked descriptor fails the suite — the leak sessions.ts documents is easy to repeat.
const openHandles = new Set<string>()
const unopenable = new Set<string>() // stat works, open throws (a permission the scope lacks)

vi.mock('@tauri-apps/plugin-fs', () => ({
  SeekMode: { Start: 0, Current: 1, End: 2 },
  stat: async (p: string) => {
    const content = files.get(p)
    if (content === undefined) throw new Error(`ENOENT ${p}`)
    return { size: new TextEncoder().encode(content).length }
  },
  open: async (p: string) => {
    if (unopenable.has(p)) throw new Error(`fs.seek not allowed ${p}`)
    const content = files.get(p)
    if (content === undefined) throw new Error(`ENOENT ${p}`)
    openHandles.add(p)
    const bytes = new TextEncoder().encode(content)
    let offset = 0
    return {
      read: async (buf: Uint8Array) => {
        if (offset >= bytes.length) return null
        const chunk = bytes.subarray(offset, offset + buf.byteLength)
        buf.set(chunk)
        offset += chunk.byteLength
        return chunk.byteLength
      },
      seek: async (to: number) => {
        offset = to
        return offset
      },
      stat: async () => ({ size: bytes.length }),
      close: async () => {
        openHandles.delete(p)
      },
    }
  },
}))

vi.mock('./log', () => ({ logWarn: vi.fn(), errText: (e: unknown) => String(e) }))

const load = async () => {
  vi.resetModules()
  return import('./capture')
}

// --- transcript line builders -------------------------------------------------------------

type Block = Record<string, unknown>

const assistant = (blocks: Block[], ts = '2026-09-18T10:00:00.000Z') =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: blocks }, timestamp: ts })

const text = (t: string) => ({ type: 'text', text: t })
const toolUse = (name: string, input: Record<string, unknown>) => ({ type: 'tool_use', name, input })

const userPrompt = (t: string, ts = '2026-09-18T09:00:00.000Z') =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: t }, timestamp: ts })

const REVIEW = 'a'.repeat(300) // clears the minimum-body guard

beforeEach(() => {
  files.clear()
  openHandles.clear()
  unopenable.clear()
})

describe('readTailLines', () => {
  it('reads only the tail and drops the partial first line', async () => {
    const { readTailLines } = await load()
    files.set('/t.jsonl', 'aaaa\nbbbb\ncccc\n')
    // 9 bytes covers "cc\n" plus part of the bbbb line
    expect(await readTailLines('/t.jsonl', 9)).toEqual(['cccc'])
  })

  it('keeps every line when the cap covers the whole file', async () => {
    const { readTailLines } = await load()
    files.set('/t.jsonl', 'aaaa\nbbbb\n')
    expect(await readTailLines('/t.jsonl', 1024)).toEqual(['aaaa', 'bbbb'])
  })

  it('closes its handle, on success and on failure', async () => {
    const { readTailLines } = await load()
    files.set('/t.jsonl', 'aaaa\n')
    await readTailLines('/t.jsonl', 1024)
    expect(openHandles.size).toBe(0)
    await expect(readTailLines('/missing.jsonl', 1024)).rejects.toThrow()
    expect(openHandles.size).toBe(0)
  })
})

describe('captureFromTranscript', () => {
  const write = (path: string, lines: string[]) => files.set(path, `${lines.join('\n')}\n`)

  it('captures the final turn of a review session', async () => {
    const { captureFromTranscript } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text(REVIEW)])])
    const result = await captureFromTranscript('/s.jsonl')
    expect(result).toEqual({ kind: 'captured', body: REVIEW, ts: '2026-09-18T10:00:00.000Z' })
  })

  it('reports a session that exported its own report instead of capturing it', async () => {
    const { captureFromTranscript } = await load()
    write('/s.jsonl', [
      userPrompt('/do-review 123'),
      assistant([toolUse('Write', { file_path: 'AI_TASKS/code-review/2026-09-18-10-00-br.md' }), text(REVIEW)]),
    ])
    expect(await captureFromTranscript('/s.jsonl')).toEqual({ kind: 'exported' })
  })

  it('skips a final turn too short to be a review', async () => {
    const { captureFromTranscript } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text('done ✅')])])
    expect(await captureFromTranscript('/s.jsonl')).toEqual({ kind: 'none' })
  })

  it('treats an unreadable transcript as nothing to capture', async () => {
    const { captureFromTranscript } = await load()
    expect(await captureFromTranscript('/missing.jsonl')).toEqual({ kind: 'none' })
  })
})

describe('captureIfGrown', () => {
  const write = (path: string, lines: string[]) => files.set(path, `${lines.join('\n')}\n`)

  it('examines a transcript once, then skips it while it stands still', async () => {
    const { captureIfGrown } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text(REVIEW)])])
    expect(await captureIfGrown('/s.jsonl')).toEqual({ kind: 'captured', body: REVIEW, ts: '2026-09-18T10:00:00.000Z' })
    expect(await captureIfGrown('/s.jsonl')).toBeNull()
  })

  it('looks again once the session has written more', async () => {
    const { captureIfGrown } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text(REVIEW)])])
    await captureIfGrown('/s.jsonl')
    write('/s.jsonl', [
      userPrompt('/do-review 123'),
      assistant([text(REVIEW)]),
      assistant([text(`${REVIEW} and more`)]),
    ])
    const again = await captureIfGrown('/s.jsonl')
    if (again?.kind !== 'captured') throw new Error('expected a re-capture')
    expect(again.body).toContain('and more')
  })

  it('reads a transcript again after a read that failed', async () => {
    const { captureIfGrown } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text(REVIEW)])])
    unopenable.add('/s.jsonl')
    expect(await captureIfGrown('/s.jsonl')).toBeNull()
    unopenable.clear()
    expect(await captureIfGrown('/s.jsonl')).toEqual(expect.objectContaining({ kind: 'captured' }))
  })

  it('is quiet about a transcript that vanished', async () => {
    const { captureIfGrown } = await load()
    expect(await captureIfGrown('/missing.jsonl')).toBeNull()
  })
})
