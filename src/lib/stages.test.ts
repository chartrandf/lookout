import { describe, expect, it } from 'vitest'
import { advanceStage, canApproveFrom } from './stages'

describe('advanceStage', () => {
  it('moves a card forward', () => {
    expect(advanceStage('discovered', 'reviewing')).toBe('reviewing')
    expect(advanceStage('reviewing', 'reviewed')).toBe('reviewed')
    expect(advanceStage('reviewed', 'followup')).toBe('followup')
  })

  it('keeps a follow-up card in follow-up when a review re-runs', () => {
    expect(advanceStage('followup', 'reviewed')).toBe('followup')
    expect(advanceStage('followup', 'reviewing')).toBe('followup')
  })

  it('never pulls a done card back', () => {
    expect(advanceStage('done', 'reviewed')).toBe('done')
    expect(advanceStage('done', 'followup')).toBe('done')
  })

  it('is a no-op for the same stage', () => expect(advanceStage('reviewed', 'reviewed')).toBe('reviewed'))
})

describe('canApproveFrom', () => {
  it('allows reviewed, follow-up and done', () => {
    expect(canApproveFrom('reviewed')).toBe(true)
    expect(canApproveFrom('followup')).toBe(true)
    expect(canApproveFrom('done')).toBe(true)
  })

  it('rejects stages where I have not reviewed yet', () => {
    expect(canApproveFrom('discovered')).toBe(false)
    expect(canApproveFrom('watching')).toBe(false)
    expect(canApproveFrom('inbox')).toBe(false)
    expect(canApproveFrom('reviewing')).toBe(false)
  })
})
