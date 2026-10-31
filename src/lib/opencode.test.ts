import { describe, expect, it } from 'vitest'
import { opencodeToolName, opencodeTranscriptLines } from './opencode'

// A slice of what `opencode session export <id>` prints: the user turn, an assistant turn with a
// reasoning part, two tool parts and text, then its closing turn. Field shapes come from a real
// export; the ids, paths and text below are made up for the test.
const exported = {
  info: { id: 'ses_1', location: { directory: '/repo' } },
  messages: [
    { id: 'm1', type: 'user', text: '"Fetch the review comments of PR #4"', files: [] },
    {
      id: 'm2',
      type: 'assistant',
      content: [
        { type: 'reasoning', text: 'Let me look.' },
        { type: 'tool', name: 'read', state: { status: 'completed', input: { path: '/repo/package.json' } } },
        { type: 'tool', name: 'shell', state: { status: 'completed', input: { command: 'gh pr view 4' } } },
        { type: 'text', text: 'Fetching.' },
      ],
    },
    { id: 'm3', type: 'assistant', content: [{ type: 'text', text: 'SUMMARY: 0 addressed | 0 partial | 1 pending' }] },
    { id: 'm4', type: 'idle' },
  ],
}

describe('opencodeTranscriptLines', () => {
  it('replays prompts, text and tool calls like a Claude transcript', () => {
    expect(opencodeTranscriptLines(exported)).toEqual([
      { kind: 'user', text: 'Fetch the review comments of PR #4' },
      { kind: 'tool', text: 'Read /repo/package.json' },
      { kind: 'tool', text: 'Bash gh pr view 4' },
      { kind: 'text', text: 'Fetching.' },
      { kind: 'text', text: 'SUMMARY: 0 addressed | 0 partial | 1 pending' },
    ])
  })

  it('undoes the quotes opencode run wraps a message in, and nothing else', () => {
    const user = (text: string) => ({ type: 'user', text })
    expect(opencodeTranscriptLines({ messages: [user('"say \\"hi\\""')] })).toEqual([
      { kind: 'user', text: 'say "hi"' },
    ])
    expect(opencodeTranscriptLines({ messages: [user('"12"')] })).toEqual([{ kind: 'user', text: '12' }])
    expect(opencodeTranscriptLines({ messages: [user('no quotes')] })).toEqual([{ kind: 'user', text: 'no quotes' }])
    expect(opencodeTranscriptLines({ messages: [user('"unterminated')] })).toEqual([
      { kind: 'user', text: '"unterminated' },
    ])
  })

  it('reads anything that is not an exported session as no lines', () => {
    expect(opencodeTranscriptLines(null)).toEqual([])
    expect(opencodeTranscriptLines({})).toEqual([])
    expect(opencodeTranscriptLines({ messages: 'nope' })).toEqual([])
    expect(opencodeTranscriptLines({ messages: [{ type: 'assistant' }, { type: 'user', text: '  ' }] })).toEqual([])
  })
})

describe('opencodeToolName', () => {
  it('maps opencode tool ids to the names Claude prints', () => {
    expect(opencodeToolName('shell')).toBe('Bash')
    expect(opencodeToolName('read')).toBe('Read')
    expect(opencodeToolName('list')).toBe('LS')
    expect(opencodeToolName('unknown-tool')).toBe('Unknown-tool')
    expect(opencodeToolName('')).toBe('')
  })
})
