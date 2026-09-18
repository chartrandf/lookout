import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>() // transcript path -> raw contents

// Mirrors the real plugin-fs handle (read/seek/stat/close). `openHandles` counts the ones still
// unclosed so a leaked descriptor fails the suite — the leak sessions.ts documents is easy to repeat.
const openHandles = new Set<string>()

vi.mock('@tauri-apps/plugin-fs', () => ({
  SeekMode: { Start: 0, Current: 1, End: 2 },
  open: async (p: string) => {
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
const thinking = (t: string) => ({ type: 'thinking', thinking: t })
const toolUse = (name: string, input: Record<string, unknown>) => ({ type: 'tool_use', name, input })

const userPrompt = (t: string, ts = '2026-09-18T09:00:00.000Z') =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: t }, timestamp: ts })

// a tool result comes back as a `user` line too — it must not be read as the human taking the turn
const toolResult = (t: string) =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: t }] } })

const REVIEW = 'a'.repeat(300) // clears the minimum-body guard

beforeEach(() => {
  files.clear()
  openHandles.clear()
})

describe('finalAssistantTurn', () => {
  it('joins the text blocks of the last turn and skips thinking and tool calls', async () => {
    const { finalAssistantTurn } = await load()
    const turn = finalAssistantTurn([
      userPrompt('/do-review 123'),
      assistant([thinking('hmm'), text('## Review'), toolUse('Bash', { command: 'gh pr view' }), text('Looks good')]),
    ])
    expect(turn?.body).toBe('## Review\n\nLooks good')
  })

  it('stops at the previous human turn instead of swallowing older answers', async () => {
    const { finalAssistantTurn } = await load()
    const turn = finalAssistantTurn([
      assistant([text('an older answer')]),
      userPrompt('now review it'),
      assistant([text('the review')]),
    ])
    expect(turn?.body).toBe('the review')
  })

  it('keeps walking across tool results — one turn spans its tool calls', async () => {
    const { finalAssistantTurn } = await load()
    const turn = finalAssistantTurn([
      userPrompt('/do-review 123'),
      assistant([text('first I look')]),
      toolResult('diff output'),
      assistant([text('then the verdict')]),
    ])
    expect(turn?.body).toBe('first I look\n\nthen the verdict')
  })

  it('takes the timestamp of the newest assistant line', async () => {
    const { finalAssistantTurn } = await load()
    const turn = finalAssistantTurn([
      assistant([text('early')], '2026-09-18T10:00:00.000Z'),
      assistant([text('late')], '2026-09-18T11:00:00.000Z'),
    ])
    expect(turn?.ts).toBe('2026-09-18T11:00:00.000Z')
  })

  it('returns null when the tail holds no assistant text', async () => {
    const { finalAssistantTurn } = await load()
    expect(finalAssistantTurn([userPrompt('hi'), assistant([toolUse('Bash', { command: 'ls' })])])).toBeNull()
    expect(finalAssistantTurn([])).toBeNull()
  })

  it('ignores lines that are not JSON', async () => {
    const { finalAssistantTurn } = await load()
    expect(finalAssistantTurn(['', 'not json', assistant([text('the review')])])?.body).toBe('the review')
  })
})

describe('exportedToFile', () => {
  it('spots a Write of a review report', async () => {
    const { exportedToFile } = await load()
    const lines = [assistant([toolUse('Write', { file_path: '/repo/AI_TASKS/code-review/2026-09-18-10-00-br.md' })])]
    expect(exportedToFile(lines)).toBe(true)
  })

  it('spots a report written from a shell heredoc', async () => {
    const { exportedToFile } = await load()
    const lines = [assistant([toolUse('Bash', { command: "cat > AI_TASKS/code-review/x.md <<'EOF'" })])]
    expect(exportedToFile(lines)).toBe(true)
  })

  it('ignores writes anywhere else', async () => {
    const { exportedToFile } = await load()
    expect(exportedToFile([assistant([toolUse('Write', { file_path: '/repo/src/lib/db.ts' })])])).toBe(false)
  })
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

  it('truncates a runaway body', async () => {
    const { captureFromTranscript, MAX_BODY } = await load()
    write('/s.jsonl', [userPrompt('/do-review 123'), assistant([text('x'.repeat(MAX_BODY + 5000))])])
    const result = await captureFromTranscript('/s.jsonl')
    if (result.kind !== 'captured') throw new Error('expected a capture')
    expect(result.body.length).toBeLessThanOrEqual(MAX_BODY + 64)
    expect(result.body).toMatch(/truncated/)
  })

  it('treats an unreadable transcript as nothing to capture', async () => {
    const { captureFromTranscript } = await load()
    expect(await captureFromTranscript('/missing.jsonl')).toEqual({ kind: 'none' })
  })
})
