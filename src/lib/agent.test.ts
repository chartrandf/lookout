import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
// `opencode models` (setAgent starts it on opencode) answers on its own mock, out of the way of the call under test
const listing = vi.fn()
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { create: vi.fn((_: string, args: string[]) => ({ execute: args[0] === 'models' ? listing : execute })) },
}))

import { Command } from '@tauri-apps/plugin-shell'
import {
  askAgent,
  CLAUDE_ALIASES,
  DEFAULT_AGENT,
  defaultModel,
  listModels,
  modelFor,
  opencodeParser,
  opencodePermission,
  parseOpencodeModels,
  readAgent,
  resumeArgs,
  setAgent,
  tierLabel,
} from './agent'
import type { StreamEvent } from './claude'

const opencode = { cli: 'opencode' as const, fastModel: 'acme/small', strongModel: '', workModel: '' }
const LISTED = 'opencode/big-pickle\nopencode/deepseek-v4.1-flash-free\nacme/small\n'
const line = (o: object) => JSON.stringify({ sessionID: 'ses_1', ...o })

beforeEach(() => {
  vi.mocked(Command.create).mockClear()
  execute.mockReset()
  listing.mockReset().mockResolvedValue({ code: 0, stdout: LISTED, stderr: '' })
  setAgent(DEFAULT_AGENT)
})

describe('readAgent', () => {
  it('falls back to claude with no models on anything off-shape', () => {
    expect(readAgent(undefined)).toEqual(DEFAULT_AGENT)
    expect(readAgent({ cli: 'codex', fastModel: 3 })).toEqual(DEFAULT_AGENT)
  })

  it('keeps opencode and trims the models', () => {
    expect(readAgent({ cli: 'opencode', fastModel: ' a/b ', strongModel: 'c/d', workModel: 'e/f' })).toEqual({
      cli: 'opencode',
      fastModel: 'a/b',
      strongModel: 'c/d',
      workModel: 'e/f',
    })
  })
})

describe('modelFor', () => {
  it("uses Haiku and Sonnet on Claude, and Claude's own model for work, unless a model is set", () => {
    expect(modelFor('fast')).toBe('haiku')
    expect(modelFor('strong')).toBe('sonnet')
    expect(modelFor('work')).toBeNull()
    expect(modelFor('fast', { ...DEFAULT_AGENT, fastModel: 'opus' })).toBe('opus')
    expect(modelFor('default')).toBeNull()
  })

  it('picks the first opencode default the CLI still lists, else its configured model', () => {
    expect(defaultModel('fast', 'opencode', ['opencode/deepseek-v4.1-flash-free'])).toBe(
      'opencode/deepseek-v4.1-flash-free',
    )
    expect(
      defaultModel('fast', 'opencode', ['opencode/mimo-v2.6-flash-free', 'opencode/deepseek-v4.1-flash-free']),
    ).toBe('opencode/mimo-v2.6-flash-free')
    expect(defaultModel('work', 'opencode', ['acme/small'])).toBeNull()
    expect(defaultModel('strong', 'opencode', null)).toBeNull()
  })

  it('runs big-pickle once opencode has listed it', async () => {
    setAgent(opencode)
    await listModels('opencode')
    expect(modelFor('fast')).toBe('acme/small') // picked
    expect(modelFor('strong')).toBe('opencode/big-pickle')
    expect(modelFor('work')).toBe('opencode/big-pickle')
  })

  it('labels the tiers', () => {
    expect(tierLabel('fast')).toBe('haiku')
    expect(tierLabel('work')).toBe("Claude Code's default")
    expect(tierLabel('fast', opencode)).toBe('acme/small')
  })
})

describe('opencodePermission', () => {
  it('denies everything but the allowed tools, denies after allows', () => {
    expect(
      opencodePermission('Read,Grep,Bash(git:*),Bash(gh pr view:*),mcp__sentry__*,Unknown', 'Edit,Bash(git push:*)'),
    ).toEqual({
      '*': 'deny',
      read: 'allow',
      grep: 'allow',
      'sentry_*': 'allow',
      edit: 'deny',
      bash: { '*': 'deny', 'git *': 'allow', 'gh pr view *': 'allow', 'git push *': 'deny' },
    })
  })

  it('denies all tools when none are allowed', () => {
    expect(opencodePermission('')).toEqual({ '*': 'deny' })
  })
})

