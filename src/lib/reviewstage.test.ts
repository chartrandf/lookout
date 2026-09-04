import { describe, expect, it } from 'vitest'
import type { GhReview } from './gh'
import { approvedByMe, deriveStage, type StageFacts } from './reviewstage'

const NOTHING: StageFacts = {
  hasSession: false,
  spoke: false,
  approvedByMe: false,
  followupRan: false,
  merged: false,
}

const review = (login: string, state: string, submittedAt = '2026-01-01T00:00:00Z'): GhReview => ({
  author: { login },
  state,
  submittedAt,
})

describe('deriveStage', () => {
  it('Watching: boarded, nothing done', () => expect(deriveStage('watching', NOTHING)).toBe('watching'))

  it('Needs Review: a session ran but nothing was sent', () =>
    expect(deriveStage('watching', { ...NOTHING, hasSession: true })).toBe('reviewing'))

  it('Reviewed: I sent a comment', () =>
    expect(deriveStage('reviewing', { ...NOTHING, hasSession: true, spoke: true })).toBe('reviewed'))

  it('Follow-up: a follow-up ran', () =>
    expect(deriveStage('reviewed', { ...NOTHING, hasSession: true, spoke: true, followupRan: true })).toBe('followup'))

  it('Done: I approved', () =>
    expect(deriveStage('followup', { ...NOTHING, spoke: true, followupRan: true, approvedByMe: true })).toBe('done'))

  it('Done: the PR merged', () => expect(deriveStage('watching', { ...NOTHING, merged: true })).toBe('done'))

  it('pulls a card back out of a column its facts do not support', () => {
    // a finished review session is not a sent review
    expect(deriveStage('reviewed', { ...NOTHING, hasSession: true })).toBe('reviewing')
    // no follow-up run behind a Follow-up placement
    expect(deriveStage('followup', { ...NOTHING, hasSession: true, spoke: true })).toBe('reviewed')
  })

  it('keeps a manual Needs Review placement when nothing has happened yet', () => {
    expect(deriveStage('needs_review', NOTHING)).toBe('needs_review')
    expect(deriveStage('needs_review', { ...NOTHING, spoke: true })).toBe('reviewed')
  })
})

describe('approvedByMe', () => {
  it('is true when my latest review approves', () =>
    expect(approvedByMe([review('me', 'COMMENTED', '2026-01-01'), review('me', 'APPROVED', '2026-01-02')], 'me')).toBe(
      true,
    ))

  it('is false when I commented after approving', () =>
    expect(approvedByMe([review('me', 'APPROVED', '2026-01-01'), review('me', 'COMMENTED', '2026-01-02')], 'me')).toBe(
      false,
    ))

  it("ignores everyone else's approvals", () => {
    expect(approvedByMe([review('bob', 'APPROVED')], 'me')).toBe(false)
    expect(approvedByMe([], 'me')).toBe(false)
  })
})
