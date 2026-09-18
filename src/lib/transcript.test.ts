import { describe, expect, it } from 'vitest'
import { exportedToFile, finalAssistantTurn, MAX_BODY, reviewFromLines } from './transcript'

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

describe('finalAssistantTurn', () => {
  it('joins the text blocks of the last turn and skips thinking and tool calls', () => {
    const turn = finalAssistantTurn([
      userPrompt('/do-review 123'),
      assistant([thinking('hmm'), text('## Review'), toolUse('Bash', { command: 'gh pr view' }), text('Looks good')]),
    ])
    expect(turn?.body).toBe('## Review\n\nLooks good')
  })

  it('stops at the previous human turn instead of swallowing older answers', () => {
    const turn = finalAssistantTurn([
      assistant([text('an older answer')]),
      userPrompt('now review it'),
      assistant([text('the review')]),
    ])
    expect(turn?.body).toBe('the review')
  })

  it('keeps walking across tool results — one turn spans its tool calls', () => {
    const turn = finalAssistantTurn([
      userPrompt('/do-review 123'),
      assistant([text('first I look')]),
      toolResult('diff output'),
      assistant([text('then the verdict')]),
    ])
    expect(turn?.body).toBe('first I look\n\nthen the verdict')
  })

  it('takes the timestamp of the newest assistant line', () => {
    const turn = finalAssistantTurn([
      assistant([text('early')], '2026-09-18T10:00:00.000Z'),
      assistant([text('late')], '2026-09-18T11:00:00.000Z'),
    ])
    expect(turn?.ts).toBe('2026-09-18T11:00:00.000Z')
  })

  it('returns null when the tail holds no assistant text', () => {
    expect(finalAssistantTurn([userPrompt('hi'), assistant([toolUse('Bash', { command: 'ls' })])])).toBeNull()
    expect(finalAssistantTurn([])).toBeNull()
  })

  it('ignores lines that are not JSON', () => {
    expect(finalAssistantTurn(['', 'not json', assistant([text('the review')])])?.body).toBe('the review')
  })
})

describe('exportedToFile', () => {
  it('spots a Write of a review report', () => {
    const lines = [assistant([toolUse('Write', { file_path: '/repo/AI_TASKS/code-review/2026-09-18-10-00-br.md' })])]
    expect(exportedToFile(lines)).toBe(true)
  })

  it('spots a report written from a shell heredoc', () => {
    const lines = [assistant([toolUse('Bash', { command: "cat > AI_TASKS/code-review/x.md <<'EOF'" })])]
    expect(exportedToFile(lines)).toBe(true)
  })

  it('ignores writes anywhere else', () => {
    expect(exportedToFile([assistant([toolUse('Write', { file_path: '/repo/src/lib/db.ts' })])])).toBe(false)
  })
})

describe('reviewFromLines', () => {
  it('captures the final turn', () => {
    expect(reviewFromLines([userPrompt('/do-review 123'), assistant([text(REVIEW)])])).toEqual({
      kind: 'captured',
      body: REVIEW,
      ts: '2026-09-18T10:00:00.000Z',
    })
  })

  it('reports a session that exported its own report instead of capturing it', () => {
    const lines = [
      userPrompt('/do-review 123'),
      assistant([toolUse('Write', { file_path: 'AI_TASKS/code-review/2026-09-18-10-00-br.md' }), text(REVIEW)]),
    ]
    expect(reviewFromLines(lines)).toEqual({ kind: 'exported' })
  })

  it('skips a final turn too short to be a review', () => {
    expect(reviewFromLines([userPrompt('/do-review 123'), assistant([text('done ✅')])])).toEqual({ kind: 'none' })
  })

  it('truncates a runaway body', () => {
    const result = reviewFromLines([userPrompt('/x'), assistant([text('x'.repeat(MAX_BODY + 5000))])])
    if (result.kind !== 'captured') throw new Error('expected a capture')
    expect(result.body.length).toBeLessThanOrEqual(MAX_BODY + 64)
    expect(result.body).toMatch(/truncated/)
  })
})

describe('parser hardening', () => {
  it('does not glue separate answers together when the tail holds no human turn', () => {
    const big = 'y'.repeat(MAX_BODY)
    const turn = finalAssistantTurn([assistant([text(big)]), assistant([text(big)]), assistant([text(big)])])
    expect(turn?.body.length).toBeLessThan(MAX_BODY * 3)
  })

  it('reads a shell redirect into the report dir as an export', () => {
    expect(exportedToFile([assistant([toolUse('Bash', { command: 'cat > AI_TASKS/code-review/x.md' })])])).toBe(true)
  })

  it('does not read a search that merely mentions the report dir as an export', () => {
    const lines = [assistant([toolUse('Bash', { command: 'rg TODO AI_TASKS/code-review > /dev/null' })])]
    expect(exportedToFile(lines)).toBe(false)
  })

  it('never truncates in the middle of a surrogate pair', () => {
    const result = reviewFromLines([userPrompt('/x'), assistant([text('😀'.repeat(MAX_BODY))])])
    if (result.kind !== 'captured') throw new Error('expected a capture')
    expect(result.body).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })
})