describe('opencodeParser', () => {
  it('maps opencode events to stream events, the last step text as the result', () => {
    const events: StreamEvent[] = []
    const parse = opencodeParser((e) => events.push(e))
    parse(line({ type: 'step_start', part: {} }))
    parse(line({ type: 'text', part: { text: 'Looking' } }))
    parse(line({ type: 'tool_use', part: { tool: 'bash', state: { title: 'gh pr view 3', input: {} } } }))
    parse(line({ type: 'step_finish', part: { reason: 'tool-calls' } }))
    parse('not json')
    parse(line({ type: 'step_start', part: {} }))
    parse(line({ type: 'text', part: { text: 'Done.' } }))
    parse(line({ type: 'step_finish', part: { reason: 'stop' } }))
    expect(events).toEqual([
      { type: 'init', sessionId: 'ses_1' },
      { type: 'text', text: 'Looking' },
      { type: 'tool', name: 'bash', detail: 'gh pr view 3' },
      { type: 'text', text: 'Done.' },
      { type: 'result', text: 'Done.', isError: false },
    ])
  })

  it('reports an API error as an error result', () => {
    const events: StreamEvent[] = []
    opencodeParser((e) => events.push(e))(
      line({ type: 'error', error: { name: 'APIError', data: { message: 'quota' } } }),
    )
    expect(events.at(-1)).toEqual({ type: 'result', text: 'quota', isError: true })
  })
})

describe('askAgent', () => {
  it('asks claude with no tools and no saved session', async () => {
    execute.mockResolvedValue({ code: 0, stdout: 'review', stderr: '' })
    expect(await askAgent('what was it?')).toEqual({ code: 0, stdout: 'review', stderr: '' })
    expect(Command.create).toHaveBeenCalledWith(
      'claude',
      ['-p', 'what was it?', '--model', 'haiku', '--tools', '', '--no-session-persistence'],
      undefined,
    )
  })

  it('passes a tool allowlist and a cwd through', async () => {
    execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await askAgent('check', { tier: 'default', allowedTools: 'Read', disallowedTools: 'Edit', cwd: '/home' })
    expect(Command.create).toHaveBeenCalledWith(
      'claude',
      ['-p', 'check', '--allowedTools', 'Read', '--disallowedTools', 'Edit', '--no-session-persistence'],
      { cwd: '/home' },
    )
  })

  it('runs opencode read-only when no tools are asked for, and returns the final answer', async () => {
    setAgent(opencode)
    execute.mockResolvedValue({
      code: 0,
      stdout: [
        line({ type: 'step_start', part: {} }),
        line({ type: 'text', part: { text: 'followup' } }),
        line({ type: 'step_finish', part: { reason: 'stop' } }),
      ].join('\n'),
      stderr: '',
    })
    expect(await askAgent('what was it?')).toEqual({ code: 0, stdout: 'followup', stderr: '' })
    expect(Command.create).toHaveBeenCalledWith(
      'opencode',
      ['run', '--format', 'json', '--model', 'acme/small', 'what was it?'],
      { env: { OPENCODE_PERMISSION: '{"*":"deny","read":"allow"}' } },
    )
  })

  it('turns an opencode error event into a failed answer', async () => {
    setAgent(opencode)
    execute.mockResolvedValue({ code: 0, stdout: line({ type: 'error', error: { name: 'UnknownError' } }), stderr: '' })
    expect(await askAgent('x')).toEqual({ code: 1, stdout: '', stderr: 'UnknownError' })
  })
})

describe('resumeArgs', () => {
  it('resumes with the configured CLI', () => {
    expect(resumeArgs('s1')).toEqual(['claude', '--resume', 's1'])
    setAgent(opencode)
    expect(resumeArgs('ses_1')).toEqual(['opencode', '--session', 'ses_1'])
  })
})

describe('models', () => {
  it('offers the claude aliases without asking anything', async () => {
    expect(await listModels('claude')).toEqual(CLAUDE_ALIASES)
    expect(Command.create).not.toHaveBeenCalled()
  })

  it('keeps only provider/model lines from opencode', () => {
    expect(
      parseOpencodeModels('opencode/big-pickle\nWARN something\n\n google-vertex/claude-opus-5-5@default \n'),
    ).toEqual(['opencode/big-pickle', 'google-vertex/claude-opus-5-5@default'])
  })

  it('asks opencode again after a failed listing, then keeps the answer', async () => {
    vi.resetModules() // a fresh module: no listing cached by the tests above
    const fresh = await import('./agent')
    listing.mockReset()
    listing.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'not found' })
    expect(await fresh.listModels('opencode')).toEqual([])
    listing.mockResolvedValueOnce({ code: 0, stdout: 'a/b\n', stderr: '' })
    expect(await fresh.listModels('opencode')).toEqual(['a/b'])
    expect(await fresh.listModels('opencode')).toEqual(['a/b'])
    expect(listing).toHaveBeenCalledTimes(2)
    expect(Command.create).toHaveBeenCalledWith('opencode', ['models'])
  })
})
