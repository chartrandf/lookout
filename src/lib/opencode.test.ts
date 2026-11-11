import { describe, expect, it } from 'vitest'
import { opencodeCapture, opencodeToolName, opencodeTranscriptLines } from './opencode'

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

describe('opencodeCapture', () => {
  // a review is at least MIN_BODY (200) of text; everything here is made up
  const line = 'The diff reads clean, the tests cover the renamed prop and the docs say so.'
  const verdict = `Verdict: approve. ${Array(4).fill(line).join(' ')}`

  it('captures the last assistant turn, tools and reasoning left out', () => {
    const exported = {
      messages: [
        { type: 'user', text: '"Review PR 4"' },
        { type: 'assistant', content: [{ type: 'tool', name: 'read', state: { input: { path: '/repo/src/x.ts' } } }] },
        { type: 'assistant', content: [{ type: 'text', text: verdict }] },
      ],
    }
    expect(opencodeCapture(exported)).toEqual({ kind: 'captured', body: verdict, ts: null })
  })

  it('stops at the prompt, so a short closing turn reads as nothing', () => {
    const exported = {
      messages: [
        { type: 'assistant', content: [{ type: 'text', text: verdict }] },
        { type: 'user', text: '"thanks"' },
        { type: 'assistant', content: [{ type: 'text', text: 'done' }] },
      ],
    }
    expect(opencodeCapture(exported)).toEqual({ kind: 'none' })
  })

  it('glues the text blocks of one turn together', () => {
    const exported = {
      messages: [
        {
          type: 'assistant',
          content: [{ type: 'text', text: 'Verdict: approve.' }, { type: 'text', text: verdict }],
        },
      ],
    }
    expect(opencodeCapture(exported)).toEqual({ kind: 'captured', body: `Verdict: approve.\n\n${verdict}`, ts: null })
  })

  it('reads a short answer as nothing to capture', () => {
    expect(
      opencodeCapture({ messages: [{ type: 'assistant', content: [{ type: 'text', text: 'done' }] }] }),
    ).toEqual({ kind: 'none' })
  })

  it('reads a report the session wrote itself as exported', () => {
    const exported = {
      messages: [
        {
          type: 'assistant',
          content: [{ type: 'tool', name: 'write', state: { input: { path: 'AI_TASKS/code-review/pr-4.md' } } }],
        },
        { type: 'assistant', content: [{ type: 'text', text: verdict }] },
      ],
    }
    expect(opencodeCapture(exported)).toEqual({ kind: 'exported' })
  })

  it('reads a heredoc write as exported too', () => {
    const exported = {
      messages: [
        {
          type: 'assistant',
          content: [
            { type: 'tool', name: 'shell', state: { input: { command: 'cat > AI_TASKS/code-review/pr-4.md <<EOF' } } },
          ],
        },
        { type: 'assistant', content: [{ type: 'text', text: verdict }] },
      ],
    }
    expect(opencodeCapture(exported)).toEqual({ kind: 'exported' })
  })

  it('reads anything that is not an exported session as nothing', () => {
    expect(opencodeCapture(null)).toEqual({ kind: 'none' })
    expect(opencodeCapture({})).toEqual({ kind: 'none' })
  })
})
