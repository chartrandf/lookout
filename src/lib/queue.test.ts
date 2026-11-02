import { describe, expect, it } from 'vitest'
import { drainQueue } from './queue'

describe('drainQueue', () => {
  it('does nothing with an empty queue', () => {
    expect(drainQueue([], false, 'sess-a')).toEqual({ next: null, rest: [], restore: [] })
  })

  it('sends the oldest message when the turn ends, keeps the rest waiting', () => {
    const queue = [
      { text: 'first', to: 'sess-a' },
      { text: 'second', to: 'sess-a' },
    ]
    expect(drainQueue(queue, false, 'sess-a')).toEqual({
      next: { text: 'first', to: 'sess-a' },
      rest: [{ text: 'second', to: 'sess-a' }],
      restore: [],
    })
  })

  it('sends a message queued for a new session into the session that just started', () => {
    expect(drainQueue([{ text: 'and also', to: null }], false, 'sess-new').next).toEqual({
      text: 'and also',
      to: 'sess-new',
    })
  })

  it('keeps a picked session as the target', () => {
    expect(drainQueue([{ text: 'hi', to: 'sess-b' }], false, 'sess-a').next?.to).toBe('sess-b')
  })

  it('hands everything back to the input when the turn failed (crash or error answer)', () => {
    const queue = [
      { text: 'first', to: 'sess-a' },
      { text: 'second', to: null },
    ]
    expect(drainQueue(queue, true, 'sess-a')).toEqual({ next: null, rest: [], restore: ['first', 'second'] })
  })
})
