import { describe, expect, it, vi } from 'vitest'

vi.mock('./claude', () => ({ REVIEW_TOOLS: '' }))
vi.mock('./agent', () => ({ agentBin: () => 'claude', spawnAgent: vi.fn() }))
vi.mock('./log', () => ({ errText: (e: unknown) => String(e), logError: vi.fn(), logInfo: vi.fn(), logWarn: vi.fn() }))

import { spawnAgent } from './agent'
import type { StreamEvent } from './claude'
import { failRun, getRun, replyRun, startRun } from './runs'

describe('failRun', () => {
  // a chat that could not start must say so in the panel, keeping what was typed
  it('shows the message and why it never ran', () => {
    failRun('a/b#1', 'chat', 'review', '/r', 'still needed?', new Error('no remote'))
    expect(getRun('a/b#1')).toMatchObject({
      status: 'error',
      sessionId: null,
      lines: [
        { kind: 'user', text: 'still needed?' },
        { kind: 'error', text: 'could not start claude: Error: no remote' },
      ],
    })
  })
})

describe('failed turn', () => {
  // an error answer still exits 0: the queue must hold, so the run says the turn failed
  it('marks an error answer as failed, and clears it on the next turn', async () => {
    let emit: (e: StreamEvent) => void = () => {}
    vi.mocked(spawnAgent).mockImplementation(async (_p, _cwd, onEvent) => {
      emit = onEvent
      return { kill: vi.fn() } as never
    })
    await startRun('a/b#2', 'chat', 'review', 'hi', '/r')
    emit({ type: 'init', sessionId: 'sess-x' })
    emit({ type: 'result', text: 'max turns reached', isError: true })
    emit({ type: 'exit', code: 0 })
    expect(getRun('a/b#2')).toMatchObject({ status: 'awaiting-input', failed: true, child: null })

    await replyRun('a/b#2', 'again')
    expect(getRun('a/b#2')?.failed).toBe(false)
    emit({ type: 'result', text: 'done', isError: false })
    expect(getRun('a/b#2')?.failed).toBe(false)
  })
})
