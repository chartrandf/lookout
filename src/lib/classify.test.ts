import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { create: vi.fn(() => ({ execute })) },
}))
vi.mock('./log', () => ({ errText: String, logWarn: vi.fn() }))

import { Command } from '@tauri-apps/plugin-shell'
import { classifySession, parseVerdict } from './classify'

describe('parseVerdict', () => {
  it('reads the one-word answer', () => {
    expect(parseVerdict('review')).toBe('review')
    expect(parseVerdict('  FOLLOWUP.\n')).toBe('followup')
    expect(parseVerdict('none')).toBeNull()
  })

  it('treats anything else as not a review', () => {
    expect(parseVerdict('I think this is a review')).toBeNull()
    expect(parseVerdict('')).toBeNull()
  })
})

describe('classifySession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execute.mockResolvedValue({ code: 0, stdout: 'review\n', stderr: '' })
  })

  it('asks Haiku with no tools and no saved session', async () => {
    expect(await classifySession('a1', 'the body')).toBe('review')
    const args = vi.mocked(Command.create).mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['--model', 'haiku', '--tools', '', '--no-session-persistence']))
    expect(args[args.indexOf('-p') + 1]).toContain('the body')
  })

  it('asks once per session', async () => {
    await classifySession('a2', 'the body')
    await classifySession('a2', 'the body, grown')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('stores nothing when claude fails, and tries again next time', async () => {
    execute.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'boom' })
    expect(await classifySession('a3', 'the body')).toBeNull()
    expect(await classifySession('a3', 'the body')).toBe('review')
  })
})
