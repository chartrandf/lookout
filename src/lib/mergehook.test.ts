import { describe, expect, it } from 'vitest'
import { DEFAULT_MERGE_HOOK, MERGE_HOOK_STATUS_ASK, mergeHookOutcome, mergeHookText, readMergeHook } from './mergehook'

describe('readMergeHook', () => {
  it('falls back to an off, empty hook when nothing is stored', () => {
    expect(readMergeHook(undefined)).toEqual(DEFAULT_MERGE_HOOK)
    expect(readMergeHook(null)).toEqual(DEFAULT_MERGE_HOOK)
    expect(DEFAULT_MERGE_HOOK.enabled).toBe(false)
  })

  it('keeps a stored hook as is', () => {
    const h = { enabled: true, prompt: '/clean-worktrees' }
    expect(readMergeHook(h)).toEqual(h)
  })

  it('repairs a hand-edited hook field by field', () => {
    expect(readMergeHook({ enabled: 'yes', prompt: 3 })).toEqual(DEFAULT_MERGE_HOOK)
    expect(readMergeHook({ prompt: '/cleanup' })).toEqual({ enabled: false, prompt: '/cleanup' })
  })
})

describe('mergeHookText', () => {
  it('fills the placeholders of an enabled hook', () => {
    expect(mergeHookText({ enabled: true, prompt: '/clean <branch_name> #<pr_id>' }, 'feat-x', 7)).toBe(
      '/clean feat-x #7',
    )
  })

  it('is null when the hook is off or has nothing to send', () => {
    expect(mergeHookText({ enabled: false, prompt: '/clean' }, 'b', 1)).toBeNull()
    expect(mergeHookText({ enabled: true, prompt: '   ' }, 'b', 1)).toBeNull()
  })
})

describe('mergeHookOutcome', () => {
  it('asks for the status line it reads', () => {
    for (const s of ['ok', 'attention', 'failed']) expect(MERGE_HOOK_STATUS_ASK).toContain(`LOOKOUT: ${s}`)
  })

  it('reads the status the session ended with', () => {
    expect(mergeHookOutcome('Card moved.\nLOOKOUT: ok', false)).toBe('ok')
    expect(mergeHookOutcome('PR #2 still open.\n\nLOOKOUT: attention', false)).toBe('attention')
    expect(mergeHookOutcome('Notion down.\n`LOOKOUT: failed`', false)).toBe('failed')
  })

  it('takes the last status when the reply names several', () => {
    expect(mergeHookOutcome('I will end with LOOKOUT: ok\n...\nLOOKOUT: attention', false)).toBe('attention')
  })

  it('fails an errored session whatever it said', () => {
    expect(mergeHookOutcome('LOOKOUT: ok', true)).toBe('failed')
  })

  it('needs a look when the session gave no status', () => {
    expect(mergeHookOutcome('Done.', false)).toBe('attention')
  })
})
